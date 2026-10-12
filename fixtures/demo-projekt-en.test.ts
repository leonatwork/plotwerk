/**
 * Englisches Demo-Projekt „Harbour Lights“ (fixtures/demo-projekt-en): gleiche Struktur und Testfälle wie
 * „Hafenlichter“, englischer Text, Anker und textHash aus dem englischen Text, alle Zitate wörtlich.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ProjektDaten, TextAnker } from '../core/model/types';
import { MemoryFs } from '../core/projekt';
import { ladeProjektMitBericht } from '../core/projekt/lesen';
import { ankerFinden, findeZitat, klartext, szenenAbschnitte, textHash } from '../core/text';
import { demoDateien, demoDateienEn, ladeDemoProjekt } from './demoProjekt';

/** Deutsche ID → englische ID (alles andere heißt gleich). */
const ID: Record<string, string> = {
  grundriss: 'floor-plan',
  fassade: 'facade',
  staub: 'dust',
  weissraum: 'white-space',
  ebbe: 'low-tide',
  'bis-bald': 'see-you-soon',
  flut: 'high-tide',
  funkstille: 'radio-silence',
  'herr-kessler': 'mr-kessler',
  'die-fremde': 'the-stranger',
  'alter-mann-am-kai': 'old-man-on-the-quay',
  buero: 'office',
  teekueche: 'kitchenette',
  zeichensaal: 'drawing-studio',
  'pauls-wohnung': 'pauls-flat',
  faehrhaus: 'ferry-house',
  kornspeicher: 'granary',
  fischstand: 'fish-stall',
  bootsverleih: 'boat-hire',
  konsortium: 'consortium',
  begegnungen: 'encounters',
  postkarten: 'postcards',
  schlaflos: 'sleepless',
  ausgeruht: 'rested',
  erschoepft: 'exhausted',
  verwirrt: 'confused',
  gedaechtnisluecke: 'memory-gap',
  'die-fremde-und-die-postkarten': 'the-stranger-and-the-postcards',
  'der-messingschluessel': 'the-brass-key',
  'pauls-bleistifte': 'pauls-pencils',
};
const en = (id: string) => ID[id] ?? id;
const enPfad = (pfad: string) => pfad.replace(/[^/]+(?=\.(md|json)$)/, (n) => en(n)).replace('ebbe-s', 'low-tide-s');

let daten: ProjektDaten;
let de: ProjektDaten;
let warnungen: { pfad: string; grund: string }[];
const text = (id: string) => daten.kapitel[id]?.text ?? '';
const kapitelMit = (muster: RegExp) => daten.projekt.kapitel.filter((id) => muster.test(text(id)));

beforeAll(async () => {
  const bericht = await ladeProjektMitBericht(new MemoryFs(demoDateienEn()), 'en');
  daten = bericht.daten;
  warnungen = bericht.warnungen;
  de = await ladeDemoProjekt();
});

