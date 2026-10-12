/**
 * Exposé-Vorlage (G7): ein Gerüst aus Leons Plan-Daten zum Weiterschreiben – keine KI.
 *
 * Inhalt: Titel und Angaben, Akte (Quintessenz, Wendepunkt), Figuren (Name + Kurzbeschreibung aus der
 * Planung) und optional eine Kapitelübersicht. Kapitelzusammenfassungen kommen nur hinein, wenn Leon sie
 * freigegeben hat (in „Kapitel“ bearbeitet bzw. bestätigt, entscheidungen.zusammenfassungen); unbearbeitete
 * KI-Zusammenfassungen werden nie übernommen. Alles, was Leon noch schreiben muss, ist ein klar erkennbarer
 * Platzhalter: „[Platzhalter: …]“ in Markdown, gelb hinterlegt in Word.
 * Private Felder (Wahrheit hinter den Kulissen, Notizen) kommen nie hinein.
 */
import { AlignmentType, Document, HeadingLevel, HighlightColor, LineRuleType, Packer, Paragraph, TextRun } from 'docx';
import type { Id, ProjektDaten } from '../model/types';
import { wortzahl } from '../text';
import { normseitenZaehlen } from './normseite';

export type ExposeKapitelQuelle = 'keine' | 'platzhalter' | 'plan' | 'zusammenfassung';

export interface ExposeOptionen {
  /** Kapitelübersicht: keine, nur Platzhalter, aus dem Kapitelplan (Szene + „Was soll hier passieren?“) oder freigegebene Zusammenfassungen */
  kapitel: ExposeKapitelQuelle;
  /** Nebenfiguren aufnehmen (Standard: ja) */
  nebenfiguren?: boolean;
}

/** Ein Textstück: normal, betont oder Platzhalter (von Leon zu schreiben). */
export type ExposeStueck = { text: string; art?: 'fett' | 'kursiv' | 'platzhalter' };

export type ExposeBlock =
  | { art: 'titel'; text: string }
  | { art: 'untertitel'; text: ExposeStueck[] }
  | { art: 'ueberschrift'; ebene: 1 | 2; text: string }
  | { art: 'absatz'; text: ExposeStueck[] }
  | { art: 'punkt'; text: ExposeStueck[] };

const P = (text: string): ExposeStueck => ({ text, art: 'platzhalter' });
const T = (text: string): ExposeStueck => ({ text });
const F = (text: string): ExposeStueck => ({ text, art: 'fett' });

const zahl = (n: number) => n.toLocaleString('de-DE');

/** Eigene, aktuelle oder veraltete Zusammenfassung von Leon (freigegeben); null = keine. */
function freigegebeneZusammenfassung(daten: ProjektDaten, kapitel: Id): string | null {
  const z = daten.entscheidungen.zusammenfassungen.find((x) => x.kapitel === kapitel);
  const text = z?.text.trim() || z?.kurz?.trim();
  return text || null;
}

