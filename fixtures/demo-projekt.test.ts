import { beforeAll, describe, expect, it } from 'vitest';
import type { ProjektDaten, TextAnker } from '../core/model/types';
import { ankerFinden, findeZitat, klartext, szenenAbschnitte } from '../core/text';
import { demoDateien, ladeDemoProjekt } from './demoProjekt';

let daten: ProjektDaten;
const text = (id: string) => daten.kapitel[id]?.text ?? '';
const kapitelMit = (muster: RegExp) => daten.projekt.kapitel.filter((id) => muster.test(text(id)));

beforeAll(async () => {
  daten = await ladeDemoProjekt();
});

describe('Demo-Projekt: Testfälle laut fixtures/README.md', () => {
  it('flut ist der Text aus Schreiben.dc.html', () => {
    const t = text('flut');
    expect(t.split('\n\n')).toHaveLength(4);
    expect(t.startsWith('Ich steige aus dem Volvo, schlage die Tür zu und sehe ihm nach, bis er hinter den Lagerhallen verschwunden ist.')).toBe(true);
    expect(t.endsWith('während ich nach einem freien Tisch suche')).toBe(true);
  });

  it('nur flut endet mitten im Satz', () => {
    const ohneSatzende = daten.projekt.kapitel.filter((id) => text(id) !== '' && !/[.!?…“»«"]$/.test(text(id)));
    expect(ohneSatzende).toEqual(['flut']);
  });

  it('regatta hat keinen Text, weissraum genau zwei Sätze', () => {
    expect(text('regatta')).toBe('');
    expect(demoDateien()['manuskript/regatta.md']).toBeUndefined();
    expect(text('weissraum').match(/[.!?](\s|$)/g)).toHaveLength(2);
  });

  it('Schreibweisen', () => {
    expect(kapitelMit(/Lindenhof/)).toEqual(['lotte']);
    expect(kapitelMit(/Linden Hof/)).toEqual(['ebbe']);
    expect(kapitelMit(/Linden-Hof/)).toEqual(['funkstille']);
    expect(kapitelMit(/Karl Hansen/)).toEqual(['fassade']);
    expect(kapitelMit(/Carl Hansen/)).toEqual(['weissraum']);
  });

  it('Namen, Wortgrenzen, Genitive', () => {
    expect(kapitelMit(/\bFiete\b/)).toEqual(['funkstille']);
    expect(text('grundriss')).toContain('Oleander');
    expect(kapitelMit(/\bOle\b/)).toEqual(['grundriss', 'fassade', 'ebbe']);
    expect(kapitelMit(/\bPauls\b/).length).toBeGreaterThan(0);
    expect(kapitelMit(/\bLottes\b/)).toEqual(['lotte']);
    expect(text('lotte')).toContain('mit seinem alten Saab 900 zum Lindenhof');
    expect(text('lotte')).toContain('Klappbrücke');
  });

  it('Vera erst ab ebbe, die Fremde erst ab bis-bald', () => {
    expect(kapitelMit(/Vera/)).toEqual(['ebbe']);
    expect(kapitelMit(/Fremde/)).toEqual(['bis-bald']);
    expect(text('bis-bald')).toContain('Bis bald');
    expect(text('bis-bald')).toContain('Manteltasche');
    expect(text('funkstille')).toContain('Warum bist du nicht gekommen?');
    expect(text('funkstille')).toContain('Nummer unterdrückt');
  });

  it('Spuren und Zitate stehen wörtlich im Text', () => {
    for (const gruppe of Object.values(daten.gruppen))
      for (const spur of gruppe.spuren) expect(text(spur.kapitel), spur.id).toContain(spur.text);
    for (const h of daten.kiHinweise) {
      expect(h.zitate.length).toBeGreaterThan(0);
      for (const z of h.zitate) expect(text(z.kapitel), h.titel).toContain(z.text);
    }
    for (const a of daten.anmerkungen) expect(text(a.anker.kapitel)).toContain(a.anker.davor + a.anker.exakt + a.anker.danach);
  });

  it('Verweise zeigen auf vorhandene IDs', () => {
    const figuren = new Set(Object.keys(daten.figuren));
    const orte = new Set(Object.keys(daten.orte));
    const straenge = new Set(daten.straenge.map((s) => s.id));
    const kapitel = new Set(daten.projekt.kapitel);
    for (const plan of Object.values(daten.plaene)) {
      plan.figuren.forEach((f) => expect(figuren.has(f), f).toBe(true));
      plan.orte.forEach((o) => expect(orte.has(o), o).toBe(true));
      plan.straenge.forEach((s) => expect(straenge.has(s), s).toBe(true));
    }
    for (const f of Object.values(daten.figuren))
      for (const b of f.beziehungen) {
        expect(figuren.has(b.zu)).toBe(true);
        if (b.abKapitel) expect(kapitel.has(b.abKapitel)).toBe(true);
      }
    for (const a of Object.keys(daten.analysen)) expect(kapitel.has(a)).toBe(true);
    for (const g of Object.values(daten.gruppen)) g.mitglieder.forEach((m) => expect(figuren.has(m)).toBe(true));
  });

  it('Akt-Zuordnung und Status', () => {
    const akt = (id: string) => daten.plaene[id]?.akt;
    expect(['grundriss', 'fassade', 'lotte', 'regatta'].map(akt)).toEqual([1, 1, 1, 1]);
    expect(['staub', 'weissraum', 'ebbe', 'bis-bald'].map(akt)).toEqual([2, 2, 2, 2]);
    expect(['flut', 'funkstille'].map(akt)).toEqual([3, 3]);
    const status = Object.values(daten.plaene).map((p) => p.status);
    expect(status.filter((s) => s === 'geplant')).toHaveLength(1);
    expect(status.filter((s) => s === 'entwurf')).toHaveLength(1);
  });
});

describe('Demo-Projekt: Werkzeug-Dateien (G1–G8)', () => {
  const zitatSteht = (z: { kapitel: string; text: string }) => findeZitat(klartext(text(z.kapitel)), z.text).length > 0;
  const ankerSteht = (a: TextAnker) => ankerFinden(klartext(text(a.kapitel)), a) !== null;

  it('alle Dateien sind geladen', () => {
    expect(daten.zeitleiste?.zustaende).toHaveLength(4);
    expect(daten.fadenplanung?.faeden.map((f) => f.id)).toEqual(['die-fremde-und-die-postkarten', 'der-messingschluessel', 'pauls-bleistifte']);
    expect(daten.boegen?.map((b) => b.figur)).toEqual(['paul', 'lotte']);
    expect(daten.marken?.marken).toHaveLength(6);
    expect(Object.keys(daten.statistik?.tage ?? {})).toHaveLength(5);
    expect(daten.fassungen).toHaveLength(1);
    expect(daten.lektorat?.map((a) => a.art)).toEqual(['ersetzen', 'loeschen', 'einfuegen']);
    expect(daten.recherche?.eintraege.map((e) => e.art)).toEqual(['bild', 'link', 'notiz']);
    for (const k of ['kiZeitVorschlaege', 'kiZustandVorschlaege', 'kiStimmen', 'kiLeser', 'kiFragen'] as const) expect(daten[k]?.eintraege.length).toBe(1);
  });

  it('Zeitpunkte: Montag (weissraum) und Donnerstag (funkstille) fest belegt; Tag 9 widerspricht absichtlich dem Beginn', () => {
    expect(daten.zeitleiste?.beginn).toEqual({ wochentag: 'montag' });
    expect(daten.plaene.weissraum?.zeit).toMatchObject({ tag: 8, wochentag: 'montag', sicherheit: 'fest' });
    expect(daten.plaene.funkstille?.zeit).toMatchObject({ tag: 9, wochentag: 'donnerstag', sicherheit: 'fest' });
    const mitZeit = daten.projekt.kapitel.filter((id) => daten.plaene[id]?.zeit);
    expect(mitZeit).toEqual(['grundriss', 'fassade', 'lotte', 'weissraum', 'ebbe', 'funkstille']);
  });

  it('ebbe hat drei Szenen, passend zu den Szenentrennern', () => {
    expect(szenenAbschnitte(text('ebbe'))).toHaveLength(3);
    expect(daten.plaene.ebbe?.szenen?.map((s) => [s.id, s.index, s.kapitel])).toEqual([
      ['ebbe-s1', 0, 'ebbe'],
      ['ebbe-s2', 1, 'ebbe'],
      ['ebbe-s3', 2, 'ebbe'],
    ]);
  });

  it('jeder Anker findet seine Stelle, jedes KI-Zitat steht wörtlich im Text (E4, E6)', () => {
    const anker: TextAnker[] = [
      ...Object.values(daten.plaene).flatMap((p) => [p.zeit?.beleg, ...(p.szenen ?? []).map((s) => s.zeit?.beleg)]),
      ...(daten.zeitleiste?.zustaende ?? []).map((z) => z.beleg),
      ...(daten.boegen ?? []).flatMap((b) => b.stufen.flatMap((s) => s.belege)),
      ...(daten.lektorat ?? []).map((a) => a.anker),
    ].filter((a): a is TextAnker => !!a);
    expect(anker.length).toBeGreaterThan(8);
    for (const a of anker) expect(ankerSteht(a), `${a.kapitel}: ${a.exakt}`).toBe(true);
    const zitate = [
      ...(daten.kiZeitVorschlaege?.eintraege ?? []).flatMap((v) => v.belege),
      ...(daten.kiZustandVorschlaege?.eintraege ?? []).flatMap((v) => v.belege),
      ...(daten.kiStimmen?.eintraege ?? []).flatMap((v) => [...v.zitate, ...v.vergleich]),
      ...(daten.kiLeser?.eintraege ?? []).flatMap((v) => [...v.weiss.flatMap((w) => w.belege), ...v.fragen.flatMap((f) => f.belege)]),
      ...(daten.kiFragen?.eintraege ?? []).flatMap((v) => v.belege),
    ];
    expect(zitate.length).toBeGreaterThan(8);
    for (const z of zitate) expect(zitatSteht(z), `${z.kapitel}: ${z.text}`).toBe(true);
  });

  it('Verweise zeigen auf vorhandene Figuren, Orte, Kapitel, Stränge und Zustände', () => {
    const kapitel = new Set(daten.projekt.kapitel);
    const arten = new Set(daten.zeitleiste?.zustandsarten.map((z) => z.id));
    for (const z of daten.zeitleiste?.zustaende ?? []) {
      expect(daten.figuren[z.figur]).toBeDefined();
      expect(kapitel.has(z.kapitel)).toBe(true);
      expect(arten.has(z.zustand)).toBe(true);
    }
    for (const f of daten.fadenplanung?.faeden ?? []) {
      if (f.aufloesungIn) expect(kapitel.has(f.aufloesungIn)).toBe(true);
      if (f.strang) expect(daten.straenge.some((s) => s.id === f.strang)).toBe(true);
    }
    for (const sz of daten.plaene.ebbe?.szenen ?? []) sz.figuren.forEach((f) => expect(daten.figuren[f]).toBeDefined());
    for (const e of daten.recherche?.eintraege ?? [])
      for (const v of e.verweise) {
        if (v.typ === 'figur') expect(daten.figuren[v.id]).toBeDefined();
        if (v.typ === 'ort') expect(daten.orte[v.id]).toBeDefined();
        if (v.typ === 'kapitel') expect(kapitel.has(v.id)).toBe(true);
      }
    expect(demoDateien()['recherche/dateien/lindenhof.svg']).toMatch(/^<svg/);
  });
});
