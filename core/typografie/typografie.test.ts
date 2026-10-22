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
function tippe(eingaben: string, stil?: 'de' | 'verlag' | 'schweiz'): string {
  let text = '';
  for (const z of eingaben) {
    const e = typografieBeimTippen(text, z, 'de', stil);
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

describe.each([
  ['de', '„', '“', '‚', '‘'],
  ['verlag', '»', '«', '›', '‹'],
  ['schweiz', '«', '»', '‹', '›'],
] as const)('Anführungszeichen-Stil %s', (stil, auf, zu, einfachAuf, einfachZu) => {
  it('tippt doppelte und einfache Zeichen mit Apostroph', () => {
    expect(tippe('"Hallo"', stil)).toBe(`${auf}Hallo${zu}`);
    expect(tippe("'Ich geh's holen', probier' es...", stil)).toBe(`${einfachAuf}Ich geh’s holen${einfachZu}, probier’ es…`);
    expect(tippe(`"Er nennt es 'Kunst'"`, stil)).toBe(`${auf}Er nennt es ${einfachAuf}Kunst${einfachZu}${zu}`);
  });

  it.each(['', ' ', '(', '[', '{', '–', '—', '-', '\n'])('öffnet nach %j, auch verschachtelt', (davor) => {
    expect(typografieBeimTippen(davor, '"', 'de', stil)?.einfuegen).toBe(auf);
    expect(typografieBeimTippen(davor, "'", 'de', stil)?.einfuegen).toBe(einfachAuf);
    expect(typografieBeimTippen(auf, "'", 'de', stil)?.einfuegen).toBe(einfachAuf);
    expect(typografieBeimTippen(einfachAuf, '"', 'de', stil)?.einfuegen).toBe(auf);
  });

  it.each(['https://example.com/a', 'www.example.com', '~/Dokumente/', '/tmp/datei', 'C:\\Dokumente\\', 'paul@example.com', 'mailto:paul@example.com', '`x = '])('lässt technische Umgebung %j unverändert', (davor) => {
    for (const zeichen of ['"', "'"]) expect(typografieBeimTippen(davor, zeichen, 'de', stil)).toBeNull();
  });

  it('wirkt nicht auf englische Typografie', () => {
    expect(typografieBeimTippen('', '"', 'en', stil)?.einfuegen).toBe('“');
    expect(typografieBeimTippen('“Hallo', '"', 'en', stil)?.einfuegen).toBe('”');
  });
});

describe('typografieBeimTippen (Englisch)', () => {
  const en: [string, string, Ersetzung | null][] = [
    ['', '"', { loeschen: 0, einfuegen: '“' }],
    ['He said ', '"', { loeschen: 0, einfuegen: '“' }],
    ['He said “Hello', '"', { loeschen: 0, einfuegen: '”' }],
    ['“I was going to—', '"', { loeschen: 0, einfuegen: '”' }],
    ['(', '"', { loeschen: 0, einfuegen: '“' }],
    ['don', "'", { loeschen: 0, einfuegen: '’' }],
    ['Chris', "'", { loeschen: 0, einfuegen: '’' }],
    ['She calls it ', "'", { loeschen: 0, einfuegen: '‘' }],
    ['She calls it ‘art', "'", { loeschen: 0, einfuegen: '’' }],
    ['the ‘', '9', { loeschen: 1, einfuegen: '’9' }],
    ['rock ‘n', "'", { loeschen: 2, einfuegen: '’n’' }],
    ['tell ‘em', ' ', { loeschen: 3, einfuegen: '’em ' }],
    ['‘til', ',', { loeschen: 4, einfuegen: '’til,' }],
    ['He waited -', '-', { loeschen: 1, einfuegen: '—' }],
    ['He waited -', ' ', { loeschen: 1, einfuegen: '— ' }],
    ['Why..', '.', { loeschen: 2, einfuegen: '…' }],
    ['see https://example.com/a-', '-', null],
    ['Hello', 'a', null],
  ];
  it.each(en)('%j + %j', (davor, eingabe, erwartet) => {
    expect(typografieBeimTippen(davor, eingabe, 'en')).toEqual(erwartet);
  });

  function tippeEn(eingaben: string): string {
    let text = '';
    for (const z of eingaben) {
      const e = typografieBeimTippen(text, z, 'en');
      text = e ? text.slice(0, text.length - e.loeschen) + e.einfuegen : text + z;
    }
    return text;
  }

  it.each([
    ['"Don\'t," she said -- and left...', '“Don’t,” she said — and left…'],
    ["She calls it 'art'--I don't.", 'She calls it ‘art’—I don’t.'],
    ["the '90s and rock 'n' roll", 'the ’90s and rock ’n’ roll'],
    ['"I was going to--"', '“I was going to—”'],
    ["James' car and James's dog", 'James’ car and James’s dog'],
    ["'Tell 'em,' he said.", '‘Tell ’em,’ he said.'],
  ])('%s', (eingabe, erwartet) => {
    expect(tippeEn(eingabe)).toBe(erwartet);
  });

  it('ohne Sprache bleibt es deutsch', () => {
    expect(typografieBeimTippen('', '"')).toEqual({ loeschen: 0, einfuegen: '„' });
    expect(typografieBeimTippen('Er wartet -', '-', 'de')).toEqual({ loeschen: 1, einfuegen: '–' });
  });
});
