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
import { buchSprache, fmt, localeVon, texteJe, type Sprache } from '../i18n';
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

/** Texte des Gerüsts in der Buchsprache (angaben.sprache). */
const TEXTE = texteJe(
  {
    ohneTitel: 'Ohne Titel',
    eckdaten: 'Eckdaten',
    autor: 'Autor: ',
    deinName: 'Dein Name',
    genre: 'Genre: ',
    genreBeispiel: 'Genre, z. B. Gegenwartsroman',
    umfang: 'Umfang: ',
    umfangWert: 'derzeit {woerter} Wörter, ca. {seiten} Normseiten',
    umfangGeplant: 'geplanter Umfang',
    zielgruppe: 'Zielgruppe: ',
    zielgruppeFrage: 'Für wen ist das Buch?',
    vergleich: 'Vergleichstitel: ',
    vergleichBeispiel: 'zwei bis drei ähnliche Bücher',
    pitch: 'Pitch',
    pitchFrage: 'Worum geht es, in zwei bis drei Sätzen? Wer will was, was steht auf dem Spiel?',
    handlung: 'Handlung',
    handlungGanz: 'Die Handlung in eigenen Worten – Anfang, Mitte, Ende, einschließlich der Auflösung.',
    akt: 'Akt {n}',
    quintessenz: 'Quintessenz: ',
    quintessenzFrage: 'Quintessenz dieses Akts',
    wendepunkt: 'Wendepunkt: ',
    wendepunktFrage: 'Wendepunkt am Ende des Akts',
    handlungAkt: 'Handlung von Akt {n} in eigenen Worten',
    figuren: 'Figuren',
    figurenFrage: 'Die wichtigsten Figuren mit je ein, zwei Sätzen',
    kurzbeschreibung: 'Kurzbeschreibung',
    kapiteluebersicht: 'Kapitelübersicht',
    kapitelFrage: 'Was passiert in diesem Kapitel?',
    nichtFreigegeben: 'Zusammenfassung (noch nicht freigegeben)',
    ueberMich: 'Über mich',
    ueberMichFrage: 'Kurzbiografie, bisherige Veröffentlichungen, Bezug zum Stoff',
    platzhalter: 'Platzhalter',
    dokumentTitel: 'Exposé – {titel}',
    untertitelStil: 'Untertitel',
  },
  {
    ohneTitel: 'Untitled',
    eckdaten: 'Key facts',
    autor: 'Author: ',
    deinName: 'Your name',
    genre: 'Genre: ',
    genreBeispiel: 'Genre, e.g. contemporary fiction',
    umfang: 'Length: ',
    umfangWert: 'currently {woerter} words, approx. {seiten} standard pages',
    umfangGeplant: 'planned length',
    zielgruppe: 'Target audience: ',
    zielgruppeFrage: 'Who is the book for?',
    vergleich: 'Comparable titles: ',
    vergleichBeispiel: 'two or three similar books',
    pitch: 'Pitch',
    pitchFrage: 'What is it about, in two or three sentences? Who wants what, and what is at stake?',
    handlung: 'Plot',
    handlungGanz: 'The plot in your own words – beginning, middle and end, including the resolution.',
    akt: 'Act {n}',
    quintessenz: 'Essence: ',
    quintessenzFrage: 'Essence of this act',
    wendepunkt: 'Turning point: ',
    wendepunktFrage: 'Turning point at the end of the act',
    handlungAkt: 'Plot of act {n} in your own words',
    figuren: 'Characters',
    figurenFrage: 'The main characters, one or two sentences each',
    kurzbeschreibung: 'Short description',
    kapiteluebersicht: 'Chapter overview',
    kapitelFrage: 'What happens in this chapter?',
    nichtFreigegeben: 'Summary (not yet approved)',
    ueberMich: 'About me',
    ueberMichFrage: 'Short bio, previous publications, connection to the material',
    platzhalter: 'Placeholder',
    dokumentTitel: 'Synopsis – {titel}',
    untertitelStil: 'Subtitle',
  },
);

/** Eigene, aktuelle oder veraltete Zusammenfassung von Leon (freigegeben); null = keine. */
function freigegebeneZusammenfassung(daten: ProjektDaten, kapitel: Id): string | null {
  const z = daten.entscheidungen.zusammenfassungen.find((x) => x.kapitel === kapitel);
  const text = z?.text.trim() || z?.kurz?.trim();
  return text || null;
}

