/** Dateisystem im Speicher (Tests, Browser-Demo). Gleiche Pfadregeln wie das Tauri-Backend. */
import type { ProjektDateisystem } from './fs';

export type AenderungsBeobachter = (pfad: string, inhalt: string | null) => void;

/** Normalisiert einen relativen Projektpfad; wirft bei absoluten Pfaden und „..“. */
export function pruefePfad(pfad: string): string {
  const roh = pfad.replace(/\\/g, '/');
  if (roh.startsWith('/') || /^[a-zA-Z]:/.test(roh)) throw new Error(`Absoluter Pfad nicht erlaubt: ${pfad}`);
  const teile = roh.split('/').filter((t) => t !== '' && t !== '.');
  if (teile.includes('..')) throw new Error(`„..“ im Pfad nicht erlaubt: ${pfad}`);
  return teile.join('/');
}

/**
 * Binärdateien in Text-Ablagen (Beobachter, localStorage der Browser-Demo): Präfix + Base64.
 * Der Konstruktor erkennt so gekennzeichnete Inhalte wieder als Binärdateien.
 */
export const BINAER_PRAEFIX = '\u0000plotwerk-binaer:';

export function binaerAlsText(daten: Uint8Array): string {
  let roh = '';
  for (let i = 0; i < daten.length; i += 0x8000) roh += String.fromCharCode(...daten.subarray(i, i + 0x8000));
  return BINAER_PRAEFIX + btoa(roh);
}

export function textAlsBinaer(text: string): Uint8Array | null {
  if (!text.startsWith(BINAER_PRAEFIX)) return null;
  const roh = atob(text.slice(BINAER_PRAEFIX.length));
  const daten = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) daten[i] = roh.charCodeAt(i);
  return daten;
}

export class MemoryFs implements ProjektDateisystem {
  private readonly dateien = new Map<string, string>();
  private readonly binaer = new Map<string, Uint8Array>();
  private readonly beobachter = new Set<AenderungsBeobachter>();

  constructor(anfang: Record<string, string> = {}) {
    for (const [pfad, inhalt] of Object.entries(anfang)) {
      const daten = textAlsBinaer(inhalt);
      if (daten) this.binaer.set(pruefePfad(pfad), daten);
      else this.dateien.set(pruefePfad(pfad), inhalt);
    }
  }

  async lesen(pfad: string): Promise<string | null> {
    const p = pruefePfad(pfad);
    if (this.binaer.has(p)) throw new Error(`Datei ist kein UTF-8-Text: ${p}`);
    return this.dateien.get(p) ?? null;
  }

  async auflisten(ordner: string): Promise<string[]> {
    const o = pruefePfad(ordner);
    const praefix = o ? `${o}/` : '';
    return [...this.dateien.keys(), ...this.binaer.keys()].filter((p) => p.startsWith(praefix)).sort();
  }

  async existiert(pfad: string): Promise<boolean> {
    const p = pruefePfad(pfad);
    if (this.dateien.has(p) || this.binaer.has(p)) return true;
    const praefix = p ? `${p}/` : '';
    for (const k of [...this.dateien.keys(), ...this.binaer.keys()]) if (k.startsWith(praefix)) return true;
    return false;
  }

  async schreiben(pfad: string, inhalt: string): Promise<void> {
    const p = pruefePfad(pfad);
    if (!p) throw new Error('Leerer Pfad');
    this.binaer.delete(p);
    this.dateien.set(p, inhalt);
    this.melde(p, inhalt);
  }

  async entfernen(pfad: string): Promise<void> {
    const p = pruefePfad(pfad);
    const text = this.dateien.delete(p);
    const bin = this.binaer.delete(p);
    if (text || bin) this.melde(p, null);
  }

  /** Binärdatei lesen; Textdateien (z. B. SVG im Demo-Projekt) kommen als UTF-8-Bytes. */
  async lesenBinaer(pfad: string): Promise<Uint8Array | null> {
    const p = pruefePfad(pfad);
    const daten = this.binaer.get(p);
    if (daten) return daten.slice();
    const text = this.dateien.get(p);
    return text === undefined ? null : new TextEncoder().encode(text);
  }

  async schreibenBinaer(pfad: string, daten: Uint8Array): Promise<void> {
    const p = pruefePfad(pfad);
    if (!p) throw new Error('Leerer Pfad');
    this.dateien.delete(p);
    this.binaer.set(p, daten.slice());
    this.melde(p, binaerAlsText(daten));
  }

  /** Momentaufnahme aller Textdateien (Pfad → Inhalt); Binärdateien als binaerAlsText. */
  alleDateien(): Record<string, string> {
    const alle: [string, string][] = [...this.dateien.entries(), ...[...this.binaer.entries()].map(([p, d]): [string, string] => [p, binaerAlsText(d)])];
    return Object.fromEntries(alle.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  /** Meldet jede Änderung (inhalt null = entfernt). Rückgabe: Abmelden. */
  beobachten(cb: AenderungsBeobachter): () => void {
    this.beobachter.add(cb);
    return () => this.beobachter.delete(cb);
  }

  private melde(pfad: string, inhalt: string | null): void {
    for (const cb of this.beobachter) cb(pfad, inhalt);
  }
}
