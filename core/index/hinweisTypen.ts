/** Anzeigenamen der Hinweis-Typen – gemeinsam für die Hinweise-Ansicht (src/features/hinweise) und die Lektoratsmappe (core/abgabe). */
import type { Sprache } from '../i18n';
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

const HINWEIS_TYP_NAME_EN: Record<HinweisTyp, string> = {
  pruefen: 'Check',
  schreibweise: 'Spelling',
  offener_faden: 'Open thread',
  unbekannt: 'Unknown',
  struktur: 'Structure',
  zeitleiste: 'Timeline',
  sprache: 'Language',
};

/** Alle Anzeigenamen in der Sprache (gleiche Schlüssel und Reihenfolge wie HINWEIS_TYP_NAME). */
export function hinweisTypNamen(sprache: Sprache = 'de'): Record<HinweisTyp, string> {
  return sprache === 'en' ? HINWEIS_TYP_NAME_EN : HINWEIS_TYP_NAME;
}

/** Anzeigename eines Hinweis-Typs (Oberflächensprache in der App, Buchsprache in der Lektoratsmappe). */
export function hinweisTypName(typ: HinweisTyp, sprache: Sprache = 'de'): string {
  return hinweisTypNamen(sprache)[typ] ?? typ;
}
