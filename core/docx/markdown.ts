/**
 * Markdown des Manuskripts lesen (für Export) und Word-Absätze verlustfrei als Markdown schreiben (für Import).
 *
 * Lesen folgt CommonMark (markdown-it, ohne HTML) wie der Editor: weicher Umbruch = Leerzeichen,
 * harter Umbruch = "\n", Szenentrenner = Block „* * *“.
 * Schreiben maskiert Sonderzeichen mit Backslash (\* \_ \# …) und setzt **fett** / *kursiv* so, dass
 * ein CommonMark-Leser exakt denselben Text und dieselben Auszeichnungen zurückliefert. Jeder Absatz
 * wird nach dem Schreiben gegengelesen; lässt sich eine Auszeichnung nicht eindeutig darstellen
 * (z. B. fett gesetzte Satzzeichen direkt an Buchstaben), entfällt nur diese Auszeichnung, nie Text.
 */
import MarkdownIt from 'markdown-it';

export interface Lauf {
  /** Text; "\n" = harter Zeilenumbruch */
  text: string;
  fett: boolean;
  kursiv: boolean;
}

export type Block =
  | { art: 'absatz'; laeufe: Lauf[] }
  | { art: 'ueberschrift'; ebene: number; laeufe: Lauf[] }
  | { art: 'trenner' };

export const SZENENTRENNER = '* * *';

const md = new MarkdownIt('commonmark', { html: false });
type Token = ReturnType<typeof md.parse>[number];

function inlineLaeufe(token: Token | undefined): Lauf[] {
  const laeufe: Lauf[] = [];
  let fett = 0;
  let kursiv = 0;
  const neu = (text: string) => {
    if (!text) return;
    const f = fett > 0;
    const k = kursiv > 0;
    const letzte = laeufe[laeufe.length - 1];
    if (letzte && letzte.fett === f && letzte.kursiv === k) letzte.text += text;
    else laeufe.push({ text, fett: f, kursiv: k });
  };
  for (const c of token?.children ?? []) {
    switch (c.type) {
      case 'text':
      case 'code_inline':
        neu(c.content);
        break;
      case 'softbreak':
        neu(' ');
        break;
      case 'hardbreak':
        neu('\n');
        break;
      case 'strong_open':
        fett++;
        break;
      case 'strong_close':
        fett = Math.max(0, fett - 1);
        break;
      case 'em_open':
        kursiv++;
        break;
      case 'em_close':
        kursiv = Math.max(0, kursiv - 1);
        break;
      default:
        break;
    }
  }
  return laeufe;
}

/** Markdown → Blöcke (Absätze mit Läufen, Überschriften, Szenentrenner). Listen werden zu Absätzen mit ihrem Marker. */
export function leseMarkdown(markdown: string): Block[] {
  const tokens = md.parse(markdown, {});
  const bloecke: Block[] = [];
  let praefix = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    switch (t.type) {
      case 'heading_open':
        bloecke.push({ art: 'ueberschrift', ebene: Number(t.tag.slice(1)) || 1, laeufe: inlineLaeufe(tokens[i + 1]) });
        i += 2;
        break;
      case 'paragraph_open': {
        let laeufe = inlineLaeufe(tokens[i + 1]);
        if (praefix) {
          laeufe = [{ text: praefix, fett: false, kursiv: false }, ...laeufe];
          praefix = '';
        }
        bloecke.push({ art: 'absatz', laeufe });
        i += 2;
        break;
      }
      case 'hr':
        bloecke.push({ art: 'trenner' });
        break;
      case 'code_block':
      case 'fence': {
        const text = t.content.replace(/\n$/, '');
        if (text) bloecke.push({ art: 'absatz', laeufe: [{ text: praefix + text, fett: false, kursiv: false }] });
        praefix = '';
        break;
      }
      case 'list_item_open':
        praefix = t.info ? `${t.info}${t.markup} ` : `${t.markup} `;
        break;
      default:
        break;
    }
  }
  return bloecke;
}

export function laeufeText(laeufe: Lauf[]): string {
  return laeufe.map((l) => l.text).join('');
}

export function blockText(b: Block): string {
  return b.art === 'trenner' ? SZENENTRENNER : laeufeText(b.laeufe);
}