/** Das Gerüst als Blöcke. */
export function exposeGeruest(daten: ProjektDaten, optionen: ExposeOptionen): ExposeBlock[] {
  const angaben = daten.projekt.angaben ?? {};
  const bloecke: ExposeBlock[] = [];
  const titel = daten.projekt.titel.trim() || 'Ohne Titel';
  bloecke.push({ art: 'titel', text: titel });
  if (angaben.untertitel?.trim()) bloecke.push({ art: 'untertitel', text: [T(angaben.untertitel.trim())] });

  const reihe = daten.projekt.kapitel;
  const kapitel = reihe.map((id) => daten.kapitel[id]).filter((k): k is NonNullable<typeof k> => !!k && wortzahl(k.text) > 0);
  const woerter = kapitel.reduce((s, k) => s + wortzahl(k.text), 0);
  const seiten = normseitenZaehlen(kapitel).seiten;

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Eckdaten' });
  bloecke.push({ art: 'punkt', text: [F('Autor: '), angaben.autor?.trim() ? T(angaben.autor.trim()) : P('Dein Name')] });
  bloecke.push({ art: 'punkt', text: [F('Genre: '), angaben.genre?.trim() ? T(angaben.genre.trim()) : P('Genre, z. B. Gegenwartsroman')] });
  bloecke.push({
    art: 'punkt',
    text: [F('Umfang: '), woerter > 0 ? T(`derzeit ${zahl(woerter)} Wörter, ca. ${zahl(seiten)} Normseiten`) : P('geplanter Umfang')],
  });
  bloecke.push({ art: 'punkt', text: [F('Zielgruppe: '), P('Für wen ist das Buch?')] });
  bloecke.push({ art: 'punkt', text: [F('Vergleichstitel: '), P('zwei bis drei ähnliche Bücher')] });

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Pitch' });
  bloecke.push({ art: 'absatz', text: [P('Worum geht es, in zwei bis drei Sätzen? Wer will was, was steht auf dem Spiel?')] });

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Handlung' });
  if (daten.akte.length === 0) {
    bloecke.push({ art: 'absatz', text: [P('Die Handlung in eigenen Worten – Anfang, Mitte, Ende, einschließlich der Auflösung.')] });
  }
  for (const akt of [...daten.akte].sort((a, b) => a.nummer - b.nummer)) {
    bloecke.push({ art: 'ueberschrift', ebene: 2, text: `Akt ${akt.nummer}${akt.titel.trim() ? ` – ${akt.titel.trim()}` : ''}` });
    bloecke.push({ art: 'punkt', text: [F('Quintessenz: '), akt.quintessenz.trim() ? T(akt.quintessenz.trim()) : P('Quintessenz dieses Akts')] });
    bloecke.push({ art: 'punkt', text: [F('Wendepunkt: '), akt.wendepunkt.trim() ? T(akt.wendepunkt.trim()) : P('Wendepunkt am Ende des Akts')] });
    bloecke.push({ art: 'absatz', text: [P(`Handlung von Akt ${akt.nummer} in eigenen Worten`)] });
  }

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Figuren' });
  const figuren = Object.values(daten.figuren)
    .filter((f) => optionen.nebenfiguren !== false || f.rolle === 'haupt')
    .sort((a, b) => (a.rolle === b.rolle ? a.name.localeCompare(b.name, 'de') : a.rolle === 'haupt' ? -1 : 1));
  if (figuren.length === 0) bloecke.push({ art: 'absatz', text: [P('Die wichtigsten Figuren mit je ein, zwei Sätzen')] });
  for (const f of figuren) {
    bloecke.push({ art: 'punkt', text: [F(f.name), T(' – '), f.kurz?.trim() ? T(f.kurz.trim()) : P('Kurzbeschreibung')] });
  }

  if (optionen.kapitel !== 'keine') {
    bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Kapitelübersicht' });
    reihe.forEach((id, i) => {
      const titelK = daten.kapitel[id]?.titel.trim() || daten.plaene[id]?.titel.trim() || id;
      const kopf: ExposeStueck[] = [F(`${i + 1}. ${titelK}`), T(' – ')];
      if (optionen.kapitel === 'plan') {
        const p = daten.plaene[id];
        const teile = [p?.szene.trim(), p?.notiz.trim()].filter((t): t is string => !!t);
        bloecke.push({ art: 'punkt', text: [...kopf, teile.length ? T(teile.join(' – ').replace(/\s*\n+\s*/g, ' ')) : P('Was passiert in diesem Kapitel?')] });
      } else if (optionen.kapitel === 'zusammenfassung') {
        const z = freigegebeneZusammenfassung(daten, id);
        bloecke.push({ art: 'punkt', text: [...kopf, z ? T(z.replace(/\s*\n+\s*/g, ' ')) : P('Zusammenfassung (noch nicht freigegeben)')] });
      } else {
        bloecke.push({ art: 'punkt', text: [...kopf, P('Was passiert in diesem Kapitel?')] });
      }
    });
  }

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: 'Über mich' });
  bloecke.push({ art: 'absatz', text: [P('Kurzbiografie, bisherige Veröffentlichungen, Bezug zum Stoff')] });
  return bloecke;
}

