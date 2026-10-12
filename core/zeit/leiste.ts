/**
 * Einheiten der Zeitleiste (Kapitel bzw. Szenen) und ihre Anordnung auf der Tages-Achse (G1).
 *
 * Reihenfolge auf der Achse: Handlungstag, dann Minute im Erzähltag; Einheiten ohne Uhrzeit/Tageszeit
 * bleiben hinter der vorigen Einheit desselben Tags (Lesereihenfolge). Einheiten ohne Tag stehen direkt
 * hinter der Einheit, nach der sie gelesen werden, in einer Spalte „Abstand unbekannt“.
 */
import type { Sprache } from '../i18n';
import type { Id, KapitelPlan, ProjektDaten, Szene, Wochentag, Zeitpunkt } from '../model/types';
import { beginnVon, effektiverTag, erwarteterWochentag, erwartetesDatum, tagesMinute, type Beginn } from './zeitpunkt';

export interface ZeitEinheit {
  /** „<kapitel>“ bzw. „<kapitel>#<szene>“ */
  schluessel: string;
  kapitel: Id;
  szene?: Id;
  /** Kapitelnummer (1-basiert, Lesereihenfolge) */
  nr: number;
  /** Szenennummer im Kapitel (1-basiert) */
  szenenNr?: number;
  /** Kapitel- bzw. Szenentitel */
  titel: string;
  /** Szene ohne eigenen Titel (`titel` ist dann der deutsche Platzhalter „Szene n“, siehe szenenPlatzhalter) */
  ohneTitel?: boolean;
  kapitelTitel: string;
  /** von Leon eingetragener Zeitpunkt dieser Einheit */
  eigen?: Zeitpunkt;
  /** wirksamer Zeitpunkt: der eigene, bei Szenen ohne eigenen sonst Tag/Wochentag/Datum des Kapitels */
  zeit?: Zeitpunkt;
  /** Zeitpunkt (teilweise) vom Kapitel übernommen */
  geerbt: boolean;
  /** Handlungstag (eingetragen oder aus dem Datum abgeleitet) */
  tag?: number;
  tagAbgeleitet: boolean;
  /** Position in Lesereihenfolge (0-basiert) */
  reihe: number;
  orte: Id[];
  figuren: Id[];
  hatText: boolean;
}

export function einheitSchluessel(kapitel: Id, szene?: Id): string {
  return szene ? `${kapitel}#${szene}` : kapitel;
}

export function leseEinheitSchluessel(schluessel: string): { kapitel: Id; szene?: Id } {
  const i = schluessel.indexOf('#');
  return i < 0 ? { kapitel: schluessel } : { kapitel: schluessel.slice(0, i), szene: schluessel.slice(i + 1) };
}

/** Kapitel in Lesereihenfolge (projekt.kapitel, danach Pläne/Kapitel ohne Eintrag). */
export function kapitelReihenfolge(daten: ProjektDaten): Id[] {
  const reihe = [...(daten.projekt?.kapitel ?? [])];
  for (const id of Object.keys(daten.kapitel ?? {})) if (!reihe.includes(id)) reihe.push(id);
  return reihe;
}

/** Geplante Szenen eines Kapitels (nach Index), nur wenn es mindestens zwei sind. */
export function geplanteSzenen(plan: KapitelPlan | undefined): Szene[] {
  const s = [...(plan?.szenen ?? [])].sort((a, b) => a.index - b.index);
  return s.length >= 2 ? s : [];
}

/** Tag/Wochentag/Datum eines Kapitel-Zeitpunkts für Szenen ohne eigenen Zeitpunkt */
function erbteil(z: Zeitpunkt | undefined): Zeitpunkt | undefined {
  if (!z || (z.tag === undefined && !z.wochentag && !z.datum)) return undefined;
  const e: Zeitpunkt = { sicherheit: z.sicherheit };
  if (z.tag !== undefined) e.tag = z.tag;
  if (z.wochentag) e.wochentag = z.wochentag;
  if (z.datum) e.datum = z.datum;
  return e;
}

export interface EinheitenOptionen {
  /** Kapitel mit mindestens zwei geplanten Szenen in Szenen aufteilen (Standard: ja) */
  szenen?: boolean;
}

