import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_DARSTELLUNG } from '@core/darstellung';
import { demoFs } from '../../../fixtures/demoProjekt';
import { useDarstellungsStore } from '../../state/darstellung';
import { useStore } from '../../state/store';
import { Netz } from './Netz';
import { ALLE_KATEGORIEN, KARTE, netzBerechnen } from './logik';

describe.each([1, 1.2, 1.5])('Netz bei UI-Skalierung %s', (skalierung) => {
  beforeEach(async () => {
    await act(async () => { await useStore.getState().projektLaden(demoFs()); });
    useStore.setState({ netzAuswahl: null, netzVerbinden: false });
    useDarstellungsStore.setState({ werte: { ...STANDARD_DARSTELLUNG, skalierung } });
    document.body.style.setProperty('--ui-skalierung', String(skalierung));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useDarstellungsStore.setState({ werte: { ...STANDARD_DARSTELLUNG } });
    document.body.style.removeProperty('--ui-skalierung');
  });

  function zeigeNetz() {
    const { daten, index } = useStore.getState();
    const ansicht = netzBerechnen(daten!, index!, 9, ALLE_KATEGORIEN);
    render(<Netz daten={daten!} index={index!} ansicht={ansicht} standIdx={9} filter={ALLE_KATEGORIEN} />);
    const netz = screen.getByTestId('netz');
    // Bildschirmkoordinaten einschließlich Versatz (z. B. Seitenleiste und gescrolltes Netz).
    vi.spyOn(netz, 'getBoundingClientRect').mockReturnValue({
      left: 125, top: -45, width: ansicht.breite * skalierung, height: ansicht.hoehe * skalierung,
      right: 125 + ansicht.breite * skalierung, bottom: -45 + ansicht.hoehe * skalierung,
      x: 125, y: -45, toJSON: () => ({}),
    });
    return { netz, daten: daten!, ansicht };
  }

  function ziehe(element: Element, netz: HTMLElement) {
    fireEvent.pointerDown(element, { button: 0, clientX: 500, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(netz, { clientX: 500 + 40 * skalierung, clientY: 300 - 20 * skalierung, pointerId: 1 });
  }

  it('Karten folgen der Maus in Layout-Pixeln und speichern dieselbe Position', async () => {
    const { netz, daten } = zeigeNetz();
    const karte = netz.querySelector<HTMLElement>('[data-figur="paul"]')!;
    const vorher = daten.figuren.paul!.netz!;
    ziehe(karte, netz);
    expect(karte.style.left).toBe(`${vorher.x + 40}px`);
    expect(karte.style.top).toBe(`${vorher.y - 20}px`);
    await act(async () => { fireEvent.pointerUp(netz, { pointerId: 1 }); });
    expect(useStore.getState().daten!.figuren.paul!.netz).toEqual({ x: vorher.x + 40, y: vorher.y - 20 });
  });

  it('Gruppenflächen und enthaltene Karten werden um dieselbe Layout-Distanz verschoben', async () => {
    const { netz, daten, ansicht } = zeigeNetz();
    const gruppe = netz.querySelector<HTMLElement>('[data-gruppe="nordhaven"]')!;
    const vorher = daten.gruppen.nordhaven!.netz!;
    const mitglieder = ansicht.karten.filter(({ rechteck: r }) => {
      const x = r.x + KARTE.breite / 2, y = r.y + KARTE.hoehe / 2;
      return x >= vorher.x && x <= vorher.x + vorher.breite && y >= vorher.y && y <= vorher.y + vorher.hoehe;
    });
    expect(mitglieder.length).toBeGreaterThan(0);
    ziehe(gruppe, netz);
    expect(gruppe.style.left).toBe(`${vorher.x + 40}px`);
    expect(gruppe.style.top).toBe(`${vorher.y - 20}px`);
    for (const k of mitglieder) {
      const karte = netz.querySelector<HTMLElement>(`[data-figur="${k.figur.id}"]`)!;
      expect(karte.style.left).toBe(`${k.rechteck.x + 40}px`);
      expect(karte.style.top).toBe(`${k.rechteck.y - 20}px`);
    }
    await act(async () => { fireEvent.pointerUp(netz, { pointerId: 1 }); });
    expect(useStore.getState().daten!.gruppen.nordhaven!.netz).toEqual({ ...vorher, x: vorher.x + 40, y: vorher.y - 20 });
    for (const k of mitglieder)
      expect(useStore.getState().daten!.figuren[k.figur.id]!.netz).toEqual({ x: k.rechteck.x + 40, y: k.rechteck.y - 20 });
  });

  it('Gruppengröße folgt der Maus und wird in Layout-Pixeln gespeichert', async () => {
    const { netz, daten } = zeigeNetz();
    const gruppe = netz.querySelector<HTMLElement>('[data-gruppe="nordhaven"]')!;
    const vorher = daten.gruppen.nordhaven!.netz!;
    ziehe(gruppe.querySelector('.pw-bz-gruppe__groesse')!, netz);
    expect(gruppe.style.width).toBe(`${vorher.breite + 40}px`);
    expect(gruppe.style.height).toBe(`${vorher.hoehe - 20}px`);
    await act(async () => { fireEvent.pointerUp(netz, { pointerId: 1 }); });
    expect(useStore.getState().daten!.gruppen.nordhaven!.netz).toEqual({ ...vorher, breite: vorher.breite + 40, hoehe: vorher.hoehe - 20 });
  });

  it('Verbindungslinie endet am Zeiger; Trefferprüfung behält Bildschirmkoordinaten', async () => {
    const { netz } = zeigeNetz();
    const ole = netz.querySelector('[data-figur="ole"]')!;
    const malte = netz.querySelector('[data-figur="malte"]')!;
    const treffer = vi.fn(() => malte);
    const vorher = document.elementFromPoint;
    document.elementFromPoint = treffer;
    try {
      fireEvent.pointerDown(ole.querySelector('.pw-bz-griff')!, { button: 0, clientX: 500, clientY: 300, pointerId: 1 });
      const clientX = 125 + 300 * skalierung, clientY = -45 + 180 * skalierung;
      fireEvent.pointerMove(netz, { clientX, clientY, pointerId: 1 });
      expect(netz.querySelector('path[style*="stroke-dasharray: 4 4"]')?.getAttribute('d')).toMatch(/ L 300 180$/);
      expect(malte).toHaveClass('pw-bz-karte--ziel');
      expect(treffer).toHaveBeenLastCalledWith(clientX, clientY);
      await act(async () => { fireEvent.pointerUp(netz, { clientX, clientY, pointerId: 1 }); });
      expect(treffer).toHaveBeenLastCalledWith(clientX, clientY);
      expect(useStore.getState().daten!.figuren.ole!.beziehungen.map((b) => b.zu)).toContain('malte');
    } finally {
      document.elementFromPoint = vorher;
    }
  });
});
