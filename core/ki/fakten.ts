/**
 * KI-Aufgabe Figurenfakten (F-17): Angaben über Figuren, wie sie im Text stehen (Alter, Aussehen, Beruf, Auto …),
 * jede mit wörtlichem Beleg (E6). Nur Beobachtung, nie Text fürs Buch. Widersprüche und Abweichungen von der
 * Planung erkennt die App selbst (core/figuren/fakten.ts) – die KI vergleicht nichts.
 *
 * Ein Request für das ganze Buch (Buchkontext als gecachter Prefix, Allowlist E12) – optional nur für eine Figur.
 * Nur ProjektLeser und KiTransport; gespeichert wird im Store (.plotwerk/figurenfakten.json).
 */
import type { FigurFakt, Id, KiEinstellungen } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { zitatKern } from '../text';
import type { KiRolle } from './anfrage';
import {
  fuehreAufgabeAus,
  schaetzeAufgabe,
  type AufgabenDefinition,
  type AufgabenErgebnis,
  type AufgabenOptionen,
  type AufgabenPruefung,
} from './aufgabe';
import type { KiTransport, Schaetzung } from './index';
import type { BuchKontext, KontextFigur } from './kontext';
import { meldungenIn } from './meldungen';
import { ANTWORTSPRACHE_EN, type Sprache } from './sprache';

/** Kennung im Aufgabenkopf (<aufgabe art="fakten">); Demo-Antworten sind unter diesem Schlüssel registriert. */
export const FAKTEN_ART = 'fakten';

/** Höchstzahl Wörter für Merkmal bzw. Wert */
export const MERKMAL_MAX_WOERTER = 3;
export const WERT_MAX_WOERTER = 8;

/** Übliche Merkmale (zusätzlich zu den Planfeldern der Figuren) */
export const STANDARD_MERKMALE = ['Alter', 'Geburtstag', 'Aussehen', 'Haare', 'Augen', 'Größe', 'Beruf', 'Wohnort', 'Herkunft', 'Familie', 'Auto'];
export const STANDARD_MERKMALE_EN = ['Age', 'Birthday', 'Appearance', 'Hair', 'Eyes', 'Height', 'Occupation', 'Home', 'Origin', 'Family', 'Car'];

export interface FaktenAuftrag {
  /** nur diese Figur; fehlt = alle Figuren */
  figur?: Id;
  /** Opus statt Sonnet */
  tiefencheck?: boolean;
}

export interface FaktenErgebnis {
  fakten: FigurFakt[];
  /** Figuren, für die gefragt wurde */
  figuren: Id[];
}

export const SYSTEM_FAKTEN = `Du bist Lektorats-Leser für ein deutschsprachiges Romanmanuskript. Du liest das Buch so, wie eine Leserin es liest: den Text der Kapitel in ihrer Reihenfolge und die wenigen Angaben des Autors zu Figuren, Orten und Gruppen. Dazu kommt die Planung des Autors (Zeilen „Planung“ bei Figuren); sie gehört nicht zum Buch und ist nie ein Beleg.

Deine Aufgabe: Sammle, was der Text über die Figuren als Tatsache sagt – Alter, Aussehen, Beruf, Wohnort, Familie, Besitz wie ein Auto, feste Gewohnheiten. Jede Angabe mit einem wörtlichen Zitat.

Du schreibst nie Text für das Buch und bewertest nichts. Du vergleichst die Angaben nicht und meldest keine Widersprüche – das macht die App. Du legst nichts fest, was der Text offenlässt.

Regeln:
- Nur, was der Text ausdrücklich sagt oder eindeutig zeigt; keine Vermutungen, keine Deutung, keine Gefühle oder Stimmungen.
- figur ist die id einer angelegten Figur. Ein namenloser Ich-Erzähler gehört zu der Figur, die erkennbar erzählt.
- merkmal: höchstens drei Wörter; nimm, wo es passt, den Namen eines Planungsfelds der Figur oder eines der üblichen Merkmale. Gleiche Merkmale immer gleich benennen.
- wert: höchstens acht Wörter, so nah am Text wie möglich (zum Beispiel „34“, „alter Saab 900“, „Architekt“).
- Jedes Zitat ist eine zusammenhängende Passage aus dem Kapitel, das du unter "kapitel" mit seiner id angibst, Zeichen für Zeichen aus dem <text> kopiert, ohne Auslassungen, höchstens ein Satz.
- Nennt der Text dasselbe Merkmal an mehreren Stellen, gib jede Stelle als eigene Angabe an – auch wenn die Werte voneinander abweichen.
- Als „bewusst vage“ markierte Figuren sind absichtlich mehrdeutig; gib bei ihnen nur an, was der Text eindeutig sagt.
- Lieber wenige belastbare Angaben als viele unsichere.`;

