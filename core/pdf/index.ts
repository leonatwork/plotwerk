/**
 * PDF-Export (S-12). Besitzer: Import/Export.
 * Gleiche Struktur wie der Word-Export: Titelseite, je Kapitel neue Seite mit Überschrift, Absätze mit
 * fett/kursiv, Szenentrenner zentriert, Seitenzahlen. Schrift wird eingebettet (pdfmake/pdfkit).
 *
 * Schriften: Die App übergibt Newsreader (OFL, WOFF aus @fontsource/newsreader, Teilmengen „latin“ und
 * „latin-ext“). Ohne übergebene Schrift wird die PDF-Standardschrift Times verwendet (nicht eingebettet,
 * nur Zeichen aus WinAnsi).
 */
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import { leseMarkdown, SZENENTRENNER, type Lauf } from '../docx/markdown';
import { localeVon, type Sprache } from '../i18n';
import type { Kapitel } from '../model/types';

export interface PdfSchrift {
  /** Name der Schriftfamilie im PDF, z. B. „Newsreader“ */
  name: string;
  normal: Uint8Array;
  kursiv: Uint8Array;
  fett: Uint8Array;
  fettKursiv: Uint8Array;
  /** Unicode-Bereiche [von, bis] (inklusive), die diese Datei abdeckt; fehlt = alle Zeichen */
  bereiche?: [number, number][];
}

export interface PdfOptionen {
  /** Erste Schrift ist die Hauptschrift; weitere nur für Zeichen außerhalb ihrer Bereiche (z. B. latin-ext) */
  schriften?: PdfSchrift[];
  /** Titelseite mit dem Buchtitel (Standard: ja, wenn ein Titel vorhanden ist) */
  titelseite?: boolean;
  /** Buchsprache (Sprachkennung des PDF); Standard Deutsch */
  sprache?: Sprache;
}

interface PdfMake {
  virtualfs: { writeFileSync(name: string, inhalt: string, kodierung?: string): void };
  setFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(def: TDocumentDefinitions): { getBuffer(): Promise<Uint8Array> };
  setUrlAccessPolicy?(cb: (url: string) => boolean): void;
  setLocalAccessPolicy?(cb: (pfad: string) => boolean): void;
}

