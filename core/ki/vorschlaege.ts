/**
 * KI-Vorschläge für Figuren, Orte und Beziehungen aus dem Manuskript. Leon übernimmt oder verwirft sie.
 *
 * HARTE REGEL: Dieses Modul bekommt nur ProjektLeser und KiTransport und legt selbst nichts an. Das Ergebnis
 * speichert der Store in .plotwerk/vorschlaege.json (E2); übernommen wird nur auf Leons Klick.
 *
 * Ein Request für das ganze Buch (Deployment „pruefung“ = Sonnet, Tiefencheck: Opus) mit dem Buchkontext
 * als gecachtem Prefix (E12 Allowlist, E13). Antwortprüfung wie in pruefung.ts: jedes Zitat wörtlich (E6),
 * nur bekannte Referenzen, kein Ersatztext in kurz/art/begruendung, Beziehungen zu bewusst vagen Figuren
 * immer „unsicher“. Bereits angelegte und von Leon entschiedene Vorschläge kommen nicht wieder.
 * Request-Form (System-Prompt, Aufgabe, Schema): core/ki/README.md.
 */
import type {
  BeziehungsKategorie,
  BeziehungsVorschlag,
  FigurRolle,
  FigurVorschlag,
  Id,
  KiEinstellungen,
  KiVorschlaege,
  OrtVorschlag,
  ProjektDaten,
  VorschlagsStatus,
  VorschlagsVerweis,
  Zitat,
} from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { ladeProjekt } from '../projekt/lesen';
import { normalisiere } from '../text';
import { baueAnfrage, EFFORT, prefixZaehlBody, zaehlBody } from './anfrage';
import { KiFehler, LEERE_NUTZUNG, leseAntwort, type Nutzung } from './antwort';
import { kiModell } from './anbieter';
import { kostenUsd, preisFuer } from './kosten';
import { meldungenIn } from './meldungen';
import { baueBuchKontext, type BuchKontext, type KontextFigur, type KontextOrt } from './kontext';
import { ersatztextGrund, fremdesZitat, loseEndeId, Pruefer, type Verworfen, type ZitatStelle } from './pruefung';
import type { KiTransport, Schaetzung } from './index';
import { ANTWORTSPRACHE_EN, systemFuer, type Sprache } from './sprache';

// ---------------------------------------------------------------------------
// Request: System-Prompt, Aufgabe, Schema
// ---------------------------------------------------------------------------

/** Eigene Obergrenze: ein Request für das ganze Buch, die Liste kann lang werden (inkl. adaptivem Denken). */
export const VORSCHLAG_MAX_TOKENS = 32000;

/** Geschätzte Ausgabe-Tokens (inkl. Denken), bewusst großzügig. */
export const VORSCHLAG_AUSGABE_SCHAETZUNG = { pruefung: 8000, tiefencheck: 14000 } as const;