describe('Harbour Lights: lädt, Buchsprache Englisch', () => {
  it('lädt ohne Warnungen, Titel und Buchsprache', () => {
    expect(warnungen).toEqual([]);
    expect(daten.projekt.titel).toBe('Harbour Lights');
    expect(daten.projekt.angaben?.sprache).toBe('en');
  });

  it('textHash der Analysen passt zum englischen Text, keine Analyse für regatta', () => {
    for (const [id, a] of Object.entries(daten.analysen)) expect(a.textHash, id).toBe(textHash(text(id)));
    expect(daten.analysen.regatta).toBeUndefined();
  });

  it('keine deutschen Reste in den Texten (außer Eigennamen und den festen Abschnittsüberschriften)', () => {
    for (const [pfad, inhalt] of Object.entries(demoDateienEn())) {
      const ohneFormat = inhalt.replace(/## Wahrheit hinter den Kulissen|## Notizen/g, '');
      expect(ohneFormat, pfad).not.toMatch(/[äöüßÄÖÜ„]|\b(und|oder|nicht|ist|sind|eine|einen|der|das|mit|Kap\.)\b/);
    }
  });
});

describe('Harbour Lights: gleiche Struktur wie Hafenlichter', () => {
  it('gleiche Dateien (mit englischen IDs)', () => {
    expect(Object.keys(demoDateienEn()).sort()).toEqual(Object.keys(demoDateien()).map(enPfad).sort());
  });

  it('Kapitel, Akte, Status, Zeitpunkte, Szenen und Realitätsebenen', () => {
    expect(daten.projekt.kapitel).toEqual(de.projekt.kapitel.map(en));
    for (const id of de.projekt.kapitel) {
      const p = de.plaene[id]!;
      const q = daten.plaene[en(id)]!;
      expect([q.akt, q.status, q.straenge, q.figuren, q.orte], id).toEqual([p.akt, p.status, p.straenge.map(en), p.figuren.map(en), p.orte.map(en)]);
      const zeit = (z: typeof p.zeit) => z && { ...z, beleg: undefined, notiz: undefined };
      expect(zeit(q.zeit), id).toEqual(zeit(p.zeit));
      expect((q.szenen ?? []).map((s) => [s.index, s.figuren, s.ort])).toEqual((p.szenen ?? []).map((s) => [s.index, s.figuren.map(en), s.ort && en(s.ort)]));
      expect(q.realitaet.map((r) => r.stufe), id).toEqual(p.realitaet.map((r) => r.stufe));
      expect(q.abweichungen.map((a) => a.entscheidung), id).toEqual(p.abweichungen.map((a) => a.entscheidung));
      expect(Boolean(text(en(id))), id).toBe(Boolean(de.kapitel[id]?.text));
    }
  });

  it('Figuren, Orte, Gruppen, Stränge', () => {
    const figuren = (d: ProjektDaten, ids: (x: string) => string) =>
      Object.values(d.figuren)
        .map((f) => [ids(f.id), f.rolle, f.existenz, f.gruppe, f.beziehungen.map((b) => [ids(b.zu), b.kategorie, ids(b.strang ?? ''), b.abKapitel && ids(b.abKapitel)]), f.netz])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(figuren(daten, (x) => x)).toEqual(figuren(de, en));
    const orte = (d: ProjektDaten, ids: (x: string) => string) =>
      Object.values(d.orte)
        .map((o) => [ids(o.id), o.in && ids(o.in)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(orte(daten, (x) => x)).toEqual(orte(de, en));
    expect(Object.values(daten.gruppen).map((g) => [g.id, g.typ, g.status, g.mitglieder, g.spuren.map((s) => s.kapitel), g.netz])).toEqual(
      Object.values(de.gruppen).map((g) => [en(g.id), g.typ, g.status, g.mitglieder.map(en), g.spuren.map((s) => en(s.kapitel)), g.netz]),
    );
    expect(daten.straenge.map((s) => [s.id, s.farbe, s.gruppe])).toEqual(de.straenge.map((s) => [en(s.id), s.farbe, s.gruppe && en(s.gruppe)]));
  });

  it('Werkzeug-Dateien und KI-Ergebnisse', () => {
    expect(daten.zeitleiste?.zustaende.map((z) => [z.figur, z.kapitel, z.zustand, z.szene])).toEqual(
      de.zeitleiste?.zustaende.map((z) => [z.figur, en(z.kapitel), en(z.zustand), z.szene?.replace('ebbe-s', 'low-tide-s')]),
    );
    expect(daten.zeitleiste?.zustandsarten.map((z) => z.farbe)).toEqual(de.zeitleiste?.zustandsarten.map((z) => z.farbe));
    expect(daten.fadenplanung?.faeden.map((f) => [f.id, f.aufloesungIn, f.strang, f.ruheSchwelle])).toEqual(
      de.fadenplanung?.faeden.map((f) => [en(f.id), f.aufloesungIn && en(f.aufloesungIn), f.strang && en(f.strang), f.ruheSchwelle]),
    );
    expect(daten.boegen?.map((b) => [b.figur, b.stufen.map((s) => [s.kapitel, s.akt, s.belege.length])])).toEqual(
      de.boegen?.map((b) => [b.figur, b.stufen.map((s) => [s.kapitel && en(s.kapitel), s.akt, s.belege.length])]),
    );
    expect(daten.marken?.marken.map((m) => [m.id, m.name, m.aliase])).toEqual(de.marken?.marken.map((m) => [m.id, m.name, m.aliase]));
    expect(daten.kiHinweise.map((h) => [h.typ, h.zitate.map((z) => z.kapitel)])).toEqual(de.kiHinweise.map((h) => [h.typ, h.zitate.map((z) => en(z.kapitel))]));
    expect(Object.keys(daten.analysen).sort()).toEqual(Object.keys(de.analysen).map(en).sort());
    expect(daten.lektorat?.map((a) => [a.art, a.anker.kapitel, a.status])).toEqual(de.lektorat?.map((a) => [a.art, en(a.anker.kapitel), a.status]));
    expect(daten.recherche?.eintraege.map((e) => [e.art, e.verweise.map((v) => v.id)])).toEqual(de.recherche?.eintraege.map((e) => [e.art, e.verweise.map((v) => en(v.id))]));
    expect(daten.anmerkungen.map((a) => [a.anker.kapitel, a.ziel])).toEqual(de.anmerkungen.map((a) => [en(a.anker.kapitel), a.ziel]));
    for (const k of ['kiZeitVorschlaege', 'kiZustandVorschlaege', 'kiStimmen', 'kiLeser', 'kiFragen'] as const) expect(daten[k]?.eintraege.length, k).toBe(1);
    expect(daten.statistik).toEqual(de.statistik);
  });
});

describe('Harbour Lights: Testfälle im Text', () => {
  it('high-tide hat vier Absätze und endet als einziges Kapitel mitten im Satz', () => {
    expect(text('high-tide').split('\n\n')).toHaveLength(4);
    expect(text('high-tide').endsWith('while I look for a free table')).toBe(true);
    expect(daten.projekt.kapitel.filter((id) => text(id) !== '' && !/[.!?…”"’]$/.test(text(id)))).toEqual(['high-tide']);
  });

  it('regatta ohne Text, white-space genau zwei Sätze, low-tide drei Szenen', () => {
    expect(text('regatta')).toBe('');
    expect(text('white-space').match(/[.!?](\s|$)/g)).toHaveLength(2);
    expect(szenenAbschnitte(text('low-tide'))).toHaveLength(3);
  });

  it('Schreibweisen, Namen, Possessive', () => {
    expect(kapitelMit(/Lindenhof/)).toEqual(['lotte']);
    expect(kapitelMit(/Linden Hof/)).toEqual(['low-tide']);
    expect(kapitelMit(/Linden-Hof/)).toEqual(['radio-silence']);
    expect(kapitelMit(/Karl Hansen/)).toEqual(['facade']);
    expect(kapitelMit(/Carl Hansen/)).toEqual(['white-space']);
    expect(kapitelMit(/\bFiete\b/)).toEqual(['radio-silence']);
    expect(text('floor-plan')).toContain('oleander');
    expect(kapitelMit(/\bOle\b/)).toEqual(['floor-plan', 'facade', 'low-tide']);
    expect(kapitelMit(/\bLotte’s\b/)).toEqual(['lotte']);
    expect(kapitelMit(/\bPaul’s\b/).length).toBeGreaterThan(1);
    expect(text('lotte')).toContain('drives his old Saab 900 to the Lindenhof');
    expect(text('lotte')).toContain('bascule bridge');
    expect(text('high-tide')).toContain('I take Her in my arms');
  });

  it('Vera erst ab low-tide, the Stranger erst ab see-you-soon, Wochentage', () => {
    expect(kapitelMit(/Vera/)).toEqual(['low-tide']);
    expect(kapitelMit(/Stranger/)).toEqual(['see-you-soon']);
    expect(text('see-you-soon')).toContain('“See you soon”');
    expect(text('radio-silence')).toContain('Why didn’t you come?');
    expect(text('radio-silence')).toContain('Number withheld');
    expect(kapitelMit(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/)).toEqual(['white-space', 'radio-silence']);
  });

  it('jeder Anker findet seine Stelle, jedes Zitat steht wörtlich im Text', () => {
    const zitatSteht = (z: { kapitel: string; text: string }) => findeZitat(klartext(text(z.kapitel)), z.text).length > 0;
    const anker: TextAnker[] = [
      ...Object.values(daten.plaene).flatMap((p) => [p.zeit?.beleg, ...(p.szenen ?? []).map((s) => s.zeit?.beleg)]),
      ...(daten.zeitleiste?.zustaende ?? []).map((z) => z.beleg),
      ...(daten.boegen ?? []).flatMap((b) => b.stufen.flatMap((s) => s.belege)),
      ...(daten.lektorat ?? []).map((a) => a.anker),
      ...daten.anmerkungen.map((a) => a.anker),
    ].filter((a): a is TextAnker => !!a);
    expect(anker.length).toBeGreaterThan(10);
    for (const a of anker) expect(ankerFinden(klartext(text(a.kapitel)), a), `${a.kapitel}: ${a.exakt}`).not.toBeNull();
    const zitate = [
      ...daten.kiHinweise.flatMap((h) => h.zitate),
      ...Object.values(daten.gruppen).flatMap((g) => g.spuren.map((s) => ({ kapitel: s.kapitel, text: s.text }))),
      ...(daten.kiZeitVorschlaege?.eintraege ?? []).flatMap((v) => v.belege),
      ...(daten.kiZustandVorschlaege?.eintraege ?? []).flatMap((v) => v.belege),
      ...(daten.kiStimmen?.eintraege ?? []).flatMap((v) => [...v.zitate, ...v.vergleich]),
      ...(daten.kiLeser?.eintraege ?? []).flatMap((v) => [...v.weiss.flatMap((w) => w.belege), ...v.fragen.flatMap((f) => f.belege)]),
      ...(daten.kiFragen?.eintraege ?? []).flatMap((v) => v.belege),
    ];
    expect(zitate.length).toBeGreaterThan(12);
    for (const z of zitate) expect(zitatSteht(z), `${z.kapitel}: ${z.text}`).toBe(true);
  });

  it('private Felder beginnen mit „Private (test text)“', () => {
    expect(daten.figuren.paul?.wahrheit).toMatch(/^Private \(test text\)/);
    expect(daten.figuren['the-stranger']?.notizen).toMatch(/^Private \(test text\)/);
  });
});
