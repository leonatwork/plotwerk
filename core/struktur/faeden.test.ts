import { beforeAll, describe, expect, it } from 'vitest';
import { berechneIndex } from '../index';
import { ladeDemo } from '../index/demoLeser.testhilfe';
import type { Faden, Fadenplanung, ProjektDaten } from '../model/types';
import {
  fadenAnlegen,
  fadenEntfernen,
  fadenKarten,
  fadenPlanAendern,
  fadenSlug,
  fadenSpalten,
  fadenStreifen,
  schreibstand,
  spaltenAenderung,
  strangRaster,
} from './faeden';

let demo: ProjektDaten;
beforeAll(async () => {
  demo = await ladeDemo();
});

/** Kleines Projekt: Kapitel k1…k6, Text in k1–k5 (k6 nur geplant). */
function projekt(teil: Partial<ProjektDaten> = {}): ProjektDaten {
  const ids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
  return {
    ...demo,
    projekt: { ...demo.projekt, kapitel: ids },
    kapitel: Object.fromEntries(ids.map((id) => [id, { id, titel: id.toUpperCase(), text: id === 'k6' ? '' : `Text ${id}.` }])),
    plaene: {},
    entscheidungen: { ...demo.entscheidungen, faeden: [] },
    fadenplanung: { ruheSchwelle: 3, faeden: [] },
    ...teil,
  };
}

const faden = (id: string, eroeffnetIn: string, weitere: string[] = []): Faden => ({
  id,
  name: id.toUpperCase(),
  eroeffnetIn,
  aufgegriffenIn: weitere,
  zuletztIn: weitere[weitere.length - 1] ?? eroeffnetIn,
  status: 'offen',
});

describe('fadenKarten', () => {
  it('Ruhe zählt nur Kapitel mit Text bis zum Schreibstand', () => {
    const d = projekt();
    expect(schreibstand(d)).toBe(4);
    const [a, b] = fadenKarten(d, [faden('a', 'k1'), faden('b', 'k2', ['k3'])]);
    expect(a).toMatchObject({ id: 'a', ruhtSeit: 4, ruhend: true, spalte: 'offen', schwelle: 3 });
    expect(b).toMatchObject({ id: 'b', ruhtSeit: 2, ruhend: false });
  });

  it('eigene Schwelle, Status aus den Entscheidungen, Spalten', () => {
    const d = projekt({
      fadenplanung: { ruheSchwelle: 3, faeden: [{ id: 'b', ruheSchwelle: 2 }, { id: 'c', aufloesungIn: 'k6' }] },
      entscheidungen: { ...demo.entscheidungen, faeden: [{ id: 'd', status: 'erledigt' }, { id: 'e', status: 'bewusst_offen' }] },
    });
    const karten = fadenKarten(d, [faden('b', 'k2', ['k3']), faden('c', 'k1'), faden('d', 'k1'), faden('e', 'k1')]);
    const nach = Object.fromEntries(karten.map((k) => [k.id, k]));
    expect(nach.b).toMatchObject({ schwelle: 2, ruhend: true });
    expect(nach.c).toMatchObject({ spalte: 'geplant', aufloesungIn: 'k6', ruhend: true, aufloesungVerpasst: false });
    expect(nach.d).toMatchObject({ spalte: 'erledigt', ruhend: false });
    expect(nach.e).toMatchObject({ spalte: 'bewusst_offen', ruhend: false });
    const spalten = fadenSpalten(karten);
    expect(spalten.offen.map((k) => k.id)).toEqual(['b']);
    expect(spalten.geplant.map((k) => k.id)).toEqual(['c']);
  });

  it('Auflösung im geschriebenen Teil, Faden noch offen → verpasst; Auflösung vor Eröffnung → zu früh', () => {
    const d = projekt({ fadenplanung: { ruheSchwelle: 3, faeden: [{ id: 'a', aufloesungIn: 'k3' }, { id: 'b', aufloesungIn: 'k1' }] } });
    const [a, b] = fadenKarten(d, [faden('a', 'k1'), faden('b', 'k2')]);
    expect(a!.aufloesungVerpasst).toBe(true);
    expect(b!.aufloesungZuFrueh).toBe(true);
  });

  it('von Leon angelegte Fäden erscheinen mit Name und Eröffnung; ohne Kapitel ganz hinten', () => {
    const d = projekt({
      fadenplanung: {
        ruheSchwelle: 3,
        faeden: [
          { id: 'bleistifte', name: 'Pauls Bleistifte', eroeffnetIn: 'k2' },
          { id: 'frei', name: 'Ohne Kapitel' },
        ],
      },
    });
    const karten = fadenKarten(d, [faden('a', 'k3')]);
    expect(karten.map((k) => [k.id, k.quelle])).toEqual([
      ['bleistifte', 'leon'],
      ['a', 'analyse'],
      ['frei', 'leon'],
    ]);
    expect(karten[0]).toMatchObject({ name: 'Pauls Bleistifte', zuletztIn: 'k2', ruhtSeit: 3, ruhend: true });
    expect(karten[2]).toMatchObject({ ruhtSeit: 0, ruhend: false });
  });

  it('Demo: Fäden aus den Analysen plus Leons Planung', () => {
    const karten = fadenKarten(demo, berechneIndex(demo).faeden);
    const ids = karten.map((k) => k.id);
    expect(ids).toContain('die-fremde-und-die-postkarten');
    expect(ids).toContain('pauls-bleistifte');
    const postkarten = karten.find((k) => k.id === 'die-fremde-und-die-postkarten')!;
    expect(postkarten).toMatchObject({ spalte: 'geplant', aufloesungIn: 'funkstille', strang: 'postkarten', quelle: 'analyse' });
    expect(karten.find((k) => k.id === 'pauls-bleistifte')).toMatchObject({ quelle: 'leon', eroeffnetIn: 'fassade' });
  });
});

