/** Abgeleitete Daten (Cache, jederzeit neu berechenbar). Besitzer: Kernlogik. */
import { erkenneInText, erkenneKapitel, erkennungsSignatur, schreibweisenHinweise } from '../erkennung';
import type {
  Erwaehnung,
  Faden,
  Hinweis,
  HinweisTyp,
  Id,
  ProjektDaten,
  Realitaet,
  TextAnker,
  Zitat,
} from '../model/types';
import { stimmenHinweise } from '../figuren/stimme';
import { figurenHinweise } from '../figuren/hinweise';
import type { Sprache } from '../i18n';
import { strukturHinweise } from '../struktur';
import { zeitHinweise } from '../zeit';
import { absaetze, absatzIndex, ankerFinden, findeZitat, klartext, textHash, wortzahl, zitatSchluessel, type Bereich } from '../text';

export { HINWEIS_TYP_NAME, HINWEIS_TYP_REIHE, hinweisTypName, hinweisTypNamen } from './hinweisTypen';

export interface Index {
  erwaehnungen: Erwaehnung[];
  /** Figur-/Ort-ID → Kapitel-ID des ersten Vorkommens (Reihenfolge laut projekt.kapitel) */
  erstesVorkommen: Record<Id, Id>;
  faeden: Faden[];
  /** lokale + KI-Hinweise, Entscheidungen angewendet (status), bewusst Vages gefiltert */
  hinweise: Hinweis[];
  wortzahlen: Record<Id, number>;
  /** textHash(kapitel.text) – Markdown-Body des Kapitels */
  textHashes: Record<Id, string>;
  /** Signatur der Namen/Aliase/Schreibweisen der letzten Erkennung (fehlt = alles neu erkennen) */
  erkennungsHash?: string;
}

export const LEERER_INDEX: Index = {
  erwaehnungen: [],
  erstesVorkommen: {},
  faeden: [],
  hinweise: [],
  wortzahlen: {},
  textHashes: {},
};

function reihenfolge(daten: ProjektDaten): Id[] {
  const reihe = [...(daten.projekt?.kapitel ?? [])];
  for (const id of Object.keys(daten.kapitel ?? {})) if (!reihe.includes(id)) reihe.push(id);
  return reihe;
}

const textVon = (daten: ProjektDaten, id: Id): string => daten.kapitel?.[id]?.text ?? '';

function ueberlappt(a: Bereich, b: Bereich): boolean {
  return a.start < b.ende && b.start < a.ende;
}

/** Bestätigte KI-Zuordnungen als Erwähnungen; verworfene entfernen exakte Treffer desselben Ziels an der Stelle. */
function kiZuordnungen(daten: ProjektDaten, exakt: Erwaehnung[]): Erwaehnung[] {
  const ergebnis = [...exakt];
  const verworfen = new Set<Erwaehnung>();
  for (const z of daten.entscheidungen?.zuordnungen ?? []) {
    if (!z.ziel || (z.ziel.typ !== 'figur' && z.ziel.typ !== 'ort')) continue;
    const md = textVon(daten, z.anker.kapitel);
    if (!md) continue;
    const kt = klartext(md);
    const b = ankerFinden(kt, z.anker);
    if (!b) continue;
    const zielTyp = z.ziel.typ;
    const zielId = z.ziel.id;
    const gleiche = ergebnis.filter((e) => e.kapitel === z.anker.kapitel && e.zielTyp === zielTyp && e.ziel === zielId && ueberlappt(e, b));
    if (z.status === 'verworfen') {
      gleiche.filter((e) => e.quelle === 'exakt').forEach((e) => verworfen.add(e));
      continue;
    }
    if (gleiche.length) continue;
    ergebnis.push({
      zielTyp,
      ziel: zielId,
      kapitel: z.anker.kapitel,
      absatz: absatzIndex(absaetze(md), b.start),
      start: b.start,
      ende: b.ende,
      treffer: kt.slice(b.start, b.ende),
      art: 'unbestimmt',
      quelle: 'ki',
      bestaetigt: true,
    });
  }
  return ergebnis.filter((e) => !verworfen.has(e));
}

