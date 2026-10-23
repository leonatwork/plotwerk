import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { erstelleDemoBackend } from './demo';

describe('Browser-Ordnerauswahl', () => {
  it('filtert eine Ebene und dekodiert streng UTF-8, ohne einzelne Fehler zu verschlucken', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const auswahl = erstelleDemoBackend().ordnerWaehlen();
    const input = document.querySelector('input[webkitdirectory]')!;
    const datei = (pfad: string, bytes: number[] | string, fehler = false) => ({
      name: pfad.split('/').pop()!, webkitRelativePath: pfad,
      arrayBuffer: async () => {
        if (fehler) throw new Error('Lesefehler');
        return typeof bytes === 'string' ? new TextEncoder().encode(bytes).buffer : new Uint8Array(bytes).buffer;
      },
    });
    fireEvent.change(input, { target: { files: [
      datei('Hafenlichter/01-ebbe.MD', '\uFEFF# Ebbe\r\n'),
      datei('Hafenlichter/02-flut.txt', [255]),
      datei('Hafenlichter/03-lotte.markdown', '', true),
      datei('Hafenlichter/.DS_Store', ''), datei('Hafenlichter/.lotte.md', ''),
      datei('Hafenlichter/flut.docx', ''), datei('Hafenlichter/unter/ebbe.md', ''),
    ] } });
    expect(await auswahl).toEqual({ name: 'Hafenlichter', dateien: [
      { name: '01-ebbe.MD', inhalt: '# Ebbe\r\n' },
      { name: '02-flut.txt', fehler: 'kodierung' },
      { name: '03-lotte.markdown', fehler: 'lesen' },
    ] });
    expect(input).not.toBeInTheDocument();
  });

  it('liefert einen leeren gefilterten Ordner und null bei Abbruch', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const backend = erstelleDemoBackend();
    const leer = backend.ordnerWaehlen();
    fireEvent.change(document.querySelector('input[webkitdirectory]')!, { target: { files: [{ name: 'flut.docx', webkitRelativePath: 'Hafenlichter/flut.docx' }] } });
    expect(await leer).toEqual({ name: 'Hafenlichter', dateien: [] });
    const abbruch = backend.ordnerWaehlen();
    fireEvent(document.querySelector('input[webkitdirectory]')!, new Event('cancel'));
    expect(await abbruch).toBeNull();
  });
});
