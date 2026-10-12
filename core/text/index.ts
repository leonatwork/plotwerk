/**
 * Klartext, Normalisierung, Zitate und Textanker. Besitzer: Kernlogik.
 *
 * Klartext-Definition (verbindlich, auch für den Editor):
 * - Jeder Block (Absatz, Überschrift, Szenentrenner) ist ein Absatz.
 * - Absatztext = Text ohne Markdown-Auszeichnung (**, *, _, #-Präfix); harter Zeilenumbruch = "\n".
 * - Szenentrenner (Zeile "* * *") ergibt den Absatztext "* * *".
 * - Absätze werden mit "\n\n" verbunden. Leere Absätze entfallen.
 * Der Editor erzeugt aus seinem Dokument (textContent je Textblock, hardBreak = "\n",
 * horizontalRule = "* * *") exakt dieselbe Absatzfolge.
 *
 * Präzisierung (CommonMark über markdown-it, nur die Manuskript-Teilmenge – wie der Editor):
 * - Blöcke: Absatz, ATX-Überschrift („# …“), Setext-Überschrift (Text + Zeile aus = oder -),
 *   Szenentrenner (eigene Zeile aus ≥ 3 *, - oder _). Listen, Zitate, Code, Links, Entities, HTML
 *   sind KEINE Auszeichnung, sondern bleiben wörtlicher Text.
 * - Inline: **fett**, *kursiv*, __fett__, _kursiv_ nach CommonMark; "\" vor ASCII-Satzzeichen maskiert.
 * - Weicher Zeilenumbruch (einzelnes "\n" im Absatz) = " ", harter ("\\\n" oder "  \n") = "\n";
 *   führender Leerraum von Absatz- und Fortsetzungszeilen entfällt.
 * - „Leer“ heißt: nur Leerraum.
 */
import MarkdownIt from 'markdown-it';
import type { Id, TextAnker } from '../model/types';

export interface Absatz {
  text: string;
  /** Offsets im Klartext */
  start: number;
  ende: number;
}

export interface Bereich {
  start: number;
  ende: number;
}

export type BlockArt = 'absatz' | 'ueberschrift' | 'trenner' | 'code';

/** Ein Block des Markdown-Texts, auch leere (z. B. „#“ ohne Text). */
export interface Block {
  art: BlockArt;
  text: string;
  /** Zeilenbereich im Markdown [von, bis), 0-basiert */
  zeilen: [number, number] | null;
}

// ---------------------------------------------------------------------------
// Kleiner LRU-Speicher (Index rechnet bei jeder Änderung dieselben Kapitel durch)
// ---------------------------------------------------------------------------

class Zwischenspeicher<W> {
  private karte = new Map<string, W>();
  private groesse: number;
  constructor(groesse: number) {
    this.groesse = groesse;
  }
  hole(schluessel: string, berechne: () => W): W {
    const w = this.karte.get(schluessel);
    if (w !== undefined) {
      this.karte.delete(schluessel);
      this.karte.set(schluessel, w);
      return w;
    }
    const neu = berechne();
    this.karte.set(schluessel, neu);
    if (this.karte.size > this.groesse) this.karte.delete(this.karte.keys().next().value as string);
    return neu;
  }
}

// ---------------------------------------------------------------------------
// Markdown → Blöcke → Absätze
// ---------------------------------------------------------------------------

const md = new MarkdownIt('commonmark', { html: false }).disable(
  ['code', 'fence', 'blockquote', 'list', 'reference', 'html_block', 'backticks', 'link', 'image', 'autolink', 'html_inline', 'entity'],
  true,
);
type Token = ReturnType<typeof md.parse>[number];

function inlineText(kinder: Token[] | null): string {
  if (!kinder) return '';
  let s = '';
  for (const t of kinder) {
    switch (t.type) {
      case 'text':
      case 'code_inline':
      case 'html_inline':
        s += t.content;
        break;
      case 'softbreak':
        s += ' ';
        break;
      case 'hardbreak':
        s += '\n';
        break;
      case 'image':
        break;
      default:
        if (t.children) s += inlineText(t.children);
    }
  }
  return s;
}

