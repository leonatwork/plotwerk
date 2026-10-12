/** Marken-Export und Gründe in der Oberflächensprache Englisch. */
import { describe, expect, it } from 'vitest';
import type { Markenliste } from '../model/types';
import { GRUND_TEXT, grundText, markenAlsCsv, markenAlsMarkdown, markenUebersicht, type KapitelText } from './index';

const liste: Markenliste = {
  marken: [
    { id: 'carl-hansen', name: 'Carl Hansen', aliase: ['Carl Hanssen'], kategorie: 'Möbel' },
    { id: 'schwip-schwap', name: 'Schwip Schwap', aliase: [], kategorie: 'Getränk, kalt' },
    { id: 'saab', name: 'Saab', aliase: [] },
  ],
  ignoriert: [],
};

const kapitel: KapitelText[] = [
  { id: 'eins', titel: 'Eins', text: 'Sie sitzt auf einem Stuhl von Carl Hanssen. Dazu eine Schwip Schwap. Carl Hanssen eben.' },
  { id: 'zwei', titel: 'Zwei', text: 'Wieder Carl Hansen.' },
];

describe('Markennamen – englische Oberfläche', () => {
  it('Gründe der Heuristik', () => {
    expect(grundText('versalien', 'en')).toBe('in capitals');
    expect(grundText('bekannt')).toBe('bekannte Marke');
    expect(GRUND_TEXT.eigenname).toBe('mehrteiliger Eigenname');
  });

  it('exportiert Markdown mit englischen Überschriften, Datum und Kapitelangaben', () => {
    const u = markenUebersicht(kapitel, liste);
    const md = markenAlsMarkdown(u, kapitel, 'Harbour Lights', new Date('2026-10-10T12:00:00'), 'en');
    expect(md).toContain('# Brand names – Harbour Lights');
    expect(md).toContain('As of October 10, 2026 · 2 brands in the text, 4 occurrences');
    expect(md).toContain('| Brand | Category | Occurrences | Chapters | Spellings | Note |');
    expect(md).toContain('| Carl Hansen | Möbel | 3 | Ch. 1 “Eins” (2×); Ch. 2 “Zwei” (1×) | Carl Hanssen (2×), Carl Hansen (1×) |  |');
    expect(md).toContain('Not found in the text: Saab');
    expect(md).not.toMatch(/Kap\.|Marke|Stand/);
  });

  it('exportiert CSV mit Komma als Trenner und englischer Kopfzeile', () => {
    const u = markenUebersicht(kapitel, liste);
    const csv = markenAlsCsv(u, kapitel, 'en');
    expect(csv.startsWith('﻿Brand,Category,Occurrences,Chapters,Spellings,Note\r\n')).toBe(true);
    expect(csv).toContain('Schwip Schwap,"Getränk, kalt",1,Ch. 1 “Eins” (1×),,');
    expect(csv).toContain('"Carl Hanssen (2×), Carl Hansen (1×)"');
    // Deutsch unverändert: Semikolon
    expect(markenAlsCsv(u, kapitel).startsWith('﻿Marke;Kategorie;Vorkommen')).toBe(true);
  });
});
