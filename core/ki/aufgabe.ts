/**
 * Gemeinsame Hilfe für KI-Aufgaben mit eigenem Antwortschema über den Buchkontext
 * (G1 Zeitpunkte/Zustände, G3 Figurenstimme, G6 Leser-Simulation und Fragen an das Buch).
 *
 * Ablauf wie bei Prüfung und Vorschlägen: ganzes Buch (Allowlist E12, baueBuchKontext) als gecachter
 * Prefix (E13), danach die Aufgabe in <aufgabe art="…">…</aufgabe>, Antwort über Structured Outputs.
 * Die Auswertung bekommt eine AufgabenPruefung: Zitate werden nach E6 wörtlich gegen den Kapiteltext
 * geprüft (harte Regel 3), Freitexte auf Ersatztext/Formulierungsvorschläge (harte Regel 2).
 * HARTE REGEL 1: nur ProjektLeser und KiTransport; schreibt nichts – gespeichert wird im Store.
 */
import type { Sprache } from '../i18n';
import type { Id, KiEinstellungen, ProjektDaten, Zitat } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { ladeProjekt } from '../projekt/lesen';
import { kiModell } from './anbieter';
import { baueAnfrage, EFFORT, MAX_TOKENS, prefixZaehlBody, zaehlBody, type KiRolle } from './anfrage';
import { KiFehler, LEERE_NUTZUNG, leseAntwort, type Nutzung } from './antwort';
import type { KiTransport, Schaetzung } from './index';
import { baueBuchKontext, type BuchKontext, type KontextFigur, type KontextKapitel } from './kontext';
import { AUSGABE_SCHAETZUNG, kostenUsd, preisFuer } from './kosten';
import { meldungenIn } from './meldungen';
import { ersatztextGrund, fremdesZitat, Pruefer, type Verworfen } from './pruefung';
import { systemFuer } from './sprache';

export interface AufgabenDefinition<T> {
  /** Name für Meldungen, z. B. „Zeitpunkte“ */
  name: string;
  /** Name für Meldungen bei englischer Oberfläche (fehlt er, gilt `name`) */
  nameEn?: string;
  /** Kennung im Aufgabenkopf <aufgabe art="…">; der Demo-Transport wählt danach seine Antwort */
  art: string;
  /** weitere Attribute im Aufgabenkopf (z. B. {kapitel: 'lotte'}) */
  attribute?: Record<string, string>;
  /** erkennung = Haiku, pruefung = Sonnet, tiefencheck = Opus (Modell laut Einstellungen) */
  rolle: KiRolle;
  /** System-Prompt (deutsch) */
  system: string;
  /**
   * System-Prompt für englische Bücher (Buchsprache en). Fehlt er, geht `system` mit einer englischen
   * Sprachanweisung an das Modell (sprache.ts, systemFuer).
   */
  systemEn?: string;
  /**
   * Aufgabentext ohne Kopf und Fuß (wird von <aufgabe …> … </aufgabe> umschlossen); Sprache: `kontext.sprache`.
   * `oberflaeche`: Sprache für KiFehler-Meldungen (z. B. „Kapitel fehlt“), nicht für den Text an das Modell.
   */
  aufgabe(kontext: BuchKontext, oberflaeche?: Sprache): string;
  /** JSON-Schema der Antwort (Structured Outputs); nie ein Feld für Ersatztext */
  schema(kontext: BuchKontext): Record<string, unknown>;
  /** Nur Kapitel bis einschließlich dieser ID in den Kontext (Leser-Simulation „nach Kapitel n“) */
  kapitelBis?: Id;
  /** Standard MAX_TOKENS */
  maxTokens?: number;
  /** grobe Ausgabe-Tokens für die Kostenschätzung (Standard: AUSGABE_SCHAETZUNG der Rolle) */
  ausgabeSchaetzung?: number;
  /** Antwort-JSON auswerten. Ungültiges über p.verwerfen() melden statt zu werfen. */
  auswerten(daten: unknown, p: AufgabenPruefung): T;
}

