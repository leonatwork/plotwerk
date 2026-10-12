/**
 * G5 Versionen & Statistik – reine Logik (ohne DOM, ohne Tauri). Besitzer: G5.
 *
 * Zählregel für die Tagesstatistik (statistik.json, `tage[JJJJ-MM-TT]`):
 * - Gezählt wird die Gesamtwortzahl des Buchs (Kapitel aus projekt.kapitel, Wortzählung wie in der Statusleiste)
 *   nach jedem Speichern eines Kapitels. Der Tag ist das **lokale** Kalenderdatum des Speicherns (Mitternacht
 *   in der Zeitzone des Macs trennt die Tage).
 * - Nimmt die Wortzahl zu, zählt die Zunahme als „geschrieben“.
 * - Nimmt sie ab (Löschen, Kürzen), wird **nichts abgezogen**: Das Tagesziel kann durch Löschen nicht sinken.
 * - Ausnahme Verschieben/Rückgängig: Kommt in einem einzigen Speichervorgang ein großer Block hinzu
 *   (ab {@link BLOCK_WOERTER} Wörtern, also Einfügen statt Tippen), wird er zuerst mit Wörtern verrechnet, die in
 *   den {@link PUFFER_MINUTEN} Minuten davor gelöscht wurden. Ausschneiden in Kapitel A und Einfügen in Kapitel B
 *   zählt so nicht als neu geschrieben. Normales Tippen wird nie verrechnet.
 * - Nicht gezählt (nur der Stand wird nachgeführt): Laden eines Projekts, Änderungen von außen (z. B. Obsidian,
 *   anderer Mac), Import, Wiederherstellen einer Version oder Fassung, Rückimport aus Word.
 * - `stand` ist die Wortzahl des Buchs beim letzten Speichern des Tages.
 */
import type { Akt, Id, KapitelStatus, ProjektDaten, Schreibstatistik, TagesStatistik } from '../model/types';
import { wortzahl } from '../text';

export * from './fassungen';

/** Ab so vielen Wörtern in einem Speichervorgang gilt eine Zunahme als eingefügter Block. */
export const BLOCK_WOERTER = 25;
/** So lange werden gelöschte Wörter für das Verrechnen mit eingefügten Blöcken vorgehalten. */
export const PUFFER_MINUTEN = 10;

// ---------------------------------------------------------------------------
// Tage (lokale Zeit)
// ---------------------------------------------------------------------------

const zwei = (n: number) => String(n).padStart(2, '0');

/** Lokales Kalenderdatum „JJJJ-MM-TT“. */
export function tagSchluessel(d: Date): string {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** „JJJJ-MM-TT“ → lokale Mitternacht (null bei ungültiger Angabe). */
export function datumAusSchluessel(tag: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tag);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return tagSchluessel(d) === tag ? d : null;
}

