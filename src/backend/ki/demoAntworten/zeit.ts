/** Demo-Antworten für Zeitpunkte und Zustände (G1). Besitzer: G1. Schlüssel = art im Aufgabenkopf. */
import { ZEIT_ART, ZUSTAND_ART } from '@core/ki/index';
import { demoZeit, demoZustand } from '../demo/zeit';
import type { DemoAntwort } from './typen';

export const DEMO_ANTWORTEN_ZEIT: Record<string, DemoAntwort> = {
  [ZEIT_ART]: demoZeit,
  [ZUSTAND_ART]: demoZustand,
};
