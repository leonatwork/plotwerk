/** Import und Export von Word-Dateien (S-11, S-12). Besitzer: Import/Export. */
import type { Sprache } from '../i18n';
import type { Kapitel } from '../model/types';
import { exportiereDocxMit } from './exportieren';

export {
  DOCX_TEXTE,
  DocxFehler,
  endetMittenImSatz,
  IMPORT_KAPITEL_PRAEFIX,
  importHinweisKapitel,
  importiereDocx,
  importKapitelNummer,
  type ImportErgebnis,
  type ImportKapitel,
  type ImportKommentar,
  type ImportKommentarAntwort,
} from './importieren';
export { kommentareAlsAnmerkungen, kommentarNotiz, type KommentarUebernahme } from './kommentare';
export { DOCX_SCHRIFTEN, exportiereDocxMit, type DocxOptionen } from './exportieren';
export {
  absatzZuMarkdown,
  blockText,
  laeufeText,
  leseMarkdown,
  markdownKlartext,
  SZENENTRENNER,
  ueberschriftZuMarkdown,
  type Block,
  type Lauf,
} from './markdown';

/** Kapitel als Überschrift 1, ohne Anmerkungen/Markierungen. `sprache`: Buchsprache. */
export async function exportiereDocx(kapitel: Kapitel[], buchtitel: string, sprache: Sprache = 'de'): Promise<Uint8Array> {
  return exportiereDocxMit(kapitel, buchtitel, { sprache });
}
