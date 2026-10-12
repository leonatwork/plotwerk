/**
 * Belege für Zeitpunkte und Zustände (G1): wörtliche Textstelle → Textanker (E4), Anker wiederfinden.
 * Reines TypeScript ohne DOM/Tauri.
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Id, ProjektDaten, TextAnker } from '../model/types';
import { ankerErzeugen, ankerFinden, findeZitat, klartext, normalisiere } from '../text';

/** Meldungen zu Belegen (Oberflächensprache); gemeinsam mit core/figuren/boegen.ts. */
export const BELEG_TEXTE = texteJe(
  {
    kap: 'Kap. {nr}',
    unbekannt: '„{id}“',
    ohneText: '{name} hat noch keinen Text.',
    zuKurz: 'Das Zitat ist zu kurz.',
    nichtGefunden: 'Die Stelle steht so nicht in {name}.',
  },
  {
    kap: 'Ch. {nr}',
    unbekannt: '“{id}”',
    ohneText: '{name} has no text yet.',
    zuKurz: 'The quote is too short.',
    nichtGefunden: 'This passage isn’t in {name} in exactly this form.',
  },
);

export function kapitelKlartext(daten: ProjektDaten, kapitel: Id): string {
  const md = daten.kapitel?.[kapitel]?.text ?? '';
  return md.trim() ? klartext(md) : '';
}

/** Kapitelname für Meldungen: „Kap. 7“ (bzw. „„id““, falls unbekannt) */
export function kapitelKurz(daten: ProjektDaten, kapitel: Id, sprache: Sprache = 'de'): string {
  const nr = (daten.projekt?.kapitel ?? []).indexOf(kapitel) + 1;
  const t = BELEG_TEXTE(sprache);
  return nr > 0 ? fmt(t.kap, { nr }) : fmt(t.unbekannt, { id: kapitel });
}

/**
 * Wörtliches Zitat (E6) im Kapitel → Textanker. Fehlertext (in `sprache`), wenn das Kapitel leer ist, das
 * Zitat zu kurz ist oder so nicht im Text steht.
 */
export function belegAusZitat(daten: ProjektDaten, kapitel: Id, zitat: string, sprache: Sprache = 'de'): { anker: TextAnker } | { fehler: string } {
  const t = BELEG_TEXTE(sprache);
  const name = kapitelKurz(daten, kapitel, sprache);
  const text = kapitelKlartext(daten, kapitel);
  if (!text) return { fehler: fmt(t.ohneText, { name }) };
  if (normalisiere(zitat).text.replace(/\s/g, '').length < 3) return { fehler: t.zuKurz };
  const erster = findeZitat(text, zitat)[0];
  if (!erster) return { fehler: fmt(t.nichtGefunden, { name }) };
  return { anker: ankerErzeugen(kapitel, text, erster.start, erster.ende) };
}

/** Steht der Beleg noch (eindeutig) im Text? Sonst „verwaist“ (E4). */
export function belegGefunden(daten: ProjektDaten, anker: TextAnker | undefined): boolean {
  if (!anker) return false;
  const text = kapitelKlartext(daten, anker.kapitel);
  return !!text && ankerFinden(text, anker) !== null;
}
