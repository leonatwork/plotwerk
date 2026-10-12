/**
 * Lesevorschau – Seitenplan, Blättern, Tasten und Leseposition (rein, ohne DOM).
 *
 * Ein Buch besteht aus Abschnitten (Titelei, Kapitel). Jeder Abschnitt hat `spalten` Inhaltsseiten
 * (im Buch: Spalten des Mehrspaltensatzes, im E-Book: Bildschirmseiten) und ggf. `leer` Vakatseiten,
 * damit das nächste Kapitel auf einer rechten (ungeraden) Seite beginnt.
 *
 * Die Leseposition ist inhaltsbezogen ({ abschnitt-ID, spalte }) und hängt an einem Textanker
 * ({ abschnitt-ID, block, zeichen } = Textanfang der aktuellen Seite). Der Anker wird nur beim Blättern
 * neu bestimmt, nie bei einer Neuberechnung des Satzes – so wandert die Position bei wiederholten
 * Größenänderungen nicht.
 */

export const TITELEI = '#titelei';

export interface AbschnittEingabe {
  id: string;
  /** Inhaltsseiten (≥ 1) */
  spalten: number;
  /** Seitenzahl ist nur geschätzt (Messung läuft noch) */
  geschaetzt?: boolean;
}

export interface Abschnitt extends AbschnittEingabe {
  /** Vakatseiten nach dem Abschnitt */
  leer: number;
  /** erste Seite (1-basiert) */
  start: number;
}

export interface Plan {
  abschnitte: Abschnitt[];
  gesamt: number;
  /** mindestens eine Seitenzahl ist geschätzt */
  geschaetzt: boolean;
  index: Map<string, number>;
}

export interface Ort {
  id: string;
  /** Seite im Abschnitt (0-basiert); Werte über das Ende hinaus = letzte Seite */
  spalte: number;
}

/** Textanfang einer Seite: Block (data-b-Index) und Zeichen im Block */
export interface Anker {
  id: string;
  block: number;
  zeichen: number;
}

export interface PlanOptionen {
  /** Abschnitte beginnen auf einer rechten (ungeraden) Seite (Buch) */
  rechts: boolean;
}

export function erstellePlan(eingaben: AbschnittEingabe[], optionen: PlanOptionen): Plan {
  const abschnitte: Abschnitt[] = [];
  const index = new Map<string, number>();
  let seite = 1;
  let geschaetzt = false;
  eingaben.forEach((e, i) => {
    const spalten = Math.max(1, Math.floor(e.spalten) || 1);
    const letzter = i === eingaben.length - 1;
    const leer = optionen.rechts && !letzter && (seite + spalten) % 2 === 0 ? 1 : 0;
    abschnitte.push({ ...e, spalten, leer, start: seite });
    index.set(e.id, i);
    if (e.geschaetzt) geschaetzt = true;
    seite += spalten + leer;
  });
  return { abschnitte, gesamt: seite - 1, geschaetzt, index };
}

function abschnittVon(plan: Plan, id: string): Abschnitt | undefined {
  const i = plan.index.get(id);
  return i === undefined ? undefined : plan.abschnitte[i];
}

/** Ort auf gültige Werte bringen (unbekannte ID → Anfang). */
export function normOrt(plan: Plan, ort: Ort): Ort {
  const a = abschnittVon(plan, ort.id) ?? plan.abschnitte[0];
  if (!a) return { id: ort.id, spalte: 0 };
  const max = a.spalten + a.leer - 1;
  return { id: a.id, spalte: Math.min(Math.max(0, Math.floor(ort.spalte) || 0), max) };
}

/** Globale Seitenzahl (1-basiert) eines Orts */
export function seiteVon(plan: Plan, ort: Ort): number {
  const n = normOrt(plan, ort);
  const a = abschnittVon(plan, n.id);
  return a ? a.start + n.spalte : 1;
}

/** Ort einer globalen Seite (wird auf 1 … gesamt begrenzt) */
export function ortVon(plan: Plan, seite: number): Ort {
  const liste = plan.abschnitte;
  if (liste.length === 0) return { id: TITELEI, spalte: 0 };
  const s = Math.min(Math.max(1, Math.floor(seite)), plan.gesamt);
  let lo = 0;
  let hi = liste.length - 1;
  while (lo < hi) {
    const mitte = (lo + hi + 1) >> 1;
    if (liste[mitte]!.start <= s) lo = mitte;
    else hi = mitte - 1;
  }
  const a = liste[lo]!;
  return { id: a.id, spalte: s - a.start };
}

export interface SeitenInfo {
  seite: number;
  ort: Ort;
  /** inhalt = Text bzw. Titelseite, leer = Vakatseite */
  art: 'inhalt' | 'leer';
  /** erste Seite des Abschnitts (Kapitelanfang) */
  anfang: boolean;
}

export function seitenInfo(plan: Plan, seite: number): SeitenInfo | null {
  if (seite < 1 || seite > plan.gesamt) return null;
  const ort = ortVon(plan, seite);
  const a = abschnittVon(plan, ort.id)!;
  return { seite, ort, art: ort.spalte < a.spalten ? 'inhalt' : 'leer', anfang: ort.spalte === 0 };
}

