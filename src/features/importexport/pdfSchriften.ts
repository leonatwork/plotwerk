/**
 * Newsreader für den PDF-Export: statische WOFF-Schnitte 400/700 normal/kursiv aus @fontsource/newsreader
 * (SIL Open Font License 1.1, siehe node_modules/@fontsource/newsreader/LICENSE). Teilmenge „latin“ als
 * Hauptschrift, „latin-ext“ für weitere lateinische Zeichen (ł, ő, ș …). Kein Netzzugriff.
 */
import type { PdfSchrift } from '@core/pdf/index';
import ext400i from '@fontsource/newsreader/files/newsreader-latin-ext-400-italic.woff?url';
import ext400 from '@fontsource/newsreader/files/newsreader-latin-ext-400-normal.woff?url';
import ext700i from '@fontsource/newsreader/files/newsreader-latin-ext-700-italic.woff?url';
import ext700 from '@fontsource/newsreader/files/newsreader-latin-ext-700-normal.woff?url';
import latin400i from '@fontsource/newsreader/files/newsreader-latin-400-italic.woff?url';
import latin400 from '@fontsource/newsreader/files/newsreader-latin-400-normal.woff?url';
import latin700i from '@fontsource/newsreader/files/newsreader-latin-700-italic.woff?url';
import latin700 from '@fontsource/newsreader/files/newsreader-latin-700-normal.woff?url';
import unicode from '@fontsource/newsreader/unicode.json';

/** „U+0000-00FF,U+0131“ → [[0, 255], [305, 305]] */
export function unicodeBereiche(angabe: string): [number, number][] {
  return angabe
    .split(',')
    .map((teil) => teil.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((teil) => {
      const [von, bis] = teil.split('-');
      const a = parseInt(von!, 16);
      return [a, bis ? parseInt(bis, 16) : a] as [number, number];
    });
}

async function laden(url: string): Promise<Uint8Array> {
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`Schrift für den PDF-Export nicht ladbar (${antwort.status})`);
  return new Uint8Array(await antwort.arrayBuffer());
}

let geladen: Promise<PdfSchrift[]> | null = null;

export function ladePdfSchriften(): Promise<PdfSchrift[]> {
  geladen ??= (async () => {
    const [n, k, f, fk, en, ek, ef, efk] = await Promise.all(
      [latin400, latin400i, latin700, latin700i, ext400, ext400i, ext700, ext700i].map(laden),
    );
    return [
      { name: 'Newsreader', normal: n!, kursiv: k!, fett: f!, fettKursiv: fk!, bereiche: unicodeBereiche(unicode.latin) },
      { name: 'NewsreaderExt', normal: en!, kursiv: ek!, fett: ef!, fettKursiv: efk!, bereiche: unicodeBereiche(unicode['latin-ext']) },
    ];
  })();
  geladen.catch(() => {
    geladen = null;
  });
  return geladen;
}
