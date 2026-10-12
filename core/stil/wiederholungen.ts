/**
 * Wiederholungen im Kapiteltext (G4, lokal, ohne KI): häufige Wörter, wiederholte Satzanfänge und das
 * gleiche Wort in kurzer Distanz. Das Ergebnis markiert nur Stellen – es schlägt nie einen anderen Text vor.
 */
import { saetze, STOPPWOERTER, woerter, type Satz, type Wort } from './woerter';

export interface Stelle {
  start: number;
  ende: number;
}

export interface HaeufigesWort {
  /** häufigste Schreibweise im Text */
  wort: string;
  stamm: string;
  anzahl: number;
  /** Anteil an allen Wörtern (0–1) */
  anteil: number;
  stellen: Stelle[];
}

export interface NaheWiederholung {
  wort: string;
  stamm: string;
  /** zwei oder mehr Vorkommen, die jeweils höchstens `abstand` Wörter auseinanderliegen */
  stellen: Stelle[];
  /** kleinster Abstand in Wörtern */
  abstand: number;
}

export interface SatzanfangFolge {
  /** Anfangswort wie im ersten Satz der Folge */
  wort: string;
  stamm: string;
  /** Sätze direkt hintereinander mit demselben Anfang */
  saetze: number;
  /** Stellen der Anfangswörter */
  stellen: Stelle[];
}

export interface SatzanfangStatistik {
  wort: string;
  stamm: string;
  anzahl: number;
  /** Anteil an allen Sätzen (0–1) */
  anteil: number;
}

export interface StilBericht {
  woerter: number;
  saetze: number;
  haeufig: HaeufigesWort[];
  nah: NaheWiederholung[];
  satzanfaenge: SatzanfangFolge[];
  /** die häufigsten Satzanfänge insgesamt */
  anfangsStatistik: SatzanfangStatistik[];
}

export interface StilOptionen {
  /** größter Abstand in Wörtern für „gleiches Wort in kurzer Distanz“ (Standard 30) */
  abstand?: number;
  /** Wörter, die nie gezählt werden (z. B. Figurennamen) – beliebige Schreibweise */
  ignorieren?: Iterable<string>;
  /** Anzahl der häufigsten Wörter (Standard 15) */
  grenze?: number;
  /** kürzeste Wortlänge für Häufigkeit und Nähe (Standard 4) */
  mindestLaenge?: number;
}

const STANDARD_ABSTAND = 30;

function ignorierMenge(ignorieren: Iterable<string> | undefined): Set<string> {
  const menge = new Set<string>();
  for (const name of ignorieren ?? []) {
    for (const w of woerter(name)) {
      menge.add(w.klein);
      menge.add(w.stamm);
    }
  }
  return menge;
}

function zaehlbar(w: Wort, ignoriert: Set<string>, mindestLaenge: number): boolean {
  if (w.text.length < mindestLaenge) return false;
  if (/\p{N}/u.test(w.text)) return false;
  if (STOPPWOERTER.has(w.klein)) return false;
  if (ignoriert.has(w.klein) || ignoriert.has(w.stamm)) return false;
  // Genitiv eines ignorierten Namens („Pauls“)
  if (/s$/u.test(w.klein) && ignoriert.has(w.klein.slice(0, -1))) return false;
  return true;
}

function stelle(w: Wort): Stelle {
  return { start: w.start, ende: w.ende };
}

/** häufigste Schreibweise einer Gruppe */
function haeufigsteForm(liste: Wort[]): string {
  const zaehler = new Map<string, number>();
  for (const w of liste) zaehler.set(w.text, (zaehler.get(w.text) ?? 0) + 1);
  let beste = liste[0]!.text;
  let max = 0;
  for (const [t, n] of zaehler) {
    if (n > max) {
      beste = t;
      max = n;
    }
  }
  return beste;
}

export function haeufigeWoerter(text: string, optionen: StilOptionen = {}): HaeufigesWort[] {
  const alle = woerter(text);
  const ignoriert = ignorierMenge(optionen.ignorieren);
  const mindest = optionen.mindestLaenge ?? 4;
  const gruppen = new Map<string, Wort[]>();
  for (const w of alle) {
    if (!zaehlbar(w, ignoriert, mindest)) continue;
    const g = gruppen.get(w.stamm);
    if (g) g.push(w);
    else gruppen.set(w.stamm, [w]);
  }
  const ergebnis: HaeufigesWort[] = [];
  for (const [s, liste] of gruppen) {
    if (liste.length < 2) continue;
    ergebnis.push({ wort: haeufigsteForm(liste), stamm: s, anzahl: liste.length, anteil: liste.length / Math.max(1, alle.length), stellen: liste.map(stelle) });
  }
  ergebnis.sort((a, b) => b.anzahl - a.anzahl || a.stellen[0]!.start - b.stellen[0]!.start);
  return ergebnis.slice(0, optionen.grenze ?? 15);
}