function bloeckeBerechnen(markdown: string): Block[] {
  const tokens = md.parse(markdown, {});
  const ergebnis: Block[] = [];
  let offen: Token | null = null;
  for (const t of tokens) {
    if (t.nesting === 1) offen = t;
    if (t.type === 'inline') {
      const art: BlockArt = offen?.type === 'heading_open' ? 'ueberschrift' : 'absatz';
      ergebnis.push({ art, text: inlineText(t.children), zeilen: (t.map ?? offen?.map ?? null) as [number, number] | null });
    } else if (t.type === 'hr') {
      ergebnis.push({ art: 'trenner', text: '* * *', zeilen: t.map as [number, number] | null });
    } else if (t.type === 'code_block' || t.type === 'fence') {
      ergebnis.push({ art: 'code', text: t.content.replace(/\n$/, ''), zeilen: t.map as [number, number] | null });
    } else if (t.type === 'html_block') {
      ergebnis.push({ art: 'absatz', text: t.content.replace(/\n$/, ''), zeilen: t.map as [number, number] | null });
    }
  }
  return ergebnis;
}

const blockSpeicher = new Zwischenspeicher<Block[]>(256);

/** Alle Blöcke einschließlich leerer (für Struktur-Hinweise). */
export function bloecke(markdown: string): Block[] {
  return blockSpeicher.hole(markdown, () => bloeckeBerechnen(markdown));
}

const absatzSpeicher = new Zwischenspeicher<Absatz[]>(256);

export function absaetze(markdown: string): Absatz[] {
  return absatzSpeicher.hole(markdown, () => {
    const ergebnis: Absatz[] = [];
    let pos = 0;
    for (const b of bloecke(markdown)) {
      if (b.text.trim() === '') continue;
      if (ergebnis.length) pos += 2;
      ergebnis.push({ text: b.text, start: pos, ende: pos + b.text.length });
      pos += b.text.length;
    }
    return ergebnis;
  });
}

export function klartext(markdown: string): string {
  return absaetze(markdown).map((a) => a.text).join('\n\n');
}

/** Abschnitt eines Kapitels zwischen Szenentrennern „* * *“ (E3, G2 Szenen). */
export interface SzenenAbschnitt {
  /** 0 = vor dem ersten Trenner */
  index: number;
  /** Bereich im Klartext (klartext(markdown)), ohne Trenner; leere Szene: start = ende */
  start: number;
  ende: number;
  /** Klartext der Szene */
  text: string;
}

/** Teilt ein Kapitel an den Szenentrennern. Immer mindestens ein Abschnitt (auch bei leerem Text). */
export function szenenAbschnitte(markdown: string): SzenenAbschnitt[] {
  const kt = klartext(markdown);
  const ergebnis: SzenenAbschnitt[] = [];
  let pos = 0;
  let erster = true;
  /** Beginn des aktuellen Abschnitts und Ende seines letzten Absatzes (null = noch leer) */
  let start = 0;
  let ende: number | null = null;
  const abschliessen = () => {
    const e = ende ?? start;
    ergebnis.push({ index: ergebnis.length, start, ende: e, text: kt.slice(start, e) });
  };
  for (const b of bloecke(markdown)) {
    if (b.text.trim() === '') continue;
    if (!erster) pos += 2;
    erster = false;
    const von = pos;
    pos += b.text.length;
    if (b.art === 'trenner') {
      abschliessen();
      start = Math.min(pos + 2, kt.length);
      ende = null;
    } else {
      if (ende === null) start = von;
      ende = pos;
    }
  }
  abschliessen();
  return ergebnis;
}

/** Index des Absatzes, der den Klartext-Offset enthält (Offsets zwischen Absätzen → folgender Absatz). */
export function absatzIndex(liste: Absatz[], offset: number): number {
  let lo = 0;
  let hi = liste.length - 1;
  let treffer = liste.length - 1;
  while (lo <= hi) {
    const mitte = (lo + hi) >> 1;
    if (liste[mitte]!.ende > offset) {
      treffer = mitte;
      hi = mitte - 1;
    } else lo = mitte + 1;
  }
  return Math.max(0, treffer);
}

// ---------------------------------------------------------------------------
// Normalisierung (E6)
// ---------------------------------------------------------------------------

const ANFUEHRUNG = new Set([...'„“”"‚‘’\'»«›‹‛‟′″´`＂']);
const STRICHE = new Set([...'-‐‑‒–—―−⁃﹣－']);
const UNSICHTBAR = new Set(['​', '‌', '‍', '⁠', '­', '﻿']);
const KOMBINIEREND = /\p{M}/u;

function istLeerraum(c: number): boolean {
  return (
    c === 32 ||
    (c >= 9 && c <= 13) ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000
  );
}

/** Normalisierter Text mit Quellbereich je Zeichen: Zeichen i stammt aus s[start[i], ende[i]). */
export interface Normalisiert {
  text: string;
  start: number[];
  ende: number[];
}

