/**
 * Slice „editorwerkzeuge“ (G4 Editor: Typewriter, Wiederholungen, Vorlesen, Marken). Besitzer: G4. Zustand im Store unter `editorwerkzeuge` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * Hier liegen nur Ansichtszustände. Leons Entscheidungen (Markenliste, ignorierte Wörter) speichert
 * `speichereMarken` in plan/marken.md. Stimme und Tempo des Vorlesens merkt sich der Browser-Speicher
 * dieses Geräts (App-Einstellung, kein Teil des Buchs).
 */
import type { Id } from '@core/model/types';
import type { MarkenKandidat, MarkenTreffer, StilBericht } from '@core/stil/index';
import type { StateCreator } from 'zustand';
import type { Store } from '../store';

export type VorlesenStatus = 'aus' | 'laeuft' | 'pausiert';

/** Ergebnis der lokalen Analyse des offenen Kapitels (vom Editor entprellt berechnet). */
export interface StilLive {
  kapitel: Id;
  /** Klartext, auf den sich alle Offsets beziehen */
  text: string;
  bericht: StilBericht;
  marken: MarkenTreffer[];
  kandidaten: MarkenKandidat[];
}

export interface Editorwerkzeuge {
  /** Typewriter-Modus: aktuelle Zeile mittig, Rest abgedunkelt (⌘⇧T) */
  typewriter: boolean;
  umschalteTypewriter(): void;
  /** Wiederholungen im Text markieren (lokal, ohne KI) */
  wiederholungen: boolean;
  umschalteWiederholungen(): void;
  /** Vorlesen mit der macOS-Stimme; die Umsetzung (EditorWerkzeuge) reagiert auf diesen Zustand */
  vorlesen: VorlesenStatus;
  setzeVorlesen(v: VorlesenStatus): void;
  /** voiceURI der gewählten Stimme (null = beste deutsche Stimme) */
  stimme: string | null;
  setzeStimme(uri: string | null): void;
  /** Sprechtempo 0,6–1,6 (1 = normal) */
  tempo: number;
  setzeTempo(t: number): void;
  /** größter Abstand in Wörtern für „gleiches Wort in kurzer Distanz“ */
  abstand: number;
  setzeAbstand(n: number): void;
  /** Stammform des Wortes, dessen Vorkommen hervorgehoben sind (Klick in der Liste „Häufigste Wörter“) */
  fokusWort: string | null;
  setzeFokusWort(stamm: string | null): void;
  /** Analyse des offenen Kapitels */
  live: StilLive | null;
  setzeLive(l: StilLive | null): void;
}

export interface EditorwerkzeugeSlice {
  editorwerkzeuge: Editorwerkzeuge;
}

const SPEICHER = 'plotwerk.vorlesen';

function gemerkt(): { stimme: string | null; tempo: number } {
  try {
    const roh = globalThis.localStorage?.getItem(SPEICHER);
    const w = roh ? (JSON.parse(roh) as { stimme?: unknown; tempo?: unknown }) : {};
    return {
      stimme: typeof w.stimme === 'string' ? w.stimme : null,
      tempo: typeof w.tempo === 'number' && w.tempo >= 0.6 && w.tempo <= 1.6 ? w.tempo : 1,
    };
  } catch {
    return { stimme: null, tempo: 1 };
  }
}

function merken(w: { stimme: string | null; tempo: number }): void {
  try {
    globalThis.localStorage?.setItem(SPEICHER, JSON.stringify(w));
  } catch {
    /* privater Modus o. Ä. – dann eben nicht gemerkt */
  }
}

export const createEditorwerkzeugeSlice: StateCreator<Store, [], [], EditorwerkzeugeSlice> = (set, get) => {
  const setze = (teil: Partial<Editorwerkzeuge>) => set((s) => ({ editorwerkzeuge: { ...s.editorwerkzeuge, ...teil } }));
  const start = gemerkt();
  return {
    editorwerkzeuge: {
      typewriter: false,
      umschalteTypewriter: () => {
        const an = !get().editorwerkzeuge.typewriter;
        setze({ typewriter: an });
        if (an && get().bereich !== 'schreiben') get().setzeBereich('schreiben');
      },
      wiederholungen: false,
      umschalteWiederholungen: () => {
        const an = !get().editorwerkzeuge.wiederholungen;
        setze({ wiederholungen: an });
        if (an && get().bereich !== 'schreiben') get().setzeBereich('schreiben');
      },
      vorlesen: 'aus',
      setzeVorlesen: (vorlesen) => {
        setze({ vorlesen });
        // Vorlesen gibt es nur im Schreibbereich
        if (vorlesen === 'laeuft' && get().bereich !== 'schreiben') get().setzeBereich('schreiben');
      },
      stimme: start.stimme,
      setzeStimme: (stimme) => {
        setze({ stimme });
        merken({ stimme, tempo: get().editorwerkzeuge.tempo });
      },
      tempo: start.tempo,
      setzeTempo: (t) => {
        const tempo = Math.min(1.6, Math.max(0.6, Math.round(t * 20) / 20));
        setze({ tempo });
        merken({ stimme: get().editorwerkzeuge.stimme, tempo });
      },
      abstand: 30,
      setzeAbstand: (n) => setze({ abstand: Math.max(5, Math.min(200, Math.round(n))) }),
      fokusWort: null,
      setzeFokusWort: (fokusWort) => setze({ fokusWort }),
      live: null,
      setzeLive: (live) => setze({ live }),
    },
  };
};
