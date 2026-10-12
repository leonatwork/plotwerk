/**
 * Slice „kileser“ (G6 KI-Leser: Leser-Simulation, Fragen an das Buch). Besitzer: G6. Zustand im Store unter `kileser` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 * core/ki bekommt nur eine Nur-Lese-Sicht (ProjektLeser) und den KI-Transport des Backends (harte Regel 1).
 */
import type { StateCreator } from 'zustand';
import {
  alsBuchFrage,
  alsLeserStand,
  frageAufgabe,
  fuehreAufgabeAus,
  KiFehler,
  kostenUsd,
  leserBasisHash,
  leserSimulationAufgabe,
  preisFuer,
  schaetzeAufgabe,
  schreibAuftrag,
  type Schaetzung,
} from '@core/ki/index';
import type { BuchFrage, Id, KiAblage, LeserStand } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import { f, sprache, texte } from '../../i18n';
import type { Store } from '../store';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from './ki';

export interface FragenSchaetzung {
  modell: string;
  /** erste Frage (Buch wird in den Cache geschrieben) */
  ersteUsd: number;
  /** jede weitere Frage innerhalb von 5 Minuten (Buch aus dem Cache) */
  weitereUsd: number;
  eingabeTokens: number;
  gezaehlt: boolean;
}

export interface KiLeser {
  /** laufende Leser-Simulation */
  simLauf: { kapitel: Id; tiefencheck: boolean; seit: number } | null;
  simFehler: { kapitel: Id; fehler: KiFehlerAnzeige } | null;
  /** Gründe für Verworfenes im letzten Lauf je Kapitel (nur diese Sitzung) */
  simVerworfen: Record<Id, string[]>;
  /** laufende Frage */
  frageLauf: { frage: string; seit: number } | null;
  frageFehler: KiFehlerAnzeige | null;
  /** Anmerkung zur Prüfung einer Antwort je Frage-ID (verworfene Belege/Antwort) – nur diese Sitzung */
  frageHinweise: Record<Id, string>;
  /** Text im Eingabefeld (bleibt beim Bereichswechsel erhalten) */
  entwurf: string;
  /** Haiku statt Sonnet für Fragen */
  schnell: boolean;
  fragenSchaetzung: { schnell: boolean; wert: FragenSchaetzung } | null;

  /** Kostenschätzung vor dem Start (eine Anfrage, Kapitel 1..n) */
  schaetzen(kapitel: Id, tiefencheck: boolean): Promise<Schaetzung>;
  /** Simulation starten; speichert den Stand in .plotwerk/leser.json. false bei Fehler oder Abbruch. */
  simulieren(kapitel: Id, tiefencheck: boolean): Promise<boolean>;
  /** Laufende Simulation abbrechen: nichts wird gespeichert, kein Fehler bleibt stehen. */
  simAbbrechen(): void;
  standEntfernen(kapitel: Id): Promise<void>;
  fragenSchaetzen(): Promise<FragenSchaetzung | null>;
  /** Frage stellen; Antwort (mit Belegen) landet in .plotwerk/fragen.json */
  fragen(frage: string): Promise<boolean>;
  frageEntfernen(id: Id): Promise<void>;
  verlaufLeeren(): Promise<void>;
  setzeEntwurf(text: string): void;
  setzeSchnell(schnell: boolean): void;
  fehlerZuruecksetzen(): void;
}

export interface KiLeserSlice {
  kileser: KiLeser;
}

function leereAblage<T>(): KiAblage<T> {
  return { version: 1, eintraege: [] };
}

