import { beforeAll, describe, expect, it } from 'vitest';
import { demoFs } from '../../fixtures/demoProjekt';
import { berechneIndex } from '../index/index';
import type { BogenStufe, Erwaehnung, Figurenbogen, ProjektDaten } from '../model/types';
import { ladeProjekt, parseBoegen, serializeBoegen } from '../projekt';
import {
  aktGruppen,
  auftritteJeKapitel,
  belegAusStelle,
  belegAusZitat,
  belegGefunden,
  belegVorschlaege,
  bogenVon,
  gleicherAnker,
  kapitelTitel,
  naechstesKapitel,
  neueStufenId,
  setzeBogen,
  sortiereStufen,
  stufeImKapitel,
  stufenMeldungen,
  stufenOrt,
  stufenSpanne,
  stufenSpuren,
  stufeVerschieben,
} from './index';

let daten: ProjektDaten;
beforeAll(async () => {
  daten = await ladeProjekt(demoFs());
});

const stufe = (teil: Partial<BogenStufe> & { id: string }): BogenStufe => ({ titel: teil.id, belege: [], ...teil });

describe('core/figuren – Bögen', () => {
  it('liest den Bogen aus plan/boegen.md und schreibt ihn unverändert zurück', () => {
    const paul = bogenVon(daten.boegen, 'paul');
    expect(paul.stufen.map((s) => s.id)).toEqual(['im-lot', 'risse', 'schlaflos']);
    expect(bogenVon(daten.boegen, 'ole')).toEqual({ figur: 'ole', stufen: [] });
    const text = serializeBoegen(daten.boegen!);
    expect(parseBoegen(text)).toEqual(daten.boegen);
  });

  it('setzt Bögen: ersetzen, anhängen, leerer Bogen fällt weg', () => {
    const neu: Figurenbogen = { figur: 'ole', stufen: [stufe({ id: 'a', kapitel: 'grundriss' })] };
    const mitOle = setzeBogen(daten.boegen, neu);
    expect(mitOle.map((b) => b.figur)).toEqual(['paul', 'lotte', 'ole']);
    const ersetzt = setzeBogen(mitOle, { ...neu, stufen: [stufe({ id: 'b' })] });
    expect(bogenVon(ersetzt, 'ole').stufen[0]!.id).toBe('b');
    expect(setzeBogen(ersetzt, { figur: 'lotte', stufen: [] }).map((b) => b.figur)).toEqual(['paul', 'ole']);
    expect(setzeBogen(undefined, neu)).toEqual([neu]);
  });

  it('erzeugt stabile, eindeutige Stufen-IDs aus dem Titel', () => {
    const bogen = bogenVon(daten.boegen, 'paul');
    expect(neueStufenId(bogen, 'Verlust über Größe')).toBe('verlust-ueber-groesse');
    expect(neueStufenId(bogen, 'Im Lot')).toBe('im-lot-2');
    expect(neueStufenId(bogen, '???')).toBe('stufe');
  });

  it('Spanne, Ort und Reihenfolge: Kapitel- und Akt-Stufen', () => {
    const [imLot, risse, schlaflos] = bogenVon(daten.boegen, 'paul').stufen as [BogenStufe, BogenStufe, BogenStufe];
    const reihe = daten.projekt.kapitel;
    expect(stufenSpanne(daten, imLot)).toEqual({ von: reihe.indexOf('lotte'), bis: reihe.indexOf('lotte') });
    expect(stufenSpanne(daten, schlaflos)).toEqual({ von: reihe.indexOf('flut'), bis: reihe.indexOf('funkstille') });
    expect(stufenSpanne(daten, stufe({ id: 'x' }))).toBeNull();
    expect(stufenSpanne(daten, stufe({ id: 'x', kapitel: 'gibt-es-nicht' }))).toBeNull();
    expect(stufenOrt(daten, risse)).toBe(`Kap. ${reihe.indexOf('ebbe') + 1}`);
    expect(stufenOrt(daten, schlaflos)).toBe('Akt III');
    expect(stufenOrt(daten, stufe({ id: 'x' }))).toBe('ohne Kapitel');
    const ohne = stufe({ id: 'ohne' });
    expect(sortiereStufen(daten, [ohne, schlaflos, risse, imLot]).map((s) => s.id)).toEqual(['im-lot', 'risse', 'schlaflos', 'ohne']);
  });

  it('verschiebt Stufen um ein Kapitel bzw. einen Akt, am Rand nicht', () => {
    const reihe = daten.projekt.kapitel;
    const erste = stufe({ id: 'a', kapitel: reihe[0]! });
    expect(stufeVerschieben(daten, erste, -1)).toBeNull();
    expect(stufeVerschieben(daten, erste, 1)?.kapitel).toBe(reihe[1]);
    expect(stufeVerschieben(daten, stufe({ id: 'b', akt: 2 }), 1)?.akt).toBe(3);
    expect(stufeVerschieben(daten, stufe({ id: 'b', akt: 3 }), 1)).toBeNull();
    expect(stufeVerschieben(daten, stufe({ id: 'c' }), 1)).toBeNull();
  });

  it('schlägt als nächstes Kapitel das nach der letzten Stufe vor', () => {
    const reihe = daten.projekt.kapitel;
    expect(naechstesKapitel(daten, { figur: 'ole', stufen: [] })).toBe(reihe[0]);
    expect(naechstesKapitel(daten, { figur: 'x', stufen: [stufe({ id: 'a', kapitel: 'ebbe' })] })).toBe(reihe[reihe.indexOf('ebbe') + 1]);
    // nach der Akt-III-Stufe gibt es kein Kapitel mehr → letztes Kapitel
    expect(naechstesKapitel(daten, bogenVon(daten.boegen, 'paul'))).toBe(reihe[reihe.length - 1]);
  });

  it('verteilt überlappende Stufen auf Spuren', () => {
    const r = stufenSpuren(daten, [
      stufe({ id: 'akt1', akt: 1 }),
      stufe({ id: 'lotte', kapitel: 'lotte' }),
      stufe({ id: 'ebbe', kapitel: 'ebbe' }),
      stufe({ id: 'ohne' }),
    ]);
    expect(r.spuren).toBe(2);
    expect(r.plaetze.map((p) => [p.stufe.id, p.spur])).toEqual([
      ['akt1', 0],
      ['lotte', 1],
      ['ebbe', 0],
    ]);
    const i = (k: string) => daten.projekt.kapitel.indexOf(k);
    // „gilt bis“: Akt I bis vor Lotte (nächste Stufe), Lotte bis vor Ebbe, Ebbe bis zum Buchende
    expect(r.plaetze.map((p) => p.giltBis)).toEqual([i('regatta'), i('ebbe') - 1, daten.projekt.kapitel.length - 1]);
    expect(stufenSpuren(daten, []).spuren).toBe(1);
  });

  it('Akt-Gruppen für die Kopfzeile und Kapiteltitel', () => {
    const g = aktGruppen(daten);
    expect(g.map((x) => x.titel)).toEqual(['Akt I', 'Akt II', 'Akt III']);
    expect(g[0]).toMatchObject({ akt: 1, von: 0, bis: 3 });
    expect(g[2]!.bis).toBe(daten.projekt.kapitel.length - 1);
    expect(kapitelTitel(daten, 'regatta')).toBe('Regatta');
    expect(kapitelTitel(daten, 'ebbe')).toBe('Ebbe');
  });

  it('Auftritte je Kapitel aus den Erwähnungen (nur exakt oder bestätigt, wichtigste Art)', () => {
    const e = (kapitel: string, start: number, art: Erwaehnung['art'], quelle: Erwaehnung['quelle'] = 'exakt', bestaetigt = false): Erwaehnung => ({
      zielTyp: 'figur',
      ziel: 'paul',
      kapitel,
      absatz: 0,
      start,
      ende: start + 3,
      treffer: 'Paul',
      art,
      quelle,
      bestaetigt,
    });
    const m = auftritteJeKapitel(
      [e('ebbe', 50, 'erwaehnt'), e('ebbe', 10, 'auftritt'), e('lotte', 5, 'nachricht', 'ki'), e('funkstille', 7, 'erwaehnt', 'ki', true), { ...e('ebbe', 1, 'auftritt'), ziel: 'ole' }],
      'paul',
    );
    expect([...m.keys()]).toEqual(['ebbe', 'funkstille']);
    expect(m.get('ebbe')).toMatchObject({ anzahl: 2, art: 'auftritt' });
    expect(m.get('ebbe')!.erste.start).toBe(10);
  });

  it('Belege aus Zitat und Stelle, Fundprüfung (E4/E6)', () => {
    const ok = belegAusZitat(daten, 'ebbe', 'er rührt sich nicht');
    expect('anker' in ok && ok.anker.exakt).toBe('er rührt sich nicht');
    // Normalisierung: gerade Anführungszeichen treffen typografische
    const norm = belegAusZitat(daten, 'ebbe', 'er verspricht: "Ich melde mich bei Dir!"');
    expect('anker' in norm).toBe(true);
    expect(belegAusZitat(daten, 'ebbe', 'er geht sofort los')).toEqual({ fehler: `Die Stelle steht so nicht in Kap. ${daten.projekt.kapitel.indexOf('ebbe') + 1}.` });
    expect(belegAusZitat(daten, 'regatta', 'egal')).toMatchObject({ fehler: expect.stringContaining('noch keinen Text') });
    expect(belegAusZitat(daten, 'ebbe', 'er')).toEqual({ fehler: 'Das Zitat ist zu kurz.' });

    const satz = belegAusStelle(daten, 'staub', 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen. An der'.length - 3, 'Im Kornspeicher liegt der Staub von hundert Jahren auf den Dielen. An der'.length);
    expect(satz.exakt).toBe('An der Tür hängt ein Schild mit der Aufschrift BETRETEN VERBOTEN.');
    expect(belegGefunden(daten, satz)).toBe(true);
    expect(belegGefunden(daten, { ...satz, exakt: 'Paul steht auf.' })).toBe(false);
    expect(gleicherAnker(satz, { ...satz })).toBe(true);
    expect(gleicherAnker(satz, { ...satz, davor: 'x' })).toBe(false);
  });

  it('Belegvorschläge: Sätze mit der Figur im Kapitel, je Satz einmal', () => {
    const index = berechneIndex(daten);
    const v = belegVorschlaege(daten, index.erwaehnungen, 'paul', 'staub');
    expect(v.length).toBeGreaterThan(1);
    expect(v.every((a) => a.kapitel === 'staub' && belegGefunden(daten, a))).toBe(true);
    expect(new Set(v.map((a) => a.exakt)).size).toBe(v.length);
    expect(belegVorschlaege(daten, index.erwaehnungen, 'paul', 'staub', 1)).toHaveLength(1);
  });

  it('Meldungen einer Stufe und Stufe im Kapitel', () => {
    const index = berechneIndex(daten);
    const auftritte = auftritteJeKapitel(index.erwaehnungen, 'lotte');
    expect(stufenMeldungen(daten, stufe({ id: 'x' }), auftritte)).toEqual([{ art: 'ohne_platz' }]);
    expect(stufenMeldungen(daten, stufe({ id: 'x', kapitel: 'staub' }), auftritte)).toEqual([{ art: 'kein_auftritt', kapitel: 'staub' }]);
    // kein Text → keine Auftritts-Meldung
    expect(stufenMeldungen(daten, stufe({ id: 'x', kapitel: 'regatta' }), auftritte)).toEqual([]);
    const verwaist = stufe({ id: 'x', kapitel: 'lotte', belege: [{ kapitel: 'lotte', exakt: 'gibt es nicht', davor: '', danach: '' }] });
    expect(stufenMeldungen(daten, verwaist, auftritte)).toEqual([{ art: 'verwaist', anzahl: 1 }]);

    const paul = bogenVon(daten.boegen, 'paul');
    expect(stufeImKapitel(daten, paul, 'grundriss')).toBeUndefined();
    expect(stufeImKapitel(daten, paul, 'staub')?.id).toBe('im-lot');
    expect(stufeImKapitel(daten, paul, 'funkstille')?.id).toBe('schlaflos');
  });
});
