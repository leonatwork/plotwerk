/** Gemeinsame Hooks für Statistik und Fassungen (G5). */
import type { Schreibstatistik } from '@core/model/types';
import { tagSchluessel } from '@core/statistik';
import { useEffect, useMemo, useState } from 'react';
import { f, locale, prozent as prozentFormat, texte, type Text, type Werte } from '../../i18n';
import { statistikMitOffenen } from '../../state/slices/statistik';
import { useStore } from '../../state/store';

/** Schreibstatistik inkl. der noch nicht gespeicherten Tageswerte. */
export function useSchreibstatistik(): Schreibstatistik {
  const gespeichert = useStore((s) => s.daten?.statistik);
  const offen = useStore((s) => s.statistik.offen);
  return useMemo(() => statistikMitOffenen(gespeichert, offen), [gespeichert, offen]);
}

/** Heutiges lokales Datum „JJJJ-MM-TT“; wechselt um Mitternacht. */
export function useHeute(): string {
  const [heute, setHeute] = useState(() => tagSchluessel(new Date()));
  useEffect(() => {
    const jetzt = new Date();
    const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1, 0, 0, 1);
    const t = setTimeout(() => setHeute(tagSchluessel(new Date())), morgen.getTime() - jetzt.getTime());
    return () => clearTimeout(t);
  }, [heute]);
  return heute;
}

const zahlSpeicher = new Map<string, Intl.NumberFormat>();

/** Zahlen und Prozent in der Oberflächensprache (gleiche Form wie Intl.NumberFormat: `zahl.format(n)`). */
export const zahl = {
  format: (n: number): string => {
    const l = locale();
    let nf = zahlSpeicher.get(l);
    if (!nf) {
      nf = new Intl.NumberFormat(l);
      zahlSpeicher.set(l, nf);
    }
    return nf.format(n);
  },
};
export const prozent = { format: (anteil: number): string => prozentFormat(anteil) };

/** Pluralform zu `n` wählen und `{n}` mit zwischengespeichertem Zahlformat einsetzen (Kalender: viele Zellen). */
export function mitZahl(vorlage: Text, n: number, werte: Werte = {}): string {
  const text = typeof vorlage === 'string' ? vorlage : n === 0 && vorlage.zero !== undefined ? vorlage.zero : Math.abs(n) === 1 ? vorlage.one : vorlage.other;
  return f(text, { ...werte, n: zahl.format(n) });
}

export function woerterText(n: number): string {
  return mitZahl(texte().gemeinsam.woerter, n);
}

export function tageText(n: number): string {
  return mitZahl(texte().gemeinsam.tage, n);
}

/**
 * Datumsformate je Oberflächensprache, zwischengespeichert: Der Kalender beschriftet über 700 Zellen,
 * ein neues Intl-Format pro Aufruf wäre spürbar langsam.
 */
const FORMATE = {
  tagLang: { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' },
  datumKurz: { day: 'numeric', month: 'short', year: 'numeric' },
  datumZeit: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  monat: { month: 'short' },
  wochentag: { weekday: 'short' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
const formatSpeicher = new Map<string, Intl.DateTimeFormat>();

export function datumsFormat(art: keyof typeof FORMATE): Intl.DateTimeFormat {
  const schluessel = `${locale()}|${art}`;
  let fmt = formatSpeicher.get(schluessel);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale(), FORMATE[art]);
    formatSpeicher.set(schluessel, fmt);
  }
  return fmt;
}

function lokalesDatum(tag: string): Date {
  const [j, m, t] = tag.split('-').map(Number) as [number, number, number];
  return new Date(j, m - 1, t);
}

/** „JJJJ-MM-TT“ → „Do., 8. Oktober 2026“ / „Thu, October 8, 2026“ */
export function tagAnzeige(tag: string): string {
  return datumsFormat('tagLang').format(lokalesDatum(tag));
}

/** „8. Okt. 2026“ / „Oct 8, 2026“ */
export function datumAnzeige(tag: string): string {
  return datumsFormat('datumKurz').format(lokalesDatum(tag));
}

/** ISO-Zeitpunkt → „1. Okt. 2026, 20:00“ / „Oct 1, 2026, 08:00 PM“ */
export function zeitpunktAnzeige(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : datumsFormat('datumZeit').format(d);
}