/** Standard-Deployments (entspricht STANDARD_KI in index.ts). */
const STANDARD_MODELL = { pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' } as const;

/** Höchstzahl Wörter für die Bezeichnung einer Beziehung (art). */
export const ART_MAX_WOERTER = 4;

export const BEZIEHUNGS_KATEGORIEN = ['arbeit', 'dates', 'sonstige'] as const;

export const SYSTEM_VORSCHLAEGE = `Du hilfst einem Autor, die Figuren, Orte und Beziehungen seines deutschsprachigen Romanmanuskripts zu erfassen. Du liest das Buch so, wie eine Leserin es liest: den Text der Kapitel in ihrer Reihenfolge und die wenigen Angaben des Autors zu bereits angelegten Figuren, Orten und Gruppen. Dazu kommt die Planung des Autors (Zeilen „Planung“ bei Figuren, <plan> bei Kapiteln); sie gehört nicht zum Buch und ist nie ein Beleg.

Du machst Vorschläge, die der Autor einzeln übernimmt oder verwirft. Du schreibst nie Text für das Buch: keine Umformulierungen, keine Ersatzsätze, keine Formulierungsvorschläge. Du legst nichts fest, was der Text offenlässt.

Figuren (figuren):
- Schlage jede Person vor, die im Text handelt, spricht oder mit Namen bzw. fester Bezeichnung erwähnt wird (zum Beispiel „der Mann am Fischstand“), und die noch nicht unter den angelegten Figuren steht. Ein namenloser Ich-Erzähler ist keine eigene Figur, wenn er erkennbar eine angelegte oder vorgeschlagene Figur ist.
- name: der Eigenname der Person (Vorname, Nachname oder beides), sobald der Text ihn irgendwo nennt, auch wenn sie meist anders genannt wird. Spitznamen, Titel und Bezeichnungen (zum Beispiel „die Chefin“, „der Alte“) gehören dann zu aliase. Nur wenn der Text keinen Eigennamen nennt, ist name die Bezeichnung, unter der die Person am häufigsten vorkommt. aliase: weitere Namen, Spitznamen und Bezeichnungen derselben Person, Zeichen für Zeichen wie im Text, ohne Genitivformen.
- Eine Person ist genau ein Vorschlag: Schlage niemanden zweimal unter verschiedenen Namen vor.
- rolle: haupt für Figuren, die das Buch tragen (Erzähler, wiederkehrende zentrale Figuren), sonst neben.
- kurz: eine sachliche Zeile, höchstens vier Wörter, was der Text über die Figur sagt (zum Beispiel „Kollege der Hauptfigur“ oder „Jugendfreundin“); sie steht als Untertitel auf der Karte im Beziehungsnetz. Keine Deutung, keine Vermutung über Verborgenes.
- belege: eine bis drei Stellen, an denen die Figur vorkommt.

Orte (orte):
- Schlage Orte vor, an denen Szenen spielen oder die mit Namen erwähnt werden, und die noch nicht unter den angelegten Orten stehen.
- name und aliase wie bei Figuren. in: der Name des übergeordneten Orts (angelegt oder ebenfalls vorgeschlagen, zum Beispiel ein Besprechungsraum im Büro), sonst ein leerer Text.
- belege: eine bis drei Stellen.

Beziehungen (beziehungen):
- Eine Beziehung zwischen zwei Figuren, wenn der Text sie zeigt oder benennt: Arbeit, Dates und Liebe, Familie, Freundschaft, Bekanntschaft.
- von und zu: die id einer angelegten Figur oder genau der name einer Figur, die du unter figuren vorschlägst. Andere Personen kommen in Beziehungen nicht vor.
- art: kurze Bezeichnung der Beziehung aus Sicht von „von“, höchstens vier Wörter (zum Beispiel „Kollege“, „Chef“, „Jugendfreundin“).
- kategorie: arbeit (Beruf, Kollegen, Kunden), dates (Dates, Affären, Liebe), sonst sonstige.
- abKapitel: die id des Kapitels mit dem ersten Beleg.
- unsicher: true, wenn die Beziehung nur erwähnt, angedeutet oder offen ist. Beziehungen zu als „bewusst vage“ markierten Figuren sind immer unsicher.
- belege: mindestens eine Stelle, die die Beziehung zeigt.
- begruendung: ein sachlicher Satz, woran du die Beziehung im Text erkennst. Kein Vorschlag, wie der Text lauten könnte.

Regeln für alle Belege:
- kapitel ist die id des Kapitels, zitat eine zusammenhängende Passage, Zeichen für Zeichen aus dem <text> dieses Kapitels kopiert, ohne Auslassungen, höchstens ein Satz. Vorschläge ohne wörtliches Zitat werden verworfen.

Weitere Regeln:
- Angelegte Figuren und Orte (unter <angaben>) schlägst du nicht erneut vor, auch nicht unter einer anderen Schreibweise, einem Spitznamen oder einer Bezeichnung. Beziehungen zwischen angelegten Figuren darfst du vorschlagen.
- Als „bewusst vage“ markierte Figuren und Stellen sind absichtlich mehrdeutig. Lege über sie nichts fest, was der Text offenlässt.
- Lieber wenige belastbare Vorschläge als viele vage. Erfinde nichts, was nicht im Text steht.`;

/** Englische Fassung (Buchsprache en). Feldnamen und Enum-Werte bleiben wie im Schema. */
export const SYSTEM_VORSCHLAEGE_EN = `You help an author to capture the characters, places and relationships of their English-language novel manuscript. You read the book the way a reader does: the text of the chapters in their order and the author's few notes on characters, places and groups that are already set up. In addition there is the author's planning (lines “Plan” for characters, <plan> for chapters); it is not part of the book and never evidence.

You make suggestions which the author adopts or discards one by one. You never write text for the book: no rewordings, no replacement sentences, no suggested phrasings. You settle nothing that the text leaves open.

Characters (figuren):
- Suggest every person who acts, speaks or is mentioned by name or by a fixed designation in the text (for example “the man at the kiosk”) and who is not yet among the characters set up. A nameless first-person narrator is not a separate character if they are recognisably a character that is set up or suggested.
- name: the person's proper name (first name, surname or both) as soon as the text gives it anywhere, even if they are mostly called something else. Nicknames, titles and designations (for example “the boss”, “the old man”) then belong in aliase. Only if the text gives no proper name is name the designation the person appears under most often. aliase: further names, nicknames and designations of the same person, character for character as in the text, without possessive forms (’s).
- One person is exactly one suggestion: never suggest someone twice under different names.
- rolle: haupt for characters who carry the book (narrators, recurring central characters), otherwise neben.
- kurz: one factual line, at most four words, on what the text says about the character (for example “Paul's colleague” or “Kleinanzeigen match”); it appears as a subtitle on the card in the relationship web. No interpretation, no speculation about hidden things.
- belege: one to three passages where the character appears.

Places (orte):
- Suggest places where scenes take place or that are mentioned by name, and that are not yet among the places set up.
- name and aliase as for characters. in: the name of the enclosing place (set up or also suggested, for example a meeting room in the office), otherwise an empty string.
- belege: one to three passages.

Relationships (beziehungen):
- A relationship between two characters if the text shows or names it: work, dates and love, family, friendship, acquaintance.
- von and zu: the id of a character that is set up, or exactly the name of a character you suggest under figuren. Other people do not appear in relationships.
- art: a short designation of the relationship from the point of view of “von”, at most four words (for example “colleague”, “boss”, “Kleinanzeigen match”).
- kategorie: arbeit (job, colleagues, clients), dates (dates, affairs, love), otherwise sonstige.
- abKapitel: the id of the chapter with the first piece of evidence.
- unsicher: true if the relationship is only mentioned, hinted at or open. Relationships to characters marked “deliberately vague” are always unsicher.
- belege: at least one passage that shows the relationship.
- begruendung: one factual sentence on how you recognise the relationship in the text. No suggestion of how the text could read.

Rules for all evidence:
- kapitel is the id of the chapter, zitat one continuous passage, copied character for character from the <text> of that chapter, without omissions, at most one sentence. Suggestions without a verbatim quote are discarded.

Further rules:
- Do not suggest characters and places that are set up (under <angaben>) again, not even under a different spelling, a nickname or a designation. You may suggest relationships between characters that are set up.
- Characters and passages marked “deliberately vague” are intentionally ambiguous. Settle nothing about them that the text leaves open.
- Prefer a few solid suggestions to many vague ones. Invent nothing that is not in the text.

${ANTWORTSPRACHE_EN}`;

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const str = { type: 'string' };
const liste = (items: unknown) => ({ type: 'array', items });

/** Kapitel-IDs mit Text (enum im Schema). */
function kapitelIds(kontext: BuchKontext): Id[] {
  return kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id);
}

/** Antwortschema (Structured Outputs). Kein Feld für Ersatztext, keins für private Felder. */
export function vorschlagsSchema(kontext: BuchKontext): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kapitelIds(kontext) };
  const belege = liste(obj({ kapitel, zitat: str }));
  return obj({
    figuren: liste(
      obj({
        name: str,
        aliase: liste(str),
        rolle: { type: 'string', enum: ['haupt', 'neben'] },
        kurz: str,
        belege,
      }),
    ),
    orte: liste(obj({ name: str, aliase: liste(str), in: str, belege })),
    beziehungen: liste(
      obj({
        von: str,
        zu: str,
        art: str,
        kategorie: { type: 'string', enum: [...BEZIEHUNGS_KATEGORIEN] },
        abKapitel: kapitel,
        unsicher: { type: 'boolean' },
        belege,
        begruendung: str,
      }),
    ),
  });
}

