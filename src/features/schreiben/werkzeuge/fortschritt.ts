/** Kleiner Zustand des Vorlesens für die Statusleiste (Satz i von n, Meldung). Nur Anzeige, nichts Gespeichertes. */
import { useSyncExternalStore } from 'react';

export interface VorleseFortschritt {
  /** gerade gelesener Satz (0-basiert) */
  satz: number;
  /** Sätze insgesamt */
  von: number;
  /** nur die Auswahl wird gelesen */
  auswahl: boolean;
  /** kurze Meldung („Vorlesen beendet – Text geändert“) */
  meldung: string | null;
}

let stand: VorleseFortschritt = { satz: 0, von: 0, auswahl: false, meldung: null };
const hoerer = new Set<() => void>();
let meldungsTimer: ReturnType<typeof setTimeout> | null = null;

export function setzeFortschritt(teil: Partial<VorleseFortschritt>): void {
  stand = { ...stand, ...teil };
  for (const h of hoerer) h();
}

/** Meldung für einige Sekunden zeigen. */
export function vorleseMeldung(text: string): void {
  if (meldungsTimer) clearTimeout(meldungsTimer);
  setzeFortschritt({ meldung: text });
  meldungsTimer = setTimeout(() => {
    meldungsTimer = null;
    if (stand.meldung === text) setzeFortschritt({ meldung: null });
  }, 4000);
}

export function useVorleseFortschritt(): VorleseFortschritt {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => hoerer.delete(h);
    },
    () => stand,
  );
}
