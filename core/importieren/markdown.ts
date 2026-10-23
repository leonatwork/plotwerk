/** Reiner Ordnerparser: eine Datei pro Kapitel, keine Typografie- oder Zeilenenden-Umwandlung (E7). */
import type { ImportErgebnis } from '../docx/index';
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Hinweis } from '../model/types';

/** Plattformen melden Dateifehler einzeln, damit der Rest importiert werden kann. */
export type ImportDatei = { name: string } & ({ inhalt: string; fehler?: never } | { inhalt?: never; fehler: 'lesen' | 'kodierung' });

/** Gleiche Namensregel wie Rust: eine Ebene, keine versteckten Dateien, Endungen ohne Beachtung der Großschreibung. */
export function importDateinameErlaubt(name: string): boolean {
  return !name.startsWith('.') && !/[\\/]/.test(name) && /\.(md|markdown|txt)$/i.test(name);
}

const TEXTE = texteJe(
  {
    leer: 'Leere Datei', leerText: '„{name}“ enthält keinen Text und wurde übersprungen.',
    lesen: 'Datei nicht lesbar', lesenText: '„{name}“ konnte nicht gelesen werden und wurde übersprungen.',
    kodierung: 'Kodierung nicht lesbar', kodierungText: '„{name}“ ist nicht als UTF-8 lesbar und wurde übersprungen.',
    titel: 'Keine Titelüberschrift', titelText: '„{name}“ beginnt nicht mit einer # Überschrift. Der Dateiname liefert den Kapiteltitel.',
    geplant: 'Kapitel ohne Text', geplantText: '„{name}“ hat eine Titelüberschrift, aber keinen Text und wird als geplantes Kapitel übernommen.',
  },
  {
    leer: 'Empty file', leerText: '“{name}” contains no text and was skipped.',
    lesen: 'File not readable', lesenText: '“{name}” could not be read and was skipped.',
    kodierung: 'Encoding not readable', kodierungText: '“{name}” is not readable as UTF-8 and was skipped.',
    titel: 'No title heading', titelText: '“{name}” does not start with a # heading. The file name supplies the chapter title.',
    geplant: 'Chapter without text', geplantText: '“{name}” has a title heading but no text and will be imported as a planned chapter.',
  },
);

export function importiereOrdner(dateien: readonly ImportDatei[], sprache: Sprache = 'de'): ImportErgebnis {
  const ergebnis: ImportErgebnis = { kapitel: [], hinweise: [], vorspann: '' };
  const t = TEXTE(sprache);
  // Feste Sortiersprache: Dateireihenfolge darf sich beim Wechsel der UI-Sprache nicht ändern.
  const sortierung = new Intl.Collator('de', { numeric: true });
  const liste = dateien.filter((d) => importDateinameErlaubt(d.name)).sort((a, b) => sortierung.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  liste.forEach((datei, index) => {
    const melden = (art: 'leer' | 'lesen' | 'kodierung' | 'titel' | 'geplant', kapitel?: number) => {
      const h: Hinweis = {
        schluessel: `struktur:import:ordner-${art}-${index + 1}`,
        typ: 'struktur', titel: t[art], erklaerung: fmt(t[`${art}Text`], { name: datei.name }),
        quelle: 'lokal', status: 'neu', zitate: kapitel ? [{ kapitel: `#${kapitel}`, text: '' }] : [],
      };
      ergebnis.hinweise.push(h);
    };
    if (datei.fehler) { melden(datei.fehler); return; }
    let text = datei.inhalt.replace(/^\uFEFF/, '');
    // Nur geschlossenes Frontmatter am Dateianfang; dessen abschließender Zeilenumbruch gehört dazu.
    text = text.replace(/^---[ \t]*\r?\n[\s\S]*?^---[ \t]*(?:\r?\n|$)/m, (frontmatter, offset: number) => offset === 0 ? '' : frontmatter);
    const titelzeile = /^(?:[ \t]*\r?\n)*# ([^\r\n]*)(?:\r?\n|$)/.exec(text);
    const titel = titelzeile?.[1]?.trim();
    if (!text.trim()) { melden('leer'); return; }
    let kapitelTitel = datei.name.replace(/\.(md|markdown|txt)$/i, '').replace(/^\d+[\s._-]*/, '').trim();
    if (!kapitelTitel) kapitelTitel = datei.name.replace(/\.(md|markdown|txt)$/i, '');
    if (titel && titelzeile) {
      kapitelTitel = titel;
      // Leerzeilen davor bleiben erhalten; nur die Titelzeile mitsamt ihrem Umbruch entfernen.
      const start = titelzeile[0].indexOf('# ');
      text = text.slice(0, start) + text.slice(titelzeile[0].length);
    } else melden('titel', ergebnis.kapitel.length + 1);
    ergebnis.kapitel.push({ titel: kapitelTitel, text });
    if (!text.trim()) melden('geplant', ergebnis.kapitel.length);
  });
  return ergebnis;
}
