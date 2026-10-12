import { beforeAll, describe, expect, it } from 'vitest';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { ProjektDaten } from '../model/types';
import {
  absaetze,
  absatzIndex,
  ankerErzeugen,
  ankerFinden,
  bloecke,
  editierdistanz,
  findeZitat,
  klartext,
  normalisiere,
  textHash,
  wortzahl,
  zitatKern,
  zitatSchluessel,
} from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemo();
});
const kt = (id: string) => klartext(daten.kapitel[id]!.text);

describe('Klartext', () => {
  it('entfernt Auszeichnung, behält Absätze, Szenentrenner und harte Umbrüche', () => {
    const md = '# Kapitel **eins**\n\nEr sagt *leise* und __laut__ hallo.\nweiter  \nneue Zeile\\\nnoch eine\n\n* * *\n\n\n\nEnde_gut snake_case.';
    expect(absaetze(md).map((a) => a.text)).toEqual([
      'Kapitel eins',
      'Er sagt leise und laut hallo. weiter\nneue Zeile\nnoch eine',
      '* * *',
      'Ende_gut snake_case.',
    ]);
    expect(klartext(md)).toBe(absaetze(md).map((a) => a.text).join('\n\n'));
  });

  it('Offsets der Absätze stimmen mit dem Klartext überein', () => {
    const md = 'Erster.\n\n## Zwei\n\n***\n\nDritter *Absatz*.';
    const k = klartext(md);
    for (const a of absaetze(md)) expect(k.slice(a.start, a.ende)).toBe(a.text);
    expect(absatzIndex(absaetze(md), k.indexOf('Dritter'))).toBe(3);
    expect(absatzIndex(absaetze(md), 0)).toBe(0);
  });

  it('leere Absätze und leere Überschriften entfallen, Blöcke behalten sie', () => {
    const md = 'Text.\n\n#\n\n##   \n\nMehr.';
    expect(absaetze(md).map((a) => a.text)).toEqual(['Text.', 'Mehr.']);
    expect(bloecke(md).filter((b) => b.art === 'ueberschrift').map((b) => b.text.trim())).toEqual(['', '']);
  });

  it('Escapes werden aufgelöst; Listen, Zitate, Code, Links, Entities bleiben wörtlicher Text', () => {
    expect(klartext('Ein \\*Stern\\* &amp; mehr')).toBe('Ein *Stern* &amp; mehr');
    expect(klartext('- Hallo, sagt er.\n\n> Zitat\n\n1. Mal `x` [a](b) <http://a.b>')).toBe(
      '- Hallo, sagt er.\n\n> Zitat\n\n1. Mal `x` [a](b) <http://a.b>',
    );
    expect(klartext('    eingerückt')).toBe('eingerückt');
  });

  it('Setext-Überschrift und Szenentrenner-Varianten', () => {
    expect(absaetze('Titel\n===\n\nText\n\n---\n\n_ _ _').map((a) => a.text)).toEqual(['Titel', 'Text', '* * *', '* * *']);
    expect(bloecke('Titel\n---').map((b) => b.art)).toEqual(['ueberschrift']);
  });

  it('Demo: flut hat vier Absätze im Klartext', () => {
    expect(absaetze(daten.kapitel['flut']!.text)).toHaveLength(4);
    expect(kt('flut').startsWith('Ich steige aus')).toBe(true);
  });
});

describe('Normalisierung (E6)', () => {
  it('vereinheitlicht Anführungszeichen, Striche, Auslassungspunkte, Leerraum, entfernt * und _', () => {
    expect(normalisiere('„Hallo“ – sagt ‚er‘ … *ja*  \n\n _nein_').text).toBe('"Hallo" - sagt "er" … ja nein');
    expect(normalisiere('»Gut« -- ok...').text).toBe('"Gut" - ok…');
    expect(normalisiere('geht’s').text).toBe(normalisiere("geht's").text);
  });

  it('Unicode NFC', () => {
    const zerlegt = 'Büro';
    expect(normalisiere(zerlegt).text).toBe('Büro');
    expect(normalisiere(zerlegt).zuOriginal).toEqual([0, 1, 3, 4, 5]);
  });

  it('zuOriginal hat Länge text.length + 1 und ist monoton', () => {
    const s = '„A“  –  B...  C';
    const n = normalisiere(s);
    expect(n.zuOriginal).toHaveLength(n.text.length + 1);
    expect(n.zuOriginal[n.text.length]).toBe(s.length);
    for (let i = 1; i < n.zuOriginal.length; i++) expect(n.zuOriginal[i]!).toBeGreaterThanOrEqual(n.zuOriginal[i - 1]!);
  });
});

