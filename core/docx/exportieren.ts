/**
 * Export .docx (S-12): Kapitel als Überschrift 1 (neue Seite), Absätze mit fett/kursiv, Szenentrenner zentriert.
 * Anmerkungen und Markierungen liegen nicht im Kapiteltext und kommen daher nie in die Datei.
 */
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  TextRun,
} from 'docx';
import { texteJe, type Sprache } from '../i18n';
import type { Kapitel } from '../model/types';
import { leseMarkdown, SZENENTRENNER, type Lauf } from './markdown';

export interface DocxOptionen {
  /** Schriftname im Dokument (Standard: Newsreader; fehlt sie auf dem Rechner, ersetzt Word sie durch eine Serifenschrift) */
  schrift?: string;
  /** Titelseite mit dem Buchtitel (Standard: ja, wenn ein Titel vorhanden ist) */
  titelseite?: boolean;
  /** Buchsprache (Sprachkennung für die Rechtschreibprüfung in Word, Namen der Formatvorlagen); Standard Deutsch */
  sprache?: Sprache;
}

/** Namen der eigenen Formatvorlagen (die IDs bleiben gleich) und Sprachkennung des Dokuments. */
const STIL_NAMEN = texteJe(
  { ersterAbsatz: 'Erster Absatz', szenentrenner: 'Szenentrenner', sprache: 'de-DE' },
  { ersterAbsatz: 'First Paragraph', szenentrenner: 'Scene Break', sprache: 'en-US' },
);

export const DOCX_SCHRIFTEN = ['Newsreader', 'Times New Roman', 'Georgia'] as const;

const PT = 2; // Halbpunkte je Punkt
const CM = 567; // Twips je Zentimeter

const UEBERSCHRIFTEN = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function laufZuRuns(l: Lauf): TextRun[] {
  const runs: TextRun[] = [];
  l.text.split('\n').forEach((zeile, i) => {
    const teile = zeile.split('\t');
    const children: (string | Tab)[] = [];
    teile.forEach((t, j) => {
      if (j > 0) children.push(new Tab());
      if (t) children.push(t);
    });
    runs.push(new TextRun({ children, bold: l.fett || undefined, italics: l.kursiv || undefined, break: i > 0 ? 1 : undefined }));
  });
  return runs;
}

function kapitelAbsaetze(k: Kapitel, ersteSeite: boolean): Paragraph[] {
  const absaetze: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !ersteSeite, children: [new TextRun(k.titel)] }),
  ];
  let nachUmbruch = true;
  for (const b of leseMarkdown(k.text)) {
    if (b.art === 'trenner') {
      absaetze.push(new Paragraph({ style: 'Szenentrenner', children: [new TextRun(SZENENTRENNER)] }));
      nachUmbruch = true;
    } else if (b.art === 'ueberschrift') {
      const text = b.laeufe.map((l) => l.text).join('').replace(/\n/g, ' ');
      // „#“ im Kapiteltext darf kein neues Kapitel werden: # und ## → Überschrift 2, ### → 3 …
      absaetze.push(new Paragraph({ heading: UEBERSCHRIFTEN[Math.min(5, Math.max(1, b.ebene - 1))], children: [new TextRun(text)] }));
      nachUmbruch = true;
    } else {
      if (!b.laeufe.some((l) => l.text.trim())) continue;
      absaetze.push(new Paragraph({ style: nachUmbruch ? 'ErsterAbsatz' : undefined, children: b.laeufe.flatMap(laufZuRuns) }));
      nachUmbruch = false;
    }
  }
  return absaetze;
}

/** Erzeugt die .docx-Datei; `kapitel` in Buchreihenfolge. */
export async function exportiereDocxMit(kapitel: Kapitel[], buchtitel: string, optionen: DocxOptionen = {}): Promise<Uint8Array> {
  const schrift = optionen.schrift?.trim() || 'Newsreader';
  const namen = STIL_NAMEN(optionen.sprache);
  const titelseite = (optionen.titelseite ?? true) && buchtitel.trim() !== '';
  const kinder: Paragraph[] = [];
  if (titelseite) kinder.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(buchtitel.trim())] }));
  kapitel.forEach((k, i) => kinder.push(...kapitelAbsaetze(k, !titelseite && i === 0)));
  if (kinder.length === 0) kinder.push(new Paragraph({ children: [] }));

  const zeilen = { line: 360, lineRule: LineRuleType.AUTO };
  const lauf = { font: schrift, color: '000000' };
  const doc = new Document({
    title: buchtitel,
    creator: 'Plotwerk',
    lastModifiedBy: 'Plotwerk',
    styles: {
      default: {
        document: {
          run: { ...lauf, size: 12 * PT, language: { value: namen.sprache } },
          paragraph: { spacing: { ...zeilen, before: 0, after: 0 }, indent: { firstLine: Math.round(0.6 * CM) } },
        },
        title: {
          run: { ...lauf, size: 28 * PT, bold: false },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 6 * CM, after: 0 }, indent: { firstLine: 0 } },
        },
        heading1: {
          run: { ...lauf, size: 18 * PT, bold: false, italics: false },
          paragraph: { spacing: { before: 2 * CM, after: 24 * 20, ...zeilen }, indent: { firstLine: 0 }, keepNext: true, outlineLevel: 0 },
        },
        heading2: {
          run: { ...lauf, size: 14 * PT, bold: false, italics: false },
          paragraph: { spacing: { before: 18 * 20, after: 12 * 20, ...zeilen }, indent: { firstLine: 0 }, keepNext: true, outlineLevel: 1 },
        },
        heading3: {
          run: { ...lauf, size: 12 * PT, bold: true, italics: false },
          paragraph: { spacing: { before: 12 * 20, after: 6 * 20, ...zeilen }, indent: { firstLine: 0 }, keepNext: true, outlineLevel: 2 },
        },
      },
      paragraphStyles: [
        {
          id: 'ErsterAbsatz',
          name: namen.ersterAbsatz,
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          paragraph: { indent: { firstLine: 0 } },
        },
        {
          id: 'Szenentrenner',
          name: namen.szenentrenner,
          basedOn: 'Normal',
          next: 'ErsterAbsatz',
          quickFormat: true,
          paragraph: { alignment: AlignmentType.CENTER, indent: { firstLine: 0 }, spacing: { before: 12 * 20, after: 12 * 20 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: titelseite,
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: Math.round(2.5 * CM), bottom: Math.round(2.5 * CM), left: Math.round(2.5 * CM), right: Math.round(2.5 * CM) },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                indent: { firstLine: 0 },
                children: [new TextRun({ children: [PageNumber.CURRENT], size: 10 * PT })],
              }),
            ],
          }),
          ...(titelseite ? { first: new Footer({ children: [new Paragraph({ children: [] })] }) } : {}),
        },
        children: kinder,
      },
    ],
  });
  return Packer.pack(doc, 'uint8array');
}