const STANDARD = { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' };

let registriert: PdfSchrift[] | null = null;

/** Schriften für exportierePdf() festlegen (die App ruft das einmal mit Newsreader auf). */
export function pdfSchriftenSetzen(schriften: PdfSchrift[] | null): void {
  registriert = schriften;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(daten: Uint8Array): string {
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

let pdfMakeLaden: Promise<PdfMake> | null = null;

function ladePdfMake(): Promise<PdfMake> {
  pdfMakeLaden ??= import('pdfmake').then((m) => {
    const pm = ((m as { default?: unknown }).default ?? m) as PdfMake;
    pm.setUrlAccessPolicy?.(() => false);
    pm.setLocalAccessPolicy?.((pfad) => Object.values(STANDARD).includes(pfad));
    return pm;
  });
  return pdfMakeLaden;
}

function schriftFuer(code: number, schriften: PdfSchrift[]): string {
  for (const s of schriften) if (!s.bereiche || s.bereiche.some(([von, bis]) => code >= von && code <= bis)) return s.name;
  return schriften[0]!.name;
}

/** Text in Stücke je Schriftdatei teilen (Zeichen außerhalb der Hauptschrift → Ergänzungsschrift). */
function stuecke(text: string, schriften: PdfSchrift[] | null): { text: string; font?: string }[] {
  if (!schriften || schriften.length < 2) return [{ text }];
  const ergebnis: { text: string; font?: string }[] = [];
  for (const c of text) {
    const code = c.codePointAt(0)!;
    const font = /\s/.test(c) ? (ergebnis[ergebnis.length - 1]?.font ?? schriften[0]!.name) : schriftFuer(code, schriften);
    const letztes = ergebnis[ergebnis.length - 1];
    if (letztes && letztes.font === font) letztes.text += c;
    else ergebnis.push({ text: c, font });
  }
  return ergebnis;
}

function laeufe(liste: Lauf[], schriften: PdfSchrift[] | null): ContentText[] {
  return liste.flatMap((l) =>
    stuecke(l.text.replace(/\t/g, '    '), schriften).map((s) => ({
      text: s.text,
      ...(s.font ? { font: s.font } : {}),
      ...(l.fett ? { bold: true } : {}),
      ...(l.kursiv ? { italics: true } : {}),
    })),
  );
}

function kapitelInhalt(k: Kapitel, neueSeite: boolean, schriften: PdfSchrift[] | null): Content[] {
  const inhalt: Content[] = [
    { text: stuecke(k.titel, schriften), style: 'kapitel', headlineLevel: 1, ...(neueSeite ? { pageBreak: 'before' as const } : {}) },
  ];
  let nachUmbruch = true;
  for (const b of leseMarkdown(k.text)) {
    if (b.art === 'trenner') {
      inhalt.push({ text: SZENENTRENNER, style: 'trenner' });
      nachUmbruch = true;
    } else if (b.art === 'ueberschrift') {
      inhalt.push({ text: laeufe(b.laeufe, schriften).map((t) => ({ ...t, text: String(t.text).replace(/\n/g, ' ') })), style: 'zwischen' });
      nachUmbruch = true;
    } else {
      if (!b.laeufe.some((l) => l.text.trim())) continue;
      inhalt.push({ text: laeufe(b.laeufe, schriften), style: 'absatz', leadingIndent: nachUmbruch ? 0 : 17 });
      nachUmbruch = false;
    }
  }
  return inhalt;
}

/** PDF mit eigenen Optionen (Schriften, Titelseite). */
export async function exportierePdfMit(kapitel: Kapitel[], buchtitel: string, optionen: PdfOptionen = {}): Promise<Uint8Array> {
  const pdfMake = await ladePdfMake();
  const schriften = optionen.schriften?.length ? optionen.schriften : null;
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

  const titelseite = (optionen.titelseite ?? true) && buchtitel.trim() !== '';
  const inhalt: Content[] = [];
  if (titelseite) inhalt.push({ text: stuecke(buchtitel.trim(), schriften), style: 'titel' });
  kapitel.forEach((k, i) => inhalt.push(...kapitelInhalt(k, titelseite || i > 0, schriften)));

  const def: TDocumentDefinitions = {
    info: { title: buchtitel, creator: 'Plotwerk', producer: 'Plotwerk' },
    language: localeVon(optionen.sprache ?? 'de'),
    pageSize: 'A4',
    pageMargins: [71, 71, 71, 85],
    content: inhalt.length ? inhalt : [{ text: '' }],
    defaultStyle: { font: schriften?.[0]?.name ?? 'Times', fontSize: 12, lineHeight: 1.5 },
    styles: {
      titel: { fontSize: 28, alignment: 'center', margin: [0, 200, 0, 0], lineHeight: 1.2 },
      kapitel: { fontSize: 18, margin: [0, 56, 0, 24], lineHeight: 1.25 },
      zwischen: { fontSize: 14, margin: [0, 12, 0, 6], lineHeight: 1.25 },
      absatz: { margin: [0, 0, 0, 0] },
      trenner: { alignment: 'center', margin: [0, 12, 0, 12] },
    },
    footer: (seite: number) =>
      titelseite && seite === 1 ? { text: '' } : { text: String(seite), alignment: 'center', fontSize: 10, margin: [0, 34, 0, 0] },
  };
  const puffer = await pdfMake.createPdf(def).getBuffer();
  return new Uint8Array(puffer.buffer, puffer.byteOffset, puffer.byteLength).slice();
}

/** PDF mit den über pdfSchriftenSetzen() festgelegten Schriften (sonst Times). */
export async function exportierePdf(kapitel: Kapitel[], buchtitel: string, sprache: Sprache = 'de'): Promise<Uint8Array> {
  return exportierePdfMit(kapitel, buchtitel, { schriften: registriert ?? undefined, sprache });
}

/** Seitenzahl eines PDF (Zählung der /Type /Page-Objekte). */
export function pdfSeiten(pdf: Uint8Array): number {
  let text = '';
  for (let i = 0; i < pdf.length; i += 8192) text += String.fromCharCode(...pdf.subarray(i, i + 8192));
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}
