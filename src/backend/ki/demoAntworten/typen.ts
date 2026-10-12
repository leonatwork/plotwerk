/** Demo-Antworten je Aufgabenart (Browser-Demo ohne Netz). Gemeinsam für alle Gruppen. Besitzer: Fundament. */
import type { GelesenerKontext } from '@core/ki/index';

export interface DemoAnfrage {
  /** art aus <aufgabe art="…"> */
  art: string;
  /** weitere Attribute des Aufgabenkopfs */
  attribute: Record<string, string>;
  /** kompletter Aufgabentext (zweiter Textblock) */
  aufgabe: string;
  /** vollständiger Messages-API-Body */
  body: Record<string, unknown>;
}

/**
 * Liefert das Antwort-JSON im Schema der Aufgabe (der Transport verpackt es als Messages-API-Antwort).
 * Alle Zitate müssen wörtliche Ausschnitte aus `ctx.kapitel[].text` sein.
 */
export type DemoAntwort = (ctx: GelesenerKontext, anfrage: DemoAnfrage) => unknown;
