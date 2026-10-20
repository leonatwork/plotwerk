/** ZIP-Sicherungen: ausschließlich Lesen, keine Plattform- oder DOM-Abhängigkeit. */
import JSZip from 'jszip';
import type { ProjektLeser } from '../projekt/fs';
import { isoWoche } from '../versionen';

export interface ArchivLeser extends ProjektLeser {
  lesenBinaer?(pfad: string): Promise<Uint8Array | null>;
}

export function sichererArchivPfad(pfad: string): boolean {
  return !!pfad && !pfad.startsWith('/') && !/[\\:\x00]/.test(pfad)
    && pfad.split('/').every((t) => !!t && t !== '.' && t !== '..');
}

export function archivDateien(pfade: string[], mitVersionen: boolean): string[] {
  return pfade.filter((p) => {
    if (!sichererArchivPfad(p)) throw new Error(`Ungültiger Archivpfad: ${p}`);
    return !p.split('/').some((t) => t === '.DS_Store' || t.startsWith('._') || t.endsWith('.tmp') || t.endsWith('.temp') || t.endsWith('~'))
      && (mitVersionen || !p.startsWith('.versionen/'));
  }).sort();
}

export async function baueArchiv(leser: ArchivLeser, mitVersionen: boolean): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const pfad of archivDateien(await leser.auflisten(''), mitVersionen)) {
    const daten = leser.lesenBinaer ? await leser.lesenBinaer(pfad) : await leser.lesen(pfad);
    if (daten === null) throw new Error(`Datei während der Sicherung verschwunden: ${pfad}`);
    zip.file(pfad, daten, { createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export function projektName(titel: string): string {
  // Rust prüft den rohen Ordnernamen als ZIP-Präfix: Unicode und Rand-Leerraum erhalten.
  return titel.replace(/[\\/:\x00-\x1f]/g, '-').replace(/^\.+/, '') || 'Projekt';
}

const z = (n: number) => String(n).padStart(2, '0');
export function lokalerTag(d: Date): string {
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Bei Kollision die nächste freie Namensminute; tatsächlicher ZIP-Zeitstempel bleibt unverändert. */
export function archivName(titel: string, zeit: Date, vorhanden: string[]): string {
  const d = new Date(zeit);
  const belegt = new Set(vorhanden);
  for (;;) {
    const name = `${projektName(titel)}-${lokalerTag(d)}-${z(d.getHours())}${z(d.getMinutes())}.zip`;
    if (!belegt.has(name)) return name;
    d.setMinutes(d.getMinutes() + 1);
  }
}

export function archivZeit(name: string, titel: string): Date | null {
  const prefix = `${projektName(titel)}-`;
  if (!name.startsWith(prefix)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.zip$/.exec(name.slice(prefix.length));
  if (!m) return null;
  const [, jahr, monat, tag, stunde, minute] = m;
  const d = new Date(+jahr!, +monat! - 1, +tag!, +stunde!, +minute!);
  return lokalerTag(d) === `${jahr}-${monat}-${tag}` && d.getHours() === +stunde! && d.getMinutes() === +minute! ? d : null;
}

/** Sieben neueste verschiedene Tage, danach der neueste Stand je ISO-Woche für vier Wochen. */
export function rotation(namen: string[], titel: string): string[] {
  const gueltig = namen.flatMap((name) => {
    const zeit = archivZeit(name, titel);
    return zeit ? [{ name, zeit }] : [];
  }).sort((a, b) => b.zeit.getTime() - a.zeit.getTime());
  const tage = new Set<string>();
  const wochen = new Set<string>();
  const behalten = new Set<string>();
  for (const { name, zeit } of gueltig) {
    const tag = lokalerTag(zeit);
    if (tage.has(tag)) continue;
    if (tage.size < 7) { tage.add(tag); behalten.add(name); continue; }
    const woche = isoWoche(zeit);
    if (!wochen.has(woche) && wochen.size < 4) { wochen.add(woche); behalten.add(name); }
  }
  return gueltig.filter((a) => !behalten.has(a.name)).map((a) => a.name);
}

export interface ArchivDatei { pfad: string; daten: number[] }

/** Vor Übergabe an Rust prüfen; Rust prüft erneut vor jeglichem Schreiben. */
export async function entpackeArchiv(daten: Uint8Array): Promise<ArchivDatei[]> {
  const zip = await JSZip.loadAsync(daten, { checkCRC32: true });
  const dateien: ArchivDatei[] = [];
  let groesse = 0;
  for (const datei of Object.values(zip.files)) {
    const original = (datei as typeof datei & { unsafeOriginalName?: string }).unsafeOriginalName ?? datei.name;
    if (!sichererArchivPfad(original.replace(/\/$/, '')) || original !== datei.name) throw new Error(`Ungültiger Archivpfad: ${original}`);
    if (datei.dir) continue;
    const bytes = await datei.async('uint8array');
    groesse += bytes.length;
    if (groesse > 1024 * 1024 * 1024 || dateien.length >= 100000) throw new Error('Archiv zu groß');
    dateien.push({ pfad: datei.name, daten: Array.from(bytes) });
  }
  if (!dateien.some((d) => d.pfad === 'projekt.md')) throw new Error('projekt.md fehlt im Archiv');
  return dateien;
}