export interface AufgabenPruefung {
  kontext: BuchKontext;
  /** Sprache der Verwerfungsgründe (Oberflächensprache) */
  readonly oberflaeche: Sprache;
  /** verworfene Teile der Antwort mit Grund */
  readonly verworfen: Verworfen[];
  verwerfen(grund: string, roh: unknown): void;
  /** Kapitel zu einer Modellangabe (ID, notfalls Titel) */
  kapitel(angabe: unknown): KontextKapitel | undefined;
  /** angelegte Figur zu einer ID */
  figur(angabe: unknown): KontextFigur | undefined;
  /**
   * Zitatliste [{kapitel, text}] prüfen: jedes Zitat muss wörtlich (E6) im Kapitel stehen. Liefert die Zitate
   * mit dem Originaltext oder null (dann ist der Grund vermerkt und der ganze Eintrag zu verwerfen).
   */
  zitate(roh: unknown, eintrag: unknown, optionen?: { mindestens?: number; kapitel?: ReadonlySet<Id> }): Zitat[] | null;
  /**
   * Freitext (Begründung, Antwort, Erklärung) prüfen: getrimmt; null bei Ersatztext/Formulierungsvorschlag,
   * bei zitiertem Text, der nicht im Buch steht, oder wenn `pflicht` und leer.
   */
  text(roh: unknown, eintrag: unknown, optionen?: { pflicht?: boolean }): string | null;
}

export interface AufgabenErgebnis<T> {
  ergebnis: T;
  verworfen: Verworfen[];
  tokens: { eingabe: number; ausgabe: number; cacheGelesen: number };
  modell: string;
  kostenUsd: number;
  /** ISO-Zeitpunkt */
  datum: string;
}

export interface AufgabenOptionen {
  /** Abbruch: vor der Anfrage, im Transport (wenn er es kann) oder danach – die Antwort wird dann verworfen */
  signal?: AbortSignal;
  jetzt?(): Date;
  /** Sprache der Meldungen (KiFehler, Verwerfungsgründe); Standard Deutsch. Die Antwortsprache der KI ist die Buchsprache. */
  oberflaeche?: Sprache;
}

/** Name der Aufgabe in der Oberflächensprache. */
export function aufgabenName(d: Pick<AufgabenDefinition<unknown>, 'name' | 'nameEn'>, oberflaeche: Sprache = 'de'): string {
  return oberflaeche === 'en' ? (d.nameEn ?? d.name) : d.name;
}

