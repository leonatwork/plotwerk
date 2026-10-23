/**
 * Typografie beim Tippen (E7) je Buchsprache. Besitzer: Kernlogik. Genutzt vom Editor als Input-Rule.
 *
 * Deutsch (Standard): „ “ für doppelte, ‚ ‘ für einfache Anführungszeichen, ’ als Apostroph (geht’s, probier’),
 * " -- " / "--" → Gedankenstrich –, "..." → …
 * Wählbare deutsche Stile: Verlag » « / › ‹, Schweiz « » / ‹ ›. Apostroph immer ’;
 * öffnende Lage nach Leerraum, Klammern, Strichen oder den öffnenden Zeichen des jeweiligen Stils.
 *
 * Regeln Deutsch:
 * - `"` öffnend „ am Absatzanfang, nach Leerraum, Klammer, Strich oder öffnendem Anführungszeichen, sonst “.
 * - `'` öffnend ‚ in denselben Lagen; schließend ‘, wenn im Absatz ein ‚ offen ist; sonst Apostroph ’.
 *   Folgt auf ein schließendes ‘ direkt ein Buchstabe (‚Ich geh‘s), wird es zum Apostroph (geh’s).
 * - zweites `-` direkt nach `-` → – (Leerzeichen davor bleibt erhalten).
 * - Leerzeichen nach „Wort - “ → „Wort – “ (frei stehender Bindestrich wird Gedankenstrich).
 * - drittes `.` nach `..` → …
 *
 * Englisch (Buchsprache en): “ ” für doppelte, ‘ ’ für einfache Anführungszeichen, ’ als Apostroph.
 * - `"` öffnend “ am Absatzanfang, nach Leerraum, Klammer, Schrägstrich oder öffnendem Anführungszeichen, sonst ”.
 *   Direkt nach einem Strich schließend (abgebrochene Rede: “I was going to—”).
 * - `'` öffnend ‘ in den öffnenden Lagen (auch nach Strichen), sonst ’ – schließendes einfaches Anführungszeichen
 *   und Apostroph sind im Englischen dasselbe Zeichen (don’t, Chris’). Apostroph am Wortanfang ohne Wörterbuch:
 *   Folgt auf ‘ eine Ziffer (’90s) oder steht ‘ vor einer bekannten Kurzform (’n’, ’em, ’til, ’tis, ’twas, ’bout,
 *   ’cause), wird ‘ nachträglich zu ’ (rock ’n’ roll).
 * - Gedankenstrich nach amerikanischer Buchkonvention: `--` → Geviertstrich — (em dash). Leerzeichen bleiben, wie
 *   getippt (word—word bzw. word — word); ein frei stehender Bindestrich („word - “) wird ebenfalls zu —.
 * - drittes `.` nach `..` → …
 *
 * Nichts davon in URLs, Pfaden, E-Mail-Adressen und `Code`.
 */
import type { Sprache } from '../i18n';
import type { AnfuehrungszeichenStil } from '../model/types';

export interface Ersetzung {
  /** Anzahl Zeichen direkt vor dem Cursor, die entfernt werden */
  loeschen: number;
  /** Text, der statt der Eingabe eingefügt wird */
  einfuegen: string;
}