describe('findeZitat', () => {
  it('findet Zitate trotz anderer Anführungszeichen, Offsets im Klartext', () => {
    const k = kt('flut');
    const treffer = findeZitat(k, '„Nur eine halbe Stunde, Papa, ich rudere auch ganz allein“');
    expect(treffer).toHaveLength(1);
    expect(k.slice(treffer[0]!.start, treffer[0]!.ende)).toBe('Nur eine halbe Stunde, Papa, ich rudere auch ganz allein');
    expect(findeZitat(k, "wenn’s wackelt, nehme ich die Ruder")).toHaveLength(1);
    expect(findeZitat(k, 'Wasser - "Eine halbe Stunde')).toHaveLength(1);
  });

  it('alle Vorkommen; leeres Zitat ergibt nichts; fremder Text ergibt nichts', () => {
    const k = kt('grundriss');
    expect(findeZitat(k, 'Ole').length).toBe(3); // Ole, Oleander, Ole (Teilstring-Suche)
    expect(findeZitat(k, '  ')).toEqual([]);
    expect(findeZitat(k, 'Dieser Satz steht nirgends')).toEqual([]);
  });

  it('Auslassungspunkte am Rand und ... = …', () => {
    const k = 'Er wartet… dann geht er. Wieso...';
    expect(findeZitat(k, '… dann geht er')).toHaveLength(1);
    expect(findeZitat(k, 'Wieso…')).toHaveLength(1);
    expect(findeZitat(k, 'Er wartet... dann')).toHaveLength(1);
  });

  it('Zitate über Absatzgrenzen und Markdown-Auszeichnung', () => {
    const md = 'Er geht **schnell**.\n\nDann bleibt er stehen.';
    const k = klartext(md);
    const t = findeZitat(k, 'schnell. Dann bleibt');
    expect(t).toHaveLength(1);
    expect(k.slice(t[0]!.start, t[0]!.ende)).toBe('schnell.\n\nDann bleibt');
  });

  it('zitatKern und zitatSchluessel', () => {
    expect(zitatKern(' „… nach einem freien Tisch suche“ ')).toBe('nach einem freien Tisch suche');
    const a = zitatSchluessel('pruefen', [
      { kapitel: 'b', text: '„Hallo“' },
      { kapitel: 'a', text: 'x  y' },
    ]);
    const b = zitatSchluessel('pruefen', [
      { kapitel: 'a', text: 'x y' },
      { kapitel: 'b', text: '"Hallo"' },
    ]);
    expect(a).toBe(b);
    expect(a).toBe('pruefen:a/x y|b/Hallo');
  });
});

