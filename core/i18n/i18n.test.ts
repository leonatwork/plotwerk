import { buchSprache, fmt, platzhalter, sprachCode, texteJe } from './index';

describe('core/i18n', () => {
  it('setzt Platzhalter und Pluralformen ein', () => {
    expect(fmt('Kap. {nr} ist {tag}', { nr: 10, tag: 'Donnerstag' })).toBe('Kap. 10 ist Donnerstag');
    const p = { zero: 'keine Wörter', one: '{n} Wort', other: '{n} Wörter' };
    expect(fmt(p, { n: 0 })).toBe('keine Wörter');
    expect(fmt(p, { n: 1 })).toBe('1 Wort');
    expect(fmt(p, { n: 2500 }, 'de')).toBe('2.500 Wörter');
    expect(fmt({ one: '{n} word', other: '{n} words' }, { n: 2500 }, 'en')).toBe('2,500 words');
    expect(fmt('{fehlt} bleibt', {})).toBe('{fehlt} bleibt');
  });

  it('findet Platzhalter', () => {
    expect(platzhalter('{b} und {a} und {a}')).toEqual(['a', 'b']);
    expect(platzhalter({ one: '{n} Tag', other: '{n} Tage' })).toEqual(['n']);
  });

  it('erkennt die Buchsprache aus BCP-47-Codes und Namen', () => {
    expect(buchSprache(undefined)).toBe('de');
    expect(buchSprache({})).toBe('de');
    expect(buchSprache({ sprache: 'de-AT' })).toBe('de');
    expect(buchSprache({ sprache: 'Deutsch' })).toBe('de');
    expect(buchSprache({ sprache: 'en-GB' })).toBe('en');
    expect(buchSprache({ sprache: 'English' })).toBe('en');
    expect(sprachCode('', 'en')).toBe('en');
    expect(sprachCode('fr')).toBe('en');
  });

  it('wählt das Wörterbuch eines core-Moduls', () => {
    const T = texteJe({ kap: 'Kap. {nr}' }, { kap: 'Ch. {nr}' });
    expect(T().kap).toBe('Kap. {nr}');
    expect(T('en').kap).toBe('Ch. {nr}');
  });
});
