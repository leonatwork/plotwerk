/**
 * Oberflächensprache: Zustand, Erkennung der Systemsprache und Speicherung als App-Einstellung
 * (Tauri: einstellungen.json im App-Ordner über `sprache_info`/`sprache_setzen`, die auch das native
 * Menü umstellen; Browser-Demo: localStorage). Nicht im Projektordner.
 */
import { create } from 'zustand';
import { localeVon, sprachCode, type Sprache } from '@core/i18n';
import { istTauri } from '../backend';
import { de } from './de';
import { en } from './en';
import type { SprachWahl, Woerterbuch } from './typen';

const SPEICHER = 'plotwerk:sprache';

interface SprachZustand {
  wahl: SprachWahl;
  /** Sprache des Systems (macOS bzw. Browser) */
  system: Sprache;
  /** wirksame Sprache = wahl, bei „system“ die Systemsprache */
  sprache: Sprache;
}

/** Browser-/WebView-Sprache: Deutsch → de, sonst en. */
export function browserSprache(): Sprache {
  if (typeof navigator === 'undefined') return 'de';
  return sprachCode(navigator.languages?.[0] ?? navigator.language, 'en');
}

function wirksam(wahl: SprachWahl, system: Sprache): Sprache {
  return wahl === 'system' ? system : wahl;
}

function gueltigeWahl(w: unknown): SprachWahl {
  return w === 'de' || w === 'en' ? w : 'system';
}

const start = browserSprache();
export const useSprachStore = create<SprachZustand>(() => ({ wahl: 'system', system: start, sprache: start }));

useSprachStore.subscribe((s, vorher) => {
  if (s.sprache !== vorher.sprache && typeof document !== 'undefined') document.documentElement.lang = s.sprache;
});

/** Aktuelle Oberflächensprache (außerhalb von React). */
export function sprache(): Sprache {
  return useSprachStore.getState().sprache;
}

/** Wörterbuch einer Sprache. */
export function woerterbuch(s: Sprache): Woerterbuch {
  return s === 'en' ? en : de;
}

/** Wörterbuch der aktuellen Oberflächensprache (außerhalb von React, z. B. in Store-Slices). */
export function texte(): Woerterbuch {
  return woerterbuch(sprache());
}

/** Intl-Locale der Oberfläche („de-DE“ bzw. „en-US“). */
export function locale(): string {
  return localeVon(sprache());
}

/** Gespeicherte Wahl und Systemsprache laden (vor dem ersten Rendern). Fehler → System. */
export async function initialisiereSprache(): Promise<void> {
  let wahl: SprachWahl = 'system';
  let system = browserSprache();
  try {
    if (istTauri()) {
      const { aufruf } = await import('../backend/tauri/aufruf');
      const info = await aufruf<{ wahl: string; system: string }>('sprache_info');
      wahl = gueltigeWahl(info.wahl);
      system = sprachCode(info.system, 'en');
    } else {
      wahl = gueltigeWahl(localStorage.getItem(SPEICHER));
    }
  } catch (e) {
    console.warn('Sprache nicht geladen:', e);
  }
  useSprachStore.setState({ wahl, system, sprache: wirksam(wahl, system) });
  if (typeof document !== 'undefined') document.documentElement.lang = sprache();
}

/** Sprache wählen (Einstellungen): gilt sofort, wird als App-Einstellung gespeichert, Mac-Menü folgt. */
export async function setzeSprachWahl(wahl: SprachWahl): Promise<void> {
  const { system } = useSprachStore.getState();
  useSprachStore.setState({ wahl, sprache: wirksam(wahl, system) });
  try {
    if (istTauri()) {
      const { aufruf } = await import('../backend/tauri/aufruf');
      await aufruf<void>('sprache_setzen', { wahl });
    } else if (wahl === 'system') localStorage.removeItem(SPEICHER);
    else localStorage.setItem(SPEICHER, wahl);
  } catch (e) {
    console.warn('Sprache nicht gespeichert:', e);
  }
}

/** Für Tests: Sprache fest einstellen, ohne etwas zu speichern. */
export function festeSprache(s: Sprache): void {
  useSprachStore.setState({ wahl: s, system: s, sprache: s });
}
