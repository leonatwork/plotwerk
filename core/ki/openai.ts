/**
 * Übersetzer Messages-API ⇄ OpenAI Chat Completions (E15). core/ki baut weiter Messages-API-Bodys und
 * prüft Messages-API-Antworten; für OpenAI-kompatible Dienste (OpenAI, OpenRouter, Qwen, Ollama,
 * LM Studio …) übersetzt der Transport davor und danach. Prompt, Allowlist und Antwortprüfung bleiben
 * damit für alle Anbieter dieselben.
 *
 * - system-Blöcke → Nachricht `system`; Inhaltsblöcke → ein Text (cache_control entfällt: OpenAI-kompatible
 *   Dienste cachen gleiche Anfänge selbst, und das Buch bleibt der feste Anfang).
 * - output_config.format → response_format (json_schema strict; bei `json_object` steht das Schema im Prompt).
 * - output_config.effort → reasoning_effort bzw. reasoning.effort, wo die Vorlage es vorsieht.
 * - Antwort: finish_reason → stop_reason, usage → input/output/cache_read_input_tokens, Text → JSON
 *   (ohne vorangestelltes <think>…</think> und ohne ```-Zaun).
 */
import { MAX_TOKENS } from './anfrage';
import type { VorlageInfo } from './anbieter';

/** Ausgabe-Tokens, die im Kontext des Modells frei bleiben müssen (Antwort samt Denken, grob). */
export const KONTEXT_RESERVE = 4000;

type Roh = Record<string, unknown>;

function istObjekt(v: unknown): v is Roh {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Text aus einem String oder einer Liste von Text-Blöcken (Messages-API wie Chat Completions). */
function textAus(inhalt: unknown): string {
  if (typeof inhalt === 'string') return inhalt;
  if (!Array.isArray(inhalt)) return '';
  return inhalt
    .filter((b): b is Roh => istObjekt(b) && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n\n');
}

/** Messages-API-Body → Chat-Completions-Body für die Vorlage. */
export function nachOpenAi(body: Roh, vorlage: VorlageInfo): Roh {
  const ausgabe = istObjekt(body.output_config) ? body.output_config : {};
  const format = istObjekt(ausgabe.format) ? ausgabe.format : undefined;
  const schema = format?.type === 'json_schema' && istObjekt(format.schema) ? format.schema : undefined;

  let system = textAus(body.system);
  if (schema && vorlage.strukturiert === 'json_object') {
    system += `\n\nRespond only with one JSON object that matches this JSON Schema, without any other text:\n${JSON.stringify(schema)}`;
  }
  const nachrichten: Roh[] = [];
  if (system.trim()) nachrichten.push({ role: 'system', content: system });
  for (const n of Array.isArray(body.messages) ? body.messages : []) {
    if (!istObjekt(n)) continue;
    nachrichten.push({ role: n.role === 'assistant' ? 'assistant' : 'user', content: textAus(n.content) });
  }

  const ergebnis: Roh = {
    model: body.model,
    messages: nachrichten,
    [vorlage.maxTokensFeld]: typeof body.max_tokens === 'number' ? body.max_tokens : MAX_TOKENS,
    stream: false,
  };
  if (schema) {
    ergebnis.response_format =
      vorlage.strukturiert === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: 'antwort', strict: true, schema } }
        : { type: 'json_object' };
  }
  const effort = typeof ausgabe.effort === 'string' ? ausgabe.effort : undefined;
  if (effort && vorlage.effort === 'reasoning_effort') ergebnis.reasoning_effort = effort;
  if (effort && vorlage.effort === 'reasoning') ergebnis.reasoning = { effort };
  return { ...ergebnis, ...(vorlage.zusatz ?? {}) };
}

/**
 * JSON aus dem Antworttext: ohne vorangestelltes <think>…</think> (lokale Denkmodelle) und ohne
 * ```json-Zaun; steht davor oder danach noch Text, zählt der Teil vom ersten { bis zur letzten }.
 */
export function jsonAusText(text: string): string {
  let t = text.replace(/^\s*<think>[\s\S]*?<\/think>/, '').trim();
  const zaun = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(t);
  if (zaun) t = zaun[1]!.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const anfang = t.indexOf('{');
    const ende = t.lastIndexOf('}');
    if (anfang >= 0 && ende > anfang) t = t.slice(anfang, ende + 1);
  }
  return t;
}

function zahl(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const STOP: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  content_filter: 'refusal',
};

/** Chat-Completions-Antwort → Messages-API-Antwort (für leseAntwort). */
export function vonOpenAi(roh: Roh): Roh {
  if (roh.error !== undefined && roh.error !== null) {
    const f = roh.error;
    const meldung = typeof f === 'string' ? f : istObjekt(f) && typeof f.message === 'string' ? f.message : JSON.stringify(f);
    const typ = istObjekt(f) ? String(f.type ?? f.code ?? 'error') : 'error';
    return { type: 'error', error: { type: typ, message: meldung } };
  }
  const wahl = Array.isArray(roh.choices) && istObjekt(roh.choices[0]) ? roh.choices[0] : undefined;
  const nachricht = wahl && istObjekt(wahl.message) ? wahl.message : {};
  const u = istObjekt(roh.usage) ? roh.usage : {};
  const details = istObjekt(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
  const gecacht = zahl(details.cached_tokens);
  const usage = {
    input_tokens: Math.max(0, zahl(u.prompt_tokens) - gecacht),
    output_tokens: zahl(u.completion_tokens),
    cache_read_input_tokens: gecacht,
    cache_creation_input_tokens: 0,
  };
  const abgelehnt = typeof nachricht.refusal === 'string' && nachricht.refusal.trim() !== '';
  const grund = typeof wahl?.finish_reason === 'string' ? wahl.finish_reason : 'keine_antwort';
  const text = textAus(nachricht.content);
  return {
    type: 'message',
    role: 'assistant',
    model: roh.model,
    content: text ? [{ type: 'text', text: jsonAusText(text) }] : [],
    stop_reason: abgelehnt ? 'refusal' : (STOP[grund] ?? grund),
    usage,
  };
}

/** Grobe Schätzung der Eingabe-Tokens eines Chat-Completions-Bodys (Zeichen/3 wie ohne count_tokens, eher zu hoch). */
export function eingabeTokensSchaetzen(body: Roh): number {
  return Math.ceil(JSON.stringify(body.messages ?? []).length / 3);
}

/** Passt die Anfrage samt KONTEXT_RESERVE in `kontextTokens`? Ohne Angabe wird nicht geprüft. */
export function passtInKontext(body: Roh, kontextTokens: number | undefined): { passt: boolean; tokens: number } {
  const tokens = eingabeTokensSchaetzen(body);
  return { passt: !kontextTokens || tokens + KONTEXT_RESERVE <= kontextTokens, tokens };
}
