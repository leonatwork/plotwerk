import { localeVon, type Sprache } from '@core/i18n';
import { f } from './format';
import { useSprachStore, woerterbuch } from './sprache';
import type { SprachWahl, Woerterbuch } from './typen';

/** Wörterbuch der aktuellen Oberflächensprache; die Komponente rendert beim Umschalten neu. */
export function useTexte(): Woerterbuch {
  return woerterbuch(useSprachStore((s) => s.sprache));
}

/** Aktuelle Oberflächensprache. */
export function useSprache(): Sprache {
  return useSprachStore((s) => s.sprache);
}

/** Gewählte Sprache (System/Deutsch/English) und Systemsprache – für die Einstellungen. */
export function useSprachWahl(): { wahl: SprachWahl; system: Sprache } {
  const wahl = useSprachStore((s) => s.wahl);
  const system = useSprachStore((s) => s.system);
  return { wahl, system };
}

/** Alles auf einmal: `const { t, f, sprache, locale } = useI18n()`. */
export function useI18n(): { t: Woerterbuch; f: typeof f; sprache: Sprache; locale: string } {
  const sprache = useSprache();
  return { t: woerterbuch(sprache), f, sprache, locale: localeVon(sprache) };
}