describe('Textanker (E4)', () => {
  const md = 'Paul trinkt Kaffee. Lotte trinkt Kaffee. Ole trinkt Tee und dann wieder Kaffee mit Milch.';

  it('Rundlauf: erzeugen und wiederfinden', () => {
    const k = klartext(md);
    const s = k.indexOf('Lotte trinkt Kaffee');
    const anker = ankerErzeugen('x', k, s, s + 'Lotte trinkt Kaffee'.length);
    expect(anker.exakt).toBe('Lotte trinkt Kaffee');
    expect(anker.davor).toBe('Paul trinkt Kaffee. ');
    expect(ankerFinden(k, anker)).toEqual({ start: s, ende: s + 19 });
  });

  it('mehrdeutiges Zitat wird über den Kontext eindeutig', () => {
    const k = klartext(md);
    const s = k.indexOf('Kaffee', k.indexOf('Lotte'));
    const anker = ankerErzeugen('x', k, s, s + 6);
    expect(anker.exakt).toBe('Kaffee');
    expect(ankerFinden(k, anker)).toEqual({ start: s, ende: s + 6 });
    const neu = `Vorweg ein Satz mit Kaffee. ${k}`;
    expect(ankerFinden(neu, anker)).toEqual({ start: s + 28, ende: s + 34 });
  });

  it('übersteht Änderungen außerhalb und innerhalb der Stelle (tolerant)', () => {
    const k = kt('flut');
    const s = k.indexOf('ein Vater mit seiner Tochter');
    const anker = ankerErzeugen('flut', k, s, s + 'ein Vater mit seiner Tochter'.length);
    const geaendert = k.replace('ein Vater mit seiner Tochter', 'ein Vater mit seiner kleinen Tochter');
    const b = ankerFinden(geaendert, anker);
    expect(b).not.toBeNull();
    expect(geaendert.slice(b!.start, b!.ende)).toBe('ein Vater mit seiner kleinen Tochter');
    const davorEingefuegt = `Neuer erster Absatz.\n\n${k}`;
    const c = ankerFinden(davorEingefuegt, anker)!;
    expect(davorEingefuegt.slice(c.start, c.ende)).toBe('ein Vater mit seiner Tochter');
  });

  it('verwaist, wenn die Stelle fehlt oder nicht eindeutig ist', () => {
    const k = 'Er sagt Hallo. Sie sagt Hallo.';
    expect(ankerFinden(k, { kapitel: 'x', exakt: 'Tschüss', davor: '', danach: '' })).toBeNull();
    expect(ankerFinden('a Hallo b a Hallo b', { kapitel: 'x', exakt: 'Hallo', davor: 'a ', danach: ' b' })).toBeNull();
    expect(ankerFinden('Komplett anderer Text ohne Bezug.', { kapitel: 'x', exakt: 'ein Vater mit seiner Tochter', davor: 'gegenüber verhandelt ', danach: ', sie ist vielleicht' })).toBeNull();
  });

  it('Demo-Anmerkungen werden gefunden', () => {
    for (const a of daten.anmerkungen) {
      const k = kt(a.anker.kapitel);
      const b = ankerFinden(k, a.anker);
      expect(b, a.id).not.toBeNull();
      expect(k.slice(b!.start, b!.ende)).toBe(a.anker.exakt);
    }
  });

  it('typografische Anker finden geraden Text (normalisiert)', () => {
    const k = '„Schön, dass du da bist" sage ich';
    const anker = { kapitel: 'x', exakt: '„Schön, dass du da bist“', davor: '', danach: ' sage' };
    expect(ankerFinden(k, anker)).toEqual({ start: 0, ende: 24 });
  });
});

describe('wortzahl', () => {
  it.each([
    ['Paul trinkt Kaffee.', 3],
    ['Ein Ruder-Boot und ein Ich-Erzähler.', 5],
    ['geht’s und probier\' es', 4],
    ['**Fett** und *kursiv* – fertig …', 4],
    ['Er zahlt 20.000 Euro, 3,5 Prozent, um 12:30 Uhr.', 9],
    ['# Überschrift\n\n* * *\n\nText', 2],
    ['', 0],
    ['Saab 900', 2],
  ])('%s → %i', (md, n) => {
    expect(wortzahl(md)).toBe(n);
  });

  it('Demo: Wortzahl von weissraum', () => {
    expect(wortzahl(daten.kapitel.weissraum!.text)).toBe(41);
  });
});

describe('textHash', () => {
  it('FNV-1a 64 Testvektoren', () => {
    expect(textHash('')).toBe('cbf29ce484222325');
    expect(textHash('a')).toBe('af63dc4c8601ec8c');
    expect(textHash('foobar')).toBe('85944171f73967e8');
  });

  it('stabil, Unicode über UTF-8, unterscheidet kleine Änderungen', () => {
    expect(textHash('Büro')).toBe(textHash('Büro'));
    expect(textHash('Büro')).not.toBe(textHash('Buro'));
    expect(textHash('a b')).not.toBe(textHash('a  b'));
    expect(textHash('x')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('editierdistanz', () => {
  it('Levenshtein mit Grenze', () => {
    expect(editierdistanz('Karl Hansen', 'Carl Hansen')).toBe(1);
    expect(editierdistanz('Kitten', 'Sitting')).toBe(3);
    expect(editierdistanz('abc', 'abc')).toBe(0);
    expect(editierdistanz('Kitten', 'Sitting', 1)).toBe(2);
  });
});