function faedenBerechnen(daten: ProjektDaten, reihe: Id[]): Faden[] {
  const status = new Map((daten.entscheidungen?.faeden ?? []).map((f) => [f.id, f.status]));
  const faeden = new Map<Id, { name: string; kapitel: Id[]; eroeffnet: Id[] }>();
  for (const id of reihe) {
    const analyse = daten.analysen?.[id];
    if (!analyse) continue;
    for (const ende of analyse.loseEnden ?? []) {
      const f = faeden.get(ende.id) ?? { name: ende.name, kapitel: [], eroeffnet: [] };
      if (!f.kapitel.includes(id)) f.kapitel.push(id);
      if (ende.eroeffnet && !f.eroeffnet.length) {
        f.eroeffnet.push(id);
        f.name = ende.name || f.name;
      }
      faeden.set(ende.id, f);
    }
  }
  const ergebnis: Faden[] = [];
  for (const [id, f] of faeden) {
    const eroeffnetIn = f.eroeffnet[0] ?? f.kapitel[0]!;
    ergebnis.push({
      id,
      name: f.name,
      eroeffnetIn,
      aufgegriffenIn: f.kapitel.filter((k) => k !== eroeffnetIn),
      zuletztIn: f.kapitel[f.kapitel.length - 1]!,
      status: status.get(id) ?? 'offen',
    });
  }
  return ergebnis.sort((a, b) => reihe.indexOf(a.eroeffnetIn) - reihe.indexOf(b.eroeffnetIn));
}

interface Stelle {
  anker: TextAnker;
  stufe: Realitaet;
}

function markierteStellen(daten: ProjektDaten): Stelle[] {
  const stellen: Stelle[] = [];
  for (const plan of Object.values(daten.plaene ?? {}))
    for (const r of plan.realitaet ?? []) if (r.anker) stellen.push({ anker: r.anker, stufe: r.stufe });
  for (const r of daten.entscheidungen?.realitaet ?? []) stellen.push({ anker: r.anker, stufe: r.stufe });
  return stellen;
}

/** Realitätsstufen, die ein Hinweis berührt (beteiligte Figuren und markierte Textstellen). */
function beruehrteStufen(h: Hinweis, daten: ProjektDaten, stellen: Stelle[]): Set<Realitaet> {
  const stufen = new Set<Realitaet>();
  const texte = [h.titel, h.erklaerung, ...h.zitate.map((z) => z.text)];
  for (const t of texte)
    for (const tr of erkenneInText(t, daten))
      if (tr.zielTyp === 'figur') {
        const f = daten.figuren?.[tr.ziel];
        if (f) stufen.add(f.existenz);
      }
  for (const z of h.zitate) {
    const relevante = stellen.filter((s) => s.anker.kapitel === z.kapitel);
    if (!relevante.length) continue;
    const kt = klartext(textVon(daten, z.kapitel));
    const bereiche = findeZitat(kt, z.text);
    for (const s of relevante) {
      const b = ankerFinden(kt, s.anker);
      if (b && bereiche.some((x) => ueberlappt(x, b) || (b.start === b.ende && x.start <= b.start && b.start <= x.ende))) stufen.add(s.stufe);
    }
  }
  return stufen;
}

/** KI-Hinweise erneut prüfen: jedes Zitat muss (normalisiert) im Kapiteltext stehen, sonst fällt der Hinweis weg. */
function kiHinweisGueltig(h: Hinweis, daten: ProjektDaten): boolean {
  if (!h.zitate?.length) return false;
  return h.zitate.every((z) => {
    const md = textVon(daten, z.kapitel);
    return md !== '' && findeZitat(klartext(md), z.text).length > 0;
  });
}

function hinweiseBerechnen(daten: ProjektDaten, sprache: Sprache, erwaehnungen: Erwaehnung[]): Hinweis[] {
  const entscheidungen = new Map((daten.entscheidungen?.hinweise ?? []).map((e) => [e.schluessel, e.entscheidung]));
  const stellen = markierteStellen(daten);
  // lokal berechnet (Struktur, Schreibweisen, Zeitprüfung) bzw. aus eigenen KI-Ablagen (Figurenstimme, bereits geprüft);
  // Titel/Erklärung in der Oberflächensprache, Schlüssel sprachunabhängig
  const lokal = [
    ...strukturHinweise(daten, sprache),
    ...schreibweisenHinweise(daten, sprache),
    ...zeitHinweise(daten, sprache),
    ...stimmenHinweise(daten, sprache),
    ...figurenHinweise(daten, erwaehnungen, sprache),
  ];
  const ki = (daten.kiHinweise ?? [])
    .filter((h) => kiHinweisGueltig(h, daten))
    .map((h) => ({ ...h, quelle: 'ki' as const, schluessel: hinweisSchluessel(h.typ, h.zitate), alterSchluessel: h.schluessel }));

  const ergebnis: Hinweis[] = [];
  const gesehen = new Set<string>();
  for (const roh of [...lokal.map((h) => ({ ...h, alterSchluessel: h.schluessel })), ...ki]) {
    const { alterSchluessel, ...h } = roh;
    if (gesehen.has(h.schluessel)) continue;
    gesehen.add(h.schluessel);
    const status = entscheidungen.get(h.schluessel) ?? entscheidungen.get(alterSchluessel) ?? 'neu';
    const hinweis: Hinweis = { ...h, status };
    if (h.typ !== 'struktur' && h.typ !== 'schreibweise') {
      const stufen = beruehrteStufen(hinweis, daten, stellen);
      if (h.typ === 'pruefen' && stufen.has('bewusst_vage')) continue;
      if (stufen.has('offen') || h.offen) hinweis.offen = true;
    }
    ergebnis.push(hinweis);
  }
  return ergebnis;
}

