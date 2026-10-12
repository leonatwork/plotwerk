import { describe, expect, it } from 'vitest';
import { typografieBeimTippen, type Ersetzung } from './index';

/** [Text davor, Eingabe, erwartete Ersetzung oder null] */
const faelle: [string, string, Ersetzung | null][] = [
  // doppelte Anführungszeichen
  ['', '"', { loeschen: 0, einfuegen: '„' }],
  ['Er sagt ', '"', { loeschen: 0, einfuegen: '„' }],
  ['Er sagt „Hallo', '"', { loeschen: 0, einfuegen: '“' }],
  ['Er sagt „Hallo!', '"', { loeschen: 0, einfuegen: '“' }],
  ['(', '"', { loeschen: 0, einfuegen: '„' }],
  ['Wasser – ', '"', { loeschen: 0, einfuegen: '„' }],
  ['Wasser –', '"', { loeschen: 0, einfuegen: '„' }],
  ['Zeile\n', '"', { loeschen: 0, einfuegen: '„' }],
  // einfache Anführungszeichen und Apostroph
  ['geht', "'", { loeschen: 0, einfuegen: '’' }],
  ['probier', "'", { loeschen: 0, einfuegen: '’' }],
  ['die 90', "'", { loeschen: 0, einfuegen: '’' }],
  ['Er nennt es ', "'", { loeschen: 0, einfuegen: '‚' }],
  ['', "'", { loeschen: 0, einfuegen: '‚' }],
  ['Er nennt es ‚Kunst', "'", { loeschen: 0, einfuegen: '‘' }],
  ['Er nennt es ‚Kunst‘ und geht', "'", { loeschen: 0, einfuegen: '’' }],
  ['‚Ich geh‘', 's', { loeschen: 1, einfuegen: '’s' }],
  ['‚Ich geh‘', ' ', null],
  // Gedankenstrich
  ['Er wartet -', '-', { loeschen: 1, einfuegen: '–' }],
  ['Er wartet', '-', null],
  ['Ein-', '-', { loeschen: 1, einfuegen: '–' }],
  ['Er wartet –', '-', null],
  ['Er wartet -', ' ', { loeschen: 1, einfuegen: '– ' }],
  ['-', ' ', null],
  ['Ein-', ' ', null],
  ['Er wartet', ' ', null],
  // Auslassungspunkte
  ['Wieso..', '.', { loeschen: 2, einfuegen: '…' }],
  ['Wieso.', '.', null],
  ['Wieso...', '.', null],
  ['..', '.', { loeschen: 2, einfuegen: '…' }],
  // nichts in URLs, Pfaden, E-Mail, Code zerstören
  ['siehe https://example.com/a-', '-', null],
  ['siehe www.example..', '.', null],
  ['Pfad ~/Dokumente/', '"', null],
  ['Mail an paul@example.com', "'", null],
  ['Code `x = ', '"', null],
  ['Code `x` und dann ', '"', { loeschen: 0, einfuegen: '„' }],
  // andere Zeichen
  ['Hallo', 'a', null],
  ['Hallo', 'ab', null],
];

describe('typografieBeimTippen (Tabelle)', () => {
  it.each(faelle)('%j + %j', (davor, eingabe, erwartet) => {
    expect(typografieBeimTippen(davor, eingabe)).toEqual(erwartet);
  });

  it('mindestens 25 Fälle', () => {
    expect(faelle.length).toBeGreaterThanOrEqual(25);
  });
});

/** Tippt Zeichen für Zeichen wie der Editor (Absatzanfang = leerer Text). */
function tippe(eingaben: string): string {
  let text = '';
  for (const z of eingaben) {
    const e = typografieBeimTippen(text, z);
    text = e ? text.slice(0, text.length - e.loeschen) + e.einfuegen : text + z;
  }
  return text;
}

describe('typografieBeimTippen (ganze Sätze)', () => {
  it.each([
    ['Er sagt "Hallo" und geht\'s an.', 'Er sagt „Hallo“ und geht’s an.'],
    ['"Komm schon, probier\' es doch" sagt sie.', '„Komm schon, probier’ es doch“ sagt sie.'],
    ["Sie nennt es 'Kunst' -- ich nicht...", 'Sie nennt es ‚Kunst‘ – ich nicht…'],
    ["'Ich geh's holen', sagt er.", '‚Ich geh’s holen‘, sagt er.'],
    ['Wasser -- "Eine halbe Stunde"', 'Wasser – „Eine halbe Stunde“'],
    ['Link: https://a.de/x--y...', 'Link: https://a.de/x--y...'],
  ])('%s', (eingabe, erwartet) => {
    expect(tippe(eingabe)).toBe(erwartet);
  });
});
