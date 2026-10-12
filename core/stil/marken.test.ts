import { describe, expect, it } from 'vitest';
import type { Markenliste } from '../model/types';
import { parseMarken } from '../projekt/lesen';
import { klartext } from '../text/index';
import { findeMarken, markenAlsCsv, markenAlsMarkdown, markenId, markenKandidaten, markenUebersicht, type KapitelText } from './index';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const liste: Markenliste = {
  marken: [
    { id: 'carl-hansen', name: 'Carl Hansen', aliase: ['Karl Hansen'], kategorie: 'Möbel' },
    { id: 'schwip-schwap', name: 'Schwip Schwap', aliase: [], kategorie: 'Getränk' },
    { id: 'aperol', name: 'Aperol', aliase: ['Aperol Spritz'] },
    { id: 'saab', name: 'Saab', aliase: [] },
  ],
  ignoriert: ['Nordhaven'],
};

describe('Leons Markenliste', () => {
  it('findet Namen und Aliase mit Wortgrenzen, Bindestrich-Varianten und Genitiv', () => {
    const t = 'Sie sitzt auf einem Karl-Hansen-Stuhl? Nein: Carl Hansen. Dazu eine schwip-schwap, Aperol Spritz und des Saabs Motor. SaabX ist keine Marke.';
    const treffer = findeMarken(t, liste);
    const namen = Object.fromEntries(treffer.map((x) => [x.marke.id, x.stellen.map((s) => s.text)]));
    expect(namen['carl-hansen']).toEqual(['Karl-Hansen', 'Carl Hansen']);
    expect(namen['schwip-schwap']).toEqual(['schwip-schwap']);
    // „Aperol Spritz“ zählt einmal (längster Treffer), nicht zusätzlich als „Aperol“
    expect(namen.aperol).toEqual(['Aperol Spritz']);
    expect(namen.saab).toEqual(['Saabs']);
  });

  it('meldet nichts, wenn die Liste leer ist', () => {
    expect(findeMarken('Saab und Dyson', { marken: [], ignoriert: [] })).toEqual([]);
  });
});

describe('Heuristik', () => {
  const namen = ['Paul', 'Ole', 'Lotte', 'Herr Kessler', 'Lindenhof'];

  it('schlägt Versalien, Muster, bekannte Marken und mehrteilige Eigennamen vor', () => {
    const t =
      'Paul saugt mit dem DYSON. Später tippt er auf seinem iPhone, trinkt Red Bull und bestellt bei Starbucks. Auf dem Tisch liegt ein Prospekt von Hugo Boss und eine Tüte von H&M. Er trägt Sneaker von Golden Goose. Herr Kessler grüßt.';
    const k = markenKandidaten(t, liste, namen);
    const nachName = Object.fromEntries(k.map((x) => [x.name, x.grund]));
    expect(nachName.DYSON).toBe('versalien');
    expect(nachName.iPhone).toBe('bekannt');
    expect(nachName['Red Bull']).toBe('bekannt');
    expect(nachName.Starbucks).toBe('bekannt');
    expect(nachName['Hugo Boss']).toBe('bekannt');
    expect(nachName['H&M']).toBe('muster');
    expect(nachName['Golden Goose']).toBe('eigenname');
    // Figurennamen, Anreden und Satzanfänge sind keine Marken
    expect(Object.keys(nachName).some((n) => /Kessler|Paul|Später|Auf/.test(n))).toBe(false);
  });

  it('übergeht Schilder in Versalien, Abkürzungen, Ignoriertes und gelistete Marken', () => {
    const t = 'Auf dem Schild steht BETRETEN VERBOTEN. Die USA, die EU und Nordhaven. Er trinkt Aperol und fährt Saab. Kapitel IV.';
    const k = markenKandidaten(t, liste, namen);
    expect(k.map((x) => x.name)).toEqual([]);
  });

  it('fasst Schreibweisen zusammen und zählt Vorkommen', () => {
    const t = 'Sie kauft bei IKEA ein. Wieder IKEA. Und noch einmal IKEA.';
    const k = markenKandidaten(t, { marken: [], ignoriert: [] });
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ name: 'IKEA', grund: 'bekannt' });
    expect(k[0]!.stellen).toHaveLength(3);
  });

  it('erkennt mehrteilige Eigennamen nicht am Satzanfang oder nach Anführungszeichen', () => {
    const t = 'Golden Goose am Satzanfang. „Kleine Fische“, sagt er.';
    expect(markenKandidaten(t, { marken: [], ignoriert: [] }).map((x) => x.name)).toEqual([]);
  });

  it('hält Substantiv-Folgen nicht für Namen, wenn ein Teil auch anders verbunden vorkommt', () => {
    const t = 'Er nimmt eine Tasse Tee, sie eine Tasse Kakao. Dazu trägt sie Golden Goose und noch einmal Golden Goose.';
    expect(markenKandidaten(t, { marken: [], ignoriert: [] }).map((x) => x.name)).toEqual(['Golden Goose']);
  });
});

