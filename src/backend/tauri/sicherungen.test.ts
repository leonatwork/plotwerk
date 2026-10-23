import JSZip from 'jszip';
import { archivAufbauen } from '@core/sicherungen';
import { demoFs } from '../../../fixtures/demoProjekt';
import { TauriFs } from './tauriFs';
import { erstelleSicherungsBackend } from './sicherungen';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
const info = { kennung: 7, pfad: '/Projekte/Hafenlichter', name: 'Hafenlichter' };
beforeEach(() => mocks.invoke.mockReset());

it('sichert Rohbytes über den engen Lesebefehl und schreibt mit Projektkennung', async () => {
  const api = erstelleSicherungsBackend(() => null);
  const fs = new TauriFs(info);
  const bytes = new Uint8Array([239, 187, 191, 65, 255]);
  mocks.invoke.mockResolvedValue(bytes.buffer);
  expect(await api.leser!(fs).lesenBinaer!('unbekannt.bin')).toEqual(bytes);
  expect(mocks.invoke).toHaveBeenCalledWith('sicherung_projekt_lesen', { kennung: 7, pfad: 'unbekannt.bin' }, undefined);
  await api.schreiben(fs, 'Hafenlichter-2026-10-20-0905.zip', bytes);
  expect(mocks.invoke).toHaveBeenLastCalledWith('sicherung_schreiben', bytes, { headers: { 'plotwerk-kennung': '7', 'plotwerk-name': 'Hafenlichter-2026-10-20-0905.zip' } });
});

it('stellt einschließlich Recherche-Bild bytegetreu in den nativen Zielordner wieder her', async () => {
  const fs = demoFs();
  const bild = new Uint8Array([0, 128, 255]);
  await fs.schreibenBinaer('recherche/dateien/bild.png', bild);
  const zip = await archivAufbauen(fs, true);
  const uebernehmen = vi.fn((i) => new TauriFs(i));
  mocks.invoke.mockImplementation(async (cmd: string) => cmd === 'sicherung_lesen' ? zip.buffer : cmd === 'sicherung_wiederherstellen' ? info : null);
  const api = erstelleSicherungsBackend(uebernehmen);
  expect(await api.wiederherstellen({ name: 'Archiv.zip', pfad: '/Sicherungen/Archiv.zip' })).toBeInstanceOf(TauriFs);
  const args = mocks.invoke.mock.calls.find(([cmd]) => cmd === 'sicherung_wiederherstellen')![1];
  expect(args.dateien.find((d: { pfad: string }) => d.pfad === 'recherche/dateien/bild.png').daten).toEqual([0, 128, 255]);
  expect(args.dateien).toHaveLength((await fs.auflisten('')).length);
  expect(uebernehmen).toHaveBeenCalledWith(info);
});

it('öffnet bei ungültigem ZIP oder Dialogabbruch keinen Zielordner', async () => {
  const api = erstelleSicherungsBackend(() => null);
  mocks.invoke.mockResolvedValue(null);
  expect(await api.wiederherstellen(null)).toBeNull();
  expect(mocks.invoke).not.toHaveBeenCalledWith('sicherung_wiederherstellen', expect.anything(), undefined);
  const zip = await new JSZip().file('projekt.md', 'x').file('../fremd', 'x').generateAsync({ type: 'uint8array' });
  mocks.invoke.mockImplementation(async (cmd: string) => cmd === 'sicherung_zip_waehlen' ? '/Archiv.zip' : zip.buffer);
  await expect(api.wiederherstellen(null)).rejects.toThrow('archive path');
  expect(mocks.invoke.mock.calls.some(([cmd]) => cmd === 'sicherung_wiederherstellen')).toBe(false);
});
