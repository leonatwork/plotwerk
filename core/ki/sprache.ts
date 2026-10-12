/**
 * Antwortsprache der KI = Buchsprache (projekt.md → angaben.sprache, BCP-47; leer = Deutsch).
 *
 * Die Sprachangabe steuert nur, in welcher Sprache Prompts gebaut werden und das Modell seine Beobachtungen
 * formuliert. Sie ist kein Inhalt des Buchs und kein neues Feld an die KI im Sinne von E12 (gesendet wird nur
 * der Prompt in der passenden Sprache, nicht `angaben`). Für englische Bücher gibt es englische System-Prompts,
 * Aufgabentexte und Kontext-Beschriftungen; XML-Tags, Feldnamen und Enum-Werte des Schemas bleiben gleich
 * (Demo-Transport, Antwortprüfung). Aufgaben ohne englischen System-Prompt bekommen eine Sprachanweisung.
 */
import { buchSprache, type Sprache } from '../i18n';

export type { Sprache };

/** Buchsprache aus den Projektangaben. */
export function kiSprache(angaben?: { sprache?: string } | null): Sprache {
  return buchSprache(angaben);
}

/** Schluss jedes englischen System-Prompts. */
export const ANTWORTSPRACHE_EN =
  'Language: the manuscript is written in English. Write every free-text field of your answer (titles, explanations, reasons, summaries, answers, questions, names of threads) in English. Quotes stay exactly as in the text, character for character.';

/** Für Aufgaben ohne eigenen englischen System-Prompt: deutscher Prompt + eindeutige Sprachanweisung. */
export const SPRACHANWEISUNG_EN = `${ANTWORTSPRACHE_EN} Rules above that only concern German (German quotation marks, the capitalised “Sie”, German grammar) do not apply; apply the English equivalents.`;

/** System-Prompt für die Buchsprache: englische Fassung, sonst deutsche Fassung mit Sprachanweisung. */
export function systemFuer(de: string, en: string | undefined, sprache: Sprache | undefined): string {
  if (sprache !== 'en') return de;
  return en ?? `${de}\n\n${SPRACHANWEISUNG_EN}`;
}

/** Kurzform „Kap. 3“ / „Ch. 3“ für Aufgabentexte an das Modell. */
export function kapKurz(nr: number | string, sprache: Sprache | undefined): string {
  return sprache === 'en' ? `Ch. ${nr}` : `Kap. ${nr}`;
}

/** Anführungszeichen der Buchsprache für Aufgabentexte an das Modell. */
export function zitiert(text: string, sprache: Sprache | undefined): string {
  return sprache === 'en' ? `“${text}”` : `„${text}“`;
}
