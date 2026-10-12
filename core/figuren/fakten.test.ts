import { beforeEach, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type { FigurFakt, ProjektDaten } from '../model/types';
import { ladeProjekt, parseKiFakten, serializeKiFakten } from '../projekt';
import { faktenDerFigur, faktenHinweise, mischeFakten, setzeFaktStatus, werteVertraeglich, wertForm } from './index';

const SAAB = 'Dann nimmt er den Schlüssel und fährt mit seinem alten Saab 900 zum Lindenhof.';
const VOLVO = 'Ich steige aus dem Volvo, schlage die Tür zu und sehe ihm nach, bis er hinter den Lagerhallen verschwunden ist.';
const ORGELN = 'Vera erzählt von ihrer Werkstatt, in der sie alte Orgeln restauriert, Paul hört nur halb zu.';

const fakt = (figur: string, merkmal: string, wert: string, kapitel: string, text: string): FigurFakt => ({
  schluessel: `fakt:${figur}|${merkmal.toLowerCase()}|${kapitel}/${text.slice(0, 20)}`,
  figur,
  merkmal,
  wert,
  kapitel,
  zitat: { kapitel, text },
  status: 'neu',
});

let daten: ProjektDaten;
beforeEach(async () => {
  daten = await ladeProjekt(demoFs());
});

describe('Figurenfakten: Vergleich, Widersprüche, Planung (F-17)', () => {
  it('Werte: Füllwörter fallen weg, enthalten = verträglich', () => {
    expect(wertForm('seinem alten Saab 900')).toBe('seinem saab 900');
    expect(werteVertraeglich('alter Saab 900', 'Saab')).toBe(true);
    expect(werteVertraeglich('Saab', 'Volvo')).toBe(false);
    expect(werteVertraeglich('Architekt', 'architekt')).toBe(true);
  });

  it('Widerspruch beim gleichen Merkmal → Hinweis „pruefen“ mit Figur-Bezug und beiden Zitaten', () => {
    daten.kiFakten = { version: 1, eintraege: [fakt('paul', 'Auto', 'alter Saab 900', 'lotte', SAAB), fakt('paul', 'auto', 'Volvo', 'flut', VOLVO)] };
    const g = faktenDerFigur(daten, 'paul');
    expect(g).toHaveLength(1);
    expect(g[0]!.widerspruch).toBe(true);
    const h = faktenHinweise(daten).filter((x) => x.schluessel === 'fakt:widerspruch:paul|auto');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ typ: 'pruefen', plan: { figur: 'paul' } });
    expect(h[0]!.zitate.map((z) => z.text)).toEqual([SAAB, VOLVO]);
  });

  it('Planabweichung: Planfeld gleichen Namens, kein Textwert passt', () => {
    daten.figuren.vera = { ...daten.figuren.vera!, plan: { ...daten.figuren.vera!.plan, Beruf: 'Geigenbauerin' } };
    daten.kiFakten = { version: 1, eintraege: [fakt('vera', 'Beruf', 'restauriert alte Orgeln', 'ebbe', ORGELN)] };
    const g = faktenDerFigur(daten, 'vera')[0]!;
    expect(g.plan).toEqual({ feld: 'Beruf', wert: 'Geigenbauerin', abweichend: true });
    expect(faktenHinweise(daten).map((x) => x.schluessel)).toContain('fakt:plan:vera|beruf');
    // passender Plan: kein Hinweis
    daten.figuren.vera = { ...daten.figuren.vera!, plan: { ...daten.figuren.vera!.plan, Beruf: 'restauriert Orgeln' } };
    expect(faktenHinweise(daten).filter((x) => x.schluessel.startsWith('fakt:plan:vera'))).toEqual([]);
  });

  it('verworfene und nicht mehr gültige Angaben zählen nicht; Mischen ersetzt nur die abgefragten Figuren', () => {
    const a = fakt('paul', 'Auto', 'alter Saab 900', 'lotte', SAAB);
    const b = fakt('paul', 'Auto', 'Volvo', 'flut', VOLVO);
    const v = fakt('vera', 'Beruf', 'Orgeln', 'ebbe', ORGELN);
    let ablage = mischeFakten(undefined, ['paul', 'vera'], [a, b, v]).ablage;
    ablage = setzeFaktStatus(ablage, b.schluessel, 'verworfen');
    daten.kiFakten = ablage;
    expect(faktenDerFigur(daten, 'paul')[0]!.widerspruch).toBe(false);
    // neuer Lauf nur für Paul: Verworfenes kommt nicht wieder, Vera bleibt
    const zweiter = mischeFakten(ablage, ['paul'], [a, b]);
    expect(zweiter.ablage.eintraege.filter((x) => x.figur === 'paul').map((x) => x.status).sort()).toEqual(['neu', 'verworfen']);
    expect(zweiter.ablage.eintraege.some((x) => x.figur === 'vera')).toBe(true);
    expect(zweiter.neu).toBe(0);
    // Ablage übersteht Speichern
    expect(parseKiFakten(serializeKiFakten(zweiter.ablage))).toEqual(zweiter.ablage);
    // geänderter Text: Beleg nicht mehr gültig
    daten.kapitel.lotte = { ...daten.kapitel.lotte!, text: 'Ganz anders.' };
    expect(faktenDerFigur(daten, 'paul')).toEqual([]);
  });
});
