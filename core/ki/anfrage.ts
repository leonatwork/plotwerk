/**
 * Messages-API-Bodys (rohes JSON, der HTTP-Aufruf passiert im Rust-Kern).
 * Aufbau für Prompt Caching (E13): system (fest) → Buchkontext mit cache_control → Aufgabe.
 * Kein thinking-Parameter (adaptiv ist Standard), kein Prefill, kein tool_choice;
 * Antwortformat über output_config.format (Structured Outputs).
 */
import type { Id } from '../model/types';
import type { BuchKontext, KontextKapitel } from './kontext';
import { ANTWORTSPRACHE_EN, type Sprache } from './sprache';

export type KiRolle = 'erkennung' | 'pruefung' | 'tiefencheck';
export type Effort = 'low' | 'medium' | 'high';

export const MAX_TOKENS = 16000;

export const EFFORT: Record<KiRolle, Effort> = {
  erkennung: 'low',
  pruefung: 'medium',
  tiefencheck: 'high',
};

/** Hinweis-Typen, die das Modell liefern darf. Schreibweise und Struktur prüft die App lokal. */
export const KI_HINWEIS_TYPEN = ['pruefen', 'offener_faden', 'unbekannt', 'zeitleiste', 'sprache'] as const;

export const SYSTEM_PRUEFUNG = `Du bist Lektorats-Prüfer für ein deutschsprachiges Romanmanuskript. Du liest das Buch so, wie eine Leserin es liest: den Text der Kapitel in ihrer Reihenfolge und die wenigen Angaben des Autors zu Figuren, Orten, Gruppen und Realitätsebenen. Dazu kommt die Planung des Autors (Zeilen „Planung“ bei Figuren, <plan> bei Kapiteln); sie gehört nicht zum Buch. Mehr weißt du nicht über die Geschichte.

Deine Aufgabe ist, Stellen zu finden, die der Autor prüfen sollte, und kurz zu erklären, warum sie auffallen. Du schreibst nie Text für das Buch: keine Umformulierungen, keine Ersatzsätze, keine Formulierungsvorschläge, keine Korrekturen. Ob und wie eine Stelle geändert wird, entscheidet allein der Autor.

Regeln für Hinweise:
- Jedes Zitat ist eine zusammenhängende Passage aus dem Kapitel, das du unter "kapitel" mit seiner id angibst, Zeichen für Zeichen aus dem <text> kopiert, ohne Auslassungen, höchstens ein Satz. Hinweise ohne wörtliches Zitat werden verworfen.
- Die Erklärung beschreibt nur die Beobachtung: was steht wo, und warum fällt es beim Lesen auf. Sie enthält keinen Vorschlag, wie der Text lauten könnte.
- Als „bewusst vage“ markierte Figuren und Stellen sind absichtlich mehrdeutig. Melde sie nie als Widerspruch (Typ pruefen).
- Als „noch offen“ markierte Dinge prüfst du normal.
- Lieber wenige belastbare Hinweise als viele vage. Geschmacksfragen sind keine Hinweise.
- plan: Widerspricht der Text der Planung einer Figur oder läuft ein Kapitel erkennbar anders als in seinem <plan>, ist das ein Hinweis vom Typ pruefen. Gib dann unter plan die id der Figur (figur) bzw. des Kapitels (kapitel) und den Namen des Planungsfelds (feld, z. B. „Aussehen“ oder „Geplante Szene“) an; das Zitat stammt wie immer aus dem Text. Was der Plan vorsieht, der Text aber noch nicht erzählt, ist kein Widerspruch. Bei allen anderen Hinweisen bleiben figur, kapitel und feld leer. Bei bewusst vagen Figuren meldest du auch keine Abweichung von der Planung.

Hinweis-Typen:
- pruefen: Stellen, die sich widersprechen (Fakten, Abläufe, Eigenschaften), sodass es Leser:innen auffallen würde.
- offener_faden: Etwas wird eröffnet und bisher weder aufgelöst noch wieder aufgegriffen.
- unbekannt: ein Name im Text, der zu keiner angelegten Figur und keinem angelegten Ort gehört.
- zeitleiste: Auffälligkeiten in der zeitlichen Abfolge (Wochentage, Tageszeiten, Reihenfolge der Ereignisse).
- sprache: Tempuswechsel oder großgeschriebenes „Sie“ für die dritte Person – nur benennen, nie korrigieren.
Abweichende Schreibweisen und strukturelle Dinge (leere Kapitel, abgebrochene Sätze) prüft die App selbst; melde sie nicht.

Analyse pro Kapitel:
- zusammenfassung: zwei bis vier Sätze, was im Kapitel passiert.
- kurz: ein Satz für „Bis hierhin passiert“.
- wendung: die Wendung des Kapitels in einem Satz, sonst „Keine.“
- antagonistenBezug: Bezug zu den Gruppen vom Typ Antagonist in einem Satz, sonst „–“.
- loseEnden: Fäden, die hier eröffnet (eroeffnet: true) oder aufgegriffen (eroeffnet: false) werden. Benenne denselben Faden in allen Kapiteln gleich.
Bei bewusst vagen Figuren und Stellen formulierst du Zusammenfassungen neutral aus der Sicht der Figur („Er glaubt …“, „Sie erinnert sich nicht …“), ohne festzulegen, was wirklich geschehen ist.`;

