/**
 * Belege für Zeitpunkte und Zustände (G1): wörtliche Textstelle → Textanker (E4), Anker wiederfinden.
 * Reines TypeScript ohne DOM/Tauri.
 */
import type { Id, ProjektDaten, TextAnker } from '../model/types';
import { ankerErzeugen, ankerFinden, findeZitat, klartext, normalisiere } from '../text';

export function kapitelKlartext(daten: ProjektDaten, kapitel: Id): string {
  const md = daten.kapitel?.[kapitel]?.text ?? '';
  return md.trim() ? klartext(md) : '';
}

/** Kapitelname für Meldungen: „Kap. 7“ (bzw. „„id““, falls unbekannt) */
export function kapitelKurz(daten: ProjektDaten, kapitel: Id): string {
  const nr = (daten.projekt?.kapitel ?? []).indexOf(kapitel) + 1;
  return nr > 0 ? `Kap. ${nr}` : `„${kapitel}“`;
}

/**
 * Wörtliches Zitat (E6) im Kapitel → Textanker. Fehlertext, wenn das Kapitel leer ist, das Zitat zu kurz ist
 * oder so nicht im Text steht.
 */
export function belegAusZitat(daten: ProjektDaten, kapitel: Id, zitat: string): { anker: TextAnker } | { fehler: string } {
  const name = kapitelKurz(daten, kapitel);
  const text = kapitelKlartext(daten, kapitel);
  if (!text) return { fehler: `${name} hat noch keinen Text.` };
  if (normalisiere(zitat).text.replace(/\s/g, '').length < 3) return { fehler: 'Das Zitat ist zu kurz.' };
  const erster = findeZitat(text, zitat)[0];
  if (!erster) return { fehler: `Die Stelle steht so nicht in ${name}.` };
  return { anker: ankerErzeugen(kapitel, text, erster.start, erster.ende) };
}

/** Steht der Beleg noch (eindeutig) im Text? Sonst „verwaist“ (E4). */
export function belegGefunden(daten: ProjektDaten, anker: TextAnker | undefined): boolean {
  if (!anker) return false;
  const text = kapitelKlartext(daten, anker.kapitel);
  return !!text && ankerFinden(text, anker) !== null;
}
