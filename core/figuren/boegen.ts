/**
 * Figuren-Bögen (G3): je Figur eine Linie durchs Buch mit geplanten Entwicklungsstufen (plan/boegen.md).
 * Besitzer: G3 Figuren. Reines TypeScript ohne DOM/Tauri. Plan-Daten, gehen nicht an die KI (E12).
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { BogenStufe, Erwaehnung, ErwaehnungsArt, Figurenbogen, Id, ProjektDaten, TextAnker } from '../model/types';
import { ankerErzeugen, ankerFinden, findeZitat, klartext, normalisiere } from '../text';
import { BELEG_TEXTE } from '../zeit/beleg';

/** Beschriftungen (Oberflächensprache). */
const T = texteJe({ kap: 'Kap. {nr}', akt: 'Akt {nr}', ohneKapitel: 'ohne Kapitel', ohneAkt: 'ohne Akt' }, { kap: 'Ch. {nr}', akt: 'Act {nr}', ohneKapitel: 'no chapter', ohneAkt: 'no act' });

export function leererBogen(figur: Id): Figurenbogen {
  return { figur, stufen: [] };
}

/** Bogen einer Figur (leer, wenn es noch keinen gibt). */
export function bogenVon(boegen: Figurenbogen[] | undefined, figur: Id): Figurenbogen {
  return boegen?.find((b) => b.figur === figur) ?? leererBogen(figur);
}

/** Bögen mit ersetztem Bogen; ein Bogen ohne Stufen fällt aus der Liste. Reihenfolge der übrigen bleibt. */
export function setzeBogen(boegen: Figurenbogen[] | undefined, bogen: Figurenbogen): Figurenbogen[] {
  const liste = boegen ?? [];
  const i = liste.findIndex((b) => b.figur === bogen.figur);
  if (bogen.stufen.length === 0) return liste.filter((b) => b.figur !== bogen.figur);
  if (i < 0) return [...liste, bogen];
  return liste.map((b, j) => (j === i ? bogen : b));
}

/** Stabile Stufen-ID aus dem Titel (E1), eindeutig im Bogen. */
export function neueStufenId(bogen: Figurenbogen, titel: string): Id {
  const basis =
    normalisiere(titel)
      .text.toLocaleLowerCase('de')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'stufe';
  const vorhanden = new Set(bogen.stufen.map((s) => s.id));
  if (!vorhanden.has(basis)) return basis;
  for (let n = 2; ; n++) if (!vorhanden.has(`${basis}-${n}`)) return `${basis}-${n}`;
}

/** Kapitel eines Akts in Buchreihenfolge. */
export function kapitelDesAkts(daten: ProjektDaten, akt: number): Id[] {
  return daten.projekt.kapitel.filter((k) => daten.plaene[k]?.akt === akt);
}

export interface Spanne {
  /** Index in projekt.kapitel (einschließlich) */
  von: number;
  bis: number;
}

/** Wo die Stufe im Buch liegt: ein Kapitel oder alle Kapitel ihres Akts. null = ohne Platz. */
export function stufenSpanne(daten: ProjektDaten, stufe: BogenStufe): Spanne | null {
  const reihe = daten.projekt.kapitel;
  if (stufe.kapitel) {
    const i = reihe.indexOf(stufe.kapitel);
    if (i >= 0) return { von: i, bis: i };
  }
  if (stufe.akt !== undefined) {
    const idx = kapitelDesAkts(daten, stufe.akt).map((k) => reihe.indexOf(k));
    if (idx.length) return { von: Math.min(...idx), bis: Math.max(...idx) };
  }
  return null;
}

/** Stufen in Buchreihenfolge (Kapitel vor Akt bei gleichem Beginn), Stufen ohne Platz am Ende. */
export function sortiereStufen(daten: ProjektDaten, stufen: BogenStufe[]): BogenStufe[] {
  const mit = stufen.map((s, i) => ({ s, i, sp: stufenSpanne(daten, s) }));
  return mit
    .sort((a, b) => {
      if (!a.sp || !b.sp) return a.sp ? -1 : b.sp ? 1 : a.i - b.i;
      return a.sp.von - b.sp.von || a.sp.bis - b.sp.bis || a.i - b.i;
    })
    .map((x) => x.s);
}

