import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { demoFs } from '../../../fixtures/demoProjekt';
import { erstelleDemoBackend } from '../../backend/demo';
import { erstelleStore, useStore } from '../../state/store';
import { befehlAusfuehren } from '../../app/befehle';
import { Startbildschirm } from '../../app/Startbildschirm';
import { SicherungsEinstellungen } from './Einstellungen';
import type { SicherungsBackend } from '../../backend/types';
import { sichereProjekt } from './ablauf';
import { festeSprache } from '../../i18n';
import JSZip from 'jszip';

function backend() {
  const sicherungen: SicherungsBackend = {
    einstellungen: vi.fn(async () => ({ aktiv: true, mitVersionen: false, ordner: null })),
    einstellen: vi.fn(async () => {}),
    ordnerWaehlen: vi.fn(async () => '/Sicherungen'),
    auflisten: vi.fn(async () => []),
    schreiben: vi.fn(async () => {}),
    entfernen: vi.fn(async () => {}),
    wiederherstellen: vi.fn(async () => demoFs()),
  };
  return { ...erstelleDemoBackend(), art: 'tauri' as const, sicherungen };
}

afterEach(() => festeSprache('de'));

it('öffnet täglich automatisch, manuell auch erneut, ohne Beenden-Callback oder Projektänderung', async () => {
  const b = backend();
  const fs = demoFs();
  const vorher = fs.alleDateien();
  const store = erstelleStore();
  store.setState({ backend: b });
  await store.getState().projektLaden(fs);
  await waitFor(() => expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(1));
  const name = vi.mocked(b.sicherungen.schreiben).mock.calls[0]![1];
  vi.mocked(b.sicherungen.auflisten).mockResolvedValue([{ name, pfad: '/Sicherungen/' + name }]);
  await sichereProjekt(b, fs, 'Hafenlichter', false);
  expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(1);
  useStore.setState({ backend: b, fs, daten: store.getState().daten });
  await befehlAusfuehren('projekt-archiv');
  expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(2);
  expect(fs.alleDateien()).toEqual(vorher);
});

it('überspringt ausgeschaltete Automatik, manuelle Sicherung bleibt verfügbar', async () => {
  const b = backend();
  vi.mocked(b.sicherungen.einstellungen).mockResolvedValue({ aktiv: false, mitVersionen: true, ordner: null });
  const fs = demoFs();
  await sichereProjekt(b, fs, 'Hafenlichter', false);
  expect(b.sicherungen.schreiben).not.toHaveBeenCalled();
  await sichereProjekt(b, fs, 'Hafenlichter', true);
  expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(1);
});

it('wartet beim Laden nicht auf eine hängende Sicherung und kann weiter speichern', async () => {
  const b = backend();
  let fertig!: () => void;
  vi.mocked(b.sicherungen.schreiben).mockImplementation(() => new Promise<void>((ok) => { fertig = ok; }));
  const store = erstelleStore();
  store.setState({ backend: b });
  await store.getState().projektLaden(demoFs());
  await waitFor(() => expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(1));
  expect(store.getState().ladeStatus).toBe('bereit');
  await store.getState().alleSpeichernAbwarten();
  fertig();
});

it.each([false, true])('sichert erst nach der E8-Aufbewahrung, auch bei Aufräumfehler (%s)', async (fehler) => {
  const b = backend();
  vi.mocked(b.sicherungen.einstellungen).mockResolvedValue({ aktiv: true, mitVersionen: true, ordner: null });
  const fs = demoFs();
  const alt = '.versionen/manuskript/ebbe.md/2020-01-06T09-00-00.md';
  const neu = '.versionen/manuskript/ebbe.md/2020-01-07T09-00-00.md';
  await fs.schreiben(alt, 'Älterer Stand');
  await fs.schreiben(neu, 'Wochenstand');
  let freigeben!: () => void;
  const warten = new Promise<void>((ok) => { freigeben = ok; });
  const entfernen = fs.entfernen.bind(fs);
  const loeschen = vi.spyOn(fs, 'entfernen').mockImplementation(async (pfad) => {
    await warten;
    if (fehler) throw new Error('EACCES');
    await entfernen(pfad);
  });
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = erstelleStore();
  store.setState({ backend: b });
  try {
    await store.getState().projektLaden(fs);
    await waitFor(() => expect(loeschen).toHaveBeenCalledWith(alt));
    expect(store.getState().ladeStatus).toBe('bereit');
    expect(b.sicherungen.einstellungen).not.toHaveBeenCalled();
    await store.getState().alleSpeichernAbwarten();
    freigeben();
    await waitFor(() => expect(b.sicherungen.schreiben).toHaveBeenCalledTimes(1));
    const zip = await JSZip.loadAsync(vi.mocked(b.sicherungen.schreiben).mock.calls[0]![2]);
    expect(zip.file(alt) !== null).toBe(fehler);
    expect(await zip.file(neu)!.async('string')).toBe('Wochenstand');
    expect(store.getState().sicherungsHinweis).toBeNull();
    expect(warnung).toHaveBeenCalledTimes(fehler ? 1 : 0);
  } finally {
    freigeben();
    warnung.mockRestore();
  }
});

it.each(['de', 'en'] as const)('zeigt Sicherungsfehler mit Grund (%s) und lässt den Store schreibbereit', async (sprache) => {
  festeSprache(sprache);
  const b = backend();
  vi.mocked(b.sicherungen.schreiben).mockRejectedValue(new Error('EACCES'));
  const store = erstelleStore();
  store.setState({ backend: b });
  await store.getState().projektLaden(demoFs());
  await waitFor(() => expect(store.getState().sicherungsHinweis).toContain('EACCES'));
  expect(store.getState().sicherungsHinweis).toContain(sprache === 'de' ? 'Sicherung' : 'Backup');
  expect(store.getState().ladeStatus).toBe('bereit');
  expect(store.getState().speichern.fehler).toBeNull();
  await store.getState().speichereKapitel({ ...store.getState().daten!.kapitel[store.getState().daten!.projekt.kapitel[0]!]!, text: 'Neu' });
  expect(store.getState().speichern.fehler).toBeNull();
});

it('speichert App-Einstellungen und wählt den Ort über das Backend; Demo blendet sie aus', async () => {
  const b = backend();
  useStore.setState({ backend: b });
  const { unmount } = render(<SicherungsEinstellungen />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Automatisch täglich sichern' }));
  await waitFor(() => expect(b.sicherungen.einstellen).toHaveBeenCalledWith({ aktiv: false, mitVersionen: false, ordner: null }));
  await user.click(screen.getByRole('button', { name: 'Ordner wählen …' }));
  expect(await screen.findByText('/Sicherungen')).toBeInTheDocument();
  unmount();
  useStore.setState({ backend: erstelleDemoBackend() });
  render(<SicherungsEinstellungen />);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('zeigt die leere Wiederherstellungsliste und öffnet einen wiederhergestellten Stand', async () => {
  const b = backend();
  useStore.setState({ backend: b, daten: null, fehler: null });
  render(<Startbildschirm />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Sicherung wiederherstellen …' }));
  expect(await screen.findByText('Noch keine Sicherungen vorhanden.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ZIP-Datei wählen …' }));
  await waitFor(() => expect(useStore.getState().ladeStatus).toBe('bereit'));
  expect(b.sicherungen.wiederherstellen).toHaveBeenCalledWith(null);
});
