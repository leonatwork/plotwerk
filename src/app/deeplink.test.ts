import { describe, expect, it, vi } from 'vitest';
import { ladeDemoProjekt } from '../../fixtures/demoProjekt';
import type { Store } from '../state/store';
import { deepLinkAnwenden } from './deeplink';

async function zustand() {
  const daten = await ladeDemoProjekt();
  const s = {
    daten,
    bereich: 'schreiben',
    fokusModus: false,
    oeffne: vi.fn(),
    setzeNetzStand: vi.fn(),
    umschalteFokus: vi.fn(),
    oeffneDialog: vi.fn(),
  };
  return { daten, s, store: s as unknown as Store };
}

describe('Deep-Link über den Hash', () => {
  it('öffnet Bereich mit Kapitel nach Nummer, Figur nach Name und Plan-Karte', async () => {
    const { daten, s, store } = await zustand();
    deepLinkAnwenden('#bereich=schreiben&kapitel=9', store);
    expect(s.oeffne).toHaveBeenLastCalledWith('schreiben', { kapitel: daten.projekt.kapitel[8] });
    deepLinkAnwenden('#bereich=figuren&figur=Lotte', store);
    expect(s.oeffne).toHaveBeenLastCalledWith('figuren', { figur: 'lotte' });
    deepLinkAnwenden('#bereich=akte&plan=4', store);
    expect(s.oeffne).toHaveBeenLastCalledWith('akte', { plan: daten.projekt.kapitel[3] });
  });

  it('Netz-Stand nach Akt, Fokus-Modus und Dialog; Unbekanntes wird ignoriert', async () => {
    const { daten, s, store } = await zustand();
    deepLinkAnwenden('#bereich=beziehungen&stand=akt1&fokus=1&dialog=export', store);
    const akt1 = daten.projekt.kapitel.filter((id) => daten.plaene[id]?.akt === 1);
    expect(s.setzeNetzStand).toHaveBeenCalledWith(akt1[akt1.length - 1]);
    expect(s.umschalteFokus).toHaveBeenCalledTimes(1);
    expect(s.oeffneDialog).toHaveBeenCalledWith('export');
    deepLinkAnwenden('#bereich=gibtsnicht&kapitel=99&figur=niemand&dialog=loeschen', store);
    expect(s.oeffne).toHaveBeenLastCalledWith('schreiben', {});
    expect(s.oeffneDialog).toHaveBeenCalledTimes(1);
    deepLinkAnwenden('', store);
    expect(s.oeffne).toHaveBeenCalledTimes(2);
  });
});
