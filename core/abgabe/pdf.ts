/** pdfmake für die Abgabe-PDFs laden (wie core/pdf: ohne Netz- und Dateizugriff, Schriften aus dem Speicher). */
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { PdfSchrift } from '../pdf';

interface PdfMake {
  virtualfs: { writeFileSync(name: string, inhalt: string, kodierung?: string): void };
  setFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Uint8Array> };
  setUrlAccessPolicy?(cb: (url: string) => boolean): void;
  setLocalAccessPolicy?(cb: (pfad: string) => boolean): void;
}

const STANDARD = { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' };
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(daten: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < daten.length; i += 3) {
    const n = (daten[i]! << 16) | (daten[i + 1]! << 8) | daten[i + 2]!;
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = daten.length - i;
  if (rest === 1) {
    const n = daten[i]! << 16;
    s += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}==`;
  } else if (rest === 2) {
    const n = (daten[i]! << 16) | (daten[i + 1]! << 8);
    s += `${B64[(n >> 18) & 63]!}${B64[(n >> 12) & 63]!}${B64[(n >> 6) & 63]!}=`;
  }
  return s;
}

let laden: Promise<PdfMake> | null = null;

function ladePdfMake(): Promise<PdfMake> {
  laden ??= import('pdfmake').then((m) => {
    const pm = ((m as { default?: unknown }).default ?? m) as PdfMake;
    pm.setUrlAccessPolicy?.(() => false);
    pm.setLocalAccessPolicy?.((pfad) => Object.values(STANDARD).includes(pfad) || pfad.startsWith('plotwerk-'));
    return pm;
  });
  return laden;
}

/** Name der Hauptschrift im PDF (erste übergebene, sonst Times). */
export const pdfHauptschrift = (schriften?: PdfSchrift[] | null) => schriften?.[0]?.name ?? 'Times';

/** Schrift für ein Zeichen (Ergänzungsschriften für Zeichen außerhalb der Hauptschrift). */
function schriftFuer(code: number, schriften: PdfSchrift[]): string {
  for (const s of schriften) if (!s.bereiche || s.bereiche.some(([von, bis]) => code >= von && code <= bis)) return s.name;
  return schriften[0]!.name;
}

/** Text in Stücke je Schriftdatei teilen. */
export function pdfStuecke(text: string, schriften?: PdfSchrift[] | null): { text: string; font?: string }[] {
  if (!schriften || schriften.length < 2) return [{ text }];
  const ergebnis: { text: string; font?: string }[] = [];
  for (const c of text) {
    const font = /\s/.test(c) ? (ergebnis[ergebnis.length - 1]?.font ?? schriften[0]!.name) : schriftFuer(c.codePointAt(0)!, schriften);
    const letztes = ergebnis[ergebnis.length - 1];
    if (letztes && letztes.font === font) letztes.text += c;
    else ergebnis.push({ text: c, font });
  }
  return ergebnis;
}

/** Erzeugt ein PDF aus einer pdfmake-Definition mit den gegebenen Schriften (ohne: Times). */
export async function pdfErzeugen(def: TDocumentDefinitions, schriften?: PdfSchrift[] | null): Promise<Uint8Array> {
  const pdfMake = await ladePdfMake();
  const fonts: Record<string, Record<string, string>> = { Times: STANDARD };
  for (const s of schriften ?? []) {
    const datei = (art: string) => `plotwerk-${s.name}-${art}`;
    pdfMake.virtualfs.writeFileSync(datei('normal'), base64(s.normal), 'base64');
    pdfMake.virtualfs.writeFileSync(datei('kursiv'), base64(s.kursiv), 'base64');
    pdfMake.virtualfs.writeFileSync(datei('fett'), base64(s.fett), 'base64');
    pdfMake.virtualfs.writeFileSync(datei('fettKursiv'), base64(s.fettKursiv), 'base64');
    fonts[s.name] = { normal: datei('normal'), italics: datei('kursiv'), bold: datei('fett'), bolditalics: datei('fettKursiv') };
  }
  pdfMake.setFonts(fonts);
  const puffer = await pdfMake.createPdf(def).getBuffer();
  return new Uint8Array(puffer.buffer, puffer.byteOffset, puffer.byteLength).slice();
}