/** Doppelseite einer Seite: links gerade, rechts ungerade (Seite 1 steht allein rechts). */
export function doppelseite(seite: number): [number, number] {
  const links = seite % 2 === 0 ? seite : seite - 1;
  return [links, links + 1];
}

/** Sichtbare Seiten: Doppelseite oder Einzelseite (null = keine Seite an dieser Stelle). */
export function sichtbareSeiten(plan: Plan, ort: Ort, doppel: boolean): (SeitenInfo | null)[] {
  const p = seiteVon(plan, ort);
  if (!doppel) return [seitenInfo(plan, p)];
  const [l, r] = doppelseite(p);
  return [seitenInfo(plan, l), seitenInfo(plan, r)];
}

/** Erste Inhaltsseite der Ansicht – deren Textanfang ist die Leseposition. */
export function hauptseite(plan: Plan, ort: Ort, doppel: boolean): SeitenInfo | null {
  const seiten = sichtbareSeiten(plan, ort, doppel);
  return seiten.find((s) => s?.art === 'inhalt') ?? seiten.find(Boolean) ?? null;
}

export type Richtung = 1 | -1;

/**
 * Eine Seite (bzw. Doppelseite) weiter oder zurück. Einzelseiten überspringen Vakatseiten.
 * Am Anfang/Ende bleibt der Ort unverändert (gleiches Objekt).
 */
export function blaettern(plan: Plan, ort: Ort, richtung: Richtung, doppel: boolean): Ort {
  const p = seiteVon(plan, ort);
  if (doppel) {
    const [links] = doppelseite(p);
    const ziel = links + 2 * richtung;
    if (ziel + 1 < 1 || ziel > plan.gesamt) return ort;
    // Hauptseite der neuen Doppelseite (links, außer vor Seite 1)
    return ortVon(plan, Math.max(1, ziel));
  }
  let ziel = p + richtung;
  while (ziel >= 1 && ziel <= plan.gesamt && seitenInfo(plan, ziel)?.art === 'leer') ziel += richtung;
  if (ziel < 1 || ziel > plan.gesamt) return ort;
  return ortVon(plan, ziel);
}

export function anfang(plan: Plan): Ort {
  return ortVon(plan, 1);
}

export function ende(plan: Plan): Ort {
  return ortVon(plan, plan.gesamt);
}

// ---------------------------------------------------------------------------
// Tasten
// ---------------------------------------------------------------------------

export type TastenAktion = 'vor' | 'zurueck' | 'anfang' | 'ende' | 'schliessen';

/** Taste → Aktion. Kombinationen mit ⌘, ctrl oder alt gehören der App. */
export function tastenAktion(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>): TastenAktion | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      return 'vor';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'zurueck';
    case ' ':
    case 'Spacebar':
      return e.shiftKey ? 'zurueck' : 'vor';
    case 'Home':
      return 'anfang';
    case 'End':
      return 'ende';
    case 'Escape':
      return 'schliessen';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Leseposition
// ---------------------------------------------------------------------------

export interface Lesestand {
  ort: Ort;
  /** Textanfang der aktuellen Seite; null = nach dem nächsten Zeichnen aus dem Satz bestimmen */
  anker: Anker | null;
}

/** Nach dem Blättern oder Springen: neuer Ort, der Anker wird aus dem neuen Satz bestimmt. */
export function nachNavigation(ort: Ort): Lesestand {
  return { ort, anker: null };
}

/**
 * Nach einer Neuberechnung des Satzes (Fenstergröße, Schrift, Text): die Seite, die den Anker enthält.
 * `seiteMitAnker` liefert die Seite im Abschnitt des Ankers im neuen Satz (null = nicht bestimmbar).
 * Der Anker bleibt unverändert.
 */
export function nachNeuberechnung(stand: Lesestand, plan: Plan, seiteMitAnker: (anker: Anker) => number | null): Lesestand {
  const anker = stand.anker;
  if (!anker || !plan.index.has(anker.id)) return stand;
  const gefunden = seiteMitAnker(anker);
  if (gefunden === null) return stand;
  // nicht gegen den Plan begrenzen: Seitenzahlen können noch geschätzt sein (Anzeige begrenzt selbst)
  const spalte = Math.max(0, Math.floor(gefunden));
  if (anker.id === stand.ort.id && spalte === stand.ort.spalte) return stand;
  return { ort: { id: anker.id, spalte }, anker };
}

/** Gleiche Seite bzw. Doppelseite? */
export function gleicheAnsicht(plan: Plan, a: Ort, b: Ort, doppel: boolean): boolean {
  const pa = seiteVon(plan, a);
  const pb = seiteVon(plan, b);
  return doppel ? doppelseite(pa)[0] === doppelseite(pb)[0] : pa === pb;
}

/** Fortschritt 0…1 (Anteil gelesener Seiten bis einschließlich der aktuellen Ansicht) */
export function fortschritt(plan: Plan, ort: Ort, doppel: boolean): number {
  if (plan.gesamt <= 1) return 1;
  const p = seiteVon(plan, ort);
  const letzte = doppel ? Math.min(plan.gesamt, doppelseite(p)[1]) : p;
  return Math.min(1, Math.max(0, (letzte - 1) / (plan.gesamt - 1)));
}