export function naheWiederholungen(text: string, optionen: StilOptionen = {}): NaheWiederholung[] {
  const abstand = Math.max(1, optionen.abstand ?? STANDARD_ABSTAND);
  const ignoriert = ignorierMenge(optionen.ignorieren);
  const mindest = optionen.mindestLaenge ?? 4;
  const letzte = new Map<string, Wort[]>();
  const ergebnis: NaheWiederholung[] = [];
  const abschliessen = (gruppe: Wort[]) => {
    if (gruppe.length < 2) return;
    let min = Infinity;
    for (let i = 1; i < gruppe.length; i++) min = Math.min(min, gruppe[i]!.nr - gruppe[i - 1]!.nr);
    ergebnis.push({ wort: gruppe[0]!.text, stamm: gruppe[0]!.stamm, stellen: gruppe.map(stelle), abstand: min });
  };
  for (const w of woerter(text)) {
    if (!zaehlbar(w, ignoriert, mindest)) continue;
    const gruppe = letzte.get(w.stamm);
    if (gruppe && w.nr - gruppe[gruppe.length - 1]!.nr <= abstand) {
      gruppe.push(w);
      continue;
    }
    if (gruppe) abschliessen(gruppe);
    letzte.set(w.stamm, [w]);
  }
  for (const gruppe of letzte.values()) abschliessen(gruppe);
  ergebnis.sort((a, b) => a.stellen[0]!.start - b.stellen[0]!.start);
  return ergebnis;
}

/** Sätze, die direkt hintereinander mit demselben Wort beginnen (ab zwei Sätzen). */
export function satzanfangFolgen(text: string, liste: Satz[] = saetze(text)): SatzanfangFolge[] {
  const ergebnis: SatzanfangFolge[] = [];
  let folge: Satz[] = [];
  const abschliessen = () => {
    if (folge.length >= 2) {
      const erstes = folge[0]!.erstesWort!;
      ergebnis.push({ wort: erstes.text, stamm: erstes.klein, saetze: folge.length, stellen: folge.map((s) => stelle(s.erstesWort!)) });
    }
    folge = [];
  };
  for (const s of liste) {
    const w = s.erstesWort;
    if (!w) {
      abschliessen();
      continue;
    }
    if (folge.length && folge[0]!.erstesWort!.klein === w.klein) folge.push(s);
    else {
      abschliessen();
      folge = [s];
    }
  }
  abschliessen();
  return ergebnis;
}

export function satzanfangStatistik(liste: Satz[], grenze = 5): SatzanfangStatistik[] {
  const gruppen = new Map<string, Wort[]>();
  for (const s of liste) {
    const w = s.erstesWort;
    if (!w) continue;
    const g = gruppen.get(w.klein);
    if (g) g.push(w);
    else gruppen.set(w.klein, [w]);
  }
  return [...gruppen.entries()]
    .filter(([, g]) => g.length >= 2)
    .map(([klein, g]) => ({ wort: haeufigsteForm(g), stamm: klein, anzahl: g.length, anteil: g.length / Math.max(1, liste.length) }))
    .sort((a, b) => b.anzahl - a.anzahl || a.wort.localeCompare(b.wort, 'de'))
    .slice(0, grenze);
}

/** Alle Stellen eines Wortes (gleiche Stammform) – für die Hervorhebung eines Wortes aus der Liste. */
export function stellenVon(text: string, stammform: string): Stelle[] {
  return woerter(text)
    .filter((w) => w.stamm === stammform || w.klein === stammform)
    .map(stelle);
}

export function stilBericht(text: string, optionen: StilOptionen = {}): StilBericht {
  const liste = saetze(text);
  return {
    woerter: woerter(text).length,
    saetze: liste.length,
    haeufig: haeufigeWoerter(text, optionen),
    nah: naheWiederholungen(text, optionen),
    satzanfaenge: satzanfangFolgen(text, liste),
    anfangsStatistik: satzanfangStatistik(liste),
  };
}
