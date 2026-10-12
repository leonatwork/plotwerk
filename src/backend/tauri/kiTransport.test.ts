/**
 * KI-Transport (Tauri): Anbieter und Endpoint gehen an den Rust-Kern, der Schlüssel nie.
 * Serverseitiger Fallback nur bei der Claude API und nur für claude-sonnet-5-5/claude-opus-5-5.
 */
import type { KiAnbieter } from '@core/model/types';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { erstelleTauriKiTransport, mitServerFallback, SERVER_FALLBACK_MODELLE, type KiZiel } from './kiTransport';

const BODY = { model: 'claude-sonnet-5-5', max_tokens: 16000, messages: [] };

function transport(ziel: KiZiel, schluessel: Partial<Record<KiAnbieter, boolean>> = {}) {
  mocks.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
    switch (cmd) {
      case 'schluessel_vorhanden':
        return schluessel[args.anbieter as KiAnbieter] ?? false;
      case 'ki_anfrage':
        return { args };
      case 'ki_tokens':
        return 42;
    }
    throw `Unbekanntes Kommando ${cmd}`;
  });
  return erstelleTauriKiTransport(async () => ziel);
}

function letzteArgs(cmd: string): Record<string, unknown> {
  const aufrufe = mocks.invoke.mock.calls.filter((c) => c[0] === cmd);
  return aufrufe[aufrufe.length - 1]![1] as Record<string, unknown>;
}

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe('mitServerFallback', () => {
  it('Claude API + Sonnet/Opus 5.5 → fallbacks: "default"', () => {
    expect(SERVER_FALLBACK_MODELLE).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5']);
    for (const model of SERVER_FALLBACK_MODELLE) {
      expect(mitServerFallback({ ...BODY, model }, 'claude')).toEqual({ ...BODY, model, fallbacks: 'default' });
    }
  });

  it('nicht bei Haiku, anderen Modellen oder Foundry', () => {
    for (const model of ['claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-5', 'mein-sonnet-deployment']) {
      const body = { ...BODY, model };
      expect(mitServerFallback(body, 'claude')).toBe(body);
    }
    for (const model of SERVER_FALLBACK_MODELLE) {
      const body = { ...BODY, model };
      expect(mitServerFallback(body, 'foundry')).toBe(body);
    }
    expect(mitServerFallback({ messages: [] }, 'claude')).toEqual({ messages: [] });
  });

  it('ändert den Body des Aufrufers nicht und lässt ein gesetztes fallbacks stehen', () => {
    const body = { ...BODY };
    const neu = mitServerFallback(body, 'claude');
    expect(body).not.toHaveProperty('fallbacks');
    expect(Object.keys(neu)).toEqual(['model', 'max_tokens', 'messages', 'fallbacks']);
    const eigen = { ...BODY, fallbacks: [{ model: 'claude-opus-5' }] };
    expect(mitServerFallback(eigen, 'claude')).toBe(eigen);
  });
});

