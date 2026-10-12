/**
 * KI-Prüfung (Phase 4). Besitzer: KI.
 * HARTE REGEL: Dieses Modul bekommt nur ProjektLeser und KiTransport. Es importiert nie
 * ProjektDateisystem, Schreibfunktionen aus core/projekt, Tauri oder den Store.
 * HTTP-Details für den Rust-Kern: core/ki/README.md.
 */
import type { Sprache } from '../i18n';
import type { Hinweis, Id, KapitelAnalyse, KiEinstellungen, ProjektDaten, TextAnker, Verweis } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { ladeProjekt } from '../projekt/lesen';
import { ankerErzeugen, ankerFinden, findeZitat, normalisiere, type Bereich } from '../text';
import {
  baueAnfrage,
  EFFORT,
  erwaehnungsAufgabe,
  erwaehnungsSchema,
  prefixZaehlBody,
  pruefAufgabe,
  pruefSchema,
  systemErkennung,
  systemPruefung,
  zaehlBody,
  type KiRolle,
} from './anfrage';
import { addiere, KiFehler, LEERE_NUTZUNG, leseAntwort, type Nutzung } from './antwort';
import { AUSGABE_SCHAETZUNG, kostenUsd, preisFuer } from './kosten';
import { baueBuchKontext, type BuchKontext, type KontextKapitel } from './kontext';
import { meldungenIn } from './meldungen';
import { Pruefer } from './pruefung';
import { kiModell } from './anbieter';

export {
  ANBIETER_NAME,
  CLAUDE_API_ENDPOINT,
  KI_ANBIETER,
  kiAnbieter,
  kiEndpoint,
  kiMitStandards,
  kiModell,
  STANDARD_CLAUDE,
  STANDARD_MODELLE,
} from './anbieter';
export { KiFehler, type KiFehlerArt } from './antwort';
export { kiMeldungen, type KiMeldung } from './meldungen';
export { KI_HINWEIS_TYPEN, MAX_TOKENS, EFFORT, type KiRolle } from './anfrage';
export { baueBuchKontext, leseBuchKontext, type BuchKontext, type GelesenerKontext } from './kontext';
export { ersatztextGrund, loseEndeId } from './pruefung';
export { formatiereUsd, kostenUsd, preisFuer, PREISE } from './kosten';
/** Vorschläge für Figuren, Orte, Beziehungen (Request-Form: README.md) */
export * from './vorschlaege';
/** Gemeinsame Hilfe für Aufgaben mit eigenem Schema (G1, G3, G6) */
export * from './aufgabe';
/** G1 Zeitpunkte und Zustände · G3 Figurenstimme · G6 Leser-Simulation und Fragen (Besitzer: die Gruppen) */
export * from './zeit';
export * from './stimme';
export * from './fakten';
export * from './leser';
/** G2 Stränge vorschlagen */
export * from './straenge';

