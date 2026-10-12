/**
 * KI-Aufgaben Zeitpunkte und Figurenzustände (G1). Besitzer: G1 Zeit & Zustand.
 * Nutzt fuehreAufgabeAus/AufgabenDefinition aus ./aufgabe. Nur ProjektLeser und KiTransport (harte Regel 1).
 *
 * Ablauf: ganzes Buch als gecachter Prefix (Allowlist E12), dann eine Aufgabe „zeit“ (wann spielen die Kapitel
 * bzw. Szenen?) oder „zustand“ (in welchem Zustand ist eine Figur?). Jede Antwort braucht wörtliche Belege (E6).
 * Leons eingetragene Zeitpunkte und Zustände gehen nicht an das Modell (E12); gesendet werden nur Kapitel-IDs,
 * die Anzahl der Szenen (aus den Trennern „* * *“ im Text) und – für „zustand“ – die Namen der Zustandsarten
 * als Antwortvokabular. Szenen-IDs bleiben lokal (Zuordnung über den Index).
 *
 * Verworfen wird: ohne Beleg aus dem Kapitel selbst, Zitat nicht im Text, Kapitel/Szene außerhalb des Auftrags,
 * ungültige Angaben (Uhrzeit, Datum, Wochentag passt nicht zum Datum, Uhrzeit nicht zur Tageszeit), Begründungen
 * mit Formulierungsvorschlag (harte Regel 2). Schreibt nichts – gespeichert wird im Store.
 */
import type {
  Id,
  KiEinstellungen,
  Tageszeit,
  Wochentag,
  ZeitSicherheit,
  Zeitpunkt,
  ZeitVorschlag,
  Zitat,
  ZustandVorschlag,
} from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { TAGESZEITEN, WOCHENTAGE } from '../projekt/lesen';
import type { KiRolle } from './anfrage';
import { KiFehler } from './antwort';
import {
  fuehreAufgabeAus,
  schaetzeAufgabe,
  type AufgabenDefinition,
  type AufgabenErgebnis,
  type AufgabenOptionen,
  type AufgabenPruefung,
} from './aufgabe';
import type { KiTransport, Schaetzung } from './index';
import type { BuchKontext, KontextFigur, KontextKapitel } from './kontext';
import { meldungenIn } from './meldungen';
import { ANTWORTSPRACHE_EN, kapKurz, type Sprache } from './sprache';

/** Kennungen im Aufgabenkopf; Demo-Antworten sind unter diesen Schlüsseln registriert. */
export const ZEIT_ART = 'zeit';
export const ZUSTAND_ART = 'zustand';

/** Geplante Szene (nur lokal zur Zuordnung „Szene n“ → ID; geht nicht an das Modell) */
export interface ZeitSzene {
  id: Id;
  /** Position im Kapitel (0 = Text vor dem ersten Trenner) */
  index: number;
}

export interface ZeitAuftrag {
  /** nur diese Kapitel (IDs); fehlt = alle Kapitel mit Text */
  kapitel?: Id[];
  /** geplante Szenen je Kapitel (mindestens zwei, sonst gilt das ganze Kapitel) */
  szenen?: Record<Id, ZeitSzene[]>;
  /** Opus statt Sonnet */
  tiefencheck?: boolean;
}

export interface ZustandAuftrag extends ZeitAuftrag {
  figur: Id;
  /** Zustandsliste aus plan/zeitleiste.md (ID + Name) */
  arten: { id: Id; name: string }[];
}

export interface ZeitAufgabenErgebnis {
  vorschlaege: ZeitVorschlag[];
  /** Kapitel im Umfang des Laufs */
  kapitel: Id[];
}

export interface ZustandAufgabenErgebnis {
  figur: Id;
  vorschlaege: ZustandVorschlag[];
  kapitel: Id[];
}

const LEITSATZ = `Du schreibst nie Text für das Buch: keine Umformulierungen, keine Ersatzsätze, keine Formulierungsvorschläge, keine Korrekturen, auch nicht als Beispiel. Du lieferst nur Beobachtungen mit Belegen; was davon übernommen wird, entscheidet allein der Autor.

Regeln:
- Jedes Zitat ist eine zusammenhängende Passage aus dem Kapitel, das du unter "kapitel" mit seiner id angibst, Zeichen für Zeichen aus dem <text> kopiert, ohne Auslassungen, höchstens ein Satz.
- Die Begründung beschreibt nur, wie du aus den Belegen schließt – kurz und sachlich.
- Lieber kein Eintrag als ein geratener. Bewusst vage oder offene Stellen bleiben offen.`;

