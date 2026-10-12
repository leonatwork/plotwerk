/**
 * KiTransport über die Rust-Kommandos ki_anfrage/ki_tokens. Der API-Schlüssel bleibt im
 * Rust-Kern (Schlüsselbund, je Anbieter ein Eintrag); hier werden nur Anbieter und Endpoint
 * aus projekt.md mitgegeben.
 *
 * Serverseitiger Fallback (nur Claude API): Lehnen die Sicherheitsfilter von Sonnet oder Opus 5.5
 * eine Anfrage ab, beantwortet sie die API im selben Aufruf mit dem von Anthropic empfohlenen
 * Ersatzmodell (`fallbacks: "default"`, Beta-Header setzt der Rust-Kern). Nicht bei Haiku 5.5
 * (kein serverseitiger Fallback) und nicht bei Foundry (dort nicht verfügbar).
 */
import type { KiTransport } from '@core/ki/index';
import type { KiAnbieter } from '@core/model/types';
import { aufruf, TauriFehler } from './aufruf';

/** Anbieter und Basis-URL der aktuellen Einstellungen ('' = kein Endpoint). */
export interface KiZiel {
  anbieter: KiAnbieter;
  endpoint: string;
}

/** Modelle mit serverseitigem Fallback `"default"` auf der Claude API. */
export const SERVER_FALLBACK_MODELLE: readonly string[] = ['claude-sonnet-5-5', 'claude-opus-5-5'];

const KEIN_ENDPOINT: Record<KiAnbieter, string> = {
  foundry:
    'Kein KI-Endpoint eingetragen. Bitte in den KI-Einstellungen die Foundry-URL angeben (https://<ressource>.services.ai.azure.com/anthropic).',
  claude: 'Keine Basis-URL für die Claude API eingetragen. Bitte in den KI-Einstellungen prüfen (Standard: https://api.anthropic.com).',
};

/**
 * Ergänzt `fallbacks: "default"` für die Claude API bei claude-sonnet-5-5 und claude-opus-5-5.
 * Alle anderen Bodys bleiben unverändert (auch ein schon gesetztes `fallbacks`).
 */
export function mitServerFallback(body: Record<string, unknown>, anbieter: KiAnbieter): Record<string, unknown> {
  if (anbieter !== 'claude') return body;
  if (typeof body.model !== 'string' || !SERVER_FALLBACK_MODELLE.includes(body.model)) return body;
  if ('fallbacks' in body) return body;
  return { ...body, fallbacks: 'default' };
}

/** `ziel`: liefert Anbieter und Endpoint aus projekt.ki (bei jedem Aufruf neu). */
export function erstelleTauriKiTransport(ziel: () => Promise<KiZiel>): KiTransport {
  async function pflichtZiel(): Promise<KiZiel> {
    const z = await ziel();
    const endpoint = z.endpoint.trim();
    if (!endpoint) throw new TauriFehler(KEIN_ENDPOINT[z.anbieter]);
    return { anbieter: z.anbieter, endpoint };
  }

  return {
    async bereit() {
      try {
        const z = await ziel();
        if (!z.endpoint.trim()) return false;
        return await aufruf<boolean>('schluessel_vorhanden', { anbieter: z.anbieter });
      } catch (e) {
        console.warn('KI-Bereitschaft nicht prüfbar:', e);
        return false;
      }
    },
    // Ein AbortSignal wird hier ignoriert: ein laufendes Rust-Kommando lässt sich nicht abbrechen. core/ki verwirft
    // die Antwort nach einem Abbruch selbst; gespeichert wird nichts.
    async senden(body) {
      const { anbieter, endpoint } = await pflichtZiel();
      return aufruf<Record<string, unknown>>('ki_anfrage', { endpoint, body: mitServerFallback(body, anbieter), anbieter });
    },
    async tokenZaehlen(body) {
      const { anbieter, endpoint } = await pflichtZiel();
      return aufruf<number>('ki_tokens', { endpoint, body, anbieter });
    },
  };
}
