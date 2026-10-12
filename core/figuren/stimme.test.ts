import { beforeAll, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type { Entscheidungen, KiAblage, ProjektDaten, StimmenBeobachtung } from '../model/types';
import { ladeProjekt } from '../projekt';
import {
  leereStimmen,
  mischeStimmen,
  offeneStimmen,
  redeDerFigur,
  setzeStimmenStatus,
  stimmeGueltig,
  stimmenDerFigur,
  stimmenHinweise,
  stimmenStatus,
} from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeProjekt(demoFs());
});

const b = (schluessel: string, teil: Partial<StimmenBeobachtung> = {}): StimmenBeobachtung => ({
  schluessel,
  figur: 'paul',
  kapitel: 'staub',
  titel: `Beobachtung ${schluessel}`,
  erklaerung: 'Klingt anders.',
  zitate: [{ kapitel: 'staub', text: 'Paul sieht nicht vom Zollstock auf und sagt nur: „Achtzehn auf jeder Seite.“' }],
  vergleich: [{ kapitel: 'grundriss', text: 'Ein Haus muss man in die Hand nehmen können, sagt er.' }],
  status: 'neu',
  ...teil,
});

const keineEntscheidungen: Entscheidungen = { hinweise: [], faeden: [] } as unknown as Entscheidungen;

describe('core/figuren – Figurenstimme (Ablage)', () => {
  it('Status: Entscheidung in entscheidungen.json hat Vorrang', () => {
    const e = { ...keineEntscheidungen, hinweise: [{ schluessel: 'a', entscheidung: 'absicht' }] } as Entscheidungen;
    expect(stimmenStatus(b('a'), e)).toBe('absicht');
    expect(stimmenStatus(b('a', { status: 'erledigt' }), undefined)).toBe('erledigt');
    expect(stimmenStatus(b('x'), e)).toBe('neu');
  });

  it('mischt einen Lauf: Offenes dieser Figur wird ersetzt, Entschiedenes bleibt und kommt nicht wieder, andere Figuren unberührt', () => {
    const ablage: KiAblage<StimmenBeobachtung> = {
      version: 1,
      eintraege: [b('alt-offen'), b('alt-erledigt', { status: 'erledigt' }), b('per-datei'), b('konrad', { figur: 'konrad' })],
    };
    const e = { ...keineEntscheidungen, hinweise: [{ schluessel: 'per-datei', entscheidung: 'absicht' }] } as Entscheidungen;
    const lauf = { datum: '2026-10-10T10:00:00.000Z', modell: 'test' };
    const r = mischeStimmen(ablage, 'paul', [b('alt-offen'), b('neu-1'), b('neu-1'), b('alt-erledigt'), b('per-datei')], lauf, e);
    expect(r.neu).toBe(1);
    expect(r.bereitsEntschieden).toBe(2);
    expect(r.ablage.eintraege.map((x) => x.schluessel).sort()).toEqual(['alt-erledigt', 'alt-offen', 'konrad', 'neu-1', 'per-datei']);
    expect(r.ablage.lauf).toEqual(lauf);
    // Lauf ohne Ergebnis: offene Beobachtungen der Figur verschwinden
    const leer = mischeStimmen(r.ablage, 'paul', [], undefined, e);
    expect(leer.ablage.eintraege.map((x) => x.schluessel).sort()).toEqual(['alt-erledigt', 'konrad', 'per-datei']);
    expect(mischeStimmen(undefined, 'paul', [b('n')]).ablage).toEqual({ version: 1, eintraege: [b('n')] });
  });

  it('setzt und löscht den Status in der Ablage', () => {
    const a = { version: 1 as const, eintraege: [b('a'), b('b')] };
    const erledigt = setzeStimmenStatus(a, 'a', 'erledigt');
    expect(erledigt.eintraege.map((x) => x.status)).toEqual(['erledigt', 'neu']);
    expect(setzeStimmenStatus(erledigt, 'a', null).eintraege[0]!.status).toBe('neu');
    expect(setzeStimmenStatus(undefined, 'a', 'absicht')).toEqual(leereStimmen());
  });

  it('Gültigkeit: alle Zitate (auffällig und Vergleich) müssen noch im Text stehen', () => {
    expect(stimmeGueltig(daten, b('a'))).toBe(true);
    expect(stimmeGueltig(daten, b('a', { vergleich: [{ kapitel: 'grundriss', text: 'Paul schweigt.' }] }))).toBe(false);
    expect(stimmeGueltig(daten, b('a', { zitate: [] }))).toBe(false);
  });

  it('Beobachtungen der Figur, offene Zahl und Hinweise (Typ „sprache“, Quelle KI)', () => {
    const d: ProjektDaten = {
      ...daten,
      kiStimmen: {
        version: 1,
        eintraege: [
          b('funkstille', { kapitel: 'funkstille', zitate: [{ kapitel: 'funkstille', text: 'Paul dreht leiser.' }] }),
          b('staub'),
          b('weg', { zitate: [{ kapitel: 'staub', text: 'Paul tanzt.' }] }),
          b('entschieden', { status: 'absicht' }),
          b('konrad', { figur: 'konrad' }),
        ],
      },
    };
    const liste = stimmenDerFigur(d, 'paul');
    expect(liste.map((x) => x.beobachtung.schluessel)).toEqual(['staub', 'weg', 'entschieden', 'funkstille']);
    expect(liste.find((x) => x.beobachtung.schluessel === 'weg')!.gueltig).toBe(false);
    expect(offeneStimmen(d, 'paul')).toBe(2);
    expect(offeneStimmen(d)).toBe(3);
    const h = stimmenHinweise(d);
    expect(h.map((x) => x.schluessel)).not.toContain('weg');
    const t = h.find((x) => x.schluessel === 'staub')!;
    expect(t).toMatchObject({ typ: 'sprache', quelle: 'ki', status: 'neu', titel: 'Stimme von Paul: Beobachtung staub' });
    expect(t.zitate).toHaveLength(2);
    expect(h.find((x) => x.schluessel === 'entschieden')!.status).toBe('absicht');
  });

  it('lokale Redeübersicht einer Figur', () => {
    const paul = redeDerFigur(daten, 'paul');
    expect(paul.stellen.some((s) => s.text === 'Achtzehn auf jeder Seite.')).toBe(true);
    expect(paul.kapitel).toContain('staub');
    expect(redeDerFigur(daten, 'herr-kessler').stellen).toEqual([]);
  });
});
