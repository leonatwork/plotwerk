import { beforeAll, describe, expect, it } from 'vitest';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { Figur, Kapitel, Ort, ProjektDaten } from '../model/types';
import { findeZitat, klartext } from '../text';
import { erkenneInText, erkenneKapitel, erkennungsSignatur, motiveImText, schreibweisenHinweise, type ErkennungsDaten } from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemo();
});

const kap = (id: string): Kapitel => daten.kapitel[id]!;
const treffer = (id: string, ziel: string) => erkenneKapitel(kap(id), daten).filter((e) => e.ziel === ziel);

function figur(id: string, name: string, extra: Partial<Figur> = {}): Figur {
  return { id, name, aliase: [], rolle: 'neben', existenz: 'gesichert', gruppe: null, beziehungen: [], plan: {}, wahrheit: '', notizen: '', ...extra };
}
function ort(id: string, name: string, aliase: string[] = []): Ort {
  return { id, name, aliase, beschreibung: '', notizen: '' };
}
function erkDaten(figuren: Figur[], orte: Ort[] = [], schreibweisen: ErkennungsDaten['entscheidungen']['schreibweisen'] = []): ErkennungsDaten {
  return {
    figuren: Object.fromEntries(figuren.map((f) => [f.id, f])),
    orte: Object.fromEntries(orte.map((o) => [o.id, o])),
    entscheidungen: { version: 1, schreibweisen, hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] },
  };
}
const namen = (text: string, d: ErkennungsDaten) => erkenneInText(text, d).map((t) => `${t.ziel}:${t.treffer}`);

describe('erkenneKapitel (Demo)', () => {
  it('Ole, aber nicht Oleander', () => {
    const t = treffer('grundriss', 'ole');
    expect(t.map((e) => e.treffer)).toEqual(['Ole', 'Ole']);
    const k = klartext(kap('grundriss').text);
    expect(k.slice(k.indexOf('Oleander'), k.indexOf('Oleander') + 8)).toBe('Oleander');
    expect(t.every((e) => k.slice(e.start, e.ende) === 'Ole')).toBe(true);
  });

  it('Genitive Pauls und Lottes', () => {
    expect(treffer('lotte', 'paul').map((e) => e.treffer)).toEqual(['Pauls', 'Paul']);
    expect(treffer('lotte', 'lotte').map((e) => e.treffer)).toEqual(['Lotte', 'Lottes', 'Lotte']);
    expect(treffer('weissraum', 'paul').map((e) => e.treffer)).toEqual(['Pauls']);
  });

  it('Mehrwort-Namen, Artikel und Aliase', () => {
    expect(treffer('fassade', 'herr-kessler').map((e) => e.treffer)).toEqual(['Herr Kessler']);
    expect(treffer('bis-bald', 'die-fremde').map((e) => e.treffer)).toEqual(['Die Fremde']);
    expect(treffer('ebbe', 'alter-mann-am-kai').map((e) => e.treffer)).toEqual(['alter Mann']);
    expect(treffer('lotte', 'pauls-wohnung').map((e) => e.treffer)).toEqual(['Pauls Wohnung']);
  });

  it('Offsets im Klartext, Absatz-Index, Felder', () => {
    for (const id of daten.projekt.kapitel) {
      const k = daten.kapitel[id];
      if (!k) continue;
      const kt = klartext(k.text);
      const abs = kt.split('\n\n');
      for (const e of erkenneKapitel(k, daten)) {
        expect(kt.slice(e.start, e.ende)).toBe(e.treffer);
        expect(abs[e.absatz]).toContain(e.treffer);
        expect(e).toMatchObject({ kapitel: id, quelle: 'exakt', art: 'unbestimmt' });
      }
    }
    // ebbe hat zwei Szenentrenner „* * *“ (eigene Absätze im Klartext)
    expect(treffer('ebbe', 'vera').map((e) => e.absatz)).toEqual([0, 1, 6]);
  });

  it('Linden Hof und Linden-Hof erst nach der Entscheidung', () => {
    expect(treffer('lotte', 'lindenhof')).toHaveLength(2);
    expect(treffer('ebbe', 'lindenhof')).toHaveLength(0);
    expect(treffer('funkstille', 'lindenhof')).toHaveLength(0);
    const entschieden: ProjektDaten = {
      ...daten,
      entscheidungen: { ...daten.entscheidungen, schreibweisen: [{ varianten: ['Linden Hof'], gueltig: 'Lindenhof', ziel: { typ: 'ort', id: 'lindenhof' } }] },
    };
    expect(erkenneKapitel(kap('ebbe'), entschieden).filter((e) => e.ziel === 'lindenhof').map((e) => e.treffer)).toEqual(['Linden Hof']);
    expect(erkenneKapitel(kap('funkstille'), entschieden).filter((e) => e.ziel === 'lindenhof').map((e) => e.treffer)).toEqual(['Linden-Hof']);
  });

  it('leeres Kapitel ergibt nichts', () => {
    expect(erkenneKapitel({ id: 'leer', titel: 'Leer', text: '' }, daten)).toEqual([]);
  });
});

