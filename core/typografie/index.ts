/**
 * Deutsche Typografie beim Tippen (E7). Besitzer: Kernlogik. Genutzt vom Editor als Input-Rule.
 * „ “ für doppelte, ‚ ‘ für einfache Anführungszeichen, ’ als Apostroph (geht’s, probier’),
 * " -- " / "--" → Gedankenstrich –, "..." → …
 *
 * Regeln:
 * - `"` öffnend „ am Absatzanfang, nach Leerraum, Klammer, Strich oder öffnendem Anführungszeichen, sonst “.
 * - `'` öffnend ‚ in denselben Lagen; schließend ‘, wenn im Absatz ein ‚ offen ist; sonst Apostroph ’.
 *   Folgt auf ein schließendes ‘ direkt ein Buchstabe (‚Ich geh‘s), wird es zum Apostroph (geh’s).
 * - zweites `-` direkt nach `-` → – (Leerzeichen davor bleibt erhalten).
 * - Leerzeichen nach „Wort - “ → „Wort – “ (frei stehender Bindestrich wird Gedankenstrich).
 * - drittes `.` nach `..` → …
 * - Nichts davon in URLs, Pfaden, E-Mail-Adressen und `Code`.
 */
export interface Ersetzung {
  /** Anzahl Zeichen direkt vor dem Cursor, die entfernt werden */
  loeschen: number;
  /** Text, der statt der Eingabe eingefügt wird */
  einfuegen: string;
}

const BUCHSTABE = /^[\p{L}\p{N}]$/u;
const OEFFNEND_DAVOR = /[\s([{<\-‐‑–—/„‚»›]$/u;

function oeffnendeLage(textDavor: string): boolean {
  return textDavor === '' || OEFFNEND_DAVOR.test(textDavor);
}

/** Cursor steht in einer URL, einem Pfad, einer E-Mail-Adresse oder in `Code`. */
function technisch(textDavor: string): boolean {
  if ((textDavor.match(/`/g)?.length ?? 0) % 2 === 1) return true;
  const wort = /\S*$/.exec(textDavor)?.[0] ?? '';
  return /:\/\/|^www\.|^mailto:|\S@\S|\\|^(?:~|\.{1,2})?\//i.test(wort);
}

function einfachOffen(textDavor: string): boolean {
  return textDavor.lastIndexOf('‚') > textDavor.lastIndexOf('‘');
}

/**
 * @param textDavor Text des aktuellen Absatzes vom Absatzanfang bis zum Cursor
 * @param eingabe das gerade getippte Zeichen
 * @returns null = Eingabe unverändert übernehmen
 */
export function typografieBeimTippen(textDavor: string, eingabe: string): Ersetzung | null {
  if ([...eingabe].length !== 1) return null;
  if (technisch(textDavor)) return null;
  const vor = textDavor.slice(-1);
  switch (eingabe) {
    case '"':
      return { loeschen: 0, einfuegen: oeffnendeLage(textDavor) ? '„' : '“' };
    case "'":
      if (oeffnendeLage(textDavor)) return { loeschen: 0, einfuegen: '‚' };
      return { loeschen: 0, einfuegen: einfachOffen(textDavor) ? '‘' : '’' };
    case '-':
      return vor === '-' ? { loeschen: 1, einfuegen: '–' } : null;
    case ' ':
      return /\S[ \t]-$/u.test(textDavor) ? { loeschen: 1, einfuegen: '– ' } : null;
    case '.':
      return textDavor.endsWith('..') && !textDavor.endsWith('...') ? { loeschen: 2, einfuegen: '…' } : null;
    default:
      if (vor === '‘' && BUCHSTABE.test(eingabe) && BUCHSTABE.test(textDavor.slice(-2, -1)))
        return { loeschen: 1, einfuegen: `’${eingabe}` };
      return null;
  }
}
