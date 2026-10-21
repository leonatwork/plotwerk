import type { ImportErgebnis } from '../docx/index';
import { fmt, texteJe, type Sprache } from '../i18n';

export type ImportDatei = { name: string } & ({ inhalt: string; fehler?: never } | { inhalt?: never; fehler: 'lesen' | 'kodierung' });

export function importDateinameErlaubt(name: string): boolean {
  return !name.startsWith('.') && !/[\\/]/.test(name) && /\.(md|markdown|txt)$/i.test(name);
}

const TEXTE = texteJe({
  leer: 'Leere Datei', leerText: '„{name}“ enthält keinen Kapiteltext und wurde übersprungen.',
  lesen: 'Datei nicht lesbar', lesenText: '„{name}“ konnte nicht gelesen werden und wurde übersprungen.',
  kodierung: 'UTF-8 erwartet', kodierungText: '„{name}“ ist nicht als UTF-8 dekodierbar und wurde übersprungen.',
  titel: 'Keine Titelüberschrift', titelText: '„{name}“ beginnt nicht mit einer # Überschrift. Der Dateiname wird als Kapiteltitel verwendet.',
}, {
  leer: 'Empty file', leerText: '“{name}” contains no chapter text and was skipped.',
  lesen: 'File not readable', lesenText: '“{name}” could not be read and was skipped.',
  kodierung: 'UTF-8 expected', kodierungText: '“{name}” could not be decoded as UTF-8 and was skipped.',
  titel: 'No title heading', titelText: '“{name}” does not start with a # heading. The file name is used as the chapter title.',
});

/** Feste Sortiersprache: dieselbe Reihenfolge in DE/EN, Zahlen natürlich; Gleichstand nach Originalname. */
const SORTIERUNG = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Reiner Ordnerparser. Leerzeilen sind auch bei .txt bereits Markdown-Absatzgrenzen (E7). */
export function importiereMarkdownOrdner(dateien: readonly ImportDatei[], sprache: Sprache = 'de'): ImportErgebnis {
  const ergebnis: ImportErgebnis = { kapitel: [], hinweise: [], vorspann: '', textUnveraendert: true };
  const T = TEXTE(sprache);
  const sortiert = dateien.filter((d) => importDateinameErlaubt(d.name)).sort((a, b) =>
    SORTIERUNG.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const [i, datei] of sortiert.entries()) {
    const hinweis = (art: 'leer' | 'lesen' | 'kodierung' | 'titel') => {
      ergebnis.hinweise.push({
        schluessel: `struktur:import:ordner:${art}:${i}`, typ: 'struktur', quelle: 'lokal', status: 'neu',
        titel: T[art], erklaerung: fmt(T[`${art}Text`], { name: datei.name }), zitate: [],
      });
    };
    if (datei.fehler) { hinweis(datei.fehler); continue; }
    let text = datei.inhalt.replace(/^\uFEFF/, '');
    // Nur ein abgeschlossenes Frontmatter am Anfang entfernen, keine YAML-Neuserialisierung.
    text = text.replace(/^---[ \t]*\r?\n[\s\S]*?^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m, (block, offset: number) => offset === 0 ? '' : block);
    const titelzeile = /^((?:[ \t]*\r?\n)*)# ([^\r\n]+)(?:\r?\n|$)/.exec(text);
    const titel = titelzeile?.[2]?.trim();
    if (titel) text = titelzeile![1]! + text.slice(titelzeile![0].length);
    if (!text.trim()) { hinweis('leer'); continue; }
    if (!titel) hinweis('titel');
    const dateititel = datei.name.replace(/\.(md|markdown|txt)$/i, '').replace(/^\d+[\s._-]*/, '').trim();
    ergebnis.kapitel.push({ titel: titel || dateititel || datei.name.replace(/\.[^.]+$/, ''), text });
  }
  return ergebnis;
}
