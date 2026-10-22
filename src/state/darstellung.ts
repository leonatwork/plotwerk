import { create } from 'zustand';
import { darstellungAusJson, SKALIERUNGEN, STANDARD_DARSTELLUNG, type Darstellung } from '@core/darstellung';
import { istTauri } from '../backend';

/** App-Einstellung, unabhängig vom Projekt-Store und dessen Lebenszyklus. */
export const useDarstellungsStore = create<{ werte: Darstellung }>(() => ({ werte: { ...STANDARD_DARSTELLUNG } }));
const SCHLUESSEL = 'darstellung';
const SPEICHER = 'plotwerk:darstellung';

function uebernehmen(werte: Darstellung): void {
  useDarstellungsStore.setState({ werte });
  // body umfasst auch Portale (Dialoge, Bestätigungen und Buch-Vorschau).
  document.body.style.setProperty('--ui-skalierung', String(werte.skalierung));
}

export async function initialisiereDarstellung(): Promise<void> {
  let wert: unknown;
  try {
    if (istTauri()) {
      const { aufruf } = await import('../backend/tauri/aufruf');
      wert = await aufruf<unknown>('einstellung_lesen', { schluessel: SCHLUESSEL });
    } else {
      const roh = localStorage.getItem(SPEICHER);
      wert = roh ? JSON.parse(roh) as unknown : null;
    }
  } catch {
    // Auch beschädigtes JSON oder ein nicht verfügbarer Speicher verhindern den Start nicht.
    wert = null;
  }
  uebernehmen(darstellungAusJson(wert));
}

// Schnelle Änderungen dürfen sich auf der Platte nicht gegenseitig überholen.
let speicherReihe: Promise<void> = Promise.resolve();
export function setzeDarstellung(aenderung: Partial<Darstellung>): Promise<void> {
  const werte = darstellungAusJson({ ...useDarstellungsStore.getState().werte, ...aenderung });
  uebernehmen(werte);
  const tauri = istTauri();
  speicherReihe = speicherReihe.then(async () => {
    if (tauri) {
      const { aufruf } = await import('../backend/tauri/aufruf');
      await aufruf<void>('einstellung_schreiben', { schluessel: SCHLUESSEL, wert: werte });
    } else {
      localStorage.setItem(SPEICHER, JSON.stringify(werte));
    }
  }).catch((e: unknown) => console.warn('Darstellung nicht gespeichert:', e));
  return speicherReihe;
}

export function skaliereOberflaeche(richtung: 1 | -1): Promise<void> {
  const index = SKALIERUNGEN.findIndex((s) => s === useDarstellungsStore.getState().werte.skalierung);
  const neu = Math.max(0, Math.min(SKALIERUNGEN.length - 1, index + richtung));
  return setzeDarstellung({ skalierung: SKALIERUNGEN[neu]! });
}

/** DOMRect ist skaliert, scrollTop/clientHeight sind lokale CSS-Pixel. */
export function oberflaechenSkalierung(): number {
  return useDarstellungsStore.getState().werte.skalierung;
}
