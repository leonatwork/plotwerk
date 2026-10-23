import JSZip from 'jszip';
import type { ProjektLeser } from '../projekt/fs';
import { parseProjekt } from '../projekt';
import { isoWoche } from '../versionen';
import { texteJe, type Sprache } from '../i18n';

export interface ArchivDatei { pfad: string; daten: Uint8Array }
export interface ArchivLeser extends ProjektLeser { lesenBinaer?(pfad: string): Promise<Uint8Array | null> }
const meldungen = texteJe(
  { fehlt: 'Datei während der Sicherung verschwunden', pfad: 'Unsicherer Archivpfad', projekt: 'Das Archiv enthält kein gültiges Plotwerk-Projekt', gross: 'Das entpackte Archiv ist zu groß (maximal 2 GB)', zip: 'Ungültiges oder nicht unterstütztes ZIP-Archiv' },
  { fehlt: 'File disappeared during backup', pfad: 'Unsafe archive path', projekt: 'The archive does not contain a valid Plotwerk project', gross: 'The extracted archive is too large (maximum 2 GB)', zip: 'Invalid or unsupported ZIP archive' },
);

/** Gleiche ASCII-Regel wie Rust: keine Transliteration, Folgen anderer Zeichen → ein Bindestrich. */
export function projektName(name: string): string {
  return name.replace(/[A-Z]/g, c => c.toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projekt';
}
const zwei = (n: number) => String(n).padStart(2, '0');
export function dateiname(name: string, zeit: Date, nummer = 1): string {
  return `${projektName(name)}-${zeit.getFullYear()}-${zwei(zeit.getMonth() + 1)}-${zwei(zeit.getDate())}-${zwei(zeit.getHours())}${zwei(zeit.getMinutes())}${nummer > 1 ? `-${nummer}` : ''}.zip`;
}
function sichererPfad(pfad: string): boolean {
  return !!pfad && !/[\\:\u0000-\u001f]/.test(pfad) && !pfad.startsWith('/') && pfad.split('/').every(p => !!p && p !== '.' && p !== '..');
}
export function dateienAuswaehlen(pfade: string[], mitVersionen: boolean): string[] {
  return pfade.filter(p => (mitVersionen || p.split('/')[0] !== '.versionen') &&
    !p.split('/').some(t => t === '.DS_Store' || t.startsWith('._') || t.endsWith('.tmp') || t.endsWith('.temp') || t.endsWith('~'))).sort();
}
/** Nur lesen, alle Bytes vor der Rotation erfassen. Kein Schnappschuss und kein Schreibzugriff. */
export async function archivAufbauen(fs: ArchivLeser, mitVersionen: boolean, sprache: Sprache = 'de'): Promise<Uint8Array> {
  const zip = new JSZip();
  let groesse = 0;
  for (const pfad of dateienAuswaehlen(await fs.auflisten(''), mitVersionen)) {
    if (!sichererPfad(pfad)) throw new Error(`${meldungen(sprache).pfad}: ${pfad}`);
    const daten = fs.lesenBinaer ? await fs.lesenBinaer(pfad) : await fs.lesen(pfad);
    if (daten === null) throw new Error(`${meldungen(sprache).fehlt}: ${pfad}`);
    const bytes = typeof daten === 'string' ? new TextEncoder().encode(daten) : daten;
    groesse += bytes.byteLength;
    if (groesse > 2 * 1024 ** 3) throw new Error(meldungen(sprache).gross);
    zip.file(pfad, bytes, { createFolders: false });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } });
}
/** Vollständig prüfen, bevor ein Zielordner angelegt wird; JSZip sanitisiert Traversal-Pfade, daher Rohname prüfen. */
export async function archivEntpacken(daten: Uint8Array, sprache: Sprache = 'de'): Promise<ArchivDatei[]> {
  archivPruefen(daten, sprache);
  const zip = await JSZip.loadAsync(daten, { checkCRC32: true });
  const ergebnis: ArchivDatei[] = [];
  let groesse = 0;
  for (const datei of Object.values(zip.files)) {
    const roh = (datei as typeof datei & { unsafeOriginalName?: string }).unsafeOriginalName ?? datei.name;
    if (!sichererPfad(datei.dir ? roh.replace(/\/$/, '') : roh) || roh !== datei.name ||
      (Number(datei.unixPermissions) & 0o170000) === 0o120000) throw new Error(`${meldungen(sprache).pfad}: ${roh}`);
    if (datei.dir) continue;
    const bytes = await datei.async('uint8array');
    groesse += bytes.length;
    if (groesse > 2 * 1024 ** 3) throw new Error(meldungen(sprache).gross);
    ergebnis.push({ pfad: roh, daten: bytes });
  }
  const projekt = ergebnis.find(d => d.pfad === 'projekt.md');
  if (!projekt) throw new Error(meldungen(sprache).projekt);
  parseProjekt(new TextDecoder('utf-8', { fatal: true }).decode(projekt.daten));
  return ergebnis.sort((a, b) => a.pfad.localeCompare(b.pfad));
}