/** Beschriftung des Platzes: „Kap. 3“ bzw. „Akt II“. */
export function stufenOrt(daten: ProjektDaten, stufe: BogenStufe, sprache: Sprache = 'de'): string {
  const t = T(sprache);
  if (stufe.kapitel) {
    const i = daten.projekt.kapitel.indexOf(stufe.kapitel);
    if (i >= 0) return fmt(t.kap, { nr: i + 1 });
  }
  if (stufe.akt !== undefined) return daten.akte.find((a) => a.nummer === stufe.akt)?.titel || fmt(t.akt, { nr: stufe.akt });
  return t.ohneKapitel;
}

/** Stufe ein Kapitel bzw. einen Akt weiter (richtung 1) oder zurück (-1); null am Rand. */
export function stufeVerschieben(daten: ProjektDaten, stufe: BogenStufe, richtung: -1 | 1): BogenStufe | null {
  const reihe = daten.projekt.kapitel;
  if (stufe.kapitel && reihe.includes(stufe.kapitel)) {
    const ziel = reihe[reihe.indexOf(stufe.kapitel) + richtung];
    return ziel ? { ...stufe, kapitel: ziel } : null;
  }
  if (stufe.akt !== undefined) {
    const nummern = daten.akte.map((a) => a.nummer).sort((a, b) => a - b);
    const ziel = nummern[nummern.indexOf(stufe.akt) + richtung];
    return ziel !== undefined && nummern.includes(stufe.akt) ? { ...stufe, akt: ziel } : null;
  }
  return null;
}

/** Vorschlag für eine neue Stufe: das erste Kapitel nach der letzten Stufe, sonst das erste Kapitel. */
export function naechstesKapitel(daten: ProjektDaten, bogen: Figurenbogen): Id | undefined {
  const reihe = daten.projekt.kapitel;
  let letzte = -1;
  for (const s of bogen.stufen) {
    const sp = stufenSpanne(daten, s);
    if (sp) letzte = Math.max(letzte, sp.bis);
  }
  return reihe[letzte + 1] ?? reihe[reihe.length - 1];
}

const ART_RANG: Record<ErwaehnungsArt, number> = { auftritt: 4, nachricht: 3, erwaehnt: 2, unbestimmt: 1 };

export interface KapitelAuftritt {
  kapitel: Id;
  anzahl: number;
  /** wichtigste Art: tritt auf > per Nachricht > erwähnt > im Text */
  art: ErwaehnungsArt;
  /** erste Erwähnung im Kapitel (für den Sprung in den Text) */
  erste: Erwaehnung;
}

/** Auftritte einer Figur je Kapitel aus index.erwaehnungen (exakt erkannt oder bestätigt). */
export function auftritteJeKapitel(erwaehnungen: Erwaehnung[], figur: Id): Map<Id, KapitelAuftritt> {
  const m = new Map<Id, KapitelAuftritt>();
  for (const e of erwaehnungen) {
    if (e.zielTyp !== 'figur' || e.ziel !== figur || !(e.quelle === 'exakt' || e.bestaetigt)) continue;
    const alt = m.get(e.kapitel);
    if (!alt) {
      m.set(e.kapitel, { kapitel: e.kapitel, anzahl: 1, art: e.art, erste: e });
      continue;
    }
    alt.anzahl++;
    if (ART_RANG[e.art] > ART_RANG[alt.art]) alt.art = e.art;
    if (e.start < alt.erste.start) alt.erste = e;
  }
  return m;
}

function kapitelKlartext(daten: ProjektDaten, kapitel: Id): string {
  return klartext(daten.kapitel[kapitel]?.text ?? '');
}

