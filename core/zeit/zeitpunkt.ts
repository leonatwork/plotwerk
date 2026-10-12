/**
 * Zeitpunkte rechnen und beschriften (G1). Reines TypeScript, ohne DOM/Tauri.
 *
 * Erzähltag: Uhrzeiten vor 05:00 gehören zum Vortag („Tag 8, 01:30“ ist die Nacht nach Tag 8), damit
 * eine Barnacht nicht auf zwei Tage zerfällt. Tag 1 ist der erste Tag der Handlung, 0 und negative Tage
 * sind Rückblenden.
 */
import type { Sprache } from '../i18n';
import type { Tageszeit, Wochentag, Zeitleiste, Zeitpunkt, ZeitSicherheit } from '../model/types';
import { TAGESZEITEN, WOCHENTAGE } from '../projekt/lesen';

export { TAGESZEITEN, WOCHENTAGE };

// Die Konstanten unten bleiben deutsch (bestehende Aufrufer); für die Oberflächensprache die Funktionen
// wochentagName(), wochentagKurz(), tageszeitName(), sicherheitName(), sicherheitErklaerung(), relativeAngaben().

const WOCHENTAG_NAME_EN: Record<Wochentag, string> = {
  montag: 'Monday',
  dienstag: 'Tuesday',
  mittwoch: 'Wednesday',
  donnerstag: 'Thursday',
  freitag: 'Friday',
  samstag: 'Saturday',
  sonntag: 'Sunday',
};

const WOCHENTAG_KURZ_EN: Record<Wochentag, string> = {
  montag: 'Mon',
  dienstag: 'Tue',
  mittwoch: 'Wed',
  donnerstag: 'Thu',
  freitag: 'Fri',
  samstag: 'Sat',
  sonntag: 'Sun',
};

const TAGESZEIT_NAME_EN: Record<Tageszeit, string> = {
  frueh: 'early morning',
  morgens: 'morning',
  vormittags: 'late morning',
  mittags: 'midday',
  nachmittags: 'afternoon',
  abends: 'evening',
  nachts: 'night',
};

/** Tageszeit als Umstandsangabe im Satz („spielt an Tag 3 abends“ / “on Day 3 in the evening”). */
const TAGESZEIT_ADVERB_EN: Record<Tageszeit, string> = {
  frueh: 'early in the morning',
  morgens: 'in the morning',
  vormittags: 'in the late morning',
  mittags: 'at midday',
  nachmittags: 'in the afternoon',
  abends: 'in the evening',
  nachts: 'at night',
};

const SICHERHEIT_NAME_EN: Record<ZeitSicherheit, string> = {
  fest: 'confirmed',
  ungefaehr: 'vague',
  unklar: 'open',
};

const SICHERHEIT_ERKLAERUNG_EN: Record<ZeitSicherheit, string> = {
  fest: 'Supported by the text or set by you',
  ungefaehr: 'Inferred, approximate',
  unklar: 'Placeholder, still open',
};

const MONATE_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const WOCHENTAG_NAME: Record<Wochentag, string> = {
  montag: 'Montag',
  dienstag: 'Dienstag',
  mittwoch: 'Mittwoch',
  donnerstag: 'Donnerstag',
  freitag: 'Freitag',
  samstag: 'Samstag',
  sonntag: 'Sonntag',
};

export const WOCHENTAG_KURZ: Record<Wochentag, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
  sonntag: 'So',
};

export const TAGESZEIT_NAME: Record<Tageszeit, string> = {
  frueh: 'früh',
  morgens: 'morgens',
  vormittags: 'vormittags',
  mittags: 'mittags',
  nachmittags: 'nachmittags',
  abends: 'abends',
  nachts: 'nachts',
};

/** Spanne einer Tageszeit in Minuten des Erzähltags (großzügig, Grenzen überlappen). */
export const TAGESZEIT_SPANNE: Record<Tageszeit, readonly [number, number]> = {
  frueh: [240, 450],
  morgens: [360, 630],
  vormittags: [540, 750],
  mittags: [660, 870],
  nachmittags: [780, 1110],
  abends: [1020, 1410],
  nachts: [1260, 1740],
};

