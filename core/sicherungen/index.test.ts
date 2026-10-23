import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { MemoryFs } from '../projekt/memoryFs';
import { archivAufbauen, archivEntpacken, dateienAuswaehlen, dateiname, projektName, zuLoeschen } from './index';

describe('externe ZIP-Sicherungen', () => {
  it('wählt das ganze Projekt, einschließlich KI-Ablagen und Bildern, ohne temporäre Dateien', () => {
    const pfade = ['projekt.md', '.plotwerk/hinweise.json', 'recherche/dateien/a.png', '.versionen/a.md', '.DS_Store', 'plan/.DS_Store', 'projekt.md.tmp', '.projekt.md.42.tmp', 'manuskript/a.md~', 'plan/notizen.md'];
    expect(dateienAuswaehlen(pfade, false)).toEqual(['.plotwerk/hinweise.json', 'plan/notizen.md', 'projekt.md', 'recherche/dateien/a.png']);
    expect(dateienAuswaehlen(pfade, true)).toContain('.versionen/a.md');
  });
  it('baut ZIPs bytegetreu gegen MemoryFs, ohne das Projekt zu verändern', async () => {
    const fs = new MemoryFs({ 'projekt.md': '---\ntitel: Hafenlichter\nkapitel: []\n---\n', '.plotwerk/hinweise.json': '{}', '.versionen/a.md': 'alt', 'leere-datei': '' });
    await fs.schreibenBinaer('recherche/dateien/a.png', new Uint8Array([0, 255, 128, 10]));
    const vorher = fs.alleDateien();
    const zip = await archivAufbauen(fs, false);
    const dateien = await archivEntpacken(zip);
    expect(Object.fromEntries(dateien.map(d => [d.pfad, [...d.daten]]))['recherche/dateien/a.png']).toEqual([0, 255, 128, 10]);
    expect(dateien.map(d => d.pfad)).toContain('.plotwerk/hinweise.json');
    expect(dateien.map(d => d.pfad)).not.toContain('.versionen/a.md');
    expect(dateien.find(d => d.pfad === 'leere-datei')?.daten).toHaveLength(0);
    expect(fs.alleDateien()).toEqual(vorher);
  });
  it('bricht bei verschwundenen Dateien ab, statt unvollständige Archive zu schreiben', async () => {
    const fs = new MemoryFs();
    fs.auflisten = async () => ['projekt.md'];
    await expect(archivAufbauen(fs, false)).rejects.toThrow();
  });
  it.each(['../a.md', '/a.md', 'C:/a.md', 'a/../b.md', 'a\\b.md'])('lehnt gefährliche ZIP-Pfade ab: %s', async pfad => {
    const zip = new JSZip().file('projekt.md', '---\ntitel: Hafenlichter\nkapitel: []\n---').file(pfad, 'x');
    await expect(archivEntpacken(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow();
  });
  it('lehnt Nicht-Projekte und beschädigte ZIPs ab', async () => {
    await expect(archivEntpacken(new Uint8Array([1, 2]))).rejects.toThrow();
    const zip = await new JSZip().file('notiz.md', 'x').generateAsync({ type: 'uint8array' });
    await expect(archivEntpacken(zip)).rejects.toThrow();
  });
  it('prüft rohe Verzeichnispfade vor der Normalisierung durch JSZip', async () => {
    const zip = new JSZip().file('projekt.md', '---\ntitel: Hafenlichter\nkapitel: []\n---');
    zip.file('a/../plan/', null, { dir: true, createFolders: false });
    await expect(archivEntpacken(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow('Unsicherer Archivpfad');
  });
  it('lehnt doppelte ZIP-Einträge ab, statt still einen Stand zu überschreiben', async () => {
    const zip = await new JSZip()
      .file('projekt.md', '---\ntitel: Hafenlichter\nkapitel: []\n---')
      .file('notizen.md', '---\ntitel: Hafenlichter\nkapitel: []\n---\nAnderer Stand')
      .generateAsync({ type: 'uint8array' });
    // Gleiche Namenslänge: Einträge in lokalen Headern und Zentralverzeichnis duplizieren.
    const vorher = new TextEncoder().encode('notizen.md');
    const nachher = new TextEncoder().encode('projekt.md');
    for (let i = 0; i <= zip.length - vorher.length; i++) {
      if (vorher.every((b, j) => zip[i + j] === b)) zip.set(nachher, i);
    }
    await expect(archivEntpacken(zip)).rejects.toThrow('Unsicherer Archivpfad');
  });
  it('prüft die entpackte Größe vor der Dekompression', async () => {
    const zip = await new JSZip().file('projekt.md', '---\ntitel: Hafenlichter\nkapitel: []\n---').generateAsync({ type: 'uint8array' });
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const zentral = zip.findIndex((_, i) => i + 4 <= zip.length && view.getUint32(i, true) === 0x02014b50);
    view.setUint32(zentral + 24, 0xffffffff, true);
    await expect(archivEntpacken(zip)).rejects.toThrow('zu groß');
  });
  it('rotiert keine Kollisionszähler außerhalb der gemeinsamen Rust-/TS-Regel', () => {
    const ungueltig = 'hafenlichter-2026-01-01-1200-4294967296.zip';
    expect(zuLoeschen(['hafenlichter-2026-01-01-1200.zip', 'hafenlichter-2026-01-01-1200-2.zip', ungueltig], 'Hafenlichter')).toEqual(['hafenlichter-2026-01-01-1200.zip']);
  });
  it('verwendet lokale Kalenderzeit und portable Namen; Kollisionen bleiben im Rotationsmuster', () => {
    expect(projektName('Hafenlichter / ÄÖü : Test')).toBe('hafenlichter-test');
    expect(projektName('...')).toBe('projekt');
    expect(dateiname('Hafenlichter', new Date(2026, 9, 23, 9, 5))).toBe('hafenlichter-2026-10-23-0905.zip');
    expect(dateiname('Hafenlichter', new Date(2026, 9, 23, 9, 5), 2)).toBe('hafenlichter-2026-10-23-0905-2.zip');
  });
  it('behält 7 neueste Tagesstände und 4 zusätzliche ISO-Wochen; fremde und ungültige Namen bleiben', () => {
    const namen = Array.from({ length: 60 }, (_, i) => dateiname('Hafenlichter', new Date(2026, 8, i + 1, 12)));
    const fremd = ['anderes-2026-09-01-1200.zip', 'notizen.txt', 'hafenlichter-2026-02-30-1200.zip', 'hafenlichter-2026-09-01-2560.zip'];
    const loeschen = zuLoeschen([...namen, ...fremd], 'Hafenlichter');
    const bleiben = namen.filter(n => !loeschen.includes(n));
    expect(bleiben).toHaveLength(11);
    expect(bleiben).toEqual(expect.arrayContaining(namen.slice(-7)));
    expect(bleiben.slice(0, 4)).toEqual(['hafenlichter-2026-10-04-1200.zip', 'hafenlichter-2026-10-11-1200.zip', 'hafenlichter-2026-10-18-1200.zip', 'hafenlichter-2026-10-23-1200.zip']);
    expect(loeschen.some(n => fremd.includes(n))).toBe(false);
  });
  it('behält pro Tag den jüngsten Stand und übersteht ISO-Jahreswechsel', () => {
    const namen = ['hafenlichter-2025-12-29-1200.zip', 'hafenlichter-2026-01-01-1200.zip', 'hafenlichter-2026-01-01-1200-2.zip'];
    expect(zuLoeschen(namen, 'Hafenlichter')).toEqual(['hafenlichter-2026-01-01-1200.zip']);
  });
  it('rotiert wöchentliche Stände korrekt über die ISO-Jahresgrenze', () => {
    const namen = Array.from({ length: 40 }, (_, i) => dateiname('Hafenlichter', new Date(2025, 11, i + 1, 12)));
    const bleiben = namen.filter(n => !zuLoeschen(namen, 'Hafenlichter').includes(n));
    expect(bleiben).toEqual(['hafenlichter-2025-12-14-1200.zip', 'hafenlichter-2025-12-21-1200.zip', 'hafenlichter-2025-12-28-1200.zip', 'hafenlichter-2026-01-02-1200.zip', ...namen.slice(-7)]);
  });
});
