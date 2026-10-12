/** Zahlen, Daten und Listen im Format der Oberflächensprache (Intl). */
import { fmt as kernFmt, type Text, type Werte } from '@core/i18n';
import { locale, sprache } from './sprache';

/** Platzhalter/Pluralformen einsetzen; Zahlen im Format der Oberflächensprache. */
export function f(vorlage: Text, werte: Werte = {}): string {
  return kernFmt(vorlage, werte, sprache());
}

export function zahl(n: number, optionen?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(locale(), optionen);
}

/** Prozent aus einem Anteil 0…1 („42 %“ bzw. „42%“). */
export function prozent(anteil: number, stellen = 0): string {
  return anteil.toLocaleString(locale(), { style: 'percent', maximumFractionDigits: stellen });
}

function alsDatum(wert: Date | string | number): Date {
  if (wert instanceof Date) return wert;
  // „YYYY-MM-DD“ als lokales Datum (nicht UTC)
  if (typeof wert === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    const [j, m, t] = wert.split('-').map(Number);
    return new Date(j!, m! - 1, t!);
  }
  return new Date(wert);
}

/** Datum, Standard „12. Oktober 2026“ / „October 12, 2026“. */
export function datum(wert: Date | string | number, optionen: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  return alsDatum(wert).toLocaleDateString(locale(), optionen);
}

/** Datum mit Uhrzeit, Standard „12.10.2026, 14:05“ / „10/12/2026, 2:05 PM“. */
export function datumZeit(
  wert: Date | string | number,
  optionen: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
): string {
  return alsDatum(wert).toLocaleString(locale(), optionen);
}

/** Uhrzeit „14:05“ / „2:05 PM“. */
export function uhrzeit(wert: Date | string | number, optionen: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }): string {
  return alsDatum(wert).toLocaleTimeString(locale(), optionen);
}

/** „A, B und C“ / „A, B, and C“. */
export function liste(teile: string[], art: 'conjunction' | 'disjunction' = 'conjunction'): string {
  return new Intl.ListFormat(locale(), { style: 'long', type: art }).format(teile);
}

/** Relative Zeit („vor 3 Minuten“ / „3 minutes ago“). */
export function relativ(wert: number, einheit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(wert, einheit);
}

/** Alphabetischer Vergleich für Sortierungen in der Oberflächensprache. */
export function vergleich(a: string, b: string): number {
  return a.localeCompare(b, locale());
}