/** Typische Minute einer Tageszeit (Sortierung, wenn keine Uhrzeit bekannt ist). */
export const TAGESZEIT_MITTE: Record<Tageszeit, number> = {
  frueh: 330,
  morgens: 480,
  vormittags: 630,
  mittags: 750,
  nachmittags: 930,
  abends: 1200,
  nachts: 1440,
};

/** Anzeige der Sicherheit: fest = gesichert, ungefähr = vage, unklar = offen. */
export const SICHERHEIT_NAME: Record<ZeitSicherheit, string> = {
  fest: 'gesichert',
  ungefaehr: 'vage',
  unklar: 'offen',
};

export const SICHERHEIT_ERKLAERUNG: Record<ZeitSicherheit, string> = {
  fest: 'Im Text belegt oder von dir festgelegt',
  ungefaehr: 'Erschlossen, ungefähr',
  unklar: 'Platzhalter, noch offen',
};

/** Wochentag in der Sprache („Montag“ / “Monday”). */
export function wochentagName(w: Wochentag, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? WOCHENTAG_NAME_EN : WOCHENTAG_NAME)[w];
}

/** Wochentag kurz („Mo“ / “Mon”). */
export function wochentagKurz(w: Wochentag, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? WOCHENTAG_KURZ_EN : WOCHENTAG_KURZ)[w];
}

/** Tageszeit als Beschriftung („abends“ / “evening”). */
export function tageszeitName(t: Tageszeit, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? TAGESZEIT_NAME_EN : TAGESZEIT_NAME)[t];
}

/** Tageszeit im Satz („abends“ / “in the evening”). */
export function tageszeitImSatz(t: Tageszeit, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? TAGESZEIT_ADVERB_EN : TAGESZEIT_NAME)[t];
}

export function sicherheitName(s: ZeitSicherheit, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? SICHERHEIT_NAME_EN : SICHERHEIT_NAME)[s];
}

export function sicherheitErklaerung(s: ZeitSicherheit, sprache: Sprache = 'de'): string {
  return (sprache === 'en' ? SICHERHEIT_ERKLAERUNG_EN : SICHERHEIT_ERKLAERUNG)[s];
}

/** Token-Namen (ohne „--“) wie bei der Realitätsebene */
export const SICHERHEIT_FARBE: Record<ZeitSicherheit, string> = {
  fest: 'real-gesichert',
  ungefaehr: 'real-vage',
  unklar: 'real-offen',
};

/** Beginn des Erzähltags: Uhrzeiten davor zählen zum Vortag. */
export const TAGESWECHSEL = 5 * 60;

/** „23:00“, „7:05“, „7.05“ → Minuten (0–1439); sonst null. */
export function parseUhrzeit(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:Uhr)?\s*$/i.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return (h % 24) * 60 + min;
}