function normalisiereBerechnen(s: string): Normalisiert {
  const out: string[] = [];
  const start: number[] = [];
  const ende: number[] = [];
  let letzterStrich = false;
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i]!;
    const code = s.charCodeAt(i);
    if (UNSICHTBAR.has(c) || c === '*' || c === '_') {
      i++;
      continue;
    }
    if (istLeerraum(code)) {
      if (out.length && out[out.length - 1] === ' ') ende[ende.length - 1] = i + 1;
      else {
        out.push(' ');
        start.push(i);
        ende.push(i + 1);
      }
      letzterStrich = false;
      i++;
      continue;
    }
    if (STRICHE.has(c)) {
      if (letzterStrich) ende[ende.length - 1] = i + 1;
      else {
        out.push('-');
        start.push(i);
        ende.push(i + 1);
      }
      letzterStrich = true;
      i++;
      continue;
    }
    letzterStrich = false;
    if (ANFUEHRUNG.has(c)) {
      out.push('"');
      start.push(i);
      ende.push(i + 1);
      i++;
      continue;
    }
    if (c === '.' && s[i + 1] === '.' && s[i + 2] === '.') {
      out.push('…');
      start.push(i);
      ende.push(i + 3);
      i += 3;
      continue;
    }
    let j = i + 1;
    if (code >= 0xd800 && code <= 0xdbff && j < n) j++;
    while (j < n && KOMBINIEREND.test(s[j]!)) j++;
    if (j === i + 1 && code < 0x300) {
      out.push(c);
      start.push(i);
      ende.push(j);
    } else {
      for (const einheit of s.slice(i, j).normalize('NFC').split('')) {
        out.push(einheit);
        start.push(i);
        ende.push(j);
      }
    }
    i = j;
  }
  return { text: out.join(''), start, ende };
}

const normSpeicher = new Zwischenspeicher<Normalisiert>(256);

/** Normalisierung mit Quellbereichen (für Offset-Abbildung). */
export function normalisiereMitBereichen(s: string): Normalisiert {
  return normSpeicher.hole(s, () => normalisiereBerechnen(s));
}

/** Normalisierung nach E6. zuOriginal[i] = Index in `s` für Zeichen i von `text` (Länge text.length + 1). */
export function normalisiere(s: string): { text: string; zuOriginal: number[] } {
  const n = normalisiereMitBereichen(s);
  return { text: n.text, zuOriginal: [...n.start, s.length] };
}

/** Normalisierter Bereich [a, b) → Bereich im Original. */
export function zuOriginalBereich(n: Normalisiert, a: number, b: number, laenge: number): Bereich {
  if (b <= a) {
    const p = a < n.start.length ? n.start[a]! : laenge;
    return { start: p, ende: p };
  }
  return { start: n.start[a]!, ende: n.ende[b - 1]! };
}

/** Erster normalisierter Index, dessen Quelle bei oder nach `pos` beginnt. */
function normIndex(n: Normalisiert, pos: number): number {
  let lo = 0;
  let hi = n.start.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (n.start[m]! < pos) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Kern eines Zitats für den Vergleich: normalisiert, ohne Leerraum, Anführungszeichen und
 * Auslassungspunkte am Rand (die KI setzt Zitate gern in Anführungszeichen oder „… “).
 */
export function zitatKern(zitat: string): string {
  return normalisiere(zitat).text.replace(/^[\s"…]+|[\s"…]+$/g, '');
}

/** Alle Vorkommen eines Zitats im Klartext (Vergleich normalisiert, Offsets im Klartext). */
export function findeZitat(klartext: string, zitat: string): Bereich[] {
  const q = zitatKern(zitat);
  if (!q) return [];
  const n = normalisiereMitBereichen(klartext);
  const ergebnis: Bereich[] = [];
  for (let p = n.text.indexOf(q); p >= 0; p = n.text.indexOf(q, p + 1))
    ergebnis.push(zuOriginalBereich(n, p, p + q.length, klartext.length));
  return ergebnis;
}

/** Stabiler Schlüssel aus Typ und normalisierten Zitaten (Reihenfolge egal). Auch für core/ki nutzbar. */
export function zitatSchluessel(typ: string, zitate: { kapitel: Id; text: string }[]): string {
  const teile = [...new Set(zitate.map((z) => `${z.kapitel}/${zitatKern(z.text)}`))].sort();
  return `${typ}:${teile.join('|')}`;
}

// ---------------------------------------------------------------------------
// Editierdistanz
// ---------------------------------------------------------------------------

/** Levenshtein-Distanz; mit `grenze` wird früh abgebrochen (Ergebnis dann > grenze). */
export function editierdistanz(a: string, b: string, grenze = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let vorher = Array.from({ length: b.length + 1 }, (_, j) => j);
  let jetzt = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    jetzt[0] = i;
    let zeilenMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const kosten = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const w = Math.min(vorher[j]! + 1, jetzt[j - 1]! + 1, vorher[j - 1]! + kosten);
      jetzt[j] = w;
      if (w < zeilenMin) zeilenMin = w;
    }
    if (zeilenMin > grenze) return grenze + 1;
    [vorher, jetzt] = [jetzt, vorher];
  }
  return vorher[b.length]!;
}

