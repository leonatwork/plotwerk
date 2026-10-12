/**
 * Normseiten-Manuskript (G7): 30 Zeilen à 60 Anschläge je Seite, nichtproportionale Schrift (Courier New 12 pt),
 * Kopfzeile mit Autor, Titel und Seitenzahl. Jedes Kapitel beginnt auf einer neuen Seite.
 *
 * Zählung und Datei folgen demselben Zeilenmodell: Kapiteltitel (eine Zeile, umbrochen), eine Leerzeile,
 * dann die Absätze ohne Leerzeilen dazwischen; Szenentrenner „* * *“ = eine Zeile, Zwischenüberschriften wie
 * Absätze. Umbrochen wird wie in Word an Leerzeichen (und nach Bindestrichen), Wörter über 60 Zeichen werden
 * hart getrennt. Ein Leerzeichen am Zeilenende zählt nicht (Word lässt es über den Rand hängen).
 */
import {
  AlignmentType,
  Document,
  Header,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import { leseMarkdown, SZENENTRENNER, type Lauf } from '../docx/markdown';
import { buchSprache, fmt, localeVon, texteJe, type Sprache } from '../i18n';
import type { Kapitel, ProjektAngaben } from '../model/types';
import { woerterZaehlen } from '../text';

export const NORMSEITE = { zeilen: 30, anschlaege: 60 } as const;

/**
 * Beschriftungen in der Buchsprache. Das Format bleibt die deutsche Normseite (30 × 60); das englische
 * „standard manuscript format“ (doppelter Zeilenabstand, Wortzahl gerundet) wäre ein eigenes Format.
 */
const T = texteJe(
  {
    ohneTitel: 'Ohne Titel',
    seite: 'Seite ',
    von: 'von {autor}',
    umfang: 'ca. {seiten} Normseiten · {woerter} Wörter',
    beschreibung: 'Normseiten-Manuskript ({zeilen} Zeilen à {anschlaege} Anschläge)',
  },
  {
    ohneTitel: 'Untitled',
    seite: 'Page ',
    von: 'by {autor}',
    umfang: 'approx. {seiten} standard pages · {woerter} words',
    beschreibung: 'Standard manuscript ({zeilen} lines of {anschlaege} characters)',
  },
);

// ---------------------------------------------------------------------------
// Zeilenmodell
// ---------------------------------------------------------------------------

export type NormBlock =
  | { art: 'titel'; text: string }
  | { art: 'leer' }
  | { art: 'absatz'; laeufe: Lauf[] }
  | { art: 'zwischentitel'; laeufe: Lauf[] }
  | { art: 'trenner' };

const zeichen = (s: string) => [...s.normalize('NFC')].length;

/** Text für die Normseite: Tabulatoren als Leerzeichen, Leerraum am Rand entfernt (harte Umbrüche bleiben). */
function laeufeBereinigen(laeufe: Lauf[]): Lauf[] {
  const kopie = laeufe.map((l) => ({ ...l, text: l.text.replace(/\t/g, ' ') })).filter((l) => l.text !== '');
  while (kopie.length && kopie[0]!.text.trimStart() === '') kopie.shift();
  while (kopie.length && kopie[kopie.length - 1]!.text.trimEnd() === '') kopie.pop();
  if (kopie.length) {
    kopie[0]!.text = kopie[0]!.text.trimStart();
    kopie[kopie.length - 1]!.text = kopie[kopie.length - 1]!.text.trimEnd();
  }
  return kopie;
}

/** Ein Kapitel als Normseiten-Blöcke (Leerblöcke entfallen, doppelte Trenner und Trenner am Rand auch). */
export function normBloecke(k: Pick<Kapitel, 'titel' | 'text'>, sprache: Sprache = 'de'): NormBlock[] {
  const ergebnis: NormBlock[] = [{ art: 'titel', text: k.titel.replace(/\s+/g, ' ').trim() || T(sprache).ohneTitel }, { art: 'leer' }];
  for (const b of leseMarkdown(k.text)) {
    const vorher = ergebnis[ergebnis.length - 1]!;
    if (b.art === 'trenner') {
      if (vorher.art === 'absatz' || vorher.art === 'zwischentitel') ergebnis.push({ art: 'trenner' });
      continue;
    }
    const laeufe = laeufeBereinigen(b.laeufe);
    if (!laeufe.some((l) => l.text.trim())) continue;
    ergebnis.push(b.art === 'ueberschrift' ? { art: 'zwischentitel', laeufe } : { art: 'absatz', laeufe });
  }
  while (ergebnis[ergebnis.length - 1]!.art === 'trenner') ergebnis.pop();
  return ergebnis;
}

/**
 * Anzahl Zeilen eines Absatzes bei `breite` Anschlägen je Zeile (Word-artiger Umbruch).
 * Leerer Text = eine Zeile.
 */
export function zeilenZaehlen(text: string, breite: number = NORMSEITE.anschlaege): number {
  let zeilen = 0;
  for (const hart of text.normalize('NFC').split('\n')) {
    // Wörter samt Umbruchgelegenheit nach Bindestrichen
    const woerter = hart.split(/ +/).flatMap((w) => w.split(/(?<=[-‐–—](?=\p{L}))/u)).filter((w) => w !== '');
    if (woerter.length === 0) {
      zeilen++;
      continue;
    }
    let laenge = 0;
    let n = 1;
    let vorherBindestrich = false;
    for (const w of woerter) {
      let rest = zeichen(w);
      const abstand = laenge === 0 || vorherBindestrich ? 0 : 1;
      if (laenge + abstand + rest <= breite) {
        laenge += abstand + rest;
      } else {
        if (laenge > 0) n++;
        // Wort länger als eine Zeile: hart trennen
        while (rest > breite) {
          rest -= breite;
          n++;
        }
        laenge = rest;
      }
      vorherBindestrich = /[-‐–—]$/.test(w);
    }
    zeilen += n;
  }
  return zeilen;
}

const blockText = (b: NormBlock): string =>
  b.art === 'titel' ? b.text : b.art === 'leer' ? '' : b.art === 'trenner' ? SZENENTRENNER : b.laeufe.map((l) => l.text).join('');

export interface NormKapitelZahl {
  id: string;
  titel: string;
  zeilen: number;
  /** Seiten dieses Kapitels (beginnt auf neuer Seite) */
  seiten: number;
  woerter: number;
  anschlaege: number;
}

export interface Normseitenzahl {
  /** Seiten des Manuskripts ohne Titelseite */
  seiten: number;
  zeilen: number;
  woerter: number;
  /** Anschläge inkl. Leerzeichen */
  anschlaege: number;
  /** Faustregel 1.500 Anschläge je Normseite (zum Vergleich) */
  seitenNachAnschlaegen: number;
  kapitel: NormKapitelZahl[];
}

/** Zählt Normseiten für die Kapitel in Reihenfolge (jedes Kapitel auf neuer Seite). */
export function normseitenZaehlen(kapitel: Kapitel[], sprache: Sprache = 'de'): Normseitenzahl {
  const liste: NormKapitelZahl[] = kapitel.map((k) => {
    const bloecke = normBloecke(k, sprache);
    let zeilen = 0;
    let anschlaege = 0;
    for (const b of bloecke) {
      const t = blockText(b);
      zeilen += zeilenZaehlen(t);
      if (b.art === 'absatz' || b.art === 'zwischentitel' || b.art === 'trenner') anschlaege += zeichen(t);
    }
    return {
      id: k.id,
      titel: k.titel,
      zeilen,
      seiten: Math.max(1, Math.ceil(zeilen / NORMSEITE.zeilen)),
      woerter: woerterZaehlen(bloecke.filter((b) => b.art === 'absatz' || b.art === 'zwischentitel').map(blockText).join('\n')),
      anschlaege,
    };
  });
  const anschlaege = liste.reduce((s, k) => s + k.anschlaege, 0);
  return {
    seiten: liste.reduce((s, k) => s + k.seiten, 0),
    zeilen: liste.reduce((s, k) => s + k.zeilen, 0),
    woerter: liste.reduce((s, k) => s + k.woerter, 0),
    anschlaege,
    seitenNachAnschlaegen: Math.ceil(anschlaege / 1500),
    kapitel: liste,
  };
}

// ---------------------------------------------------------------------------
// .docx
// ---------------------------------------------------------------------------

export interface NormseitenOptionen {
  angaben?: ProjektAngaben;
  /** Titelseite mit Titel, Autor und Umfang (Standard: ja) */
  titelseite?: boolean;
  /** Schrift (Standard: Courier New) */
  schrift?: string;
}

const PT = 2; // Halbpunkte
const CM = 567; // Twips
/** Zeilenhöhe genau 24 pt → 30 Zeilen = 720 pt Satzspiegel */
const ZEILE = 480;
/** Courier 12 pt: 7,2 pt je Zeichen → 60 Zeichen = 432 pt = 8.640 Twips (+ Luft gegen Rundung) */
const SATZBREITE = 8650;
const SEITE = { breite: 11906, hoehe: 16838 };
const RAND_LINKS = Math.round(3.5 * CM);
const RAND_OBEN = Math.round(2.5 * CM);
const RAND_UNTEN = SEITE.hoehe - RAND_OBEN - NORMSEITE.zeilen * ZEILE - 10;

function runs(laeufe: Lauf[]): TextRun[] {
  const ergebnis: TextRun[] = [];
  for (const l of laeufe) {
    l.text.split('\n').forEach((zeile, i) => {
      ergebnis.push(new TextRun({ text: zeile, bold: l.fett || undefined, italics: l.kursiv || undefined, break: i > 0 ? 1 : undefined }));
    });
  }
  return ergebnis;
}

const absatz = (opt: ConstructorParameters<typeof Paragraph>[0] & object) => new Paragraph({ widowControl: false, ...opt });

/** Kopfzeile: „Autor · Titel“ links, „Seite n“ rechts. */
function kopfzeile(autor: string, titel: string, sprache: Sprache): Header {
  const links = [autor.trim(), titel.trim()].filter(Boolean).join(' · ');
  return new Header({
    children: [
      absatz({
        tabStops: [{ type: TabStopType.RIGHT, position: SATZBREITE - 10 }],
        children: [new TextRun({ text: links }), new TextRun({ children: ['\t', T(sprache).seite, PageNumber.CURRENT] })],
      }),
    ],
  });
}

/** Normseiten-Manuskript als .docx (Kapitel in Reihenfolge); Beschriftungen in der Buchsprache (angaben.sprache). */
export async function exportiereNormseite(kapitel: Kapitel[], buchtitel: string, optionen: NormseitenOptionen = {}): Promise<Uint8Array> {
  const schrift = optionen.schrift?.trim() || 'Courier New';
  const angaben = optionen.angaben ?? {};
  const sprache = buchSprache(angaben);
  const t = T(sprache);
  const zahl = (n: number) => n.toLocaleString(localeVon(sprache));
  const autor = angaben.autor?.trim() ?? '';
  const titel = buchtitel.trim();
  const titelseite = optionen.titelseite ?? true;
  const zahlen = normseitenZaehlen(kapitel, sprache);

  const kinder: Paragraph[] = [];
  if (titelseite) {
    const leer = () => absatz({ children: [] });
    for (let i = 0; i < 9; i++) kinder.push(leer());
    kinder.push(absatz({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: titel || t.ohneTitel, bold: true })] }));
    if (angaben.untertitel?.trim()) kinder.push(absatz({ alignment: AlignmentType.CENTER, children: [new TextRun(angaben.untertitel.trim())] }));
    if (angaben.genre?.trim()) kinder.push(absatz({ alignment: AlignmentType.CENTER, children: [new TextRun(angaben.genre.trim())] }));
    kinder.push(leer());
    if (autor) kinder.push(absatz({ alignment: AlignmentType.CENTER, children: [new TextRun(fmt(t.von, { autor }))] }));
    kinder.push(leer(), leer());
    kinder.push(
      absatz({
        alignment: AlignmentType.CENTER,
        children: [new TextRun(fmt(t.umfang, { seiten: zahl(zahlen.seiten), woerter: zahl(zahlen.woerter) }))],
      }),
    );
  }

  kapitel.forEach((k, i) => {
    const neueSeite = titelseite || i > 0;
    normBloecke(k, sprache).forEach((b, j) => {
      const umbruch = neueSeite && j === 0;
      switch (b.art) {
        case 'titel':
          kinder.push(absatz({ pageBreakBefore: umbruch, children: [new TextRun({ text: b.text, bold: true })] }));
          break;
        case 'leer':
          kinder.push(absatz({ children: [] }));
          break;
        case 'trenner':
          kinder.push(absatz({ alignment: AlignmentType.CENTER, children: [new TextRun(SZENENTRENNER)] }));
          break;
        case 'zwischentitel':
          kinder.push(absatz({ children: runs(b.laeufe.map((l) => ({ ...l, fett: true }))) }));
          break;
        case 'absatz':
          kinder.push(absatz({ children: runs(b.laeufe) }));
          break;
      }
    });
  });
  if (kinder.length === 0) kinder.push(absatz({ children: [] }));

  const doc = new Document({
    title: titel,
    creator: autor || 'Plotwerk',
    lastModifiedBy: 'Plotwerk',
    description: fmt(t.beschreibung, { zeilen: NORMSEITE.zeilen, anschlaege: NORMSEITE.anschlaege }),
    styles: {
      default: {
        document: {
          run: { font: schrift, size: 12 * PT, color: '000000', language: { value: localeVon(sprache) } },
          paragraph: { spacing: { line: ZEILE, lineRule: LineRuleType.EXACT, before: 0, after: 0 }, indent: { firstLine: 0 } },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: titelseite,
          page: {
            size: { width: SEITE.breite, height: SEITE.hoehe },
            margin: {
              top: RAND_OBEN,
              bottom: RAND_UNTEN,
              left: RAND_LINKS,
              right: SEITE.breite - RAND_LINKS - SATZBREITE,
              header: Math.round(1.2 * CM),
              footer: Math.round(1 * CM),
            },
            pageNumbers: titelseite ? { start: 0 } : undefined,
          },
        },
        headers: {
          default: kopfzeile(autor, titel, sprache),
          ...(titelseite ? { first: new Header({ children: [absatz({ children: [] })] }) } : {}),
        },
        children: kinder,
      },
    ],
  });
  return Packer.pack(doc, 'uint8array');
}