/** Minuten → „HH:MM“ */
export function formatiereUhrzeit(minuten: number): string {
  const m = ((Math.round(minuten) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Normalisiert Eingaben wie „7.5“ oder „23 Uhr“; null = ungültig. */
export function normalisiereUhrzeit(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const nurStunde = /^(\d{1,2})\s*(?:Uhr)?$/i.exec(t);
  if (nurStunde) {
    const h = Number(nurStunde[1]);
    return h <= 24 ? formatiereUhrzeit((h % 24) * 60) : null;
  }
  const m = parseUhrzeit(t);
  return m === null ? null : formatiereUhrzeit(m);
}

/** Minute im Erzähltag (vor 05:00 → +24 h). */
export function erzaehlMinute(uhrzeitMinuten: number): number {
  return uhrzeitMinuten < TAGESWECHSEL ? uhrzeitMinuten + 1440 : uhrzeitMinuten;
}

/** Tageszeit zu einer Uhrzeit (Minuten 0–1439). */
export function tageszeitZu(uhrzeitMinuten: number): Tageszeit {
  const m = ((uhrzeitMinuten % 1440) + 1440) % 1440;
  if (m < 300) return 'nachts';
  if (m < 420) return 'frueh';
  if (m < 600) return 'morgens';
  if (m < 720) return 'vormittags';
  if (m < 840) return 'mittags';
  if (m < 1080) return 'nachmittags';
  if (m < 1320) return 'abends';
  return 'nachts';
}

/** Passt eine Uhrzeit zur angegebenen Tageszeit? (großzügig) */
export function passtZurTageszeit(tageszeit: Tageszeit, uhrzeitMinuten: number): boolean {
  const [von, bis] = TAGESZEIT_SPANNE[tageszeit];
  const m = erzaehlMinute(uhrzeitMinuten);
  return m >= von && m <= bis;
}

/** Minute im Erzähltag, falls Uhrzeit oder Tageszeit bekannt (Uhrzeit hat Vorrang). */
export function tagesMinute(z: Zeitpunkt | undefined): number | undefined {
  if (!z) return undefined;
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) return erzaehlMinute(u);
  return z.tageszeit ? TAGESZEIT_MITTE[z.tageszeit] : undefined;
}

/** Frühestens/spätestens im Erzähltag (Uhrzeit exakt, Tageszeit als Spanne, sonst ganzer Tag). */
export function tagesSpanne(z: Zeitpunkt | undefined): [number, number] {
  const u = parseUhrzeit(z?.uhrzeit);
  if (u !== null) {
    const m = erzaehlMinute(u);
    return [m, m];
  }
  if (z?.tageszeit) return [...TAGESZEIT_SPANNE[z.tageszeit]];
  return [0, 1800];
}

// ---------------------------------------------------------------------------
// Wochentage und Daten
// ---------------------------------------------------------------------------

export function wochentagIndex(w: Wochentag): number {
  return WOCHENTAGE.indexOf(w);
}

/** Wochentag von `ausgang` plus `tage` Tage */
export function wochentagPlus(ausgang: Wochentag, tage: number): Wochentag {
  return WOCHENTAGE[(((wochentagIndex(ausgang) + tage) % 7) + 7) % 7]!;
}

/** Wochentag des Handlungstags `tag`, wenn Tag 1 der Wochentag `beginn` ist */
export function wochentagFuerTag(beginn: Wochentag, tag: number): Wochentag {
  return wochentagPlus(beginn, tag - 1);
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

function datumUtc(iso: string): number | null {
  const m = DATUM.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const probe = new Date(t);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return t;
}

export function gueltigesDatum(iso: string | undefined): boolean {
  return !!iso && datumUtc(iso) !== null;
}

/** Wochentag eines ISO-Datums; null bei ungültigem Datum */
export function wochentagAusDatum(iso: string): Wochentag | null {
  const t = datumUtc(iso);
  if (t === null) return null;
  const tag = new Date(t).getUTCDay(); // 0 = Sonntag
  return WOCHENTAGE[(tag + 6) % 7]!;
}

export function datumPlusTage(iso: string, tage: number): string | null {
  const t = datumUtc(iso);
  if (t === null) return null;
  return new Date(t + tage * 86_400_000).toISOString().slice(0, 10);
}

/** Tage von a nach b (b − a); null bei ungültigem Datum */
export function tageZwischen(a: string, b: string): number | null {
  const ta = datumUtc(a);
  const tb = datumUtc(b);
  if (ta === null || tb === null) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/** „2026-03-12“ → „12.03.2026“ bzw. “March 12, 2026” */
export function formatiereDatum(iso: string, sprache: Sprache = 'de'): string {
  const m = DATUM.exec(iso.trim());
  if (!m) return iso;
  if (sprache === 'en') {
    const monat = MONATE_EN[Number(m[2]) - 1];
    return monat ? `${monat} ${Number(m[3])}, ${m[1]}` : iso;
  }
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export interface Beginn {
  /** Wochentag von Tag 1 (aus dem Beginn oder aus dessen Datum abgeleitet) */
  wochentag?: Wochentag;
  /** Datum von Tag 1 */
  datum?: string;
}

/** Bezug für Tag 1 aus plan/zeitleiste.md; ein Datum ergänzt den Wochentag. */
export function beginnVon(zeitleiste: Zeitleiste | undefined): Beginn {
  const b = zeitleiste?.beginn;
  if (!b) return {};
  const datum = b.datum && gueltigesDatum(b.datum) ? b.datum : undefined;
  const wochentag = b.wochentag ?? (datum ? (wochentagAusDatum(datum) ?? undefined) : undefined);
  return { ...(wochentag ? { wochentag } : {}), ...(datum ? { datum } : {}) };
}

/** Handlungstag: eingetragener Tag oder aus Datum und Beginn abgeleitet */
export function effektiverTag(z: Zeitpunkt | undefined, beginn: Beginn): { tag: number; abgeleitet: boolean } | undefined {
  if (!z) return undefined;
  if (typeof z.tag === 'number' && Number.isFinite(z.tag)) return { tag: Math.trunc(z.tag), abgeleitet: false };
  if (z.datum && beginn.datum) {
    const d = tageZwischen(beginn.datum, z.datum);
    if (d !== null) return { tag: d + 1, abgeleitet: true };
  }
  return undefined;
}

/** Erwarteter Wochentag des Zeitpunkts (aus Tag + Beginn oder aus dem Datum) */
export function erwarteterWochentag(z: Zeitpunkt, beginn: Beginn): Wochentag | undefined {
  if (z.datum) {
    const w = wochentagAusDatum(z.datum);
    if (w) return w;
  }
  const t = effektiverTag(z, beginn);
  if (t && beginn.wochentag) return wochentagFuerTag(beginn.wochentag, t.tag);
  return undefined;
}

/** Erwartetes Datum des Zeitpunkts (aus Tag + Beginn) */
export function erwartetesDatum(z: Zeitpunkt, beginn: Beginn): string | undefined {
  if (typeof z.tag !== 'number' || !beginn.datum) return undefined;
  return datumPlusTage(beginn.datum, z.tag - 1) ?? undefined;
}

// ---------------------------------------------------------------------------
// Beschriftung
// ---------------------------------------------------------------------------

/** „Tag 3“ / “Day 3” (Handlungstag) */
export function tagKurz(tag: number, sprache: Sprache = 'de'): string {
  return `${sprache === 'en' ? 'Day' : 'Tag'} ${tag}`;
}

export function tagName(tag: number, sprache: Sprache = 'de'): string {
  const en = sprache === 'en';
  if (tag >= 1) return tagKurz(tag, sprache);
  if (tag === 0) return en ? 'Day 0 · before the start' : 'Tag 0 · vor Beginn';
  return `${tagKurz(tag, sprache)} · ${en ? 'flashback' : 'Rückblende'}`;
}

/** „Tag 8 · Mo · nachts · 23:00“ – leere Angaben fallen weg. */
export function zeitText(z: Zeitpunkt | undefined, beginn: Beginn = {}, optionen: { kurz?: boolean } = {}, sprache: Sprache = 'de'): string {
  const offen = sprache === 'en' ? 'Time open' : 'Zeitpunkt offen';
  if (!z) return offen;
  const teile: string[] = [];
  const t = effektiverTag(z, beginn);
  if (t) teile.push(tagKurz(t.tag, sprache));
  const w = z.wochentag ?? erwarteterWochentag(z, beginn);
  if (w) teile.push(optionen.kurz ? wochentagKurz(w, sprache) : wochentagName(w, sprache));
  if (z.datum && !optionen.kurz) teile.push(formatiereDatum(z.datum, sprache));
  if (z.tageszeit) teile.push(tageszeitName(z.tageszeit, sprache));
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) teile.push(formatiereUhrzeit(u));
  else if (z.uhrzeit) teile.push(z.uhrzeit);
  return teile.length ? teile.join(' · ') : offen;
}

/** Tageszeit/Uhrzeit als kurze Beschriftung über einer Karte */
export function tageszeitText(z: Zeitpunkt | undefined, sprache: Sprache = 'de'): string {
  if (!z) return '';
  const u = parseUhrzeit(z.uhrzeit);
  if (u !== null) return z.tageszeit ? `${tageszeitName(z.tageszeit, sprache)} · ${formatiereUhrzeit(u)}` : formatiereUhrzeit(u);
  return z.tageszeit ? tageszeitName(z.tageszeit, sprache) : '';
}

export function dauerText(minuten: number): string {
  if (minuten < 60) return `${minuten} min`;
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ---------------------------------------------------------------------------
// Vergleiche und relative Angaben
// ---------------------------------------------------------------------------

const ZEIT_FELDER = ['tag', 'wochentag', 'datum', 'tageszeit', 'uhrzeit', 'dauer'] as const;

/** Gleiche Zeitangaben (ohne Sicherheit, Beleg, Notiz)? Uhrzeiten werden normalisiert verglichen. */
export function gleicheZeit(a: Zeitpunkt | undefined, b: Zeitpunkt | undefined): boolean {
  if (!a || !b) return a === b;
  return ZEIT_FELDER.every((f) => {
    if (f === 'uhrzeit') {
      const ua = parseUhrzeit(a.uhrzeit);
      const ub = parseUhrzeit(b.uhrzeit);
      return ua === null && ub === null ? (a.uhrzeit ?? '') === (b.uhrzeit ?? '') : ua === ub;
    }
    return (a[f] ?? null) === (b[f] ?? null);
  });
}

/** Sind alle Angaben aus `teil` in `ganz` schon so eingetragen? */
export function enthaeltZeit(ganz: Zeitpunkt | undefined, teil: Partial<Zeitpunkt>): boolean {
  if (!ganz) return false;
  return ZEIT_FELDER.every((f) => {
    const v = teil[f];
    if (v === undefined || v === null) return true;
    if (f === 'uhrzeit') return parseUhrzeit(ganz.uhrzeit) === parseUhrzeit(v as string);
    return ganz[f] === v;
  });
}

/** Hat der Zeitpunkt irgendeine Zeitangabe (nicht nur Sicherheit/Notiz)? */
export function hatZeitangabe(z: Zeitpunkt | undefined): boolean {
  return !!z && ZEIT_FELDER.some((f) => z[f] !== undefined && z[f] !== '');
}

export type RelativeAngabe = 'gleicher-tag' | 'naechster-morgen' | 'naechster-abend' | 'naechster-tag' | 'spaeter';

export const RELATIVE_ANGABEN: { art: RelativeAngabe; label: string }[] = [
  { art: 'gleicher-tag', label: 'am selben Tag' },
  { art: 'naechster-morgen', label: 'am nächsten Morgen' },
  { art: 'naechster-abend', label: 'am nächsten Abend' },
  { art: 'naechster-tag', label: 'am nächsten Tag' },
  { art: 'spaeter', label: 'Tage später …' },
];

const RELATIVE_ANGABEN_EN: { art: RelativeAngabe; label: string }[] = [
  { art: 'gleicher-tag', label: 'the same day' },
  { art: 'naechster-morgen', label: 'the next morning' },
  { art: 'naechster-abend', label: 'the next evening' },
  { art: 'naechster-tag', label: 'the next day' },
  { art: 'spaeter', label: 'days later …' },
];

/** RELATIVE_ANGABEN in der Sprache. */
export function relativeAngaben(sprache: Sprache = 'de'): { art: RelativeAngabe; label: string }[] {
  return sprache === 'en' ? RELATIVE_ANGABEN_EN : RELATIVE_ANGABEN;
}

/**
 * Zeitangaben relativ zum vorigen Zeitpunkt („am nächsten Morgen“). `tage` nur bei „spaeter“.
 * null, wenn der vorige Zeitpunkt keinen Handlungstag hat.
 */
export function relativerZeitpunkt(
  vorher: Zeitpunkt | undefined,
  art: RelativeAngabe,
  beginn: Beginn = {},
  tage = 2,
): Pick<Zeitpunkt, 'tag' | 'tageszeit' | 'wochentag' | 'datum'> | null {
  const t = effektiverTag(vorher, beginn);
  if (!t) return null;
  const plus = art === 'gleicher-tag' ? 0 : art === 'spaeter' ? Math.max(1, Math.trunc(tage)) : 1;
  const tag = t.tag + plus;
  const ergebnis: Pick<Zeitpunkt, 'tag' | 'tageszeit' | 'wochentag' | 'datum'> = { tag };
  if (art === 'naechster-morgen') ergebnis.tageszeit = 'morgens';
  if (art === 'naechster-abend') ergebnis.tageszeit = 'abends';
  // Wochentag/Datum nur fortschreiben, wenn der vorige Zeitpunkt sie hat und kein Beginn sie ableitet
  if (vorher?.wochentag && !beginn.wochentag) ergebnis.wochentag = wochentagPlus(vorher.wochentag, plus);
  if (vorher?.datum && !beginn.datum) {
    const d = datumPlusTage(vorher.datum, plus);
    if (d) ergebnis.datum = d;
  }
  return ergebnis;
}

/** Entfernt leere Felder (undefined, '') – für sauberes YAML. */
export function bereinigeZeitpunkt(z: Zeitpunkt): Zeitpunkt {
  const ergebnis: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(z)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    ergebnis[k] = v;
  }
  return ergebnis as unknown as Zeitpunkt;
}
