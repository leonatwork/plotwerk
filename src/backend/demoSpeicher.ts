/** localStorage-Ablage der Browser-Demo (klein, ohne Demo-Dateien – darf überall importiert werden). */
const SPEICHER = 'plotwerk:demo:aenderungen';
/** Nach demoZuruecksetzen(): nichts mehr sichern (Schnappschüsse beim pagehide würden den alten Stand zurückschreiben). */
let gesperrt = false;

/** Pfad → Inhalt (null = entfernt) gegenüber dem Grundstand */
export function ladeDemoAenderungen(): Record<string, string | null> {
  try {
    const roh = localStorage.getItem(SPEICHER);
    const wert: unknown = roh ? JSON.parse(roh) : {};
    return typeof wert === 'object' && wert !== null ? (wert as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

export function sichereDemoAenderungen(aenderungen: Record<string, string | null>): void {
  if (gesperrt) return;
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(aenderungen));
  } catch (e) {
    console.warn('Demo-Änderungen konnten nicht im Browser gespeichert werden:', e);
  }
}

/** Hat die Demo gespeicherte Änderungen? */
export function demoGeaendert(): boolean {
  return Object.keys(ladeDemoAenderungen()).length > 0;
}

/** Verwirft alle Demo-Änderungen und lädt die Seite neu. */
export function demoZuruecksetzen(): void {
  gesperrt = true;
  try {
    localStorage.removeItem(SPEICHER);
  } catch {
    // Speicher nicht verfügbar – nach dem Neuladen gilt ohnehin der Grundstand
  }
  window.location.reload();
}
