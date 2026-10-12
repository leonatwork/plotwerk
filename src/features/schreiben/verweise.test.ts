import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ProjektDaten } from '@core/model/types';
import { ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { kapitelVerweise, offeneAnfrage, verweisEinsetzen, verweiseZerlegen, verweisOeffnen, verweisText, verweisVorschlaege, zielName } from './verweise';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemoProjekt();
});

describe('[[-Verweise', () => {
  it('schreibt und liest das Format [[typ:id|Anzeige]]', () => {
    const t = `Mantel beschreiben, vgl. ${verweisText({ typ: 'figur', id: 'lotte' }, 'Lotte')} und ${verweisText({ typ: 'kapitel', id: 'lotte' }, 'Kap. 3 · Lotte')}.`;
    expect(t).toBe('Mantel beschreiben, vgl. [[figur:lotte|Lotte]] und [[kapitel:lotte|Kap. 3 · Lotte]].');
    expect(verweiseZerlegen(t)).toEqual([
      { art: 'text', text: 'Mantel beschreiben, vgl. ' },
      { art: 'verweis', verweis: { typ: 'figur', id: 'lotte' }, anzeige: 'Lotte' },
      { art: 'text', text: ' und ' },
      { art: 'verweis', verweis: { typ: 'kapitel', id: 'lotte' }, anzeige: 'Kap. 3 · Lotte' },
      { art: 'text', text: '.' },
    ]);
    expect(verweiseZerlegen('[[unbekannt:x|y]] [[ort:fischstand]]')).toEqual([
      { art: 'text', text: '[[unbekannt:x|y]] ' },
      { art: 'verweis', verweis: { typ: 'ort', id: 'fischstand' }, anzeige: 'fischstand' },
    ]);
  });

  it('schlägt Figuren, Orte, Kapitel, Plan-Karten und Ideen vor', () => {
    const lotte = verweisVorschlaege(daten, 'lot');
    expect(lotte[0]).toMatchObject({ typ: 'figur', id: 'lotte', anzeige: 'Lotte', art: 'Figur' });
    expect(lotte.some((v) => v.typ === 'kapitel' && v.anzeige === 'Kap. 3 · Lotte')).toBe(true);
    expect(verweisVorschlaege(daten, 'linden')[0]).toMatchObject({ typ: 'ort', id: 'lindenhof' });
    expect(verweisVorschlaege(daten, 'postkarte').some((v) => v.typ === 'idee')).toBe(true);
    expect(verweisVorschlaege(daten, 'trifft lotte').some((v) => v.typ === 'plan' && v.id === 'flut')).toBe(true);
    expect(verweisVorschlaege(daten, 'xyzxyz')).toEqual([]);
  });

  it('ordnet ohne Anfrage nach dem Kontext (wie im Screen: Lotte, Kap. 3 · Lotte, Plan)', () => {
    const v = verweisVorschlaege(daten, '', { typ: 'figur', id: 'lotte' }, 3);
    expect(v.map((x) => [x.anzeige, x.art])).toEqual([
      ['Lotte', 'Figur'],
      ['Kap. 3 · Lotte', 'Kapitel'],
      ['Vorbereitung aufs Treffen mit Lotte', 'Plan'],
    ]);
  });

  it('erkennt die offene Anfrage und setzt den Verweis ein', () => {
    const text = 'Mantel noch beschreiben, vgl. [[lo';
    expect(offeneAnfrage(text, text.length)).toEqual({ start: 30, anfrage: 'lo' });
    expect(offeneAnfrage('[[figur:lotte|Lotte]] x', 21)).toBeNull();
    const vorschlag = verweisVorschlaege(daten, 'lo')[0]!;
    const { text: neu, cursor } = verweisEinsetzen(text, text.length, vorschlag);
    expect(neu).toBe('Mantel noch beschreiben, vgl. [[figur:lotte|Lotte]]');
    expect(cursor).toBe(neu.length);
  });

  it('findet Kapitelverweise in Notizen', () => {
    expect(kapitelVerweise('Bleistift-Motiv: In Kap. 2 klemmt er sich den Bleistift hinters Ohr.', daten)).toEqual(['fassade']);
    expect(kapitelVerweise('siehe [[kapitel:funkstille|Funkstille]] und Kapitel 3', daten)).toEqual(['funkstille', 'lotte']);
    expect(kapitelVerweise('Kap. 99', daten)).toEqual([]);
  });

  it('nennt Ziele und öffnet sie im passenden Bereich', () => {
    expect(zielName(daten, { typ: 'kapitel', id: 'fassade' })).toBe('Kap. 2 · Fassade');
    expect(zielName(daten, { typ: 'figur', id: 'gibt-es-nicht' })).toBeNull();
    const oeffne = vi.fn();
    verweisOeffnen({ oeffne }, { typ: 'figur', id: 'lotte' });
    verweisOeffnen({ oeffne }, { typ: 'ort', id: 'fischstand' });
    verweisOeffnen({ oeffne }, { typ: 'kapitel', id: 'fassade' });
    expect(oeffne.mock.calls).toEqual([
      ['figuren', { figur: 'lotte' }],
      ['orte', { ort: 'fischstand' }],
      ['schreiben', { kapitel: 'fassade' }],
    ]);
  });
});
