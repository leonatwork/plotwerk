/** Anzeigenamen der Hinweis-Typen – gemeinsam für die Hinweise-Ansicht (src/features/hinweise) und die Lektoratsmappe (core/abgabe). */
import type { HinweisTyp } from '../model/types';

/** Reihenfolge wie in der Anforderung (Hinweis-Typen). */
export const HINWEIS_TYP_NAME: Record<HinweisTyp, string> = {
  pruefen: 'Prüfen',
  schreibweise: 'Schreibweise',
  offener_faden: 'Offener Faden',
  unbekannt: 'Unbekannt',
  struktur: 'Struktur',
  zeitleiste: 'Zeitleiste',
  sprache: 'Sprache',
};

export const HINWEIS_TYP_REIHE = Object.keys(HINWEIS_TYP_NAME) as HinweisTyp[];