export const SYSTEM_FAKTEN_EN = `You are an editorial reader for an English-language novel. You read the book the way a reader does: the text of the chapters in their order and the author's few notes on characters, places and groups. In addition there is the author's planning (lines “Plan” for characters); it is not part of the book and never evidence.

Your task: collect what the text states as fact about the characters – age, appearance, occupation, home, family, possessions such as a car, fixed habits. Each with a verbatim quote.

You never write text for the book and judge nothing. You do not compare the facts and report no contradictions – the app does that. You settle nothing the text leaves open.

Rules:
- Only what the text states explicitly or shows unambiguously; no assumptions, no interpretation, no feelings or moods.
- figur is the id of a character that is set up. A nameless first-person narrator belongs to the character who recognisably narrates.
- merkmal: at most three words; where it fits, use the name of one of the character's plan fields or one of the usual traits. Always name the same trait the same way.
- wert: at most eight words, as close to the text as possible (for example “34”, “old Saab 900”, “architect”).
- Every quote is one continuous passage from the chapter you name under "kapitel" with its id, copied character for character from the <text>, without omissions, at most one sentence.
- If the text mentions the same trait in several places, give each place as its own fact – even if the values differ.
- Characters marked “deliberately vague” are intentionally ambiguous; for them give only what the text states unambiguously.
- Prefer a few solid facts to many uncertain ones.

${ANTWORTSPRACHE_EN}`;

/** Stabiler Schlüssel aus Figur, Merkmal und Beleg. */
export function faktSchluessel(figur: Id, merkmal: string, zitat: { kapitel: Id; text: string }): string {
  return `fakt:${figur}|${merkmal.trim().toLocaleLowerCase('de')}|${zitat.kapitel}/${zitatKern(zitat.text)}`;
}

function figurZeile(f: KontextFigur, en: boolean): string {
  const teile = [`${f.name} (id: ${f.id})`];
  if (f.aliase.length) teile.push(`${en ? 'also called' : 'auch genannt'}: ${f.aliase.join(', ')}`);
  if (f.existenz === 'bewusst_vage') teile.push(en ? 'deliberately vague' : 'bewusst vage');
  if (f.plan.length) teile.push(`${en ? 'plan fields' : 'Planungsfelder'}: ${f.plan.map((p) => p.feld).join(', ')}`);
  return `- ${teile.join(' · ')}`;
}

function aufgabenText(kontext: BuchKontext, figuren: KontextFigur[]): string {
  const en = kontext.sprache === 'en';
  const z: string[] = [];
  if (en) {
    z.push(figuren.length === 1 ? `Collect the facts about ${figuren[0]!.name} in the whole book.` : 'Collect the facts about these characters in the whole book:');
    z.push(...figuren.map((f) => figurZeile(f, true)));
    z.push('');
    z.push(`Usual traits: ${STANDARD_MERKMALE_EN.join(', ')}.`);
    z.push('For each fact: figur (id), merkmal, wert, kapitel (id) and zitat (verbatim).');
  } else {
    z.push(figuren.length === 1 ? `Sammle die Angaben über ${figuren[0]!.name} im ganzen Buch.` : 'Sammle die Angaben über diese Figuren im ganzen Buch:');
    z.push(...figuren.map((f) => figurZeile(f, false)));
    z.push('');
    z.push(`Übliche Merkmale: ${STANDARD_MERKMALE.join(', ')}.`);
    z.push('Für jede Angabe: figur (id), merkmal, wert, kapitel (id) und zitat (wörtlich).');
  }
  return z.join('\n');
}

