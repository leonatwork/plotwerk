/**
 * Eingabe und Generator für fixtures/test-manuskript.docx (Platzhaltertext, kein Romantext).
 * Neu erzeugen: node core/docx/testdaten/erzeugen.mjs
 *
 * Testfälle: 10 Kapitel (Überschrift 1) nach einem Titel-Absatz, fett/kursiv (auch verschachtelt und
 * mitten im Wort), harter Umbruch, Szenentrenner, Überschrift 2, Markdown-Sonderzeichen am Absatzanfang,
 * „“‚‘’–…»«, Tabulator am Absatzanfang (entfällt beim Import), leeres Kap. 4, Satzabbruch am Ende von
 * Kap. 9 und eine leere Überschrift 1 am Schluss.
 */
import { Document, HeadingLevel, Packer, Paragraph, Tab, TextRun } from 'docx';

export interface TestLauf {
  /** "\n" = harter Zeilenumbruch, "\t" = Tabulator */
  text: string;
  fett?: boolean;
  kursiv?: boolean;
}

export type TestAbsatz = { art: 'absatz'; laeufe: TestLauf[] } | { art: 'trenner' } | { art: 'ueberschrift2'; text: string } | { art: 'leer' };

export interface TestKapitel {
  titel: string;
  absaetze: TestAbsatz[];
}

const a = (...laeufe: (TestLauf | string)[]): TestAbsatz => ({
  art: 'absatz',
  laeufe: laeufe.map((l) => (typeof l === 'string' ? { text: l } : l)),
});
const f = (text: string): TestLauf => ({ text, fett: true });
const k = (text: string): TestLauf => ({ text, kursiv: true });
const fk = (text: string): TestLauf => ({ text, fett: true, kursiv: true });

export const TEST_BUCHTITEL = 'Hafenlichter';

export const TEST_KAPITEL: TestKapitel[] = [
  {
    titel: 'Grundriss',
    absaetze: [
      a('Der Wecker klingelt um 6:12 Uhr, und ich drücke ihn weg – zweimal.'),
      a('Im Radio läuft ', k('La Mer'), ', und ich summe „La Mer“ mit, obwohl ich den Text nicht kann…'),
      a('Auf der Postkarte am Kühlschrank steht nur ein Wort: ', f('Heute'), '.'),
    ],
  },
  {
    titel: 'Fassade',
    absaetze: [
      a('»Hast du’s gesehen?«, fragt Ole. ‚Nein‘, sage ich, ', fk('wirklich nie'), '.'),
      a('Liebe Grüße\nDein Ole'),
      a(f('Das ist '), fk('sehr'), f(' wichtig'), ', sagt er und tippt auf den Bildschirm.'),
    ],
  },
  {
    titel: 'Lotte',
    absaetze: [
      a('*Sternchen* und _Unterstriche_ sind hier nur Zeichen, keine Formatierung.'),
      a('# Keine Überschrift, nur eine Raute am Anfang.'),
      a('- Ein Bindestrich am Anfang ist kein Listenpunkt.'),
      a('1. Auch das ist keine Liste, sondern ein Satz.'),
      a('[Eckige Klammern], <spitze Klammern>, ein Backslash \\ und &amp; bleiben, wie sie sind.'),
      a('Mehrere   Leerzeichen\tund ein Tabulator bleiben erhalten.'),
    ],
  },
  { titel: 'Regatta', absaetze: [{ art: 'leer' }] },
  {
    titel: 'Staub',
    absaetze: [
      a('Ich sitze im Linden', k('hof'), ' und warte.'),
      { art: 'trenner' },
      a('Später, zu Hause, hänge ich die Jacke über die Heizung.'),
    ],
  },
  {
    titel: 'Das leere Blatt',
    absaetze: [{ art: 'ueberschrift2', text: 'Montag' }, a('Das Blatt liegt auf dem Tisch. Niemand will es sehen.')],
  },
  {
    titel: 'Ebbe',
    absaetze: [
      a('\tDie Laterne geht aus — und ich bleibe stehen...'),
      a('Ein alter Mann neben mir murmelt etwas, das ich nicht verstehe.'),
    ],
  },
  {
    titel: 'Bis bald',
    absaetze: [a('In der Manteltasche steckt eine Postkarte: ', f('„Bis bald“'), ', ohne Namen, ohne Absender.')],
  },
  {
    titel: 'Flut',
    absaetze: [
      a('Ich bin viel zu früh und bestelle einen ', k('Aperol Spritz'), '.'),
      a('Sie lacht, und bevor ich etwas sagen kann, zieht sie mich zur Theke und'),
    ],
  },
  {
    titel: 'Funkstille',
    absaetze: [
      a('Eine zweite Postkarte: „Warum bist du nicht gekommen?“'),
      a('Das Telefon zeigt ', f('Nummer unterdrückt'), '. Ich gehe nicht ran.'),
    ],
  },
];

function laufZuRuns(l: TestLauf): TextRun[] {
  return l.text.split('\n').map((zeile, i) => {
    const children: (string | Tab)[] = [];
    zeile.split('\t').forEach((t, j) => {
      if (j > 0) children.push(new Tab());
      if (t) children.push(t);
    });
    return new TextRun({ children, bold: l.fett, italics: l.kursiv, break: i > 0 ? 1 : undefined });
  });
}

function absatz(x: TestAbsatz): Paragraph {
  switch (x.art) {
    case 'trenner':
      return new Paragraph({ text: '* * *' });
    case 'ueberschrift2':
      return new Paragraph({ heading: HeadingLevel.HEADING_2, text: x.text });
    case 'leer':
      return new Paragraph({ children: [] });
    default:
      return new Paragraph({ children: x.laeufe.flatMap(laufZuRuns) });
  }
}

export async function erzeugeTestManuskript(): Promise<Uint8Array> {
  const kinder: Paragraph[] = [new Paragraph({ heading: HeadingLevel.TITLE, text: TEST_BUCHTITEL })];
  for (const kap of TEST_KAPITEL) {
    kinder.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: kap.titel }));
    for (const x of kap.absaetze) kinder.push(absatz(x));
  }
  kinder.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [] }));
  const doc = new Document({ creator: 'Plotwerk-Test', sections: [{ children: kinder }] });
  return Packer.pack(doc, 'uint8array');
}
