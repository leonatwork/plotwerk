/**
 * OpenAI-kompatible Dienste (E15): Übersetzung Messages-API ⇄ Chat Completions, und ein ganzer Prüflauf
 * über die Übersetzung mit Demo-Antworten (wie ein lokales Denkmodell: <think>-Block und ```-Zaun).
 */
import { demoDateien } from '../../fixtures/demoProjekt';
import { erstelleDemoKiTransport } from '../../src/backend/ki/demo';
import type { KiEinstellungen } from '../model/types';
import { MemoryFs, PFADE } from '../projekt';
import { baueAnfrage, MAX_TOKENS } from './anfrage';
import {
  jsonAusText,
  KONTEXT_RESERVE,
  nachOpenAi,
  passtInKontext,
  pruefe,
  schaetzeLauf,
  STANDARD_KI,
  VORLAGEN,
  vonOpenAi,
  type KiTransport,
} from './index';

type Body = Record<string, unknown>;

const SCHEMA = { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } }, required: ['a'] };

function anfrage(): Body {
  return baueAnfrage({
    modell: 'qwen3:32b',
    system: 'Du prüfst.',
    kontext: { text: '<buch>Text</buch>' } as never,
    aufgabe: '<aufgabe art="pruefung" kapitel="k1">Prüfe.</aufgabe>',
    schema: SCHEMA,
    effort: 'medium',
  });
}

describe('nachOpenAi', () => {
  it('Ollama: system zuerst, Buch vor Aufgabe in einer Nachricht, Schema als json_schema strict', () => {
    const b = nachOpenAi(anfrage(), VORLAGEN.ollama);
    expect(b).toEqual({
      model: 'qwen3:32b',
      messages: [
        { role: 'system', content: 'Du prüfst.' },
        { role: 'user', content: '<buch>Text</buch>\n\n<aufgabe art="pruefung" kapitel="k1">Prüfe.</aufgabe>' },
      ],
      max_tokens: MAX_TOKENS,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'antwort', strict: true, schema: SCHEMA } },
    });
    // nichts Anthropic-Spezifisches
    const text = JSON.stringify(b);
    for (const feld of ['cache_control', 'output_config', 'fallbacks', 'thinking']) expect(text).not.toContain(feld);
  });

  it('OpenAI: max_completion_tokens und reasoning_effort', () => {
    const b = nachOpenAi(anfrage(), VORLAGEN.openai);
    expect(b.max_completion_tokens).toBe(MAX_TOKENS);
    expect(b.max_tokens).toBeUndefined();
    expect(b.reasoning_effort).toBe('medium');
  });

  it('OpenRouter: reasoning.effort und Anbieter nur mit Schema-Unterstützung, ohne Datenspeicherung', () => {
    const b = nachOpenAi(anfrage(), VORLAGEN.openrouter);
    expect(b.reasoning).toEqual({ effort: 'medium' });
    expect(b.provider).toEqual({ require_parameters: true, data_collection: 'deny' });
  });

  it('json_object (Qwen): Schema steht im System-Prompt', () => {
    const b = nachOpenAi(anfrage(), VORLAGEN.qwen);
    expect(b.response_format).toEqual({ type: 'json_object' });
    const system = (b.messages as { role: string; content: string }[])[0]!;
    expect(system.role).toBe('system');
    expect(system.content.startsWith('Du prüfst.')).toBe(true);
    expect(system.content).toContain('JSON');
    expect(system.content).toContain(JSON.stringify(SCHEMA));
  });

  it('Bodys ohne Schema (z. B. zum Zählen) bekommen kein response_format', () => {
    const b = nachOpenAi({ model: 'm', system: [{ type: 'text', text: 's' }], messages: [{ role: 'user', content: 'x' }] }, VORLAGEN.ollama);
    expect(b.response_format).toBeUndefined();
    expect(b.messages).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'x' },
    ]);
  });
});

