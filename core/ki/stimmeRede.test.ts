import { describe, expect, it } from 'vitest';
import { redestellen, redestellenDerFigur, redestellenImKapitel, type RedeFigur } from './stimmeRede';

const FIGUREN: RedeFigur[] = [
  { id: 'paul', namen: ['Paul'] },
  { id: 'lotte', namen: ['Lotte'] },
  { id: 'ole', namen: ['Ole'] },
];

describe('core/ki/stimmeRede – Redestellen lokal', () => {
  it('findet wörtliche Rede in allen Anführungszeichen mit möglichen Sprechern in Nennungsreihenfolge', () => {
    const text = [
      'Lotte lacht. „Komm schon, nur einmal“, sagt sie zu Paul.',
      'Ole fragt: "Wie weit bist du?" Paul schweigt.',
      '»Später vielleicht«, murmelt jemand.',
    ].join('\n\n');
    const r = redestellenImKapitel('k', text, FIGUREN);
    expect(r.map((x) => [x.text, x.sprecher])).toEqual([
      ['Komm schon, nur einmal', ['lotte', 'paul']],
      ['Wie weit bist du?', ['ole', 'paul']],
      ['Später vielleicht', []],
    ]);
    expect(r.map((x) => x.absatz)).toEqual([0, 1, 2]);
  });

  it('ignoriert Einzelwörter und Versalien (Titel, Betreffzeilen) und erkennt den Ich-Erzähler', () => {
    const text = 'Auf dem Display steht „Mama“. Betreff »BITTE DRINGEND LESEN«.\n\n„Schön, dass du da bist“ sage ich ihr.';
    const r = redestellenImKapitel('k', text, FIGUREN);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ text: 'Schön, dass du da bist', ich: true, sprecher: [] });
  });

  it('Wortgrenzen und Genitiv: „Pauls“ zählt, „Paulina“ nicht', () => {
    expect(redestellenImKapitel('k', 'Pauls Handy: „Bin gleich da.“', FIGUREN)[0]!.sprecher).toEqual(['paul']);
    expect(redestellenImKapitel('k', 'Paulina ruft: „Bin gleich da.“', FIGUREN)[0]!.sprecher).toEqual([]);
  });

  it('über alle Kapitel, gefiltert nach Figur (optional mit Ich-Erzähler)', () => {
    const alle = redestellen(
      [
        { id: 'a', text: 'Paul sagt: „Ich komme gleich.“' },
        { id: 'leer', text: '   ' },
        { id: 'b', text: '„Ganz sicher nicht“, sage ich.' },
      ],
      FIGUREN,
    );
    expect(alle.map((r) => r.kapitel)).toEqual(['a', 'b']);
    expect(redestellenDerFigur(alle, 'paul').map((r) => r.kapitel)).toEqual(['a']);
    expect(redestellenDerFigur(alle, 'paul', true).map((r) => r.kapitel)).toEqual(['a', 'b']);
  });
});