/** Beleg (E4-Anker) für ein wörtliches Zitat aus einem Kapitel; sonst ein lesbarer Fehler. */
export function belegAusZitat(daten: ProjektDaten, kapitel: Id, zitat: string, sprache: Sprache = 'de'): { anker: TextAnker } | { fehler: string } {
  const t = BELEG_TEXTE(sprache);
  const nr = daten.projekt.kapitel.indexOf(kapitel) + 1;
  const name = nr > 0 ? fmt(t.kap, { nr }) : fmt(t.unbekannt, { id: kapitel });
  const text = kapitelKlartext(daten, kapitel);
  if (!text.trim()) return { fehler: fmt(t.ohneText, { name }) };
  if (normalisiere(zitat).text.replace(/\s/g, '').length < 3) return { fehler: t.zuKurz };
  const treffer = findeZitat(text, zitat);
  const erster = treffer[0];
  if (!erster) return { fehler: fmt(t.nichtGefunden, { name }) };
  return { anker: ankerErzeugen(kapitel, text, erster.start, erster.ende) };
}

/** Beleg für eine Stelle (Offsets im Klartext des Kapitels, z. B. aus einer Erwähnung) mit dem ganzen Satz. */
export function belegAusStelle(daten: ProjektDaten, kapitel: Id, start: number, ende: number): TextAnker {
  const text = kapitelKlartext(daten, kapitel);
  let a = start;
  let b = ende;
  while (a > 0 && !/[.!?…\n]/.test(text[a - 1]!)) a--;
  while (b < text.length && !/[.!?…\n]/.test(text[b]!)) b++;
  if (b < text.length && text[b] !== '\n') b++;
  while (a < b && /\s/.test(text[a]!)) a++;
  return ankerErzeugen(kapitel, text, a, b);
}

/** Findet sich der Beleg noch eindeutig im Text? (E4: sonst „verwaist“) */
export function belegGefunden(daten: ProjektDaten, anker: TextAnker): boolean {
  const text = kapitelKlartext(daten, anker.kapitel);
  return !!text && ankerFinden(text, anker) !== null;
}

export function gleicherAnker(a: TextAnker, b: TextAnker): boolean {
  return a.kapitel === b.kapitel && a.exakt === b.exakt && a.davor === b.davor && a.danach === b.danach;
}

export type StufenMeldung =
  | { art: 'ohne_platz' }
  | { art: 'kein_auftritt'; kapitel: Id }
  | { art: 'verwaist'; anzahl: number };

/** Lokale Auffälligkeiten einer Stufe (nur Anzeige, keine Hinweise). */
export function stufenMeldungen(daten: ProjektDaten, stufe: BogenStufe, auftritte: Map<Id, KapitelAuftritt>): StufenMeldung[] {
  const m: StufenMeldung[] = [];
  const sp = stufenSpanne(daten, stufe);
  if (!sp) m.push({ art: 'ohne_platz' });
  if (stufe.kapitel && sp && daten.kapitel[stufe.kapitel]?.text.trim() && !auftritte.has(stufe.kapitel)) {
    m.push({ art: 'kein_auftritt', kapitel: stufe.kapitel });
  }
  const verwaist = stufe.belege.filter((b) => !belegGefunden(daten, b)).length;
  if (verwaist) m.push({ art: 'verwaist', anzahl: verwaist });
  return m;
}

/** Stufe, die in einem Kapitel gilt (die letzte, die dort oder davor beginnt). */
export function stufeImKapitel(daten: ProjektDaten, bogen: Figurenbogen, kapitel: Id): BogenStufe | undefined {
  const i = daten.projekt.kapitel.indexOf(kapitel);
  if (i < 0) return undefined;
  let treffer: BogenStufe | undefined;
  for (const s of sortiereStufen(daten, bogen.stufen)) {
    const sp = stufenSpanne(daten, s);
    if (sp && sp.von <= i) treffer = s;
  }
  return treffer;
}

/** Titel eines Kapitels (Manuskript, sonst Plan, sonst ID). */
export function kapitelTitel(daten: ProjektDaten, kapitel: Id): string {
  return daten.kapitel[kapitel]?.titel || daten.plaene[kapitel]?.titel || kapitel;
}