/** Klartext nach der Definition in core/text (Blöcke mit "\n\n", leere entfallen) – auf Basis von CommonMark. */
export function markdownKlartext(markdown: string): string {
  return leseMarkdown(markdown)
    .map(blockText)
    .filter((t) => t.trim() !== '')
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

const MASKIEREN = new Set(['\\', '`', '*', '_', '[', ']', '<', '~']);
const LEER = /\s/u;
const PUNKT = /[\p{P}\p{S}]/u;

function istLeer(c: string | undefined): boolean {
  return c === undefined || LEER.test(c);
}
function istPunkt(c: string | undefined): boolean {
  return c !== undefined && PUNKT.test(c);
}
/** CommonMark: linksbündige Begrenzerfolge (darf öffnen) */
function kannOeffnen(vor: string | undefined, nach: string | undefined): boolean {
  if (istLeer(nach)) return false;
  return !istPunkt(nach) || istLeer(vor) || istPunkt(vor);
}
/** CommonMark: rechtsbündige Begrenzerfolge (darf schließen) */
function kannSchliessen(vor: string | undefined, nach: string | undefined): boolean {
  if (istLeer(vor)) return false;
  return !istPunkt(vor) || istLeer(nach) || istPunkt(nach);
}

function zeichen(text: string, i: number): string {
  const c = text[i]!;
  if (MASKIEREN.has(c)) return `\\${c}`;
  if (c === '&' && /^&#?[A-Za-z0-9]+;/.test(text.slice(i, i + 34))) return '\\&';
  return c;
}

/** Zeilenanfänge, die CommonMark als Block deuten würde (Liste, Überschrift, Zitat, Setext-Linie). */
function zeilenanfang(z: string): string {
  if (/^#{1,6}(\s|$)/.test(z)) return `\\${z}`;
  if (/^[-+](\s|$)/.test(z) || /^-+\s*$/.test(z) || /^=+\s*$/.test(z) || z.startsWith('>')) return `\\${z}`;
  const nummer = /^(\d{1,9})([.)])(\s|$)/.exec(z);
  if (nummer) return `${nummer[1]}\\${z.slice(nummer[1]!.length)}`;
  return z;
}

interface Zeile {
  text: string;
  fett: boolean[];
  kursiv: boolean[];
}

function bereiche(flags: boolean[]): [number, number][] {
  const ergebnis: [number, number][] = [];
  let i = 0;
  while (i < flags.length) {
    if (!flags[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < flags.length && flags[j]) j++;
    ergebnis.push([i, j]);
    i = j;
  }
  return ergebnis;
}

/** Leerraum trägt eine Auszeichnung nur, wenn das nächste Nicht-Leerzeichen links und rechts sie auch trägt. */
function leerraumAngleichen(text: string, flags: boolean[]): void {
  for (let i = 0; i < text.length; i++) {
    if (!LEER.test(text[i]!)) continue;
    let l = i - 1;
    while (l >= 0 && LEER.test(text[l]!)) l--;
    let r = i + 1;
    while (r < text.length && LEER.test(text[r]!)) r++;
    flags[i] = l >= 0 && r < text.length && flags[l]! && flags[r]!;
  }
}

/** Satzzeichen am Rand einer Auszeichnung, die CommonMark nicht öffnen/schließen lässt, verlieren die Auszeichnung. */
function randAnpassen(text: string, flags: boolean[]): void {
  let geaendert = true;
  while (geaendert) {
    geaendert = false;
    for (const [s, e] of bereiche(flags)) {
      if (!kannOeffnen(text[s - 1], text[s]) && istPunkt(text[s])) {
        flags[s] = false;
        geaendert = true;
      } else if (!kannSchliessen(text[e - 1], text[e]) && istPunkt(text[e - 1])) {
        flags[e - 1] = false;
        geaendert = true;
      }
      if (geaendert) break;
    }
  }
}

function zeileSchreiben(z: Zeile): string {
  const { text, fett, kursiv } = z;
  const n = text.length;
  const lauf = (flags: boolean[], i: number, ende = n) => {
    let j = i;
    while (j < ende && flags[j]) j++;
    return j;
  };
  const innen = (s: number, e: number, flags: boolean[], marke: string) => {
    let r = '';
    let i = s;
    while (i < e) {
      if (flags[i]) {
        const j = lauf(flags, i, e);
        r += marke;
        for (let k = i; k < j; k++) r += zeichen(text, k);
        r += marke;
        i = j;
      } else {
        r += zeichen(text, i);
        i++;
      }
    }
    return r;
  };
  let out = '';
  let i = 0;
  while (i < n) {
    if (!fett[i] && !kursiv[i]) {
      out += zeichen(text, i);
      i++;
      continue;
    }
    const aussenFett = fett[i] && kursiv[i] ? lauf(fett, i) >= lauf(kursiv, i) : !!fett[i];
    if (aussenFett) {
      const j = lauf(fett, i);
      out += `**${innen(i, j, kursiv, '*')}**`;
      i = j;
    } else {
      const j = lauf(kursiv, i);
      out += `*${innen(i, j, fett, '**')}*`;
      i = j;
    }
  }
  return zeilenanfang(out);
}

function absatzSchreiben(zeilen: Zeile[]): string {
  return zeilen.map(zeileSchreiben).join('\\\n');
}

/** Liest einen geschriebenen Absatz zurück und vergleicht Text und Auszeichnung (auf Nicht-Leerzeichen). */
function stimmt(markdown: string, zeilen: Zeile[]): boolean {
  const bl = leseMarkdown(markdown);
  if (bl.length !== 1 || bl[0]!.art !== 'absatz') return false;
  const soll = zeilen.map((z) => z.text).join('\n');
  let pos = 0;
  for (const l of bl[0]!.laeufe) {
    for (const c of l.text) {
      const len = c.length;
      if (soll.slice(pos, pos + len) !== c) return false;
      if (!LEER.test(c)) {
        let z = 0;
        let rest = pos;
        while (z < zeilen.length && rest > zeilen[z]!.text.length) {
          rest -= zeilen[z]!.text.length + 1;
          z++;
        }
        const zeile = zeilen[z];
        if (!zeile || zeile.fett[rest] !== l.fett || zeile.kursiv[rest] !== l.kursiv) return false;
      }
      pos += len;
    }
  }
  return pos === soll.length;
}

function zeilenAusLaeufen(laeufe: Lauf[]): Zeile[][] {
  const gruppen: Zeile[][] = [];
  let aktuell: Zeile[] = [];
  let zeile: Zeile = { text: '', fett: [], kursiv: [] };
  const zeileAbschliessen = () => {
    const roh = zeile;
    zeile = { text: '', fett: [], kursiv: [] };
    const anfang = roh.text.length - roh.text.trimStart().length;
    const ende = roh.text.trimEnd().length;
    if (ende <= anfang) {
      if (aktuell.length) gruppen.push(aktuell);
      aktuell = [];
      return;
    }
    aktuell.push({ text: roh.text.slice(anfang, ende), fett: roh.fett.slice(anfang, ende), kursiv: roh.kursiv.slice(anfang, ende) });
  };
  for (const l of laeufe) {
    for (const c of l.text) {
      if (c === '\n' || c === '\r') {
        zeileAbschliessen();
        continue;
      }
      zeile.text += c;
      for (let k = 0; k < c.length; k++) {
        zeile.fett.push(l.fett);
        zeile.kursiv.push(l.kursiv);
      }
    }
  }
  zeileAbschliessen();
  if (aktuell.length) gruppen.push(aktuell);
  return gruppen;
}

/**
 * Ein Word-Absatz als Markdown. Ergebnis: 0..n Markdown-Absätze (leere Zeilen im Absatz trennen Absätze,
 * Leerraum am Zeilenrand entfällt). Ein Absatz, der genau „* * *“ lautet, wird zum Szenentrenner.
 */
export function absatzZuMarkdown(laeufe: Lauf[]): string[] {
  const ergebnis: string[] = [];
  for (const zeilen of zeilenAusLaeufen(laeufe)) {
    if (zeilen.length === 1 && zeilen[0]!.text === SZENENTRENNER) {
      ergebnis.push(SZENENTRENNER);
      continue;
    }
    for (const z of zeilen) {
      leerraumAngleichen(z.text, z.fett);
      leerraumAngleichen(z.text, z.kursiv);
      randAnpassen(z.text, z.fett);
      randAnpassen(z.text, z.kursiv);
    }
    let markdown = absatzSchreiben(zeilen);
    if (!stimmt(markdown, zeilen)) {
      // Auszeichnungen einzeln (kürzeste zuerst) weglassen, bis der Absatz eindeutig ist.
      const kandidaten: { zeile: Zeile; flags: boolean[]; s: number; e: number }[] = [];
      for (const z of zeilen)
        for (const flags of [z.fett, z.kursiv]) for (const [s, e] of bereiche(flags)) kandidaten.push({ zeile: z, flags, s, e });
      kandidaten.sort((a, b) => a.e - a.s - (b.e - b.s));
      for (const k of kandidaten) {
        k.flags.fill(false, k.s, k.e);
        markdown = absatzSchreiben(zeilen);
        if (stimmt(markdown, zeilen)) break;
      }
      if (!stimmt(markdown, zeilen)) throw new Error(`Absatz lässt sich nicht als Markdown darstellen: ${zeilen.map((z) => z.text).join(' / ').slice(0, 80)}`);
    }
    ergebnis.push(markdown);
  }
  return ergebnis;
}

/** Überschrift (Ebene 1–6) als ATX-Zeile; harte Umbrüche werden Leerzeichen, Auszeichnung entfällt. */
export function ueberschriftZuMarkdown(ebene: number, text: string): string {
  const t = text.replace(/[\r\n]+/g, ' ').trim();
  if (!t) return '';
  let inhalt = '';
  for (let i = 0; i < t.length; i++) inhalt += zeichen(t, i);
  inhalt = inhalt.replace(/(^|\s)(#+)$/, '$1\\$2');
  return `${'#'.repeat(Math.min(6, Math.max(1, ebene)))} ${inhalt}`;
}
