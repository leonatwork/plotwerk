/**
 * KI-Anbieter: Claude in Microsoft Foundry, die Claude API von Anthropic direkt oder ein Dienst mit
 * OpenAI-kompatibler Chat-Completions-API. Foundry und Claude API sprechen dieselbe Messages-API; es
 * unterscheiden sich Basis-URL, Schlüsselbund-Eintrag und die Modellnamen (Foundry: Deployment-Namen,
 * Claude API: Modell-IDs). Für OpenAI-kompatible Dienste übersetzt der Transport (core/ki/openai.ts).
 *
 * Ältere projekt.md-Dateien kennen nur `ki: {endpoint, deployments}` und gelten als Foundry.
 */
import type { KiAnbieter, KiClaudeEinstellungen, KiEinstellungen, KiModelle, KiOpenAiEinstellungen, KiVorlage } from '../model/types';
import type { KiRolle } from './anfrage';

export const KI_ANBIETER: readonly KiAnbieter[] = ['foundry', 'claude', 'openai'];

export const ANBIETER_NAME: Record<KiAnbieter, string> = {
  foundry: 'Microsoft Foundry',
  claude: 'Claude API',
  openai: 'OpenAI-kompatibel',
};

/** Standardmodelle (E14) – für Foundry als Deployment-Namen, für die Claude API als Modell-IDs. */
export const STANDARD_MODELLE: Readonly<KiModelle> = {
  erkennung: 'claude-haiku-5-5',
  pruefung: 'claude-sonnet-5-5',
  tiefencheck: 'claude-opus-5-5',
};

/** Basis-URL der Claude API (ohne /v1/messages). */
export const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com';

export const STANDARD_CLAUDE: Readonly<KiClaudeEinstellungen> = {
  endpoint: CLAUDE_API_ENDPOINT,
  modelle: STANDARD_MODELLE,
};

/** Wie ein OpenAI-kompatibler Dienst angesprochen wird (E15). */
export interface VorlageInfo {
  name: string;
  /** Standard-Basis-URL ohne /chat/completions ('' = selbst eintragen) */
  endpoint: string;
  /** Ohne Schlüssel nutzbar (lokale Server); sonst ist ein Schlüssel Pflicht */
  ohneSchluessel: boolean;
  /** Läuft auf diesem Mac: Kontextlänge des Servers beachten, keine Kosten */
  lokal: boolean;
  /**
   * json_schema: `response_format` mit Schema (lokale Server erzwingen es per Grammatik);
   * json_object: nur „gültiges JSON“, das Schema steht dann zusätzlich im System-Prompt.
   */
  strukturiert: 'json_schema' | 'json_object';
  /** Wie `output_config.effort` übergeben wird (null = gar nicht) */
  effort: 'reasoning_effort' | 'reasoning' | null;
  /** OpenAI: max_completion_tokens (max_tokens nehmen Reasoning-Modelle nicht an); sonst max_tokens */
  maxTokensFeld: 'max_completion_tokens' | 'max_tokens';
  /** Zusätzliche Felder im Body */
  zusatz?: Readonly<Record<string, unknown>>;
  /** Beispiel-Modellnamen (nur Platzhalter, keine Standardwerte) */
  beispiele: Readonly<KiModelle>;
}

export const VORLAGEN: Readonly<Record<KiVorlage, VorlageInfo>> = {
  ollama: {
    name: 'Ollama',
    endpoint: 'http://localhost:11434/v1',
    ohneSchluessel: true,
    lokal: true,
    strukturiert: 'json_schema',
    effort: null,
    maxTokensFeld: 'max_tokens',
    beispiele: { erkennung: 'qwen3:8b', pruefung: 'qwen3:32b', tiefencheck: 'qwen3:32b' },
  },
  lmstudio: {
    name: 'LM Studio',
    endpoint: 'http://localhost:1234/v1',
    ohneSchluessel: true,
    lokal: true,
    strukturiert: 'json_schema',
    effort: null,
    maxTokensFeld: 'max_tokens',
    beispiele: { erkennung: 'qwen/qwen3-8b', pruefung: 'qwen/qwen3-32b', tiefencheck: 'qwen/qwen3-32b' },
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    ohneSchluessel: false,
    lokal: false,
    strukturiert: 'json_schema',
    effort: 'reasoning_effort',
    maxTokensFeld: 'max_completion_tokens',
    beispiele: { erkennung: 'gpt-5-mini', pruefung: 'gpt-5', tiefencheck: 'gpt-5' },
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    ohneSchluessel: false,
    lokal: false,
    strukturiert: 'json_schema',
    effort: 'reasoning',
    maxTokensFeld: 'max_tokens',
    // Nur Anbieter, die alle Parameter (Schema) unterstützen und keine Daten speichern bzw. zum Training nutzen.
    zusatz: { provider: { require_parameters: true, data_collection: 'deny' } },
    beispiele: { erkennung: 'qwen/qwen3-32b', pruefung: 'openai/gpt-5', tiefencheck: 'openai/gpt-5' },
  },
  qwen: {
    name: 'Qwen (Alibaba Cloud)',
    endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    ohneSchluessel: false,
    lokal: false,
    strukturiert: 'json_object',
    effort: null,
    maxTokensFeld: 'max_tokens',
    beispiele: { erkennung: 'qwen-flash', pruefung: 'qwen-plus', tiefencheck: 'qwen-max' },
  },
  eigen: {
    name: 'Eigene URL',
    endpoint: '',
    ohneSchluessel: true,
    lokal: false,
    strukturiert: 'json_schema',
    effort: null,
    maxTokensFeld: 'max_tokens',
    beispiele: { erkennung: 'modell-klein', pruefung: 'modell-gross', tiefencheck: 'modell-gross' },
  },
};