describe('Übersicht und Export', () => {
  const kapitel: KapitelText[] = [
    { id: 'eins', titel: 'Eins', text: 'Er sitzt auf dem Carl Hansen und trinkt eine Schwip Schwap. Später: Karl Hansen.' },
    { id: 'zwei', titel: 'Zwei', text: 'Wieder ein Karl Hansen. Er saugt mit dem DYSON.' },
  ];

  it('zählt je Marke und Kapitel, mit Schreibweisen und Marken ohne Vorkommen', () => {
    const u = markenUebersicht(kapitel, liste);
    expect(u.zeilen.map((z) => [z.marke.id, z.gesamt])).toEqual([
      ['carl-hansen', 3],
      ['schwip-schwap', 1],
    ]);
    expect(u.zeilen[0]!.kapitel.map((k) => [k.kapitel, k.stellen.length])).toEqual([
      ['eins', 2],
      ['zwei', 1],
    ]);
    expect(u.zeilen[0]!.schreibweisen).toEqual([
      { text: 'Karl Hansen', anzahl: 2 },
      { text: 'Carl Hansen', anzahl: 1 },
    ]);
    expect(u.ohneTreffer.map((m) => m.id)).toEqual(['aperol', 'saab']);
    expect(u.kandidaten).toEqual([expect.objectContaining({ name: 'DYSON', gesamt: 1 })]);
  });

  it('exportiert eine Liste fürs Lektorat als Markdown und CSV', () => {
    const u = markenUebersicht(kapitel, liste);
    const md = markenAlsMarkdown(u, kapitel, 'Hafenlichter', new Date('2026-10-10T12:00:00'));
    expect(md).toContain('# Markennamen – Hafenlichter');
    expect(md).toContain('| Carl Hansen | Möbel | 3 | Kap. 1 „Eins“ (2×); Kap. 2 „Zwei“ (1×) | Karl Hansen (2×), Carl Hansen (1×) |  |');
    expect(md).toContain('Ohne Vorkommen im Text: Aperol, Saab');
    const csv = markenAlsCsv(u, kapitel);
    expect(csv.startsWith('﻿Marke;Kategorie;Vorkommen')).toBe(true);
    expect(csv).toContain('Schwip Schwap;Getränk;1;Kap. 1 „Eins“ (1×);;');
  });

  it('erzeugt eindeutige IDs', () => {
    expect(markenId('Schwip Schwap', ['schwip-schwap'])).toBe('schwip-schwap-2');
    expect(markenId('Hermès', [])).toBe('hermes');
    expect(markenId('Weißbräu', [])).toBe('weissbrau');
  });

  it('funktioniert mit dem Demo-Projekt', () => {
    const lies = (p: string) => readFileSync(fileURLToPath(new URL(`../../fixtures/demo-projekt/${p}`, import.meta.url)), 'utf8');
    const demoListe = parseMarken(lies('plan/marken.md'));
    const texte: KapitelText[] = ['weissraum', 'fassade', 'flut', 'lotte', 'staub'].map((id) => ({
      id,
      titel: id,
      text: klartext(lies(`manuskript/${id}.md`).replace(/^---[\s\S]*?---\n/u, '')),
    }));
    const u = markenUebersicht(texte, demoListe, ['Paul', 'Ole', 'Lotte', 'Konrad', 'Malte', 'Herr Kessler', 'Vera']);
    const hansen = u.zeilen.find((z) => z.marke.id === 'carl-hansen');
    expect(hansen?.gesamt).toBe(2);
    expect(hansen?.schreibweisen.map((s) => s.text).sort()).toEqual(['Carl Hansen', 'Karl Hansen']);
    expect(u.zeilen.map((z) => z.marke.id)).toEqual(expect.arrayContaining(['saab', 'kleinanzeigen', 'volvo', 'aperol', 'schwip-schwap']));
    // Schild in Versalien („BETRETEN VERBOTEN“) ist kein Vorschlag
    expect(u.kandidaten.some((k) => /BETRETEN|VERBOTEN/.test(k.name))).toBe(false);
  });
});

describe('Heuristik – englische Buchsprache', () => {
  it('meldet Eigennamen mitten im Satz, aber keine Anreden, Wochentage oder „I“', () => {
    const t = 'On Monday I met Mr Smith near Golden Goose. Then I Saw nothing. THE END.';
    const k = markenKandidaten(t, { marken: [], ignoriert: [] }, ['Smith'], 'en');
    const namen = k.map((x) => x.name);
    expect(namen).toContain('Golden Goose');
    expect(namen.some((n) => /Monday|Smith|^I|THE/.test(n))).toBe(false);
  });
});
