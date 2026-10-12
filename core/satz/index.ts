/**
 * Buchsatz aus Markdown – gemeinsam für die Lesevorschau (src/features/vorschau) und den EPUB-Export
 * (core/epub), damit beide gleich setzen. Rein, ohne DOM. Markdown wird wie beim Export über
 * core/docx/markdown (CommonMark) gelesen.
 */
import { leseMarkdown, type Block, type Lauf } from '../docx/markdown';
import type { Sprache } from '../i18n';

export type SatzBlock =
  | { art: 'absatz'; laeufe: Lauf[]; /** Erstzeileneinzug (Folgeabsatz, nicht nach Überschrift oder Trenner) */ einzug: boolean }
  | { art: 'ueberschrift'; ebene: number; laeufe: Lauf[] }
  | { art: 'trenner' };

function blockLeer(b: Block): boolean {
  return b.art !== 'trenner' && b.laeufe.every((l) => l.text.trim() === '');
}

function vergleichbar(s: string, sprache: Sprache): string {
  return s
    .normalize('NFC')
    .toLocaleLowerCase(sprache)
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

/** Leerraum am Rand eines Absatzes entfernen (Blocksatz), harte Umbrüche bleiben. */
function laeufeTrimmen(laeufe: Lauf[]): Lauf[] {
  const kopie = laeufe.map((l) => ({ ...l }));
  while (kopie.length && kopie[0]!.text.trimStart() === '') kopie.shift();
  while (kopie.length && kopie[kopie.length - 1]!.text.trimEnd() === '') kopie.pop();
  if (kopie.length) {
    kopie[0]!.text = kopie[0]!.text.trimStart();
    kopie[kopie.length - 1]!.text = kopie[kopie.length - 1]!.text.trimEnd();
  }
  return kopie;
}

/**
 * Markdown → Satzblöcke: leere Blöcke entfallen, Trenner am Anfang/Ende und doppelte Trenner entfallen,
 * eine erste Überschrift, die nur den Kapiteltitel wiederholt, entfällt (steht im Kapitelkopf).
 * Einzug für jeden Absatz, der direkt auf einen Absatz folgt. `sprache`: Buchsprache (Vergleich des Titels).
 */
export function satzBloecke(markdown: string, kapitelTitel = '', sprache: Sprache = 'de'): SatzBlock[] {
  const ergebnis: SatzBlock[] = [];
  for (const b of leseMarkdown(markdown).filter((x) => !blockLeer(x))) {
    const vorher = ergebnis[ergebnis.length - 1];
    if (b.art === 'trenner') {
      if (vorher && vorher.art !== 'trenner') ergebnis.push({ art: 'trenner' });
      continue;
    }
    if (b.art === 'ueberschrift') {
      const text = b.laeufe.map((l) => l.text).join('');
      if (ergebnis.length === 0 && kapitelTitel && vergleichbar(text, sprache) === vergleichbar(kapitelTitel, sprache)) continue;
      ergebnis.push({ art: 'ueberschrift', ebene: b.ebene, laeufe: laeufeTrimmen(b.laeufe) });
      continue;
    }
    ergebnis.push({ art: 'absatz', laeufe: laeufeTrimmen(b.laeufe), einzug: vorher?.art === 'absatz' });
  }
  while (ergebnis.length && ergebnis[ergebnis.length - 1]!.art === 'trenner') ergebnis.pop();
  return ergebnis;
}
