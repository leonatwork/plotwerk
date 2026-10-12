/**
 * Eigener kleiner Zustand der Lesevorschau (unabhängig vom zentralen Store).
 * Einstellungen (Modus, Schriftgröße, Zeilenabstand, Hintergrund) bleiben pro Nutzer im localStorage.
 */
import { create } from 'zustand';
import type { Id } from '@core/model/types';
import { useStore } from '../../state/store';
import { SCHRIFTSTUFEN, ZEILENABSTAENDE, type Zeilenabstand } from './geometrie';
import type { Anker } from './seiten';

export type VorschauModus = 'buch' | 'ebook';
export type Hintergrund = 'papier' | 'sepia' | 'nacht';

export interface VorschauEinstellungen {
  modus: VorschauModus;
  /** Index in SCHRIFTSTUFEN */
  schriftstufe: number;
  zeilenabstand: Zeilenabstand;
  hintergrund: Hintergrund;
}

export const STANDARD_EINSTELLUNGEN: VorschauEinstellungen = { modus: 'buch', schriftstufe: 2, zeilenabstand: 'normal', hintergrund: 'papier' };

export const EINSTELLUNGEN_SCHLUESSEL = 'plotwerk:vorschau:einstellungen';

/** Liest die Einstellungen; ungültige oder fehlende Werte → Standard. */
export function ladeEinstellungen(): VorschauEinstellungen {
  try {
    const roh = localStorage.getItem(EINSTELLUNGEN_SCHLUESSEL);
    if (!roh) return { ...STANDARD_EINSTELLUNGEN };
    const w = JSON.parse(roh) as Partial<Record<keyof VorschauEinstellungen, unknown>> | null;
    if (!w || typeof w !== 'object') return { ...STANDARD_EINSTELLUNGEN };
    const stufe = typeof w.schriftstufe === 'number' && Number.isInteger(w.schriftstufe) ? w.schriftstufe : NaN;
    return {
      modus: w.modus === 'ebook' || w.modus === 'buch' ? w.modus : STANDARD_EINSTELLUNGEN.modus,
      schriftstufe: stufe >= 0 && stufe < SCHRIFTSTUFEN.length ? stufe : STANDARD_EINSTELLUNGEN.schriftstufe,
      zeilenabstand:
        typeof w.zeilenabstand === 'string' && w.zeilenabstand in ZEILENABSTAENDE
          ? (w.zeilenabstand as Zeilenabstand)
          : STANDARD_EINSTELLUNGEN.zeilenabstand,
      hintergrund: w.hintergrund === 'papier' || w.hintergrund === 'sepia' || w.hintergrund === 'nacht' ? w.hintergrund : STANDARD_EINSTELLUNGEN.hintergrund,
    };
  } catch {
    return { ...STANDARD_EINSTELLUNGEN };
  }
}

export function sichereEinstellungen(e: VorschauEinstellungen): void {
  try {
    localStorage.setItem(EINSTELLUNGEN_SCHLUESSEL, JSON.stringify(e));
  } catch {
    // privater Modus o. Ä.: Einstellungen gelten nur für diese Sitzung
  }
}

export interface VorschauZustand {
  offen: boolean;
  /** Öffnungswunsch: Kapitel (null = Anfang bzw. zuletzt gelesene Stelle); `nr` zählt jeden Aufruf */
  start: { kapitel: Id | null; nr: number };
  /** zuletzt gelesene Stelle dieser Sitzung (beim Öffnen ohne Kapitel) */
  letzteStelle: Anker | null;
  einstellungen: VorschauEinstellungen;
  oeffnen(kapitelId?: Id | null): void;
  schliessen(): void;
  merkeStelle(anker: Anker | null): void;
  setzeEinstellungen(teil: Partial<VorschauEinstellungen>): void;
}

export const useVorschau = create<VorschauZustand>()((set, get) => ({
  offen: false,
  start: { kapitel: null, nr: 0 },
  letzteStelle: null,
  einstellungen: ladeEinstellungen(),
  oeffnen(kapitelId) {
    // ausstehende Eingaben im Editor sichern, damit die Vorschau den neuesten Text zeigt (läuft im Hintergrund)
    const sichern = useStore.getState().editorSichern as (() => Promise<void>) | undefined;
    if (typeof sichern === 'function') sichern().catch((e: unknown) => console.error('Sichern vor der Vorschau fehlgeschlagen:', e));
    set({ offen: true, start: { kapitel: kapitelId ?? null, nr: get().start.nr + 1 } });
  },
  schliessen() {
    if (get().offen) set({ offen: false });
  },
  merkeStelle(anker) {
    set({ letzteStelle: anker });
  },
  setzeEinstellungen(teil) {
    const einstellungen = { ...get().einstellungen, ...teil };
    sichereEinstellungen(einstellungen);
    set({ einstellungen });
  },
}));

/** Öffnet die Lesevorschau, mit Kapitel-ID am Anfang dieses Kapitels (leere Kapitel → nächstes mit Text). */
export function oeffneVorschau(kapitelId?: string): void {
  useVorschau.getState().oeffnen(kapitelId);
}

/** Schließt die Lesevorschau. */
export function schliesseVorschau(): void {
  useVorschau.getState().schliessen();
}

export function vorschauOffen(): boolean {
  return useVorschau.getState().offen;
}
