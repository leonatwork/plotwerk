/**
 * Vorlesen (G4) mit der Sprachausgabe des Systems (Web Speech API → auf dem Mac die macOS-Stimmen).
 * Gelesen wird Satz für Satz; so lässt sich der Satz zuverlässig markieren, Pause und Weiterlesen
 * beginnen am Anfang des aktuellen Satzes.
 *
 * In der Mac-App spricht macOS `say` über Rust-Kommandos (src/backend/tauri/vorlesen.ts,
 * src-tauri/src/vorlesen.rs) – unabhängig davon, ob die WKWebView die Web Speech API mitbringt; dieselben
 * Stimmen wie in den Systemeinstellungen. Im Browser (Demo) gilt die Web Speech API. Fehlt beides, zeigt
 * die Werkzeugleiste „Vorlesen ist hier nicht verfügbar“.
 */
import { saetze } from '@core/stil/index';
import { istTauri } from '../../../backend';
import { SayAeusserung, SaySprachausgabe } from '../../../backend/tauri/vorlesen';

export interface VorleseSatz {
  start: number;
  ende: number;
  text: string;
}

/** Sätze im Bereich [von, bis) – angeschnittene Sätze am Rand werden auf den Bereich gekürzt. */
export function vorleseSaetze(text: string, von = 0, bis = text.length): VorleseSatz[] {
  const ergebnis: VorleseSatz[] = [];
  for (const s of saetze(text)) {
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

/** Qualität einer Stimme für deutschen Text (höher = besser). */
export function stimmenRang(s: StimmeInfo): number {
  const lang = s.lang.replace('_', '-').toLowerCase();
  let rang = 0;
  if (lang === 'de-de') rang += 100;
  else if (lang.startsWith('de')) rang += 80;
  else return -1;
  if (/premium/iu.test(s.name)) rang += 30;
  else if (/enhanced|erweitert|verbessert|neural|siri/iu.test(s.name)) rang += 20;
  if (s.localService) rang += 5;
  if (s.default) rang += 2;
  // Effekt- und Spaßstimmen von macOS nie automatisch wählen
  if (/eddy|flo|grandma|grandpa|oma|opa|reed|rocko|sandy|shelley|bubbles|bells|boing|jester|organ|whisper|zarvox|trinoids|cellos|bahh|albert|fred|junior|ralph|kathy|superstar|wobble|good news|bad news/iu.test(s.name)) rang -= 50;
  return rang;
}

/** Deutsche Stimmen, beste zuerst. */
export function deutscheStimmen<T extends StimmeInfo>(stimmen: readonly T[]): T[] {
  return stimmen
    .filter((s) => stimmenRang(s) >= 0)
    .sort((a, b) => stimmenRang(b) - stimmenRang(a) || a.name.localeCompare(b.name, 'de'));
}

/** Gewählte Stimme (falls noch vorhanden), sonst die beste deutsche, sonst null. */
export function waehleStimme<T extends StimmeInfo>(stimmen: readonly T[], gewuenscht: string | null): T | null {
  if (gewuenscht) {
    const g = stimmen.find((s) => s.voiceURI === gewuenscht);
    if (g) return g;
  }
  return deutscheStimmen(stimmen)[0] ?? null;
}

let say: SaySprachausgabe | null = null;

/** Sprachausgabe des Systems (Mac-App: `say`, Browser: Web Speech API) oder null, wenn es keine gibt. */
export function sprachausgabe(): SpeechSynthesis | null {
  if (istTauri()) return (say ??= new SaySprachausgabe()) as unknown as SpeechSynthesis;
  const s = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  return s && typeof globalThis.SpeechSynthesisUtterance === 'function' ? s : null;
}

/** Äußerung passend zu `sprachausgabe()`. */
export function neueAeusserung(text: string): SpeechSynthesisUtterance {
  if (istTauri()) return new SayAeusserung(text) as unknown as SpeechSynthesisUtterance;
  return new SpeechSynthesisUtterance(text);
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