describe('vonOpenAi', () => {
  const antwort = (content: unknown, finish = 'stop', extra: Body = {}): Body => ({
    id: 'c1',
    model: 'qwen3:32b',
    choices: [{ index: 0, message: { role: 'assistant', content, ...extra }, finish_reason: finish }],
    usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
  });

  it('übersetzt Text, stop_reason und Nutzung (gecachte Tokens getrennt)', () => {
    expect(vonOpenAi(antwort('{"a":"x"}'))).toEqual({
      type: 'message',
      role: 'assistant',
      model: 'qwen3:32b',
      content: [{ type: 'text', text: '{"a":"x"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 },
    });
  });

  it('length → max_tokens, content_filter und refusal → refusal', () => {
    expect(vonOpenAi(antwort('{', 'length')).stop_reason).toBe('max_tokens');
    expect(vonOpenAi(antwort(null, 'content_filter')).stop_reason).toBe('refusal');
    expect(vonOpenAi(antwort(null, 'stop', { refusal: 'Nein.' })).stop_reason).toBe('refusal');
    expect(vonOpenAi({ choices: [] }).stop_reason).toBe('keine_antwort');
  });

  it('Fehler-JSON (OpenAI und Ollama) → Messages-API-Fehler', () => {
    expect(vonOpenAi({ error: { message: 'model not found', type: 'invalid_request_error' } })).toEqual({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'model not found' },
    });
    expect(vonOpenAi({ error: 'model "x" not found' })).toEqual({ type: 'error', error: { type: 'error', message: 'model "x" not found' } });
  });

  it('jsonAusText: ohne <think>, ohne Zaun, ohne Text drumherum', () => {
    expect(jsonAusText('<think>erst denken {nicht das}</think>\n{"a":1}')).toBe('{"a":1}');
    expect(jsonAusText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(jsonAusText('Hier ist das Ergebnis: {"a":{"b":2}} – fertig.')).toBe('{"a":{"b":2}}');
    expect(jsonAusText('  {"a":"<think>bleibt</think>"} ')).toBe('{"a":"<think>bleibt</think>"}');
  });
});

describe('Kontextlänge', () => {
  it('lehnt ab, was samt Reserve nicht in den Kontext passt; ohne Angabe wird nicht geprüft', () => {
    const b = nachOpenAi(anfrage(), VORLAGEN.ollama);
    const { tokens } = passtInKontext(b, undefined);
    expect(passtInKontext(b, undefined).passt).toBe(true);
    expect(passtInKontext(b, tokens + KONTEXT_RESERVE).passt).toBe(true);
    expect(passtInKontext(b, tokens + KONTEXT_RESERVE - 1).passt).toBe(false);
  });
});

// ---------------------------------------------------------------------------

const OLLAMA: KiEinstellungen = {
  ...STANDARD_KI,
  anbieter: 'openai',
  openai: { vorlage: 'ollama', endpoint: '', modelle: { erkennung: '', pruefung: 'qwen3:32b', tiefencheck: '' } },
};

/** Demo-Antworten, aber über die Übersetzung – wie ein lokales Denkmodell verpackt. Ohne count_tokens. */
function ueberOpenAi(): KiTransport & { gesendet: Body[] } {
  const demo = erstelleDemoKiTransport({ verzoegerungMs: 0 });
  const gesendet: Body[] = [];
  return {
    gesendet,
    bereit: async () => true,
    async senden(body) {
      const oa = nachOpenAi(body, VORLAGEN.ollama);
      gesendet.push(oa);
      const m = await demo.senden(body);
      const text = (m.content as { text: string }[])[0]!.text;
      return vonOpenAi({
        model: oa.model,
        choices: [{ index: 0, message: { role: 'assistant', content: `<think>Ich lese.</think>\n\`\`\`json\n${text}\n\`\`\`` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
      });
    },
    async tokenZaehlen() {
      throw new Error('count_tokens gibt es hier nicht');
    },
  };
}

function frischFs(): MemoryFs {
  const d = demoDateien();
  for (const p of Object.keys(d)) if (p.startsWith(`${PFADE.analysen}/`)) delete d[p];
  return new MemoryFs(d);
}

describe('Prüflauf über einen OpenAI-kompatiblen Dienst', () => {
  it('liefert dieselben Hinweise wie mit Claude; Kosten unbekannt, Cache aus der Nutzung', async () => {
    const direkt = await pruefe(frischFs(), { umfang: 'buch' }, erstelleDemoKiTransport({ verzoegerungMs: 0 }), STANDARD_KI);
    const t = ueberOpenAi();
    const e = await pruefe(frischFs(), { umfang: 'buch' }, t, OLLAMA);

    expect(e.fehler).toBeUndefined();
    expect(e.hinweise.map((h) => h.schluessel).sort()).toEqual(direkt.hinweise.map((h) => h.schluessel).sort());
    expect(e.analysen).toHaveLength(direkt.analysen.length);
    expect(e.modell).toBe('qwen3:32b');
    expect(e.kostenUsd).toBeUndefined();
    expect(e.tokens.cacheGelesen).toBe(800 * t.gesendet.length);
    for (const b of t.gesendet) {
      expect(b.model).toBe('qwen3:32b');
      expect(b.response_format).toMatchObject({ type: 'json_schema' });
    }
  });

  it('Schätzung ohne count_tokens: über die Zeichenzahl, Kosten unbekannt', async () => {
    const s = await schaetzeLauf(frischFs(), { umfang: 'buch' }, ueberOpenAi(), OLLAMA);
    expect(s.gezaehlt).toBe(false);
    expect(s.kostenBekannt).toBe(false);
    expect(s.kostenUsd).toBe(0);
    expect(s.modell).toBe('qwen3:32b');
  });
});
