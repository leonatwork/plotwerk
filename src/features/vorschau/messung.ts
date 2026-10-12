/**
 * Lesevorschau – Messen im DOM: Spalten des Mehrspaltensatzes zählen und Leseposition (Anker) ↔ Spalte.
 *
 * Der Satz eines Kapitels ist ein Mehrspaltenelement mit fester Höhe, Spaltenbreite = Satzbreite und
 * überlaufenden Spalten nach rechts. Spalte k liegt bei x = k · (Breite + Abstand). Gemessen wird in
 * einem unsichtbaren Element mit denselben Klassen und Maßen wie die Anzeige.
 */
import { aktuelleBuchSprache } from '../../i18n/buch';
import type { Fluss } from './geometrie';
import { spaltenTakt } from './geometrie';

/** Stil eines Satzelements (Messung und Anzeige identisch) */
export function flussStil(f: Fluss): Record<string, string> {
  return {
    width: `${f.breite}px`,
    height: `${f.hoehe}px`,
    columnWidth: `${f.breite}px`,
    columnGap: `${f.abstand}px`,
    fontSize: `${f.schrift}px`,
    lineHeight: `${f.zeile}px`,
    '--v-zeile': `${f.zeile}px`,
  };
}

function stilSetzen(el: HTMLElement, f: Fluss): void {
  const s = flussStil(f);
  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith('--')) el.style.setProperty(k, v);
    else (el.style as unknown as Record<string, string>)[k] = v;
  }
}

function spalteBei(x: number, basis: number, takt: number): number {
  return Math.max(0, Math.floor((x - basis + 2) / takt));
}

/** Anzahl der Spalten eines Satzelements (über die Endmarke). */
export function zaehleSpalten(el: HTMLElement, f: Fluss): number {
  const ende = el.querySelector<HTMLElement>('[data-ende]');
  const basis = el.getBoundingClientRect().left;
  const takt = spaltenTakt(f);
  let spalten = 1;
  if (ende) spalten = spalteBei(ende.getBoundingClientRect().left, basis, takt) + 1;
  // Gegenprobe über die Überlaufbreite (falls die Endmarke an den Spaltenanfang rutscht)
  const ueberlauf = Math.round((el.scrollWidth + f.abstand) / takt);
  if (Number.isFinite(ueberlauf) && ueberlauf > spalten) spalten = ueberlauf;
  return Math.max(1, spalten);
}

// ---------------------------------------------------------------------------
// Anker ↔ Spalte
// ---------------------------------------------------------------------------

interface TextStelle {
  knoten: Text;
  offset: number;
}

/** Textknoten eines Blocks mit ihren Startpositionen */
function textKnoten(block: HTMLElement): { knoten: Text; start: number }[] {
  const liste: { knoten: Text; start: number }[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    liste.push({ knoten: t, start: pos });
    pos += t.data.length;
  }
  return liste;
}

function stelle(knoten: { knoten: Text; start: number }[], zeichen: number): TextStelle | null {
  for (let i = knoten.length - 1; i >= 0; i--) {
    const k = knoten[i]!;
    if (zeichen >= k.start && zeichen < k.start + k.knoten.data.length) return { knoten: k.knoten, offset: zeichen - k.start };
  }
  return null;
}

/** x-Position eines Zeichens (linke Kante); null, wenn es keine Box hat */
function zeichenX(knoten: { knoten: Text; start: number }[], zeichen: number): number | null {
  const s = stelle(knoten, zeichen);
  if (!s) return null;
  try {
    const r = document.createRange();
    r.setStart(s.knoten, s.offset);
    r.setEnd(s.knoten, Math.min(s.knoten.data.length, s.offset + 1));
    const rects = r.getClientRects();
    const rect = rects[0] ?? r.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0 && rects.length === 0)) return null;
    return rect.left;
  } catch {
    // ohne Layout (z. B. jsdom)
    return null;
  }
}

function blockText(knoten: { knoten: Text; start: number }[]): string {
  return knoten.map((k) => k.knoten.data).join('');
}

/** Spalte eines Zeichens im Block (Leerzeichen am Zeilenende zählen zum nächsten sichtbaren Zeichen). */
function spalteVonZeichen(block: HTMLElement, zeichen: number, basis: number, takt: number): number {
  const knoten = textKnoten(block);
  const text = blockText(knoten);
  if (text.length === 0) return spalteBei(block.getBoundingClientRect().left, basis, takt);
  let i = Math.min(Math.max(0, zeichen), text.length - 1);
  while (i < text.length - 1 && /\s/.test(text[i]!)) i++;
  const x = zeichenX(knoten, i);
  return x === null ? spalteBei(block.getBoundingClientRect().left, basis, takt) : spalteBei(x, basis, takt);
}

function letztesSichtbares(text: string): number {
  let i = text.length - 1;
  while (i > 0 && /\s/.test(text[i]!)) i--;
  return Math.max(0, i);
}

function bloeckeVon(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>('[data-b]'));
}

/** Spalte, in der der Anker (Block, Zeichen) im aktuellen Satz steht. */
export function spalteVonAnker(el: HTMLElement, f: Fluss, block: number, zeichen: number): number {
  const bloecke = bloeckeVon(el);
  if (bloecke.length === 0) return 0;
  const b = bloecke[Math.min(Math.max(0, block), bloecke.length - 1)]!;
  return spalteVonZeichen(b, zeichen, el.getBoundingClientRect().left, spaltenTakt(f));
}

