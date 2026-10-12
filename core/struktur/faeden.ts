/**
 * Fäden-Board und Strang-Raster (G2 Plot-Struktur). Besitzer: G2. Rein, ohne DOM und ohne Speichern.
 *
 * Fäden: lose Enden aus den Analysen (core/index `Faden`) zusammengeführt mit Leons Planung (`plan/faeden.md`,
 * `Fadenplanung`) und dem Status aus `entscheidungen.faeden`. Ein Faden „ruht“, wenn seit seiner letzten
 * Erwähnung mindestens `ruheSchwelle` Kapitel mit Text vergangen sind (geplante Kapitel ohne Text zählen nicht).
 *
 * Strang-Raster: Zeilen = Stränge, Spalten = Kapitel; belegt, wenn der Kapitelplan den Strang führt. Lücken
 * zwischen dem ersten und dem letzten Auftritt zeigen, wo ein Strang verschwindet.
 */
import type { Faden, FadenPlan, Fadenplanung, Id, ProjektDaten } from '../model/types';

export type FadenStatus = Faden['status'];
export type FadenSpalte = 'offen' | 'geplant' | 'erledigt' | 'bewusst_offen';

export const FADEN_SPALTEN: readonly FadenSpalte[] = ['offen', 'geplant', 'erledigt', 'bewusst_offen'];

export const SPALTEN_TITEL: Record<FadenSpalte, string> = {
  offen: 'Offen',
  geplant: 'Auflösung geplant',
  erledigt: 'Erledigt',
  bewusst_offen: 'Bewusst offen',
};

/** Standard, falls plan/faeden.md fehlt (K-02). */
export const RUHE_STANDARD = 3;

export type FadenDaten = Pick<ProjektDaten, 'projekt' | 'kapitel' | 'entscheidungen'> & Partial<Pick<ProjektDaten, 'fadenplanung' | 'plaene'>>;

export interface FadenKarte {
  id: Id;
  name: string;
  /** analyse = aus den KI-Analysen (evtl. mit Planung) · leon = von Leon angelegt */
  quelle: 'analyse' | 'leon';
  eroeffnetIn?: Id;
  aufgegriffenIn: Id[];
  zuletztIn?: Id;
  status: FadenStatus;
  spalte: FadenSpalte;
  plan?: FadenPlan;
  aufloesungIn?: Id;
  strang?: Id;
  notiz?: string;
  /** gültige Ruhe-Schwelle (eigene oder Standard) */
  schwelle: number;
  /** Kapitel mit Text seit der letzten Erwähnung */
  ruhtSeit: number;
  /** offen und ruht mindestens `schwelle` Kapitel */
  ruhend: boolean;
  /** geplante Auflösung liegt im schon geschriebenen Teil, der Faden ist aber noch offen */
  aufloesungVerpasst: boolean;
  /** geplante Auflösung liegt vor der Eröffnung */
  aufloesungZuFrueh: boolean;
}

/** Kapitel-ID → Position in projekt.kapitel. */
function positionen(reihe: readonly Id[]): Map<Id, number> {
  return new Map(reihe.map((id, i) => [id, i]));
}

/** Kapitel mit Text (mindestens ein nicht leeres Zeichen). */
export function kapitelMitText(daten: Pick<ProjektDaten, 'projekt' | 'kapitel'>): Set<Id> {
  return new Set(daten.projekt.kapitel.filter((id) => (daten.kapitel[id]?.text ?? '').trim() !== ''));
}

/** Position des letzten Kapitels mit Text (−1 = noch kein Text). */
export function schreibstand(daten: Pick<ProjektDaten, 'projekt' | 'kapitel'>): number {
  const mitText = kapitelMitText(daten);
  let stand = -1;
  daten.projekt.kapitel.forEach((id, i) => {
    if (mitText.has(id)) stand = i;
  });
  return stand;
}

export function spalteVon(status: FadenStatus, aufloesungIn: Id | undefined): FadenSpalte {
  if (status === 'erledigt') return 'erledigt';
  if (status === 'bewusst_offen') return 'bewusst_offen';
  return aufloesungIn ? 'geplant' : 'offen';
}

