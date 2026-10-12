import { describe, expect, it } from 'vitest';
import { deutscheStimmen, satzAb, stimmenFuer, stimmenRang, vorleseSaetze, waehleStimme, type StimmeInfo } from './vorlesen';

const stimme = (name: string, lang: string, extra: Partial<StimmeInfo> = {}): StimmeInfo => ({
  voiceURI: `com.apple.voice.${name}`,
  name,
  lang,
  localService: true,
  default: false,
  ...extra,
});

describe('Vorlesen: Sätze', () => {
  const text = 'Paul stand auf. Es war spät!\n\n* * *\n\nDann ging er zur Tür. Draußen regnete es.';

  it('teilt in Sätze und lässt Szenentrenner weg', () => {
    expect(vorleseSaetze(text).map((s) => s.text)).toEqual(['Paul stand auf.', 'Es war spät!', 'Dann ging er zur Tür.', 'Draußen regnete es.']);
  });

  it('kürzt Sätze auf eine Auswahl', () => {
    const von = text.indexOf('war');
    const bis = text.indexOf('zur') + 3;
    const liste = vorleseSaetze(text, von, bis);
    expect(liste.map((s) => s.text)).toEqual(['war spät!', 'Dann ging er zur']);
    expect(text.slice(liste[0]!.start, liste[0]!.ende)).toBe('war spät!');
  });

  it('findet den Satz am Cursor', () => {
    const liste = vorleseSaetze(text);
    expect(satzAb(liste, 0)).toBe(0);
    expect(satzAb(liste, text.indexOf('ging'))).toBe(2);
    expect(satzAb(liste, text.length + 5)).toBe(0);
  });
});

describe('Vorlesen: Stimmen', () => {
  const stimmen = [
    stimme('Samantha', 'en-US', { default: true }),
    stimme('Grandma (Deutsch (Deutschland))', 'de-DE'),
    stimme('Markus', 'de-DE'),
    stimme('Markus (Premium)', 'de-DE'),
    stimme('Petra (Erweitert)', 'de-DE'),
    stimme('Helena', 'de-AT'),
  ];

  it('sortiert deutsche Stimmen nach Qualität, Effektstimmen zuletzt', () => {
    expect(deutscheStimmen(stimmen).map((s) => s.name)).toEqual(['Markus (Premium)', 'Petra (Erweitert)', 'Markus', 'Helena', 'Grandma (Deutsch (Deutschland))']);
    expect(stimmenRang(stimmen[0]!)).toBeLessThan(0);
  });

  it('nimmt die gewählte Stimme, sonst die beste deutsche', () => {
    expect(waehleStimme(stimmen, 'com.apple.voice.Helena')?.name).toBe('Helena');
    expect(waehleStimme(stimmen, 'gibt-es-nicht')?.name).toBe('Markus (Premium)');
    expect(waehleStimme(stimmen, null)?.name).toBe('Markus (Premium)');
    expect(waehleStimme([stimme('Samantha', 'en-US')], null)).toBeNull();
  });

  it('wählt bei englischer Buchsprache eine englische Stimme (en-US vor en-GB)', () => {
    const mit = [...stimmen, stimme('Daniel', 'en-GB'), stimme('Ava (Premium)', 'en_US')];
    expect(stimmenFuer(mit, 'en').map((s) => s.name)).toEqual(['Ava (Premium)', 'Samantha', 'Daniel']);
    expect(waehleStimme(mit, null, 'en')?.name).toBe('Ava (Premium)');
    // eine gewählte deutsche Stimme liest kein englisches Buch
    expect(waehleStimme(mit, 'com.apple.voice.Anna', 'en')?.name).toBe('Ava (Premium)');
    expect(waehleStimme(mit, 'com.apple.voice.Daniel', 'en')?.name).toBe('Daniel');
    expect(stimmenRang(stimme('Anna', 'de-DE'), 'en')).toBeLessThan(0);
  });

  it('teilt englische Sätze ohne Abkürzungen wie „Mr.“ zu trennen', () => {
    const text = 'Mr. Smith left. Then he came back! "Why?" she asked.';
    expect(vorleseSaetze(text, 0, text.length, 'en').map((s) => s.text)).toEqual(['Mr. Smith left.', 'Then he came back!', '"Why?" she asked.']);
  });
});