export const SYSTEM_ZEIT = `Du bist Lektorats-Leser für ein deutschsprachiges Romanmanuskript. Du liest das Buch so, wie eine Leserin es liest: den Text der Kapitel in ihrer Reihenfolge und die wenigen Angaben des Autors zu Figuren, Orten, Gruppen und Realitätsebenen. Dazu kommt die Planung des Autors (Zeilen „Planung“ bei Figuren, <plan> bei Kapiteln); sie gehört nicht zum Buch.

Deine Aufgabe ist die innere Chronologie: wann eine Stelle spielt (Handlungstag, Wochentag, Datum, Tageszeit, Uhrzeit) oder in welchem Zustand eine Figur ist. Du belegst jede Angabe mit wörtlichen Zitaten.

${LEITSATZ}`;

/** Englische Fassung (Buchsprache en). */
export const SYSTEM_ZEIT_EN = `You are an editorial reader for an English-language novel. You read the book the way a reader does: the text of the chapters in their order and the author's few notes on characters, places, groups and levels of reality. In addition there is the author's planning (lines “Plan” for characters, <plan> for chapters); it is not part of the book.

Your task is the internal chronology: when a passage takes place (story day, weekday, date, time of day, clock time) or what state a character is in. You support every statement with verbatim quotes.

You never write text for the book: no rewordings, no replacement sentences, no suggested phrasings, no corrections, not even as an example. You only deliver observations with evidence; what is adopted is decided by the author alone.

Rules:
- Every quote is one continuous passage from the chapter you name under "kapitel" with its id, copied character for character from the <text>, without omissions, at most one sentence.
- The reason (begruendung) only describes how you infer from the evidence – briefly and factually.
- Better no entry than a guessed one. Deliberately vague or open passages stay open.

${ANTWORTSPRACHE_EN}`;

// ---------------------------------------------------------------------------
// Hilfen (bewusst lokal: core/ki importiert nur model, text, projekt/lesen)
// ---------------------------------------------------------------------------

const TAGESZEIT_TEXT: Record<Tageszeit, string> = {
  frueh: 'frueh (ca. 4–7 Uhr)',
  morgens: 'morgens (ca. 6–10 Uhr)',
  vormittags: 'vormittags (ca. 9–12 Uhr)',
  mittags: 'mittags (ca. 11–14 Uhr)',
  nachmittags: 'nachmittags (ca. 13–18 Uhr)',
  abends: 'abends (ca. 17–23 Uhr)',
  nachts: 'nachts (ca. 21–5 Uhr)',
};

/** Englische Erklärung der (deutschen) Enum-Werte für die Tageszeit. */
const TAGESZEIT_TEXT_EN: Record<Tageszeit, string> = {
  frueh: 'frueh (early morning, approx. 4–7 am)',
  morgens: 'morgens (morning, approx. 6–10 am)',
  vormittags: 'vormittags (late morning, approx. 9 am–12 noon)',
  mittags: 'mittags (midday, approx. 11 am–2 pm)',
  nachmittags: 'nachmittags (afternoon, approx. 1–6 pm)',
  abends: 'abends (evening, approx. 5–11 pm)',
  nachts: 'nachts (night, approx. 9 pm–5 am)',
};

const WOCHENTAG_EN: Record<Wochentag, string> = {
  montag: 'Monday',
  dienstag: 'Tuesday',
  mittwoch: 'Wednesday',
  donnerstag: 'Thursday',
  freitag: 'Friday',
  samstag: 'Saturday',
  sonntag: 'Sunday',
};

/** großzügige Spanne je Tageszeit in Minuten ab 0 Uhr (Nacht über Mitternacht: +1440) */
const SPANNE: Record<Tageszeit, [number, number]> = {
  frueh: [240, 450],
  morgens: [360, 630],
  vormittags: [540, 750],
  mittags: [660, 870],
  nachmittags: [780, 1110],
  abends: [1020, 1410],
  nachts: [1260, 1740],
};

