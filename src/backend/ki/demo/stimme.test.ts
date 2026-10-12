import { describe, expect, it } from 'vitest';
import { pruefeStimme, STIMME_ART } from '@core/ki/index';
import { demoFs } from '../../../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../demo';
import { demoAntwortFuer } from '../demoAntworten';

const ki = () => erstelleDemoKiTransport({ verzoegerungMs: 0 });

describe('Demo-Antwort „stimme“ (G3)', () => {
  it('ist registriert', () => {
    expect(demoAntwortFuer(STIMME_ART)).toBeDefined();
  });

  it('Paul: zwei wörtlich belegte Beobachtungen; erfundenes Zitat und Formulierungsvorschlag werden verworfen', async () => {
    const r = await pruefeStimme(demoFs(), ki(), undefined, { figur: 'paul' });
    expect(r.ergebnis.beobachtungen.map((b) => b.titel)).toEqual(['Paul antwortet nur mit einer Zahl', 'Großgeschriebene Anrede gegenüber Vera']);
    for (const b of r.ergebnis.beobachtungen) {
      expect(b.zitate.length).toBeGreaterThan(0);
      expect(b.vergleich.length).toBeGreaterThan(0);
      expect(b.vergleich.some((v) => b.zitate.some((z) => z.kapitel === v.kapitel && z.text === v.text))).toBe(false);
    }
    expect(r.verworfen.map((v) => v.grund)).toEqual([expect.stringContaining('nicht wörtlich'), expect.stringContaining('Formulierungsvorschlag')]);
  });

  it('Die Fremde (bewusst vage): nur die deutliche Beobachtung', async () => {
    const r = await pruefeStimme(demoFs(), ki(), undefined, { figur: 'die-fremde' });
    expect(r.ergebnis.vage).toBe(true);
    expect(r.ergebnis.beobachtungen.map((b) => b.titel)).toEqual(['Vom Gruß zum Vorwurf']);
    expect(r.verworfen).toHaveLength(1);
  });

  it('Figur ohne Demo-Beobachtungen: zu wenig Rede', async () => {
    const r = await pruefeStimme(demoFs(), ki(), undefined, { figur: 'herr-kessler' });
    expect(r.ergebnis).toMatchObject({ zuWenigRede: true, beobachtungen: [] });
  });
});
