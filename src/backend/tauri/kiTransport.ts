/**
 * KiTransport über die Rust-Kommandos ki_anfrage/ki_tokens. Der API-Schlüssel bleibt im
 * Rust-Kern (Schlüsselbund, je Anbieter ein Eintrag); hier werden nur Anbieter und Endpoint
 * aus projekt.md mitgegeben.
 *
 * Serverseitiger Fallback (nur Claude API): Lehnen die Sicherheitsfilter von Sonnet oder Opus 5.5
 * eine Anfrage ab, beantwortet sie die API im selben Aufruf mit dem von Anthropic empfohlenen
 * Ersatzmodell (`fallbacks: "default"`, Beta-Header setzt der Rust-Kern). Nicht bei Haiku 5.5
 * (kein serverseitiger Fallback) und nicht bei Foundry (dort nicht verfügbar).
 *
 * OpenAI-kompatible Dienste (E15): Body und Antwort werden hier übersetzt (core/ki/openai.ts), core/ki
 * sieht weiter die Messages-API. Vor dem Senden: Modellname vorhanden und Anfrage passt in die
 * eingestellte Kontextlänge (sonst Ablehnung statt still gekürztem Buch). Tokens zählen können diese
 * Dienste nicht; core/ki schätzt dann über die Zeichenzahl.
 */
import { kiVorlage, nachOpenAi, passtInKontext, VORLAGEN, vonOpenAi, type KiTransport } from '@core/ki/index';
import type { KiAnbieter, KiOpenAiEinstellungen } from '@core/model/types';
import { f, texte, zahl } from '../../i18n';
import { aufruf, TauriFehler } from './aufruf';

/** Anbieter und Basis-URL der aktuellen Einstellungen ('' = kein Endpoint). */
export interface KiZiel {
  anbieter: KiAnbieter;
  endpoint: string;
  /** nur beim OpenAI-kompatiblen Dienst: Vorlage und Kontextlänge */
  openai?: Pick<KiOpenAiEinstellungen, 'vorlage' | 'kontextTokens'>;
}

/** Modelle mit serverseitigem Fallback `"default"` auf der Claude API. */
export const SERVER_FALLBACK_MODELLE: readonly string[] = ['claude-sonnet-5-5', 'claude-opus-5-5'];

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
    if (!endpoint) throw new TauriFehler(texte().backend.keinEndpoint[z.anbieter]);
    return { ...z, endpoint };
  }

  async function sendenOpenAi(body: Record<string, unknown>, z: KiZiel): Promise<Record<string, unknown>> {
    if (typeof body.model !== 'string' || !body.model.trim()) throw new TauriFehler(texte().backend.keinModell);
    const anfrage = nachOpenAi(body, VORLAGEN[kiVorlage(z.openai?.vorlage)]);
    const grenze = z.openai?.kontextTokens;
    const kontext = passtInKontext(anfrage, grenze);
    if (!kontext.passt) {
      throw new TauriFehler(f(texte().backend.kontextZuGross, { tokens: zahl(kontext.tokens), grenze: zahl(grenze ?? 0) }));
    }
    const antwort = await aufruf<Record<string, unknown>>('ki_anfrage', { endpoint: z.endpoint, body: anfrage, anbieter: z.anbieter });
    return vonOpenAi(antwort);
  }

  return {
    async bereit() {
      try {
        const z = await ziel();
        if (!z.endpoint.trim()) return false;
        // Lokale Server und eigene URLs gehen auch ohne Schlüssel.
        if (z.anbieter === 'openai' && VORLAGEN[kiVorlage(z.openai?.vorlage)].ohneSchluessel) return true;
        return await aufruf<boolean>('schluessel_vorhanden', { anbieter: z.anbieter });
      } catch (e) {
        console.warn('KI-Bereitschaft nicht prüfbar:', e);
        return false;
      }
    },
    // Ein AbortSignal wird hier ignoriert: ein laufendes Rust-Kommando lässt sich nicht abbrechen. core/ki verwirft
    // die Antwort nach einem Abbruch selbst; gespeichert wird nichts.
    async senden(body) {
      const z = await pflichtZiel();
      if (z.anbieter === 'openai') return sendenOpenAi(body, z);
      return aufruf<Record<string, unknown>>('ki_anfrage', { endpoint: z.endpoint, body: mitServerFallback(body, z.anbieter), anbieter: z.anbieter });
    },
    async tokenZaehlen(body) {
      const { anbieter, endpoint } = await pflichtZiel();
      if (anbieter === 'openai') throw new TauriFehler(texte().backend.keinZaehlen);
      return aufruf<number>('ki_tokens', { endpoint, body, anbieter });
    },
  };
}
