/**
 * Figurenstimme (G3): Ablage der KI-Beobachtungen (.plotwerk/stimmen.json), Status, Hinweise.
 * Besitzer: G3 Figuren. Reines TypeScript ohne DOM/Tauri.
 *
 * Status: Leons Entscheidung steht – wie bei allen Hinweisen – in entscheidungen.json (Schlüssel der Beobachtung)
 * und hat Vorrang; der Status in der Ablage wird mitgeführt. Entschiedenes kommt bei einem neuen Lauf nicht wieder.
 */
import type { Entscheidungen, Hinweis, Id, KiAblage, ProjektDaten, StimmenBeobachtung } from '../model/types';
import { redestellen, redestellenDerFigur, type Redestelle } from '../ki/stimmeRede';
import { findeZitat, klartext } from '../text';

export type StimmenStatus = StimmenBeobachtung['status'];

export function leereStimmen(): KiAblage<StimmenBeobachtung> {
  return { version: 1, eintraege: [] };
}

/** Status mit Leons Entscheidung (entscheidungen.json hat Vorrang). */
export function stimmenStatus(b: StimmenBeobachtung, e: Entscheidungen | undefined): StimmenStatus {
  return e?.hinweise.find((h) => h.schluessel === b.schluessel)?.entscheidung ?? b.status;
}

/**
 * Ergebnis eines Laufs für eine Figur in die Ablage mischen: Offene Beobachtungen dieser Figur werden durch den
 * neuen Lauf ersetzt; Entschiedenes bleibt und wird nicht erneut gemeldet; andere Figuren bleiben unberührt.
 */
export function mischeStimmen(
  ablage: KiAblage<StimmenBeobachtung> | undefined,
  figur: Id,
  neu: StimmenBeobachtung[],
  lauf?: KiAblage<StimmenBeobachtung>['lauf'],
  entscheidungen?: Entscheidungen,
): { ablage: KiAblage<StimmenBeobachtung>; neu: number; bereitsEntschieden: number } {
  const a = ablage ?? leereStimmen();
  const andere = a.eintraege.filter((b) => b.figur !== figur);
  const entschieden = a.eintraege.filter((b) => b.figur === figur && stimmenStatus(b, entscheidungen) !== 'neu');
  const entschiedenSchluessel = new Set(entschieden.map((b) => b.schluessel));
  for (const h of entscheidungen?.hinweise ?? []) entschiedenSchluessel.add(h.schluessel);
  const vorher = new Set(a.eintraege.filter((b) => b.figur === figur).map((b) => b.schluessel));
  const offen: StimmenBeobachtung[] = [];
  let bereitsEntschieden = 0;
  let zahl = 0;
  for (const b of neu) {
    if (entschiedenSchluessel.has(b.schluessel)) {
      bereitsEntschieden++;
      continue;
    }
    if (offen.some((x) => x.schluessel === b.schluessel)) continue;
    offen.push({ ...b, status: 'neu' });
    if (!vorher.has(b.schluessel)) zahl++;
  }
  return {
    ablage: { ...a, version: 1, eintraege: [...andere, ...entschieden, ...offen], ...(lauf ? { lauf } : {}) },
    neu: zahl,
    bereitsEntschieden,
  };
}

/** Ablage mit geändertem Status einer Beobachtung (null = zurück auf „neu“). */
export function setzeStimmenStatus(
  ablage: KiAblage<StimmenBeobachtung> | undefined,
  schluessel: string,
  status: Exclude<StimmenStatus, 'neu'> | null,
): KiAblage<StimmenBeobachtung> {
  const a = ablage ?? leereStimmen();
  return { ...a, eintraege: a.eintraege.map((b) => (b.schluessel === schluessel ? { ...b, status: status ?? 'neu' } : b)) };
}

/** Stehen alle Zitate (auffällig und Vergleich) noch wörtlich im Text? */
export function stimmeGueltig(daten: ProjektDaten, b: StimmenBeobachtung): boolean {
  if (b.zitate.length === 0) return false;
  return [...b.zitate, ...b.vergleich].every((z) => {
    const md = daten.kapitel[z.kapitel]?.text;
    return !!md && findeZitat(klartext(md), z.text).length > 0;
  });
}

export interface StimmenEintrag {
  beobachtung: StimmenBeobachtung;
  status: StimmenStatus;
  /** false = mindestens ein Zitat steht nicht mehr im Text (Text wurde geändert) */
  gueltig: boolean;
}

/** Beobachtungen einer Figur in Buchreihenfolge mit Status und Gültigkeit. */
export function stimmenDerFigur(daten: ProjektDaten, figur: Id): StimmenEintrag[] {
  const reihe = daten.projekt.kapitel;
  return (daten.kiStimmen?.eintraege ?? [])
    .filter((b) => b.figur === figur)
    .map((beobachtung) => ({
      beobachtung,
      status: stimmenStatus(beobachtung, daten.entscheidungen),
      gueltig: stimmeGueltig(daten, beobachtung),
    }))
    .sort((a, b) => reihe.indexOf(a.beobachtung.kapitel) - reihe.indexOf(b.beobachtung.kapitel));
}

/** Anzahl offener (neu + gültig) Beobachtungen, optional nur für eine Figur. */
export function offeneStimmen(daten: ProjektDaten, figur?: Id): number {
  return (daten.kiStimmen?.eintraege ?? []).filter(
    (b) => (!figur || b.figur === figur) && stimmenStatus(b, daten.entscheidungen) === 'neu' && stimmeGueltig(daten, b),
  ).length;
}

/**
 * Beobachtungen als Hinweise (Typ „sprache“, Quelle KI) für die Hinweise-Ansicht. Schlüssel = Schlüssel der
 * Beobachtung, damit „Ist Absicht“/„Erledigt“ in beiden Ansichten gilt. Ungültige (Zitat nicht mehr im Text) fallen weg.
 */
export function stimmenHinweise(daten: ProjektDaten): Hinweis[] {
  return (daten.kiStimmen?.eintraege ?? [])
    .filter((b) => stimmeGueltig(daten, b))
    .map((b) => {
      const name = daten.figuren[b.figur]?.name ?? b.figur;
      return {
        schluessel: b.schluessel,
        typ: 'sprache' as const,
        titel: `Stimme von ${name}: ${b.titel}`,
        zitate: [...b.zitate, ...b.vergleich],
        erklaerung: `${b.erklaerung} (Erste Zitate: die auffällige Stelle, danach typische Stellen zum Vergleich.)`,
        quelle: 'ki' as const,
        status: stimmenStatus(b, daten.entscheidungen),
      };
    });
}

export interface RedeUebersicht {
  /** mögliche Redestellen der Figur (lokale Heuristik) */
  stellen: Redestelle[];
  /** Kapitel mit Rede der Figur */
  kapitel: Id[];
}

/** Lokale Übersicht über die Rede einer Figur (ohne KI, Zuordnung über Nennung im selben Absatz). */
export function redeDerFigur(daten: ProjektDaten, figur: Id): RedeUebersicht {
  const kap = daten.projekt.kapitel.map((id) => ({ id, text: klartext(daten.kapitel[id]?.text ?? '') }));
  const figuren = Object.values(daten.figuren).map((f) => ({ id: f.id, namen: [f.name, ...f.aliase, ...(f.formen ?? [])] }));
  const stellen = redestellenDerFigur(redestellen(kap, figuren), figur);
  return { stellen, kapitel: [...new Set(stellen.map((s) => s.kapitel))] };
}