const BUCHSTABE = /^[\p{L}\p{N}]$/u;
const OEFFNEND_DAVOR = /[\s([{<\-‐‑–—/„‚»›]$/u;
const STILE = {
  de: { auf: '„', zu: '“', einfachAuf: '‚', einfachZu: '‘', davor: OEFFNEND_DAVOR },
  verlag: { auf: '»', zu: '«', einfachAuf: '›', einfachZu: '‹', davor: /[\s([{<\-‐‑–—/»›]$/u },
  schweiz: { auf: '«', zu: '»', einfachAuf: '‹', einfachZu: '›', davor: /[\s([{<\-‐‑–—/«‹]$/u },
} as const;
/** Englisch: öffnende Lage für `'` (auch nach Strichen) … */
const OEFFNEND_DAVOR_EN = /[\s([{<\-‐‑–—/“‘]$/u;
/** … und für `"` (direkt nach einem Strich schließt es: “I was going to—”). */
const OEFFNEND_DAVOR_EN_DOPPELT = /[\s([{</“‘]$/u;

/** Englische Kurzformen, die mit Apostroph beginnen (rock ’n’ roll, ’em, ’til …), noch mit ‘ getippt. */
const KURZFORM_EN = /(?:^|[\s([{<\-‐‑–—/“])‘(n|em|til|tis|twas|bout|cause)$/iu;

function oeffnendeLage(textDavor: string, muster = OEFFNEND_DAVOR): boolean {
  return textDavor === '' || muster.test(textDavor);
}

/** Cursor steht in einer URL, einem Pfad, einer E-Mail-Adresse oder in `Code`. */
function technisch(textDavor: string): boolean {
  if ((textDavor.match(/`/g)?.length ?? 0) % 2 === 1) return true;
  const wort = /\S*$/.exec(textDavor)?.[0] ?? '';
  return /:\/\/|^www\.|^mailto:|\S@\S|\\|^(?:~|\.{1,2})?\//i.test(wort);
}

function einfachOffen(textDavor: string, auf: string, zu: string): boolean {
  return textDavor.lastIndexOf(auf) > textDavor.lastIndexOf(zu);
}

/**
 * @param textDavor Text des aktuellen Absatzes vom Absatzanfang bis zum Cursor
 * @param eingabe das gerade getippte Zeichen
 * @param sprache Buchsprache (Standard Deutsch)
 * @param stil deutsche Anführungszeichen (Standard de), bei Englisch ohne Wirkung
 * @returns null = Eingabe unverändert übernehmen
 */
export function typografieBeimTippen(textDavor: string, eingabe: string, sprache: Sprache = 'de', stil: AnfuehrungszeichenStil = 'de'): Ersetzung | null {
  if ([...eingabe].length !== 1) return null;
  if (technisch(textDavor)) return null;
  return sprache === 'en' ? englisch(textDavor, eingabe) : deutsch(textDavor, eingabe, stil);
}

function englisch(textDavor: string, eingabe: string): Ersetzung | null {
  // Kurzform mit Apostroph am Wortanfang fertig getippt: ‘n + ' → ’n’, ‘em + Leerzeichen → ’em
  if (!BUCHSTABE.test(eingabe)) {
    const wort = KURZFORM_EN.exec(textDavor)?.[1];
    if (wort) {
      const rest = englischZeichen(textDavor, eingabe);
      return { loeschen: wort.length + 1 + (rest?.loeschen ?? 0), einfuegen: `’${wort}${rest ? rest.einfuegen : eingabe}` };
    }
  }
  return englischZeichen(textDavor, eingabe);
}

function englischZeichen(textDavor: string, eingabe: string): Ersetzung | null {
  const vor = textDavor.slice(-1);
  switch (eingabe) {
    case '"':
      return { loeschen: 0, einfuegen: oeffnendeLage(textDavor, OEFFNEND_DAVOR_EN_DOPPELT) ? '“' : '”' };
    case "'":
      return { loeschen: 0, einfuegen: oeffnendeLage(textDavor, OEFFNEND_DAVOR_EN) ? '‘' : '’' };
    case '-':
      return vor === '-' ? { loeschen: 1, einfuegen: '—' } : null;
    case ' ':
      return /\S[ \t]-$/u.test(textDavor) ? { loeschen: 1, einfuegen: '— ' } : null;
    case '.':
      return textDavor.endsWith('..') && !textDavor.endsWith('...') ? { loeschen: 2, einfuegen: '…' } : null;
    default:
      // ‘90s → ’90s (Apostroph vor einer Jahreszahl)
      if (vor === '‘' && /^\p{N}$/u.test(eingabe) && oeffnendeLage(textDavor.slice(0, -1), OEFFNEND_DAVOR_EN))
        return { loeschen: 1, einfuegen: `’${eingabe}` };
      return null;
  }
}

function deutsch(textDavor: string, eingabe: string, stil: AnfuehrungszeichenStil): Ersetzung | null {
  const { auf, zu, einfachAuf, einfachZu, davor } = STILE[stil];
  const vor = textDavor.slice(-1);
  switch (eingabe) {
    case '"':
      return { loeschen: 0, einfuegen: oeffnendeLage(textDavor, davor) ? auf : zu };
    case "'":
      if (oeffnendeLage(textDavor, davor)) return { loeschen: 0, einfuegen: einfachAuf };
      return { loeschen: 0, einfuegen: einfachOffen(textDavor, einfachAuf, einfachZu) ? einfachZu : '’' };
    case '-':
      return vor === '-' ? { loeschen: 1, einfuegen: '–' } : null;
    case ' ':
      return /\S[ \t]-$/u.test(textDavor) ? { loeschen: 1, einfuegen: '– ' } : null;
    case '.':
      return textDavor.endsWith('..') && !textDavor.endsWith('...') ? { loeschen: 2, einfuegen: '…' } : null;
    default:
      if (vor === einfachZu && BUCHSTABE.test(eingabe) && BUCHSTABE.test(textDavor.slice(-2, -1)))
        return { loeschen: 1, einfuegen: `’${eingabe}` };
      return null;
  }
}
