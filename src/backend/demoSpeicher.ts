/**
 * localStorage-Ablage der Browser-Demo (klein, ohne Demo-Dateien – darf überall importiert werden).
 * Je Sprache ein eigener Stand: Deutsch „Hafenlichter“ (Schlüssel wie bisher), Englisch „Harbour Lights“.
 */
import type { Sprache } from '@core/i18n';
import { sprache } from '../i18n/sprache';

const SPEICHER = 'plotwerk:demo:aenderungen';
/** Nach demoZuruecksetzen(): nichts mehr sichern (Schnappschüsse beim pagehide würden den alten Stand zurückschreiben). */
let gesperrt = false;

function schluessel(s: Sprache): string {
  return s === 'en' ? `${SPEICHER}:en` : SPEICHER;
}

/** Pfad → Inhalt (null = entfernt) gegenüber dem Grundstand */
export function ladeDemoAenderungen(s: Sprache = sprache()): Record<string, string | null> {
  try {
    const roh = localStorage.getItem(schluessel(s));
    const wert: unknown = roh ? JSON.parse(roh) : {};
    return typeof wert === 'object' && wert !== null ? (wert as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

export function sichereDemoAenderungen(aenderungen: Record<string, string | null>, s: Sprache = sprache()): void {
  if (gesperrt) return;
  try {
    localStorage.setItem(schluessel(s), JSON.stringify(aenderungen));
  } catch (e) {
    console.warn('Demo-Änderungen konnten nicht im Browser gespeichert werden:', e);
  }
}

/** Hat das Demo-Projekt der aktuellen Oberflächensprache gespeicherte Änderungen? */
export function demoGeaendert(): boolean {
  return Object.keys(ladeDemoAenderungen()).length > 0;
}

/** Verwirft die Änderungen am Demo-Projekt der aktuellen Oberflächensprache und lädt die Seite neu. */
export function demoZuruecksetzen(): void {
  gesperrt = true;
  try {
    localStorage.removeItem(schluessel(sprache()));
  } catch {
    // Speicher nicht verfügbar – nach dem Neuladen gilt ohnehin der Grundstand
  }
  window.location.reload();
}
