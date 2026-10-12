/** G6 KI-Leser (UI): Fragen an das Buch, Leser-Simulation-Dialog, Karte im Kapitel-Überblick. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFs, PFADE } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleDemoKiTransport } from '../../backend/ki/demo';
import { useStore } from '../../state/store';
import { LeserSimulationKarte } from '../kapitel/LeserSimulationKarte';
import Ansicht from './index';
import LeserSimulationDialog from './LeserSimulationDialog';

let fs: MemoryFs;

beforeEach(async () => {
  fs = new MemoryFs(demoDateien());
  useStore.setState({ backend: { ...erstelleDemoBackend(), ki: erstelleDemoKiTransport({ verzoegerungMs: 0 }) }, dialog: null, markierung: null });
  await useStore.getState().projektLaden(fs);
  useStore.setState((s) => ({
    bereich: 'fragen',
    kileser: { ...s.kileser, entwurf: '', frageFehler: null, simFehler: null, frageHinweise: {}, simVerworfen: {}, fragenSchaetzung: null },
  }));
});

describe('Fragen an das Buch (UI)', () => {
  it('zeigt den Verlauf, beantwortet eine Frage mit Belegen und öffnet die Stelle', async () => {
    render(<Ansicht />);
    // Fixture-Verlauf
    expect(screen.getByText('Wo erwähne ich Pauls Bleistifte?')).toBeInTheDocument();
    expect(await screen.findByText(/je Frage · danach/)).toBeInTheDocument();

    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Wer ist Fiete?' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    const eintrag = await screen.findByRole('article', { name: 'Frage: Wer ist Fiete?' });
    const beleg = within(eintrag).getByRole('button', { name: /Kap\. 10 · Funkstille/ });
    expect(beleg).toHaveTextContent('ob er die Krabben wieder für Fiete mitnimmt');
    expect(within(eintrag).getByText(/1 Beleg verworfen/)).toBeInTheDocument();
    expect(feld).toHaveValue('');

    await useStore.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiFragen))!);
    expect(datei.eintraege).toHaveLength(2);
    expect(datei.eintraege[1].frage).toBe('Wer ist Fiete?');

    fireEvent.click(beleg);
    expect(useStore.getState().bereich).toBe('schreiben');
    expect(useStore.getState().markierung?.kapitel).toBe('funkstille');
  });

  it('markiert Antworten ohne Beleg', async () => {
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Wo kommt der Zeppelin vor?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fragen' }));
    const eintrag = await screen.findByRole('article', { name: 'Frage: Wo kommt der Zeppelin vor?' });
    // das Modell sagt „steht nicht im Buch“ (imBuch = false) – unterscheidbar von verworfenen Belegen
    expect(within(eintrag).getByText('nicht im Buch')).toBeInTheDocument();
    expect(useStore.getState().daten!.kiFragen!.eintraege.at(-1)!.imBuch).toBe(false);
  });

  it('lehnt Schreibaufträge lokal ab (ohne Anfrage) und lässt die Frage im Feld', async () => {
    const senden = vi.spyOn(useStore.getState().backend!.ki, 'senden');
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.change(feld, { target: { value: 'Schreib mir einen Dialog zwischen Paul und Lotte' } });
    fireEvent.keyDown(feld, { key: 'Enter' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Die KI schreibt keinen Text für das Buch');
    expect(senden).not.toHaveBeenCalled();
    await waitFor(() => expect(feld).toHaveValue('Schreib mir einen Dialog zwischen Paul und Lotte'));
  });

  it('↑ holt die letzte Frage zurück, Escape leert das Feld', () => {
    render(<Ansicht />);
    const feld = screen.getByRole('textbox', { name: 'Frage an das Buch' });
    fireEvent.keyDown(feld, { key: 'ArrowUp' });
    expect(feld).toHaveValue('Wo erwähne ich Pauls Bleistifte?');
    fireEvent.keyDown(feld, { key: 'Escape' });
    expect(feld).toHaveValue('');
  });
});

describe('Leser-Simulation (UI)', () => {
  it('Schätzung vor dem Start, dann Ergebnis mit Fragen, Wissen und Plan-Abgleich', async () => {
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    expect(await screen.findByText(/claude-sonnet-5-5 · Effort medium/)).toBeInTheDocument();
    expect(screen.getByText(/Kap\. 1–2 · 2 Kapitel mit Text · 1 Anfrage/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    expect(await screen.findByText(/claude-opus-5-5 · Effort high/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tiefencheck mit Opus/));
    await screen.findByText(/claude-sonnet-5-5/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulation starten' }));
    });
    expect(await screen.findByRole('heading', { name: 'Was weiß die Leserin nach Kap. 2?' })).toBeInTheDocument();
    expect(screen.getByText('Wer hat die Werfthalle am Nordkai gekauft?')).toBeInTheDocument();
    expect(screen.getByText(/2 Einträge verworfen/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Plan/ }));
    expect(screen.getByText('„die Vorgabe kommt vom Aufsichtsrat“')).toBeInTheDocument();
    expect(screen.getAllByText('im Text belegt').length).toBeGreaterThan(0);
    expect(screen.getByText('Pauls Bleistifte')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^Weiß/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Kap\. 2 · Fassade/ })[0]!);
    expect(schliessen).toHaveBeenCalled();
    expect(useStore.getState().markierung?.kapitel).toBe('fassade');

    await useStore.getState().alleSpeichernAbwarten();
    const datei = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(datei.eintraege.map((e: { kapitel: string }) => e.kapitel)).toEqual(['fassade', 'lotte']);
  });

  it('„Abbrechen“ beendet den Lauf: nichts gespeichert, kein Fehler, Fokus bleibt im Dialog', async () => {
    // Demo-Transport mit Wartezeit, damit der Lauf sichtbar ist; er bricht über das Signal ab
    useStore.setState((s) => ({ backend: { ...s.backend!, ki: erstelleDemoKiTransport({ verzoegerungMs: 5000 }) } }));
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    await screen.findByText(/claude-sonnet-5-5 · Effort medium/);
    const start = screen.getByRole('button', { name: 'Simulation starten' });
    start.focus();
    await act(async () => {
      fireEvent.click(start);
    });
    expect(await screen.findByRole('progressbar', { name: 'Leser-Simulation läuft' })).toBeInTheDocument();
    expect(useStore.getState().kileser.simLauf).toMatchObject({ kapitel: 'fassade' });
    // der Startknopf ist weg – der Fokus liegt trotzdem im Dialog
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    });
    expect(await screen.findByRole('button', { name: 'Simulation starten' })).toBeInTheDocument();
    expect(useStore.getState().kileser.simLauf).toBeNull();
    expect(useStore.getState().kileser.simFehler).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await useStore.getState().alleSpeichernAbwarten();
    expect(useStore.getState().daten!.kiLeser!.eintraege.map((e) => e.kapitel)).toEqual(['lotte']);
    const datei = JSON.parse((await fs.lesen(PFADE.kiLeser))!);
    expect(datei.eintraege.map((e: { kapitel: string }) => e.kapitel)).toEqual(['lotte']);
    expect(schliessen).not.toHaveBeenCalled();
  });

  it('Ergebnisseite: Fokus kommt in den Dialog, Tab bleibt drin, Escape schließt', async () => {
    const schliessen = vi.fn();
    render(<LeserSimulationDialog param={{ kapitel: 'fassade' }} schliessen={schliessen} />);
    await screen.findByText(/claude-sonnet-5-5 · Effort medium/);
    const start = screen.getByRole('button', { name: 'Simulation starten' });
    start.focus();
    expect(document.activeElement).toBe(start);
    await act(async () => {
      fireEvent.click(start);
    });
    const titel = await screen.findByRole('heading', { name: 'Was weiß die Leserin nach Kap. 2?' });
    const dialog = titel.closest('[role="dialog"]')!;
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(schliessen).toHaveBeenCalledTimes(1);
  });

  it('Karte im Kapitel-Überblick: gespeicherter Stand mit offenen Fragen, sonst Start', () => {
    const { rerender } = render(<LeserSimulationKarte kapitelId="lotte" />);
    expect(screen.getByText('LESERIN NACH KAP. 3')).toBeInTheDocument();
    expect(screen.getByText('veraltet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Was sagt Nordhaven zu Pauls Fenstern?' }));
    expect(useStore.getState().dialog).toEqual({ id: 'leser-simulation', param: { kapitel: 'lotte' } });
    rerender(<LeserSimulationKarte kapitelId="ebbe" />);
    expect(screen.getByRole('button', { name: 'Leserin simulieren …' })).toBeInTheDocument();
  });
});
