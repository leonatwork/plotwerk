/**
 * Registry der Demo-Antworten: jede Gruppe registriert ihre Aufgabenarten in ihrer eigenen Datei.
 * Der Demo-Transport (../demo.ts) fragt hier nach, bevor er die eingebauten Arten beantwortet.
 */
import { DEMO_ANTWORTEN_FIGUREN } from './figuren';
import { DEMO_ANTWORTEN_LESER } from './leser';
import { DEMO_ANTWORTEN_ZEIT } from './zeit';
import type { DemoAntwort } from './typen';

export type { DemoAnfrage, DemoAntwort } from './typen';

/** Alle Gruppen-Tabellen (live gelesen, Tests dürfen Einträge ergänzen) */
const TABELLEN: Record<string, DemoAntwort>[] = [DEMO_ANTWORTEN_ZEIT, DEMO_ANTWORTEN_FIGUREN, DEMO_ANTWORTEN_LESER];

export function demoAntwortFuer(art: string): DemoAntwort | undefined {
  for (const t of TABELLEN) if (Object.prototype.hasOwnProperty.call(t, art)) return t[art];
  return undefined;
}