/** „23:00“, „7.05“, „23 Uhr“, „11 pm“, „7:05 a.m.“ → „HH:MM“; null = ungültig */
export function zeitUhrzeit(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr|h|([ap])\.?\s?m\.?)?$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (m[3]) {
    // 12-Stunden-Angabe (englisch): 12 am = 0 Uhr, 12 pm = 12 Uhr
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  }
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h % 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function uhrzeitPasst(tageszeit: Tageszeit, uhrzeit: string): boolean {
  const [h, m] = uhrzeit.split(':').map(Number);
  let minute = (h ?? 0) * 60 + (m ?? 0);
  if (minute < 300) minute += 1440;
  const [von, bis] = SPANNE[tageszeit];
  return minute >= von && minute <= bis;
}

function wochentagVonDatum(iso: string): Wochentag | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return WOCHENTAGE[(d.getUTCDay() + 6) % 7]!;
}

/** Anzahl der Abschnitte zwischen Szenentrennern im Klartext */
export function szenenImText(text: string): number {
  return text.split('\n\n').filter((a) => a.trim() === '* * *').length + 1;
}

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

function kapitelImAuftrag(kontext: BuchKontext, auftrag: ZeitAuftrag): KontextKapitel[] {
  const mitText = kontext.kapitel.filter((k) => k.text.trim());
  if (!auftrag.kapitel) return mitText;
  const wahl = new Set(auftrag.kapitel);
  return mitText.filter((k) => wahl.has(k.id));
}

function geplanteSzenen(auftrag: ZeitAuftrag, kapitel: Id): ZeitSzene[] {
  const s = auftrag.szenen?.[kapitel] ?? [];
  return s.length >= 2 ? [...s].sort((a, b) => a.index - b.index) : [];
}

function kapitelZeile(k: KontextKapitel, auftrag: ZeitAuftrag, sprache?: Sprache): string {
  const szenen = geplanteSzenen(auftrag, k.id);
  const imText = szenenImText(k.text);
  const basis = `- ${kapKurz(k.nr, sprache)} (id: ${k.id})`;
  if (sprache === 'en') {
    if (!szenen.length || imText < 2) return `${basis} · as a whole (szene 0)`;
    return `${basis} · ${imText} scenes, separated by “* * *” (szene 1–${imText}; szene 0 = whole chapter)`;
  }
  if (!szenen.length || imText < 2) return `${basis} · als Ganzes (szene 0)`;
  return `${basis} · ${imText} Szenen, getrennt durch „* * *“ (szene 1–${imText}; szene 0 = ganzes Kapitel)`;
}

/** Ordnet „Szene n“ (1-basiert) einer geplanten Szene zu; 0/kein Plan = ganzes Kapitel. Fehlertext bei Unbekanntem. */
function szeneZu(auftrag: ZeitAuftrag, k: KontextKapitel, roh: unknown, oberflaeche: Sprache = 'de'): { szene?: Id } | string {
  const n = typeof roh === 'number' && Number.isInteger(roh) ? roh : 0;
  const szenen = geplanteSzenen(auftrag, k.id);
  if (n <= 0 || !szenen.length) return {};
  const s = szenen.find((x) => x.index === n - 1);
  return s ? { szene: s.id } : meldungenIn(oberflaeche)('szeneNichtGeplant', { n, nr: k.nr });
}

function belegeMitKapitel(p: AufgabenPruefung, roh: unknown, eintrag: unknown, k: KontextKapitel, bis: ReadonlySet<Id>): Zitat[] | null {
  const zitate = p.zitate(roh, eintrag, { kapitel: bis });
  if (!zitate) return null;
  if (!zitate.some((z) => z.kapitel === k.id)) {
    p.verwerfen(meldungenIn(p.oberflaeche)('keinBelegAusKapitel', { nr: k.nr }), eintrag);
    return null;
  }
  return zitate;
}

/** Kapitel bis einschließlich k (Belege dürfen aus früheren Kapiteln kommen, z. B. „am Abend davor“). */
function bisKapitel(kontext: BuchKontext, k: KontextKapitel): Set<Id> {
  return new Set(kontext.kapitel.filter((x) => x.nr <= k.nr).map((x) => x.id));
}

