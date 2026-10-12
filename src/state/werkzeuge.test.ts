/** Store: speichereX-Aktionen und Slices der Werkzeuge G1–G8. */
import { describe, expect, it } from 'vitest';
import { PFADE, parseMarken, parseStatistik, parseZeitleiste } from '@core/projekt';
import { demoFs } from '../../fixtures/demoProjekt';
import { erstelleStore } from './store';

async function geladen() {
  const store = erstelleStore();
  const fs = demoFs();
  await store.getState().projektLaden(fs);
  return { store, fs };
}

describe('Store – Werkzeuge', () => {
  it('Slices haben eigene Namensräume mit Startwerten', () => {
    const s = erstelleStore().getState();
    for (const n of ['zeit', 'struktur', 'figurenbogen', 'editorwerkzeuge', 'statistik', 'kileser', 'abgabe', 'recherche'] as const) expect(s[n]).toBeTypeOf('object');
    expect(s.struktur.akteDarstellung).toBe('board');
    expect(s.figurenbogen.figurenAnsicht).toBe('karte');
    expect(s.editorwerkzeuge).toMatchObject({ typewriter: false, wiederholungen: false, vorlesen: 'aus' });
  });

  it('Umschalter der Slices', () => {
    const store = erstelleStore();
    store.getState().struktur.setzeAkteDarstellung('straenge');
    store.getState().figurenbogen.setzeFigurenAnsicht('boegen');
    store.getState().editorwerkzeuge.umschalteTypewriter();
    store.getState().editorwerkzeuge.setzeVorlesen('laeuft');
    const s = store.getState();
    expect([s.struktur.akteDarstellung, s.figurenbogen.figurenAnsicht, s.editorwerkzeuge.typewriter, s.editorwerkzeuge.vorlesen]).toEqual(['straenge', 'boegen', true, 'laeuft']);
  });

  it('speichereX aktualisiert daten sofort und schreibt die Datei', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    const z = s.daten!.zeitleiste!;
    await s.speichereZeitleiste({ ...z, zustandsarten: [...z.zustandsarten, { id: 'muede', name: 'müde', farbe: 'ink-quiet' }] });
    expect(store.getState().daten!.zeitleiste!.zustandsarten.at(-1)?.id).toBe('muede');
    expect(parseZeitleiste((await fs.lesen(PFADE.zeitleiste))!).zustandsarten.at(-1)?.name).toBe('müde');

    await s.speichereStatistik({ ...s.daten!.statistik!, ziel: { tagWoerter: 1000 } });
    expect(parseStatistik((await fs.lesen(PFADE.statistik))!).ziel).toEqual({ tagWoerter: 1000 });
    await s.speichereMarken({ marken: [], ignoriert: ['Kiel'] });
    expect(parseMarken((await fs.lesen(PFADE.marken))!)).toEqual({ marken: [], ignoriert: ['Kiel'] });

    // KI-Ablage, die es noch nicht gab
    await fs.entfernen(PFADE.kiStimmen);
    await s.speichereKiStimmen({ version: 1, eintraege: [] });
    expect(JSON.parse((await fs.lesen(PFADE.kiStimmen))!)).toEqual({ version: 1, eintraege: [] });
    expect(store.getState().speichern.fehler).toBeNull();
  });

  it('Binärdateien nur unter recherche/, Entfernen mit Schnappschuss', async () => {
    const { store, fs } = await geladen();
    const s = store.getState();
    const bytes = new Uint8Array([1, 2, 3, 0, 255]);
    await s.speichereBinaerDatei('recherche/dateien/foto.png', bytes);
    expect(await s.leseBinaerDatei('recherche/dateien/foto.png')).toEqual(bytes);
    expect(new TextDecoder().decode((await s.leseBinaerDatei('recherche/dateien/lindenhof.svg'))!)).toMatch(/^<svg/);
    await expect(s.speichereBinaerDatei('manuskript/lotte.md', bytes)).rejects.toThrow('recherche/');
    await s.entferneBinaerDatei('recherche/dateien/foto.png');
    expect(await s.leseBinaerDatei('recherche/dateien/foto.png')).toBeNull();
    expect((await fs.auflisten('.versionen/recherche')).length).toBe(1);
  });

  it('Aufbewahrung lässt Schnappschüsse benannter Fassungen stehen', async () => {
    const fs = demoFs();
    const alt = '.versionen/manuskript/grundriss.md/2020-01-06T10-00-00.md';
    const alt2 = '.versionen/manuskript/grundriss.md/2020-01-07T10-00-00.md';
    const weg = '.versionen/manuskript/grundriss.md/2020-01-06T09-00-00.md';
    await fs.schreiben(weg, 'weg');
    await fs.schreiben(alt, 'alt');
    await fs.schreiben(alt2, 'alt2');
    await fs.schreiben(PFADE.fassungen, JSON.stringify([{ id: 'f', name: 'F', datum: '2020-01-06', dateien: [{ pfad: 'manuskript/grundriss.md', version: alt }] }]));
    const store = erstelleStore();
    await store.getState().projektLaden(fs);
    for (let i = 0; i < 50 && (await fs.existiert(weg)); i++) await new Promise((r) => setTimeout(r, 10));
    expect(await fs.existiert(weg)).toBe(false);
    // gleiche ISO-Woche: ohne Schutz bliebe nur der neuere
    expect(await fs.existiert(alt)).toBe(true);
    expect(await fs.existiert(alt2)).toBe(true);
  });
});