function aehnlichkeit(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - editierdistanz(a, b) / max;
}

// ---------------------------------------------------------------------------
// Textanker (E4)
// ---------------------------------------------------------------------------

const KONTEXT = 32;

/** Anker für [start, ende) im Klartext. Alle Strings sind normalisiert (siehe TextAnker). */
export function ankerErzeugen(kapitel: Id, klartext: string, start: number, ende: number): TextAnker {
  const a = Math.max(0, Math.min(start, ende, klartext.length));
  const b = Math.min(klartext.length, Math.max(start, ende, 0));
  const n = normalisiereMitBereichen(klartext);
  const na = normIndex(n, a);
  const nb = Math.max(na, normIndex(n, b));
  return {
    kapitel,
    exakt: n.text.slice(na, nb),
    davor: n.text.slice(Math.max(0, na - KONTEXT), na),
    danach: n.text.slice(nb, nb + KONTEXT),
  };
}

function gemeinsamesEnde(a: string, b: string): number {
  let k = 0;
  while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++;
  return k;
}

function gemeinsamerAnfang(a: string, b: string): number {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}

function alleVorkommen(text: string, muster: string): number[] {
  const ergebnis: number[] = [];
  if (!muster) return ergebnis;
  for (let p = text.indexOf(muster); p >= 0; p = text.indexOf(muster, p + 1)) ergebnis.push(p);
  return ergebnis;
}

/** Wählt unter Kandidaten [a, b) den mit dem eindeutig besten Kontext; sonst null. */
function besterKontext(t: string, kandidaten: [number, number][], davor: string, danach: string): [number, number] | null {
  if (kandidaten.length === 1) return kandidaten[0]!;
  const bewertet = kandidaten.map(([a, b]) => {
    const vor = t.slice(Math.max(0, a - davor.length), a);
    const nach = t.slice(b, b + danach.length);
    return { a, b, wert: gemeinsamesEnde(vor, davor) + gemeinsamerAnfang(nach, danach) };
  });
  bewertet.sort((x, y) => y.wert - x.wert);
  const [erster, zweiter] = bewertet;
  if (!erster || erster.wert === 0 || (zweiter && zweiter.wert === erster.wert)) return null;
  return [erster.a, erster.b];
}

const MIN_KONTEXT = 8;

/** Positionen direkt nach dem Kontext `davor` (ganz, sonst seine hintere Hälfte); leerer Kontext = Textanfang. */
function kontextEnden(t: string, davor: string): number[] {
  if (!davor) return [0];
  for (const stueck of [davor, davor.slice(Math.floor(davor.length / 2))]) {
    if (stueck.length < MIN_KONTEXT) break;
    const p = alleVorkommen(t, stueck);
    if (p.length) return p.map((x) => x + stueck.length);
  }
  return [];
}

/** Positionen, an denen der Kontext `danach` beginnt (ganz, sonst seine vordere Hälfte); leer = Textende. */
function kontextAnfaenge(t: string, danach: string): number[] {
  if (!danach) return [t.length];
  for (const stueck of [danach, danach.slice(0, Math.ceil(danach.length / 2))]) {
    if (stueck.length < MIN_KONTEXT) break;
    const p = alleVorkommen(t, stueck);
    if (p.length) return p;
  }
  return [];
}

function kleinUndGleichLang(s: string): string {
  let r = '';
  for (const c of s) {
    const k = c.toLowerCase();
    r += k.length === c.length ? k : c;
  }
  return r;
}