/**
 * Berechnet den Index; mit `vorher` werden nur Kapitel mit geändertem Hash neu erkannt.
 * `sprache`: Oberflächensprache für Titel/Erklärung der lokalen Hinweise (Schlüssel bleiben gleich).
 */
export function berechneIndex(daten: ProjektDaten, vorher?: Index | null, sprache: Sprache = 'de'): Index {
  const reihe = reihenfolge(daten);
  const erkennungsHash = erkennungsSignatur(daten);
  const wiederverwendbar = !!vorher && vorher.erkennungsHash === erkennungsHash;

  const textHashes: Record<Id, string> = {};
  const wortzahlen: Record<Id, number> = {};
  const exakt: Erwaehnung[] = [];
  for (const id of reihe) {
    const md = textVon(daten, id);
    const hash = textHash(md);
    textHashes[id] = hash;
    if (wiederverwendbar && vorher!.textHashes[id] === hash) {
      wortzahlen[id] = vorher!.wortzahlen[id] ?? wortzahl(md);
      for (const e of vorher!.erwaehnungen) if (e.kapitel === id && e.quelle === 'exakt') exakt.push(e);
    } else {
      wortzahlen[id] = wortzahl(md);
      const k = daten.kapitel?.[id];
      if (k) exakt.push(...erkenneKapitel(k, daten));
    }
  }

  const erwaehnungen = kiZuordnungen(daten, exakt).sort(
    (a, b) =>
      reihe.indexOf(a.kapitel) - reihe.indexOf(b.kapitel) ||
      a.start - b.start ||
      a.ende - b.ende ||
      a.zielTyp.localeCompare(b.zielTyp) ||
      a.ziel.localeCompare(b.ziel),
  );

  const erstesVorkommen: Record<Id, Id> = {};
  for (const e of erwaehnungen) if (!(e.ziel in erstesVorkommen)) erstesVorkommen[e.ziel] = e.kapitel;

  return {
    erwaehnungen,
    erstesVorkommen,
    faeden: faedenBerechnen(daten, reihe),
    hinweise: hinweiseBerechnen(daten, sprache, erwaehnungen),
    wortzahlen,
    textHashes,
    erkennungsHash,
  };
}

/**
 * Ortsfolge einer Figur über alle Kapitel (O-03 „Pauls Weg“): Kapitel, in denen die Figur im Text
 * vorkommt oder laut Kapitelplan dabei ist (Ich-Erzähler wird oft nicht beim Namen genannt), mit den
 * dort im Text erwähnten Orten in Textreihenfolge (je Ort einmal).
 */
export function ortsfolge(index: Index, daten: ProjektDaten, figur: Id): { kapitel: Id; orte: Id[] }[] {
  const ergebnis: { kapitel: Id; orte: Id[] }[] = [];
  for (const id of reihenfolge(daten)) {
    const hier = index.erwaehnungen.filter((e) => e.kapitel === id);
    const imText = hier.some((e) => e.zielTyp === 'figur' && e.ziel === figur);
    const imPlan = daten.plaene?.[id]?.figuren?.includes(figur) ?? false;
    if (!imText && !imPlan) continue;
    const orte: Id[] = [];
    for (const e of hier) if (e.zielTyp === 'ort' && !orte.includes(e.ziel)) orte.push(e.ziel);
    ergebnis.push({ kapitel: id, orte });
  }
  return ergebnis;
}

/** Stabiler Schlüssel eines Hinweises aus Typ und normalisierten Zitaten (Reihenfolge der Zitate egal). */
export function hinweisSchluessel(typ: HinweisTyp, zitate: Zitat[]): string {
  return zitatSchluessel(typ, zitate);
}

/** Ablage des Index (SQLite in der App, Speicher im Browser/Test). */
export interface IndexSpeicher {
  laden(): Promise<Index | null>;
  speichern(index: Index): Promise<void>;
  leeren(): Promise<void>;
}

/** IndexSpeicher im Arbeitsspeicher (Browser-Demo, Tests). Speichert Kopien. */
export class SpeicherIndexSpeicher implements IndexSpeicher {
  private gespeichert: string | null = null;
  async laden(): Promise<Index | null> {
    return this.gespeichert === null ? null : (JSON.parse(this.gespeichert) as Index);
  }
  async speichern(index: Index): Promise<void> {
    this.gespeichert = JSON.stringify(index);
  }
  async leeren(): Promise<void> {
    this.gespeichert = null;
  }
}
