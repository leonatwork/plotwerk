import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryFs } from '@core/projekt';
import { useStore } from '../../state/store';
import { erstelleDemoBackend } from '../../backend/demo';
import { befehlAusfuehren } from '../../app/befehle';
import { SicherungenEinstellungen, WiederherstellenDialog } from './ui';
import { sichereProjekt } from './dienst';
import { festeSprache } from '../../i18n';

const fs = new MemoryFs({ 'projekt.md': '---\ntitel: Hafenlichter\nkapitel: []\n---\n' });
const archiv = {
  einstellungen: vi.fn().mockResolvedValue({ aktiv: true, mitVersionen: false, ort: null }),
  einstellen: vi.fn().mockResolvedValue(undefined),
  ortWaehlen: vi.fn().mockResolvedValue('/Sicherungen'),
  sichern: vi.fn().mockResolvedValue(undefined),
  auflisten: vi.fn().mockResolvedValue([]),
  wiederherstellen: vi.fn().mockResolvedValue(fs),
};

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ backend: { ...erstelleDemoBackend(), art: 'tauri', archiv }, fs, fehler: null });
});

describe('Sicherung UI und Auslöser', () => {
  it('Menübefehl sichert sofort von Hand, auch mehrfach', async () => {
    await useStore.getState().projektLaden(fs);
    await waitFor(() => expect(archiv.sichern).toHaveBeenCalled());
    archiv.sichern.mockClear();
    await befehlAusfuehren('projekt-archiv');
    await befehlAusfuehren('projekt-archiv');
    expect(archiv.sichern.mock.calls.map((c) => c[1])).toEqual([false, false]);
  });
  it('Projektladen startet die Tagesprüfung ohne das Öffnen zu blockieren', async () => {
    archiv.sichern.mockImplementationOnce(() => new Promise(() => {}));
    await useStore.getState().projektLaden(fs);
    await waitFor(() => expect(archiv.sichern).toHaveBeenCalledWith(fs, true));
    expect(useStore.getState().ladeStatus).toBe('bereit');
  });
  it('Fehlerhinweis lässt den Editor schreibfähig', async () => {
    archiv.sichern.mockRejectedValueOnce(new Error('Permission denied'));
    await sichereProjekt(false);
    expect(useStore.getState().fehler).toContain('Permission denied');
    await fs.schreiben('notiz.md', 'Notiz');
    expect(await fs.lesen('notiz.md')).toBe('Notiz');
  });
  it('Fehlerhinweis ist auch auf Englisch verfügbar', async () => {
    festeSprache('en');
    try {
      archiv.sichern.mockRejectedValueOnce(new Error('Permission denied'));
      await sichereProjekt(false);
      expect(useStore.getState().fehler).toBe('Backup failed: Permission denied. Writing and autosave continue.');
    } finally { festeSprache('de'); }
  });
  it('Einstellungen speichern an/aus, Versionen und Dialogort als App-Einstellung', async () => {
    render(<SicherungenEinstellungen />);
    const aktiv = await screen.findByLabelText('Automatisch täglich sichern');
    fireEvent.click(aktiv);
    await waitFor(() => expect(archiv.einstellen).toHaveBeenCalledWith({ aktiv: false, mitVersionen: false, ort: null }));
    fireEvent.click(screen.getByLabelText('Schnappschüsse (.versionen) mitsichern'));
    await waitFor(() => expect(archiv.einstellen).toHaveBeenLastCalledWith({ aktiv: false, mitVersionen: true, ort: null }));
    fireEvent.click(screen.getByText('Ordner wählen …'));
    await waitFor(() => expect(screen.getByText('/Sicherungen')).toBeInTheDocument());
  });
  it('leere Liste zeigt einen Hinweis und lässt ein ZIP aus einem anderen Ort wählen', async () => {
    render(<WiederherstellenDialog onSchliessen={() => {}} />);
    expect(await screen.findByText('Noch keine Sicherungen vorhanden.')).toBeInTheDocument();
    expect(screen.getByText('ZIP-Datei wählen …')).toBeInTheDocument();
  });
  it('gewählte Sicherung wird in einen neuen Ordner wiederhergestellt und geladen', async () => {
    archiv.auflisten.mockResolvedValueOnce([{ ordner: '/Sicherungen', name: 'Hafenlichter-2026-10-20-1200.zip' }]);
    const laden = vi.spyOn(useStore.getState(), 'projektLaden');
    render(<WiederherstellenDialog onSchliessen={() => {}} />);
    fireEvent.click(await screen.findByText('Hafenlichter-2026-10-20-1200.zip'));
    await waitFor(() => expect(archiv.wiederherstellen).toHaveBeenCalledWith({ ordner: '/Sicherungen', name: 'Hafenlichter-2026-10-20-1200.zip' }));
    await waitFor(() => expect(laden).toHaveBeenCalledWith(fs));
    laden.mockRestore();
  });
  it('blendet Einstellungen in der Browser-Demo aus', () => {
    useStore.setState({ backend: erstelleDemoBackend() });
    render(<SicherungenEinstellungen />);
    expect(screen.queryByText('Sicherungen')).not.toBeInTheDocument();
  });
});