// ---------------------------------------------------------------------------
// Zeitpunkte
// ---------------------------------------------------------------------------

function zeitAufgabeEn(kapitel: KontextKapitel[], auftrag: ZeitAuftrag): string {
  const z: string[] = [];
  z.push('Determine when the following chapters or scenes take place – as precisely as the text allows:');
  for (const k of kapitel) z.push(kapitelZeile(k, auftrag, 'en'));
  z.push('');
  z.push(
    'Count story days from the first day of the book’s action: the day on which Ch. 1 takes place is day 1 (unless it is a flashback). Flashbacks before the start of the action get day 0 or a negative day. Read the whole book for this, including chapters outside the list.',
  );
  z.push('For each entry:');
  z.push('- kapitel: id of the chapter; szene: number of the scene in the chapter (1 = text before the first “* * *”) or 0 for the whole chapter. Give scenes separately only if the time changes within the chapter.');
  z.push('- tag: story day as a whole number in text form (“1”, “8”, “-2”) or "" if it cannot be inferred');
  z.push(`- wochentag: ${WOCHENTAGE.map((w) => `${w} (${WOCHENTAG_EN[w]})`).join(', ')} – only if the text names it or it follows unambiguously, otherwise ""`);
  z.push('- datum: YYYY-MM-DD only if the text names a date, otherwise ""');
  z.push(`- tageszeit: ${TAGESZEITEN.map((t) => TAGESZEIT_TEXT_EN[t]).join(', ')} or ""`);
  z.push('- uhrzeit: “HH:MM” (24-hour clock) only if the text names a time (“shortly after eleven” in the evening → “23:00”), otherwise ""');
  z.push('- dauer: duration in minutes if the text names it, otherwise 0');
  z.push('- sicherheit: "fest" if the text states it explicitly; "ungefaehr" if you infer it');
  z.push('- belege: one to three verbatim quotes, at least one from the chapter itself – the passages that name the time or make it recognisable');
  z.push('- begruendung: one or two sentences on how you infer the time from the evidence');
  z.push('Leave out chapters for which the text gives no clue at all. Never return only a sicherheit without a time.');
  return z.join('\n');
}

function zeitAufgabe(kontext: BuchKontext, auftrag: ZeitAuftrag, oberflaeche: Sprache = 'de'): string {
  const kapitel = kapitelImAuftrag(kontext, auftrag);
  if (!kapitel.length) throw new KiFehler('auftrag', meldungenIn(oberflaeche)('keinKapitelMitText'));
  if (kontext.sprache === 'en') return zeitAufgabeEn(kapitel, auftrag);
  const z: string[] = [];
  z.push('Bestimme, wann die folgenden Kapitel bzw. Szenen spielen – so genau, wie der Text es hergibt:');
  for (const k of kapitel) z.push(kapitelZeile(k, auftrag));
  z.push('');
  z.push('Zähle Handlungstage ab dem ersten Tag der Handlung des Buchs: Der Tag, an dem Kap. 1 spielt, ist Tag 1 (sofern es keine Rückblende ist). Rückblenden vor Beginn der Handlung bekommen Tag 0 oder einen negativen Tag. Lies dafür das ganze Buch, auch Kapitel außerhalb der Liste.');
  z.push('Für jeden Eintrag:');
  z.push('- kapitel: id des Kapitels; szene: Nummer der Szene im Kapitel (1 = Text vor dem ersten „* * *“) oder 0 für das ganze Kapitel. Szenen nur einzeln, wenn sich die Zeit innerhalb des Kapitels ändert.');
  z.push('- tag: Handlungstag als ganze Zahl in Textform („1“, „8“, „-2“) oder "", wenn er sich nicht erschließen lässt');
  z.push(`- wochentag: ${WOCHENTAGE.join(', ')} – nur wenn der Text ihn nennt oder er sich eindeutig ergibt, sonst ""`);
  z.push('- datum: JJJJ-MM-TT nur, wenn der Text ein Datum nennt, sonst ""');
  z.push(`- tageszeit: ${TAGESZEITEN.map((t) => TAGESZEIT_TEXT[t]).join(', ')} oder ""`);
  z.push('- uhrzeit: „HH:MM“ (24 h) nur, wenn der Text eine Uhrzeit nennt („kurz nach elf“ am Abend → „23:00“), sonst ""');
  z.push('- dauer: Dauer in Minuten, wenn der Text sie nennt, sonst 0');
  z.push('- sicherheit: "fest", wenn der Text die Angabe ausdrücklich nennt; "ungefaehr", wenn du sie erschließt');
  z.push('- belege: ein bis drei wörtliche Zitate, mindestens eines aus dem Kapitel selbst – die Stellen, die die Zeit nennen oder erkennen lassen');
  z.push('- begruendung: ein bis zwei Sätze, wie du aus den Belegen auf den Zeitpunkt schließt');
  z.push('Lass Kapitel weg, für die der Text keinerlei Anhaltspunkt gibt. Gib nie nur eine Sicherheit ohne Zeitangabe zurück.');
  return z.join('\n');
}

