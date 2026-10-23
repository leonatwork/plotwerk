import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { erstelleDemoBackend } from './demo';

function datei(pfad: string, daten: Uint8Array | Error) {
  const f = new File([], pfad.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: pfad });
  f.arrayBuffer = async () => { if (daten instanceof Error) throw daten; return daten.buffer as ArrayBuffer; };
  return f;
}

describe('Browser-Ordnerauswahl', () => {
  it('liest nur erlaubte Namen in einer Ebene, dekodiert UTF-8 streng und meldet Dateifehler', async () => {
    const spy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const versuch = erstelleDemoBackend().ordnerWaehlen();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    expect(input).toHaveAttribute('webkitdirectory');
    Object.defineProperty(input, 'files', { value: [
      datei('Import/01.MD', new TextEncoder().encode('\uFEFF# Ebbe\r\nText.')),
      datei('Import/leer.txt', new Uint8Array()),
      datei('Import/ansi.markdown', new Uint8Array([0xff])),
      datei('Import/fehler.txt', new Error('Lesefehler')),
      ...['Import/.versteckt.md', 'Import/.DS_Store', 'Import/bild.png', 'Import/unterordner/flut.md'].map((p) => datei(p, new Error('darf nicht gelesen werden'))),
    ] });
    fireEvent.change(input);
    expect(await versuch).toEqual({ name: 'Import', dateien: [
      { name: '01.MD', inhalt: '\uFEFF# Ebbe\r\nText.' },
      { name: 'leer.txt', inhalt: '' },
      { name: 'ansi.markdown', fehler: 'kodierung' },
      { name: 'fehler.txt', fehler: 'lesen' },
    ] });
    expect(input).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it('Abbruch räumt das Input auf; Ordner ohne passende Endungen ergibt eine leere Liste', async () => {
    const spy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const backend = erstelleDemoBackend();
    const abbruch = backend.ordnerWaehlen();
    fireEvent(document.querySelector('input')!, new Event('cancel'));
    expect(await abbruch).toBeNull();
    expect(document.querySelector('input')).toBeNull();
    const leer = backend.ordnerWaehlen();
    const input = document.querySelector('input')!;
    Object.defineProperty(input, 'files', { value: [datei('Import/bild.png', new Uint8Array())] });
    fireEvent.change(input);
    expect(await leer).toEqual({ name: 'Import', dateien: [] });
    spy.mockRestore();
  });
});
