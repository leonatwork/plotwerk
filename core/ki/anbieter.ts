/**
 * KI-Anbieter: Claude in Microsoft Foundry oder die Claude API von Anthropic direkt.
 * Beide sprechen dieselbe Messages-API; es unterscheiden sich Basis-URL, Schlüsselbund-Eintrag
 * und die Modellnamen (Foundry: Deployment-Namen, Claude API: Modell-IDs).
 *
 * Ältere projekt.md-Dateien kennen nur `ki: {endpoint, deployments}` und gelten als Foundry.
 */
import type { KiAnbieter, KiClaudeEinstellungen, KiEinstellungen, KiModelle } from '../model/types';
import type { KiRolle } from './anfrage';

export const KI_ANBIETER: readonly KiAnbieter[] = ['foundry', 'claude'];

export const ANBIETER_NAME: Record<KiAnbieter, string> = {
  foundry: 'Microsoft Foundry',
  claude: 'Claude API',
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

const ROLLEN: readonly KiRolle[] = ['erkennung', 'pruefung', 'tiefencheck'];

/** Gewählter Anbieter; fehlt er (ältere projekt.md), ist es Foundry. */
export function kiAnbieter(ki: KiEinstellungen | undefined | null): KiAnbieter {
  return ki?.anbieter === 'claude' ? 'claude' : 'foundry';
}

function modelleMitStandard(m: Partial<KiModelle> | undefined): KiModelle {
  const ergebnis = { ...STANDARD_MODELLE };
  for (const r of ROLLEN) ergebnis[r] = m?.[r]?.trim() || STANDARD_MODELLE[r];
  return ergebnis;
}

/** Alle Felder beider Anbieter mit Standardwerten (leerer Foundry-Endpoint bleibt leer). */
export function kiMitStandards(ki: KiEinstellungen | undefined | null): Required<KiEinstellungen> {
  return {
    endpoint: ki?.endpoint ?? '',
    deployments: modelleMitStandard(ki?.deployments),
    anbieter: kiAnbieter(ki),
    claude: {
      endpoint: ki?.claude?.endpoint?.trim() || CLAUDE_API_ENDPOINT,
      modelle: modelleMitStandard(ki?.claude?.modelle),
    },
  };
}

/** Modell für eine Aufgabe beim gewählten Anbieter (Foundry: Deployment-Name, Claude API: Modell-ID). */
export function kiModell(ki: KiEinstellungen | undefined | null, rolle: KiRolle): string {
  const voll = kiMitStandards(ki);
  return voll.anbieter === 'claude' ? voll.claude.modelle[rolle] : voll.deployments[rolle];
}

/** Basis-URL des gewählten Anbieters ('' = Foundry ohne Endpoint). */
export function kiEndpoint(ki: KiEinstellungen | undefined | null): string {
  const voll = kiMitStandards(ki);
  return voll.anbieter === 'claude' ? voll.claude.endpoint : voll.endpoint.trim();
}