/** Antwortschema – ohne Feld für Ersatztext oder Bewertung. */
export function faktenSchema(kontext: BuchKontext, figuren: Id[]): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id) };
  const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
  return obj({
    fakten: {
      type: 'array',
      items: obj({
        figur: { type: 'string', enum: figuren },
        merkmal: { type: 'string' },
        wert: { type: 'string' },
        kapitel,
        zitat: { type: 'string' },
      }),
    },
  });
}

const woerter = (s: string) => s.split(/\s+/u).filter(Boolean).length;

/** Antwort auswerten (auch einzeln testbar). */
export function werteFaktenAus(daten: unknown, p: AufgabenPruefung, figuren: Id[]): FaktenErgebnis {
  const ergebnis: FaktenErgebnis = { fakten: [], figuren };
  const m = meldungenIn(p.oberflaeche);
  const d = (daten ?? {}) as Record<string, unknown>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.fakten)) {
    p.verwerfen(m('schemaFalsch'), daten);
    return ergebnis;
  }
  const erlaubt = new Set(figuren);
  const reihe = new Map(p.kontext.kapitel.map((k, i) => [k.id, i]));
  const gesehen = new Set<string>();
  for (const roh of d.fakten) {
    const f = (roh ?? {}) as Record<string, unknown>;
    const figur = p.figur(f.figur);
    if (!figur || !erlaubt.has(figur.id)) {
      p.verwerfen(m('unbekannteFigur', { name: String(f.figur ?? '') }), roh);
      continue;
    }
    const merkmal = p.text(f.merkmal, roh, { pflicht: true });
    const wert = p.text(f.wert, roh, { pflicht: true });
    if (merkmal === null || wert === null) continue;
    if (woerter(merkmal) > MERKMAL_MAX_WOERTER || woerter(wert) > WERT_MAX_WOERTER) {
      p.verwerfen(m('faktZuLang'), roh);
      continue;
    }
    const zitate = p.zitate([{ kapitel: f.kapitel, text: f.zitat }], roh);
    if (!zitate) continue;
    const zitat = zitate[0]!;
    const schluessel = faktSchluessel(figur.id, merkmal, zitat);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.fakten.push({ schluessel, figur: figur.id, merkmal, wert, kapitel: zitat.kapitel, zitat, status: 'neu' });
  }
  ergebnis.fakten.sort((a, b) => (reihe.get(a.kapitel) ?? 0) - (reihe.get(b.kapitel) ?? 0));
  return ergebnis;
}

/** Figuren eines Auftrags: eine bestimmte oder alle außer Statisten. */
function figurenFuer(kontext: BuchKontext, auftrag: FaktenAuftrag): KontextFigur[] {
  if (auftrag.figur) return kontext.figuren.filter((f) => f.id === auftrag.figur);
  return kontext.figuren.filter((f) => f.rolle !== 'statist');
}

export function faktenDefinition(auftrag: FaktenAuftrag): AufgabenDefinition<FaktenErgebnis> {
  const rolle: KiRolle = auftrag.tiefencheck ? 'tiefencheck' : 'pruefung';
  return {
    name: 'Figurenfakten',
    nameEn: meldungenIn('en')('nameFakten'),
    art: FAKTEN_ART,
    attribute: auftrag.figur ? { figur: auftrag.figur } : {},
    rolle,
    system: SYSTEM_FAKTEN,
    systemEn: SYSTEM_FAKTEN_EN,
    ausgabeSchaetzung: auftrag.tiefencheck ? 8000 : 4000,
    aufgabe(kontext) {
      return aufgabenText(kontext, figurenFuer(kontext, auftrag));
    },
    schema: (kontext) => faktenSchema(kontext, figurenFuer(kontext, auftrag).map((f) => f.id)),
    auswerten: (daten, p) => werteFaktenAus(daten, p, figurenFuer(p.kontext, auftrag).map((f) => f.id)),
  };
}

/** Sammelt die Figurenfakten (eine Anfrage). Schreibt nichts. */
export function sammleFakten(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: FaktenAuftrag,
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<FaktenErgebnis>> {
  return fuehreAufgabeAus(leser, transport, einstellungen, faktenDefinition(auftrag), optionen);
}

/** Schätzung vor dem Start (Tokens, Kosten). */
export function schaetzeFakten(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: FaktenAuftrag,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  return schaetzeAufgabe(leser, transport, einstellungen, faktenDefinition(auftrag), oberflaeche);
}