/** Reihenfolge in den Einstellungen: lokal zuerst. */
export const KI_VORLAGEN: readonly KiVorlage[] = ['ollama', 'lmstudio', 'openai', 'openrouter', 'qwen', 'eigen'];

export const STANDARD_VORLAGE: KiVorlage = 'ollama';

const ROLLEN: readonly KiRolle[] = ['erkennung', 'pruefung', 'tiefencheck'];

/** Unbekannte oder fehlende Vorlage = Ollama. */
export function kiVorlage(v: unknown): KiVorlage {
  return typeof v === 'string' && (KI_VORLAGEN as readonly string[]).includes(v) ? (v as KiVorlage) : STANDARD_VORLAGE;
}

/** Gewählter Anbieter; fehlt er (ältere projekt.md), ist es Foundry. */
export function kiAnbieter(ki: KiEinstellungen | undefined | null): KiAnbieter {
  return ki?.anbieter === 'claude' || ki?.anbieter === 'openai' ? ki.anbieter : 'foundry';
}

function modelleMitStandard(m: Partial<KiModelle> | undefined): KiModelle {
  const ergebnis = { ...STANDARD_MODELLE };
  for (const r of ROLLEN) ergebnis[r] = m?.[r]?.trim() || STANDARD_MODELLE[r];
  return ergebnis;
}

/** OpenAI-kompatibel: Modelle ohne Claude-Standard (leer bleibt leer), Basis-URL der Vorlage, wenn keine eingetragen ist. */
function openAiMitStandards(o: Partial<KiOpenAiEinstellungen> | undefined): KiOpenAiEinstellungen {
  const vorlage = kiVorlage(o?.vorlage);
  const m = o?.modelle;
  const kontext = o?.kontextTokens;
  return {
    vorlage,
    endpoint: o?.endpoint?.trim() || VORLAGEN[vorlage].endpoint,
    modelle: { erkennung: m?.erkennung?.trim() ?? '', pruefung: m?.pruefung?.trim() ?? '', tiefencheck: m?.tiefencheck?.trim() ?? '' },
    ...(typeof kontext === 'number' && Number.isFinite(kontext) && kontext > 0 ? { kontextTokens: Math.round(kontext) } : {}),
  };
}

/** Alle Felder aller Anbieter mit Standardwerten (leerer Foundry-Endpoint bleibt leer). */
export function kiMitStandards(ki: KiEinstellungen | undefined | null): Required<KiEinstellungen> {
  return {
    endpoint: ki?.endpoint ?? '',
    deployments: modelleMitStandard(ki?.deployments),
    anbieter: kiAnbieter(ki),
    claude: {
      endpoint: ki?.claude?.endpoint?.trim() || CLAUDE_API_ENDPOINT,
      modelle: modelleMitStandard(ki?.claude?.modelle),
    },
    openai: openAiMitStandards(ki?.openai),
  };
}

/** OpenAI-kompatibel: fehlt das Modell einer Rolle, gilt das der Prüfung (sonst irgendeines, sonst ''). */
function openAiModell(m: KiModelle, rolle: KiRolle): string {
  return m[rolle] || m.pruefung || m.tiefencheck || m.erkennung;
}

/**
 * Modell für eine Aufgabe beim gewählten Anbieter (Foundry: Deployment-Name, Claude API: Modell-ID,
 * OpenAI-kompatibel: Modellname des Dienstes, '' = keiner eingetragen).
 */
export function kiModell(ki: KiEinstellungen | undefined | null, rolle: KiRolle): string {
  const voll = kiMitStandards(ki);
  if (voll.anbieter === 'openai') return openAiModell(voll.openai.modelle, rolle);
  return voll.anbieter === 'claude' ? voll.claude.modelle[rolle] : voll.deployments[rolle];
}

/** Basis-URL des gewählten Anbieters ('' = Foundry bzw. eigene URL ohne Endpoint). */
export function kiEndpoint(ki: KiEinstellungen | undefined | null): string {
  const voll = kiMitStandards(ki);
  if (voll.anbieter === 'openai') return voll.openai.endpoint;
  return voll.anbieter === 'claude' ? voll.claude.endpoint : voll.endpoint.trim();
}

/** Name für Texte wie „An {name} gehen nur …“: bei OpenAI-kompatiblen Diensten der Name der Vorlage. */
export function anbieterName(ki: KiEinstellungen | undefined | null): string {
  const voll = kiMitStandards(ki);
  return voll.anbieter === 'openai' ? VORLAGEN[voll.openai.vorlage].name : ANBIETER_NAME[voll.anbieter];
}

/**
 * Kosten nach Listenpreis bekannt? Nur für Claude (Foundry, Claude API). Bei OpenAI-kompatiblen Diensten
 * hängen die Preise von Dienst und Modell ab (lokal kostet es nichts); die App nennt dann keinen Betrag.
 */
export function kostenBekannt(ki: KiEinstellungen | undefined | null): boolean {
  return kiAnbieter(ki) !== 'openai';
}

/** Kosten für Schätzung oder Ergebnis; ohne bekannten Listenpreis 0 mit `kostenBekannt: false`. */
export function mitKosten(ki: KiEinstellungen | undefined | null, usd: number): { kostenUsd: number; kostenBekannt?: false } {
  return kostenBekannt(ki) ? { kostenUsd: usd } : { kostenUsd: 0, kostenBekannt: false };
}

/** Für Ablagen (`lauf.kostenUsd`): nur bekannte Kosten speichern. */
export function bekannteKosten(r: { kostenUsd: number; kostenBekannt?: false }): { kostenUsd?: number } {
  return r.kostenBekannt === false ? {} : { kostenUsd: r.kostenUsd };
}
