/** Dateisystem im Speicher (Tests, Browser-Demo). Gleiche Pfadregeln wie das Tauri-Backend. */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { ProjektDateisystem } from './fs';

export type AenderungsBeobachter = (pfad: string, inhalt: string | null) => void;

/** Fehlermeldungen (Oberflächensprache); gemeinsam mit binaer.ts. */
export const FS_TEXTE = texteJe(
  {
    absolut: 'Absoluter Pfad nicht erlaubt: {pfad}',
    punktPunkt: '„..“ im Pfad nicht erlaubt: {pfad}',
    keinText: 'Datei ist kein UTF-8-Text: {pfad}',
    leer: 'Leerer Pfad',
    nurRecherche: 'Binärdateien nur unter recherche/: {pfad}',
    binaerSpeichern: 'Dieses Projekt kann keine Binärdateien speichern.',
    binaerLesen: 'Dieses Projekt kann keine Binärdateien lesen.',
  },
  {
    absolut: 'Absolute path not allowed: {pfad}',
    punktPunkt: '“..” not allowed in path: {pfad}',
    keinText: 'File is not UTF-8 text: {pfad}',
    leer: 'Empty path',
    nurRecherche: 'Binary files only under recherche/: {pfad}',
    binaerSpeichern: 'This project can’t save binary files.',
    binaerLesen: 'This project can’t read binary files.',
  },
);

/** Normalisiert einen relativen Projektpfad; wirft bei absoluten Pfaden und „..“. */
export function pruefePfad(pfad: string, sprache: Sprache = 'de'): string {
  const roh = pfad.replace(/\\/g, '/');
  if (roh.startsWith('/') || /^[a-zA-Z]:/.test(roh)) throw new Error(fmt(FS_TEXTE(sprache).absolut, { pfad }));
  const teile = roh.split('/').filter((t) => t !== '' && t !== '.');
  if (teile.includes('..')) throw new Error(fmt(FS_TEXTE(sprache).punktPunkt, { pfad }));
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
  /** Sprache der Fehlermeldungen (Oberflächensprache; jederzeit änderbar) */
  sprache: Sprache = 'de';

  constructor(anfang: Record<string, string> = {}) {
    for (const [pfad, inhalt] of Object.entries(anfang)) {
      const daten = textAlsBinaer(inhalt);
      if (daten) this.binaer.set(pruefePfad(pfad), daten);
      else this.dateien.set(pruefePfad(pfad), inhalt);
    }
  }

  async lesen(pfad: string): Promise<string | null> {
    const p = pruefePfad(pfad, this.sprache);
    if (this.binaer.has(p)) throw new Error(fmt(FS_TEXTE(this.sprache).keinText, { pfad: p }));
    return this.dateien.get(p) ?? null;
  }

  async auflisten(ordner: string): Promise<string[]> {
    const o = pruefePfad(ordner, this.sprache);
    const praefix = o ? `${o}/` : '';
    return [...this.dateien.keys(), ...this.binaer.keys()].filter((p) => p.startsWith(praefix)).sort();
  }

  async existiert(pfad: string): Promise<boolean> {
    const p = pruefePfad(pfad, this.sprache);
    if (this.dateien.has(p) || this.binaer.has(p)) return true;
    const praefix = p ? `${p}/` : '';
    for (const k of [...this.dateien.keys(), ...this.binaer.keys()]) if (k.startsWith(praefix)) return true;
    return false;
  }

  async schreiben(pfad: string, inhalt: string): Promise<void> {
    const p = pruefePfad(pfad, this.sprache);
    if (!p) throw new Error(FS_TEXTE(this.sprache).leer);
    this.binaer.delete(p);
    this.dateien.set(p, inhalt);
    this.melde(p, inhalt);
  }

  async entfernen(pfad: string): Promise<void> {
    const p = pruefePfad(pfad, this.sprache);
    const text = this.dateien.delete(p);
    const bin = this.binaer.delete(p);
    if (text || bin) this.melde(p, null);
  }

  /** Binärdatei lesen; Textdateien (z. B. SVG im Demo-Projekt) kommen als UTF-8-Bytes. */
  async lesenBinaer(pfad: string): Promise<Uint8Array | null> {
    const p = pruefePfad(pfad, this.sprache);
    const daten = this.binaer.get(p);
    if (daten) return daten.slice();
    const text = this.dateien.get(p);
    return text === undefined ? null : new TextEncoder().encode(text);
  }

  async schreibenBinaer(pfad: string, daten: Uint8Array): Promise<void> {
    const p = pruefePfad(pfad, this.sprache);
    if (!p) throw new Error(FS_TEXTE(this.sprache).leer);
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
