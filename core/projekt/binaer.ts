/**
 * Binärdateien im Projektordner (G8 Recherche-Bilder). Nur unter recherche/ (und deren Schnappschüsse
 * unter .versionen/recherche/); Markdown/JSON laufen weiter über lesen/schreiben als Text.
 * Rust: fs_lesen_binaer / fs_schreiben_binaer mit demselben Pfadwächter.
 */
import { versionsPfadMitZusatz } from '../versionen/index';
import type { ProjektDateisystem } from './fs';
import { pruefePfad } from './memoryFs';

/** Binär schreiben darf die App nur hier (gleiche Regel im Rust-Kern: dateien::binaer_erlaubt). */
export const BINAER_ORDNER = ['recherche/', '.versionen/recherche/'] as const;

export function binaerPfadErlaubt(pfad: string): boolean {
  let p: string;
  try {
    p = pruefePfad(pfad);
  } catch {
    return false;
  }
  return BINAER_ORDNER.some((o) => p.startsWith(o) && p.length > o.length) && !p.endsWith('/recherche.json');
}

function pruefe(fs: ProjektDateisystem, pfad: string): string {
  const p = pruefePfad(pfad);
  if (!binaerPfadErlaubt(p)) throw new Error(`Binärdateien nur unter recherche/: ${pfad}`);
  if (!fs.schreibenBinaer || !fs.lesenBinaer) throw new Error('Dieses Projekt kann keine Binärdateien speichern.');
  return p;
}

/** Liest eine Binärdatei (nur unter recherche/); null = fehlt. */
export async function leseBinaer(fs: ProjektDateisystem, pfad: string): Promise<Uint8Array | null> {
  const p = pruefePfad(pfad);
  if (!binaerPfadErlaubt(p)) throw new Error(`Binärdateien nur unter recherche/: ${pfad}`);
  if (!fs.lesenBinaer) throw new Error('Dieses Projekt kann keine Binärdateien lesen.');
  return fs.lesenBinaer(p);
}

/** Schreibt atomar (TauriFs) bzw. im Speicher; nur unter recherche/. */
export async function schreibeBinaer(fs: ProjektDateisystem, pfad: string, daten: Uint8Array): Promise<void> {
  const p = pruefe(fs, pfad);
  await fs.schreibenBinaer!(p, daten);
}

/** .versionen/recherche/dateien/bild.jpg/<Zeitstempel>.jpg – Endung bleibt erhalten. */
export function binaerVersionsPfad(pfad: string, zeit: Date, n = 1): string {
  const endung = /\.([A-Za-z0-9]{1,8})$/.exec(pfad)?.[1] ?? 'bin';
  return versionsPfadMitZusatz(pfad, zeit, n).replace(/\.md$/, `.${endung}`);
}

/** Kopie vor dem Entfernen/Überschreiben (wie schnappschuss() für Text); null = Datei fehlt. */
export async function schnappschussBinaer(fs: ProjektDateisystem, pfad: string, zeit: Date): Promise<string | null> {
  const p = pruefe(fs, pfad);
  const daten = await fs.lesenBinaer!(p);
  if (daten === null) return null;
  for (let n = 1; ; n++) {
    const ziel = binaerVersionsPfad(p, zeit, n);
    if (!(await fs.existiert(ziel))) {
      await fs.schreibenBinaer!(ziel, daten);
      return ziel;
    }
  }
}

/** Entfernt eine Binärdatei, vorher Schnappschuss. Rückgabe: Schnappschuss-Pfad (null = Datei fehlte). */
export async function entferneBinaerMitSchnappschuss(fs: ProjektDateisystem, pfad: string, zeit = new Date()): Promise<string | null> {
  const ziel = await schnappschussBinaer(fs, pfad, zeit);
  if (ziel !== null) await fs.entfernen(pruefePfad(pfad));
  return ziel;
}
