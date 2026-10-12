/**
 * Funktionsumfang (E16) und No-AI-Modus (E17): Profil als App-Einstellung `funktionen` (Tauri: einstellungen.json
 * im App-Ordner über `einstellung_lesen`/`einstellung_schreiben`; Browser-Demo: localStorage), nie im Projektordner.
 * Besitzer: Fundament. Die Logik (Katalog, Presets, Abhängigkeiten) liegt in core/funktionen.
 */
import { create } from 'zustand';
import {
  aktiveFunktionen,
  bestandsProfil,
  einschalten,
  funktion,
  profilAusJson,
  profilMitAuswahl,
  standardProfil,
  type FunktionId,
  type FunktionsProfil,
} from '@core/funktionen';
import { KiFehler, type KiTransport } from '@core/ki/index';
import { istTauri } from '../backend';
import { texte } from '../i18n';

const EINSTELLUNG = 'funktionen';
const SPEICHER = 'plotwerk:funktionen';

interface FunktionsZustand {
  profil: FunktionsProfil;
  /** wirksam sichtbare Funktionen (Auswahl, ohne KI im No-AI-Modus) */
  aktiv: Set<FunktionId>;
  /** Einrichtungs-Assistent sichtbar */
  assistentOffen: boolean;
}

function zustandFuer(profil: FunktionsProfil): Pick<FunktionsZustand, 'profil' | 'aktiv'> {
  return { profil, aktiv: aktiveFunktionen(profil) };
}

/** Bis zum Laden: alles sichtbar (wie vor E16), kein Assistent. */
export const useFunktionsStore = create<FunktionsZustand>(() => ({ ...zustandFuer(bestandsProfil()), assistentOffen: false }));

/** Ist die Funktion sichtbar? (außerhalb von React) */
export function funktionAktiv(id: FunktionId): boolean {
  return useFunktionsStore.getState().aktiv.has(id);
}

/** Ist die Funktion sichtbar? (rendert bei Änderung neu) */
export function useFunktion(id: FunktionId): boolean {
  return useFunktionsStore((s) => s.aktiv.has(id));
}

export function useFunktionsProfil(): FunktionsProfil {
  return useFunktionsStore((s) => s.profil);
}

/** No-AI-Modus eingeschaltet? */
export function kiAus(): boolean {
  return useFunktionsStore.getState().profil.kiAus;
}

async function lesen(): Promise<{ wert: unknown; bestand: boolean }> {
  if (istTauri()) {
    const { aufruf } = await import('../backend/tauri/aufruf');
    const wert = await aufruf<unknown>('einstellung_lesen', { schluessel: EINSTELLUNG });
    // Wer schon ein Projekt geöffnet hatte, nutzt Plotwerk von vor E16: alles bleibt sichtbar, kein Assistent.
    const bestand = wert == null && (await aufruf<unknown>('einstellung_lesen', { schluessel: 'letztesProjekt' })) != null;
    return { wert, bestand };
  }
  const roh = localStorage.getItem(SPEICHER);
  return { wert: roh ? (JSON.parse(roh) as unknown) : null, bestand: false };
}

async function schreiben(profil: FunktionsProfil): Promise<void> {
  if (istTauri()) {
    const { aufruf } = await import('../backend/tauri/aufruf');
    await aufruf<void>('einstellung_schreiben', { schluessel: EINSTELLUNG, wert: profil });
  } else {
    localStorage.setItem(SPEICHER, JSON.stringify(profil));
  }
}

/** Gespeichertes Profil laden (vor dem ersten Rendern). Erster Start → Assistent; Fehler → alles sichtbar. */
export async function initialisiereFunktionen(): Promise<void> {
  try {
    const { wert, bestand } = await lesen();
    const gespeichert = profilAusJson(wert);
    if (gespeichert) {
      useFunktionsStore.setState({ ...zustandFuer(gespeichert), assistentOffen: !gespeichert.eingerichtet });
    } else if (bestand) {
      const profil = bestandsProfil();
      useFunktionsStore.setState({ ...zustandFuer(profil), assistentOffen: false });
      await schreiben(profil);
    } else {
      useFunktionsStore.setState({ ...zustandFuer(standardProfil()), assistentOffen: true });
    }
  } catch (e) {
    console.warn('Funktionsumfang nicht geladen:', e);
  }
}

/** Profil übernehmen: gilt sofort und wird als App-Einstellung gespeichert. */
export async function setzeFunktionsProfil(profil: FunktionsProfil): Promise<void> {
  useFunktionsStore.setState(zustandFuer(profil));
  try {
    await schreiben(profil);
  } catch (e) {
    console.warn('Funktionsumfang nicht gespeichert:', e);
  }
}

/** Funktion einblenden (mit allem, was sie braucht); bei KI-Funktionen endet der No-AI-Modus. */
export async function funktionEinblenden(id: FunktionId): Promise<void> {
  const { profil } = useFunktionsStore.getState();
  const neu = profilMitAuswahl(profil, einschalten(profil.funktionen, id));
  await setzeFunktionsProfil(funktion(id).ki ? { ...neu, kiAus: false } : neu);
}

export function oeffneAssistent(): void {
  useFunktionsStore.setState({ assistentOffen: true });
}

/** Assistent schließen und das gewählte Profil als eingerichtet speichern. */
export async function schliesseAssistent(profil: FunktionsProfil): Promise<void> {
  useFunktionsStore.setState({ assistentOffen: false });
  await setzeFunktionsProfil({ ...profil, eingerichtet: true });
}

/** Für Tests: Profil fest einstellen, ohne etwas zu speichern. */
export function festesFunktionsProfil(profil: FunktionsProfil = bestandsProfil(), assistentOffen = false): void {
  useFunktionsStore.setState({ ...zustandFuer(profil), assistentOffen });
}

/**
 * KI-Transport mit Sperre für den No-AI-Modus (E17): Solange er an ist, geht nichts an ein Modell – auch keine
 * Token-Zählung (core/ki schätzt dann über die Zeichenzahl).
 */
export function mitKiSperre(basis: KiTransport): KiTransport {
  const gesperrt = () => new KiFehler('nicht_bereit', texte().funktionen.kiAus.gesperrt);
  return {
    bereit: () => basis.bereit(),
    async senden(body, optionen) {
      if (kiAus()) throw gesperrt();
      return basis.senden(body, optionen);
    },
    async tokenZaehlen(body) {
      if (kiAus()) throw gesperrt();
      return basis.tokenZaehlen(body);
    },
  };
}
