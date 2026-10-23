import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_DARSTELLUNG } from '@core/darstellung';
import { initialisiereDarstellung, setzeDarstellung, useDarstellungsStore, skaliereOberflaeche } from './darstellung';

const mocks = vi.hoisted(() => ({ tauri: false, aufruf: vi.fn() }));
vi.mock('../backend', () => ({ istTauri: () => mocks.tauri }));
vi.mock('../backend/tauri/aufruf', () => ({ aufruf: mocks.aufruf }));

beforeEach(() => {
  mocks.tauri = false;
  mocks.aufruf.mockReset();
  localStorage.clear();
  useDarstellungsStore.setState({ werte: { ...STANDARD_DARSTELLUNG } });
});

describe('Darstellung laden und speichern', () => {
  it('speichert im Browser und lädt nach simuliertem Neustart', async () => {
    const werte = { schriftgroesse: 20, zeilenbreite: 700, zeilenhoehe: 1.8, skalierung: 1.2 };
    await setzeDarstellung(werte);
    expect(JSON.parse(localStorage.getItem('plotwerk:darstellung')!)).toEqual(werte);
    useDarstellungsStore.setState({ werte: { ...STANDARD_DARSTELLUNG } });
    await initialisiereDarstellung();
    expect(useDarstellungsStore.getState().werte).toEqual(werte);
    expect(document.body.style.getPropertyValue('--ui-skalierung')).toBe('1.2');
    expect(mocks.aufruf).not.toHaveBeenCalled();
  });
  it.each(['{kaputt', 'null', '{"schriftgroesse":99,"zeilenbreite":"600","zeilenhoehe":0,"skalierung":100}'])('beschädigtes Browser-JSON: %s', async (roh) => {
    localStorage.setItem('plotwerk:darstellung', roh);
    await initialisiereDarstellung();
    expect(useDarstellungsStore.getState().werte).toEqual(STANDARD_DARSTELLUNG);
  });
  it('nutzt ausschließlich App-Kommandos in Tauri, validiert und lädt erneut', async () => {
    mocks.tauri = true;
    let gespeichert: unknown = { schriftgroesse: 20, zeilenbreite: -1, zeilenhoehe: 1.8 };
    mocks.aufruf.mockImplementation(async (kommando, args) => {
      if (kommando === 'einstellung_lesen') return gespeichert;
      gespeichert = args.wert;
    });
    await initialisiereDarstellung();
    expect(useDarstellungsStore.getState().werte).toEqual({ ...STANDARD_DARSTELLUNG, schriftgroesse: 20, zeilenhoehe: 1.8 });
    await setzeDarstellung({ zeilenbreite: 800 });
    await initialisiereDarstellung();
    expect(useDarstellungsStore.getState().werte.zeilenbreite).toBe(800);
    expect(mocks.aufruf.mock.calls.map(([kommando]) => kommando)).toEqual(['einstellung_lesen', 'einstellung_schreiben', 'einstellung_lesen']);
    expect(mocks.aufruf).toHaveBeenCalledWith('einstellung_schreiben', { schluessel: 'darstellung', wert: gespeichert });
    expect(localStorage.length).toBe(0);
  });
  it('begrenzt Zoom und setzt sämtliche Werte zurück', async () => {
    for (let i = 0; i < 30; i++) await skaliereOberflaeche(1);
    expect(useDarstellungsStore.getState().werte.skalierung).toBe(1.5);
    for (let i = 0; i < 30; i++) await skaliereOberflaeche(-1);
    expect(useDarstellungsStore.getState().werte.skalierung).toBe(0.8);
    await setzeDarstellung({ ...STANDARD_DARSTELLUNG });
    expect(useDarstellungsStore.getState().werte).toEqual(STANDARD_DARSTELLUNG);
  });
});
