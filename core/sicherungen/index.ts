/** ZIP-Logik ohne Plattformzugriff. Rohbytes erhalten auch BOM und unbekannte Projektdateien. */
import JSZip from 'jszip';
import type { ProjektLeser } from '../projekt/fs';
import { isoWoche } from '../versionen';

export interface ArchivLeser extends ProjektLeser {
  lesenBinaer?(pfad: string): Promise<Uint8Array | null>;
}
export interface ArchivDatei { pfad: string; daten: Uint8Array }

export function dateiAuswahl(pfade: string[], mitVersionen: boolean): string[] {
  return pfade.filter((p) => (mitVersionen || !p.startsWith('.versionen/')) &&
    !p.split('/').some((n) => n === '.DS_Store' || n.endsWith('~') || /\.(tmp|temp|swp|swo)(-\d+)?$/i.test(n))).sort();
}

/** Gemeinsame Rust/TS-Regel: ASCII, höchstens 80 Zeichen; ungültige Gruppen → Bindestrich. */
export function projektName(projekt: string): string {
  return projekt.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'Projekt';
}
const zwei = (n: number) => String(n).padStart(2, '0');
export function sicherungsName(projekt: string, zeit: Date): string {
  return `${projektName(projekt)}-${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}-${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}.zip`;
}

export function sicherungsZeit(name: string, projekt: string): Date | null {
  const prefix = projektName(projekt) + '-';
  if (!name.startsWith(prefix)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.zip$/.exec(name.slice(prefix.length));
  if (!m) return null;
  const [jahr, monat, tag, stunde, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const d = new Date(jahr, monat - 1, tag, stunde, minute);
  return sicherungsName(projekt, d) === name ? d : null;
}

/** Sieben jüngste unterschiedliche Tage, danach die jüngsten vier vertretenen ISO-Wochen. */
export function rotation(namen: string[], projekt: string): string[] {
  const gueltig = namen.flatMap((name) => { const zeit = sicherungsZeit(name, projekt); return zeit ? [{ name, zeit }] : []; })
    .sort((a, b) => b.name.localeCompare(a.name));
  const tage = new Set<string>();
  const wochen = new Set<string>();
  const behalten = new Set<string>();
  for (const { name, zeit } of gueltig) {
    const tag = name.slice(-19, -9);
    if (tage.has(tag)) continue;
    tage.add(tag);
    if (tage.size <= 7) behalten.add(name);
    else {
      const woche = isoWoche(zeit);
      if (!wochen.has(woche) && wochen.size < 4) { wochen.add(woche); behalten.add(name); }
    }
  }
  return gueltig.filter((x) => !behalten.has(x.name)).map((x) => x.name);
}

export async function archivAufbauen(fs: ArchivLeser, mitVersionen: boolean): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const pfad of dateiAuswahl(await fs.auflisten(''), mitVersionen)) {
    const daten = fs.lesenBinaer ? await fs.lesenBinaer(pfad) : await fs.lesen(pfad);
    if (daten === null) throw new Error(`Datei fehlt / File missing: ${pfad}`);
    zip.file(pfad, daten, { createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Vor jedem Schreiben alle Einträge prüfen. JSZip normalisiert '..', daher unsafeOriginalName prüfen. */
export async function archivLesen(daten: Uint8Array): Promise<ArchivDatei[]> {
  const zip = await JSZip.loadAsync(daten, { checkCRC32: true });
  const dateien: ArchivDatei[] = [];
  let groesse = 0;
  for (const datei of Object.values(zip.files)) {
    const pfad = (datei as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? datei.name;
    const teile = pfad.replace(/\/$/, '').split('/');
    const modus = Number(datei.unixPermissions ?? 0) & 0o170000;
    if (!pfad || pfad.startsWith('/') || /[\\:\u0000]/.test(pfad) || teile.some((p) => !p || p === '..' || p === '.') ||
      (modus !== 0 && modus !== 0o100000 && modus !== 0o040000)) throw new Error('Ungültiger Archivpfad / Invalid archive path');
    if (datei.dir) continue;
    const bytes = await datei.async('uint8array');
    groesse += bytes.length;
    if (groesse > 2 * 1024 ** 3 || dateien.length >= 100_000) throw new Error('Archiv zu groß / Archive too large');
    dateien.push({ pfad, daten: bytes });
  }
  if (!dateien.some((d) => d.pfad === 'projekt.md')) throw new Error('projekt.md fehlt / projekt.md missing');
  return dateien.sort((a, b) => a.pfad.localeCompare(b.pfad, 'en'));
}
