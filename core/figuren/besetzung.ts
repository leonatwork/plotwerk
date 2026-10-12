/**
 * F-15 Besetzungsübersicht: Figuren × Kapitel. Je Zelle die wichtigste Art des Vorkommens (tritt auf > per
 * Nachricht > erwähnt > im Text, Art offen) oder „plan“, wenn die Figur nur im Kapitelplan steht. Reine Ableitung
 * aus dem Index, keine eigene Datei.
 */
import type { Erwaehnung, ErwaehnungsArt, Figur, Id, ProjektDaten } from '../model/types';
import { ROLLEN } from './namen';

export type BesetzungsZelle = ErwaehnungsArt | 'plan' | null;

export interface BesetzungsZeile {
  figur: Figur;
  /** je Kapitel (Reihenfolge wie `kapitel`) */
  zellen: BesetzungsZelle[];
  /** erste Erwähnung je Kapitel (zum Springen) */
  erste: (Erwaehnung | null)[];
  /** Kapitel mit Vorkommen im Text */
  anzahl: number;
}

export interface Besetzung {
  kapitel: Id[];
  zeilen: BesetzungsZeile[];
  /** Figuren mit Vorkommen im Text je Kapitel */
  summen: number[];
}

/** Rang der Arten (gleiche Reihenfolge wie im Auftrittsstreifen der Figurenkarte). */
export const ART_RANG: Record<ErwaehnungsArt, number> = { auftritt: 4, nachricht: 3, erwaehnt: 2, unbestimmt: 1 };

export function besetzung(daten: ProjektDaten, erwaehnungen: Erwaehnung[]): Besetzung {
  const kapitel = [...daten.projekt.kapitel];
  const pos = new Map(kapitel.map((id, i) => [id, i]));
  const figuren = Object.values(daten.figuren).sort(
    (a, b) => ROLLEN.indexOf(a.rolle) - ROLLEN.indexOf(b.rolle) || a.name.localeCompare(b.name, 'de'),
  );
  const zeilen = new Map<Id, BesetzungsZeile>(
    figuren.map((f) => [f.id, { figur: f, zellen: kapitel.map(() => null), erste: kapitel.map(() => null), anzahl: 0 }]),
  );
  for (const e of erwaehnungen) {
    if (e.zielTyp !== 'figur') continue;
    const z = zeilen.get(e.ziel);
    const i = pos.get(e.kapitel);
    if (!z || i === undefined) continue;
    const alt = z.zellen[i];
    if (!alt || alt === 'plan' || ART_RANG[e.art] > ART_RANG[alt]) z.zellen[i] = e.art;
    if (!z.erste[i] || e.start < z.erste[i]!.start) z.erste[i] = e;
  }
  kapitel.forEach((id, i) => {
    for (const f of daten.plaene[id]?.figuren ?? []) {
      const z = zeilen.get(f);
      if (z && !z.zellen[i]) z.zellen[i] = 'plan';
    }
  });
  const summen = kapitel.map(() => 0);
  for (const z of zeilen.values()) {
    z.zellen.forEach((c, i) => {
      if (c && c !== 'plan') {
        z.anzahl += 1;
        summen[i]! += 1;
      }
    });
  }
  return { kapitel, zeilen: [...zeilen.values()], summen };
}
