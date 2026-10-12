/**
 * Messages-API-Bodys (rohes JSON, der HTTP-Aufruf passiert im Rust-Kern).
 * Aufbau für Prompt Caching (E13): system (fest) → Buchkontext mit cache_control → Aufgabe.
 * Kein thinking-Parameter (adaptiv ist Standard), kein Prefill, kein tool_choice;
 * Antwortformat über output_config.format (Structured Outputs).
 */
import type { Id } from '../model/types';
import type { BuchKontext, KontextKapitel } from './kontext';

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

function kapitelZeile(k: KontextKapitel): string {
  return `Kapitel ${k.nr} „${k.titel}“ (id: ${k.id})`;
}

export function pruefAufgabe(k: KontextKapitel): string {
  return [
    `<aufgabe art="pruefung" kapitel="${k.id}">`,
    `Prüfe ${kapitelZeile(k)} vor dem Hintergrund des ganzen Buchs.`,
    `- hinweise: nur Hinweise, bei denen mindestens ein Zitat aus diesem Kapitel stammt. Zitate aus anderen Kapiteln sind erlaubt, wenn der Hinweis einen Vergleich braucht.`,
    `- analysen: genau eine Analyse für dieses Kapitel (kapitel: "${k.id}").`,
    '</aufgabe>',
  ].join('\n');
}

export function erwaehnungsAufgabe(k: KontextKapitel): string {
  return [
    `<aufgabe art="erwaehnungen" kapitel="${k.id}">`,
    `Suche Erwähnungen in ${kapitelZeile(k)}. Alle Zitate stammen aus diesem Kapitel.`,
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