export const createKiLeserSlice: StateCreator<Store, [], [], KiLeserSlice> = (set, get) => {
  const setze = (teil: Partial<KiLeser>) => set((s) => ({ kileser: { ...s.kileser, ...teil } }));
  const zustand = () => get().kileser;
  /** Steuerung der laufenden Leser-Simulation (für simAbbrechen) */
  let simAbbruch: AbortController | null = null;

  /** Nur-Lese-Sicht auf das Projekt (harte Regel 1). Vorher Editor und Schreibvorgänge abwarten. */
  async function leser(): Promise<ProjektLeser> {
    const fs = get().fs;
    if (!fs || !get().daten) throw new KiFehler('auftrag', texte().state.fehler.keinProjekt);
    await get().editorSichern();
    await get().alleSpeichernAbwarten();
    return { lesen: (p) => fs.lesen(p), auflisten: (o) => fs.auflisten(o), existiert: (p) => fs.existiert(p) };
  }

  function transport() {
    const b = get().backend;
    if (!b) throw new KiFehler('nicht_bereit', texte().state.fehler.nichtBereit);
    return b.ki;
  }

  function hash(kapitel: Id): string {
    const d = get().daten;
    return d ? leserBasisHash(d, kapitel) : '';
  }

  return {
    kileser: {
      simLauf: null,
      simFehler: null,
      simVerworfen: {},
      frageLauf: null,
      frageFehler: null,
      frageHinweise: {},
      entwurf: '',
      schnell: false,
      fragenSchaetzung: null,

      async schaetzen(kapitel, tiefencheck) {
        return schaetzeAufgabe(await leser(), transport(), get().kiEinstellungen(), leserSimulationAufgabe(kapitel, { tiefencheck }), sprache());
      },

      async simulieren(kapitel, tiefencheck) {
        if (zustand().simLauf) return false;
        const steuerung = new AbortController();
        simAbbruch = steuerung;
        setze({ simLauf: { kapitel, tiefencheck, seit: Date.now() }, simFehler: null });
        try {
          const basisHash = hash(kapitel);
          const r = await fuehreAufgabeAus(await leser(), transport(), get().kiEinstellungen(), leserSimulationAufgabe(kapitel, { tiefencheck, basisHash }), {
            signal: steuerung.signal,
            oberflaeche: sprache(),
          });
          // Kam die Antwort trotz Abbruch an (Transport kann nicht abbrechen): verwerfen, nichts speichern.
          if (steuerung.signal.aborted) return false;
          const stand: LeserStand = alsLeserStand({ ...r.ergebnis, modell: r.modell, datum: r.datum });
          const daten = get().daten;
          if (!daten) return false;
          const alt = daten.kiLeser ?? leereAblage<LeserStand>();
          const reihenfolge = daten.projekt.kapitel;
          const eintraege = [...alt.eintraege.filter((e) => e.kapitel !== kapitel), stand].sort(
            (a, b) => reihenfolge.indexOf(a.kapitel) - reihenfolge.indexOf(b.kapitel),
          );
          await get().speichereKiLeser({ version: 1, eintraege, lauf: { datum: r.datum, modell: r.modell, kostenUsd: Math.round(r.kostenUsd * 10000) / 10000 } });
          setze({ simVerworfen: { ...zustand().simVerworfen, [kapitel]: r.verworfen.map((v) => v.grund) } });
          return true;
        } catch (e) {
          // Abbruch ist kein Fehler: Zustand sauber zurück, keine Meldung
          if (!steuerung.signal.aborted && !(e instanceof KiFehler && e.art === 'abgebrochen')) {
            setze({ simFehler: { kapitel, fehler: kiFehlerAnzeige(e) } });
          }
          return false;
        } finally {
          if (simAbbruch === steuerung) simAbbruch = null;
          setze({ simLauf: null });
        }
      },

      simAbbrechen() {
        simAbbruch?.abort();
      },

      async standEntfernen(kapitel) {
        const alt = get().daten?.kiLeser;
        if (!alt || !alt.eintraege.some((e) => e.kapitel === kapitel)) return;
        await get().speichereKiLeser({ ...alt, eintraege: alt.eintraege.filter((e) => e.kapitel !== kapitel) });
      },

      async fragenSchaetzen() {
        const schnell = zustand().schnell;
        const vorhanden = zustand().fragenSchaetzung;
        if (vorhanden && vorhanden.schnell === schnell) return vorhanden.wert;
        try {
          const rolle = schnell ? 'erkennung' : 'pruefung';
          const s = await schaetzeAufgabe(await leser(), transport(), get().kiEinstellungen(), frageAufgabe('Wo kommt das im Buch vor?', { rolle }), sprache());
          const preis = preisFuer(s.modell, rolle, s.eingabeTokens);
          const wert: FragenSchaetzung = {
            modell: s.modell,
            ersteUsd: s.kostenUsd,
            weitereUsd: kostenUsd({ eingabe: s.eingabeTokens - s.prefixTokens, ausgabe: s.ausgabeTokens, cacheGelesen: s.prefixTokens, cacheGeschrieben: 0 }, preis),
            eingabeTokens: s.eingabeTokens,
            gezaehlt: s.gezaehlt,
          };
          setze({ fragenSchaetzung: { schnell, wert } });
          return wert;
        } catch {
          return null;
        }
      },

      async fragen(roh) {
        const frage = roh.trim();
        if (!frage || zustand().frageLauf) return false;
        if (schreibAuftrag(frage)) {
          setze({ frageFehler: { art: 'auftrag', text: texte().state.kileser.schreibAuftrag } });
          return false;
        }
        setze({ frageLauf: { frage, seit: Date.now() }, frageFehler: null });
        try {
          const verlauf = (get().daten?.kiFragen?.eintraege ?? []).map((f) => ({ frage: f.frage, antwort: f.antwort }));
          const rolle = zustand().schnell ? 'erkennung' : 'pruefung';
          const r = await fuehreAufgabeAus(await leser(), transport(), get().kiEinstellungen(), frageAufgabe(frage, { verlauf, rolle }), { oberflaeche: sprache() });
          if (r.ergebnis.verworfen) {
            // Formulierungsvorschlag oder nicht prüfbarer Text: nichts speichern, nur melden
            setze({ frageFehler: { art: 'antwort', text: f(texte().state.kileser.antwortVerworfen, { grund: r.ergebnis.verworfen }) } });
            return false;
          }
          const daten = get().daten;
          if (!daten) return false;
          const alt = daten.kiFragen ?? leereAblage<BuchFrage>();
          const vorhandeneIds = new Set(alt.eintraege.map((e) => e.id));
          let id = `frage-${Date.now().toString(36)}`;
          for (let n = 2; vorhandeneIds.has(id); n++) id = `frage-${Date.now().toString(36)}-${n}`;
          const eintrag = alsBuchFrage(id, frage, r);
          await get().speichereKiFragen({
            version: 1,
            eintraege: [...alt.eintraege, eintrag],
            lauf: { datum: r.datum, modell: r.modell, kostenUsd: eintrag.kostenUsd },
          });
          const hinweis =
            r.ergebnis.verworfeneBelege > 0
              ? f(texte().state.kileser.belegeVerworfen, { n: r.ergebnis.verworfeneBelege })
              : '';
          if (hinweis) setze({ frageHinweise: { ...zustand().frageHinweise, [id]: hinweis } });
          // Die Antwort hat dieselbe Prefix-Länge wie die Schätzung; die nächste Frage liest den Cache.
          return true;
        } catch (e) {
          setze({ frageFehler: kiFehlerAnzeige(e) });
          return false;
        } finally {
          setze({ frageLauf: null });
        }
      },

      async frageEntfernen(id) {
        const alt = get().daten?.kiFragen;
        if (!alt) return;
        await get().speichereKiFragen({ ...alt, eintraege: alt.eintraege.filter((e) => e.id !== id) });
      },

      async verlaufLeeren() {
        const alt = get().daten?.kiFragen;
        if (!alt || alt.eintraege.length === 0) return;
        await get().speichereKiFragen({ ...alt, eintraege: [] });
      },

      setzeEntwurf(text) {
        setze({ entwurf: text });
      },

      setzeSchnell(schnell) {
        setze({ schnell });
      },

      fehlerZuruecksetzen() {
        setze({ simFehler: null, frageFehler: null });
      },
    },
  };
};