/** Tag um `n` Kalendertage verschieben (sommerzeitfest, weil über das lokale Datum gerechnet wird). */
export function tagVerschieben(tag: string, n: number): string {
  const d = datumAusSchluessel(tag);
  if (!d) return tag;
  return tagSchluessel(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Kalendertage von `a` bis `b` (b − a), unabhängig von Sommer-/Winterzeit. */
export function tageZwischen(a: string, b: string): number {
  const da = datumAusSchluessel(a);
  const db = datumAusSchluessel(b);
  if (!da || !db) return 0;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86_400_000);
}

/** Wochentag Montag = 0 … Sonntag = 6 */
export function wochentagMo(tag: string): number {
  const d = datumAusSchluessel(tag);
  return d ? (d.getDay() + 6) % 7 : 0;
}

// ---------------------------------------------------------------------------
// Wortzahl des Buchs (inkrementell)
// ---------------------------------------------------------------------------

/** Merkt sich die Wortzahl je Kapiteltext; neu gezählt wird nur ein geänderter Text. */
export class WortzahlSpeicher {
  private texte = new Map<Id, { text: string; n: number }>();

  kapitel(id: Id, text: string): number {
    const alt = this.texte.get(id);
    if (alt && alt.text === text) return alt.n;
    const n = wortzahl(text);
    this.texte.set(id, { text, n });
    return n;
  }

  /** Summe über projekt.kapitel (wie die Statusleiste). */
  buch(daten: ProjektDaten): number {
    let summe = 0;
    const vorhanden = new Set<Id>();
    for (const id of daten.projekt.kapitel) {
      vorhanden.add(id);
      const k = daten.kapitel[id];
      if (k) summe += this.kapitel(id, k.text);
    }
    for (const id of [...this.texte.keys()]) if (!vorhanden.has(id)) this.texte.delete(id);
    return summe;
  }

  leeren(): void {
    this.texte.clear();
  }
}

// ---------------------------------------------------------------------------
// Buchen
// ---------------------------------------------------------------------------

/** Kürzlich gelöschte Wörter (für das Verrechnen mit eingefügten Blöcken). */
export interface LoeschPuffer {
  woerter: number;
  /** ms seit 1970: bis dahin gültig */
  bis: number;
}

export interface Buchung {
  /** Tag → Änderung (geschrieben kommt hinzu, stand ersetzt) */
  tag: string;
  geschrieben: number;
  stand: number;
  puffer: LoeschPuffer | null;
}

/**
 * Bucht eine Änderung der Buch-Wortzahl von `vorher` auf `nachher` zum Zeitpunkt `jetzt` (Regel oben).
 * `nurStand`: nicht zählen, nur den Stand nachführen (Import, Wiederherstellen, Änderung von außen).
 */
export function bucheAenderung(vorher: number, nachher: number, jetzt: Date, puffer: LoeschPuffer | null, nurStand = false): Buchung {
  const tag = tagSchluessel(jetzt);
  const t = jetzt.getTime();
  const gueltig = puffer && puffer.bis >= t && puffer.woerter > 0 ? puffer : null;
  const delta = nachher - vorher;
  if (nurStand || delta === 0) return { tag, geschrieben: 0, stand: nachher, puffer: gueltig };
  if (delta < 0) {
    return { tag, geschrieben: 0, stand: nachher, puffer: { woerter: (gueltig?.woerter ?? 0) - delta, bis: t + PUFFER_MINUTEN * 60_000 } };
  }
  let gezaehlt = delta;
  let rest = gueltig;
  if (delta >= BLOCK_WOERTER && gueltig) {
    const verrechnet = Math.min(gueltig.woerter, delta);
    gezaehlt = delta - verrechnet;
    rest = gueltig.woerter - verrechnet > 0 ? { woerter: gueltig.woerter - verrechnet, bis: gueltig.bis } : null;
  }
  return { tag, geschrieben: gezaehlt, stand: nachher, puffer: rest };
}

/** Noch nicht gespeicherte Tageswerte (geschrieben addiert, stand ersetzt). */
export type OffeneTage = Record<string, TagesStatistik>;

export function offenHinzufuegen(offen: OffeneTage, b: Pick<Buchung, 'tag' | 'geschrieben' | 'stand'>): OffeneTage {
  const alt = offen[b.tag];
  return { ...offen, [b.tag]: { geschrieben: (alt?.geschrieben ?? 0) + b.geschrieben, stand: b.stand } };
}

/** Offene Tageswerte in die Statistik übernehmen. */
export function offeneUebernehmen(st: Schreibstatistik, offen: OffeneTage): Schreibstatistik {
  const tage = Object.keys(offen);
  if (tage.length === 0) return st;
  const neu = { ...st.tage };
  for (const tag of tage) {
    const o = offen[tag]!;
    const alt = neu[tag];
    neu[tag] = { geschrieben: Math.max(0, (alt?.geschrieben ?? 0) + o.geschrieben), stand: Math.max(0, o.stand) };
  }
  const sortiert: Schreibstatistik['tage'] = {};
  for (const tag of Object.keys(neu).sort()) sortiert[tag] = neu[tag]!;
  return { ...st, tage: sortiert };
}

export function leereSchreibstatistik(): Schreibstatistik {
  return { version: 1, ziel: { tagWoerter: 0 }, tage: {} };
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export function woerterAm(st: Schreibstatistik, tag: string): number {
  return st.tage[tag]?.geschrieben ?? 0;
}

export interface Serie {
  /** Tage in Folge bis heute (oder bis gestern, solange heute noch nichts geschrieben ist) */
  aktuell: number;
  laengste: number;
  /** heute schon geschrieben */
  heuteGeschrieben: boolean;
}

/** Ein Tag zählt zur Serie, wenn an ihm mindestens ein Wort geschrieben wurde. */
export function serie(st: Schreibstatistik, heute: string): Serie {
  const geschrieben = (t: string) => woerterAm(st, t) > 0;
  const heuteGeschrieben = geschrieben(heute);
  let aktuell = 0;
  let tag = heuteGeschrieben ? heute : tagVerschieben(heute, -1);
  while (geschrieben(tag)) {
    aktuell++;
    tag = tagVerschieben(tag, -1);
  }
  let laengste = 0;
  let lauf = 0;
  let vorher: string | null = null;
  for (const t of Object.keys(st.tage).sort()) {
    if (t > heute) break;
    if (!geschrieben(t)) {
      lauf = 0;
      vorher = t;
      continue;
    }
    lauf = vorher !== null && tageZwischen(vorher, t) === 1 && woerterAm(st, vorher) > 0 ? lauf + 1 : 1;
    vorher = t;
    laengste = Math.max(laengste, lauf);
  }
  return { aktuell, laengste: Math.max(laengste, aktuell), heuteGeschrieben };
}

/** Durchschnitt pro Kalendertag über die letzten `tage` Tage bis einschließlich heute. */
export function durchschnitt(st: Schreibstatistik, heute: string, tage: number): number {
  let summe = 0;
  for (let i = 0; i < tage; i++) summe += woerterAm(st, tagVerschieben(heute, -i));
  return Math.round(summe / tage);
}

/** An wie vielen der letzten `tage` Tage wurde das Tagesziel erreicht? */
export function zielTage(st: Schreibstatistik, heute: string, tage: number): number {
  const ziel = st.ziel.tagWoerter;
  if (ziel <= 0) return 0;
  let n = 0;
  for (let i = 0; i < tage; i++) if (woerterAm(st, tagVerschieben(heute, -i)) >= ziel) n++;
  return n;
}

export interface KalenderTag {
  tag: string;
  woerter: number;
  /** 0 = nichts, 1–4 = Intensität */
  stufe: 0 | 1 | 2 | 3 | 4;
  zukunft: boolean;
  zielErreicht: boolean;
}

export interface KalenderWoche {
  /** Montag der Woche */
  beginn: string;
  /** Mo … So (immer 7 Tage) */
  tage: KalenderTag[];
}

/**
 * Kalender für die Heatmap: `wochen` Wochen (Mo–So), die letzte enthält `heute`.
 * Stufen mit Tagesziel: 1 < ½ Ziel, 2 < Ziel, 3 ≥ Ziel, 4 ≥ 1½ Ziel. Ohne Ziel relativ zum besten Tag im Zeitraum.
 */
export function kalender(st: Schreibstatistik, heute: string, wochen: number): KalenderWoche[] {
  const ende = tagVerschieben(heute, 6 - wochentagMo(heute));
  const beginn = tagVerschieben(ende, -(wochen * 7 - 1));
  const ziel = st.ziel.tagWoerter;
  let max = 0;
  for (let i = 0; i < wochen * 7; i++) max = Math.max(max, woerterAm(st, tagVerschieben(beginn, i)));
  const stufe = (w: number): KalenderTag['stufe'] => {
    if (w <= 0) return 0;
    if (ziel > 0) return w >= ziel * 1.5 ? 4 : w >= ziel ? 3 : w >= ziel / 2 ? 2 : 1;
    const anteil = max > 0 ? w / max : 0;
    return anteil > 0.75 ? 4 : anteil > 0.5 ? 3 : anteil > 0.25 ? 2 : 1;
  };
  const ergebnis: KalenderWoche[] = [];
  for (let w = 0; w < wochen; w++) {
    const wb = tagVerschieben(beginn, w * 7);
    const tage: KalenderTag[] = [];
    for (let i = 0; i < 7; i++) {
      const tag = tagVerschieben(wb, i);
      const woerter = woerterAm(st, tag);
      tage.push({ tag, woerter, stufe: stufe(woerter), zukunft: tag > heute, zielErreicht: ziel > 0 && woerter >= ziel });
    }
    ergebnis.push({ beginn: wb, tage });
  }
  return ergebnis;
}

export interface GesamtFortschritt {
  woerter: number;
  ziel: number | null;
  /** 0 … 1 (gedeckelt) */
  anteil: number | null;
  rest: number | null;
  /** Kalendertage bis zur Abgabe (einschließlich heute); null ohne Abgabe */
  tageBisAbgabe: number | null;
  /** nötige Wörter pro Tag bis zur Abgabe */
  proTagNoetig: number | null;
}

export function gesamtFortschritt(st: Schreibstatistik, woerter: number, heute: string): GesamtFortschritt {
  const ziel = st.ziel.buchWoerter && st.ziel.buchWoerter > 0 ? st.ziel.buchWoerter : null;
  const rest = ziel === null ? null : Math.max(0, ziel - woerter);
  const abgabe = st.ziel.abgabe && datumAusSchluessel(st.ziel.abgabe) ? st.ziel.abgabe : null;
  const tageBisAbgabe = abgabe ? tageZwischen(heute, abgabe) + 1 : null;
  return {
    woerter,
    ziel,
    anteil: ziel === null ? null : Math.min(1, woerter / ziel),
    rest,
    tageBisAbgabe,
    proTagNoetig: rest !== null && tageBisAbgabe !== null && tageBisAbgabe > 0 ? Math.ceil(rest / tageBisAbgabe) : null,
  };
}

export interface KapitelFortschritt {
  id: Id;
  titel: string;
  woerter: number;
  status: KapitelStatus;
}

export interface AktFortschritt {
  /** null = keinem Akt zugeordnet */
  nummer: number | null;
  titel: string;
  woerter: number;
  kapitel: KapitelFortschritt[];
  /** Kapitel mit Status „geschrieben“ */
  fertig: number;
  /** Kapitel mit Text (Entwurf oder geschrieben) */
  begonnen: number;
}

/** Wörter je Akt und Kapitel in Buchreihenfolge; Kapitel ohne Akt am Ende. */
export function fortschrittJeAkt(daten: ProjektDaten, woerter: (id: Id) => number): AktFortschritt[] {
  const akte = [...daten.akte].sort((a, b) => a.nummer - b.nummer);
  const gruppen = new Map<number | null, AktFortschritt>();
  const neu = (akt: Akt | null): AktFortschritt => ({ nummer: akt?.nummer ?? null, titel: akt?.titel ?? '', woerter: 0, kapitel: [], fertig: 0, begonnen: 0 });
  for (const a of akte) gruppen.set(a.nummer, neu(a));
  for (const id of daten.projekt.kapitel) {
    const plan = daten.plaene[id];
    const k = daten.kapitel[id];
    const nummer = plan?.akt ?? null;
    let g = gruppen.get(nummer);
    if (!g) {
      g = neu(nummer === null ? null : { nummer, titel: '', quintessenz: '', wendepunkt: '', antagonisten: [] });
      gruppen.set(nummer, g);
    }
    const n = woerter(id);
    const status: KapitelStatus = plan?.status ?? (k?.text.trim() ? 'entwurf' : 'geplant');
    g.kapitel.push({ id, titel: k?.titel || plan?.titel || id, woerter: n, status });
    g.woerter += n;
    if (status === 'geschrieben') g.fertig++;
    if (status !== 'geplant' || n > 0) g.begonnen++;
  }
  return [...gruppen.values()]
    .filter((g) => g.nummer !== null || g.kapitel.length > 0)
    .sort((a, b) => (a.nummer ?? Infinity) - (b.nummer ?? Infinity));
}
