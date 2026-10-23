import JSZip from 'jszip';
import { MemoryFs } from '../projekt/memoryFs';
import { archivAufbauen, archivLesen, dateiAuswahl, sicherungsName, rotation } from './index';

describe('Externe Projektsicherung', () => {
  it('sichert Metadaten und Bilder bytegetreu ohne Schreibzugriff und schließt temporäre Dateien aus', async () => {
    const fs = new MemoryFs({ 'projekt.md': 'Hafenlichter', '.plotwerk/hinweise.json': '[]', '.versionen/manuskript/a/alt.md': 'alt', 'manuskript/a.md': 'Text', '.DS_Store': 'x', 'manuskript/.a.md.tmp': 'x', 'a.tmp-123': 'x', 'a~': 'x' });
    await fs.schreibenBinaer('recherche/dateien/bild.png', new Uint8Array([0, 255, 128]));
    const vorher = fs.alleDateien();
    const zip = await archivAufbauen(fs, false);
    const dateien = await archivLesen(zip);
    expect(dateien.map((d) => d.pfad)).toEqual(['.plotwerk/hinweise.json', 'manuskript/a.md', 'projekt.md', 'recherche/dateien/bild.png']);
    expect(dateien.at(-1)?.daten).toEqual(new Uint8Array([0, 255, 128]));
    expect(fs.alleDateien()).toEqual(vorher);
    expect(dateiAuswahl(Object.keys(vorher), true)).toContain('.versionen/manuskript/a/alt.md');
  });

  it('weist ZIP-Slip, Links und Archive ohne projekt.md zurück', async () => {
    for (const name of ['../fremd.md', '/fremd.md', 'a\\b.md', 'a/../b.md', 'C:/fremd.md']) {
      const zip = new JSZip().file('projekt.md', 'Projekt').file(name, 'x');
      await expect(archivLesen(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow();
    }
    const link = new JSZip().file('projekt.md', 'Projekt').file('link', 'ziel', { unixPermissions: 0o120777 });
    await expect(archivLesen(await link.generateAsync({ type: 'uint8array', platform: 'UNIX' }))).rejects.toThrow();
    await expect(archivLesen(await new JSZip().file('text.md', 'x').generateAsync({ type: 'uint8array' }))).rejects.toThrow();
  });

  it('behält auch BOM und unbekannte Binärdateien exakt', async () => {
    const fs = new MemoryFs();
    const bytes = new Uint8Array([239, 187, 191, 65, 0, 255]);
    await fs.schreibenBinaer('projekt.md', bytes);
    await fs.schreibenBinaer('anhaenge/unbekannt.bin', bytes);
    const dateien = await archivLesen(await archivAufbauen(fs, true));
    expect(dateien).toEqual([{ pfad: 'anhaenge/unbekannt.bin', daten: bytes }, { pfad: 'projekt.md', daten: bytes }]);
  });

  it('verwendet einen sprachunabhängigen sicheren Namen und lokale Kalenderdaten', () => {
    expect(sicherungsName('Hafen: /Lichter\\..', new Date(2026, 9, 20, 9, 5))).toBe('Hafen-Lichter-2026-10-20-0905.zip');
    expect(sicherungsName('é 中文', new Date(2026, 9, 20, 9, 5))).toBe('Projekt-2026-10-20-0905.zip');
  });

  it('behält sieben neueste Tagesstände und vier ältere ISO-Wochen; fremde und ungültige Namen bleiben', () => {
    const namen = Array.from({ length: 60 }, (_, i) => sicherungsName('Hafenlichter', new Date(2026, 9, 20 - i, 9, 0)));
    const extra = ['notizen.txt', 'Andere-2026-10-01-0900.zip', 'Hafenlichter-2026-02-30-0900.zip'];
    const altHeute = 'Hafenlichter-2026-10-20-0800.zip';
    const loeschen = rotation([...namen, ...extra, altHeute], 'Hafenlichter');
    const behalten = namen.filter((n) => !loeschen.includes(n));
    expect(behalten).toHaveLength(11);
    expect(behalten.slice(0, 7)).toEqual(namen.slice(0, 7));
    expect(behalten.slice(7)).toEqual([namen[7], namen[9], namen[16], namen[23]]);
    expect(loeschen).toContain(altHeute);
    expect(loeschen.some((n) => extra.includes(n))).toBe(false);
  });
});