export const SYSTEM_ERKENNUNG = `Du hilfst, in einem deutschsprachigen Romankapitel Erwähnungen von Figuren und Orten zu finden. Die App erkennt Namen und Aliase der angelegten Figuren und Orte bereits selbst. Du suchst nur, was sie nicht findet:
- indirekte Erwähnungen angelegter Figuren oder Orte (zum Beispiel „ihr Chef“ oder „das Café“), wenn aus dem Text klar wird, wer oder was gemeint ist;
- abweichende Schreibweisen angelegter Namen;
- Namen und Bezeichnungen von Personen oder Orten, die zu keiner angelegten Figur und keinem angelegten Ort gehören (zum Beispiel ein Name, der nur einmal fällt, oder „der Hafenmeister“).

Für jeden Vorschlag:
- text: genau die Bezeichnung im Text, Zeichen für Zeichen kopiert (zum Beispiel „der Hafenmeister“ oder „Fiete“);
- zitat: der Satz oder Satzteil, in dem sie steht, Zeichen für Zeichen aus dem <text> des Kapitels kopiert;
- zielTyp: figur oder ort für angelegte Figuren und Orte, sonst unbekannte_figur oder unbekannter_ort;
- zielId: die id der angelegten Figur bzw. des Orts, sonst ein leerer Text;
- begruendung: ein kurzer Satz, woran du die Zuordnung erkennst.
Als „bewusst vage“ markierte Figuren ordnest du nur zu, wenn der Text es eindeutig sagt. Du schreibst keinen Text um.`;