export function zeitSchema(kontext: BuchKontext): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id) };
  return obj({
    zeitpunkte: {
      type: 'array',
      items: obj({
        kapitel,
        szene: { type: 'integer' },
        tag: { type: 'string' },
        wochentag: { type: 'string', enum: [...WOCHENTAGE, ''] },
        datum: { type: 'string' },
        tageszeit: { type: 'string', enum: [...TAGESZEITEN, ''] },
        uhrzeit: { type: 'string' },
        dauer: { type: 'integer' },
        sicherheit: { type: 'string', enum: ['fest', 'ungefaehr'] },
        belege: { type: 'array', items: obj({ kapitel, text: { type: 'string' } }) },
        begruendung: { type: 'string' },
      }),
    },
  });
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Zeitangaben eines Eintrags prüfen; Fehlertext (in der Oberflächensprache) oder Zeitpunkt. */
export function leseZeitAngaben(e: Record<string, unknown>, oberflaeche: Sprache = 'de'): Zeitpunkt | string {
  const m = meldungenIn(oberflaeche);
  const zeit: Zeitpunkt = { sicherheit: (e.sicherheit === 'fest' ? 'fest' : 'ungefaehr') as ZeitSicherheit };
  const tag = s(e.tag);
  if (tag) {
    if (!/^[+-]?\d{1,4}$/.test(tag)) return m('tagKeineZahl', { tag });
    zeit.tag = Number(tag);
  }
  const w = s(e.wochentag);
  if (w) {
    const klein = w.toLocaleLowerCase('de');
    const wt = WOCHENTAGE.find((x) => x === klein || WOCHENTAG_EN[x].toLowerCase() === klein);
    if (!wt) return m('wochentagUnbekannt', { wochentag: w });
    zeit.wochentag = wt;
  }
  const datum = s(e.datum);
  if (datum) {
    const wd = wochentagVonDatum(datum);
    if (!wd) return m('datumUngueltig', { datum });
    if (zeit.wochentag && zeit.wochentag !== wd) return m('wochentagPasstNicht', { datum });
    zeit.datum = datum;
  }
  const tz = s(e.tageszeit);
  if (tz) {
    const t = TAGESZEITEN.find((x) => x === tz);
    if (!t) return m('tageszeitUnbekannt', { tageszeit: tz });
    zeit.tageszeit = t;
  }
  const u = s(e.uhrzeit);
  if (u) {
    const norm = zeitUhrzeit(u);
    if (!norm) return m('uhrzeitUngueltig', { uhrzeit: u });
    if (zeit.tageszeit && !uhrzeitPasst(zeit.tageszeit, norm)) return m('uhrzeitPasstNicht', { uhrzeit: norm, tageszeit: zeit.tageszeit });
    zeit.uhrzeit = norm;
  }
  if (typeof e.dauer === 'number' && Number.isInteger(e.dauer) && e.dauer > 0 && e.dauer <= 7 * 1440) zeit.dauer = e.dauer;
  if (zeit.tag === undefined && !zeit.wochentag && !zeit.datum && !zeit.tageszeit && !zeit.uhrzeit) return m('ohneZeitangabe');
  return zeit;
}