/** Das Gerüst als Blöcke, beschriftet in der Buchsprache (projekt.angaben.sprache). */
export function exposeGeruest(daten: ProjektDaten, optionen: ExposeOptionen): ExposeBlock[] {
  const angaben = daten.projekt.angaben ?? {};
  const sprache = buchSprache(angaben);
  const t = TEXTE(sprache);
  const zahl = (n: number) => n.toLocaleString(localeVon(sprache));
  const bloecke: ExposeBlock[] = [];
  const titel = daten.projekt.titel.trim() || t.ohneTitel;
  bloecke.push({ art: 'titel', text: titel });
  if (angaben.untertitel?.trim()) bloecke.push({ art: 'untertitel', text: [T(angaben.untertitel.trim())] });

  const reihe = daten.projekt.kapitel;
  const kapitel = reihe.map((id) => daten.kapitel[id]).filter((k): k is NonNullable<typeof k> => !!k && wortzahl(k.text) > 0);
  const woerter = kapitel.reduce((s, k) => s + wortzahl(k.text), 0);
  const seiten = normseitenZaehlen(kapitel, sprache).seiten;

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.eckdaten });
  bloecke.push({ art: 'punkt', text: [F(t.autor), angaben.autor?.trim() ? T(angaben.autor.trim()) : P(t.deinName)] });
  bloecke.push({ art: 'punkt', text: [F(t.genre), angaben.genre?.trim() ? T(angaben.genre.trim()) : P(t.genreBeispiel)] });
  bloecke.push({
    art: 'punkt',
    text: [F(t.umfang), woerter > 0 ? T(fmt(t.umfangWert, { woerter: zahl(woerter), seiten: zahl(seiten) })) : P(t.umfangGeplant)],
  });
  bloecke.push({ art: 'punkt', text: [F(t.zielgruppe), P(t.zielgruppeFrage)] });
  bloecke.push({ art: 'punkt', text: [F(t.vergleich), P(t.vergleichBeispiel)] });

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.pitch });
  bloecke.push({ art: 'absatz', text: [P(t.pitchFrage)] });

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.handlung });
  if (daten.akte.length === 0) {
    bloecke.push({ art: 'absatz', text: [P(t.handlungGanz)] });
  }
  for (const akt of [...daten.akte].sort((a, b) => a.nummer - b.nummer)) {
    bloecke.push({ art: 'ueberschrift', ebene: 2, text: `${fmt(t.akt, { n: akt.nummer })}${akt.titel.trim() ? ` – ${akt.titel.trim()}` : ''}` });
    bloecke.push({ art: 'punkt', text: [F(t.quintessenz), akt.quintessenz.trim() ? T(akt.quintessenz.trim()) : P(t.quintessenzFrage)] });
    bloecke.push({ art: 'punkt', text: [F(t.wendepunkt), akt.wendepunkt.trim() ? T(akt.wendepunkt.trim()) : P(t.wendepunktFrage)] });
    bloecke.push({ art: 'absatz', text: [P(fmt(t.handlungAkt, { n: akt.nummer }))] });
  }

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.figuren });
  const figuren = Object.values(daten.figuren)
    .filter((f) => optionen.nebenfiguren !== false || f.rolle === 'haupt')
    .sort((a, b) => (a.rolle === b.rolle ? a.name.localeCompare(b.name, sprache) : a.rolle === 'haupt' ? -1 : 1));
  if (figuren.length === 0) bloecke.push({ art: 'absatz', text: [P(t.figurenFrage)] });
  for (const f of figuren) {
    bloecke.push({ art: 'punkt', text: [F(f.name), T(' – '), f.kurz?.trim() ? T(f.kurz.trim()) : P(t.kurzbeschreibung)] });
  }

  if (optionen.kapitel !== 'keine') {
    bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.kapiteluebersicht });
    reihe.forEach((id, i) => {
      const titelK = daten.kapitel[id]?.titel.trim() || daten.plaene[id]?.titel.trim() || id;
      const kopf: ExposeStueck[] = [F(`${i + 1}. ${titelK}`), T(' – ')];
      if (optionen.kapitel === 'plan') {
        const p = daten.plaene[id];
        const teile = [p?.szene.trim(), p?.notiz.trim()].filter((t): t is string => !!t);
        bloecke.push({ art: 'punkt', text: [...kopf, teile.length ? T(teile.join(' – ').replace(/\s*\n+\s*/g, ' ')) : P(t.kapitelFrage)] });
      } else if (optionen.kapitel === 'zusammenfassung') {
        const z = freigegebeneZusammenfassung(daten, id);
        bloecke.push({ art: 'punkt', text: [...kopf, z ? T(z.replace(/\s*\n+\s*/g, ' ')) : P(t.nichtFreigegeben)] });
      } else {
        bloecke.push({ art: 'punkt', text: [...kopf, P(t.kapitelFrage)] });
      }
    });
  }

  bloecke.push({ art: 'ueberschrift', ebene: 1, text: t.ueberMich });
  bloecke.push({ art: 'absatz', text: [P(t.ueberMichFrage)] });
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