/** Findet die Stelle wieder. null = verwaist (nicht oder nicht eindeutig auffindbar). */
export function ankerFinden(klartext: string, anker: TextAnker): Bereich | null {
  const n = normalisiereMitBereichen(klartext);
  const t = n.text;
  const ex = normalisiere(anker.exakt).text;
  const davor = normalisiere(anker.davor).text;
  const danach = normalisiere(anker.danach).text;
  const ergebnis = (p: [number, number] | null): Bereich | null =>
    p ? zuOriginalBereich(n, p[0], p[1], klartext.length) : null;

  // 1. exakt (eindeutig oder über den Kontext eindeutig)
  const kern = ex.trim();
  if (kern) {
    const versatz = ex.indexOf(kern);
    const treffer = alleVorkommen(t, kern).map((p) => [p, p + kern.length] as [number, number]);
    if (treffer.length) return ergebnis(besterKontext(t, treffer, davor + ex.slice(0, versatz), ex.slice(versatz + kern.length) + danach));
  } else {
    // Leerer Anker: Position zwischen davor und danach
    const ganz = davor + danach;
    if (!ganz) return null;
    const p = alleVorkommen(t, ganz);
    return p.length === 1 ? ergebnis([p[0]! + davor.length, p[0]! + davor.length]) : null;
  }

  // 2. tolerant: Groß-/Kleinschreibung
  const tk = kleinUndGleichLang(t);
  const kk = kleinUndGleichLang(kern);
  const ohneFall = alleVorkommen(tk, kk).map((p) => [p, p + kk.length] as [number, number]);
  if (ohneFall.length) return ergebnis(besterKontext(tk, ohneFall, kleinUndGleichLang(davor), kleinUndGleichLang(danach)));

  // 3. tolerant: Kontext davor/danach finden, Bereich dazwischen muss dem Zitat ähneln
  const davorStuecke = kontextEnden(t, davor);
  const danachStuecke = kontextAnfaenge(t, danach);
  const maxLaenge = kern.length * 2 + 40;
  const kandidaten: { a: number; b: number; wert: number }[] = [];
  const pruefe = (a: number, b: number) => {
    if (b < a || b - a > maxLaenge) return;
    const stueck = t.slice(a, b).trim();
    const w = aehnlichkeit(stueck, kern);
    if (w >= 0.6) {
      const versatz = t.slice(a, b).indexOf(stueck);
      kandidaten.push({ a: a + versatz, b: a + versatz + stueck.length, wert: w });
    }
  };
  if (davorStuecke.length && danachStuecke.length) {
    for (const a of davorStuecke) for (const b of danachStuecke) pruefe(a, b);
  }
  if (!kandidaten.length && davorStuecke.length && davor) for (const a of davorStuecke) pruefe(a, Math.min(t.length, a + ex.length));
  if (!kandidaten.length && danachStuecke.length && danach) for (const b of danachStuecke) pruefe(Math.max(0, b - ex.length), b);
  if (!kandidaten.length) return null;
  kandidaten.sort((x, y) => y.wert - x.wert);
  const [erster, zweiter] = kandidaten;
  if (zweiter && zweiter.wert === erster!.wert && (zweiter.a !== erster!.a || zweiter.b !== erster!.b)) return null;
  return ergebnis([erster!.a, erster!.b]);
}

// ---------------------------------------------------------------------------
// Wortzahl und Hash
// ---------------------------------------------------------------------------

const WORT = /[\p{L}\p{N}\p{M}]+(?:(?:[-‐‑'’]|(?<=\p{N})[.,:/](?=\p{N}))[\p{L}\p{N}\p{M}]+)*/gu;

/** Wörter in einem Klartext (Bindestrich- und Apostroph-Wörter zählen einfach, Zahlen mit Trennzeichen auch). */
export function woerterZaehlen(text: string): number {
  let n = 0;
  WORT.lastIndex = 0;
  while (WORT.exec(text)) n++;
  return n;
}

/** Wörter im Markdown-Text (ohne Auszeichnung; Bindestrich-Wörter zählen einfach). */
export function wortzahl(markdown: string): number {
  return woerterZaehlen(klartext(markdown));
}

const kodierer = new TextEncoder();

/** Stabiler, schneller Hash (Hex) für Änderungserkennung: FNV-1a 64 Bit über UTF-8, 16 Hex-Zeichen. */
export function textHash(s: string): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  const bytes = kodierer.encode(s);
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]!) >>> 0;
    const loMal = lo * 0x1b3;
    const neuHi = (hi * 0x1b3 + Math.floor(loMal / 4294967296) + ((lo << 8) >>> 0)) >>> 0;
    lo = loMal >>> 0;
    hi = neuHi;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}
