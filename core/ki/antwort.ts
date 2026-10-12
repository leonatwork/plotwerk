/** Auswertung einer Messages-API-Antwort: stop_reason, JSON aus den Text-Blöcken, Token-Nutzung. */
import type { Sprache } from '../i18n';
import { meldungenIn } from './meldungen';

export type KiFehlerArt = 'nicht_bereit' | 'auftrag' | 'api' | 'antwort' | 'abgebrochen';

export class KiFehler extends Error {
  readonly art: KiFehlerArt;
  constructor(art: KiFehlerArt, nachricht: string) {
    super(nachricht);
    this.name = 'KiFehler';
    this.art = art;
  }
}

export interface Nutzung {
  eingabe: number;
  ausgabe: number;
  cacheGelesen: number;
  cacheGeschrieben: number;
}

export const LEERE_NUTZUNG: Nutzung = { eingabe: 0, ausgabe: 0, cacheGelesen: 0, cacheGeschrieben: 0 };

export interface Antwort {
  /** geparstes JSON oder null, wenn die Antwort verworfen wird */
  daten: unknown;
  /** Grund, warum `daten` fehlt */
  grund?: string;
  nutzung: Nutzung;
}

function zahl(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function leseNutzung(roh: Record<string, unknown>): Nutzung {
  const u = (roh.usage ?? {}) as Record<string, unknown>;
  return {
    eingabe: zahl(u.input_tokens),
    ausgabe: zahl(u.output_tokens),
    cacheGelesen: zahl(u.cache_read_input_tokens),
    cacheGeschrieben: zahl(u.cache_creation_input_tokens),
  };
}

export function addiere(a: Nutzung, b: Nutzung): Nutzung {
  return {
    eingabe: a.eingabe + b.eingabe,
    ausgabe: a.ausgabe + b.ausgabe,
    cacheGelesen: a.cacheGelesen + b.cacheGelesen,
    cacheGeschrieben: a.cacheGeschrieben + b.cacheGeschrieben,
  };
}

/**
 * Wirft KiFehler('api') bei einer Fehlerantwort; sonst Daten oder Verwerfungsgrund.
 * `oberflaeche`: Sprache der Meldungen (Oberflächensprache, Standard Deutsch).
 */
export function leseAntwort(roh: Record<string, unknown>, oberflaeche: Sprache = 'de'): Antwort {
  const m = meldungenIn(oberflaeche);
  if (!roh || typeof roh !== 'object') throw new KiFehler('api', m('leereAntwort'));
  if (roh.type === 'error') {
    const fehler = (roh.error ?? {}) as Record<string, unknown>;
    const text = typeof fehler.message === 'string' ? fehler.message : m('unbekannterFehler');
    throw new KiFehler('api', m('dienstFehler', { typ: String(fehler.type ?? 'error'), text }));
  }
  const nutzung = leseNutzung(roh);
  const stop = roh.stop_reason;
  if (stop === 'refusal') {
    const details = (roh.stop_details ?? {}) as Record<string, unknown>;
    const grund = typeof details.category === 'string' ? m('abgelehntKategorie', { kategorie: details.category }) : m('abgelehnt');
    return { daten: null, grund, nutzung };
  }
  if (stop === 'max_tokens') {
    return { daten: null, grund: m('abgeschnitten'), nutzung };
  }
  if (stop !== 'end_turn' && stop !== 'stop_sequence') {
    return { daten: null, grund: m('unerwartetesEnde', { stop: String(stop) }), nutzung };
  }
  const bloecke = Array.isArray(roh.content) ? (roh.content as Record<string, unknown>[]) : [];
  const text = bloecke
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text.trim()) return { daten: null, grund: m('keinText'), nutzung };
  try {
    return { daten: JSON.parse(text), nutzung };
  } catch {
    return { daten: null, grund: m('keinJson'), nutzung };
  }
}
