/** Gemeinsame Hooks für Statistik und Fassungen (G5). */
import type { Schreibstatistik } from '@core/model/types';
import { tagSchluessel } from '@core/statistik';
import { useEffect, useMemo, useState } from 'react';
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

export const zahl = new Intl.NumberFormat('de-DE');
export const prozent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

export function woerterText(n: number): string {
  return `${zahl.format(n)} ${n === 1 ? 'Wort' : 'Wörter'}`;
}

export function tageText(n: number): string {
  return `${zahl.format(n)} ${n === 1 ? 'Tag' : 'Tage'}`;
}

const tagLang = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
const datumKurz = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const datumZeit = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** „JJJJ-MM-TT“ → „Do., 8. Oktober 2026“ */
export function tagAnzeige(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number) as [number, number, number];
  return tagLang.format(new Date(j, m - 1, t));
}

export function datumAnzeige(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number) as [number, number, number];
  return datumKurz.format(new Date(j, m - 1, t));
}

/** ISO-Zeitpunkt → „1. Okt. 2026, 20:00“ */
export function zeitpunktAnzeige(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : datumZeit.format(d);
}