describe('Erkennung (Regeln)', () => {
  const d = erkDaten(
    [
      figur('lotte', 'Lotte'),
      figur('paul', 'Paul'),
      figur('hans', 'Hans'),
      figur('max', 'Max'),
      figur('fremde', 'Die Fremde'),
      figur('kessler', 'Herr Kessler'),
      figur('dame', 'Alte Dame', { aliase: ['alte Dame'] }),
      figur('paul-henrik', 'Paul Henrik'),
    ],
    [ort('buero', 'Büro'), ort('kueche', 'Teeküche')],
  );

  it.each([
    ['Lotterie und Lotte', ['lotte:Lotte']],
    ['Lottes Tasche, Pauls Auto, Paul’s Bar', ['lotte:Lottes', 'paul:Pauls', 'paul:Paul’s']],
    ["Hans’ Hut und Max' Rad, Hansi", ['hans:Hans’', "max:Max'"]],
    ['Er sieht Paul.', ['paul:Paul']],
    ['„Paul“, sagt sie', ['paul:Paul']],
    ['neben der Fremden liegt die Fremde, den Fremden', ['fremde:der Fremden', 'fremde:die Fremde', 'fremde:den Fremden']],
    ['mit Herrn Kessler und Herr Kessler', ['kessler:Herrn Kessler', 'kessler:Herr Kessler']],
    ['Eine alte Dame, der alten Dame. Alte Dame!', ['dame:alte Dame', 'dame:alten Dame', 'dame:Alte Dame']],
    ['Im Büro, in der Teeküche, Bürokram', ['buero:Büro', 'kueche:Teeküche']],
    ['Paul Henrik kommt', ['paul-henrik:Paul Henrik']],
    ['Ole-Witz über Paul-Henrik', ['paul:Paul']],
    ['Büro', ['buero:Büro']],
  ])('%s', (text, erwartet) => {
    expect(namen(text, d)).toEqual(erwartet);
  });
});

describe('schreibweisenHinweise', () => {
  it('Lindenhof / Linden Hof / Linden-Hof mit wörtlichen Zitaten', () => {
    const h = schreibweisenHinweise(daten).find((x) => x.titel.includes('Linden'));
    expect(h).toBeDefined();
    expect(h!.typ).toBe('schreibweise');
    expect(h!.quelle).toBe('lokal');
    expect(h!.zitate).toEqual([
      { kapitel: 'lotte', text: 'Lindenhof' },
      { kapitel: 'ebbe', text: 'Linden Hof' },
      { kapitel: 'funkstille', text: 'Linden-Hof' },
    ]);
    expect(h!.erklaerung).toContain('Kap. 3');
    expect(h!.erklaerung).toContain('Kap. 10');
  });

  it('Karl Hansen / Carl Hansen (Editierdistanz 1)', () => {
    const h = schreibweisenHinweise(daten).find((x) => x.titel.includes('Hansen'));
    expect(h).toBeDefined();
    expect(h!.zitate).toEqual([
      { kapitel: 'fassade', text: 'Karl Hansen' },
      { kapitel: 'weissraum', text: 'Carl Hansen' },
    ]);
  });

  it('meldet nur diese beiden im Demo-Projekt, alle Zitate stehen im Text', () => {
    const alle = schreibweisenHinweise(daten);
    expect(alle).toHaveLength(2);
    for (const h of alle)
      for (const z of h.zitate) expect(findeZitat(klartext(daten.kapitel[z.kapitel]!.text), z.text).length, z.text).toBeGreaterThan(0);
  });

  it('bereits entschiedene Schreibweisen werden nicht gemeldet', () => {
    const entschieden: ProjektDaten = {
      ...daten,
      entscheidungen: {
        ...daten.entscheidungen,
        schreibweisen: [
          { varianten: ['Lindenhof', 'Linden Hof', 'Linden-Hof'], gueltig: 'Lindenhof', ziel: { typ: 'ort', id: 'lindenhof' } },
          { varianten: ['Karl Hansen', 'Carl Hansen'], gueltig: 'Carl Hansen' },
        ],
      },
    };
    expect(schreibweisenHinweise(entschieden)).toEqual([]);
  });

  it('einzige abweichende Schreibweise eines angelegten Namens und unbekannte Varianten', () => {
    const d: ProjektDaten = {
      ...daten,
      projekt: { ...daten.projekt, kapitel: ['a', 'b'] },
      kapitel: {
        a: { id: 'a', titel: 'A', text: 'Er geht in den Korn-Speicher. Dort trinkt er ein Schwip Schwap.' },
        b: { id: 'b', titel: 'B', text: 'Am Abend gibt es Schwip-Schwap. Konradt kommt vorbei, mit Konrads Jacke.' },
      },
    };
    const h = schreibweisenHinweise(d);
    expect(h.map((x) => x.titel)).toEqual(['»Korn-Speicher« statt »Kornspeicher«', '»Schwip Schwap« oder »Schwip-Schwap«', '»Konradt« oder »Konrad«?']);
    expect(h[2]!.zitate).toEqual([{ kapitel: 'b', text: 'Konradt' }]);
  });
});