/** Alle Fäden als Karten fürs Board, sortiert nach Eröffnung (Leons Fäden ohne Kapitel ans Ende). */
export function fadenKarten(daten: FadenDaten, faeden: readonly Faden[]): FadenKarte[] {
  const reihe = daten.projekt.kapitel;
  const pos = positionen(reihe);
  const mitText = kapitelMitText(daten);
  const stand = schreibstand(daten);
  const planung = daten.fadenplanung;
  const standardSchwelle = Math.max(1, planung?.ruheSchwelle ?? RUHE_STANDARD);
  const plaene = new Map((planung?.faeden ?? []).map((p) => [p.id, p]));
  const status = new Map((daten.entscheidungen?.faeden ?? []).map((f) => [f.id, f.status]));

  const roh: Omit<FadenKarte, 'spalte' | 'schwelle' | 'ruhtSeit' | 'ruhend' | 'aufloesungVerpasst' | 'aufloesungZuFrueh' | 'status'>[] = [];
  const gesehen = new Set<Id>();
  for (const f of faeden) {
    if (gesehen.has(f.id)) continue;
    gesehen.add(f.id);
    const plan = plaene.get(f.id);
    roh.push({
      id: f.id,
      name: f.name || plan?.name || f.id,
      quelle: 'analyse',
      eroeffnetIn: f.eroeffnetIn,
      aufgegriffenIn: f.aufgegriffenIn.filter((k) => k !== f.eroeffnetIn),
      zuletztIn: f.zuletztIn,
      plan,
      aufloesungIn: plan?.aufloesungIn,
      strang: plan?.strang,
      notiz: plan?.notiz,
    });
  }
  for (const plan of planung?.faeden ?? []) {
    if (gesehen.has(plan.id)) continue;
    gesehen.add(plan.id);
    const eroeffnetIn = plan.eroeffnetIn && pos.has(plan.eroeffnetIn) ? plan.eroeffnetIn : undefined;
    roh.push({
      id: plan.id,
      name: plan.name || plan.id,
      quelle: 'leon',
      eroeffnetIn,
      aufgegriffenIn: [],
      zuletztIn: eroeffnetIn,
      plan,
      aufloesungIn: plan.aufloesungIn,
      strang: plan.strang,
      notiz: plan.notiz,
    });
  }

  const karten = roh.map((k): FadenKarte => {
    const st = status.get(k.id) ?? 'offen';
    const schwelle = Math.max(1, k.plan?.ruheSchwelle ?? standardSchwelle);
    const zuletztPos = k.zuletztIn !== undefined ? (pos.get(k.zuletztIn) ?? -1) : -1;
    let ruhtSeit = 0;
    if (zuletztPos >= 0) for (let i = zuletztPos + 1; i <= stand; i++) if (mitText.has(reihe[i]!)) ruhtSeit++;
    const aufloesungPos = k.aufloesungIn !== undefined ? (pos.get(k.aufloesungIn) ?? -1) : -1;
    const eroeffnetPos = k.eroeffnetIn !== undefined ? (pos.get(k.eroeffnetIn) ?? -1) : -1;
    return {
      ...k,
      status: st,
      spalte: spalteVon(st, k.aufloesungIn),
      schwelle,
      ruhtSeit,
      ruhend: st === 'offen' && zuletztPos >= 0 && ruhtSeit >= schwelle,
      aufloesungVerpasst:
        st === 'offen' && aufloesungPos >= 0 && aufloesungPos <= stand && mitText.has(k.aufloesungIn!) && aufloesungPos > zuletztPos,
      aufloesungZuFrueh: aufloesungPos >= 0 && eroeffnetPos >= 0 && aufloesungPos < eroeffnetPos,
    };
  });
  const sortPos = (k: FadenKarte) => (k.eroeffnetIn !== undefined ? (pos.get(k.eroeffnetIn) ?? Infinity) : Infinity);
  return karten.sort((a, b) => sortPos(a) - sortPos(b) || a.name.localeCompare(b.name, 'de'));
}

