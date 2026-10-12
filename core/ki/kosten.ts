/**
 * Grobe Kosten (Listenpreise USD pro Mio. Tokens, Foundry rechnet zu Anthropic-Listenpreisen ab).
 * Cache-Lesen ≈ 10 %, Cache-Schreiben (5 min) ≈ 125 % des Eingabepreises.
 */
import type { KiRolle } from './anfrage';

export interface Preis {
  /** USD pro 1 Mio. Eingabe-Tokens */
  eingabe: number;
  /** USD pro 1 Mio. Ausgabe-Tokens */
  ausgabe: number;
}

export const PREISE = {
  haiku: { eingabe: 0.1, ausgabe: 0.5 },
  /** Haiku 5.5 bei mehr als 100.000 Eingabe-Tokens pro Anfrage */
  haikuLang: { eingabe: 0.5, ausgabe: 2.5 },
  sonnet: { eingabe: 2, ausgabe: 10 },
  opus: { eingabe: 4, ausgabe: 20 },
} as const satisfies Record<string, Preis>;

export const CACHE_LESEN = 0.1;
export const CACHE_SCHREIBEN = 1.25;

const STANDARD_FAMILIE: Record<KiRolle, 'haiku' | 'sonnet' | 'opus'> = {
  erkennung: 'haiku',
  pruefung: 'sonnet',
  tiefencheck: 'opus',
};

/** Preis nach Deployment-Name (enthält „haiku“/„sonnet“/„opus“), sonst nach Rolle. */
export function preisFuer(deployment: string, rolle: KiRolle, eingabeProAnfrage = 0): Preis {
  const name = deployment.toLowerCase();
  const familie = name.includes('haiku') ? 'haiku' : name.includes('sonnet') ? 'sonnet' : name.includes('opus') ? 'opus' : STANDARD_FAMILIE[rolle];
  if (familie === 'haiku' && eingabeProAnfrage > 100_000) return PREISE.haikuLang;
  return PREISE[familie];
}

export interface TokenMenge {
  /** ungecachte Eingabe */
  eingabe: number;
  ausgabe: number;
  cacheGelesen: number;
  cacheGeschrieben?: number;
}

export function kostenUsd(t: TokenMenge, preis: Preis): number {
  const eingabe = t.eingabe + t.cacheGelesen * CACHE_LESEN + (t.cacheGeschrieben ?? 0) * CACHE_SCHREIBEN;
  return (eingabe * preis.eingabe + t.ausgabe * preis.ausgabe) / 1_000_000;
}

/** Geschätzte Ausgabe-Tokens pro Anfrage (inkl. adaptivem Denken), bewusst großzügig. */
export const AUSGABE_SCHAETZUNG: Record<KiRolle, number> = {
  erkennung: 800,
  pruefung: 3000,
  tiefencheck: 6000,
};

/** „≈ 0,12 $“ */
/** „≈ 0,12 $“ (de) bzw. „≈ $0.12“ (en) – Sprache der Oberfläche. */
export function formatiereUsd(usd: number, sprache: 'de' | 'en' = 'de'): string {
  const stellen = usd < 0.01 ? 3 : 2;
  const zahl = usd.toLocaleString(sprache === 'en' ? 'en-US' : 'de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
  return sprache === 'en' ? `≈ $${zahl}` : `≈ ${zahl} $`;
}
