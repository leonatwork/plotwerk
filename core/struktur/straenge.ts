/**
 * Erzählstränge (G2 Plot-Struktur): anlegen, Haupt-/Nebenhandlung, KI-Vorschläge übernehmen oder verwerfen.
 * Besitzer: G2. Rein, ohne DOM und ohne Speichern – der Store schreibt plan/straenge.md, die Kapitelpläne und
 * .plotwerk/strang-vorschlaege.json.
 */
import type { Fadenplanung, Id, KapitelPlan, KiAblage, ProjektDaten, Strang, StrangVorschlag } from '../model/types';
import { leereFadenplanung, standardPlan } from '../projekt/lesen';
import { fadenPlanAendern, fadenSlug, kapitelMitText, type FadenKarte } from './faeden';

/** Farben für neue Stränge (Hex wie in plan/straenge.md; die Anzeige läuft über Tokens). */
export const STRANG_FARBEN = [
  { hex: '#3D5A75', name: 'blau' },
  { hex: '#C2405C', name: 'rosa' },
  { hex: '#A86A12', name: 'ocker' },
  { hex: '#6A4C9C', name: 'violett' },
  { hex: '#2F6B45', name: 'gruen' },
  { hex: '#4A4A4F', name: 'grau' },
] as const;

/** Erste noch nicht benutzte Farbe, sonst reihum. */
export function freieStrangFarbe(straenge: Strang[]): string {
  const frei = STRANG_FARBEN.find((f) => !straenge.some((s) => s.farbe.toLowerCase() === f.hex.toLowerCase()));
  return (frei ?? STRANG_FARBEN[straenge.length % STRANG_FARBEN.length]!).hex;
}

/** Eindeutige Strang-ID aus dem Namen (Slug, bei Bedarf mit Zähler). */
export function neueStrangId(straenge: Strang[], name: string): Id {
  const belegt = new Set(straenge.map((s) => s.id));
  const basis = fadenSlug(name);
  let id = basis;
  for (let i = 2; belegt.has(id); i++) id = `${basis}-${i}`;
  return id;
}

/** Haupthandlung zuerst, dann nicht festgelegte, dann Nebenhandlungen; sonst Reihenfolge der Datei. */
export function straengeSortiert(straenge: Strang[]): Strang[] {
  const rang = (s: Strang) => (s.rolle === 'haupt' ? 0 : s.rolle === 'neben' ? 2 : 1);
  return straenge.map((s, i) => ({ s, i })).sort((a, b) => rang(a.s) - rang(b.s) || a.i - b.i).map((x) => x.s);
}

/** Kapitelplan oder Standardplan (Kapitel ohne Plan-Datei). */
function planVon(daten: ProjektDaten, kapitel: Id): KapitelPlan | null {
  const p = daten.plaene[kapitel];
  if (p) return p;
  const k = daten.kapitel[kapitel];
  return k ? standardPlan(k) : null;
}

/**
 * Noch offene Vorschläge, die zum aktuellen Stand passen: Zuordnungen zu gelöschten Strängen oder schon im Plan
 * eingetragene fallen weg, ebenso neue Stränge, die es inzwischen unter diesem Namen gibt.
 * `kapitel`: nur Vorschläge, die dieses Kapitel betreffen.
 */
export function offeneStrangVorschlaege(daten: ProjektDaten, kapitel?: Id): StrangVorschlag[] {
  const namen = new Set(daten.straenge.map((s) => fadenSlug(s.name)));
  const ids = new Set(daten.straenge.map((s) => s.id));
  return (daten.kiStrangVorschlaege?.eintraege ?? []).filter((v) => {
    if (v.status !== 'neu') return false;
    if (kapitel && !v.kapitel.includes(kapitel)) return false;
    if (v.art === 'zuordnung') {
      const k = v.kapitel[0];
      return !!v.strang && ids.has(v.strang) && !!k && !!daten.kapitel[k] && !daten.plaene[k]?.straenge.includes(v.strang);
    }
    if (v.art === 'neu') return !!v.name && !namen.has(fadenSlug(v.name));
    return true;
  });
}

function mitStatus(ablage: KiAblage<StrangVorschlag>, schluessel: string, teil: Partial<StrangVorschlag>): KiAblage<StrangVorschlag> {
  return { ...ablage, eintraege: ablage.eintraege.map((v) => (v.schluessel === schluessel ? { ...v, ...teil } : v)) };
}

export interface StrangUebernahme {
  /** neue Strangliste (nur bei „neu“ geändert) */
  straenge: Strang[];
  /** geänderte Kapitelpläne */
  plaene: KapitelPlan[];
  ablage: KiAblage<StrangVorschlag>;
  /** angelegter oder zugeordneter Strang */
  strang: Id | null;
}

/**
 * Vorschlag übernehmen. Zuordnung: Strang in den Kapitelplan. Neuer Strang: anlegen (Name, Rolle, Zweck, freie
 * Farbe) und in die Pläne der gewählten Kapitel (`kapitel`, Standard: alle vorgeschlagenen) eintragen.
 * Rückfragen werden über `strangFrageBeantworten` erledigt. null = Vorschlag fehlt oder passt nicht mehr.
 */