export interface AktGruppe {
  /** Aktnummer oder null (Kapitel ohne Akt) */
  akt: number | null;
  titel: string;
  /** Index in projekt.kapitel (einschließlich) */
  von: number;
  bis: number;
}

/** Aufeinanderfolgende Kapitel mit gleichem Akt als Gruppen (Kopfzeile des Rasters). */
export function aktGruppen(daten: ProjektDaten, sprache: Sprache = 'de'): AktGruppe[] {
  const t = T(sprache);
  const gruppen: AktGruppe[] = [];
  daten.projekt.kapitel.forEach((k, i) => {
    const akt = daten.plaene[k]?.akt ?? null;
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.akt === akt && letzte.bis === i - 1) {
      letzte.bis = i;
      return;
    }
    const titel = akt === null ? t.ohneAkt : daten.akte.find((a) => a.nummer === akt)?.titel || fmt(t.akt, { nr: akt });
    gruppen.push({ akt, titel, von: i, bis: i });
  });
  return gruppen;
}

export interface StufenPlatz {
  stufe: BogenStufe;
  spanne: Spanne;
  /** Zeile innerhalb des Bogens (0 = oben), damit sich überlappende Stufen nicht verdecken */
  spur: number;
  /**
   * Bis wohin die Stufe gilt (Index, einschließlich): bis vor die nächste Stufe des Bogens bzw. bis zum Buchende,
   * höchstens bis vor die nächste Stufe auf derselben Spur; nie kleiner als spanne.bis.
   */
  giltBis: number;
}

/**
 * Stufen mit Platz im Buch auf Spuren verteilt (Buchreihenfolge, jede Stufe auf die oberste freie Spur).
 * Stufen ohne Platz fehlen (sie stehen in der Bearbeitung unter dem Raster).
 */
export function stufenSpuren(daten: ProjektDaten, stufen: BogenStufe[]): { plaetze: StufenPlatz[]; spuren: number } {
  const enden: number[] = [];
  const plaetze: StufenPlatz[] = [];
  for (const stufe of sortiereStufen(daten, stufen)) {
    const spanne = stufenSpanne(daten, stufe);
    if (!spanne) continue;
    let spur = enden.findIndex((ende) => ende < spanne.von);
    if (spur < 0) {
      spur = enden.length;
      enden.push(spanne.bis);
    } else enden[spur] = spanne.bis;
    plaetze.push({ stufe, spanne, spur, giltBis: spanne.bis });
  }
  const letzte = daten.projekt.kapitel.length - 1;
  for (const p of plaetze) {
    const naechste = plaetze.filter((q) => q.spanne.von > p.spanne.von).map((q) => q.spanne.von);
    const naechsteSpur = plaetze.filter((q) => q.spur === p.spur && q.spanne.von > p.spanne.bis).map((q) => q.spanne.von);
    const grenze = Math.min(letzte + 1, ...naechste, ...naechsteSpur) - 1;
    p.giltBis = Math.max(p.spanne.bis, grenze);
  }
  return { plaetze, spuren: Math.max(1, enden.length) };
}

/** Sätze, in denen die Figur in einem Kapitel genannt wird (Vorschläge für Belege), je Satz einmal. */
export function belegVorschlaege(daten: ProjektDaten, erwaehnungen: Erwaehnung[], figur: Id, kapitel: Id, max = 6): TextAnker[] {
  const ergebnis: TextAnker[] = [];
  for (const e of erwaehnungen) {
    if (e.kapitel !== kapitel || e.zielTyp !== 'figur' || e.ziel !== figur || !(e.quelle === 'exakt' || e.bestaetigt)) continue;
    const anker = belegAusStelle(daten, kapitel, e.start, e.ende);
    if (!anker.exakt.trim() || ergebnis.some((a) => a.exakt === anker.exakt)) continue;
    ergebnis.push(anker);
    if (ergebnis.length >= max) break;
  }
  return ergebnis;
}
