/**
 * Vorlesen (G4) mit der Sprachausgabe des Systems (Web Speech API → auf dem Mac die macOS-Stimmen).
 * Gelesen wird Satz für Satz; so lässt sich der Satz zuverlässig markieren, Pause und Weiterlesen
 * beginnen am Anfang des aktuellen Satzes.
 *
 * In der Mac-App spricht macOS `say` über Rust-Kommandos (src/backend/tauri/vorlesen.ts,
 * src-tauri/src/vorlesen.rs) – unabhängig davon, ob die WKWebView die Web Speech API mitbringt; dieselben
 * Stimmen wie in den Systemeinstellungen. Im Browser (Demo) gilt die Web Speech API. Fehlt beides, zeigt
 * die Werkzeugleiste „Vorlesen ist hier nicht verfügbar“.
 *
 * Satzgrenzen und die Standardstimme richten sich nach der Buchsprache (Deutsch: de-DE, Englisch: en-US vor en-GB).
 */
import { localeVon, type Sprache } from '@core/i18n';
import { saetze } from '@core/stil/index';
import { istTauri } from '../../../backend';
import { SayAeusserung, SaySprachausgabe } from '../../../backend/tauri/vorlesen';

export interface VorleseSatz {
  start: number;
  ende: number;
  text: string;
}

/** Sätze im Bereich [von, bis) – angeschnittene Sätze am Rand werden auf den Bereich gekürzt. */
export function vorleseSaetze(text: string, von = 0, bis = text.length, sprache: Sprache = 'de'): VorleseSatz[] {
  const ergebnis: VorleseSatz[] = [];
  for (const s of saetze(text, sprache)) {
    if (s.ende <= von || s.start >= bis) continue;
    const start = Math.max(s.start, von);
    const ende = Math.min(s.ende, bis);
    const t = text.slice(start, ende).replace(/\s+/gu, ' ').trim();
    if (/\p{L}|\p{N}/u.test(t)) ergebnis.push({ start, ende, text: t });
  }
  return ergebnis;
}

/** Index des Satzes, in dem `offset` steht (oder des nächsten danach). */
export function satzAb(liste: VorleseSatz[], offset: number): number {
  const i = liste.findIndex((s) => s.ende > offset);
  return i < 0 ? 0 : i;
}

export interface StimmeInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

/** Bevorzugte Varianten je Buchsprache (Rang 100, 95, …); andere Varianten der Sprache 80. */
const VARIANTEN: Record<Sprache, string[]> = {
  de: ['de-de'],
  en: ['en-us', 'en-gb'],
};

/** Qualität einer Stimme für Text in der Buchsprache (höher = besser, -1 = andere Sprache). */
export function stimmenRang(s: StimmeInfo, sprache: Sprache = 'de'): number {
  const lang = s.lang.replace('_', '-').toLowerCase();
  let rang = 0;
  const variante = VARIANTEN[sprache].indexOf(lang);
  if (variante >= 0) rang += 100 - 5 * variante;
  else if (lang === sprache || lang.startsWith(`${sprache}-`)) rang += 80;
  else return -1;
  if (/premium/iu.test(s.name)) rang += 30;
  else if (/enhanced|erweitert|verbessert|neural|siri/iu.test(s.name)) rang += 20;
  if (s.localService) rang += 5;
  if (s.default) rang += 2;
  // Effekt- und Spaßstimmen von macOS nie automatisch wählen
  if (/eddy|flo|grandma|grandpa|oma|opa|reed|rocko|sandy|shelley|bubbles|bells|boing|jester|organ|whisper|zarvox|trinoids|cellos|bahh|albert|fred|junior|ralph|kathy|superstar|wobble|good news|bad news/iu.test(s.name)) rang -= 50;
  return rang;
}

/** Stimmen für die Buchsprache, beste zuerst. */
export function stimmenFuer<T extends StimmeInfo>(stimmen: readonly T[], sprache: Sprache = 'de'): T[] {
  return stimmen
    .filter((s) => stimmenRang(s, sprache) >= 0)
    .sort((a, b) => stimmenRang(b, sprache) - stimmenRang(a, sprache) || a.name.localeCompare(b.name, localeVon(sprache)));
}

/** Deutsche Stimmen, beste zuerst. */
export function deutscheStimmen<T extends StimmeInfo>(stimmen: readonly T[]): T[] {
  return stimmenFuer(stimmen, 'de');
}

/**
 * Gewählte Stimme (falls noch vorhanden und – bei englischer Buchsprache – eine englische), sonst die beste
 * Stimme der Buchsprache, sonst null. Bei Deutsch gilt die Wahl wie bisher unabhängig von ihrer Sprache.
 */
export function waehleStimme<T extends StimmeInfo>(stimmen: readonly T[], gewuenscht: string | null, sprache: Sprache = 'de'): T | null {
  if (gewuenscht) {
    const g = stimmen.find((s) => s.voiceURI === gewuenscht);
    if (g && (sprache === 'de' || stimmenRang(g, sprache) >= 0)) return g;
  }
  return stimmenFuer(stimmen, sprache)[0] ?? null;
}

let say: SaySprachausgabe | null = null;

/** Sprachausgabe des Systems (Mac-App: `say`, Browser: Web Speech API) oder null, wenn es keine gibt. */
export function sprachausgabe(): SpeechSynthesis | null {
  if (istTauri()) return (say ??= new SaySprachausgabe()) as unknown as SpeechSynthesis;
  const s = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  return s && typeof globalThis.SpeechSynthesisUtterance === 'function' ? s : null;
}

/** Äußerung passend zu `sprachausgabe()`, `lang` nach der Buchsprache (de-DE bzw. en-US). */
export function neueAeusserung(text: string, sprache: Sprache = 'de'): SpeechSynthesisUtterance {
  const lang = localeVon(sprache);
  if (istTauri()) return new SayAeusserung(text, lang) as unknown as SpeechSynthesisUtterance;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  return u;
}

/** Wie bei `start` des Vorlesens: ab Anfang, ab Cursor (Standard) oder nur die Auswahl. */
export type VorleseStart = 'anfang' | 'cursor';
let naechsterStart: VorleseStart = 'cursor';

export function vorlesenAb(start: VorleseStart): void {
  naechsterStart = start;
}

/** Holt den gewünschten Start ab (danach wieder „ab Cursor“). */
export function vorleseStartAbholen(): VorleseStart {
  const s = naechsterStart;
  naechsterStart = 'cursor';
  return s;
}