/** Textanfang der Spalte: erster Block (und erstes Zeichen darin), der in dieser Spalte sichtbar ist. */
export function ankerVonSpalte(el: HTMLElement, f: Fluss, spalte: number): { block: number; zeichen: number } {
  const bloecke = bloeckeVon(el);
  if (bloecke.length === 0 || spalte <= 0) return { block: 0, zeichen: 0 };
  const basis = el.getBoundingClientRect().left;
  const takt = spaltenTakt(f);
  const endSpalte = (b: HTMLElement) => {
    const knoten = textKnoten(b);
    const text = blockText(knoten);
    return spalteVonZeichen(b, letztesSichtbares(text), basis, takt);
  };
  // erster Block, dessen Ende in oder nach der Spalte liegt
  let lo = 0;
  let hi = bloecke.length - 1;
  let treffer = bloecke.length - 1;
  while (lo <= hi) {
    const mitte = (lo + hi) >> 1;
    if (endSpalte(bloecke[mitte]!) >= spalte) {
      treffer = mitte;
      hi = mitte - 1;
    } else lo = mitte + 1;
  }
  const b = bloecke[treffer]!;
  if (spalteVonZeichen(b, 0, basis, takt) >= spalte) return { block: treffer, zeichen: 0 };
  // Absatz läuft über den Spaltenwechsel: erstes Zeichen in der Spalte suchen
  const knoten = textKnoten(b);
  const text = blockText(knoten);
  let zlo = 0;
  let zhi = text.length - 1;
  let z = text.length - 1;
  while (zlo <= zhi) {
    const mitte = (zlo + zhi) >> 1;
    if (spalteVonZeichen(b, mitte, basis, takt) >= spalte) {
      z = mitte;
      zhi = mitte - 1;
    } else zlo = mitte + 1;
  }
  while (z < text.length - 1 && /\s/.test(text[z]!)) z++;
  return { block: treffer, zeichen: z };
}

// ---------------------------------------------------------------------------
// Vermessen im Hintergrund (in Zeitscheiben, mit Cache)
// ---------------------------------------------------------------------------

export interface MessAuftrag {
  /** Geometrie-Schlüssel + Schriftstand */
  schluessel: string;
  fluss: Fluss;
  /** Kapitel in Messreihenfolge (das aktuelle zuerst) */
  kapitel: { id: string; html: string; hash: string }[];
  /** zusätzliche Klasse des Messelements (Modus) */
  klasse: string;
  /** Buchsprache für die Silbentrennung (lang); Standard: aus dem Projekt */
  sprache?: string;
}

const cache = new Map<string, number>();
const CACHE_MAX = 4000;

function cacheSchluessel(auftrag: MessAuftrag, k: { id: string; hash: string }): string {
  return `${auftrag.schluessel}|${k.id}|${k.hash}`;
}

export function ausCache(auftrag: MessAuftrag, k: { id: string; hash: string }): number | undefined {
  return cache.get(cacheSchluessel(auftrag, k));
}

/**
 * Misst alle Kapitel des Auftrags in Zeitscheiben (≈ 12 ms), meldet Zwischenstände und liefert eine
 * Abbruchfunktion. Bereits gemessene Kapitel kommen aus dem Cache.
 */
export function vermessen(host: HTMLElement, auftrag: MessAuftrag, melden: (ergebnis: Map<string, number>, fertig: boolean) => void): () => void {
  let abgebrochen = false;
  let zeitgeber: ReturnType<typeof setTimeout> | undefined;
  const ergebnis = new Map<string, number>();
  const offen: MessAuftrag['kapitel'] = [];
  for (const k of auftrag.kapitel) {
    const c = ausCache(auftrag, k);
    if (c !== undefined) ergebnis.set(k.id, c);
    else offen.push(k);
  }
  if (offen.length === 0) {
    melden(ergebnis, true);
    return () => undefined;
  }
  const el = document.createElement('div');
  el.className = `pw-v-fluss ${auftrag.klasse}`;
  el.setAttribute('lang', auftrag.sprache ?? aktuelleBuchSprache());
  el.setAttribute('aria-hidden', 'true');
  stilSetzen(el, auftrag.fluss);
  host.appendChild(el);
  let i = 0;
  const scheibe = () => {
    if (abgebrochen) return;
    const t0 = performance.now();
    do {
      const k = offen[i++]!;
      el.innerHTML = k.html;
      const n = zaehleSpalten(el, auftrag.fluss);
      ergebnis.set(k.id, n);
      if (cache.size > CACHE_MAX) cache.clear();
      cache.set(cacheSchluessel(auftrag, k), n);
    } while (i < offen.length && performance.now() - t0 < 12);
    const fertig = i >= offen.length;
    if (fertig) el.remove();
    else el.innerHTML = '';
    melden(new Map(ergebnis), fertig);
    if (!fertig) zeitgeber = setTimeout(scheibe, 0);
  };
  zeitgeber = setTimeout(scheibe, 0);
  return () => {
    abgebrochen = true;
    if (zeitgeber !== undefined) clearTimeout(zeitgeber);
    el.remove();
  };
}

/** Schriften der Vorschau laden (sonst misst der Satz mit Ersatzschriften). */
export async function schriftenLaden(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts || typeof fonts.load !== 'function') return;
  const laden = [
    '400 16px "Newsreader Variable"',
    'italic 400 16px "Newsreader Variable"',
    '600 16px "Newsreader Variable"',
    'italic 600 16px "Newsreader Variable"',
    '400 16px "Instrument Serif"',
  ].map((f) => fonts.load(f, 'Aa').catch(() => []));
  await Promise.race([Promise.all(laden), new Promise((r) => setTimeout(r, 2500))]);
}