/** Alle Einheiten in Lesereihenfolge. */
export function zeitEinheiten(daten: ProjektDaten, optionen: EinheitenOptionen = {}): ZeitEinheit[] {
  const beginn = beginnVon(daten.zeitleiste);
  const mitSzenen = optionen.szenen ?? true;
  const ergebnis: ZeitEinheit[] = [];
  kapitelReihenfolge(daten).forEach((id, i) => {
    const plan = daten.plaene?.[id];
    const kapitel = daten.kapitel?.[id];
    const kapitelTitel = kapitel?.titel || plan?.titel || id;
    const hatText = !!kapitel?.text.trim();
    const szenen = mitSzenen ? geplanteSzenen(plan) : [];
    const basis = { kapitel: id, nr: i + 1, kapitelTitel, hatText };
    if (!szenen.length) {
      const t = effektiverTag(plan?.zeit, beginn);
      ergebnis.push({
        ...basis,
        schluessel: einheitSchluessel(id),
        titel: kapitelTitel,
        ...(plan?.zeit ? { eigen: plan.zeit, zeit: plan.zeit } : {}),
        geerbt: false,
        ...(t ? { tag: t.tag } : {}),
        tagAbgeleitet: t?.abgeleitet ?? false,
        reihe: ergebnis.length,
        orte: [...(plan?.orte ?? [])],
        figuren: [...(plan?.figuren ?? [])],
      });
      return;
    }
    const erbe = erbteil(plan?.zeit);
    szenen.forEach((s, j) => {
      const zeit = s.zeit ?? erbe;
      const t = effektiverTag(zeit, beginn);
      ergebnis.push({
        ...basis,
        schluessel: einheitSchluessel(id, s.id),
        szene: s.id,
        szenenNr: j + 1,
        titel: s.titel || szenenPlatzhalter(j + 1),
        ...(s.titel ? {} : { ohneTitel: true }),
        ...(s.zeit ? { eigen: s.zeit } : {}),
        ...(zeit ? { zeit } : {}),
        geerbt: !s.zeit && !!erbe,
        ...(t ? { tag: t.tag } : {}),
        tagAbgeleitet: t?.abgeleitet ?? false,
        reihe: ergebnis.length,
        orte: s.ort ? [s.ort] : [...(plan?.orte ?? [])],
        figuren: s.figuren.length ? [...s.figuren] : [...(plan?.figuren ?? [])],
      });
    });
  });
  return ergebnis;
}

export type ZeitSpalte =
  | {
      art: 'tag';
      schluessel: string;
      tag: number;
      wochentag?: Wochentag;
      datum?: string;
      einheiten: ZeitEinheit[];
      /** übersprungene Tage seit der vorigen Tagesspalte (0 = direkt anschließend) */
      luecke: number;
      /** derselbe Tag stand schon weiter vorn (unterbrochen durch Einheiten mit unbekanntem Abstand) */
      fortsetzung: boolean;
    }
  | { art: 'unbekannt'; schluessel: string; einheiten: ZeitEinheit[] };

