/** Demo-Antworten für Figurenstimme (G3). Besitzer: G3. Schlüssel = art im Aufgabenkopf. */
import { STIMME_ART } from '@core/ki/index';
import { demoStimme } from '../demo/stimme';
import type { DemoAntwort } from './typen';

export const DEMO_ANTWORTEN_FIGUREN: Record<string, DemoAntwort> = {
  [STIMME_ART]: demoStimme,
};