/** Transport zur Messages-API (Foundry oder Claude API). In der App: Rust-Kommando ki_anfrage. */
export interface KiTransport {
  /** Schlüssel und Endpoint vorhanden? */
  bereit(): Promise<boolean>;
  /**
   * Messages-API-Body (model = Deployment-Name) → Antwort-JSON. `optionen.signal` darf die laufende Anfrage
   * abbrechen (dann wird mit KiFehler „abgebrochen“ verworfen); ein Transport, der nicht abbrechen kann, ignoriert
   * es – der Aufrufer verwirft die Antwort dann selbst.
   */
  senden(body: Record<string, unknown>, optionen?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  /** count_tokens mit demselben Body-Format */
  tokenZaehlen(body: Record<string, unknown>): Promise<number>;
}

export interface PruefAuftrag {
  umfang: 'kapitel' | 'buch';
  kapitel?: Id;
  /** Opus-Tiefencheck statt Sonnet */
  tiefencheck?: boolean;
  /** Kapitel auch dann prüfen, wenn Text-Hash und Analyse unverändert sind */
  erzwingen?: boolean;
}

export interface PruefErgebnis {
  hinweise: Hinweis[];
  analysen: KapitelAnalyse[];
  /** verworfene Modellausgaben mit Grund (Zitat nicht gefunden, Ersatztext, …) */
  verworfen: { grund: string; roh: unknown }[];
  tokens: { eingabe: number; ausgabe: number; cacheGelesen: number };
  /** Kapitel, für die eine Anfrage gestellt wurde */
  geprueft?: Id[];
  /** Kapitel mit unverändertem Text-Hash und vorhandener Analyse (Ergebnis-Cache) */
  uebersprungen?: Id[];
  /** Hinweise, die Leon schon entschieden hat („Ist Absicht“/„Erledigt“) und deshalb nicht zurückkommen */
  bereitsEntschieden?: number;
  /** Lauf vorzeitig beendet (Fehler oder Abbruch); bis dahin gesammelte Ergebnisse sind enthalten */
  fehler?: string;
  modell?: string;
  kostenUsd?: number;
}

export interface PruefFortschritt {
  erledigt: number;
  gesamt: number;
  /** Kapitel, das gerade geprüft wird; null = fertig */
  kapitel: Id | null;
  titel: string;
}

export interface PruefOptionen {
  fortschritt?(f: PruefFortschritt): void;
  /** Abbruch zwischen zwei Anfragen */
  signal?: AbortSignal;
  jetzt?(): Date;
  /** Sprache der Meldungen (Fehler, Verwerfungsgründe); Standard Deutsch. Hinweise selbst: Buchsprache. */
  oberflaeche?: Sprache;
}

export interface ErwaehnungsVorschlag {
  anker: TextAnker;
  /** Textstelle, z. B. „der Hafenmeister“ oder „Fiete“ */
  text: string;
  /** vorgeschlagene Zuordnung; null = unbekannte Figur/Ort */
  ziel: Verweis | null;
  begruendung: string;
  /** bei ziel = null: Figur oder Ort? */
  zielTyp?: 'figur' | 'ort';
}

export interface Schaetzung {
  rolle: KiRolle;
  modell: string;
  /** Kapitel, für die eine Anfrage gestellt würde */
  kapitel: Id[];
  uebersprungen: Id[];
  anfragen: number;
  /** Eingabe-Tokens aller Anfragen zusammen (inkl. gecachtem Teil) */
  eingabeTokens: number;
  /** davon Buch-Prefix je Anfrage (wird ab der zweiten Anfrage aus dem Cache gelesen) */
  prefixTokens: number;
  ausgabeTokens: number;
  kostenUsd: number;
  /** false = count_tokens nicht verfügbar, Schätzung über Zeichen/3 */
  gezaehlt: boolean;
}

export const STANDARD_KI: KiEinstellungen = {
  endpoint: '',
  deployments: { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' },
};

/** Deployment-Name (Foundry) bzw. Modell-ID (Claude API) des gewählten Anbieters. */
function deploymentFuer(einstellungen: KiEinstellungen | undefined, rolle: KiRolle): string {
  return kiModell(einstellungen, rolle);
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

interface Lauf {
  daten: ProjektDaten;
  kontext: BuchKontext;
  rolle: KiRolle;
  modell: string;
  kapitel: KontextKapitel[];
  uebersprungen: Id[];
}

async function planeLauf(leser: ProjektLeser, auftrag: PruefAuftrag, einstellungen: KiEinstellungen, oberflaeche: Sprache): Promise<Lauf> {
  const m = meldungenIn(oberflaeche);
  const daten = await ladeProjekt(leser);
  const kontext = baueBuchKontext(daten);
  const rolle: KiRolle = auftrag.tiefencheck ? 'tiefencheck' : 'pruefung';
  let kandidaten: KontextKapitel[];
  if (auftrag.umfang === 'kapitel') {
    if (!auftrag.kapitel) throw new KiFehler('auftrag', m('keinKapitelGewaehlt'));
    const k = kontext.kapitel.find((x) => x.id === auftrag.kapitel);
    if (!k) throw new KiFehler('auftrag', m('kapitelFehlt', { kapitel: auftrag.kapitel }));
    if (!k.text.trim()) throw new KiFehler('auftrag', m('kapitelOhneText', { nr: k.nr, titel: k.titel }));
    kandidaten = [k];
  } else {
    kandidaten = kontext.kapitel.filter((k) => k.text.trim());
  }
  const cacheNutzen = !auftrag.tiefencheck && !auftrag.erzwingen;
  const kapitel: KontextKapitel[] = [];
  const uebersprungen: Id[] = [];
  for (const k of kandidaten) {
    const a = daten.analysen[k.id];
    if (cacheNutzen && a && a.textHash && a.textHash === k.hash) uebersprungen.push(k.id);
    else kapitel.push(k);
  }
  return { daten, kontext, rolle, modell: deploymentFuer(einstellungen, rolle), kapitel, uebersprungen };
}

function pruefAnfrage(lauf: Lauf, k: KontextKapitel): Record<string, unknown> {
  return baueAnfrage({
    modell: lauf.modell,
    system: systemPruefung(lauf.kontext.sprache),
    kontext: lauf.kontext,
    aufgabe: pruefAufgabe(k, lauf.kontext.sprache),
    schema: pruefSchema(lauf.kontext),
    effort: EFFORT[lauf.rolle],
  });
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

/** Schätzung vor dem Start: Anfragen, Tokens (count_tokens, sonst Zeichen/3) und grobe Kosten. `oberflaeche`: Sprache der KiFehler. */
export async function schaetzeLauf(
  leser: ProjektLeser,
  auftrag: PruefAuftrag,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  const lauf = await planeLauf(leser, auftrag, einstellungen, oberflaeche);
  const basis: Schaetzung = {
    rolle: lauf.rolle,
    modell: lauf.modell,
    kapitel: lauf.kapitel.map((k) => k.id),
    uebersprungen: lauf.uebersprungen,
    anfragen: lauf.kapitel.length,
    eingabeTokens: 0,
    prefixTokens: 0,
    ausgabeTokens: 0,
    kostenUsd: 0,
    gezaehlt: true,
  };
  const erstes = lauf.kapitel[0];
  if (!erstes) return basis;
  const voll = await zaehle(transport, zaehlBody(pruefAnfrage(lauf, erstes)));
  const prefix = await zaehle(transport, prefixZaehlBody({ modell: lauf.modell, system: systemPruefung(lauf.kontext.sprache), kontext: lauf.kontext }));
  const n = lauf.kapitel.length;
  const prefixTokens = Math.min(prefix.tokens, voll.tokens);
  const rest = voll.tokens - prefixTokens;
  const ausgabe = AUSGABE_SCHAETZUNG[lauf.rolle] * n;
  const preis = preisFuer(lauf.modell, lauf.rolle, voll.tokens);
  const kosten =
    kostenUsd({ eingabe: rest * n, ausgabe, cacheGelesen: prefixTokens * (n - 1), cacheGeschrieben: prefixTokens }, preis);
  return {
    ...basis,
    eingabeTokens: voll.tokens * n,
    prefixTokens,
    ausgabeTokens: ausgabe,
    kostenUsd: kosten,
    gezaehlt: voll.gezaehlt && prefix.gezaehlt,
  };
}

export async function schaetzeTokens(
  leser: ProjektLeser,
  auftrag: PruefAuftrag,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  oberflaeche: Sprache = 'de',
): Promise<number> {
  return (await schaetzeLauf(leser, auftrag, transport, einstellungen, oberflaeche)).eingabeTokens;
}

export async function pruefe(
  leser: ProjektLeser,
  auftrag: PruefAuftrag,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  optionen: PruefOptionen = {},
): Promise<PruefErgebnis> {
  const oberflaeche = optionen.oberflaeche ?? 'de';
  const m = meldungenIn(oberflaeche);
  const lauf = await planeLauf(leser, auftrag, einstellungen, oberflaeche);
  const ergebnis: PruefErgebnis = {
    hinweise: [],
    analysen: [],
    verworfen: [],
    tokens: { eingabe: 0, ausgabe: 0, cacheGelesen: 0 },
    geprueft: [],
    uebersprungen: lauf.uebersprungen,
    bereitsEntschieden: 0,
    modell: lauf.modell,
    kostenUsd: 0,
  };
  const gesamt = lauf.kapitel.length;
  if (gesamt === 0) return ergebnis;
  if (!(await transport.bereit())) {
    throw new KiFehler('nicht_bereit', m('nichtBereit'));
  }

  const entschieden = new Set(lauf.daten.entscheidungen.hinweise.map((h) => h.schluessel));
  const pruefer = new Pruefer(lauf.kontext, entschieden, oberflaeche);
  const schluessel = new Set<string>();
  const entschiedenGesehen = new Set<string>();
  let nutzung: Nutzung = LEERE_NUTZUNG;
  const jetzt = optionen.jetzt ?? (() => new Date());

  for (const [i, k] of lauf.kapitel.entries()) {
    if (optionen.signal?.aborted) {
      ergebnis.fehler = m('pruefungAbgebrochen');
      break;
    }
    optionen.fortschritt?.({ erledigt: i, gesamt, kapitel: k.id, titel: k.titel });
    const name = m('kapitelName', { nr: k.nr, titel: k.titel });
    let antwort;
    try {
      // Abbruch nur zwischen zwei Anfragen (PruefOptionen): eine laufende Kapitel-Anfrage wird noch ausgewertet.
      antwort = leseAntwort(await transport.senden(pruefAnfrage(lauf, k)), oberflaeche);
    } catch (e) {
      const text = fehlertext(e);
      if (i === 0) throw e instanceof KiFehler ? e : new KiFehler('api', text);
      ergebnis.fehler = m('mitName', { name, text });
      break;
    }
    nutzung = addiere(nutzung, antwort.nutzung);
    ergebnis.geprueft!.push(k.id);
    if (antwort.daten === null) {
      ergebnis.verworfen.push({ grund: m('mitName', { name, text: antwort.grund ?? m('keineDaten') }), roh: null });
      continue;
    }
    const d = antwort.daten as Record<string, unknown>;
    if (!d || !Array.isArray(d.hinweise) || !Array.isArray(d.analysen)) {
      ergebnis.verworfen.push({ grund: m('mitName', { name, text: m('schemaFalsch') }), roh: antwort.daten });
      continue;
    }
    const aufgabe = new Set([k.id]);
    for (const roh of d.hinweise) {
      const r = pruefer.hinweis(roh, aufgabe);
      if ('hinweis' in r) {
        if (schluessel.has(r.hinweis.schluessel)) continue;
        schluessel.add(r.hinweis.schluessel);
        ergebnis.hinweise.push(r.hinweis);
      } else if ('entschieden' in r) {
        entschiedenGesehen.add(r.entschieden);
      } else {
        ergebnis.verworfen.push(r);
      }
    }
    let analyseDa = false;
    for (const roh of d.analysen) {
      const r = pruefer.analyse(roh, aufgabe, lauf.modell, jetzt().toISOString());
      if ('analyse' in r) {
        if (analyseDa) continue;
        analyseDa = true;
        ergebnis.analysen.push(r.analyse);
      } else {
        ergebnis.verworfen.push(r);
      }
    }
    if (!analyseDa) ergebnis.verworfen.push({ grund: m('mitName', { name, text: m('keineAnalyse') }), roh: d.analysen });
  }

  optionen.fortschritt?.({ erledigt: ergebnis.geprueft!.length, gesamt, kapitel: null, titel: '' });
  ergebnis.bereitsEntschieden = entschiedenGesehen.size;
  ergebnis.tokens = { eingabe: nutzung.eingabe + nutzung.cacheGeschrieben, ausgabe: nutzung.ausgabe, cacheGelesen: nutzung.cacheGelesen };
  ergebnis.kostenUsd = kostenUsd(nutzung, preisFuer(lauf.modell, lauf.rolle, lauf.kontext.text.length / 3));
  return ergebnis;
}

function enthaelt(aussen: Bereich, innen: Bereich): boolean {
  return innen.start >= aussen.start && innen.ende <= aussen.ende;
}

/** Gleicher Name (ohne Artikel der/die/das/the), auch mit Genitiv-s bzw. Possessiv („Pauls“, „Paul’s“, „James’“). */
function gleichName(text: string, namen: string[]): boolean {
  const ohneArtikel = (s: string) => normalisiere(s).text.trim().toLocaleLowerCase('de').replace(/^(der|die|das|the)\s+/, '');
  const t = ohneArtikel(text);
  return namen.some((n) => {
    // normalisiert: ’ und ' sind "
    const m = ohneArtikel(n);
    return m.length > 0 && (t === m || t === `${m}s` || t === `${m}"` || t === `${m}"s`);
  });
}

export async function schlageErwaehnungenVor(
  leser: ProjektLeser,
  kapitel: Id,
  transport: KiTransport,
  einstellungen: KiEinstellungen,
  oberflaeche: Sprache = 'de',
): Promise<ErwaehnungsVorschlag[]> {
  const m = meldungenIn(oberflaeche);
  const daten = await ladeProjekt(leser);
  const kontext = baueBuchKontext(daten);
  const k = kontext.kapitel.find((x) => x.id === kapitel);
  if (!k) throw new KiFehler('auftrag', m('kapitelFehlt', { kapitel }));
  if (!k.text.trim()) return [];
  if (!(await transport.bereit())) {
    throw new KiFehler('nicht_bereit', m('nichtBereit'));
  }
  const body = baueAnfrage({
    modell: deploymentFuer(einstellungen, 'erkennung'),
    system: systemErkennung(kontext.sprache),
    kontext,
    aufgabe: erwaehnungsAufgabe(k, kontext.sprache),
    schema: erwaehnungsSchema(kontext),
    effort: EFFORT.erkennung,
  });
  let antwort;
  try {
    antwort = leseAntwort(await transport.senden(body), oberflaeche);
  } catch (e) {
    throw e instanceof KiFehler ? e : new KiFehler('api', fehlertext(e));
  }
  if (antwort.daten === null) throw new KiFehler('antwort', antwort.grund ?? m('keineDatenSatz'));
  const liste = (antwort.daten as Record<string, unknown> | null)?.vorschlaege;
  if (!Array.isArray(liste)) throw new KiFehler('antwort', m('schemaFalsch'));

  const alleNamen = [
    ...kontext.figuren.flatMap((f) => [f.name, ...f.aliase, ...f.formen]),
    ...kontext.orte.flatMap((o) => [o.name, ...o.aliase]),
  ];
  const entschieden = daten.entscheidungen.zuordnungen
    .filter((z) => z.anker.kapitel === k.id)
    .map((z) => ankerFinden(k.text, z.anker))
    .filter((b): b is Bereich => b !== null);
  const ergebnis: { start: number; ende: number; vorschlag: ErwaehnungsVorschlag }[] = [];

  for (const roh of liste) {
    const v = (roh ?? {}) as Record<string, unknown>;
    const text = typeof v.text === 'string' ? v.text.trim() : '';
    const zitat = typeof v.zitat === 'string' ? v.zitat.trim() : '';
    if (!text || !zitat) continue;
    const zitatBereiche = findeZitat(k.text, zitat);
    const stelle = findeZitat(k.text, text).find((b) => zitatBereiche.some((z) => enthaelt(z, b)));
    if (!stelle) continue;

    let ziel: Verweis | null = null;
    let zielTyp: 'figur' | 'ort' | undefined;
    const id = typeof v.zielId === 'string' ? v.zielId : '';
    if (v.zielTyp === 'figur' || v.zielTyp === 'ort') {
      const figur = v.zielTyp === 'figur' ? kontext.figuren.find((f) => f.id === id) : undefined;
      const ort = v.zielTyp === 'ort' ? kontext.orte.find((o) => o.id === id) : undefined;
      const bekannt = figur ?? ort;
      if (!bekannt) continue;
      const namen = figur ? [figur.name, ...figur.aliase, ...figur.formen] : [bekannt.name, ...bekannt.aliase];
      if (gleichName(text, namen)) continue;
      ziel = { typ: v.zielTyp, id: bekannt.id };
    } else if (v.zielTyp === 'unbekannte_figur' || v.zielTyp === 'unbekannter_ort') {
      if (gleichName(text, alleNamen)) continue;
      zielTyp = v.zielTyp === 'unbekannte_figur' ? 'figur' : 'ort';
    } else {
      continue;
    }
    if (entschieden.some((b) => b.start === stelle.start && b.ende === stelle.ende)) continue;
    if (ergebnis.some((e) => e.start === stelle.start && e.ende === stelle.ende)) continue;

    ergebnis.push({
      start: stelle.start,
      ende: stelle.ende,
      vorschlag: {
        anker: ankerErzeugen(k.id, k.text, stelle.start, stelle.ende),
        text: k.text.slice(stelle.start, stelle.ende),
        ziel,
        begruendung: typeof v.begruendung === 'string' ? v.begruendung.trim() : '',
        ...(zielTyp ? { zielTyp } : {}),
      },
    });
  }
  return ergebnis.sort((a, b) => a.start - b.start).map((e) => e.vorschlag);
}