function attribut(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `<aufgabe art="zeit" kapitel="lotte">` – Attributwerte escaped, Reihenfolge wie übergeben. */
export function aufgabenKopf(art: string, attribute: Record<string, string> = {}): string {
  const rest = Object.entries(attribute)
    .map(([k, v]) => ` ${k}="${attribut(v)}"`)
    .join('');
  return `<aufgabe art="${attribut(art)}"${rest}>`;
}

/** Liest den Aufgabenkopf zurück (Demo-Transport, Tests). */
export function leseAufgabenKopf(text: string): { art: string; attribute: Record<string, string> } | null {
  const m = /<aufgabe art="([^"]*)"([^>]*)>/.exec(text);
  if (!m) return null;
  const attribute: Record<string, string> = {};
  for (const a of (m[2] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) {
    attribute[a[1]!] = (a[2] ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return { art: (m[1] ?? '').replace(/&amp;/g, '&'), attribute };
}

/** Projektdaten nur bis einschließlich `bis` (Reihenfolge laut projekt.kapitel). */
export function datenBisKapitel(daten: ProjektDaten, bis: Id, oberflaeche: Sprache = 'de'): ProjektDaten {
  const i = daten.projekt.kapitel.indexOf(bis);
  if (i < 0) throw new KiFehler('auftrag', meldungenIn(oberflaeche)('kapitelFehlt', { kapitel: bis }));
  return { ...daten, projekt: { ...daten.projekt, kapitel: daten.projekt.kapitel.slice(0, i + 1) } };
}

interface AufgabenLauf {
  kontext: BuchKontext;
  modell: string;
  body: Record<string, unknown>;
}

function planeAufgabe<T>(
  daten: ProjektDaten,
  d: AufgabenDefinition<T>,
  einstellungen: KiEinstellungen | undefined,
  oberflaeche: Sprache = 'de',
): AufgabenLauf {
  const kontext = baueBuchKontext(d.kapitelBis ? datenBisKapitel(daten, d.kapitelBis, oberflaeche) : daten);
  if (!kontext.kapitel.some((k) => k.text.trim())) throw new KiFehler('auftrag', meldungenIn(oberflaeche)('buchOhneText'));
  const modell = kiModell(einstellungen, d.rolle);
  const aufgabe = [aufgabenKopf(d.art, d.attribute), d.aufgabe(kontext, oberflaeche).trim(), '</aufgabe>'].join('\n');
  const system = systemFuer(d.system, d.systemEn, kontext.sprache);
  const body = {
    ...baueAnfrage({ modell, system, kontext, aufgabe, schema: d.schema(kontext), effort: EFFORT[d.rolle] }),
    max_tokens: d.maxTokens ?? MAX_TOKENS,
  };
  return { kontext, modell, body };
}

/** Der vollständige Messages-API-Body der Aufgabe (z. B. für Tests oder vorbereitete Antworten). */
export async function aufgabenAnfrage<T>(
  leser: ProjektLeser,
  definition: AufgabenDefinition<T>,
  einstellungen?: KiEinstellungen,
  oberflaeche: Sprache = 'de',
): Promise<Record<string, unknown>> {
  return planeAufgabe(await ladeProjekt(leser), definition, einstellungen, oberflaeche).body;
}

/** Prüfwerkzeug für die Auswertung (auch einzeln nutzbar, z. B. in Tests). `oberflaeche`: Sprache der Gründe. */
export function erstelleAufgabenPruefung(kontext: BuchKontext, oberflaeche: Sprache = 'de'): AufgabenPruefung {
  const pruefer = new Pruefer(kontext, undefined, oberflaeche);
  const m = meldungenIn(oberflaeche);
  const verworfen: Verworfen[] = [];
  const verwerfen = (grund: string, roh: unknown) => {
    verworfen.push({ grund, roh });
  };
  return {
    kontext,
    oberflaeche,
    verworfen,
    verwerfen,
    kapitel: (angabe) => (typeof angabe === 'string' ? pruefer.kapitelZu(angabe) : undefined),
    figur: (angabe) => (typeof angabe === 'string' ? kontext.figuren.find((f) => f.id === angabe) : undefined),
    zitate(roh, eintrag, optionen = {}) {
      const mindestens = optionen.mindestens ?? 1;
      const liste = Array.isArray(roh) ? roh : [];
      const ergebnis: Zitat[] = [];
      for (const z of liste) {
        const zz = (z ?? {}) as Record<string, unknown>;
        const stelle = pruefer.zitatFinden(zz.kapitel, zz.text);
        if (typeof stelle === 'string') {
          verwerfen(stelle, eintrag);
          return null;
        }
        if (optionen.kapitel && !optionen.kapitel.has(stelle.zitat.kapitel)) {
          verwerfen(m('zitatAusserhalb', { kapitel: stelle.zitat.kapitel }), eintrag);
          return null;
        }
        if (!ergebnis.some((x) => x.kapitel === stelle.zitat.kapitel && x.text === stelle.zitat.text)) ergebnis.push(stelle.zitat);
      }
      if (ergebnis.length < mindestens) {
        verwerfen(mindestens === 1 ? m('ohneZitat') : m('wenigerZitate', { n: mindestens }), eintrag);
        return null;
      }
      return ergebnis;
    },
    text(roh, eintrag, optionen = {}) {
      const t = typeof roh === 'string' ? roh.trim() : '';
      if (!t) {
        if (optionen.pflicht) verwerfen(m('textFehlt'), eintrag);
        return optionen.pflicht ? null : '';
      }
      const ersatz = ersatztextGrund(t, oberflaeche);
      if (ersatz) {
        verwerfen(ersatz, eintrag);
        return null;
      }
      const fremd = fremdesZitat(t, kontext);
      if (fremd) {
        verwerfen(m('zitiertFremd', { zitat: fremd }), eintrag);
        return null;
      }
      return t;
    },
  };
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

function ergebnisAus<T>(
  lauf: AufgabenLauf,
  d: AufgabenDefinition<T>,
  daten: unknown,
  nutzung: Nutzung,
  jetzt: () => Date,
  oberflaeche: Sprache = 'de',
): AufgabenErgebnis<T> {
  const p = erstelleAufgabenPruefung(lauf.kontext, oberflaeche);
  const ergebnis = d.auswerten(daten, p);
  return {
    ergebnis,
    verworfen: [...p.verworfen],
    tokens: { eingabe: nutzung.eingabe + nutzung.cacheGeschrieben, ausgabe: nutzung.ausgabe, cacheGelesen: nutzung.cacheGelesen },
    modell: lauf.modell,
    kostenUsd: kostenUsd(nutzung, preisFuer(lauf.modell, d.rolle, lauf.kontext.text.length / 3)),
    datum: jetzt().toISOString(),
  };
}

/** Eine Anfrage an das Modell, Antwort auswerten. Schreibt nichts (der Store speichert das Ergebnis). */
export async function fuehreAufgabeAus<T>(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  definition: AufgabenDefinition<T>,
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<T>> {
  const oberflaeche = optionen.oberflaeche ?? 'de';
  const m = meldungenIn(oberflaeche);
  const lauf = planeAufgabe(await ladeProjekt(leser), definition, einstellungen, oberflaeche);
  if (!(await transport.bereit())) {
    throw new KiFehler('nicht_bereit', m('nichtBereit'));
  }
  const abgebrochen = () => new KiFehler('abgebrochen', m('aufgabeAbgebrochen', { name: aufgabenName(definition, oberflaeche) }));
  if (optionen.signal?.aborted) throw abgebrochen();
  let antwort;
  try {
    // Das Signal geht an den Transport; kann er nicht abbrechen, wird die Antwort unten verworfen.
    antwort = leseAntwort(await transport.senden(lauf.body, { signal: optionen.signal }), oberflaeche);
  } catch (e) {
    if (optionen.signal?.aborted) throw abgebrochen();
    throw e instanceof KiFehler ? e : new KiFehler('api', fehlertext(e));
  }
  if (optionen.signal?.aborted) throw abgebrochen();
  if (antwort.daten === null) throw new KiFehler('antwort', antwort.grund ?? m('antwortOhneDaten'));
  return ergebnisAus(lauf, definition, antwort.daten, antwort.nutzung, optionen.jetzt ?? (() => new Date()), oberflaeche);
}

/** Auswertung einer vorbereiteten Antwort (Objekt, JSON-Text oder Messages-API-Antwort) ohne Request. */
export async function werteAufgabenAntwortAus<T>(
  leser: ProjektLeser,
  definition: AufgabenDefinition<T>,
  antwort: unknown,
  optionen: AufgabenOptionen & { einstellungen?: KiEinstellungen } = {},
): Promise<AufgabenErgebnis<T>> {
  const oberflaeche = optionen.oberflaeche ?? 'de';
  const m = meldungenIn(oberflaeche);
  const lauf = planeAufgabe(await ladeProjekt(leser), definition, optionen.einstellungen, oberflaeche);
  let roh = antwort;
  let nutzung = LEERE_NUTZUNG;
  if (typeof roh === 'string') {
    try {
      roh = JSON.parse(roh);
    } catch {
      throw new KiFehler('antwort', m('keinJson'));
    }
  }
  if (roh && typeof roh === 'object' && (roh as Record<string, unknown>).type === 'message') {
    const a = leseAntwort(roh as Record<string, unknown>, oberflaeche);
    if (a.daten === null) throw new KiFehler('antwort', a.grund ?? m('antwortOhneDaten'));
    roh = a.daten;
    nutzung = a.nutzung;
  }
  return ergebnisAus(lauf, definition, roh, nutzung, optionen.jetzt ?? (() => new Date()), oberflaeche);
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

/** Schätzung vor dem Start: eine Anfrage, Tokens (count_tokens, sonst Zeichen/3), grobe Kosten. `oberflaeche`: Sprache der KiFehler. */
export async function schaetzeAufgabe<T>(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  definition: AufgabenDefinition<T>,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  const lauf = planeAufgabe(await ladeProjekt(leser), definition, einstellungen, oberflaeche);
  const voll = await zaehle(transport, zaehlBody(lauf.body));
  const system = systemFuer(definition.system, definition.systemEn, lauf.kontext.sprache);
  const prefix = await zaehle(transport, prefixZaehlBody({ modell: lauf.modell, system, kontext: lauf.kontext }));
  const prefixTokens = Math.min(prefix.tokens, voll.tokens);
  const ausgabe = definition.ausgabeSchaetzung ?? AUSGABE_SCHAETZUNG[definition.rolle];
  const preis = preisFuer(lauf.modell, definition.rolle, voll.tokens);
  return {
    rolle: definition.rolle,
    modell: lauf.modell,
    kapitel: lauf.kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id),
    uebersprungen: [],
    anfragen: 1,
    eingabeTokens: voll.tokens,
    prefixTokens,
    ausgabeTokens: ausgabe,
    kostenUsd: kostenUsd({ eingabe: voll.tokens - prefixTokens, ausgabe, cacheGelesen: 0, cacheGeschrieben: prefixTokens }, preis),
    gezaehlt: voll.gezaehlt && prefix.gezaehlt,
  };
}
