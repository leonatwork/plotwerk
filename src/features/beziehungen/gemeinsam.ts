/**
 * Gemeinsame reine Hilfen für Beziehungen, Gruppen und Hinweise (ohne Store, ohne DOM).
 */
import { ankerErzeugen, ankerFinden, findeZitat, klartext, type Bereich } from '@core/text/index';
import type { BeziehungsKategorie, GruppenTyp, Id, ProjektDaten, Strang, TextAnker } from '@core/model/types';

/** Kapitel-ID → Nummer (1-basiert, Reihenfolge aus projekt.kapitel). */
export function kapitelNummern(daten: ProjektDaten): Record<Id, number> {
  const n: Record<Id, number> = {};
  daten.projekt.kapitel.forEach((id, i) => (n[id] = i + 1));
  return n;
}

export function kapitelIndex(daten: ProjektDaten, id: Id | null | undefined): number {
  return id ? daten.projekt.kapitel.indexOf(id) : -1;
}

/** „Kap. 7“ bzw. „Kap. ?“ für unbekannte IDs. */
export function kapLabel(daten: ProjektDaten, id: Id): string {
  const i = kapitelIndex(daten, id);
  return i >= 0 ? `Kap. ${i + 1}` : 'Kap. ?';
}

/** „Kap. 7 · Rot“ */
export function kapitelTitel(daten: ProjektDaten, id: Id): string {
  const titel = daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id;
  return `${kapLabel(daten, id)} · ${titel}`;
}

const ROEMISCH: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function roemisch(n: number): string {
  if (n <= 0 || n >= 40) return String(n);
  let rest = n;
  let s = '';
  for (const [w, z] of ROEMISCH)
    while (rest >= w) {
      s += z;
      rest -= w;
    }
  return s;
}

// ---------------------------------------------------------------------------
// Farben (nur Tokens; unbekannte Strangfarben aus den Daten werden mit Tokens gemischt)
// ---------------------------------------------------------------------------

export interface FarbSatz {
  /** Linien, Punkte */
  farbe: string;
  /** Kartenrand */
  linie: string;
  /** Flächen (Gruppen, unsichere Karten) */
  flaeche: string;
  flaecheLinie: string;
  /** Beschriftungen */
  dunkel: string;
  /** gestrichelter Rand der Platzhalterkarte */
  gestrichelt: string;
  /** Name für die Legende („Blaue Fläche“) */
  name: string;
}

const mische = (farbe: string, anteil: number, mit = 'var(--surface)') => `color-mix(in srgb, ${farbe} ${anteil}%, ${mit})`;

const BEKANNT: Record<string, FarbSatz> = {
  '#3d5a75': {
    farbe: 'var(--strang-arbeit)',
    linie: 'var(--arbeit-line)',
    flaeche: 'var(--arbeit-flaeche)',
    flaecheLinie: 'var(--arbeit-flaeche-line)',
    dunkel: 'var(--arbeit-dark)',
    gestrichelt: 'var(--arbeit-line)',
    name: 'Blaue',
  },
  '#c2405c': {
    farbe: 'var(--strang-dates)',
    linie: 'var(--accent-line)',
    flaeche: 'var(--accent-flaeche)',
    flaecheLinie: 'var(--accent-line)',
    dunkel: 'var(--accent-dark)',
    gestrichelt: 'var(--accent-line)',
    name: 'Rosa',
  },
  '#a86a12': {
    farbe: 'var(--strang-warm)',
    linie: 'var(--notiz-line)',
    flaeche: 'var(--warm-flaeche)',
    flaecheLinie: 'var(--notiz-line)',
    dunkel: 'var(--warm-dark)',
    gestrichelt: 'var(--notiz-line)',
    name: 'Ockerfarbene',
  },
  '#6a4c9c': {
    farbe: 'var(--strang-violett)',
    linie: mische('var(--strang-violett)', 40),
    flaeche: mische('var(--strang-violett)', 8),
    flaecheLinie: mische('var(--strang-violett)', 30),
    dunkel: 'var(--vage-dark)',
    gestrichelt: mische('var(--strang-violett)', 55),
    name: 'Violette',
  },
  '#4a4a4f': {
    farbe: 'var(--strang-organisation)',
    linie: 'var(--organisation-line)',
    flaeche: 'var(--organisation-flaeche)',
    flaecheLinie: 'var(--organisation-line)',
    dunkel: 'var(--organisation-dark)',
    gestrichelt: 'var(--organisation-dashed)',
    name: 'Graue',
  },
};

export const NEUTRAL: FarbSatz = {
  farbe: 'var(--ink-quiet)',
  linie: 'var(--chip-line)',
  flaeche: 'var(--surface-muted)',
  flaecheLinie: 'var(--line)',
  dunkel: 'var(--ink-soft)',
  gestrichelt: 'var(--dotted)',
  name: 'Neutrale',
};

