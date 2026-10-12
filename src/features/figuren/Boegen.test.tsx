import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bogenVon } from '@core/figuren/index';
import { MemoryFs, parseBoegen, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { indexBereit } from '../../state/slices/planung';
import { erstelleStore, useStore } from '../../state/store';
import { FigurenBoegen } from './Boegen';

async function laden(store: typeof useStore) {
  const fs = new MemoryFs(demoDateien());
  store.setState({ backend: erstelleDemoBackend() });
  await store.getState().projektLaden(fs);
  return fs;
}

const bogenDatei = async (fs: MemoryFs) => parseBoegen((await fs.lesen(PFADE.boegen))!);

describe('Slice „figurenbogen“ – Bögen', () => {
  it('legt Stufen an, ändert, belegt und entfernt sie – alles in plan/boegen.md', async () => {
    const store = erstelleStore();
    const fs = await laden(store);
    const fb = () => store.getState().figurenbogen;

    const id = await fb().stufeAnlegen('ole', { titel: 'Lernt die Regeln', kapitel: 'grundriss', notiz: '  schaut zu  ' });
    expect(id).toBe('lernt-die-regeln');
    expect(fb().gewaehlteStufe).toEqual({ figur: 'ole', stufe: id });
    await store.getState().alleSpeichernAbwarten();
    expect(bogenVon(await bogenDatei(fs), 'ole').stufen).toEqual([{ id, titel: 'Lernt die Regeln', kapitel: 'grundriss', notiz: 'schaut zu', belege: [] }]);

    const akt = await fb().stufeAnlegen('ole', { titel: 'Lernt die Regeln', akt: 2 });
    expect(akt).toBe('lernt-die-regeln-2');

    expect(await fb().belegAusZitatHinzufuegen('ole', id, 'grundriss', 'Ole tanzt auf dem Tisch')).toMatch(/steht so nicht/);
    expect(await fb().belegAusZitatHinzufuegen('ole', id, 'grundriss', 'Ole sitzt auf der Fensterbank')).toBeNull();
    // doppelt wird ignoriert
    expect(await fb().belegAusZitatHinzufuegen('ole', id, 'grundriss', 'Ole sitzt auf der Fensterbank')).toBeNull();
    let ole = bogenVon(store.getState().daten!.boegen, 'ole');
    expect(ole.stufen[0]!.belege).toHaveLength(1);
    expect(ole.stufen[0]!.belege[0]).toMatchObject({ kapitel: 'grundriss', exakt: 'Ole sitzt auf der Fensterbank' });

    await fb().stufeSpeichern('ole', { ...ole.stufen[0]!, titel: 'Bewundert Paul' });
    await fb().belegEntfernen('ole', id, 0);
    ole = bogenVon(store.getState().daten!.boegen, 'ole');
    expect(ole.stufen[0]).toMatchObject({ id, titel: 'Bewundert Paul', belege: [] });

    await fb().stufeEntfernen('ole', akt);
    expect(fb().gewaehlteStufe).toBeNull();
    await fb().stufeEntfernen('ole', id);
    await store.getState().alleSpeichernAbwarten();
    // leerer Bogen fällt aus der Datei, die anderen bleiben unverändert
    const datei = await bogenDatei(fs);
    expect(datei.map((b) => b.figur)).toEqual(['paul', 'lotte']);
    expect(bogenVon(datei, 'paul').stufen.map((s) => s.id)).toEqual(['im-lot', 'risse', 'schlaflos']);
    expect(store.getState().speichern.fehler).toBeNull();
  });

  it('Vergleich und Ansicht', async () => {
    const store = erstelleStore();
    await laden(store);
    const fb = () => store.getState().figurenbogen;
    fb().setzeVergleich(['lotte', 'ole', 'lotte']);
    expect(fb().vergleich).toEqual(['lotte', 'ole']);
    fb().setzeFigurenAnsicht('boegen');
    expect(fb().figurenAnsicht).toBe('boegen');
  });
});

describe('Figuren-Bögen (Ansicht)', () => {
  beforeEach(async () => {
    await laden(useStore);
    useStore.getState().figurenbogen.setzeVergleich([]);
    useStore.getState().figurenbogen.waehleStufe(null);
    await waitFor(() => expect(indexBereit(useStore.getState().index)).toBe(true));
  });

  const ansicht = () => {
    const Huelle = () => {
      const daten = useStore((s) => s.daten)!;
      return <FigurenBoegen daten={daten} figur="paul" />;
    };
    return render(<Huelle />);
  };

  it('zeigt Pauls Stufen, Auftritte und Belege; Klick auf einen Punkt springt in den Text', async () => {
    ansicht();
    expect(screen.getByRole('heading', { name: 'Bögen' })).toBeInTheDocument();
    for (const t of ['Alles im Lot', 'Erste Risse', 'Ohne Schlaf']) expect(screen.getByRole('button', { name: new RegExp(`Stufe „${t}“ von Paul`) })).toBeInTheDocument();
    const punkt = screen.getByRole('button', { name: /^Paul in Kap\. 5 „Staub“/ });
    fireEvent.click(punkt);
    expect(useStore.getState().bereich).toBe('schreiben');
    expect(useStore.getState().markierung?.kapitel).toBe('staub');
    // Belegmarke in Kap. 7 (Ebbe)
    fireEvent.click(screen.getByRole('button', { name: /1 Beleg in Kap\. 7 „Ebbe“/ }));
    expect(useStore.getState().markierung).toMatchObject({ kapitel: 'ebbe', anker: { exakt: 'er rührt sich nicht' } });
  });

  it('Stufe wählen, bearbeiten und per Tastatur verschieben', async () => {
    ansicht();
    const risse = screen.getByRole('button', { name: /Stufe „Erste Risse“ von Paul/ });
    fireEvent.click(risse);
    expect(risse).toHaveAttribute('aria-pressed', 'true');
    const bearbeitung = screen.getByRole('region', { name: 'Stufe „Erste Risse“ bearbeiten' });
    expect(within(bearbeitung).getByText(/er rührt sich nicht/)).toBeInTheDocument();

    // ⌥→ verschiebt ein Kapitel weiter (Ebbe → Bis bald)
    await act(async () => {
      fireEvent.keyDown(risse, { key: 'ArrowRight', altKey: true });
    });
    await waitFor(() => expect(bogenVon(useStore.getState().daten!.boegen, 'paul').stufen.find((s) => s.id === 'risse')!.kapitel).toBe('bis-bald'));

    // Titel ändern
    const titel = within(bearbeitung).getByLabelText('Titel');
    fireEvent.change(titel, { target: { value: 'Risse' } });
    fireEvent.keyDown(titel, { key: 'Enter' });
    await waitFor(() => expect(bogenVon(useStore.getState().daten!.boegen, 'paul').stufen.find((s) => s.id === 'risse')!.titel).toBe('Risse'));

    // Beleg aus einem vorgeschlagenen Satz
    const kap = within(bearbeitung).getByLabelText('Beleg aus');
    fireEvent.change(kap, { target: { value: 'staub' } });
    const vorschlag = within(bearbeitung).getAllByRole('button', { name: /Als Beleg übernehmen/ })[0]!;
    await act(async () => {
      fireEvent.click(vorschlag);
    });
    await waitFor(() => expect(bogenVon(useStore.getState().daten!.boegen, 'paul').stufen.find((s) => s.id === 'risse')!.belege).toHaveLength(2));

    // falsches Zitat → Fehlermeldung
    fireEvent.change(within(bearbeitung).getByLabelText('Wörtliches Zitat aus dem Kapitel'), { target: { value: 'Paul tanzt im Kornspeicher' } });
    await act(async () => {
      fireEvent.click(within(bearbeitung).getByRole('button', { name: 'Hinzufügen' }));
    });
    expect(await within(bearbeitung).findByRole('alert')).toHaveTextContent('steht so nicht');

    fireEvent.click(within(bearbeitung).getByRole('button', { name: 'Fertig' }));
    expect(useStore.getState().figurenbogen.gewaehlteStufe).toBeNull();
  });

  it('vergleicht mehrere Figuren; leerer Bogen hat einen Einstieg', async () => {
    ansicht();
    fireEvent.click(screen.getByRole('button', { name: '+ Figur vergleichen' }));
    fireEvent.click(screen.getByRole('option', { name: 'Ole' }));
    expect(useStore.getState().figurenbogen.vergleich).toEqual(['ole']);
    const leer = await screen.findByRole('button', { name: /Noch keine Stufen/ });
    await act(async () => {
      fireEvent.click(leer);
    });
    await waitFor(() => expect(bogenVon(useStore.getState().daten!.boegen, 'ole').stufen).toHaveLength(1));
    expect(await screen.findByRole('region', { name: 'Stufe „Neue Stufe“ bearbeiten' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ole aus dem Vergleich nehmen' }));
    expect(useStore.getState().figurenbogen.vergleich).toEqual([]);
  });
});