function stueckeMd(stuecke: ExposeStueck[], sprache: Sprache): string {
  return stuecke
    .map((s) => {
      if (s.art === 'platzhalter') return `\\[${TEXTE(sprache).platzhalter}: ${md(s.text)}\\]`;
      if (s.art === 'fett') {
        const t = s.text.trimEnd();
        return t ? `**${md(t)}**${s.text.slice(t.length)}` : s.text;
      }
      if (s.art === 'kursiv') return `*${md(s.text)}*`;
      return md(s.text);
    })
    .join('');
}

/** Markdown des Gerüsts; `sprache` (Buchsprache) für die Kennzeichnung „[Platzhalter: …]“. */
export function exposeMarkdown(bloecke: ExposeBlock[], sprache: Sprache = 'de'): string {
  const zeilen: string[] = [];
  for (const b of bloecke) {
    switch (b.art) {
      case 'titel':
        zeilen.push(`# ${md(b.text)}`, '');
        break;
      case 'untertitel':
        zeilen.push(`*${stueckeMd(b.text, sprache)}*`, '');
        break;
      case 'ueberschrift':
        if (zeilen.length && zeilen[zeilen.length - 1] !== '') zeilen.push('');
        zeilen.push(`${b.ebene === 1 ? '##' : '###'} ${md(b.text)}`, '');
        break;
      case 'absatz':
        if (zeilen.length && zeilen[zeilen.length - 1] !== '') zeilen.push('');
        zeilen.push(stueckeMd(b.text, sprache), '');
        break;
      case 'punkt':
        zeilen.push(`- ${stueckeMd(b.text, sprache)}`);
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

function runs(stuecke: ExposeStueck[], sprache: Sprache): TextRun[] {
  return stuecke.map((s) =>
    s.art === 'platzhalter'
      ? new TextRun({ text: `[${TEXTE(sprache).platzhalter}: ${s.text}]`, highlight: HighlightColor.YELLOW, italics: true })
      : new TextRun({ text: s.text, bold: s.art === 'fett' || undefined, italics: s.art === 'kursiv' || undefined }),
  );
}

/** Exposé als .docx; `sprache` = Buchsprache (Platzhalter-Kennzeichnung, Dokumenttitel, Sprachkennung). */
export async function exposeDocx(bloecke: ExposeBlock[], optionen: { schrift?: string; autor?: string; sprache?: Sprache } = {}): Promise<Uint8Array> {
  const sprache = optionen.sprache ?? 'de';
  const t = TEXTE(sprache);
  const schrift = optionen.schrift?.trim() || 'Newsreader';
  const titel = bloecke.find((b) => b.art === 'titel');
  const kinder: Paragraph[] = bloecke.map((b) => {
    switch (b.art) {
      case 'titel':
        return new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.text)] });
      case 'untertitel':
        return new Paragraph({ style: 'Untertitel', children: runs(b.text, sprache) });
      case 'ueberschrift':
        return new Paragraph({ heading: b.ebene === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun(b.text)] });
      case 'absatz':
        return new Paragraph({ children: runs(b.text, sprache) });
      case 'punkt':
        return new Paragraph({ bullet: { level: 0 }, children: runs(b.text, sprache) });
    }
  });
  const lauf = { font: schrift, color: '000000' };
  const doc = new Document({
    title: fmt(t.dokumentTitel, { titel: titel?.art === 'titel' ? titel.text : '' }),
    creator: optionen.autor?.trim() || 'Plotwerk',
    lastModifiedBy: 'Plotwerk',
    styles: {
      default: {
        document: {
          run: { ...lauf, size: 12 * PT, language: { value: localeVon(sprache) } },
          paragraph: { spacing: { line: 336, lineRule: LineRuleType.AUTO, before: 0, after: 8 * 20 } },
        },
        title: { run: { ...lauf, size: 26 * PT }, paragraph: { spacing: { before: 0, after: 4 * 20 } } },
        heading1: { run: { ...lauf, size: 16 * PT, bold: true }, paragraph: { spacing: { before: 18 * 20, after: 6 * 20 }, keepNext: true } },
        heading2: { run: { ...lauf, size: 13 * PT, bold: true }, paragraph: { spacing: { before: 12 * 20, after: 4 * 20 }, keepNext: true } },
      },
      paragraphStyles: [
        {
          id: 'Untertitel',
          name: t.untertitelStil,
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
