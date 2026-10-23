import { absatzZuMarkdown, type Lauf } from '../docx';

export class RtfFehler extends Error {}

export interface RtfErgebnis {
  /** Klartext, z. B. für Kapitelnotizen (deren Oberfläche kein Markdown rendert). */
  text: string;
  markdown: string;
}

interface Zustand {
  fett: boolean;
  kursiv: boolean;
  verborgen: boolean;
  ignorieren: boolean;
  uc: number;
  codepage: string;
}

const ZIELE = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata', 'footnote',
  'annotation', 'atnauthor', 'atnid', 'header', 'headerl', 'headerr', 'footer', 'footerl',
  'footerr', 'filetbl', 'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'xmlnstbl',
  'datastore', 'themedata', 'colorschememapping', 'fldinst', 'nonshppict', 'shppict',
]);
const ZEICHEN: Record<string, string> = {
  tab: '\t', line: '\n', emdash: '—', endash: '–', emspace: '\u2003', enspace: '\u2002',
  qmspace: '\u2005', bullet: '•', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
};

function codepage(n: number): string {
  if (n === 65001) return 'utf-8';
  if (n === 10000) return 'macintosh';
  return `windows-${n}`;
}

/** Platzhalter schützen Leerraum vor dem DOCX-Writer; ausgegeben werden die Originalzeichen. */
function markdownAbsatz(laeufe: Lauf[]): string {
  const text = laeufe.map((l) => l.text).join('');
  if (!text) return '';
  // Vor der Maskierung normalisieren: Platzhalter sind für den DOCX-Writer
  // Nicht-Leerzeichen. Rand-Leerraum darf deshalb keine Marker einschließen;
  // innerer Leerraum trägt nur die gemeinsame Auszeichnung seiner Nachbarn.
  const flags = laeufe.flatMap((l) => Array.from({ length: l.text.length }, () => ({ fett: l.fett, kursiv: l.kursiv })));
  for (const m of text.matchAll(/[^\S\n]+/gu)) {
    const s = m.index;
    const e = s + m[0].length;
    const links = text[s - 1] !== '\n' ? flags[s - 1] : undefined;
    const rechts = text[e] !== '\n' ? flags[e] : undefined;
    for (let i = s; i < e; i++) {
      flags[i] = { fett: !!links?.fett && !!rechts?.fett, kursiv: !!links?.kursiv && !!rechts?.kursiv };
    }
  }
  const normalisiert: Lauf[] = [];
  let offset = 0;
  for (const c of text) {
    const f = flags[offset]!;
    offset += c.length;
    const letzter = normalisiert.at(-1);
    if (letzter && letzter.fett === f.fett && letzter.kursiv === f.kursiv) letzter.text += c;
    else normalisiert.push({ text: c, ...f });
  }
  let marker = '\uE000';
  while (text.includes(marker)) marker += '\uE001';
  const ersetzungen: string[] = [];
  const randpositionen = new Set<number>();
  let zeilenstart = 0;
  for (const zeile of text.split('\n')) {
    const anfang = zeile.length - zeile.trimStart().length;
    const ende = zeile.trimEnd().length;
    for (let i = 0; i < anfang; i++) randpositionen.add(zeilenstart + i);
    for (let i = ende; i < zeile.length; i++) randpositionen.add(zeilenstart + i);
    zeilenstart += zeile.length + 1;
  }
  let pos = 0;
  const geschuetzt = normalisiert.map((l) => ({ ...l, text: [...l.text].map((c) => {
    const i = pos;
    pos += c.length;
    const rand = randpositionen.has(i);
    // Tabs/NBSP sowie Markdown-Szenentrenner müssen Inhalt bleiben, keine Syntax werden.
    if (rand || c === '\t' || c === '\u00a0' || (text === '* * *' && i === 0)) {
      const n = ersetzungen.push(c === '*' ? '\\*' : c) - 1;
      return `${marker}${n}${marker}`;
    }
    return c;
  }).join('') }));
  const markdown = absatzZuMarkdown(geschuetzt).join('\n\n');
  return markdown.replaceAll(new RegExp(`${marker}(\\d+)${marker}`, 'g'), (_, n: string) => ersetzungen[Number(n)]!);
}

/**
 * RTF-Lexer mit gruppenlokalem Zustand. Bytes bleiben bis zur Codepage-Dekodierung unverändert.
 * Ein abschließendes \\par ist der RTF-Absatzabschluss, zusätzliche leere Absätze bleiben erhalten.
 * Beschädigte Syntax wird verworfen; der Paketimport fängt RtfFehler feldweise ab.
 */