/** Antwort „zeit“ auswerten (auch einzeln testbar). */
export function werteZeitAus(daten: unknown, p: AufgabenPruefung, auftrag: ZeitAuftrag): ZeitAufgabenErgebnis {
  const umfang = kapitelImAuftrag(p.kontext, auftrag);
  const ergebnis: ZeitAufgabenErgebnis = { vorschlaege: [], kapitel: umfang.map((k) => k.id) };
  const m = meldungenIn(p.oberflaeche);
  const d = (daten ?? {}) as Record<string, unknown>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.zeitpunkte)) {
    p.verwerfen(m('schemaFalsch'), daten);
    return ergebnis;
  }
  const imAuftrag = new Set(ergebnis.kapitel);
  for (const roh of d.zeitpunkte) {
    const e = (roh ?? {}) as Record<string, unknown>;
    const k = p.kapitel(e.kapitel);
    if (!k) {
      p.verwerfen(m('kapitelUnbekannt', { kapitel: String(e.kapitel) }), roh);
      continue;
    }
    if (!imAuftrag.has(k.id)) {
      p.verwerfen(m('kapitelNichtImAuftrag', { nr: k.nr }), roh);
      continue;
    }
    const sz = szeneZu(auftrag, k, e.szene, p.oberflaeche);
    if (typeof sz === 'string') {
      p.verwerfen(sz, roh);
      continue;
    }
    const zeit = leseZeitAngaben(e, p.oberflaeche);
    if (typeof zeit === 'string') {
      p.verwerfen(m('kapitelGrund', { nr: k.nr, grund: zeit }), roh);
      continue;
    }
    const belege = belegeMitKapitel(p, e.belege, roh, k, bisKapitel(p.kontext, k));
    if (!belege) continue;
    const begruendung = p.text(e.begruendung, roh, { pflicht: true });
    if (begruendung === null) continue;
    const schluessel = sz.szene ? `zeit:${k.id}#${sz.szene}` : `zeit:${k.id}`;
    if (ergebnis.vorschlaege.some((v) => v.schluessel === schluessel)) {
      p.verwerfen(sz.szene ? m('doppelterEintragSzene', { nr: k.nr, szene: String(e.szene) }) : m('doppelterEintrag', { nr: k.nr }), roh);
      continue;
    }
    ergebnis.vorschlaege.push({
      schluessel,
      kapitel: k.id,
      ...(sz.szene ? { szene: sz.szene } : {}),
      zeit,
      belege,
      begruendung,
      status: 'neu',
    });
  }
  const reihe = new Map(p.kontext.kapitel.map((k) => [k.id, k.nr]));
  ergebnis.vorschlaege.sort((a, b) => (reihe.get(a.kapitel) ?? 0) - (reihe.get(b.kapitel) ?? 0));
  return ergebnis;
}

/** Aufgabendefinition „Zeitpunkte vorschlagen“. */
export function zeitDefinition(auftrag: ZeitAuftrag = {}): AufgabenDefinition<ZeitAufgabenErgebnis> {
  const rolle: KiRolle = auftrag.tiefencheck ? 'tiefencheck' : 'pruefung';
  return {
    name: 'Zeitpunkte',
    nameEn: meldungenIn('en')('nameZeit'),
    art: ZEIT_ART,
    rolle,
    system: SYSTEM_ZEIT,
    systemEn: SYSTEM_ZEIT_EN,
    ausgabeSchaetzung: auftrag.tiefencheck ? 8000 : 4000,
    aufgabe: (kontext, oberflaeche) => zeitAufgabe(kontext, auftrag, oberflaeche),
    schema: zeitSchema,
    auswerten: (daten, p) => werteZeitAus(daten, p, auftrag),
  };
}

