import { beforeAll, describe, expect, it } from 'vitest';
import type { Erwaehnung, ProjektDaten } from '@core/model/types';
import { ladeDemoProjekt } from '../../../fixtures/demoProjekt';
import { erkanntListe } from './SchreibInspektor';
import { fokusFiguren, notizFarbe, notizKopf } from './ziele';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeDemoProjekt();
});

const e = (ziel: string, zielTyp: 'figur' | 'ort', treffer: string, art: Erwaehnung['art'] = 'unbestimmt'): Erwaehnung => ({
  zielTyp,
  ziel,
  kapitel: 'x',
  absatz: 0,
  start: 0,
  ende: treffer.length,
  treffer,
  art,
  quelle: 'exakt',
  bestaetigt: true,
});

describe('Figuren im Fokus und Notiz-Ziele', () => {
  it('Hauptfigur der Szene ist die Planfigur außer dem Ich-Erzähler', () => {
    const fokus = fokusFiguren(daten.plaene['flut'], daten.figuren);
    expect([...fokus]).toEqual(['lotte']);
    expect(notizFarbe({ typ: 'figur', id: 'lotte' }, fokus)).toBe('rosa');
    expect(notizFarbe({ typ: 'figur', id: 'paul' }, fokus)).toBe('gelb');
  });

  it('beschriftet Notizen wie im Screen', () => {
    expect(notizKopf(daten, { typ: 'figur', id: 'paul' }, 'flut')).toEqual({ praefix: 'Notiz an', name: 'Paul' });
    expect(notizKopf(daten, { typ: 'figur', id: 'lotte' }, 'flut', true)).toEqual({ praefix: 'Neue Notiz an', name: 'Lotte' });
    expect(notizKopf(daten, { typ: 'kapitel', id: 'flut' }, 'flut')).toEqual({ praefix: 'Notiz zum', name: 'Kapitel' });
    expect(notizKopf(daten, { typ: 'ort', id: 'lindenhof' }, 'flut')).toEqual({ praefix: 'Notiz zu', name: 'Lindenhof' });
  });

  it('erkennt abweichende Schreibweisen, nicht aber Genitive', () => {
    const liste = erkanntListe(
      [e('lindenhof', 'ort', 'Linden Hof'), e('paul', 'figur', 'Pauls'), e('ole', 'figur', 'Ole', 'erwaehnt'), e('paul', 'figur', 'Paul')],
      'figur',
      daten,
    );
    expect(liste).toEqual([
      { id: 'paul', name: 'Paul', anzahl: 2, nurErwaehnt: false, variante: null },
      { id: 'ole', name: 'Ole', anzahl: 1, nurErwaehnt: true, variante: null },
    ]);
    expect(erkanntListe([e('lindenhof', 'ort', 'Linden Hof')], 'ort', daten)[0]!.variante).toBe('Linden Hof');
  });
});
