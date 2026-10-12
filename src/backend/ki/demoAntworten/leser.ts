/** Demo-Antworten für Leser-Simulation und Fragen an das Buch (G6). Besitzer: G6. Schlüssel = art im Aufgabenkopf. */
import { demoFrage } from '../demo/fragen';
import { demoLeser } from '../demo/leser';
import type { DemoAntwort } from './typen';

export const DEMO_ANTWORTEN_LESER: Record<string, DemoAntwort> = {
  leser: demoLeser,
  frage: demoFrage,
};
