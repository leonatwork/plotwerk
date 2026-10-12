/**
 * Mehrsprachigkeit der Oberfläche (Deutsch = Quellsprache und Standard, Englisch).
 *
 * In Komponenten:  const t = useTexte();  …  <Button>{t.gemeinsam.abbrechen}</Button>
 *                  f(t.schreiben.woerter, { n: 1234 })  → „1.234 Wörter“ / „1,234 words“
 * Außerhalb von React (Store, Befehle): texte(), sprache(), f(), zahl(), datum() …
 * Buchsprache (Typografie, Silbentrennung, Stil, KI): useBuchSprache() aus './buch'.
 *
 * Texte ergänzen: Schlüssel in src/i18n/de/<bereich>.ts, dieselbe Form in src/i18n/en/<bereich>.ts
 * (TypeScript meldet fehlende Schlüssel; i18n.test.ts prüft Platzhalter und Leerstellen).
 */
export type { Plural, Sprache, Text, Werte } from '@core/i18n';
export { buchSprache, localeVon, sprachCode } from '@core/i18n';
export { datum, datumZeit, f, liste, prozent, relativ, uhrzeit, vergleich, zahl } from './format';
export { useI18n, useSprache, useSprachWahl, useTexte } from './hooks';
export { browserSprache, festeSprache, initialisiereSprache, locale, setzeSprachWahl, sprache, texte, useSprachStore, woerterbuch } from './sprache';
export type { SprachWahl, Woerterbuch } from './typen';
