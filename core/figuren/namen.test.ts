import { beforeAll, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import type { ProjektDaten } from '../model/types';
import { ladeProjekt } from '../projekt';
import { figurenSuchen, figurMitNamensform, mitSpitzname, spitznameAusText } from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeProjekt(demoFs());
});

describe('Spitznamen', () => {
  it('aus einer Markierung: ohne Artikel, Anführungszeichen und Satzzeichen am Rand', () => {
    expect(spitznameAusText('dem Alten')).toBe('Alten');
    expect(spitznameAusText('  der  Mann am Kai, ')).toBe('Mann am Kai');
    expect(spitznameAusText('»Kranich«')).toBe('Kranich');
    expect(spitznameAusText('the Stranger.')).toBe('Stranger');
    // nur ein Artikel: bleibt stehen
    expect(spitznameAusText('Die')).toBe('Die');
  });

  it('Figur zu einem Namen: Name, Spitzname oder Form, ohne Artikel und Groß/klein', () => {
    expect(figurMitNamensform(daten, 'ole')?.id).toBe('ole');
    expect(figurMitNamensform(daten, 'Herrn Kessler')?.id).toBe('herr-kessler');
    expect(figurMitNamensform(daten, 'die fremde')?.id).toBe('die-fremde');
    expect(figurMitNamensform(daten, 'Niemand')).toBeUndefined();
  });

  it('Spitzname ergänzen: nur, wenn er neu ist', () => {
    const ole = daten.figuren.ole!;
    expect(mitSpitzname(ole, 'Fensterbank-Ole')?.aliase).toEqual([...ole.aliase, 'Fensterbank-Ole']);
    expect(mitSpitzname(ole, 'OLE')).toBeNull();
    expect(mitSpitzname(ole, '  ')).toBeNull();
  });

  it('Suche: bevorzugte zuerst, dann Treffer am Namensanfang, dann im Namen oder in der Kurzbeschreibung', () => {
    const ids = figurenSuchen(daten, 'o', ['paul']).map((f) => f.id);
    expect(ids[0]).toBe('paul');
    expect(ids.indexOf('ole')).toBeLessThan(ids.indexOf('konrad'));
    expect(figurenSuchen(daten, 'xyz')).toEqual([]);
  });
});
