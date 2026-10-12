import { describe, expect, it } from 'vitest';
import { klartext } from '../text/index';
import {
  ausschnitt,
  haeufigeWoerter,
  naheWiederholungen,
  saetze,
  satzanfangFolgen,
  satzanfangStatistik,
  stamm,
  stellenVon,
  stilBericht,
  woerter,
} from './index';

describe('Wörter und Stammformen', () => {
  it('erkennt Wörter mit Umlauten, Bindestrich und Apostroph samt Offsets', () => {
    const t = 'Paul öffnet eine Schwip-Schwap bei McDonald’s.';
    const w = woerter(t);
    expect(w.map((x) => x.text)).toEqual(['Paul', 'öffnet', 'eine', 'Schwip-Schwap', 'bei', 'McDonald’s']);
    for (const x of w) expect(t.slice(x.start, x.ende)).toBe(x.text);
    expect(w.map((x) => x.nr)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('führt Beugungsformen auf eine Stammform zurück', () => {
    expect(stamm('sagte')).toBe(stamm('sagten'));
    expect(stamm('Tassen')).toBe(stamm('Tasse'));
    expect(stamm('Kaffees')).toBe(stamm('Kaffee'));
    expect(stamm('Haus')).toBe('haus');
    expect(stamm('Ole')).toBe('ole');
  });
});

describe('Sätze', () => {
  it('teilt an Satzzeichen und Absätzen, nicht nach Abkürzungen oder Ordinalzahlen', () => {
    const t = 'Er kam z. B. am 3. Mai. Dr. Kessler wartete!\n\nNeuer Absatz ohne Punkt\n\n* * *\n\n„Wie weit bist du?“, fragt Ole. Paul schweigt …';
    const s = saetze(t);
    expect(s.map((x) => x.text)).toEqual([
      'Er kam z. B. am 3. Mai.',
      'Dr. Kessler wartete!',
      'Neuer Absatz ohne Punkt',
      '„Wie weit bist du?“, fragt Ole.',
      'Paul schweigt …',
    ]);
    for (const x of s) expect(t.slice(x.start, x.ende)).toBe(x.text);
    expect(s[3]!.erstesWort?.text).toBe('Wie');
  });

  it('liefert für leeren Text nichts', () => {
    expect(saetze('')).toEqual([]);
    expect(saetze('* * *')).toEqual([]);
  });
});

describe('Wiederholungen', () => {
  const text = klartext(
    [
      'Paul trinkt Kaffee. Der Kaffee ist kalt, aber Paul trinkt den Kaffee trotzdem.',
      '',
      'Er geht ins Büro. Er setzt sich. Er schweigt. Ole kommt herein.',
      '',
      'Lange passiert nichts. Viel später steht wieder Kaffee auf dem Tisch.',
    ].join('\n'),
  );

  it('zählt häufige Wörter ohne Stoppwörter und ohne ignorierte Namen', () => {
    const h = haeufigeWoerter(text, { ignorieren: ['Paul', 'Ole'] });
    expect(h[0]).toMatchObject({ wort: 'Kaffee', anzahl: 4 });
    expect(h.find((x) => x.wort === 'trinkt')?.anzahl).toBe(2);
    expect(h.some((x) => ['der', 'aber', 'paul', 'er'].includes(x.wort.toLowerCase()))).toBe(false);
    for (const s of h[0]!.stellen) expect(text.slice(s.start, s.ende)).toBe('Kaffee');
  });

  it('findet dasselbe Wort in kurzer Distanz und trennt weit entfernte Vorkommen', () => {
    const nah = naheWiederholungen(text, { abstand: 10, ignorieren: ['Paul'] });
    const kaffee = nah.filter((n) => n.stamm === stamm('Kaffee'));
    expect(kaffee).toHaveLength(1);
    expect(kaffee[0]!.stellen).toHaveLength(3);
    expect(kaffee[0]!.abstand).toBeLessThanOrEqual(10);
    // mit großem Abstand gehört das letzte „Kaffee“ dazu
    const weit = naheWiederholungen(text, { abstand: 100 }).find((n) => n.stamm === stamm('Kaffee'));
    expect(weit?.stellen).toHaveLength(4);
  });

  it('meldet Sätze, die direkt hintereinander gleich beginnen', () => {
    const f = satzanfangFolgen(text);
    expect(f).toEqual([expect.objectContaining({ wort: 'Er', saetze: 3 })]);
    expect(f[0]!.stellen.map((s) => text.slice(s.start, s.ende))).toEqual(['Er', 'Er', 'Er']);
    const statistik = satzanfangStatistik(saetze(text));
    expect(statistik[0]).toMatchObject({ wort: 'Er', anzahl: 3 });
  });

  it('findet alle Stellen eines Wortes über die Stammform', () => {
    expect(stellenVon(text, stamm('Kaffee'))).toHaveLength(4);
  });

  it('fasst alles im Bericht zusammen', () => {
    const b = stilBericht(text, { ignorieren: ['Paul', 'Ole'] });
    expect(b.saetze).toBe(8);
    expect(b.woerter).toBeGreaterThan(30);
    expect(b.haeufig.length).toBeGreaterThan(0);
    expect(b.nah.length).toBeGreaterThan(0);
    expect(b.satzanfaenge).toHaveLength(1);
  });

  it('bleibt bei leerem Text leer', () => {
    expect(stilBericht('')).toEqual({ woerter: 0, saetze: 0, haeufig: [], nah: [], satzanfaenge: [], anfangsStatistik: [] });
  });
});

describe('Ausschnitt', () => {
  it('kürzt auf ganze Wörter', () => {
    const t = 'Eins zwei drei vier fünf sechs sieben acht neun zehn elf';
    const i = t.indexOf('sechs');
    const a = ausschnitt(t, i, i + 5, 12);
    expect(a.treffer).toBe('sechs');
    expect(a.vor.startsWith('…')).toBe(true);
    expect(a.nach.endsWith('…')).toBe(true);
  });
});

describe('Englische Buchsprache', () => {
  it('Stammformen: -ing, -ed, -s und Possessiv', () => {
    expect(['walked', 'walking', 'walks', 'walk'].map((w) => stamm(w, 'en'))).toEqual(['walk', 'walk', 'walk', 'walk']);
    expect(['smile', 'smiled', 'smiling', 'smiles'].map((w) => stamm(w, 'en'))).toEqual(['smil', 'smil', 'smil', 'smil']);
    expect(stamm('James’s', 'en')).toBe(stamm('James', 'en'));
  });

  it('englische Stoppwörter zählen nicht, deutsche Liste gilt nicht', () => {
    const t = 'There were their gloves. There were their gloves again. The window, the window, the window.';
    const en = haeufigeWoerter(t, { sprache: 'en' }).map((h) => h.wort);
    expect(en).toContain('gloves');
    expect(en).toContain('window');
    expect(en).not.toContain('There');
    expect(en).not.toContain('their');
    // ohne Sprache (Deutsch) gelten englische Funktionswörter als Inhalt
    expect(haeufigeWoerter(t).map((h) => h.wort)).toContain('There');
  });

  it('Apostroph-Formen (don’t / don\'t) sind Stoppwörter', () => {
    const t = 'I don’t know. You don\'t know. They don’t know either.';
    expect(haeufigeWoerter(t, { sprache: 'en', mindestLaenge: 3 }).map((h) => h.wort)).not.toContain('don’t');
  });

  it('nahe Wiederholungen mit englischen Wortformen', () => {
    const t = 'She walked to the door. Then she was walking back, walks again.';
    const nah = naheWiederholungen(t, { sprache: 'en' });
    expect(nah).toHaveLength(1);
    expect(nah[0]!.stamm).toBe('walk');
    expect(nah[0]!.stellen).toHaveLength(3);
  });

  it('Satzanfänge und Abkürzungen (Mr., Dr.)', () => {
    const t = 'He went home. He slept. Mr. Smith called. Dr. Jones waited.';
    const s = saetze(t, 'en');
    expect(s.map((x) => x.text)).toEqual(['He went home.', 'He slept.', 'Mr. Smith called.', 'Dr. Jones waited.']);
    const b = stilBericht(t, { sprache: 'en' });
    expect(b.satzanfaenge.map((f) => [f.wort, f.saetze])).toEqual([['He', 2]]);
  });

  it('stellenVon findet englische Wortformen', () => {
    const t = 'He smiled. Smiling, he left. A smile.';
    expect(stellenVon(t, 'smil', 'en')).toHaveLength(3);
  });
});