describe('motiveImText (S-10)', () => {
  it('Demo: Bleistifte in Kap. 2 und 9, Postkarten in Kap. 8 und 10', () => {
    const motive = daten.motive!;
    expect(motive.map((m) => m.id)).toEqual(['bleistifte', 'postkarten']);
    const zaehle = (id: string) => motiveImText(klartext(kap(id).text), motive).map((t) => `${t.motiv}:${t.treffer}`);
    expect(zaehle('fassade')).toContain('bleistifte:Bleistift');
    expect(zaehle('flut')).toContain('bleistifte:Bleistifte');
    expect(zaehle('bis-bald').filter((t) => t.startsWith('postkarten:'))).toHaveLength(2);
    expect(zaehle('funkstille')).toContain('postkarten:Postkarte');
    expect(zaehle('grundriss')).toEqual([]);
  });

  it('Wortgrenzen, Endungen, Offsets im Klartext', () => {
    const motive = [{ id: 'brief', name: 'Brief', aliase: [] }];
    const text = 'Ein Brief, zwei Briefe, der Briefkasten, Liebes-Brief und Steckbrief.';
    const t = motiveImText(text, motive);
    expect(t.map((x) => x.treffer)).toEqual(['Brief', 'Briefe', 'Brief']);
    for (const x of t) expect(text.slice(x.start, x.ende)).toBe(x.treffer);
    expect(motiveImText(text, [{ id: 'leer', name: ' ', aliase: [] }])).toEqual([]);
  });

  it('englische Endungen bei englischer Buchsprache', () => {
    const motive = [{ id: 'pencil', name: 'pencil', aliase: [] }];
    const text = 'A pencil, two pencils, the pencil’s tip, pencile, a penciller.';
    expect(motiveImText(text, motive, 'en').map((x) => x.treffer)).toEqual(['pencil', 'pencils', 'pencil’s']);
  });
});

describe('Erkennung (englische Buchsprache)', () => {
  const basis = erkDaten(
    [figur('lotte', 'Lotte'), figur('paul', 'Paul'), figur('james', 'James'), figur('miller', 'Miller'), figur('fremde', 'The Stranger')],
    [ort('pub', 'Red Lion')],
  );
  const en: ErkennungsDaten = { ...basis, projekt: { angaben: { sprache: 'en-GB' } } };

  it.each([
    ['Lotte’s bag and Lotte\'s coat, Annabell', ['lotte:Lotte’s', "lotte:Lotte's"]],
    ['James’ hat, James’s car and James\'s dog', ['james:James’', 'james:James’s', "james:James's"]],
    ['the Millers’ house', ['miller:Millers’']],
    ['Pauls car', []],
    ['“Come here, Paul”, she said. “Paul”', ['paul:Paul', 'paul:Paul']],
    ['“I saw James”', ['james:James']],
    ['The Stranger left; the Stranger came back', ['fremde:The Stranger', 'fremde:the Stranger']],
    ['At the Red Lion’s door', ['pub:Red Lion’s']],
  ])('%s', (text, erwartet) => {
    expect(namen(text, en)).toEqual(erwartet);
  });

  it('deutsche Regeln gelten für deutsche Bücher weiter (Genitiv ohne Apostroph)', () => {
    expect(namen('Pauls Auto', basis)).toEqual(['paul:Pauls']);
    expect(namen('Pauls Auto', { ...basis, projekt: { angaben: { sprache: 'de-AT' } } })).toEqual(['paul:Pauls']);
  });

  it('Buchsprache fließt in die Erkennungssignatur (deutsch unverändert)', () => {
    expect(erkennungsSignatur(en)).not.toBe(erkennungsSignatur(basis));
    expect(erkennungsSignatur({ ...basis, projekt: { angaben: { sprache: 'de' } } })).toBe(erkennungsSignatur(basis));
  });

  it('Schreibweisen: englische Funktionswörter am Satzanfang gehören nicht zum Namen', () => {
    const d: ProjektDaten = {
      ...daten,
      projekt: { ...daten.projekt, kapitel: ['a'], angaben: { sprache: 'en' } },
      kapitel: { a: { id: 'a', titel: 'A', text: 'Then Peter Parkerson came. When Peter Parkersen left, nobody cared.' } },
      figuren: {},
      orte: {},
      entscheidungen: { ...daten.entscheidungen, schreibweisen: [] },
    };
    const h = schreibweisenHinweise(d);
    expect(h).toHaveLength(1);
    expect(h[0]!.zitate.map((z) => z.text)).toEqual(['Peter Parkerson', 'Peter Parkersen']);
  });
});