export function vorschlagsAufgabe(sprache?: Sprache): string {
  if (sprache === 'en')
    return [
      '<aufgabe art="vorschlaege">',
      'Read the whole book and suggest characters, places and relationships between characters.',
      '- figuren and orte: only what is not yet set up under <angaben>.',
      '- beziehungen: between characters that are set up (von/zu = id) and suggested characters (von/zu = name, exactly as under figuren).',
      '- Every suggestion with verbatim evidence from the <text> of the chapters.',
      '</aufgabe>',
    ].join('\n');
  return [
    '<aufgabe art="vorschlaege">',
    'Lies das ganze Buch und schlage Figuren, Orte und Beziehungen zwischen Figuren vor.',
    '- figuren und orte: nur, was noch nicht unter <angaben> angelegt ist.',
    '- beziehungen: zwischen angelegten Figuren (von/zu = id) und vorgeschlagenen Figuren (von/zu = name, genau wie unter figuren).',
    '- Jeder Vorschlag mit wörtlichen Belegen aus dem <text> der Kapitel.',
    '</aufgabe>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Lauf planen
// ---------------------------------------------------------------------------

export interface VorschlagsOptionen {
  /** Opus (Deployment „tiefencheck“, effort high) statt Sonnet */
  tiefencheck?: boolean;
  /** Abbruch vor dem Senden */
  signal?: AbortSignal;
  jetzt?(): Date;
  /** Sprache der Meldungen (Fehler, Verwerfungsgründe); Standard Deutsch. Vorschläge selbst: Buchsprache. */
  oberflaeche?: Sprache;
}

type Rolle = 'pruefung' | 'tiefencheck';

interface VorschlagsLauf {
  daten: ProjektDaten;
  kontext: BuchKontext;
  rolle: Rolle;
  modell: string;
  body: Record<string, unknown>;
}

function modellFuer(einstellungen: KiEinstellungen | undefined, rolle: Rolle): string {
  // gewählter Anbieter (Foundry: Deployment-Name, Claude API: Modell-ID)
  return kiModell(einstellungen, rolle)?.trim() || STANDARD_MODELL[rolle];
}

function planeVorschlaege(daten: ProjektDaten, einstellungen: KiEinstellungen | undefined, optionen: VorschlagsOptionen): VorschlagsLauf {
  const kontext = baueBuchKontext(daten);
  if (kapitelIds(kontext).length === 0) throw new KiFehler('auftrag', meldungenIn(optionen.oberflaeche)('buchOhneText'));
  const rolle: Rolle = optionen.tiefencheck ? 'tiefencheck' : 'pruefung';
  const modell = modellFuer(einstellungen, rolle);
  const body = {
    ...baueAnfrage({
      modell,
      system: systemFuer(SYSTEM_VORSCHLAEGE, SYSTEM_VORSCHLAEGE_EN, kontext.sprache),
      kontext,
      aufgabe: vorschlagsAufgabe(kontext.sprache),
      schema: vorschlagsSchema(kontext),
      effort: EFFORT[rolle],
    }),
    max_tokens: VORSCHLAG_MAX_TOKENS,
  };
  return { daten, kontext, rolle, modell, body };
}

/** Der vollständige Messages-API-Body, wie er an das Modell ginge (z. B. um Antworten vorzubereiten). */
export async function vorschlagsAnfrage(
  leser: ProjektLeser,
  einstellungen?: KiEinstellungen,
  optionen: VorschlagsOptionen = {},
): Promise<Record<string, unknown>> {
  return planeVorschlaege(await ladeProjekt(leser), einstellungen, optionen).body;
}

async function zaehle(transport: KiTransport, body: Record<string, unknown>): Promise<{ tokens: number; gezaehlt: boolean }> {
  try {
    const n = await transport.tokenZaehlen(body);
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) return { tokens: Math.round(n), gezaehlt: true };
  } catch {
    // count_tokens nicht erreichbar → Schätzung über die Zeichenzahl
  }
  return { tokens: Math.ceil(JSON.stringify(body).length / 3), gezaehlt: false };
}

/** Schätzung vor dem Start: ein Request, Tokens (count_tokens, sonst Zeichen/3), grobe Kosten. */
export async function schaetzeVorschlaege(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  optionen: VorschlagsOptionen = {},
): Promise<Schaetzung> {
  const lauf = planeVorschlaege(await ladeProjekt(leser), einstellungen, optionen);
  const voll = await zaehle(transport, zaehlBody(lauf.body));
  const prefix = await zaehle(transport, prefixZaehlBody({ modell: lauf.modell, system: systemFuer(SYSTEM_VORSCHLAEGE, SYSTEM_VORSCHLAEGE_EN, lauf.kontext.sprache), kontext: lauf.kontext }));
  const prefixTokens = Math.min(prefix.tokens, voll.tokens);
  const ausgabe = VORSCHLAG_AUSGABE_SCHAETZUNG[lauf.rolle];
  const preis = preisFuer(lauf.modell, lauf.rolle, voll.tokens);
  return {
    rolle: lauf.rolle,
    modell: lauf.modell,
    kapitel: kapitelIds(lauf.kontext),
    uebersprungen: [],
    anfragen: 1,
    eingabeTokens: voll.tokens,
    prefixTokens,
    ausgabeTokens: ausgabe,
    kostenUsd: kostenUsd({ eingabe: voll.tokens - prefixTokens, ausgabe, cacheGelesen: 0, cacheGeschrieben: prefixTokens }, preis),
    gezaehlt: voll.gezaehlt && prefix.gezaehlt,
  };
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

export interface VorschlagsErgebnis {
  figuren: FigurVorschlag[];
  orte: OrtVorschlag[];
  beziehungen: BeziehungsVorschlag[];
  /** verworfene Modellausgaben mit Grund (Zitat nicht gefunden, unbekannte Figur, Ersatztext, …) */
  verworfen: Verworfen[];
  /** schon angelegte Figuren, Orte, Beziehungen (nicht erneut vorgeschlagen) */
  bereitsAngelegt: number;
  /** von Leon schon übernommen oder verworfen (kommt nicht wieder) */
  bereitsEntschieden: number;
  tokens: { eingabe: number; ausgabe: number; cacheGelesen: number };
  modell: string;
  kostenUsd: number;
  /** ISO-Zeitpunkt des Laufs */
  datum: string;
}

function fehlertext(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function ergebnisAus(lauf: VorschlagsLauf, roh: unknown, nutzung: Nutzung, jetzt: () => Date, oberflaeche: Sprache = 'de'): VorschlagsErgebnis {
  const geprueft = pruefeVorschlaege(lauf.daten, roh, lauf.kontext, oberflaeche);
  return {
    ...geprueft,
    tokens: { eingabe: nutzung.eingabe + nutzung.cacheGeschrieben, ausgabe: nutzung.ausgabe, cacheGelesen: nutzung.cacheGelesen },
    modell: lauf.modell,
    kostenUsd: kostenUsd(nutzung, preisFuer(lauf.modell, lauf.rolle, lauf.kontext.text.length / 3)),
    datum: jetzt().toISOString(),
  };
}

/** Ein Lauf: Request an das Modell, Antwort prüfen. Schreibt nichts (der Store speichert das Ergebnis). */
export async function schlageVorschlaegeVor(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  optionen: VorschlagsOptionen = {},
): Promise<VorschlagsErgebnis> {
  const oberflaeche = optionen.oberflaeche ?? 'de';
  const m = meldungenIn(oberflaeche);
  const lauf = planeVorschlaege(await ladeProjekt(leser), einstellungen, optionen);
  if (!(await transport.bereit())) {
    throw new KiFehler('nicht_bereit', m('nichtBereit'));
  }
  if (optionen.signal?.aborted) throw new KiFehler('abgebrochen', m('vorschlaegeAbgebrochen'));
  let antwort;
  try {
    antwort = leseAntwort(await transport.senden(lauf.body, { signal: optionen.signal }), oberflaeche);
  } catch (e) {
    throw e instanceof KiFehler ? e : new KiFehler('api', fehlertext(e));
  }
  if (antwort.daten === null) throw new KiFehler('antwort', antwort.grund ?? m('antwortOhneDaten'));
  return ergebnisAus(lauf, antwort.daten, antwort.nutzung, optionen.jetzt ?? (() => new Date()), oberflaeche);
}

function istNachricht(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.type === 'message' || o.type === 'error' || (Array.isArray(o.content) && 'stop_reason' in o);
}

/**
 * Lauf mit vorbereiteter Antwort: wertet ein Antwort-JSON genau wie schlageVorschlaegeVor aus, ohne Request.
 * `antwort` ist das JSON im Schema {figuren, orte, beziehungen} (Objekt oder JSON-Text) oder eine vollständige
 * Messages-API-Antwort ({type: 'message', content: [{type: 'text', text: '…'}], stop_reason, usage}).
 */
export async function werteVorschlagsAntwortAus(
  leser: ProjektLeser,
  antwort: unknown,
  optionen: VorschlagsOptionen & { einstellungen?: KiEinstellungen } = {},
): Promise<VorschlagsErgebnis> {
  const oberflaeche = optionen.oberflaeche ?? 'de';
  const m = meldungenIn(oberflaeche);
  const lauf = planeVorschlaege(await ladeProjekt(leser), optionen.einstellungen, optionen);
  let roh = antwort;
  let nutzung = LEERE_NUTZUNG;
  if (typeof roh === 'string') {
    try {
      roh = JSON.parse(roh);
    } catch {
      throw new KiFehler('antwort', m('keinJson'));
    }
  }
  if (istNachricht(roh)) {
    const a = leseAntwort(roh, oberflaeche);
    if (a.daten === null) throw new KiFehler('antwort', a.grund ?? m('antwortOhneDaten'));
    roh = a.daten;
    nutzung = a.nutzung;
  }
  return ergebnisAus(lauf, roh, nutzung, optionen.jetzt ?? (() => new Date()), oberflaeche);
}

// ---------------------------------------------------------------------------
// Schlüssel und Namen
// ---------------------------------------------------------------------------

export const figurSchluessel = (name: string): string => `figur:${loseEndeId(name)}`;
/** F-10: Spitznamen für eine angelegte Figur */
export const spitznamenSchluessel = (figur: Id, namen: string[]): string =>
  `spitzname:${figur}|${namen.map(loseEndeId).sort().join('+')}`;
export const ortSchluessel = (name: string): string => `ort:${loseEndeId(name)}`;

/** „beziehung:<slug a>|<slug b>@<abKapitel>“ – Paar alphabetisch, damit die Richtung keine Rolle spielt. */
export function beziehungSchluessel(nameA: string, nameB: string, abKapitel?: Id): string {
  const paar = [loseEndeId(nameA), loseEndeId(nameB)].sort().join('|');
  return `beziehung:${paar}${abKapitel ? `@${abKapitel}` : ''}`;
}

/** Paar-Teil eines Beziehungsschlüssels (ohne „@abKapitel“). */
export function paarVonSchluessel(schluessel: string): string {
  const i = schluessel.indexOf('@');
  return i < 0 ? schluessel : schluessel.slice(0, i);
}

function sauber(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

function nameSauber(v: unknown): string {
  return sauber(v)
    .replace(/^[»„“"‚‘'«›‹]+/u, '')
    .replace(/[«“”"‘’'»‹›]+$/u, '')
    .trim();
}

/** Vergleichsform eines Namens: normalisiert (E6), klein, ohne führenden Artikel (der/die/das …, the). */
export function namensForm(s: string): string {
  return normalisiere(s.trim())
    .text.trim()
    .toLocaleLowerCase('de')
    .replace(/^(der|die|das|den|dem|des|the)\s+/, '');
}

function figurNamen(f: { name: string; aliase?: string[]; formen?: string[] }): string[] {
  return [f.name, ...(f.aliase ?? []), ...(f.formen ?? [])];
}

const MIT_ARTIKEL = /^(der|die|das|den|dem|des|the)\s/i;

/**
 * Hauptname eines Figurvorschlags: Ist der vorgeschlagene Name eine Bezeichnung mit Artikel („der Alte“) und steht
 * unter den Aliasen ein Eigenname, wird der Eigenname zum Namen und die Bezeichnung zum Alias.
 */
export function hauptname(name: string, aliase: string[]): { name: string; aliase: string[] } {
  if (!MIT_ARTIKEL.test(name)) return { name, aliase };
  const eigen = aliase.find((a) => !MIT_ARTIKEL.test(a) && /^\p{Lu}/u.test(a));
  if (!eigen) return { name, aliase };
  return { name: eigen, aliase: [name, ...aliase.filter((a) => a !== eigen)] };
}

// ---------------------------------------------------------------------------
// Antwortprüfung
// ---------------------------------------------------------------------------

export interface GepruefteVorschlaege {
  figuren: FigurVorschlag[];
  orte: OrtVorschlag[];
  beziehungen: BeziehungsVorschlag[];
  verworfen: Verworfen[];
  bereitsAngelegt: number;
  bereitsEntschieden: number;
}

type FigurReferenz = { verweis: VorschlagsVerweis; vage: boolean } | { verworfen: string; entschieden: boolean } | null;

/**
 * Prüft das Antwort-JSON des Modells gegen das Projekt (rein, ohne Request). Entspricht der Prüfung in
 * schlageVorschlaegeVor; `kontext` wird bei Bedarf aus `daten` gebaut. `oberflaeche`: Sprache der Gründe.
 */
export function pruefeVorschlaege(
  daten: ProjektDaten,
  roh: unknown,
  kontext: BuchKontext = baueBuchKontext(daten),
  oberflaeche: Sprache = 'de',
): GepruefteVorschlaege {
  const m = meldungenIn(oberflaeche);
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) throw new KiFehler('antwort', m('schemaFalsch'));
  const d = roh as Record<string, unknown>;
  const rohFiguren = Array.isArray(d.figuren) ? d.figuren : [];
  const rohOrte = Array.isArray(d.orte) ? d.orte : [];
  const rohBeziehungen = Array.isArray(d.beziehungen) ? d.beziehungen : [];
  if (!Array.isArray(d.figuren) && !Array.isArray(d.orte) && !Array.isArray(d.beziehungen)) {
    throw new KiFehler('antwort', m('schemaFalsch'));
  }

  const pruefer = new Pruefer(kontext, undefined, oberflaeche);
  const verworfen: Verworfen[] = [];
  let bereitsAngelegt = 0;
  let bereitsEntschieden = 0;
  const ablage = daten.kiVorschlaege;
  const entschieden = (liste: { schluessel: string; status: VorschlagsStatus }[] | undefined) =>
    new Map((liste ?? []).filter((v) => v.status !== 'neu').map((v) => [v.schluessel, v.status]));
  const figurEntschieden = entschieden(ablage?.figuren);
  const ortEntschieden = entschieden(ablage?.orte);
  const beziehungEntschieden = entschieden(ablage?.beziehungen);
  const verworfenePaare = new Set(
    (ablage?.beziehungen ?? []).filter((b) => b.status === 'verworfen').map((b) => paarVonSchluessel(b.schluessel)),
  );

  /** Belege prüfen: jedes Zitat wörtlich (E6); sortiert nach Buchreihenfolge und Position. */
  function belegePruefen(v: unknown): Zitat[] | string {
    if (!Array.isArray(v) || v.length === 0) return m('ohneBeleg');
    const stellen: ZitatStelle[] = [];
    for (const b of v as unknown[]) {
      const bb = (b ?? {}) as Record<string, unknown>;
      const stelle = pruefer.zitatFinden(bb.kapitel, bb.zitat ?? bb.text);
      if (typeof stelle === 'string') return stelle;
      if (!stellen.some((s) => s.zitat.kapitel === stelle.zitat.kapitel && s.zitat.text === stelle.zitat.text)) stellen.push(stelle);
    }
    stellen.sort((a, b) => a.kapitel.nr - b.kapitel.nr || (a.bereiche[0]?.start ?? 0) - (b.bereiche[0]?.start ?? 0));
    return stellen.map((s) => s.zitat);
  }

  function textGrund(text: string): string | null {
    if (!text) return null;
    const ersatz = ersatztextGrund(text, oberflaeche);
    if (ersatz) return ersatz;
    const fremd = fremdesZitat(text, kontext);
    return fremd ? m('zitiertFremd', { zitat: fremd }) : null;
  }

  function aliaseSauber(v: unknown, name: string): string[] {
    const ergebnis: string[] = [];
    const gesehen = new Set([namensForm(name)]);
    for (const a of Array.isArray(v) ? v : []) {
      const s = nameSauber(a);
      const form = s ? namensForm(s) : '';
      if (!form || gesehen.has(form)) continue;
      gesehen.add(form);
      ergebnis.push(s);
    }
    return ergebnis;
  }

  // Angelegte Figuren/Orte nach ID und Namensform
  const figurNachForm = new Map<string, KontextFigur>();
  for (const f of kontext.figuren) for (const n of figurNamen(f)) if (namensForm(n)) figurNachForm.set(namensForm(n), f);
  const ortNachForm = new Map<string, KontextOrt>();
  for (const o of kontext.orte) for (const n of [o.name, ...o.aliase]) if (namensForm(n)) ortNachForm.set(namensForm(n), o);
  const bekannteFigur = (angabe: string) => kontext.figuren.find((f) => f.id === angabe) ?? figurNachForm.get(namensForm(angabe));
  const bekannterOrt = (angabe: string) => kontext.orte.find((o) => o.id === angabe) ?? ortNachForm.get(namensForm(angabe));

  // --- Figuren -------------------------------------------------------------
  const figuren: FigurVorschlag[] = [];
  /** Namensformen vorgeschlagener Figuren dieses Laufs (inkl. Aliase) → Vorschlag */
  const vorgeschlagen = new Map<string, FigurVorschlag>();
  /** Namensformen von Figuren, die in diesem Lauf verworfen wurden bzw. von Leon verworfen sind → Grund */
  const figurVerworfen = new Map<string, { grund: string; entschieden: boolean }>();

  for (const r of rohFiguren as unknown[]) {
    const f = (r ?? {}) as Record<string, unknown>;
    const rohName = nameSauber(f.name);
    const { name, aliase } = hauptname(rohName, aliaseSauber(f.aliase, rohName));
    const namen = [name, ...aliase];
    const weg = (grund: string) => {
      verworfen.push({ grund, roh: r });
      for (const n of namen) if (n) figurVerworfen.set(namensForm(n), { grund, entschieden: false });
    };
    if (!name) {
      verworfen.push({ grund: m('figurOhneNamen'), roh: r });
      continue;
    }
    // auch über einen Alias: „der Alte“ mit Alias „Ole“ ist die angelegte Figur Ole, keine neue
    const angelegt = namen.map(bekannteFigur).find((x) => x);
    if (angelegt) {
      // Beziehungen dürfen die Figur unter den Namen dieses Vorschlags nennen
      const bekannt = new Set(figurNamen(angelegt).map(namensForm));
      const neueNamen = namen.filter((n) => !bekannt.has(namensForm(n)) && !figurNachForm.has(namensForm(n)));
      for (const n of namen) if (!figurNachForm.has(namensForm(n))) figurNachForm.set(namensForm(n), angelegt);
      // F-10: Namen, die die angelegte Figur noch nicht kennt, als Spitznamen vorschlagen
      const belege = neueNamen.length ? belegePruefen(f.belege) : [];
      if (neueNamen.length === 0 || typeof belege === 'string') {
        bereitsAngelegt += 1;
        continue;
      }
      const schluessel = spitznamenSchluessel(angelegt.id, neueNamen);
      if (figurEntschieden.has(schluessel)) {
        bereitsEntschieden += 1;
        continue;
      }
      const doppelt = figuren.find((x) => x.schluessel === schluessel);
      if (doppelt) continue;
      figuren.push({
        schluessel,
        name: neueNamen[0]!,
        aliase: neueNamen.slice(1),
        rolle: angelegt.rolle,
        kurz: '',
        belege,
        status: 'neu',
        ziel: angelegt.id,
      });
      continue;
    }
    const belege = belegePruefen(f.belege);
    if (typeof belege === 'string') {
      weg(m('figurGrund', { name, grund: belege }));
      continue;
    }
    const kurz = sauber(f.kurz);
    const grund = textGrund(kurz);
    if (grund) {
      weg(m('figurKurz', { name, grund }));
      continue;
    }
    const schluessel = figurSchluessel(name);
    const doppelt = figuren.find((x) => x.schluessel === schluessel);
    if (doppelt) {
      for (const b of belege) if (!doppelt.belege.some((x) => x.kapitel === b.kapitel && x.text === b.text)) doppelt.belege.push(b);
      continue;
    }
    // entschieden auch unter einem anderen Namen derselben Person (z. B. früher als „der Alte“ vorgeschlagen)
    const status = namen.map((n) => figurEntschieden.get(figurSchluessel(n))).find((x) => x);
    if (status) {
      bereitsEntschieden += 1;
      if (status === 'verworfen') for (const n of namen) figurVerworfen.set(namensForm(n), { grund: m('figurVerworfen', { name }), entschieden: true });
      continue;
    }
    const vorschlag: FigurVorschlag = {
      schluessel,
      name,
      aliase,
      rolle: (f.rolle === 'haupt' ? 'haupt' : 'neben') satisfies FigurRolle,
      kurz,
      belege,
      status: 'neu',
    };
    figuren.push(vorschlag);
    for (const n of [vorschlag.name, ...vorschlag.aliase]) if (!vorgeschlagen.has(namensForm(n))) vorgeschlagen.set(namensForm(n), vorschlag);
  }

  // --- Orte ----------------------------------------------------------------
  const orte: OrtVorschlag[] = [];
  const ortIn = new Map<OrtVorschlag, string>();
  for (const r of rohOrte as unknown[]) {
    const o = (r ?? {}) as Record<string, unknown>;
    const name = nameSauber(o.name);
    if (!name) {
      verworfen.push({ grund: m('ortOhneNamen'), roh: r });
      continue;
    }
    if (bekannterOrt(name)) {
      bereitsAngelegt += 1;
      continue;
    }
    const belege = belegePruefen(o.belege);
    if (typeof belege === 'string') {
      verworfen.push({ grund: m('ortGrund', { name, grund: belege }), roh: r });
      continue;
    }
    const schluessel = ortSchluessel(name);
    const doppelt = orte.find((x) => x.schluessel === schluessel);
    if (doppelt) {
      for (const b of belege) if (!doppelt.belege.some((x) => x.kapitel === b.kapitel && x.text === b.text)) doppelt.belege.push(b);
      continue;
    }
    if (ortEntschieden.has(schluessel)) {
      bereitsEntschieden += 1;
      continue;
    }
    const vorschlag: OrtVorschlag = { schluessel, name, aliase: aliaseSauber(o.aliase, name), belege, status: 'neu' };
    orte.push(vorschlag);
    const inName = nameSauber(o.in);
    if (inName) ortIn.set(vorschlag, inName);
  }
  // übergeordneter Ort: angelegt, in diesem Lauf vorgeschlagen oder früher vorgeschlagen (noch offen); sonst leer
  for (const [o, inName] of ortIn) {
    const form = namensForm(inName);
    const angelegt = bekannterOrt(inName);
    const vorschlag =
      orte.find((x) => x !== o && [x.name, ...x.aliase].some((n) => namensForm(n) === form)) ??
      ablage?.orte.find((x) => x.status === 'neu' && x.schluessel !== o.schluessel && namensForm(x.name) === form);
    if (angelegt) o.in = { typ: 'angelegt', id: angelegt.id, name: angelegt.name };
    else if (vorschlag) o.in = { typ: 'vorschlag', id: vorschlag.schluessel, name: vorschlag.name };
  }

  // --- Beziehungen ---------------------------------------------------------
  const figurNachId = new Map(kontext.figuren.map((f) => [f.id, f]));
  function figurReferenz(angabe: unknown): FigurReferenz {
    const s = nameSauber(angabe);
    if (!s) return null;
    const direkt = figurNachId.get(s);
    if (direkt) return { verweis: { typ: 'angelegt', id: direkt.id, name: direkt.name }, vage: direkt.existenz === 'bewusst_vage' };
    const form = namensForm(s);
    const neu = vorgeschlagen.get(form);
    if (neu) return { verweis: { typ: 'vorschlag', id: neu.schluessel, name: neu.name }, vage: false };
    const angelegt = figurNachForm.get(form);
    if (angelegt) return { verweis: { typ: 'angelegt', id: angelegt.id, name: angelegt.name }, vage: angelegt.existenz === 'bewusst_vage' };
    const weg = figurVerworfen.get(form);
    if (weg) return { verworfen: weg.grund, entschieden: weg.entschieden };
    // früher vorgeschlagen und noch offen bzw. übernommen
    const frueher = ablage?.figuren.find((x) => [x.name, ...x.aliase].some((n) => namensForm(n) === form));
    if (frueher?.status === 'neu') return { verweis: { typ: 'vorschlag', id: frueher.schluessel, name: frueher.name }, vage: false };
    if (frueher?.status === 'uebernommen' && frueher.figur && figurNachId.has(frueher.figur)) {
      const f = figurNachId.get(frueher.figur)!;
      return { verweis: { typ: 'angelegt', id: f.id, name: f.name }, vage: f.existenz === 'bewusst_vage' };
    }
    if (frueher?.status === 'verworfen') return { verworfen: m('figurVerworfen', { name: frueher.name }), entschieden: true };
    return null;
  }

  const angelegtePaare = new Set<string>();
  for (const f of Object.values(daten.figuren)) for (const b of f.beziehungen) if (b.zu && b.zu !== f.id) angelegtePaare.add([f.id, b.zu].sort().join('|'));

  const beziehungen: BeziehungsVorschlag[] = [];
  for (const r of rohBeziehungen as unknown[]) {
    const b = (r ?? {}) as Record<string, unknown>;
    const von = figurReferenz(b.von);
    const zu = figurReferenz(b.zu);
    const anzeige = (ref: FigurReferenz, roh: unknown) => (ref && 'verweis' in ref ? ref.verweis.name : nameSauber(roh) || '?');
    const titel = m('beziehungTitel', { von: anzeige(von, b.von), zu: anzeige(zu, b.zu) });
    const weg = (grund: string) => verworfen.push({ grund: m('mitName', { name: titel, text: grund }), roh: r });
    if (!von || !zu) {
      weg(m('unbekannteFigur', { name: !von ? nameSauber(b.von) : nameSauber(b.zu) }));
      continue;
    }
    if ('verworfen' in von || 'verworfen' in zu) {
      const x = ('verworfen' in von ? von : zu) as { verworfen: string; entschieden: boolean };
      if (x.entschieden) bereitsEntschieden += 1;
      else weg(m('verworfeneFigur', { grund: x.verworfen }));
      continue;
    }
    if (von.verweis.typ === zu.verweis.typ && von.verweis.id === zu.verweis.id) {
      weg(m('zuSichSelbst'));
      continue;
    }
    if (von.verweis.typ === 'angelegt' && zu.verweis.typ === 'angelegt' && angelegtePaare.has([von.verweis.id, zu.verweis.id].sort().join('|'))) {
      bereitsAngelegt += 1;
      continue;
    }
    const art = sauber(b.art);
    if (!art) {
      weg(m('ohneBezeichnung'));
      continue;
    }
    if (art.split(' ').length > ART_MAX_WOERTER) {
      weg(m('bezeichnungZuLang', { art, n: ART_MAX_WOERTER }));
      continue;
    }
    const belege = belegePruefen(b.belege);
    if (typeof belege === 'string') {
      weg(belege);
      continue;
    }
    const begruendung = sauber(b.begruendung);
    const grund = textGrund(`${art}\n${begruendung}`);
    if (grund) {
      weg(grund);
      continue;
    }
    const angabeKapitel = typeof b.abKapitel === 'string' ? pruefer.kapitelZu(b.abKapitel)?.id : undefined;
    const abKapitel = angabeKapitel ?? belege[0]?.kapitel;
    const kategorie: BeziehungsKategorie = (BEZIEHUNGS_KATEGORIEN as readonly string[]).includes(b.kategorie as string)
      ? (b.kategorie as BeziehungsKategorie)
      : 'sonstige';
    const schluessel = beziehungSchluessel(von.verweis.name, zu.verweis.name, abKapitel);
    if (beziehungEntschieden.has(schluessel) || verworfenePaare.has(paarVonSchluessel(schluessel))) {
      bereitsEntschieden += 1;
      continue;
    }
    const doppelt = beziehungen.find((x) => x.schluessel === schluessel);
    if (doppelt) {
      for (const z of belege) if (!doppelt.belege.some((x) => x.kapitel === z.kapitel && x.text === z.text)) doppelt.belege.push(z);
      continue;
    }
    beziehungen.push({
      schluessel,
      von: von.verweis,
      zu: zu.verweis,
      art,
      kategorie,
      ...(abKapitel ? { abKapitel } : {}),
      // harte Regel 4 sinngemäß: zu bewusst Vagem legt die KI nichts fest
      unsicher: b.unsicher === true || von.vage || zu.vage,
      belege,
      begruendung,
      status: 'neu',
    });
  }

  return { figuren, orte, beziehungen, verworfen, bereitsAngelegt, bereitsEntschieden };
}

// ---------------------------------------------------------------------------
// Ablage: Merge neuer Läufe, offene Vorschläge, Verweise auflösen
// ---------------------------------------------------------------------------

export function leereVorschlaege(): KiVorschlaege {
  return { version: 1, figuren: [], orte: [], beziehungen: [] };
}

/**
 * Mischt ein neues Ergebnis in die Ablage: Entschiedenes (übernommen/verworfen) bleibt unverändert und kommt
 * nicht wieder, offene Vorschläge mit gleichem Schlüssel werden aktualisiert, neue angehängt. Beziehungen eines
 * verworfenen Paars oder zu einer verworfenen Figur werden nicht aufgenommen.
 */
export function mischeVorschlaege(
  alt: KiVorschlaege | undefined,
  neu: Pick<VorschlagsErgebnis, 'figuren' | 'orte' | 'beziehungen'>,
  lauf?: KiVorschlaege['lauf'],
): { ablage: KiVorschlaege; neu: number; aktualisiert: number } {
  const basis = alt ?? leereVorschlaege();
  let anzahlNeu = 0;
  let aktualisiert = 0;
  function mische<T extends { schluessel: string; status: VorschlagsStatus }>(alte: T[], neue: T[], gesperrt: (v: T) => boolean): T[] {
    const ergebnis = [...alte];
    const index = new Map(ergebnis.map((v, i) => [v.schluessel, i]));
    for (const v of neue) {
      const i = index.get(v.schluessel);
      if (i !== undefined) {
        if (ergebnis[i]!.status !== 'neu') continue;
        ergebnis[i] = { ...v, status: 'neu' };
        aktualisiert += 1;
      } else if (!gesperrt(v)) {
        index.set(v.schluessel, ergebnis.length);
        ergebnis.push({ ...v, status: 'neu' });
        anzahlNeu += 1;
      }
    }
    return ergebnis;
  }
  const figuren = mische(basis.figuren, neu.figuren, () => false);
  const orte = mische(basis.orte, neu.orte, () => false);
  const verworfeneFiguren = new Set(figuren.filter((f) => f.status === 'verworfen').map((f) => f.schluessel));
  const verworfenePaare = new Set(basis.beziehungen.filter((b) => b.status === 'verworfen').map((b) => paarVonSchluessel(b.schluessel)));
  const beziehungen = mische(
    basis.beziehungen,
    neu.beziehungen,
    (b) => verworfenePaare.has(paarVonSchluessel(b.schluessel)) || [b.von, b.zu].some((r) => r.typ === 'vorschlag' && verworfeneFiguren.has(r.id)),
  );
  const stand = lauf ?? basis.lauf;
  return { ablage: { version: 1, figuren, orte, beziehungen, ...(stand ? { lauf: stand } : {}) }, neu: anzahlNeu, aktualisiert };
}

/**
 * Angelegte Figur, die einen dieser Namen trägt (Name, Alias oder Form), z. B. wenn Leon sie inzwischen selbst
 * angelegt hat. Mehrere Namen: Name und Aliase eines Vorschlags.
 */
export function figurMitNamen(daten: ProjektDaten, ...namen: string[]): Id | undefined {
  const formen = new Set(namen.map(namensForm).filter(Boolean));
  return Object.values(daten.figuren).find((f) => figurNamen(f).some((n) => formen.has(namensForm(n))))?.id;
}

export function ortMitNamen(daten: ProjektDaten, name: string): Id | undefined {
  const form = namensForm(name);
  return Object.values(daten.orte).find((o) => [o.name, ...o.aliase].some((n) => namensForm(n) === form))?.id;
}

/**
 * Löst den Figur-Verweis eines Beziehungsvorschlags auf: angelegte Figur (`figur`), noch offener Figurvorschlag
 * (`vorschlag`) oder null (Figur gelöscht bzw. Vorschlag verworfen).
 */
export function figurVerweisAufloesen(
  ablage: KiVorschlaege,
  daten: ProjektDaten,
  verweis: VorschlagsVerweis,
): { figur: Id } | { vorschlag: FigurVorschlag } | null {
  if (verweis.typ === 'angelegt') return daten.figuren[verweis.id] ? { figur: verweis.id } : null;
  const v = ablage.figuren.find((f) => f.schluessel === verweis.id);
  if (!v || v.status === 'verworfen') return null;
  if (v.status === 'uebernommen') return v.figur && daten.figuren[v.figur] ? { figur: v.figur } : null;
  if (v.ziel) return daten.figuren[v.ziel] ? { figur: v.ziel } : null;
  const vorhanden = figurMitNamen(daten, v.name, ...v.aliase);
  return vorhanden ? { figur: vorhanden } : { vorschlag: v };
}

export interface OffeneVorschlaege {
  figuren: FigurVorschlag[];
  orte: OrtVorschlag[];
  beziehungen: BeziehungsVorschlag[];
  anzahl: number;
}

/**
 * Was Leon noch entscheiden kann: Status „neu“, ohne inzwischen angelegte Gegenstücke (gleicher Name bzw.
 * gleiche Beziehung ab demselben Kapitel) und ohne Beziehungen zu gelöschten oder verworfenen Figuren.
 */
export function offeneVorschlaege(ablage: KiVorschlaege | undefined, daten: ProjektDaten): OffeneVorschlaege {
  if (!ablage) return { figuren: [], orte: [], beziehungen: [], anzahl: 0 };
  const figuren = ablage.figuren.filter((f) => {
    if (f.status !== 'neu') return false;
    // Spitznamen-Vorschlag: offen, solange die Figur da ist und einen der Namen noch nicht trägt
    if (f.ziel) {
      const z = daten.figuren[f.ziel];
      if (!z) return false;
      const bekannt = new Set(figurNamen(z).map(namensForm));
      return [f.name, ...f.aliase].some((n) => !bekannt.has(namensForm(n)));
    }
    return !figurMitNamen(daten, f.name, ...f.aliase);
  });
  const orte = ablage.orte.filter((o) => o.status === 'neu' && !ortMitNamen(daten, o.name));
  const beziehungen = ablage.beziehungen.filter((b) => {
    if (b.status !== 'neu') return false;
    const von = figurVerweisAufloesen(ablage, daten, b.von);
    const zu = figurVerweisAufloesen(ablage, daten, b.zu);
    if (!von || !zu) return false;
    if ('figur' in von && 'figur' in zu) {
      if (von.figur === zu.figur) return false;
      const gleich = (a: Id, z: Id) => daten.figuren[a]?.beziehungen.some((x) => x.zu === z && (x.abKapitel ?? '') === (b.abKapitel ?? ''));
      if (gleich(von.figur, zu.figur) || gleich(zu.figur, von.figur)) return false;
    }
    return true;
  });
  return { figuren, orte, beziehungen, anzahl: figuren.length + orte.length + beziehungen.length };
}