export function rtfUmwandeln(eingabe: string | Uint8Array): RtfErgebnis {
  let rtf = typeof eingabe === 'string' ? eingabe : Array.from(eingabe, (b) => String.fromCharCode(b)).join('');
  rtf = rtf.replace(/^\uFEFF/, '');
  const fehler = () => new RtfFehler('Ungültiges RTF');
  if (!/^\{\\rtf1(?=[\\\s{}])/.test(rtf)) throw fehler();
  let z: Zustand = { fett: false, kursiv: false, verborgen: false, ignorieren: false, uc: 1, codepage: 'windows-1252' };
  const stapel: Zustand[] = [];
  const absaetze: Lauf[][] = [[]];
  let fallback = 0;
  let beendet = false;
  const schreiben = (text: string, unicode = false) => {
    if (!unicode && fallback > 0) { fallback--; return; }
    if (z.ignorieren || z.verborgen) return;
    const laeufe = absaetze.at(-1)!;
    const letzter = laeufe.at(-1);
    if (letzter && letzter.fett === z.fett && letzter.kursiv === z.kursiv) letzter.text += text;
    else laeufe.push({ text, fett: z.fett, kursiv: z.kursiv });
  };
  const dekodieren = (bytes: number[]) => {
    try { return new TextDecoder(z.codepage, { fatal: true }).decode(new Uint8Array(bytes)); }
    catch { throw fehler(); }
  };
  for (let i = 0; i < rtf.length;) {
    const c = rtf[i++]!;
    if (beendet) { if (!/\s/.test(c)) throw fehler(); continue; }
    if (c === '{') {
      if (stapel.length >= 256) throw fehler();
      stapel.push({ ...z });
      continue;
    }
    if (c === '}') {
      const vorher = stapel.pop();
      if (!vorher) throw fehler();
      z = vorher;
      if (stapel.length === 0) beendet = true;
      continue;
    }
    if (c === '\r' || c === '\n') continue; // RTF-Quelltextumbrüche, kein Dokumentinhalt
    if (c !== '\\') {
      if (c.charCodeAt(0) < 128 || typeof eingabe === 'string') schreiben(c);
      else {
        const bytes = [c.charCodeAt(0)];
        while (i < rtf.length && rtf.charCodeAt(i) >= 128) bytes.push(rtf.charCodeAt(i++));
        for (const zeichen of dekodieren(bytes)) schreiben(zeichen);
      }
      continue;
    }
    const s = rtf[i++];
    if (s === undefined) throw fehler();
    if (s === '\\' || s === '{' || s === '}') { schreiben(s); continue; }
    if (s === "'") {
      const bytes: number[] = [];
      do {
        const hex = rtf.slice(i, i + 2);
        if (!/^[\da-f]{2}$/i.test(hex)) throw fehler();
        bytes.push(parseInt(hex, 16));
        i += 2;
        if (rtf.slice(i, i + 2) !== "\\'") break;
        i += 2;
      } while (true);
      // Unicode-Fallback zählt RTF-Zeichen/Bytes, nicht UTF-8-Codepoints.
      const skip = Math.min(fallback, bytes.length);
      fallback -= skip;
      if (skip < bytes.length) schreiben(dekodieren(bytes.slice(skip)), true);
      continue;
    }
    if (s === '*') { z.ignorieren = true; continue; }
    if (s === '~') { schreiben('\u00a0'); continue; }
    if (s === '_') { schreiben('‑'); continue; }
    if (s === '-') { schreiben('\u00ad'); continue; }
    if (s === '\r' || s === '\n') {
      if (s === '\r' && rtf[i] === '\n') i++;
      if (!z.ignorieren) absaetze.push([]);
      continue;
    }
    if (!/[a-z]/i.test(s)) continue;
    let wort = s;
    while (i < rtf.length && /[a-z]/i.test(rtf[i]!)) wort += rtf[i++];
    const zahl = /^-?\d+/.exec(rtf.slice(i));
    const n = zahl ? Number(zahl[0]) : undefined;
    if (zahl) i += zahl[0].length;
    if (rtf[i] === ' ') i++;
    if (ZIELE.has(wort)) { z.ignorieren = true; continue; }
    switch (wort) {
      case 'rtf': if (n !== 1) throw fehler(); break;
      case 'ansi': z.codepage = 'windows-1252'; break;
      case 'mac': z.codepage = 'macintosh'; break;
      case 'ansicpg':
        if (n === undefined) throw fehler();
        z.codepage = codepage(n);
        try { new TextDecoder(z.codepage); } catch { throw fehler(); }
        break;
      case 'b': z.fett = n !== 0; break;
      case 'i': z.kursiv = n !== 0; break;
      case 'v': z.verborgen = n !== 0; break;
      case 'plain': z.fett = z.kursiv = z.verborgen = false; break;
      case 'uc':
        if (n === undefined || n < 0 || n > 32) throw fehler();
        z.uc = n; break;
      case 'u':
        if (n === undefined || n < -32768 || n > 65535) throw fehler();
        schreiben(String.fromCharCode(n < 0 ? n + 65536 : n), true);
        fallback = z.uc; break;
      case 'par':
        if (fallback > 0) fallback--;
        else if (!z.ignorieren && !z.verborgen) absaetze.push([]);
        break;
      case 'bin':
        if (n === undefined || n < 0 || !Number.isSafeInteger(n) || i + n > rtf.length) throw fehler();
        i += n; break;
      default: if (ZEICHEN[wort]) schreiben(ZEICHEN[wort]!); break;
    }
  }
  if (!beendet || stapel.length) throw fehler();
  if (absaetze.length > 1 && absaetze.at(-1)!.length === 0) absaetze.pop();
  return {
    text: absaetze.map((a) => a.map((l) => l.text).join('')).join('\n\n'),
    markdown: absaetze.map(markdownAbsatz).join('\n\n'),
  };
}