/** Wie viele Platzhalter das Gerüst enthält (Anzeige im Dialog). */
export function exposePlatzhalter(bloecke: ExposeBlock[]): number {
  let n = 0;
  for (const b of bloecke) if (b.art !== 'titel' && b.art !== 'ueberschrift') n += b.text.filter((s) => s.art === 'platzhalter').length;
  return n;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Markdown-Sonderzeichen maskieren (Text bleibt in Obsidian/CommonMark wörtlich). */
function md(s: string): string {
  return s.replace(/[\\*_`[\]<>#]/g, (c) => `\\${c}`);
}

function stueckeMd(stuecke: ExposeStueck[]): string {
  return stuecke
    .map((s) => {
      if (s.art === 'platzhalter') return `\\[Platzhalter: ${md(s.text)}\\]`;
      if (s.art === 'fett') {
        const t = s.text.trimEnd();
        return t ? `**${md(t)}**${s.text.slice(t.length)}` : s.text;
      }
      if (s.art === 'kursiv') return `*${md(s.text)}*`;
      return md(s.text);
    })
    .join('');
}

export function exposeMarkdown(bloecke: ExposeBlock[]): string {
  const zeilen: string[] = [];
  for (const b of bloecke) {
    switch (b.art) {
      case 'titel':
        zeilen.push(`# ${md(b.text)}`, '');
        break;
      case 'untertitel':
        zeilen.push(`*${stueckeMd(b.text)}*`, '');
        break;
      case 'ueberschrift':
        if (zeilen.length && zeilen[zeilen.length - 1] !== '') zeilen.push('');
        zeilen.push(`${b.ebene === 1 ? '##' : '###'} ${md(b.text)}`, '');
        break;
      case 'absatz':
        if (zeilen.length && zeilen[zeilen.length - 1] !== '') zeilen.push('');
        zeilen.push(stueckeMd(b.text), '');
        break;
      case 'punkt':
        zeilen.push(`- ${stueckeMd(b.text)}`);
        break;
    }
  }
  return `${zeilen.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

// ---------------------------------------------------------------------------
// .docx
// ---------------------------------------------------------------------------

const PT = 2;
const CM = 567;

function runs(stuecke: ExposeStueck[]): TextRun[] {
  return stuecke.map((s) =>
    s.art === 'platzhalter'
      ? new TextRun({ text: `[Platzhalter: ${s.text}]`, highlight: HighlightColor.YELLOW, italics: true })
      : new TextRun({ text: s.text, bold: s.art === 'fett' || undefined, italics: s.art === 'kursiv' || undefined }),
  );
}

export async function exposeDocx(bloecke: ExposeBlock[], optionen: { schrift?: string; autor?: string } = {}): Promise<Uint8Array> {
  const schrift = optionen.schrift?.trim() || 'Newsreader';
  const titel = bloecke.find((b) => b.art === 'titel');
  const kinder: Paragraph[] = bloecke.map((b) => {
    switch (b.art) {
      case 'titel':
        return new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.text)] });
      case 'untertitel':
        return new Paragraph({ style: 'Untertitel', children: runs(b.text) });
      case 'ueberschrift':
        return new Paragraph({ heading: b.ebene === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun(b.text)] });
      case 'absatz':
        return new Paragraph({ children: runs(b.text) });
      case 'punkt':
        return new Paragraph({ bullet: { level: 0 }, children: runs(b.text) });
    }
  });
  const lauf = { font: schrift, color: '000000' };
  const doc = new Document({
    title: `Exposé – ${titel?.art === 'titel' ? titel.text : ''}`,
    creator: optionen.autor?.trim() || 'Plotwerk',
    lastModifiedBy: 'Plotwerk',
    styles: {
      default: {
        document: {
          run: { ...lauf, size: 12 * PT, language: { value: 'de-DE' } },
          paragraph: { spacing: { line: 336, lineRule: LineRuleType.AUTO, before: 0, after: 8 * 20 } },
        },
        title: { run: { ...lauf, size: 26 * PT }, paragraph: { spacing: { before: 0, after: 4 * 20 } } },
        heading1: { run: { ...lauf, size: 16 * PT, bold: true }, paragraph: { spacing: { before: 18 * 20, after: 6 * 20 }, keepNext: true } },
        heading2: { run: { ...lauf, size: 13 * PT, bold: true }, paragraph: { spacing: { before: 12 * 20, after: 4 * 20 }, keepNext: true } },
      },
      paragraphStyles: [
        {
          id: 'Untertitel',
          name: 'Untertitel',
          basedOn: 'Normal',
          next: 'Normal',
          run: { italics: true, size: 14 * PT },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { after: 12 * 20 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: Math.round(2.5 * CM), bottom: Math.round(2.5 * CM), left: Math.round(2.5 * CM), right: Math.round(2.5 * CM) },
          },
        },
        children: kinder,
      },
    ],
  });
  return Packer.pack(doc, 'uint8array');
}