/** Karten je Spalte (Reihenfolge wie `fadenKarten`). */
export function fadenSpalten(karten: readonly FadenKarte[]): Record<FadenSpalte, FadenKarte[]> {
  const ergebnis: Record<FadenSpalte, FadenKarte[]> = { offen: [], geplant: [], erledigt: [], bewusst_offen: [] };
  for (const k of karten) ergebnis[k.spalte].push(k);
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Kapitelstreifen einer Karte
// ---------------------------------------------------------------------------

export interface StreifenZelle {
  kapitel: Id;
  /** 1-basiert */
  nummer: number;
  eroeffnet: boolean;
  aufgegriffen: boolean;
  aufloesung: boolean;
  /** offen, nach der letzten Erwähnung, Kapitel hat Text */
  ruht: boolean;
  /** Kapitel hat noch keinen Text */
  ohneText: boolean;
}

export function fadenStreifen(karte: FadenKarte, daten: Pick<ProjektDaten, 'projekt' | 'kapitel'>): StreifenZelle[] {
  const reihe = daten.projekt.kapitel;
  const mitText = kapitelMitText(daten);
  const zuletztPos = karte.zuletztIn !== undefined ? reihe.indexOf(karte.zuletztIn) : -1;
  const aufgegriffen = new Set(karte.aufgegriffenIn);
  return reihe.map((id, i) => ({
    kapitel: id,
    nummer: i + 1,
    eroeffnet: id === karte.eroeffnetIn,
    aufgegriffen: aufgegriffen.has(id),
    aufloesung: id === karte.aufloesungIn,
    ruht: karte.status === 'offen' && zuletztPos >= 0 && i > zuletztPos && mitText.has(id),
    ohneText: !mitText.has(id),
  }));
}

// ---------------------------------------------------------------------------
// Fadenplanung ändern (rein; der Store speichert)
// ---------------------------------------------------------------------------

export type FadenPlanTeil = Partial<Omit<FadenPlan, 'id'>>;

const leer = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Planung eines Fadens ändern; leere Felder fallen weg, eine Planung ohne Inhalt wird entfernt. */
export function fadenPlanAendern(planung: Fadenplanung, id: Id, teil: FadenPlanTeil): Fadenplanung {
  const alt = planung.faeden.find((f) => f.id === id);
  const neu: FadenPlan = { ...(alt ?? { id }), ...teil, id };
  for (const k of Object.keys(neu) as (keyof FadenPlan)[]) if (k !== 'id' && leer(neu[k])) delete neu[k];
  if (neu.ruheSchwelle !== undefined) neu.ruheSchwelle = Math.max(1, Math.round(neu.ruheSchwelle));
  const hatInhalt = Object.keys(neu).length > 1;
  const faeden = alt
    ? hatInhalt
      ? planung.faeden.map((f) => (f.id === id ? neu : f))
      : planung.faeden.filter((f) => f.id !== id)
    : hatInhalt
      ? [...planung.faeden, neu]
      : planung.faeden;
  return { ...planung, faeden };
}

/** Slug für Faden-IDs (wie `loseEndeId` der Analysen: ä→ae …, Bindestriche). */
export function fadenSlug(name: string): Id {
  const s = name
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'faden';
}

/** Von Leon angelegter Faden (Name, optional Kapitel der Eröffnung). ID eindeutig gegenüber `vorhandene`. */
export function fadenAnlegen(
  planung: Fadenplanung,
  name: string,
  eroeffnetIn: Id | undefined,
  vorhandene: Iterable<Id>,
): { planung: Fadenplanung; id: Id } {
  const belegt = new Set([...vorhandene, ...planung.faeden.map((f) => f.id)]);
  const basis = fadenSlug(name);
  let id = basis;
  for (let n = 2; belegt.has(id); n++) id = `${basis}-${n}`;
  const plan: FadenPlan = { id, name: name.trim() || id };
  if (eroeffnetIn) plan.eroeffnetIn = eroeffnetIn;
  return { planung: { ...planung, faeden: [...planung.faeden, plan] }, id };
}

export function fadenEntfernen(planung: Fadenplanung, id: Id): Fadenplanung {
  return { ...planung, faeden: planung.faeden.filter((f) => f.id !== id) };
}

/**
 * Was eine Spalte für einen Faden bedeutet: Status und ggf. Auflösung. In „Auflösung geplant“ braucht es ein
 * Kapitel; ohne `aufloesungIn` bleibt die bisherige (oder es gibt keine → null: erst ein Kapitel wählen).
 */
export function spaltenAenderung(
  spalte: FadenSpalte,
  bisher: Id | undefined,
  aufloesungIn?: Id,
): { status: FadenStatus; aufloesungIn: Id | undefined } | null {
  switch (spalte) {
    case 'offen':
      return { status: 'offen', aufloesungIn: undefined };
    case 'geplant': {
      const ziel = aufloesungIn ?? bisher;
      return ziel ? { status: 'offen', aufloesungIn: ziel } : null;
    }
    default:
      return { status: spalte, aufloesungIn: bisher };
  }
}

// ---------------------------------------------------------------------------
// Strang-Raster (Kapitel × Stränge)
// ---------------------------------------------------------------------------

export interface RasterZelle {
  kapitel: Id;
  nummer: number;
  /** der Kapitelplan führt diesen Strang */
  belegt: boolean;
  /** Kapitel ohne Text (nur geplant) */
  ohneText: boolean;
  /** Lücke zwischen erstem und letztem Auftritt des Strangs */
  luecke: boolean;
  /** Lücke ist mindestens so lang wie die Schwelle */
  langeLuecke: boolean;
}

export interface Luecke {
  /** erste und letzte Kapitelnummer (1-basiert) der Lücke */
  von: number;
  bis: number;
  laenge: number;
}

export interface RasterZeile {
  strang: Id;
  zellen: RasterZelle[];
  anzahl: number;
  /** Kapitelnummern (1-basiert) des ersten/letzten Auftritts; 0 = nie */
  erstes: number;
  letztes: number;
  luecken: Luecke[];
  /** Strang endet vor dem letzten Kapitel mit Text (letzter Auftritt < Schreibstand) */
  endetVorStand: boolean;
}

export interface AktSpanne {
  akt: number | null;
  /** Spaltenindex (0-basiert) und Anzahl der Kapitel */
  start: number;
  anzahl: number;
}

export interface StrangRasterDaten {
  kapitel: { id: Id; nummer: number; titel: string; akt: number | null; ohneText: boolean }[];
  akte: AktSpanne[];
  zeilen: RasterZeile[];
  /** Kapitelnummer (1-basiert) des letzten Kapitels mit Text; 0 = noch kein Text */
  stand: number;
}

/** Raster für alle Stränge. `schwelle`: ab dieser Länge ist eine Lücke auffällig (Standard: Ruhe-Schwelle). */
export function strangRaster(daten: Pick<ProjektDaten, 'projekt' | 'kapitel' | 'plaene' | 'straenge'>, schwelle = RUHE_STANDARD): StrangRasterDaten {
  const reihe = daten.projekt.kapitel;
  const mitText = kapitelMitText(daten);
  const stand = schreibstand(daten) + 1;
  const kapitel = reihe.map((id, i) => ({
    id,
    nummer: i + 1,
    titel: daten.plaene[id]?.titel || daten.kapitel[id]?.titel || id,
    akt: daten.plaene[id]?.akt ?? null,
    ohneText: !mitText.has(id),
  }));
  const akte: AktSpanne[] = [];
  kapitel.forEach((k, i) => {
    const letzte = akte[akte.length - 1];
    if (letzte && letzte.akt === k.akt) letzte.anzahl++;
    else akte.push({ akt: k.akt, start: i, anzahl: 1 });
  });
  const grenze = Math.max(1, schwelle);
  const zeilen = daten.straenge.map((s): RasterZeile => {
    const belegt = reihe.map((id) => (daten.plaene[id]?.straenge ?? []).includes(s.id));
    const erstesIdx = belegt.indexOf(true);
    const letztesIdx = belegt.lastIndexOf(true);
    const luecken: Luecke[] = [];
    if (erstesIdx >= 0)
      for (let i = erstesIdx + 1; i < letztesIdx; i++) {
        if (belegt[i]) continue;
        let j = i;
        while (j + 1 < letztesIdx && !belegt[j + 1]) j++;
        luecken.push({ von: i + 1, bis: j + 1, laenge: j - i + 1 });
        i = j;
      }
    const inLuecke = (i: number) => luecken.find((l) => i + 1 >= l.von && i + 1 <= l.bis);
    return {
      strang: s.id,
      zellen: reihe.map((id, i) => {
        const l = inLuecke(i);
        return { kapitel: id, nummer: i + 1, belegt: belegt[i]!, ohneText: !mitText.has(id), luecke: !!l, langeLuecke: !!l && l.laenge >= grenze };
      }),
      anzahl: belegt.filter(Boolean).length,
      erstes: erstesIdx + 1,
      letztes: letztesIdx + 1,
      luecken,
      endetVorStand: letztesIdx >= 0 && letztesIdx + 1 < stand,
    };
  });
  return { kapitel, akte, zeilen, stand };
}
