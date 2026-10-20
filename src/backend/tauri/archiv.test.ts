import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryFs } from '@core/projekt';
import { erstelleArchivBackend } from './archiv';
import { aufruf } from './aufruf';
vi.mock('./aufruf', () => ({ aufruf: vi.fn() }));
const call = vi.mocked(aufruf);
beforeEach(() => call.mockReset());
it.each([' Hafenlichter ', 'Ha\u0308fenlichter', ' Ha\u0308fenlichter '])('schreibt Archive mit dem exakten Rust-Projektpräfix %j', async (projekt) => {
  call.mockImplementation(async (cmd, _args, optionen) => {
    if (cmd === 'archiv_einstellungen') return { aktiv: true };
    if (cmd === 'archiv_info') return { aktiv: true, mitVersionen: false, ort: `/Sicherungen/${projekt}`, name: projekt, namen: [], heuteGesichert: false };
    if (cmd === 'archiv_projekt_lesen') return new TextEncoder().encode('x').buffer;
    if (cmd === 'archiv_schreiben') {
      const name = decodeURIComponent(new Headers(optionen?.headers).get('plotwerk-name')!);
      // Rust verlangt den rohen Ordnernamen als Präfix, ohne NFC oder trim().
      if (!name.startsWith(`${projekt}-`)) throw new Error('Ungültiger ZIP-Name');
    }
    return undefined;
  });
  const fs = Object.assign(new MemoryFs({ 'projekt.md': 'x' }), { kennung: 1 });
  await expect(erstelleArchivBackend(() => null, () => null).sichern(fs, true)).resolves.toBeUndefined();
  expect(call.mock.calls.some(([cmd]) => cmd === 'archiv_schreiben')).toBe(true);
});
it('überspringt den heutigen erfolgreichen Tagesstand, manuell aber nicht', async () => {
  call.mockImplementation(async (cmd) => {
    if (cmd === 'archiv_einstellungen') return { aktiv: true };
    if (cmd === 'archiv_info') return { aktiv: true, mitVersionen: false, ort: '/Sicherungen', name: 'Hafenlichter', namen: [], heuteGesichert: true };
    if (cmd === 'archiv_projekt_lesen') return new TextEncoder().encode('---\ntitel: Hafenlichter\nkapitel: []\n---').buffer;
    return undefined;
  });
  const fs = Object.assign(new MemoryFs({ 'projekt.md': 'x' }), { kennung: 1 });
  const backend = erstelleArchivBackend(() => null, () => null);
  await backend.sichern(fs, true);
  expect(call.mock.calls.some(([cmd]) => cmd === 'archiv_schreiben')).toBe(false);
  await backend.sichern(fs, false);
  expect(call.mock.calls.some(([cmd]) => cmd === 'archiv_schreiben')).toBe(true);
});
it('markiert fehlgeschlagene Sicherungen nicht als erfolgreich und rotiert sie nicht', async () => {
  call.mockImplementation(async (cmd) => {
    if (cmd === 'archiv_einstellungen') return { aktiv: true };
    if (cmd === 'archiv_info') return { aktiv: true, mitVersionen: false, ort: '/Sicherungen', name: 'Hafenlichter', namen: [], heuteGesichert: false };
    if (cmd === 'archiv_projekt_lesen') return new TextEncoder().encode('x').buffer;
    if (cmd === 'archiv_schreiben') throw new Error('Permission denied');
    return undefined;
  });
  const fs = Object.assign(new MemoryFs({ 'projekt.md': 'x' }), { kennung: 1 });
  await expect(erstelleArchivBackend(() => null, () => null).sichern(fs, true)).rejects.toThrow('Permission denied');
  expect(call.mock.calls.some(([cmd]) => cmd === 'archiv_entfernen')).toBe(false);
});
it('deaktivierte Tages-Sicherung greift nicht auf den Sicherungsordner zu', async () => {
  call.mockResolvedValue({ aktiv: false });
  const fs = Object.assign(new MemoryFs(), { kennung: 1 });
  await erstelleArchivBackend(() => null, () => null).sichern(fs, true);
  expect(call.mock.calls.map(([cmd]) => cmd)).toEqual(['archiv_einstellungen']);
});
it('bindet Schreiben und Rotation an den Ort vom Anfang des Laufs', async () => {
  call.mockImplementation(async (cmd) => {
    if (cmd === 'archiv_info') return { aktiv: true, mitVersionen: false, ort: '/Sicherungen/Hafenlichter', name: 'Hafenlichter', namen: ['Hafenlichter-2026-10-20-1100.zip', 'Hafenlichter-2026-10-20-1200.zip'], heuteGesichert: false };
    if (cmd === 'archiv_projekt_lesen') return new TextEncoder().encode('x').buffer;
    return undefined;
  });
  const fs = Object.assign(new MemoryFs({ 'projekt.md': 'x' }), { kennung: 1 });
  await erstelleArchivBackend(() => null, () => null).sichern(fs, false);
  const schreiben = call.mock.calls.find(([cmd]) => cmd === 'archiv_schreiben');
  expect(schreiben?.[2]?.headers).toMatchObject({ 'plotwerk-ort': encodeURIComponent('/Sicherungen/Hafenlichter') });
  const loeschen = call.mock.calls.find(([cmd]) => cmd === 'archiv_entfernen');
  expect(loeschen?.[1]).toMatchObject({ ort: '/Sicherungen/Hafenlichter' });
});
