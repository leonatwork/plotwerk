/**
 * Übernahme von KI-Vorschlägen ins Netz: Positionen neuer Karten (kreisförmig, ohne Überlappung) und
 * Figur/Ort aus einem Vorschlag. Reine Funktionen ohne Store und DOM.
 */
import type { Figur, FigurVorschlag, Id, ProjektDaten } from '@core/model/types';
import { KARTE, type Rechteck } from './logik';

/** Abstand zwischen Karten (wie freiePosition) und Halbachsen der Ringe (Karten sind breiter als hoch). */
const ABSTAND = 16;
const RING_X = 250;
const RING_Y = 140;
const RAND = 24;

/** Was im Netz schon Platz belegt: Karten mit Position und Gruppenflächen. */
export function belegteFlaechen(daten: ProjektDaten): Rechteck[] {
  const r: Rechteck[] = [];
  for (const f of Object.values(daten.figuren)) if (f.netz) r.push({ x: f.netz.x, y: f.netz.y, breite: KARTE.breite, hoehe: KARTE.hoehe });
  for (const g of Object.values(daten.gruppen)) if (g.netz) r.push({ x: g.netz.x, y: g.netz.y, breite: g.netz.breite, hoehe: g.netz.hoehe });
  return r;
}

function ueberlappt(x: number, y: number, r: Rechteck): boolean {
  return !(x + KARTE.breite + ABSTAND <= r.x || r.x + r.breite + ABSTAND <= x || y + KARTE.hoehe + ABSTAND <= r.y || r.y + r.hoehe + ABSTAND <= y);
}

/** Plätze auf einer Ellipse: so viele, wie Karten mit Abstand auf den Umfang passen (gerade, mind. 6). */
function plaetze(rx: number, ry: number): number {
  const umfang = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2);
  // gerade Anzahl: symmetrisch links und rechts der Mitte
  return Math.max(6, 2 * Math.floor(umfang / (KARTE.breite + ABSTAND) / 2));
}

/**
 * Positionen (linke obere Ecke) für `anzahl` neue Karten: kreisförmig in Ringen um das vorhandene Netz (außerhalb
 * seiner Karten und Flächen, damit keine neue Karte auf bestehenden Linien liegt), ohne Überlappung mit `belegt`
 * und untereinander. Ist das Netz leer, liegt die erste Karte (z. B. die Hauptfigur) in der Mitte und die übrigen
 * auf Ringen darum.
 */
export function kreisPositionen(belegt: Rechteck[], anzahl: number): { x: number; y: number }[] {
  const ergebnis: Rechteck[] = [];
  if (anzahl <= 0) return [];
  const frei = (x: number, y: number) => x >= RAND && y >= RAND && ![...belegt, ...ergebnis].some((r) => ueberlappt(x, y, r));
  const setze = (x: number, y: number) => ergebnis.push({ x: Math.round(x), y: Math.round(y), breite: KARTE.breite, hoehe: KARTE.hoehe });

  let cx: number;
  let cy: number;
  /** Halbachsen des ersten Rings */
  let rx0 = RING_X;
  let ry0 = RING_Y;
  if (belegt.length > 0) {
    const links = Math.min(...belegt.map((r) => r.x));
    const oben = Math.min(...belegt.map((r) => r.y));
    const rechts = Math.max(...belegt.map((r) => r.x + r.breite));
    const unten = Math.max(...belegt.map((r) => r.y + r.hoehe));
    cx = (links + rechts) / 2;
    cy = (oben + unten) / 2;
    rx0 = (rechts - links) / 2 + KARTE.breite / 2 + 2 * ABSTAND;
    ry0 = (unten - oben) / 2 + KARTE.hoehe / 2 + 2 * ABSTAND;
  } else {
    // so viele Ringe, dass alle Karten Platz haben; die Mitte so, dass der äußerste Ring ins Bild passt
    let ringe = 0;
    for (let platz = 1; platz < anzahl; ) platz += plaetze(++ringe * RING_X, ringe * RING_Y);
    cx = RAND + ringe * RING_X + KARTE.breite / 2;
    cy = RAND + ringe * RING_Y + KARTE.hoehe / 2;
    setze(cx - KARTE.breite / 2, cy - KARTE.hoehe / 2);
  }

  for (let ring = 1; ergebnis.length < anzahl && ring <= 40; ring++) {
    const rx = rx0 + (ring - 1) * RING_X;
    const ry = ry0 + (ring - 1) * RING_Y;
    const n = plaetze(rx, ry);
    // jeder zweite Ring um einen halben Platz versetzt, damit die Karten nicht in einer Linie liegen
    const versatz = ring % 2 === 0 ? Math.PI / n : 0;
    for (let i = 0; i < n && ergebnis.length < anzahl; i++) {
      const winkel = -Math.PI / 2 + versatz + (2 * Math.PI * i) / n;
      const x = cx + rx * Math.cos(winkel) - KARTE.breite / 2;
      const y = cy + ry * Math.sin(winkel) - KARTE.hoehe / 2;
      if (frei(Math.round(x), Math.round(y))) setze(x, y);
    }
  }
  // Notfall (sehr volles Netz): Raster unterhalb von allem
  let unten = Math.max(RAND, ...[...belegt, ...ergebnis].map((r) => r.y + r.hoehe + ABSTAND));
  while (ergebnis.length < anzahl) {
    setze(RAND, unten);
    unten += KARTE.hoehe + ABSTAND;
  }
  return ergebnis.map((r) => ({ x: r.x, y: r.y }));
}

/** Neue Figur aus einem Vorschlag: Existenz gesichert, leerer Plan, private Felder leer. */
export function figurAusVorschlag(v: FigurVorschlag, id: Id, netz?: { x: number; y: number }): Figur {
  return {
    id,
    name: v.name,
    aliase: [...v.aliase],
    rolle: v.rolle,
    ...(v.kurz ? { kurz: v.kurz } : {}),
    existenz: 'gesichert',
    gruppe: null,
    beziehungen: [],
    plan: {},
    wahrheit: '',
    notizen: '',
    ...(netz ? { netz: { x: Math.round(netz.x), y: Math.round(netz.y) } } : {}),
  };
}
