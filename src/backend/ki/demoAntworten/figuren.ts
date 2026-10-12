/** Demo-Antworten für Figurenstimme (G3) und Figurenfakten (F-17). Besitzer: G3. Schlüssel = art im Aufgabenkopf. */
import { FAKTEN_ART, STIMME_ART } from '@core/ki/index';
import { demoFakten } from '../demo/fakten';
import { demoStimme } from '../demo/stimme';
import type { DemoAntwort } from './typen';

export const DEMO_ANTWORTEN_FIGUREN: Record<string, DemoAntwort> = {
  [STIMME_ART]: demoStimme,
  [FAKTEN_ART]: demoFakten,
};