export function schlageZeitpunkteVor(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: ZeitAuftrag = {},
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<ZeitAufgabenErgebnis>> {
  return fuehreAufgabeAus(leser, transport, einstellungen, zeitDefinition(auftrag), optionen);
}

export function schaetzeZeitpunkte(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: ZeitAuftrag = {},
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  return schaetzeAufgabe(leser, transport, einstellungen, zeitDefinition(auftrag), oberflaeche);
}

// ---------------------------------------------------------------------------
// Figurenzustände
// ---------------------------------------------------------------------------

function figurZeile(f: KontextFigur, sprache?: Sprache): string {
  if (sprache === 'en') {
    const teile = [`${f.name} (id: ${f.id})`, f.rolle === 'haupt' ? 'main character' : 'minor character'];
    if (f.aliase.length) teile.push(`also called: ${f.aliase.join(', ')}`);
    return teile.join(' · ');
  }
  const teile = [`${f.name} (id: ${f.id})`, f.rolle === 'haupt' ? 'Hauptfigur' : 'Nebenfigur'];
  if (f.aliase.length) teile.push(`auch genannt: ${f.aliase.join(', ')}`);
  return teile.join(' · ');
}

function zustandAufgabeEn(f: KontextFigur, kapitel: KontextKapitel[], auftrag: ZustandAuftrag): string {
  const z: string[] = [];
  z.push(`Character: ${figurZeile(f, 'en')}`);
  z.push('');
  z.push(`Determine which state ${f.name} is in during the following chapters or scenes:`);
  for (const k of kapitel) z.push(kapitelZeile(k, auftrag, 'en'));
  z.push('');
  z.push('Possible states (zustand = id):');
  for (const a of auftrag.arten) z.push(`- ${a.id}: “${a.name}”`);
  z.push('');
  z.push(
    `Report a state only if the text shows it or clearly suggests it (alcohol, drugs, hangover, memory gap, lack of sleep …). Report an unremarkable normal state only if the text emphasises it or it changes compared with the passage before. If ${f.name} does not appear in a chapter or the text says nothing about it, leave it out.`,
  );
  z.push('For each entry:');
  z.push('- kapitel: id of the chapter; szene: number of the scene (1 = text before the first “* * *”) or 0 for the whole chapter');
  z.push('- zustand: an id from the list');
  z.push(`- belege: one to three verbatim quotes from this chapter that show the state of ${f.name}`);
  z.push('- begruendung: one sentence on how the state can be recognised');
  return z.join('\n');
}

function zustandAufgabe(kontext: BuchKontext, auftrag: ZustandAuftrag, oberflaeche: Sprache = 'de'): string {
  const m = meldungenIn(oberflaeche);
  const f = kontext.figuren.find((x) => x.id === auftrag.figur);
  if (!f) throw new KiFehler('auftrag', m('figurFehlt', { figur: auftrag.figur }));
  if (!auftrag.arten.length) throw new KiFehler('auftrag', m('keineZustaende'));
  const kapitel = kapitelImAuftrag(kontext, auftrag);
  if (!kapitel.length) throw new KiFehler('auftrag', m('keinKapitelMitText'));
  if (kontext.sprache === 'en') return zustandAufgabeEn(f, kapitel, auftrag);
  const z: string[] = [];
  z.push(`Figur: ${figurZeile(f)}`);
  z.push('');
  z.push(`Bestimme, in welchem Zustand ${f.name} in den folgenden Kapiteln bzw. Szenen ist:`);
  for (const k of kapitel) z.push(kapitelZeile(k, auftrag));
  z.push('');
  z.push('Mögliche Zustände (zustand = id):');
  for (const a of auftrag.arten) z.push(`- ${a.id}: „${a.name}“`);
  z.push('');
  z.push(
    `Melde einen Zustand nur, wenn der Text ihn zeigt oder deutlich nahelegt (Alkohol, Drogen, Kater, Erinnerungslücke, Schlafmangel …). Einen unauffälligen Normalzustand meldest du nur, wenn der Text ihn betont oder er sich gegenüber der Stelle davor ändert. Kommt ${f.name} in einem Kapitel nicht vor oder sagt der Text nichts dazu, lass es weg.`,
  );
  z.push('Für jeden Eintrag:');
  z.push('- kapitel: id des Kapitels; szene: Nummer der Szene (1 = Text vor dem ersten „* * *“) oder 0 für das ganze Kapitel');
  z.push('- zustand: eine id aus der Liste');
  z.push(`- belege: ein bis drei wörtliche Zitate aus diesem Kapitel, die den Zustand von ${f.name} zeigen`);
  z.push('- begruendung: ein Satz, woran man den Zustand erkennt');
  return z.join('\n');
}

export function zustandSchema(kontext: BuchKontext, arten: { id: Id }[]): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id) };
  return obj({
    zustaende: {
      type: 'array',
      items: obj({
        kapitel,
        szene: { type: 'integer' },
        zustand: { type: 'string', enum: arten.map((a) => a.id) },
        belege: { type: 'array', items: obj({ kapitel, text: { type: 'string' } }) },
        begruendung: { type: 'string' },
      }),
    },
  });
}