/** Ordnet die Einheiten auf der Tages-Achse an (siehe Dateikopf). */
export function ordneZeitleiste(einheiten: ZeitEinheit[], beginn: Beginn = {}): ZeitSpalte[] {
  // Minute für die Sortierung innerhalb eines Tags: eigene, sonst die der vorigen Einheit desselben Tags
  const minute = new Map<string, number>();
  const letzte = new Map<number, number>();
  for (const e of einheiten) {
    if (e.tag === undefined) continue;
    const m = tagesMinute(e.zeit) ?? letzte.get(e.tag) ?? -1;
    minute.set(e.schluessel, m);
    letzte.set(e.tag, m);
  }
  const bekannt = einheiten
    .filter((e) => e.tag !== undefined)
    .sort((a, b) => a.tag! - b.tag! || minute.get(a.schluessel)! - minute.get(b.schluessel)! || a.reihe - b.reihe);

  // Einheiten ohne Tag hängen an der letzten bekannten Einheit davor (Lesereihenfolge)
  const anhang = new Map<string, ZeitEinheit[]>();
  let anker = '';
  for (const e of einheiten) {
    if (e.tag !== undefined) {
      anker = e.schluessel;
      continue;
    }
    const liste = anhang.get(anker) ?? [];
    liste.push(e);
    anhang.set(anker, liste);
  }
  const folge: ZeitEinheit[] = [...(anhang.get('') ?? [])];
  for (const e of bekannt) folge.push(e, ...(anhang.get(e.schluessel) ?? []));

  const spalten: ZeitSpalte[] = [];
  const gesehen = new Set<number>();
  let vorigerTag: number | undefined;
  for (const e of folge) {
    const aktuell = spalten[spalten.length - 1];
    if (e.tag === undefined) {
      if (aktuell?.art === 'unbekannt') aktuell.einheiten.push(e);
      else spalten.push({ art: 'unbekannt', schluessel: `?${e.schluessel}`, einheiten: [e] });
      continue;
    }
    if (aktuell?.art === 'tag' && aktuell.tag === e.tag) {
      aktuell.einheiten.push(e);
      continue;
    }
    const luecke = vorigerTag === undefined ? 0 : Math.max(0, e.tag - vorigerTag - 1);
    const fortsetzung = gesehen.has(e.tag);
    gesehen.add(e.tag);
    vorigerTag = e.tag;
    spalten.push({ art: 'tag', schluessel: `t${e.tag}:${e.schluessel}`, tag: e.tag, einheiten: [e], luecke, fortsetzung });
  }
  for (const s of spalten) {
    if (s.art !== 'tag') continue;
    const mitWochentag = s.einheiten.find((e) => e.zeit?.wochentag);
    const probe: Zeitpunkt = { tag: s.tag, sicherheit: 'ungefaehr' };
    const w = beginn.wochentag ? erwarteterWochentag(probe, beginn) : mitWochentag?.zeit?.wochentag;
    if (w) s.wochentag = w;
    const d = erwartetesDatum(probe, beginn) ?? s.einheiten.find((e) => e.zeit?.datum)?.zeit?.datum;
    if (d) s.datum = d;
  }
  return spalten;
}

/** Die Einheit vor `schluessel` (Lesereihenfolge), die einen Handlungstag hat – Bezug für „am nächsten Morgen“. */
export function vorigeEinheitMitTag(einheiten: ZeitEinheit[], schluessel: string): ZeitEinheit | undefined {
  const i = einheiten.findIndex((e) => e.schluessel === schluessel);
  for (let j = i - 1; j >= 0; j--) if (einheiten[j]!.tag !== undefined) return einheiten[j];
  return undefined;
}

/** Beschriftung „Kap. 7 · Szene 2“ / “Ch. 7 · scene 2” */
export function einheitNummer(e: Pick<ZeitEinheit, 'nr' | 'szenenNr'>, sprache: Sprache = 'de'): string {
  if (sprache === 'en') return e.szenenNr ? `Ch. ${e.nr} · scene ${e.szenenNr}` : `Ch. ${e.nr}`;
  return e.szenenNr ? `Kap. ${e.nr} · Szene ${e.szenenNr}` : `Kap. ${e.nr}`;
}

/** „Kap. 7 „Ebbe“, Szene 2 „Kai bei Nacht““ / “Ch. 7 “Low Tide”, scene 2 “Quay at night”” */
export function einheitName(e: ZeitEinheit, sprache: Sprache = 'de'): string {
  const titel = e.szene && e.ohneTitel ? szenenPlatzhalter(e.szenenNr ?? 0, sprache) : e.titel;
  if (sprache === 'en')
    return e.szene ? `Ch. ${e.nr} “${e.kapitelTitel}”, scene ${e.szenenNr} “${titel}”` : `Ch. ${e.nr} “${e.kapitelTitel}”`;
  return e.szene ? `Kap. ${e.nr} „${e.kapitelTitel}“, Szene ${e.szenenNr} „${titel}“` : `Kap. ${e.nr} „${e.kapitelTitel}“`;
}

/** Titel einer Szene ohne eigenen Titel („Szene 2“ / “Scene 2”). */
export function szenenPlatzhalter(nr: number, sprache: Sprache = 'de'): string {
  return `${sprache === 'en' ? 'Scene' : 'Szene'} ${nr}`;
}
