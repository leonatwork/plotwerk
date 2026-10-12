/**
 * Lesevorschau – Seitengeometrie (rein). Alle Maße in CSS-Pixeln, ganzzahlig, damit Messung und Anzeige
 * exakt übereinstimmen.
 *
 * Buch: Romanformat 12,5 × 19 cm. Schrift und Ränder wachsen mit der Seitenhöhe (eine 19-cm-Seite trägt
 * etwa 51 Schriftgrade), dadurch bleibt der Umbruch bei jeder Fenstergröße nahezu gleich.
 * E-Book: Spaltenbreite nach Lesemaß (höchstens ~32 Geviert), auf breiten Flächen zwei Spalten.
 */

export interface Fluss {
  /** Breite einer Spalte (Satzspiegel) */
  breite: number;
  /** Höhe einer Spalte (ganze Zeilen + Reserve) */
  hoehe: number;
  /** Spaltenabstand im Mehrspaltensatz */
  abstand: number;
  /** Schriftgrad */
  schrift: number;
  /** Zeilenhöhe (Grundlinienraster) */
  zeile: number;
  /** Zeilen je Spalte */
  zeilen: number;
  /** Überstand des sichtbaren Fensters (Kursive, Unterlängen) */
  beschnitt: number;
}

export interface BuchGeometrie {
  art: 'buch';
  doppel: boolean;
  seiteBreite: number;
  seiteHoehe: number;
  rand: { oben: number; unten: number; innen: number; aussen: number };
  fluss: Fluss;
  schluessel: string;
}

export interface EbookGeometrie {
  art: 'ebook';
  /** Spalten je Bildschirmseite (1 oder 2) */
  spalten: number;
  /** Breite der sichtbaren Textfläche (alle Spalten + Abstände) */
  breite: number;
  fluss: Fluss;
  schluessel: string;
}

export type Geometrie = BuchGeometrie | EbookGeometrie;

export const BUCH_VERHAELTNIS = 125 / 190;
/** Seitenhöhe in Schriftgraden (19 cm bei ~10,5 pt) */
const BUCH_GRADE = 51;
const BUCH_ZEILE = 1.36;

/** Abstand der Buchseiten zum Rand der Bühne */
export const BUEHNE_RAND = { senkrecht: 24, waagrecht: 56 };

function fluss(breite: number, verfuegbarHoehe: number, schrift: number, zeilenFaktor: number, abstand: number): Fluss {
  const zeile = Math.round(schrift * zeilenFaktor * 100) / 100;
  const zeilen = Math.max(3, Math.floor(verfuegbarHoehe / zeile));
  // Reserve unter der letzten Zeile (Rundung der Zeilenboxen), reicht nie für eine weitere Zeile
  const hoehe = Math.floor(zeilen * zeile + zeile * 0.35);
  return { breite, hoehe, abstand, schrift, zeile, zeilen, beschnitt: Math.max(4, Math.round(schrift * 0.45)) };
}

/** Buchseiten für eine Bühne der Größe b × h. */
export function buchGeometrie(b: number, h: number): BuchGeometrie {
  const hoeheMax = Math.max(240, h - 2 * BUEHNE_RAND.senkrecht);
  const breiteMax = Math.max(160, b - 2 * BUEHNE_RAND.waagrecht);
  // Schriftgrad in Viertelpixeln, damit kleine Größenänderungen den Satz nicht ändern
  const viertel = (x: number) => Math.max(7, Math.floor(x * 4) / 4);
  let schrift = viertel(hoeheMax / BUCH_GRADE);
  const seiteBreiteBei = (s: number) => Math.round(Math.round(s * BUCH_GRADE) * BUCH_VERHAELTNIS);
  let doppel = 2 * seiteBreiteBei(schrift) <= breiteMax;
  if (!doppel && seiteBreiteBei(schrift) > breiteMax) schrift = viertel(breiteMax / BUCH_VERHAELTNIS / BUCH_GRADE);
  const seiteHoehe = Math.round(schrift * BUCH_GRADE);
  const seiteBreite = seiteBreiteBei(schrift);
  if (doppel && 2 * seiteBreite > breiteMax) doppel = false;
  const rand = {
    oben: Math.round(schrift * 4.6),
    unten: Math.round(schrift * 5.2),
    innen: Math.round(schrift * 3.5),
    aussen: Math.round(schrift * 4.3),
  };
  const satzBreite = seiteBreite - rand.innen - rand.aussen;
  const f = fluss(satzBreite, seiteHoehe - rand.oben - rand.unten, schrift, BUCH_ZEILE, Math.round(schrift * 3));
  return {
    art: 'buch',
    doppel,
    seiteBreite,
    seiteHoehe,
    rand,
    fluss: f,
    schluessel: `buch|${f.breite}|${f.hoehe}|${f.abstand}|${f.schrift}|${f.zeile}`,
  };
}

export const SCHRIFTSTUFEN = [15, 17, 19, 21, 24] as const;
export const ZEILENABSTAENDE = { eng: 1.4, normal: 1.58, weit: 1.78 } as const;
export type Zeilenabstand = keyof typeof ZEILENABSTAENDE;

/** E-Book-Satz für eine Bühne der Größe b × h. */
export function ebookGeometrie(b: number, h: number, schriftstufe: number, zeilenabstand: Zeilenabstand): EbookGeometrie {
  const schrift = SCHRIFTSTUFEN[Math.min(SCHRIFTSTUFEN.length - 1, Math.max(0, Math.round(schriftstufe)))] ?? 19;
  const randW = Math.round(Math.min(72, Math.max(24, b * 0.05)));
  const randS = Math.round(Math.min(48, Math.max(20, h * 0.05)));
  const breite = Math.max(200, b - 2 * randW);
  const hoehe = Math.max(160, h - 2 * randS);
  const abstand = Math.round(Math.max(48, schrift * 3.2));
  const mass = Math.round(schrift * 32);
  const zweiSpalten = breite >= 2 * Math.round(schrift * 24) + abstand;
  const spalten = zweiSpalten ? 2 : 1;
  const spaltenBreite = zweiSpalten ? Math.min(mass, Math.floor((breite - abstand) / 2)) : Math.min(Math.round(mass * 1.08), breite);
  const f = fluss(spaltenBreite, hoehe, schrift, ZEILENABSTAENDE[zeilenabstand] ?? ZEILENABSTAENDE.normal, abstand);
  return {
    art: 'ebook',
    spalten,
    breite: spalten * f.breite + (spalten - 1) * f.abstand,
    fluss: f,
    schluessel: `ebook|${spalten}|${f.breite}|${f.hoehe}|${f.abstand}|${f.schrift}|${f.zeile}`,
  };
}

/** Abstand von Spalte zu Spalte im Mehrspaltensatz */
export function spaltenTakt(f: Fluss): number {
  return f.breite + f.abstand;
}

/** Geschätzte Zeichen je Spalte (bis die Messung vorliegt) */
export function zeichenJeSpalte(f: Fluss): number {
  return Math.max(200, (f.breite / (f.schrift * 0.46)) * f.zeilen * 0.92);
}
