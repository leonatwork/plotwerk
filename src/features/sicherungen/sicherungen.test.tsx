import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryFs } from '@core/projekt';
import { archivAufbauen } from '@core/sicherungen';
import type { SicherungsBackend } from '../../backend/types';
import { erstelleDemoBackend } from '../../backend/demo';
import { useStore } from '../../state/store';
import { befehlAusfuehren } from '../../app/befehle';
import { Startbildschirm } from '../../app/Startbildschirm';
import { SicherungsEinstellungenAbschnitt, SicherungsHinweis } from './ui';
import { sicherungStarten, useSicherungsStatus } from './sicherung';
import { festeSprache } from '../../i18n';
import { Autosave } from '../schreiben/autosave';

let fs: MemoryFs;
let api: SicherungsBackend;
const ursprung = useStore.getState();
beforeEach(() => {
  fs = new MemoryFs({ 'projekt.md': '---\nversion: 1\ntitel: Hafenlichter\nkapitel: []\n---\n' });
  api = {
    einstellungenLesen: vi.fn().mockResolvedValue({ automatisch: true, mitVersionen: false, ordner: null }),
    einstellungenSchreiben: vi.fn().mockResolvedValue(undefined), ordnerWaehlen: vi.fn().mockResolvedValue('/Sicherungen'), standardOrdner: vi.fn().mockResolvedValue(undefined),
    projekt: () => ({ name: 'Hafenlichter', leser: fs }), auflisten: vi.fn().mockResolvedValue([]), schreiben: vi.fn().mockImplementation(async (_fs, name) => name), entfernen: vi.fn().mockResolvedValue(undefined),
    alleAuflisten: vi.fn().mockResolvedValue([]), lesen: vi.fn().mockImplementation(() => archivAufbauen(fs, false)), wiederherstellen: vi.fn().mockResolvedValue(fs),
  };
  useStore.setState({ ...ursprung, backend: { ...erstelleDemoBackend(), art: 'tauri', sicherungen: api }, fs, daten: null, fehler: null });
  useSicherungsStatus.setState({ fehler: null, fertig: false });
});
afterEach(() => { festeSprache('de'); vi.useRealTimers(); });
describe('ZIP-Auslöser und Oberfläche', () => {
  it('sichert beim Öffnen täglich nur einmal und von Hand erneut, auch in derselben Minute', async () => {
    const zeit = new Date(2026, 9, 23, 12);
    await sicherungStarten(api, fs, true, zeit);
    vi.mocked(api.auflisten).mockResolvedValue(['hafenlichter-2026-10-23-1200.zip']);
    await sicherungStarten(api, fs, true, zeit);
    await sicherungStarten(api, fs, false, zeit);
    expect(api.schreiben).toHaveBeenCalledTimes(2);
  });
  it('beachtet aus und führt manuelle Sicherungen trotzdem aus', async () => {
    vi.mocked(api.einstellungenLesen).mockResolvedValue({ automatisch: false, mitVersionen: false, ordner: null });
    await sicherungStarten(api, fs, true);
    expect(api.schreiben).not.toHaveBeenCalled();
    await sicherungStarten(api, fs, false);
    expect(api.schreiben).toHaveBeenCalledOnce();
  });
  it('startet beim Projektladen im Hintergrund; Autosave wartet nicht auf die ZIP', async () => {
    let fertig!: (name: string) => void;
    vi.mocked(api.schreiben).mockReturnValue(new Promise(resolve => { fertig = resolve; }));
    await useStore.getState().projektLaden(fs);
    expect(useStore.getState().ladeStatus).toBe('bereit');
    await waitFor(() => expect(api.schreiben).toHaveBeenCalledOnce());
    vi.useFakeTimers();
    const speichern = new Autosave(() => useStore.getState().speichereKapitel({ id: 'hafenlichter', titel: 'Hafenlichter', text: 'Neuer Stand.' }));
    try {
      speichern.aenderung();
      await vi.advanceTimersByTimeAsync(1500);
      await useStore.getState().alleSpeichernAbwarten();
      expect(await fs.lesen('manuskript/hafenlichter.md')).toContain('Neuer Stand.');
    } finally { speichern.verwerfen(); fertig('hafenlichter-2026-10-23-1200.zip'); }
  });
  it('rotiert nie nach fehlgeschlagenem Schreiben und meldet den Grund ohne Speicherfehler', async () => {
    vi.mocked(api.schreiben).mockRejectedValue(new Error('Permission denied'));
    await sicherungStarten(api, fs, false);
    expect(api.entfernen).not.toHaveBeenCalled();
    render(<SicherungsHinweis />);
    expect(screen.getByRole('alert')).toHaveTextContent('Permission denied');
    expect(useStore.getState().speichern.fehler).toBeNull();
  });
  it('zeigt Fehler und den fortgesetzten Autosave auch auf Englisch', async () => {
    festeSprache('en');
    vi.mocked(api.schreiben).mockRejectedValue(new Error('Permission denied'));
    await sicherungStarten(api, fs, false);
    render(<SicherungsHinweis />);
    expect(screen.getByRole('alert')).toHaveTextContent('Backup failed: Permission denied. Writing and autosave continue.');
  });
  it('öffnet bei beschädigter Sicherung keinen Zielordner und kein Projekt', async () => {
    vi.mocked(api.alleAuflisten).mockResolvedValue([{ ordner: '/Sicherungen', name: 'hafenlichter-2026-10-23-1200.zip' }]);
    vi.mocked(api.lesen).mockResolvedValue(new Uint8Array([0, 1]));
    render(<Startbildschirm />);
    fireEvent.click(screen.getByRole('button', { name: 'Sicherung wiederherstellen …' }));
    fireEvent.click(await screen.findByRole('button', { name: 'hafenlichter-2026-10-23-1200.zip' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.wiederherstellen).not.toHaveBeenCalled();
  });
  it('führt den Menübefehl nach dem Speichern sofort aus', async () => {
    useStore.setState({ daten: { projekt: { titel: 'Hafenlichter', kapitel: [] } } as never, editorSichern: vi.fn().mockResolvedValue(undefined), alleSpeichernAbwarten: vi.fn().mockResolvedValue(undefined) });
    await befehlAusfuehren('projekt-sichern');
    expect(api.schreiben).toHaveBeenCalledOnce();
  });
  it('zeigt und speichert Einstellungen über das Backend', async () => {
    render(<SicherungsEinstellungenAbschnitt />);
    const checkbox = await screen.findByLabelText('Täglich beim ersten Öffnen sichern');
    fireEvent.click(checkbox);
    await waitFor(() => expect(api.einstellungenSchreiben).toHaveBeenCalledWith({ automatisch: false, mitVersionen: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Ordner wählen …' }));
    await waitFor(() => expect(api.ordnerWaehlen).toHaveBeenCalledOnce());
  });
  it('weist bei leerer Sicherungsliste auf den leeren Zustand hin', async () => {
    render(<Startbildschirm />);
    fireEvent.click(screen.getByRole('button', { name: 'Sicherung wiederherstellen …' }));
    expect(await screen.findByText('Noch keine Sicherungen vorhanden.')).toBeInTheDocument();
  });
  it('entpackt eine gewählte Sicherung und öffnet das vom Backend gelieferte neue Projekt', async () => {
    vi.mocked(api.alleAuflisten).mockResolvedValue([{ ordner: '/Sicherungen/hafenlichter', name: 'hafenlichter-2026-10-23-1200.zip' }]);
    const laden = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ projektLaden: laden });
    render(<Startbildschirm />);
    fireEvent.click(screen.getByRole('button', { name: 'Sicherung wiederherstellen …' }));
    fireEvent.click(await screen.findByRole('button', { name: 'hafenlichter-2026-10-23-1200.zip' }));
    await waitFor(() => expect(laden).toHaveBeenCalledWith(fs));
    expect(api.wiederherstellen).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ pfad: 'projekt.md' })]));
  });
  it('blendet Sicherung und Einstellungen in der Browser-Demo aus', () => {
    useStore.setState({ backend: { ...useStore.getState().backend!, art: 'demo', sicherungen: undefined } });
    render(<><Startbildschirm /><SicherungsEinstellungenAbschnitt /></>);
    expect(screen.queryByText('Sicherung wiederherstellen …')).not.toBeInTheDocument();
    expect(screen.queryByText('Automatische Sicherung')).not.toBeInTheDocument();
  });
});