/** Englische Fassung von SYSTEM_PRUEFUNG (Buchsprache en). Feldnamen und Typen bleiben wie im Schema. */
export const SYSTEM_PRUEFUNG_EN = `You are a manuscript reviewer for an English-language novel. You read the book the way a reader does: the text of the chapters in their order and the author's few notes on characters, places, groups and levels of reality. In addition there is the author's planning (lines “Plan” for characters, <plan> for chapters); it is not part of the book. You know nothing else about the story.

Your task is to find passages the author should check, and to explain briefly why they stand out. You never write text for the book: no rewordings, no replacement sentences, no suggested phrasings, no corrections. Whether and how a passage is changed is decided by the author alone.

Rules for findings (hinweise):
- Every quote is one continuous passage from the chapter you name under "kapitel" with its id, copied character for character from the <text>, without omissions, at most one sentence. Findings without a verbatim quote are discarded.
- The explanation (erklaerung) only describes the observation: what is where, and why it stands out when reading. It contains no suggestion of how the text could read.
- Characters and passages marked “deliberately vague” are intentionally ambiguous. Never report them as a contradiction (type pruefen).
- Things marked “still open” are checked as usual.
- Prefer a few solid findings to many vague ones. Matters of taste are not findings.
- plan: If the text contradicts a character's plan, or a chapter clearly runs differently from its <plan>, that is a finding of type pruefen. Then give under plan the id of the character (figur) or of the chapter (kapitel) and the name of the plan field (feld, exactly as it appears, e.g. the field after “Plan ·” or “Planned scene”); the quote, as always, comes from the text. What the plan intends but the text does not tell yet is not a contradiction. For all other findings figur, kapitel and feld stay empty. For deliberately vague characters you report no deviation from the plan either.

Finding types (typ):
- pruefen: passages that contradict each other (facts, sequences, traits) in a way readers would notice.
- offener_faden: something is opened and so far neither resolved nor picked up again.
- unbekannt: a name in the text that belongs to no character and no place set up by the author.
- zeitleiste: irregularities in the chronology (weekdays, times of day, order of events).
- sprache: unintended tense shifts or shifts in point of view – only name them, never correct them.
The app checks spelling variants and structural matters (empty chapters, broken-off sentences) itself; do not report them.

Analysis per chapter (analysen):
- zusammenfassung: two to four sentences on what happens in the chapter.
- kurz: one sentence for “So far”.
- wendung: the chapter's turning point in one sentence, otherwise “None.”
- antagonistenBezug: the connection to the groups of type Antagonist in one sentence, otherwise “–”.
- loseEnden: threads that are opened (eroeffnet: true) or picked up (eroeffnet: false) here. Name the same thread the same way in all chapters.
For deliberately vague characters and passages you write summaries neutrally from the character's point of view (“Paul believes …”, “Paul doesn't remember …”), without settling what really happened.

${ANTWORTSPRACHE_EN}`;

/** Englische Fassung von SYSTEM_ERKENNUNG. */
export const SYSTEM_ERKENNUNG_EN = `You help to find mentions of characters and places in a chapter of an English-language novel. The app already recognises the names and aliases of the characters and places set up by the author. You only look for what it does not find:
- indirect mentions of characters or places that are set up (for example “her boss” or “the café”), when the text makes clear who or what is meant;
- variant spellings of names that are set up;
- names and designations of people or places that belong to no character and no place set up (for example a name that occurs only once, or “the harbour master”).

For each suggestion:
- text: exactly the designation in the text, copied character for character (for example “the harbour master” or “Fiete”);
- zitat: the sentence or part of a sentence it appears in, copied character for character from the <text> of the chapter;
- zielTyp: figur or ort for characters and places that are set up, otherwise unbekannte_figur or unbekannter_ort;
- zielId: the id of the character or place that is set up, otherwise an empty string;
- begruendung: a short sentence on how you recognise the assignment.
You only assign characters marked “deliberately vague” when the text says so clearly. You do not rewrite any text.

${ANTWORTSPRACHE_EN}`;

/** System-Prompt der Prüfung bzw. Erkennung in der Buchsprache. */
export function systemPruefung(sprache?: Sprache): string {
  return sprache === 'en' ? SYSTEM_PRUEFUNG_EN : SYSTEM_PRUEFUNG;
}

export function systemErkennung(sprache?: Sprache): string {
  return sprache === 'en' ? SYSTEM_ERKENNUNG_EN : SYSTEM_ERKENNUNG;
}

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const str = { type: 'string' };

/** Kapitel-IDs mit Text (für enum im Schema). Stabil, solange sich das Buch nicht ändert. */
function kapitelIds(kontext: BuchKontext): Id[] {
  return kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id);
}

/** Antwortschema der Prüfung – ohne Feld für Ersatztext (harte Regel 2). */
export function pruefSchema(kontext: BuchKontext): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kapitelIds(kontext) };
  return obj({
    hinweise: {
      type: 'array',
      items: obj({
        typ: { type: 'string', enum: [...KI_HINWEIS_TYPEN] },
        titel: str,
        zitate: { type: 'array', items: obj({ kapitel, text: str }) },
        erklaerung: str,
        plan: obj({
          figur: { type: 'string', enum: ['', ...kontext.figuren.map((f) => f.id)] },
          kapitel: { type: 'string', enum: ['', ...kapitelIds(kontext)] },
          feld: str,
        }),
      }),
    },
    analysen: {
      type: 'array',
      items: obj({
        kapitel,
        zusammenfassung: str,
        kurz: str,
        wendung: str,
        antagonistenBezug: str,
        loseEnden: { type: 'array', items: obj({ name: str, eroeffnet: { type: 'boolean' } }) },
      }),
    },
  });
}

