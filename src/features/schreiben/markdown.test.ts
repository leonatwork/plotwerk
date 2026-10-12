import { describe, expect, it } from 'vitest';
import { klartext } from '@core/text/index';
import { parseKapitel } from '@core/projekt';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { docZuMarkdown, markdownZuDoc } from './markdown';
import { schreibSchema } from './schema';

const rund = (md: string) => docZuMarkdown(markdownZuDoc(md));
const s = schreibSchema;

describe('Markdown ↔ Dokument', () => {
  it('lässt alle Kapitel des Demo-Projekts byte-identisch', () => {
    const kapitel = Object.entries(demoDateien()).filter(([p]) => p.startsWith('manuskript/'));
    expect(kapitel.length).toBeGreaterThan(5);
    for (const [pfad, inhalt] of kapitel) {
      const { text } = parseKapitel(inhalt);
      expect(rund(text), pfad).toBe(text);
    }
  });

  it.each([
    ['Sonderzeichen', '„Nur eine halbe Stunde, Papa" – ‚wenn’s wackelt‘ … »gut« ‹so› \'x\' "y" — 1–2'],
    ['Auszeichnung', '**fett** und *kursiv* und ***beides*** und **fett *innen* fett**.'],
    ['Unterstrich-Schreibweise', '_kursiv_ und __fett__ und ___beides___'],
    ['Weicher Umbruch', 'Zeile eins\nZeile zwei\n„Zeile drei“'],
    ['Harter Umbruch', 'Zeile eins\\\nZeile zwei  \nZeile drei'],
    ['Umbruch mit Leerraum', 'eins \n   zwei\\\n  drei'],
    ['Überschriften', '# Eins\n\nText\n\n## Zwei\n\n###### Sechs'],
    ['Überschrift mit Einzug', ' # Eins\n\n#  Zwei'],
    ['Setext-Überschrift', 'Titel\n=====\n\nUnter\n---'],
    ['Leere Überschrift', 'Text\n\n#'],
    ['Szenentrenner', 'Vorher.\n\n* * *\n\nNachher.'],
    ['Szenentrenner andere Formen', 'Vorher.\n\n***\n\nMitte.\n\n- - -\n\n___'],
    ['Sternchen als Text', '5 * 3 = 15 und a * b'],
    ['Maskiertes Sternchen', '\\*nicht kursiv\\* und \\_auch nicht\\_'],
    ['Wort mit Unterstrich', 'snake_case_wort'],
    ['Raute als Text', '\\# keine Überschrift\n#hashtag'],
    ['Backslash', 'C:\\Pfad\\datei'],
    ['Kursiv über Satzzeichen', '*„Hallo“*, sagte sie. *Gut*.'],
    ['Kursiv über Umbruch', '*eins\nzwei*'],
    ['Zeichen ohne Bedeutung', '<b>kein</b> & [[kein Link]] und ein ` Backtick'],
    ['Einzug und Leerraum am Rand', '  eingerückt\n    tiefer  \n\nweiter'],
    ['Datum am Zeilenanfang', 'Er kam am\n2. Mai zurück.'],
  ])('%s', (_name, md) => {
    expect(rund(md)).toBe(md);
  });

  it('erkennt die Struktur', () => {
    const doc = markdownZuDoc('# Titel\n\nEin **fetter** und *kursiver* Satz.\nNeue Zeile.\\\nHart.\n\n* * *\n\nEnde');
    const typen: string[] = [];
    doc.forEach((k) => typen.push(k.type.name));
    expect(typen).toEqual(['heading', 'paragraph', 'horizontalRule', 'paragraph']);
    const teile = doc.child(1).content.content.map((k) => [k.type.name, k.text ?? '', k.marks.map((m) => m.type.name).join(',')]);
    expect(teile).toEqual([
      ['text', 'Ein ', ''],
      ['text', 'fetter', 'bold'],
      ['text', ' und ', ''],
      ['text', 'kursiver', 'italic'],
      ['text', ' Satz.', ''],
      ['hardBreak', '', ''],
      ['text', 'Neue Zeile.', ''],
      ['hardBreak', '', ''],
      ['text', 'Hart.', ''],
    ]);
    expect(doc.child(1).child(5).attrs.markup).toBe('\n');
    expect(doc.child(1).child(7).attrs.markup).toBeNull();
  });

  it('normalisiert nur Leerzeilen und Zeilenenden', () => {
    expect(rund('Eins\n\n\n\nZwei\n')).toBe('Eins\n\nZwei');
    expect(rund('Eins\r\nZwei')).toBe('Eins\nZwei');
  });

  it('speichert im Editor gesetzte Auszeichnung und Steuerzeichen so, dass core/text dasselbe liest', () => {
    const fett = s.marks.bold!.create();
    const kursiv = s.marks.italic!.create();
    const doc = s.node('doc', null, [
      s.node('paragraph', null, [s.text('Ein '), s.text('fettes ', [fett]), s.text('Wort'), s.text(' * und _ und \\*', [kursiv])]),
      s.node('paragraph', null, [s.text('# kein Titel')]),
      s.node('paragraph', null, [s.text('* * *')]),
      s.node('paragraph', null, [s.text('   ')]),
      s.node('paragraph', null, [s.text('- Spiegelstrich'), s.node('hardBreak'), s.text('1. Platz'), s.node('hardBreak'), s.text('> Zitat')]),
      s.node('paragraph', null, [s.text('    Eingerückt `code` und `mehr` [Text](url) &amp; <https://x.de>')]),
      s.node('paragraph', null, [s.text('Text'), s.node('hardBreak'), s.text('---')]),
      s.node('heading', { level: 2 }, [s.text('Titel '), s.node('hardBreak'), s.text('zwei')]),
    ]);
    const md = docZuMarkdown(doc);
    expect(md).toBe(
      [
        'Ein **fettes** Wort *\\* und _ und \\\\\\**',
        '\\# kein Titel',
        '\\* * *',
        '\\- Spiegelstrich\\\n1\\. Platz\\\n\\> Zitat',
        'Eingerückt \\`code\\` und \\`mehr\\` \\[Text](url) \\&amp; \\<https://x.de>',
        'Text\\\n\\---',
        '## Titel  zwei',
      ].join('\n\n'),
    );
    const zurueck = markdownZuDoc(md);
    const texte: string[] = [];
    zurueck.forEach((k) => texte.push(k.textBetween(0, k.content.size, undefined, '\n')));
    expect(texte).toEqual([
      'Ein fettes Wort * und _ und \\*',
      '# kein Titel',
      '* * *',
      '- Spiegelstrich\n1. Platz\n> Zitat',
      'Eingerückt `code` und `mehr` [Text](url) &amp; <https://x.de>',
      'Text\n---',
      'Titel  zwei',
    ]);
    expect(docZuMarkdown(zurueck)).toBe(md);
    // core/text (CommonMark) liest dieselben Absätze
    expect(klartext(md).split('\n\n')).toEqual(texte);
  });

  it('setzt Auszeichnung mitten im Wort mit Sternchen', () => {
    const kursivU = s.marks.italic!.create({ markup: '_' });
    const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('Haus'), s.text('tür', [kursivU]), s.text('klinke')])]);
    const md = docZuMarkdown(doc);
    expect(md).toBe('Haus*tür*klinke');
    expect(markdownZuDoc(md).child(0).child(1).marks[0]!.type.name).toBe('italic');
  });

  it('schiebt Leerraum aus der Auszeichnung heraus', () => {
    const fett = s.marks.bold!.create();
    const doc = s.node('doc', null, [s.node('paragraph', null, [s.text('Ein'), s.text(' fettes ', [fett]), s.text('Wort')])]);
    expect(docZuMarkdown(doc)).toBe('Ein **fettes** Wort');
  });

  it('lässt leere Absätze weg und entfernt getippten Einzug', () => {
    const doc = s.node('doc', null, [
      s.node('paragraph', null, [s.text('A')]),
      s.node('paragraph'),
      s.node('paragraph', null, [s.text('    B')]),
    ]);
    expect(docZuMarkdown(doc)).toBe('A\n\nB');
  });
});
