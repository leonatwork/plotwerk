/**
 * Sprachen und Textbausteine ohne DOM (Besitzer: Fundament).
 *
 * - `Sprache`: die beiden unterstützten Sprachen. Deutsch ist Standard und Quellsprache.
 * - Texte sind Zeichenketten mit Platzhaltern `{name}` oder Pluralformen `{ one, other, zero? }`
 *   (gewählt über den Wert `n`). `fmt()` setzt beides ein.
 * - `texteJe(de, en)`: Wörterbuch für core-Module; `en` muss dieselbe Form haben wie `de`.
 * - Buchsprache (`projekt.angaben.sprache`, BCP-47) ≠ Oberflächensprache: `buchSprache()`.
 */

export type Sprache = 'de' | 'en';

export const SPRACHEN: readonly Sprache[] = ['de', 'en'];

/** Pluralformen; `zero` ist optional (sonst gilt `other` auch für 0). */
export interface Plural {
  zero?: string;
  one: string;
  other: string;
}

export type Text = string | Plural;

export type Werte = Record<string, string | number | null | undefined>;

export function istPlural(t: unknown): t is Plural {
  return typeof t === 'object' && t !== null && typeof (t as Plural).other === 'string' && typeof (t as Plural).one === 'string';
}

/** BCP-47-Locale für Intl je Sprache. */
export function localeVon(sprache: Sprache): string {
  return sprache === 'de' ? 'de-DE' : 'en-US';
}

/** Zahl im Format der Sprache (1.234 bzw. 1,234). */
export function zahlFormat(n: number, sprache: Sprache, optionen?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(localeVon(sprache), optionen);
}

/**
 * Setzt Platzhalter `{name}` ein; bei Pluralformen entscheidet `werte.n`.
 * Mit `sprache` werden Zahlen im Format der Sprache eingesetzt (sonst roh).
 * Unbekannte Platzhalter bleiben stehen (sichtbar statt still falsch).
 */
export function fmt(vorlage: Text, werte: Werte = {}, sprache?: Sprache): string {
  let text: string;
  if (istPlural(vorlage)) {
    const n = Number(werte.n ?? 0);
    text = n === 0 && vorlage.zero !== undefined ? vorlage.zero : Math.abs(n) === 1 ? vorlage.one : vorlage.other;
  } else text = vorlage;
  return text.replace(/\{(\w+)\}/g, (ganz, name: string) => {
    const w = werte[name];
    if (w === undefined || w === null) return ganz;
    return typeof w === 'number' && sprache ? zahlFormat(w, sprache) : String(w);
  });
}

/** Namen der Platzhalter einer Vorlage (für die Vollständigkeitstests de ↔ en). */
export function platzhalter(vorlage: Text): string[] {
  const teile = istPlural(vorlage) ? [vorlage.one, vorlage.other, vorlage.zero ?? ''] : [vorlage];
  const namen = new Set<string>();
  for (const t of teile) for (const m of t.matchAll(/\{(\w+)\}/g)) namen.add(m[1]!);
  return [...namen].sort();
}

/**
 * Sprache aus einem BCP-47-Code oder Namen („de“, „de-AT“, „Deutsch“, „en-GB“, „English“).
 * Leer → `standard`. Andere Sprachen → Englisch (typografisch und für die KI die neutralere Wahl).
 */
export function sprachCode(wert: string | null | undefined, standard: Sprache = 'de'): Sprache {
  const w = (wert ?? '').trim().toLowerCase();
  if (!w) return standard;
  if (w === 'de' || w.startsWith('de-') || w.startsWith('de_') || w.startsWith('deutsch') || w === 'german' || w === 'ger' || w === 'deu')
    return 'de';
  return 'en';
}

/** Sprache des Manuskripts (projekt.md → angaben.sprache, Standard Deutsch). */
export function buchSprache(angaben?: { sprache?: string } | null): Sprache {
  return sprachCode(angaben?.sprache, 'de');
}

/** Breitet Literal-Typen zu `string` aus, damit `en` dieselbe Form wie `de` haben muss. */
export type Form<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T extends readonly (infer E)[]
      ? readonly Form<E>[]
      : T extends object
        ? { [K in keyof T]: Form<T[K]> }
        : T;

/**
 * Wörterbuch für ein core-Modul: `const T = texteJe({ titel: 'Kap. {nr}' }, { titel: 'Ch. {nr}' })`,
 * dann `fmt(T(sprache).titel, { nr: 3 })`.
 */
export function texteJe<T>(de: T, en: Form<T>): (sprache?: Sprache) => T {
  return (sprache = 'de') => (sprache === 'en' ? (en as T) : de);
}
