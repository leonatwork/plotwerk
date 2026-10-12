/**
 * Buchsprache (projekt.md → angaben.sprache) für Editor-Typografie, Silbentrennung (lang-Attribut),
 * Stil-Werkzeuge und KI. Getrennt von src/i18n/index.ts, weil es den Store braucht.
 */
import { buchSprache, type Sprache } from '@core/i18n';
import { useStore } from '../state/store';

export function useBuchSprache(): Sprache {
  return useStore((s) => buchSprache(s.daten?.projekt.angaben));
}

/** Buchsprache außerhalb von React. */
export function aktuelleBuchSprache(): Sprache {
  return buchSprache(useStore.getState().daten?.projekt.angaben);
}