export function strangVorschlagUebernehmen(daten: ProjektDaten, schluessel: string, kapitel?: Id[]): StrangUebernahme | null {
  const ablage = daten.kiStrangVorschlaege;
  const v = ablage?.eintraege.find((x) => x.schluessel === schluessel);
  if (!ablage || !v || v.status !== 'neu' || v.art === 'frage') return null;
  const eintragen = (strang: Id, ziele: Id[]): KapitelPlan[] =>
    ziele
      .map((k) => planVon(daten, k))
      .filter((p): p is KapitelPlan => !!p && !p.straenge.includes(strang))
      .map((p) => ({ ...p, straenge: [...p.straenge, strang] }));

  if (v.art === 'zuordnung') {
    if (!v.strang || !daten.straenge.some((s) => s.id === v.strang)) return null;
    return {
      straenge: daten.straenge,
      plaene: eintragen(v.strang, v.kapitel.slice(0, 1)),
      ablage: mitStatus(ablage, schluessel, { status: 'uebernommen' }),
      strang: v.strang,
    };
  }

  const name = v.name?.trim();
  if (!name) return null;
  const id = neueStrangId(daten.straenge, name);
  const strang: Strang = {
    id,
    name,
    farbe: freieStrangFarbe(daten.straenge),
    ...(v.rolle ? { rolle: v.rolle } : {}),
    ...(v.beschreibung ? { beschreibung: v.beschreibung } : {}),
  };
  const ziele = (kapitel ?? v.kapitel).filter((k) => v.kapitel.includes(k));
  return {
    straenge: [...daten.straenge, strang],
    plaene: eintragen(id, ziele),
    ablage: mitStatus(ablage, schluessel, { status: 'uebernommen', angelegt: id }),
    strang: id,
  };
}

/** Vorschlag verwerfen – wird nie wieder vorgeschlagen. */
export function strangVorschlagVerwerfen(ablage: KiAblage<StrangVorschlag>, schluessel: string): KiAblage<StrangVorschlag> {
  return mitStatus(ablage, schluessel, { status: 'verworfen' });
}

/** Rückfrage beantworten; die Antwort geht beim nächsten Lauf mit. Leere Antwort = zurück auf offen. */
export function strangFrageBeantworten(ablage: KiAblage<StrangVorschlag>, schluessel: string, antwort: string): KiAblage<StrangVorschlag> {
  const a = antwort.trim();
  return mitStatus(ablage, schluessel, a ? { status: 'uebernommen', antwort: a } : { status: 'neu', antwort: undefined });
}

// ---------------------------------------------------------------------------
// Faden → Strang: ein von der Prüfung gefundenes loses Ende (z. B. „Der Deloitte-Auftrag“) als Strang übernehmen
// ---------------------------------------------------------------------------

/** Kapitel mit Text, in denen der Faden vorkommt (eröffnet oder aufgegriffen), in Buchreihenfolge. */
export function fadenKapitel(daten: Pick<ProjektDaten, 'projekt' | 'kapitel'>, karte: Pick<FadenKarte, 'eroeffnetIn' | 'aufgegriffenIn'>): Id[] {
  const mitText = kapitelMitText(daten);
  const drin = new Set([karte.eroeffnetIn, ...karte.aufgegriffenIn].filter((k): k is Id => !!k));
  return daten.projekt.kapitel.filter((k) => drin.has(k) && mitText.has(k));
}

/** Fäden ohne Strang, die als Strang taugen (kommen in mindestens einem Kapitel mit Text vor); optional nur die eines Kapitels. */
export function faedenOhneStrang(daten: ProjektDaten, karten: FadenKarte[], kapitel?: Id): FadenKarte[] {
  const ids = new Set(daten.straenge.map((s) => s.id));
  return karten.filter((k) => {
    if (k.strang && ids.has(k.strang)) return false;
    const kap = fadenKapitel(daten, k);
    return kap.length > 0 && (!kapitel || kap.includes(kapitel));
  });
}

export interface FadenAlsStrang {
  straenge: Strang[];
  plaene: KapitelPlan[];
  fadenplanung: Fadenplanung;
  strang: Id;
}

/**
 * Legt aus einem Faden einen Strang an (Name des Fadens, freie Farbe), trägt ihn in die Pläne aller Kapitel ein, in
 * denen der Faden vorkommt, und verbindet den Faden mit dem Strang (plan/faeden.md, Feld `strang`).
 */
export function strangAusFaden(daten: ProjektDaten, karte: FadenKarte): FadenAlsStrang {
  const id = neueStrangId(daten.straenge, karte.name);
  const strang: Strang = { id, name: karte.name, farbe: freieStrangFarbe(daten.straenge), ...(karte.notiz?.trim() ? { beschreibung: karte.notiz.trim() } : {}) };
  const plaene = fadenKapitel(daten, karte)
    .map((k) => planVon(daten, k))
    .filter((p): p is KapitelPlan => !!p)
    .map((p) => ({ ...p, straenge: [...p.straenge, id] }));
  return {
    straenge: [...daten.straenge, strang],
    plaene,
    fadenplanung: fadenPlanAendern(daten.fadenplanung ?? leereFadenplanung(), karte.id, { strang: id }),
    strang: id,
  };
}
