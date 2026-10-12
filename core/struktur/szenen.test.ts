import { beforeAll, describe, expect, it } from 'vitest';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { ProjektDaten, Szene } from '../model/types';
import { klartext } from '../text';
import {
  hatSzenen,
  naechsterSzenenIndex,
  neueSzenenId,
  szeneAendern,
  szeneEntfernen,
  szenenAnfang,
  szenenOrdnen,
  szenenSprungBereich,
  szenenZeilen,
  szeneVerschieben,
  uhrzeitNormalisieren,
  zeitKurz,
} from './szenen';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemo();
});

const sz = (index: number, id = `k-s${index + 1}`, titel = ''): Szene => ({ id, kapitel: 'k', index, titel, figuren: [], notiz: '' });

describe('szenenZeilen', () => {
  it('Demo „Ebbe“: drei Abschnitte im Text, alle drei geplant', () => {
    const z = szenenZeilen(daten.kapitel.ebbe!.text, daten.plaene.ebbe!.szenen);
    expect(z.map((x) => x.szene?.titel)).toEqual(['Fischrestaurant mit Vera', 'Kai bei Nacht', 'Zu Hause']);
    expect(z.every((x) => x.abschnitt && x.woerter > 0 && x.anfang)).toBe(true);
    expect(hatSzenen(z)).toBe(true);
  });

  it('Text ohne Trenner und ohne Plan: eine Zeile, keine Szenenliste nötig', () => {
    const z = szenenZeilen('Ein Absatz.\n\nNoch einer.', undefined);
    expect(z).toHaveLength(1);
    expect(z[0]!.szene).toBeUndefined();
    expect(z[0]!.woerter).toBe(4);
    expect(hatSzenen(z)).toBe(false);
  });

  it('mehr Plan-Szenen als Abschnitte: die übrigen sind nur geplant', () => {
    const z = szenenZeilen('Eins.\n\n* * *\n\nZwei.', [sz(0), sz(1), sz(3)]);
    expect(z.map((x) => [x.index, !!x.abschnitt, !!x.szene])).toEqual([
      [0, true, true],
      [1, true, true],
      [3, false, true],
    ]);
  });

  it('Kapitel ohne Text: nur geplante Szenen, keine leeren Abschnitte', () => {
    expect(szenenZeilen('', undefined)).toEqual([]);
    expect(szenenZeilen('  \n', [sz(0)]).map((x) => !!x.abschnitt)).toEqual([false]);
  });

  it('Abschnitt ohne Plan-Daten: Zeile ohne szene, „+ Szene planen“ nimmt ihn zuerst', () => {
    const z = szenenZeilen('Eins.\n\n* * *\n\nZwei.\n\n* * *\n\nDrei.', [sz(0), sz(2)]);
    expect(z.map((x) => !!x.szene)).toEqual([true, false, true]);
    expect(naechsterSzenenIndex(z)).toBe(1);
    expect(naechsterSzenenIndex(szenenZeilen('Eins.', [sz(0)]))).toBe(1);
    expect(naechsterSzenenIndex([])).toBe(0);
  });
});

describe('Szenen-Plan ändern', () => {
  it('szeneAendern legt an der Stelle eine Szene mit stabiler ID an', () => {
    const neu = szeneAendern('k', [sz(0)], 2, { titel: 'Am Hafen' });
    expect(neu.map((s) => [s.index, s.id, s.titel])).toEqual([
      [0, 'k-s1', ''],
      [2, 'k-s3', 'Am Hafen'],
    ]);
    expect(neu[1]!.kapitel).toBe('k');
  });

  it('szeneAendern ändert eine vorhandene Szene und entfernt leere Felder', () => {
    const start = [{ ...sz(0), ort: 'fischstand', zeit: { tag: 2, sicherheit: 'fest' as const } }];
    const neu = szeneAendern('k', start, 0, { ort: undefined, zeit: { sicherheit: 'fest' }, titel: 'X' });
    expect(neu[0]).toEqual({ id: 'k-s1', kapitel: 'k', index: 0, titel: 'X', figuren: [], notiz: '' });
  });

  it('neue IDs kollidieren nicht mit vorhandenen', () => {
    expect(neueSzenenId('k', [sz(0, 'k-s2')], 1)).toBe('k-s3');
    expect(neueSzenenId('k', [], 0)).toBe('k-s1');
  });

  it('entfernen und verschieben (Tausch mit einer geplanten Szene)', () => {
    const liste = [sz(0, 'a'), sz(1, 'b'), sz(2, 'c')];
    expect(szeneEntfernen(liste, 'b').map((s) => s.id)).toEqual(['a', 'c']);
    expect(szeneVerschieben(liste, 'a', 2).map((s) => [s.id, s.index])).toEqual([
      ['c', 0],
      ['b', 1],
      ['a', 2],
    ]);
    expect(szeneVerschieben(liste, 'c', 4).map((s) => [s.id, s.index])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 4],
    ]);
  });

  it('szenenOrdnen löst doppelte Positionen auf', () => {
    expect(szenenOrdnen([sz(1, 'b'), sz(1, 'a'), sz(0, 'x')]).map((s) => [s.id, s.index])).toEqual([
      ['x', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('Anzeige', () => {
  it('zeitKurz', () => {
    expect(zeitKurz(undefined)).toBe('');
    expect(zeitKurz({ sicherheit: 'fest' })).toBe('');
    expect(zeitKurz({ tag: 8, uhrzeit: '23:00', sicherheit: 'fest' })).toBe('Tag 8 · 23:00');
    expect(zeitKurz({ tag: 3, wochentag: 'mittwoch', tageszeit: 'abends', sicherheit: 'ungefaehr' })).toBe('ca. Tag 3 · Mi · abends');
    expect(zeitKurz({ datum: '2026-05-01', sicherheit: 'unklar' })).toBe('1.5.2026 (?)');
  });

  it('uhrzeitNormalisieren', () => {
    expect(uhrzeitNormalisieren('9:05')).toBe('09:05');
    expect(uhrzeitNormalisieren('23.00 Uhr')).toBe('23:00');
    expect(uhrzeitNormalisieren('25:00')).toBeNull();
    expect(uhrzeitNormalisieren('abends')).toBeNull();
  });

  it('Anfang und Sprungbereich liegen wörtlich im Klartext', () => {
    const md = daten.kapitel.ebbe!.text;
    const kt = klartext(md);
    for (const z of szenenZeilen(md, undefined)) {
      const b = szenenSprungBereich(z.abschnitt!)!;
      expect(b).not.toBeNull();
      expect(z.abschnitt!.text.startsWith(kt.slice(b.start, b.ende))).toBe(true);
    }
    expect(szenenAnfang('a b c', 2)).toBe('a b …');
    expect(szenenAnfang('  a\nb ')).toBe('a b');
  });
});