describe('fadenStreifen', () => {
  it('markiert Eröffnung, Aufgreifen, Ruhe, Auflösung und Kapitel ohne Text', () => {
    const d = projekt({ fadenplanung: { ruheSchwelle: 3, faeden: [{ id: 'a', aufloesungIn: 'k6' }] } });
    const [k] = fadenKarten(d, [faden('a', 'k1', ['k2'])]);
    const s = fadenStreifen(k!, d);
    expect(s.map((z) => (z.eroeffnet ? 'E' : z.aufgegriffen ? 'A' : z.ruht ? 'r' : z.aufloesung ? 'Z' : '.'))).toEqual(['E', 'A', 'r', 'r', 'r', 'Z']);
    expect(s[5]!.ohneText).toBe(true);
  });
});

describe('Fadenplanung ändern', () => {
  const leer: Fadenplanung = { ruheSchwelle: 3, faeden: [] };

  it('fadenPlanAendern legt an, ergänzt, räumt leere Felder und leere Planungen weg', () => {
    let p = fadenPlanAendern(leer, 'x', { notiz: 'Merken' });
    expect(p.faeden).toEqual([{ id: 'x', notiz: 'Merken' }]);
    p = fadenPlanAendern(p, 'x', { aufloesungIn: 'k3', ruheSchwelle: 2.4 });
    expect(p.faeden).toEqual([{ id: 'x', notiz: 'Merken', aufloesungIn: 'k3', ruheSchwelle: 2 }]);
    p = fadenPlanAendern(p, 'x', { notiz: '  ', aufloesungIn: undefined, ruheSchwelle: undefined });
    expect(p.faeden).toEqual([]);
    expect(fadenPlanAendern(leer, 'y', { notiz: '' }).faeden).toEqual([]);
  });

  it('fadenAnlegen vergibt eine eindeutige ID, fadenEntfernen löscht', () => {
    const a = fadenAnlegen(leer, 'Pauls Bleistifte', 'k2', ['pauls-bleistifte']);
    expect(a.id).toBe('pauls-bleistifte-2');
    expect(a.planung.faeden).toEqual([{ id: 'pauls-bleistifte-2', name: 'Pauls Bleistifte', eroeffnetIn: 'k2' }]);
    expect(fadenEntfernen(a.planung, a.id).faeden).toEqual([]);
    expect(fadenSlug('»Fiete« – Größe!')).toBe('fiete-groesse');
  });

  it('spaltenAenderung', () => {
    expect(spaltenAenderung('offen', 'k3')).toEqual({ status: 'offen', aufloesungIn: undefined });
    expect(spaltenAenderung('geplant', undefined)).toBeNull();
    expect(spaltenAenderung('geplant', undefined, 'k4')).toEqual({ status: 'offen', aufloesungIn: 'k4' });
    expect(spaltenAenderung('geplant', 'k3')).toEqual({ status: 'offen', aufloesungIn: 'k3' });
    expect(spaltenAenderung('erledigt', 'k3')).toEqual({ status: 'erledigt', aufloesungIn: 'k3' });
  });
});

describe('strangRaster', () => {
  it('findet Lücken und lange Lücken; Strang endet vor dem Schreibstand', () => {
    const plaene = Object.fromEntries(
      [
        ['k1', ['s']],
        ['k2', []],
        ['k3', []],
        ['k4', []],
        ['k5', ['s', 't']],
        ['k6', []],
      ].map(([id, straenge]) => [
        id as string,
        { ...demo.plaene.ebbe!, id: id as string, titel: String(id), akt: id === 'k1' || id === 'k2' ? 1 : 2, straenge: straenge as string[] },
      ]),
    );
    const d = projekt({ plaene, straenge: [{ id: 's', name: 'S', farbe: '#000' }, { id: 't', name: 'T', farbe: '#000' }, { id: 'u', name: 'U', farbe: '#000' }] });
    const r = strangRaster(d, 3);
    expect(r.stand).toBe(5);
    expect(r.akte).toEqual([
      { akt: 1, start: 0, anzahl: 2 },
      { akt: 2, start: 2, anzahl: 4 },
    ]);
    const [s, t, u] = r.zeilen;
    expect(s).toMatchObject({ anzahl: 2, erstes: 1, letztes: 5, luecken: [{ von: 2, bis: 4, laenge: 3 }], endetVorStand: false });
    expect(s!.zellen.map((z) => (z.belegt ? 'X' : z.langeLuecke ? 'L' : z.luecke ? 'l' : '.'))).toEqual(['X', 'L', 'L', 'L', 'X', '.']);
    expect(strangRaster(d, 4).zeilen[0]!.zellen[1]).toMatchObject({ luecke: true, langeLuecke: false });
    expect(t).toMatchObject({ anzahl: 1, erstes: 5, letztes: 5, luecken: [] });
    expect(u).toMatchObject({ anzahl: 0, erstes: 0, letztes: 0, endetVorStand: false });
    expect(r.kapitel[5]!.ohneText).toBe(true);
  });

  it('Demo: jeder Strang hat eine Zeile, jedes Kapitel eine Spalte', () => {
    const r = strangRaster(demo);
    expect(r.zeilen).toHaveLength(demo.straenge.length);
    expect(r.kapitel).toHaveLength(demo.projekt.kapitel.length);
    for (const z of r.zeilen) expect(z.zellen).toHaveLength(demo.projekt.kapitel.length);
  });
});
