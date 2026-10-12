/** Verbindung Inspektor → offener Editor (z. B. Hinweis anklicken → Stelle markieren). */
import type { Id } from '@core/model/types';

export interface EditorBruecke {
  /** Markiert das erste Vorkommen des Zitats im offenen Kapitel; false = nicht gefunden. */
  markiereZitat(kapitel: Id, zitat: string): boolean;
}

let aktuell: EditorBruecke | null = null;

export function setzeBruecke(b: EditorBruecke | null): void {
  aktuell = b;
}

export function markiereZitat(kapitel: Id, zitat: string): boolean {
  return aktuell?.markiereZitat(kapitel, zitat) ?? false;
}

let titelFokus: Id | null = null;

/** Nach „+ Kapitel planen“: Titel des neuen Kapitels zum Umbenennen fokussieren. */
export function titelFokussieren(kapitel: Id | null): void {
  titelFokus = kapitel;
}

export function titelFokusAbholen(kapitel: Id): boolean {
  if (titelFokus !== kapitel) return false;
  titelFokus = null;
  return true;
}