/** Antwort „zustand“ auswerten (auch einzeln testbar). */
export function werteZustandAus(daten: unknown, p: AufgabenPruefung, auftrag: ZustandAuftrag): ZustandAufgabenErgebnis {
  const umfang = kapitelImAuftrag(p.kontext, auftrag);
  const ergebnis: ZustandAufgabenErgebnis = { figur: auftrag.figur, vorschlaege: [], kapitel: umfang.map((k) => k.id) };
  const m = meldungenIn(p.oberflaeche);
  const d = (daten ?? {}) as Record<string, unknown>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.zustaende)) {
    p.verwerfen(m('schemaFalsch'), daten);
    return ergebnis;
  }
  const imAuftrag = new Set(ergebnis.kapitel);
  const arten = new Set(auftrag.arten.map((a) => a.id));
  for (const roh of d.zustaende) {
    const e = (roh ?? {}) as Record<string, unknown>;
    const k = p.kapitel(e.kapitel);
    if (!k) {
      p.verwerfen(m('kapitelUnbekannt', { kapitel: String(e.kapitel) }), roh);
      continue;
    }
    if (!imAuftrag.has(k.id)) {
      p.verwerfen(m('kapitelNichtImAuftrag', { nr: k.nr }), roh);
      continue;
    }
    const zustand = s(e.zustand);
    if (!arten.has(zustand)) {
      p.verwerfen(m('zustandUnbekannt', { zustand }), roh);
      continue;
    }
    const sz = szeneZu(auftrag, k, e.szene, p.oberflaeche);
    if (typeof sz === 'string') {
      p.verwerfen(sz, roh);
      continue;
    }
    const belege = p.zitate(e.belege, roh, { kapitel: new Set([k.id]) });
    if (!belege) continue;
    const begruendung = p.text(e.begruendung, roh, { pflicht: true });
    if (begruendung === null) continue;
    const schluessel = sz.szene ? `zustand:${auftrag.figur}@${k.id}#${sz.szene}` : `zustand:${auftrag.figur}@${k.id}`;
    if (ergebnis.vorschlaege.some((v) => v.schluessel === schluessel)) {
      p.verwerfen(m('doppelterEintrag', { nr: k.nr }), roh);
      continue;
    }
    ergebnis.vorschlaege.push({
      schluessel,
      figur: auftrag.figur,
      kapitel: k.id,
      ...(sz.szene ? { szene: sz.szene } : {}),
      zustand,
      belege,
      begruendung,
      status: 'neu',
    });
  }
  const reihe = new Map(p.kontext.kapitel.map((k) => [k.id, k.nr]));
  ergebnis.vorschlaege.sort((a, b) => (reihe.get(a.kapitel) ?? 0) - (reihe.get(b.kapitel) ?? 0));
  return ergebnis;
}

/** Aufgabendefinition „Zustände einer Figur vorschlagen“. */
export function zustandDefinition(auftrag: ZustandAuftrag): AufgabenDefinition<ZustandAufgabenErgebnis> {
  const rolle: KiRolle = auftrag.tiefencheck ? 'tiefencheck' : 'pruefung';
  return {
    name: 'Zustände',
    nameEn: meldungenIn('en')('nameZustand'),
    art: ZUSTAND_ART,
    attribute: { figur: auftrag.figur },
    rolle,
    system: SYSTEM_ZEIT,
    systemEn: SYSTEM_ZEIT_EN,
    ausgabeSchaetzung: auftrag.tiefencheck ? 6000 : 3000,
    aufgabe: (kontext, oberflaeche) => zustandAufgabe(kontext, auftrag, oberflaeche),
    schema: (kontext) => zustandSchema(kontext, auftrag.arten),
    auswerten: (daten, p) => werteZustandAus(daten, p, auftrag),
  };
}

export function schlageZustaendeVor(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: ZustandAuftrag,
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<ZustandAufgabenErgebnis>> {
  return fuehreAufgabeAus(leser, transport, einstellungen, zustandDefinition(auftrag), optionen);
}

export function schaetzeZustaende(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: ZustandAuftrag,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  return schaetzeAufgabe(leser, transport, einstellungen, zustandDefinition(auftrag), oberflaeche);
}
