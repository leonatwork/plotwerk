/** Demo-Antworten für Stränge vorschlagen (G2). Besitzer: G2. Schlüssel = art im Aufgabenkopf. */
import { STRAENGE_ART } from '@core/ki/index';
import { demoStraenge } from '../demo/straenge';
import type { DemoAntwort } from './typen';

export const DEMO_ANTWORTEN_STRUKTUR: Record<string, DemoAntwort> = {
  [STRAENGE_ART]: demoStraenge,
};