describe('Tauri-KI-Transport je Anbieter', () => {
  it('Claude API: Anbieter, Basis-URL und Fallback gehen an ki_anfrage', async () => {
    const t = transport({ anbieter: 'claude', endpoint: 'https://api.anthropic.com' }, { claude: true });
    expect(await t.bereit()).toBe(true);
    expect(letzteArgs('schluessel_vorhanden')).toEqual({ anbieter: 'claude' });

    await t.senden({ ...BODY, model: 'claude-opus-5-5' });
    expect(letzteArgs('ki_anfrage')).toEqual({
      endpoint: 'https://api.anthropic.com',
      body: { ...BODY, model: 'claude-opus-5-5', fallbacks: 'default' },
      anbieter: 'claude',
    });

    await t.senden({ ...BODY, model: 'claude-haiku-5-5' });
    expect(letzteArgs('ki_anfrage').body).not.toHaveProperty('fallbacks');

    // count_tokens ohne fallbacks (der Endpunkt kennt das Feld nicht)
    expect(await t.tokenZaehlen(BODY)).toBe(42);
    expect(letzteArgs('ki_tokens')).toEqual({ endpoint: 'https://api.anthropic.com', body: BODY, anbieter: 'claude' });
  });

  it('Foundry: kein Fallback, Schlüssel des Foundry-Eintrags', async () => {
    const t = transport({ anbieter: 'foundry', endpoint: 'https://x.services.ai.azure.com/anthropic' }, { claude: true });
    // nur der Claude-Schlüssel ist hinterlegt → Foundry ist nicht bereit
    expect(await t.bereit()).toBe(false);
    expect(letzteArgs('schluessel_vorhanden')).toEqual({ anbieter: 'foundry' });

    await t.senden(BODY);
    expect(letzteArgs('ki_anfrage')).toEqual({ endpoint: 'https://x.services.ai.azure.com/anthropic', body: BODY, anbieter: 'foundry' });
  });

  it('ohne Endpoint: nicht bereit, kein Aufruf, verständliche Meldung je Anbieter', async () => {
    const f = transport({ anbieter: 'foundry', endpoint: '  ' }, { foundry: true });
    expect(await f.bereit()).toBe(false);
    await expect(f.senden(BODY)).rejects.toThrow('Foundry-URL');
    const c = transport({ anbieter: 'claude', endpoint: '' }, { claude: true });
    await expect(c.tokenZaehlen(BODY)).rejects.toThrow('Claude API');
    expect(mocks.invoke.mock.calls.some((x) => x[0] === 'ki_anfrage' || x[0] === 'ki_tokens' || x[0] === 'schluessel_vorhanden')).toBe(false);
  });

  it('kein Argument enthält einen Schlüssel', async () => {
    const t = transport({ anbieter: 'claude', endpoint: 'https://api.anthropic.com' }, { claude: true });
    await t.bereit();
    await t.senden(BODY);
    await t.tokenZaehlen(BODY);
    const argumente = mocks.invoke.mock.calls.map((c) => JSON.stringify(c[1] ?? {}));
    expect(argumente.some((a) => /schluessel"|apiKey|x-api-key|sk-ant/i.test(a))).toBe(false);
  });
});

describe('Tauri-KI-Transport: OpenAI-kompatibel', () => {
  const ANFRAGE = {
    model: 'qwen3:32b',
    max_tokens: 16000,
    system: [{ type: 'text', text: 'System' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Buch', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Aufgabe' }] }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object' } } },
  };

  function openAiTransport(ziel: KiZiel, antwort: unknown, schluessel: Partial<Record<KiAnbieter, boolean>> = {}) {
    mocks.invoke.mockImplementation(async (cmd: string, args: Record<string, unknown> = {}) => {
      if (cmd === 'schluessel_vorhanden') return schluessel[args.anbieter as KiAnbieter] ?? false;
      if (cmd === 'ki_anfrage') return antwort;
      throw `Unbekanntes Kommando ${cmd}`;
    });
    return erstelleTauriKiTransport(async () => ziel);
  }

  const OLLAMA: KiZiel = { anbieter: 'openai', endpoint: 'http://localhost:11434/v1', openai: { vorlage: 'ollama' } };

  it('übersetzt Body und Antwort; lokal ohne Schlüssel bereit', async () => {
    const t = openAiTransport(OLLAMA, {
      model: 'qwen3:32b',
      choices: [{ index: 0, message: { role: 'assistant', content: '<think>…</think>{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    expect(await t.bereit()).toBe(true);
    expect(mocks.invoke.mock.calls.some((c) => c[0] === 'schluessel_vorhanden')).toBe(false);

    const antwort = await t.senden(ANFRAGE);
    expect(antwort).toMatchObject({ type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }] });
    expect(antwort.usage).toEqual({ input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    const args = letzteArgs('ki_anfrage');
    expect(args.anbieter).toBe('openai');
    expect(args.endpoint).toBe('http://localhost:11434/v1');
    expect(args.body).toEqual({
      model: 'qwen3:32b',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Buch\n\nAufgabe' },
      ],
      max_tokens: 16000,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { name: 'antwort', strict: true, schema: { type: 'object' } } },
    });
  });

  it('Cloud-Dienste brauchen einen Schlüssel; Tokens zählen gibt es nicht (core/ki schätzt)', async () => {
    const t = openAiTransport({ anbieter: 'openai', endpoint: 'https://openrouter.ai/api/v1', openai: { vorlage: 'openrouter' } }, {});
    expect(await t.bereit()).toBe(false);
    expect(letzteArgs('schluessel_vorhanden')).toEqual({ anbieter: 'openai' });
    await expect(t.tokenZaehlen(ANFRAGE)).rejects.toThrow('Tokens');
    expect(mocks.invoke.mock.calls.some((c) => c[0] === 'ki_tokens')).toBe(false);
  });

  it('ohne Modell oder zu groß für den Kontext: kein Aufruf, verständliche Meldung', async () => {
    const t = openAiTransport({ ...OLLAMA, openai: { vorlage: 'ollama', kontextTokens: 4100 } }, {});
    await expect(t.senden({ ...ANFRAGE, model: '' })).rejects.toThrow('Kein Modell');
    const gross = { ...ANFRAGE, messages: [{ role: 'user', content: [{ type: 'text', text: 'x'.repeat(3000) }] }] };
    await expect(t.senden(gross)).rejects.toThrow(/Kontextlänge von 4\.100 Tokens/);
    expect(mocks.invoke.mock.calls.some((c) => c[0] === 'ki_anfrage')).toBe(false);
    // ohne Kontextangabe wird nicht geprüft
    const ohne = openAiTransport(OLLAMA, { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] });
    await expect(ohne.senden(gross)).resolves.toMatchObject({ stop_reason: 'end_turn' });
  });
});

