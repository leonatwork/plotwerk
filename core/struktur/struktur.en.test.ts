/** Lokale Hinweise auf Englisch: englische Titel/Erklärungen, dieselben Schlüssel wie auf Deutsch. */
import { beforeAll, describe, expect, it } from 'vitest';
import { schreibweisenHinweise } from '../erkennung';
import { stimmenHinweise } from '../figuren/stimme';
import { berechneIndex } from '../index/index';
import { hinweisTypName, hinweisTypNamen, HINWEIS_TYP_NAME } from '../index/hinweisTypen';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { ProjektDaten } from '../model/types';
import { strukturHinweise } from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemo();
});

function mit(kapitel: Record<string, string>, titel: Record<string, string> = {}): ProjektDaten {
  return {
    ...daten,
    projekt: { ...daten.projekt, kapitel: Object.keys(kapitel) },
    kapitel: Object.fromEntries(Object.entries(kapitel).map(([id, text]) => [id, { id, titel: titel[id] ?? id, text }])),
  };
}

const schluessel = (hs: { schluessel: string }[]) => hs.map((h) => h.schluessel);

describe('strukturHinweise (en)', () => {
  it('Demo: englische Titel, gleiche Schlüssel und Zitate', () => {
    const de = strukturHinweise(daten);
    const en = strukturHinweise(daten, 'en');
    expect(schluessel(en)).toEqual(schluessel(de));
    expect(en.map((h) => h.zitate)).toEqual(de.map((h) => h.zitate));
    expect(en.map((h) => h.titel)).toEqual(['Ch. 4 has no text', 'Ch. 9 ends mid-sentence']);
    expect(en[1]!.erklaerung).toMatch(/^The last sentence of “.+” has no closing punctuation: “… ich nach einem freien Tisch suche”\.$/);
  });

  it('Regeln: Leerzeichen, leere Überschriften, fehlender Titel', () => {
    const d = mit({ a: 'Er öffnet die Tür  und geht. Dann  bleibt er stehen.\n\n##\n\nZweiter Absatz.\n\n#' }, { a: '' });
    const de = strukturHinweise(d);
    const en = strukturHinweise(d, 'en');
    expect(schluessel(en)).toEqual(schluessel(de));
    expect(en.map((h) => h.titel)).toEqual(['Ch. 1 has no heading', 'Double spaces in Ch. 1', 'Empty heading in Ch. 1', 'Empty heading at the end of Ch. 1']);
    expect(en[1]!.erklaerung).toBe('In 2 places there are several spaces in a row.');
  });
});

describe('weitere lokale Hinweise (en)', () => {
  it('Schreibweisen: englisch, gleiche Schlüssel', () => {
    const de = schreibweisenHinweise(daten);
    const en = schreibweisenHinweise(daten, 'en');
    expect(schluessel(en)).toEqual(schluessel(de));
    const linden = en.find((h) => h.titel.includes('Linden'))!;
    expect(linden.titel).toBe('“Lindenhof”, “Linden Hof” or “Linden-Hof”');
    expect(linden.erklaerung).toMatch(/^The place “.+” appears in three spellings in the text: “Lindenhof” \(Ch\. 3\)/);
    const hansen = en.find((h) => h.titel.includes('Hansen'))!;
    expect(hansen.erklaerung).toMatch(/^Very similar names that differ by only one character: /);
  });

  it('Figurenstimme: nur der Rahmen wird übersetzt', () => {
    const b = daten.kiStimmen?.eintraege[0];
    if (!b) return; // Demo ohne Stimmen-Ablage
    const de = stimmenHinweise(daten);
    const en = stimmenHinweise(daten, 'en');
    expect(schluessel(en)).toEqual(schluessel(de));
    expect(en[0]!.titel.startsWith('Voice of ')).toBe(true);
    expect(en[0]!.titel.endsWith(b.titel)).toBe(true);
  });

  it('Index: gleiche Schlüssel in beiden Sprachen, Entscheidung „Ist Absicht“ gilt auch auf Englisch', () => {
    const de = berechneIndex(daten);
    const en = berechneIndex(daten, null, 'en');
    expect(schluessel(en.hinweise)).toEqual(schluessel(de.hinweise));
    expect(en.erwaehnungen).toEqual(de.erwaehnungen);
    const zeit = de.hinweise.find((h) => h.typ === 'zeitleiste' && h.quelle === 'lokal')!;
    const entschieden: ProjektDaten = {
      ...daten,
      entscheidungen: { ...daten.entscheidungen, hinweise: [...daten.entscheidungen.hinweise, { schluessel: zeit.schluessel, entscheidung: 'absicht', datum: '2026-10-12' }] },
    };
    expect(berechneIndex(entschieden, null, 'en').hinweise.find((h) => h.schluessel === zeit.schluessel)?.status).toBe('absicht');
  });

  it('Hinweis-Typnamen', () => {
    expect(hinweisTypName('schreibweise', 'en')).toBe('Spelling');
    expect(hinweisTypName('offener_faden')).toBe('Loses Ende');
    expect(Object.keys(hinweisTypNamen('en'))).toEqual(Object.keys(HINWEIS_TYP_NAME));
  });
});
