import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { MemoryFs } from '../projekt/memoryFs';
import { archivDateien, baueArchiv, archivName, archivZeit, rotation, entpackeArchiv } from './index';

describe('externe Projektsicherungen', () => {
  it('sichert alle Dateien inklusive KI, unbekannter Dateien und binärer Recherche unverändert', async () => {
    const fs = new MemoryFs({ 'projekt.md': '---\ntitel: Hafenlichter\nkapitel: []\n---\n', '.plotwerk/hinweise.json': '[]', 'extras/notizen.txt': 'Notiz', '.versionen/manuskript/a/2026.md': 'alt', '.DS_Store': 'x', 'manuskript/.a.md.plotwerk-1-2.tmp': 'x', 'extras/a.tmp': 'x' });
    await fs.schreibenBinaer('recherche/dateien/bild.png', new Uint8Array([0, 255, 128]));
    const vorher = fs.alleDateien();
    const schreiben = vi.spyOn(fs, 'schreiben');
    const daten = await baueArchiv(fs, false);
    const zip = await JSZip.loadAsync(daten);
    expect(Object.keys(zip.files).filter((p) => !zip.files[p]!.dir).sort()).toEqual(['.plotwerk/hinweise.json', 'extras/notizen.txt', 'projekt.md', 'recherche/dateien/bild.png']);
    expect(await zip.file('recherche/dateien/bild.png')!.async('uint8array')).toEqual(new Uint8Array([0, 255, 128]));
    expect(fs.alleDateien()).toEqual(vorher);
    expect(schreiben).not.toHaveBeenCalled();
    expect(archivDateien(Object.keys(vorher), true)).toContain('.versionen/manuskript/a/2026.md');
    expect(await entpackeArchiv(daten)).toEqual(expect.arrayContaining([{ pfad: 'recherche/dateien/bild.png', daten: [0, 255, 128] }]));
  });

  it('verwirft unsichere Pfade und Archive ohne projekt.md', async () => {
    expect(() => archivDateien(['../privat.md'], true)).toThrow();
    const zip = new JSZip().file('../projekt.md', 'x');
    await expect(entpackeArchiv(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow();
    await expect(entpackeArchiv(await new JSZip().file('notiz.md', 'x').generateAsync({ type: 'uint8array' }))).rejects.toThrow();
  });

  it('liefert lokale Datumsnamen und überschreibt auch in derselben Minute keinen Stand', () => {
    const zeit = new Date(2026, 9, 20, 12, 34);
    expect(archivName('Hafenlichter', zeit, [])).toBe('Hafenlichter-2026-10-20-1234.zip');
    expect(archivName('Hafenlichter', zeit, ['Hafenlichter-2026-10-20-1234.zip'])).toBe('Hafenlichter-2026-10-20-1235.zip');
    expect(archivName('../Hafen:lichter', zeit, [])).not.toMatch(/[/:\\]/);
  });

  it.each([' Hafenlichter ', 'Ha\u0308fenlichter', ' Ha\u0308fenlichter '])('behält den von Rust geprüften Ordnernamen %j exakt bei', (projekt) => {
    const zeit = new Date(2026, 9, 20, 12, 34);
    const name = `${projekt}-2026-10-20-1234.zip`;
    const folge = `${projekt}-2026-10-20-1235.zip`;
    expect(archivName(projekt, zeit, [])).toBe(name);
    expect(archivName(projekt, zeit, [name])).toBe(folge);
    expect(archivZeit(name, projekt)).toEqual(zeit);
    const fremd = `${projekt.normalize('NFC').trim()}-2026-10-20-1100.zip`;
    expect(archivZeit(fremd, projekt)).toBeNull();
    expect(rotation([name, folge, fremd], projekt)).toEqual([name]);
  });

  it('behält sieben verschiedene Tagesstände und vier ältere ISO-Wochen, nur eigene gültige ZIPs', () => {
    const namen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map((tag) => `Hafenlichter-2026-09-${String(tag).padStart(2, '0')}-1200.zip`);
    const fremd = ['anders-2026-09-01-1200.zip', 'Notiz.txt', 'Hafenlichter-2026-02-30-1200.zip'];
    const loeschen = rotation([...namen, ...fremd, 'Hafenlichter-2026-09-30-1100.zip'], 'Hafenlichter');
    expect(loeschen).not.toEqual(expect.arrayContaining(fremd));
    const behalten = namen.filter((n) => !loeschen.includes(n));
    expect(behalten).toEqual([6, 13, 20, 23, 24, 25, 26, 27, 28, 29, 30].map((tag) => `Hafenlichter-2026-09-${String(tag).padStart(2, '0')}-1200.zip`));
    expect(loeschen).toContain('Hafenlichter-2026-09-30-1100.zip');
  });
});