export const ERWAEHNUNGS_ZIELTYPEN = ['figur', 'ort', 'unbekannte_figur', 'unbekannter_ort'] as const;

export function erwaehnungsSchema(kontext: BuchKontext): Record<string, unknown> {
  const ids = ['', ...kontext.figuren.map((f) => f.id), ...kontext.orte.map((o) => o.id)];
  return obj({
    vorschlaege: {
      type: 'array',
      items: obj({
        text: str,
        zitat: str,
        zielTyp: { type: 'string', enum: [...ERWAEHNUNGS_ZIELTYPEN] },
        zielId: { type: 'string', enum: [...new Set(ids)] },
        begruendung: str,
      }),
    },
  });
}

function kapitelZeile(k: KontextKapitel, sprache?: Sprache): string {
  return sprache === 'en' ? `Chapter ${k.nr} “${k.titel}” (id: ${k.id})` : `Kapitel ${k.nr} „${k.titel}“ (id: ${k.id})`;
}

export function pruefAufgabe(k: KontextKapitel, sprache?: Sprache): string {
  if (sprache === 'en')
    return [
      `<aufgabe art="pruefung" kapitel="${k.id}">`,
      `Check ${kapitelZeile(k, sprache)} against the background of the whole book.`,
      `- hinweise: only findings where at least one quote comes from this chapter. Quotes from other chapters are allowed if the finding needs a comparison.`,
      `- analysen: exactly one analysis for this chapter (kapitel: "${k.id}").`,
      '</aufgabe>',
    ].join('\n');
  return [
    `<aufgabe art="pruefung" kapitel="${k.id}">`,
    `Prüfe ${kapitelZeile(k)} vor dem Hintergrund des ganzen Buchs.`,
    `- hinweise: nur Hinweise, bei denen mindestens ein Zitat aus diesem Kapitel stammt. Zitate aus anderen Kapiteln sind erlaubt, wenn der Hinweis einen Vergleich braucht.`,
    `- analysen: genau eine Analyse für dieses Kapitel (kapitel: "${k.id}").`,
    '</aufgabe>',
  ].join('\n');
}

export function erwaehnungsAufgabe(k: KontextKapitel, sprache?: Sprache): string {
  return [
    `<aufgabe art="erwaehnungen" kapitel="${k.id}">`,
    sprache === 'en'
      ? `Look for mentions in ${kapitelZeile(k, sprache)}. All quotes come from this chapter.`
      : `Suche Erwähnungen in ${kapitelZeile(k)}. Alle Zitate stammen aus diesem Kapitel.`,
    '</aufgabe>',
  ].join('\n');
}

export interface AnfrageTeile {
  modell: string;
  system: string;
  kontext: BuchKontext;
  aufgabe: string;
  schema: Record<string, unknown>;
  effort: Effort;
}

/** Vollständiger Messages-API-Body (POST …/anthropic/v1/messages). */
export function baueAnfrage(t: AnfrageTeile): Record<string, unknown> {
  return {
    model: t.modell,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: t.system }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: t.kontext.text, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: t.aufgabe },
        ],
      },
    ],
    output_config: { effort: t.effort, format: { type: 'json_schema', schema: t.schema } },
  };
}

/** Body für count_tokens (POST …/anthropic/v1/messages/count_tokens): ohne max_tokens und output_config. */
export function zaehlBody(anfrage: Record<string, unknown>): Record<string, unknown> {
  return { model: anfrage.model, system: anfrage.system, messages: anfrage.messages };
}

/** Body nur mit dem gecachten Prefix (für die Kostenschätzung). */
export function prefixZaehlBody(t: Omit<AnfrageTeile, 'aufgabe' | 'schema' | 'effort'>): Record<string, unknown> {
  return {
    model: t.modell,
    system: [{ type: 'text', text: t.system }],
    messages: [{ role: 'user', content: [{ type: 'text', text: t.kontext.text }] }],
  };
}
