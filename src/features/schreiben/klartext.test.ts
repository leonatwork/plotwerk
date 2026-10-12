import { describe, expect, it } from 'vitest';
import { klartext } from '@core/text/index';
import { parseKapitel } from '@core/projekt';
import type { Node as PMNode } from '@tiptap/pm/model';
import { demoDateien } from '../../../fixtures/demoProjekt';
import { bereichZuPositionen, klartextKarte, offsetZuPos, positionenZuBereich, posZuOffset, type KlartextKarte } from './klartext';
import { docZuMarkdown, markdownZuDoc } from './markdown';
import { schreibSchema } from './schema';

const BEISPIEL = '# Titel\n\nEin **fetter** Satz.\nZweite *Zeile*.\\\nHart umbrochen.\n\n\n* * *\n\n  Letzter Absatz – „Ende“  ';

function pruefeAlleZeichen(doc: PMNode, karte: KlartextKarte) {
  for (let o = 0; o < karte.text.length; o++) {
    const c = karte.text[o]!;
    if (/\s/.test(c)) continue;
    const zeichen = doc.textBetween(karte.von[o]!, karte.bis[o]!, undefined, (k) => (k.type.name === 'horizontalRule' ? '*' : '\n'));
    expect(zeichen, `Offset ${o}`).toBe(c);
    // innerhalb des Szenentrenners teilen sich alle Zeichen eine Position
    if (o === 0 || karte.von[o - 1] !== karte.von[o]) expect(posZuOffset(karte, karte.von[o]!)).toBe(o);
  }
}

describe('Klartext des Editor-Dokuments', () => {
  it('ist genau der Klartext von core/text', () => {
    const doc = markdownZuDoc(BEISPIEL);
    const karte = klartextKarte(doc);
    expect(karte.text).toBe(klartext(BEISPIEL));
    expect(karte.text).toBe('Titel\n\nEin fetter Satz. Zweite Zeile.\nHart umbrochen.\n\n* * *\n\nLetzter Absatz – „Ende“');
  });

  it('bildet jedes Zeichen auf seine Position ab und zurück', () => {
    const doc = markdownZuDoc(BEISPIEL);
    pruefeAlleZeichen(doc, klartextKarte(doc));
  });

  it('gilt auch für alle Demo-Kapitel', () => {
    for (const [pfad, inhalt] of Object.entries(demoDateien())) {
      if (!pfad.startsWith('manuskript/')) continue;
      const { text } = parseKapitel(inhalt);
      const doc = markdownZuDoc(text);
      const karte = klartextKarte(doc);
      expect(karte.text, pfad).toBe(klartext(text));
      pruefeAlleZeichen(doc, karte);
    }
  });

  it('übersteht Leerraum und Zeichen, die nur im Editor stehen', () => {
    const s = schreibSchema;
    const doc = s.node('doc', null, [
      s.node('paragraph'),
      s.node('paragraph', null, [s.text('   Eingerückt mit Leerzeichen am Ende   ')]),
      s.node('paragraph', null, [s.text('  ')]),
      s.node('paragraph', null, [s.text('- Gedankenstrich-Zeile')]),
      s.node('paragraph', null, [s.text('Lotte sagt '), s.node('hardBreak'), s.text('   hallo.')]),
    ]);
    const karte = klartextKarte(doc);
    expect(karte.text).toBe(klartext(docZuMarkdown(doc)));
    pruefeAlleZeichen(doc, karte);
    const lotte = karte.text.indexOf('Lotte');
    const { from, to } = bereichZuPositionen(karte, lotte, lotte + 5);
    expect(doc.textBetween(from, to)).toBe('Lotte');
  });

  it('rechnet Bereiche, Szenentrenner und Blockgrenzen um', () => {
    const doc = markdownZuDoc(BEISPIEL);
    const karte = klartextKarte(doc);
    const start = karte.text.indexOf('fetter');
    const { from, to } = bereichZuPositionen(karte, start, start + 6);
    expect(doc.textBetween(from, to)).toBe('fetter');
    expect(positionenZuBereich(karte, from, to)).toEqual({ start, ende: start + 6 });

    const trenner = karte.text.indexOf('* * *');
    const t = bereichZuPositionen(karte, trenner, trenner + 5);
    expect(doc.nodeAt(t.from)?.type.name).toBe('horizontalRule');
    expect(t.to).toBe(t.from + 1);

    const ueber = bereichZuPositionen(karte, karte.text.indexOf('Satz.'), karte.text.indexOf('Letzter') + 7);
    expect(doc.textBetween(ueber.from, ueber.to, '\n\n', '\n')).toMatch(/^Satz\.[\s\S]*Letzter$/);

    // Offset im Absatzwechsel: 'start' = nächster Block, 'ende' = voriger Block
    const titelEnde = 'Titel'.length;
    expect(offsetZuPos(karte, titelEnde + 1, 'start')).toBe(offsetZuPos(karte, titelEnde + 2, 'start'));
    expect(offsetZuPos(karte, titelEnde + 1, 'ende')).toBe(offsetZuPos(karte, titelEnde, 'ende'));
    expect(offsetZuPos(karte, karte.text.length)).toBe(karte.ende);
  });

  it('funktioniert für ein leeres Dokument', () => {
    const doc = markdownZuDoc('');
    const karte = klartextKarte(doc);
    expect(karte.text).toBe('');
    expect(offsetZuPos(karte, 0)).toBeGreaterThan(0);
    expect(posZuOffset(karte, 1)).toBe(0);
  });
});
