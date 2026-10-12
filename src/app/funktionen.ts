/**
 * Zuordnung Bereiche/Befehle → Funktionen (E16). Ausgeblendete Bereiche fehlen in Seitenleiste und Schnellsuche;
 * ruft man sie über Menü, Tastenkürzel oder einen Verweis trotzdem auf, fragt die App, ob sie sie einblenden soll.
 */
import { funktion, type FunktionId } from '@core/funktionen';
import { f, texte } from '../i18n';
import { funktionAktiv, funktionEinblenden, kiAus } from '../state/funktionen';
import type { Bereich } from '../state/store';
import { bestaetigen } from '../ui';
import type { Befehl } from './befehle';

export const BEREICH_FUNKTION: Record<Bereich, FunktionId> = {
  schreiben: 'editor',
  kapitel: 'kapitelUeberblick',
  akte: 'akte',
  figuren: 'figuren',
  beziehungen: 'beziehungen',
  orte: 'orte',
  hinweise: 'hinweise',
  zeitleiste: 'zeitleiste',
  faeden: 'faeden',
  recherche: 'recherche',
  statistik: 'statistik',
  fragen: 'kiLeser',
};

const BEFEHL_FUNKTION: Partial<Record<Befehl, FunktionId>> = {
  pruefen: 'kiPruefung',
  'buch-pruefen': 'kiPruefung',
  'zeit-vorschlaege': 'kiZeit',
  'stimme-pruefen': 'kiStimme',
  'straenge-vorschlagen': 'kiErkennung',
  marken: 'editorWerkzeuge',
  typewriter: 'editorWerkzeuge',
  wiederholungen: 'editorWerkzeuge',
  vorlesen: 'editorWerkzeuge',
  fassung: 'fassungen',
  versionsvergleich: 'fassungen',
  'leser-simulation': 'kiLeser',
  abgabe: 'abgabe',
  rueckimport: 'abgabe',
  'recherche-neu': 'recherche',
  'faden-neu': 'faeden',
};

/** Funktion hinter einem Befehl oder Bereich; undefined = immer verfügbar (Export, Einstellungen …). */
export function funktionFuerBefehl(befehl: Befehl): FunktionId | undefined {
  return BEFEHL_FUNKTION[befehl] ?? (BEREICH_FUNKTION as Partial<Record<string, FunktionId>>)[befehl];
}

export function bereichAktiv(b: Bereich): boolean {
  return funktionAktiv(BEREICH_FUNKTION[b]);
}

/** Ist die Funktion ausgeblendet, fragt die App, ob sie sie einblenden soll. true = danach sichtbar. */
export async function funktionSicherstellen(id: FunktionId): Promise<boolean> {
  if (funktionAktiv(id)) return true;
  const t = texte().funktionen;
  const ki = !!funktion(id).ki && kiAus();
  const ok = await bestaetigen(ki ? t.ausgeblendet.textKi : t.ausgeblendet.text, {
    titel: f(t.ausgeblendet.titel, { name: t.liste[id].name }),
    knopf: t.ausgeblendet.einblenden,
  });
  if (ok) await funktionEinblenden(id);
  return ok;
}