/** Rohpfade und Größen prüfen, bevor JSZip Namen normalisiert, Einträge zusammenfasst oder dekomprimiert. */
function archivPruefen(daten: Uint8Array, sprache: Sprache): void {
  const view = new DataView(daten.buffer, daten.byteOffset, daten.byteLength);
  const ungueltig = () => new Error(meldungen(sprache).zip);
  let ende = -1;
  for (let i = daten.length - 22; i >= Math.max(0, daten.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === daten.length) { ende = i; break; }
  }
  if (ende < 0 || view.getUint16(ende + 4, true) !== 0 || view.getUint16(ende + 6, true) !== 0) throw ungueltig();
  const anzahl = view.getUint16(ende + 10, true);
  if (anzahl === 0xffff || view.getUint16(ende + 8, true) !== anzahl) throw ungueltig();
  let pos = view.getUint32(ende + 16, true);
  const zentralEnde = pos + view.getUint32(ende + 12, true);
  if (zentralEnde !== ende) throw ungueltig();
  let groesse = 0;
  const gesehen = new Set<string>();
  for (let i = 0; i < anzahl; i++) {
    if (pos + 46 > zentralEnde || view.getUint32(pos, true) !== 0x02014b50) throw ungueltig();
    const nameEnde = pos + 46 + view.getUint16(pos + 28, true);
    const naechste = nameEnde + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
    if (naechste > zentralEnde) throw ungueltig();
    const roh = new TextDecoder().decode(daten.subarray(pos + 46, nameEnde));
    const pfad = roh.replace(/\/$/, '');
    if (!sichererPfad(pfad) || gesehen.has(pfad)) throw new Error(`${meldungen(sprache).pfad}: ${roh}`);
    gesehen.add(pfad);
    groesse += view.getUint32(pos + 24, true);
    if (groesse > 2 * 1024 ** 3) throw new Error(meldungen(sprache).gross);
    pos = naechste;
  }
  if (pos !== zentralEnde) throw ungueltig();
}

export function archivZeit(name: string, projekt: string): { zeit: Date; tag: string; nummer: number } | null {
  const prefix = `${projektName(projekt)}-`;
  if (!name.startsWith(prefix)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-([2-9]|[1-9]\d+))?\.zip$/.exec(name.slice(prefix.length));
  if (!m || Number(m[6] ?? 1) > 0xffffffff) return null;
  const [jahr, monat, tag, stunde, minute] = m.slice(1, 6).map(Number);
  const zeit = new Date(jahr, monat - 1, tag, stunde, minute);
  if (jahr < 1000 || zeit.getFullYear() !== jahr || zeit.getMonth() !== monat - 1 || zeit.getDate() !== tag || stunde > 23 || minute > 59) return null;
  return { zeit, tag: `${m[1]}-${m[2]}-${m[3]}`, nummer: Number(m[6] ?? 1) };
}
/** Sieben verschiedene Tage, danach je eine Sicherung der vier neuesten älteren ISO-Wochen. */
export function zuLoeschen(namen: string[], projekt: string): string[] {
  const staende = namen.flatMap(name => { const z = archivZeit(name, projekt); return z ? [{ name, ...z }] : []; })
    .sort((a, b) => b.zeit.getTime() - a.zeit.getTime() || b.nummer - a.nummer);
  const behalten = new Set<string>();
  const tage = new Set<string>();
  const wochen = new Set<string>();
  for (const s of staende) {
    if (tage.has(s.tag)) continue;
    if (tage.size < 7) { tage.add(s.tag); behalten.add(s.name); continue; }
    const woche = isoWoche(s.zeit);
    if (wochen.has(woche) || wochen.size >= 4) continue;
    wochen.add(woche);
    behalten.add(s.name);
  }
  return staende.filter(s => !behalten.has(s.name)).map(s => s.name).sort();
}