/** Farbsatz zu einer Strangfarbe (Hex aus plan/straenge.md). */
export function farbSatz(hex: string | undefined | null): FarbSatz {
  if (!hex) return NEUTRAL;
  const bekannt = BEKANNT[hex.trim().toLowerCase()];
  if (bekannt) return bekannt;
  if (!/^#[0-9a-f]{3,8}$/i.test(hex.trim())) return NEUTRAL;
  const f = hex.trim();
  return {
    farbe: f,
    linie: mische(f, 40),
    flaeche: mische(f, 9),
    flaecheLinie: mische(f, 30),
    dunkel: mische(f, 75, 'var(--ink)'),
    gestrichelt: mische(f, 55),
    name: 'Farbige',
  };
}

export const KATEGORIE_LABEL: Record<BeziehungsKategorie, string> = {
  arbeit: 'Arbeit',
  dates: 'Dates',
  sonstige: 'Sonstige',
};

export const KATEGORIEN: BeziehungsKategorie[] = ['arbeit', 'dates', 'sonstige'];

/** Ersatzfarbe einer Beziehung ohne Strang. */
export function kategorieFarbe(k: BeziehungsKategorie): FarbSatz {
  if (k === 'arbeit') return BEKANNT['#3d5a75']!;
  if (k === 'dates') return BEKANNT['#c2405c']!;
  return NEUTRAL;
}

export function strangVon(daten: ProjektDaten, id: Id | undefined | null): Strang | undefined {
  return id ? daten.straenge.find((s) => s.id === id) : undefined;
}

export const GRUPPENTYP_LABEL: Record<GruppenTyp, string> = {
  antagonist: 'Antagonist',
  firma: 'Firma',
  familie: 'Familie',
  sonstige: 'Gruppe',
};

// ---------------------------------------------------------------------------
// Textstellen
// ---------------------------------------------------------------------------

export interface Stelle {
  anker: TextAnker;
  bereich: Bereich;
  klartext: string;
}

/** Sucht ein wörtliches Zitat im Kapitel (normalisiert, E6). null = nicht gefunden. */
export function findeStelle(daten: ProjektDaten, kapitel: Id, zitat: string): Stelle | null {
  const md = daten.kapitel[kapitel]?.text;
  if (!md || !zitat.trim()) return null;
  const kt = klartext(md);
  const treffer = findeZitat(kt, zitat)[0];
  if (!treffer) return null;
  return { anker: ankerErzeugen(kapitel, kt, treffer.start, treffer.ende), bereich: treffer, klartext: kt };
}

/** Findet einen gespeicherten Anker wieder; null = verwaist. */
export function findeAnker(daten: ProjektDaten, anker: TextAnker): Stelle | null {
  const md = daten.kapitel[anker.kapitel]?.text;
  if (!md) return null;
  const kt = klartext(md);
  const b = ankerFinden(kt, anker);
  return b ? { anker, bereich: b, klartext: kt } : null;
}

/** Anker für „Stelle öffnen“: gefundene Stelle, sonst das Zitat ohne Kontext (der Editor sucht selbst). */
export function ankerFuerZitat(daten: ProjektDaten, kapitel: Id, zitat: string): TextAnker {
  return findeStelle(daten, kapitel, zitat)?.anker ?? { kapitel, exakt: zitat, davor: '', danach: '' };
}

/** Satz um eine Stelle im Klartext, höchstens `max` Zeichen, mit „…“ gekürzt. */
export function ausschnitt(kt: string, start: number, ende: number, max = 110): string {
  const grenzen = /[.!?…\n]/;
  let a = start;
  while (a > 0 && !grenzen.test(kt[a - 1]!)) a--;
  let e = ende;
  while (e < kt.length && !grenzen.test(kt[e]!)) e++;
  if (e < kt.length && kt[e] !== '\n') e++;
  // Leerraum und schließendes Anführungszeichen des vorigen Satzes überspringen
  while (a < start && /[\s“”"«‘’']/.test(kt[a]!)) a++;
  let s = kt.slice(a, e).trimEnd();
  if (s.length > max) {
    const mitte = Math.round((start + ende) / 2) - a;
    const von = Math.max(0, Math.min(s.length - max, mitte - Math.round(max / 2)));
    s = `${von > 0 ? '…' : ''}${s.slice(von, von + max).trim()}${von + max < s.length ? '…' : ''}`;
  }
  return s;
}

/** Text zwischen »…« (z. B. aus Hinweistiteln). */
export function guillemets(s: string): string[] {
  return [...s.matchAll(/[»„“"]([^«“”"]+)[«“”"]/g)].map((m) => m[1]!.trim()).filter(Boolean);
}
