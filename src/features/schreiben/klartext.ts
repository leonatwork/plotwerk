/**
 * Klartext des Editor-Dokuments und Umrechnung Klartext-Offset ↔ ProseMirror-Position.
 *
 * Der Klartext ist per Konstruktion genau core/text.klartext(Markdown des Dokuments) – dieselbe
 * Absatzfolge, die Index, Erkennung und Anker verwenden. Die Positionen entstehen durch einen
 * linearen Abgleich mit dem Text des Dokuments (Blöcke mit "\n\n", Umbruch = "\n",
 * Szenentrenner = "* * *"): Leerraum gilt als gleich, Zeichen, die core/text weglässt (Leerraum am
 * Rand, wörtliche Listen-/Zitatzeichen), werden übersprungen.
 */
import { klartext as coreKlartext } from '@core/text/index';
import type { Node as PMNode } from '@tiptap/pm/model';
import { docZuMarkdown, SZENENTRENNER } from './markdown';

export interface KlartextKarte {
  text: string;
  /** Position vor Zeichen i (Länge text.length) */
  von: Int32Array;
  /** Position hinter Zeichen i */
  bis: Int32Array;
  /** 1 = Zeichen des Absatzwechsels "\n\n" (ohne eigene Position, steht am Ende des vorigen Blocks) */
  trenner: Uint8Array;
  /** Position am Dokumentende (für Offsets = text.length) */
  ende: number;
}

interface Roh {
  text: string;
  von: number[];
  bis: number[];
  trenner: boolean[];
}

/** Text des Dokuments mit Position je Zeichen (Trenner "\n\n" zwischen nicht leeren Blöcken). */
function rohtext(doc: PMNode): Roh {
  const zeichen: string[] = [];
  const von: number[] = [];
  const bis: number[] = [];
  const trenner: boolean[] = [];
  let vorigesEnde = -1;
  doc.forEach((knoten, pos) => {
    const start = zeichen.length;
    if (knoten.type.name === 'horizontalRule') {
      for (const c of SZENENTRENNER) {
        zeichen.push(c);
        von.push(pos);
        bis.push(pos + 1);
      }
    } else if (knoten.isTextblock) {
      knoten.forEach((kind, versatz) => {
        const p = pos + 1 + versatz;
        if (kind.isText) {
          const t = kind.text ?? '';
          for (let i = 0; i < t.length; i++) {
            zeichen.push(t[i]!);
            von.push(p + i);
            bis.push(p + i + 1);
          }
        } else if (kind.type.name === 'hardBreak') {
          zeichen.push('\n');
          von.push(p);
          bis.push(p + 1);
        }
      });
    }
    const blockText = zeichen.slice(start).join('');
    if (!blockText.trim()) {
      zeichen.length = von.length = bis.length = start;
      return;
    }
    trenner.length = start;
    for (let i = start; i < zeichen.length; i++) trenner.push(false);
    if (vorigesEnde >= 0) {
      zeichen.splice(start, 0, '\n', '\n');
      von.splice(start, 0, vorigesEnde, vorigesEnde);
      bis.splice(start, 0, vorigesEnde, vorigesEnde);
      trenner.splice(start, 0, true, true);
    }
    vorigesEnde = bis[bis.length - 1]!;
  });
  return { text: zeichen.join(''), von, bis, trenner };
}

const LEER = /\s/u;
const FENSTER = 64;

function gleich(a: string, b: string): boolean {
  return a === b || (LEER.test(a) && LEER.test(b));
}

/** Gleicht `ziel` (Klartext von core/text) mit dem Rohtext ab. */
function abgleichen(roh: Roh, ziel: string, dokEnde: number): KlartextKarte {
  const n = ziel.length;
  const von = new Int32Array(n);
  const bis = new Int32Array(n);
  const trenner = new Uint8Array(n);
  const r = roh.text;
  let p = 0;
  const hier = () => (p < r.length ? roh.von[p]! : roh.bis.length ? roh.bis[roh.bis.length - 1]! : dokEnde);
  for (let q = 0; q < n; q++) {
    const c = ziel[q]!;
    if (p < r.length && gleich(r[p]!, c)) {
      von[q] = roh.von[p]!;
      bis[q] = roh.bis[p]!;
      trenner[q] = roh.trenner[p] ? 1 : 0;
      p++;
      continue;
    }
    let treffer = -1;
    for (let k = p; k < r.length && k < p + FENSTER; k++) {
      if (gleich(r[k]!, c)) {
        treffer = k;
        break;
      }
    }
    if (treffer >= 0) {
      p = treffer;
      von[q] = roh.von[p]!;
      bis[q] = roh.bis[p]!;
      trenner[q] = roh.trenner[p] ? 1 : 0;
      p++;
    } else {
      const x = hier();
      von[q] = x;
      bis[q] = x;
    }
  }
  const ende = roh.bis.length ? roh.bis[roh.bis.length - 1]! : dokEnde;
  return { text: ziel, von, bis, trenner, ende };
}

/** Klartext-Karte des Dokuments; `markdown` spart das erneute Serialisieren. */
export function klartextKarte(doc: PMNode, markdown: string = docZuMarkdown(doc)): KlartextKarte {
  return abgleichen(rohtext(doc), coreKlartext(markdown), Math.max(1, doc.content.size - 1));
}

/** Klartext-Offset → Position. 'start': vor dem Zeichen (im Absatzwechsel: Anfang des nächsten Blocks); 'ende': hinter dem vorigen Zeichen. */
export function offsetZuPos(karte: KlartextKarte, offset: number, seite: 'start' | 'ende' = 'start'): number {
  const n = karte.text.length;
  if (n === 0) return karte.ende;
  if (seite === 'ende') return offset <= 0 ? karte.von[0]! : karte.bis[Math.min(offset, n) - 1]!;
  let o = Math.max(0, offset);
  while (o < n && karte.trenner[o]) o++;
  return o >= n ? karte.ende : karte.von[o]!;
}

/** Position → Klartext-Offset: erstes Zeichen, das bei oder hinter `pos` beginnt. */
export function posZuOffset(karte: KlartextKarte, pos: number): number {
  let lo = 0;
  let hi = karte.text.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (karte.von[m]! < pos) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export function bereichZuPositionen(karte: KlartextKarte, start: number, ende: number): { from: number; to: number } {
  const from = offsetZuPos(karte, start, 'start');
  const to = ende > start ? offsetZuPos(karte, ende, 'ende') : from;
  return { from, to: Math.max(from, to) };
}

export function positionenZuBereich(karte: KlartextKarte, from: number, to: number): { start: number; ende: number } {
  const start = posZuOffset(karte, from);
  return { start, ende: Math.max(start, posZuOffset(karte, to)) };
}
