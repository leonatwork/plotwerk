/**
 * Slice „kileser“ (G6 KI-Leser: Leser-Simulation, Fragen an das Buch). Besitzer: G6. Zustand im Store unter `kileser` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 * core/ki bekommt nur eine Nur-Lese-Sicht (ProjektLeser) und den KI-Transport des Backends (harte Regel 1).
 */
import type { StateCreator } from 'zustand';
import {
  alsBuchFrage,
  alsLeserStand,
  ordneStaende,
  staendeFuer,
  standId,
  frageAufgabe,
  fuehreAufgabeAus,
  KiFehler,
  kostenUsd,
  leserBasisHash,
  leserSimulationAufgabe,
  preisFuer,
  schaetzeAufgabe,
  schreibAuftrag,
  uebernahmenMitnehmen,
  type Schaetzung,
} from '@core/ki/index';
import type { BuchFrage, Id, KiAblage, LeserFrage, LeserStand, TextAnker } from '@core/model/types';
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
  /** false = Kosten unbekannt (OpenAI-kompatibler Dienst) */
  kostenBekannt?: false;
  eingabeTokens: number;
  gezaehlt: boolean;
}

/** Ergebnis eines Laufs, der ohne offenen Dialog zu Ende ging (Meldung unten rechts). */
export interface SimMeldung {
  kapitel: Id;
  /** gespeicherte Simulation (bei „fertig“) */
  stand?: Id;
  /** Kapitelnummer beim Start (das Kapitel kann inzwischen verschoben oder gelöscht sein) */
  nr: number;
  art: 'fertig' | 'fehler';
  text?: string;
}

/** Angaben für „Als Faden planen“ */
export interface FadenUebernahme {
  name: string;
  eroeffnetIn: Id;
  aufloesungIn?: Id;
  /** wie die Frage gelöst wird */
  notiz: string;
  bewusstOffen: boolean;
}

export interface KiLeser {
  /** laufende Leser-Simulation */
  simLauf: { kapitel: Id; tiefencheck: boolean; seit: number } | null;
  simFehler: { kapitel: Id; fehler: KiFehlerAnzeige } | null;
  /** Lauf ist fertig oder fehlgeschlagen, während der Dialog geschlossen war */
  simMeldung: SimMeldung | null;
  /** Gründe für Verworfenes je gespeicherter Simulation (Stand-ID, nur diese Sitzung) */
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
  /**
   * Simulation starten; hängt eine neue Simulation an .plotwerk/leser.json an (ältere bleiben erhalten).
   * Gibt ihre ID zurück, null bei Fehler oder Abbruch.
   */
  simulieren(kapitel: Id, tiefencheck: boolean): Promise<Id | null>;
  /** Laufende Simulation abbrechen: nichts wird gespeichert, kein Fehler bleibt stehen. */
  simAbbrechen(): void;
  meldungSchliessen(): void;
  /** Eine gespeicherte Simulation löschen (Stand-ID, siehe standId) */
  standEntfernen(stand: Id): Promise<void>;
  /** Simulation als erledigt markieren bzw. wieder öffnen */
  standErledigt(stand: Id, erledigt: boolean): Promise<void>;
  /** Offene Leserfrage als Faden planen (plan/faeden.md); merkt den Faden an der Frage. Gibt die Faden-ID zurück. */
  alsFaden(stand: Id, frageId: Id, angaben: FadenUebernahme): Promise<Id | null>;
  /** Offene Leserfrage als Notiz an die Belegstelle heften (anmerkungen.json). Gibt die Anmerkung-ID zurück. */
  alsNotiz(stand: Id, frageId: Id, anker: TextAnker, notiz: string): Promise<Id | null>;
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

  /** Meldung nur, wenn der Dialog nicht offen ist – sonst sieht Leon das Ergebnis dort. */
  function melden(meldung: SimMeldung) {
    if (get().dialog?.id === 'leser-simulation') return;
    setze({ simMeldung: meldung });
  }

  /** Eine gespeicherte Simulation ändern; die abgeleitete ID älterer Stände wird dabei festgeschrieben. */
  async function standAendern(id: Id, aendern: (s: LeserStand) => LeserStand) {
    const alt = get().daten?.kiLeser;
    if (!alt || !alt.eintraege.some((e) => standId(e) === id)) return;
    await get().speichereKiLeser({ ...alt, eintraege: alt.eintraege.map((e) => (standId(e) === id ? { ...aendern(e), id } : e)) });
  }

  /** Eine Frage einer gespeicherten Simulation ändern (Übernahme merken). */
  async function frageAendern(stand: Id, frageId: Id, teil: Partial<Pick<LeserFrage, 'faden' | 'anmerkung'>>) {
    await standAendern(stand, (e) => ({ ...e, fragen: e.fragen.map((f) => (f.id === frageId ? { ...f, ...teil } : f)) }));
  }

  function frageIn(stand: Id, frageId: Id): LeserFrage | undefined {
    return get().daten?.kiLeser?.eintraege.find((e) => standId(e) === stand)?.fragen.find((f) => f.id === frageId);
  }

  return {
    kileser: {
      simLauf: null,
      simFehler: null,
      simVerworfen: {},
      simMeldung: null,
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
        if (zustand().simLauf) return null;
        const steuerung = new AbortController();
        simAbbruch = steuerung;
        const projektFs = get().fs;
        const nr = (get().daten?.projekt.kapitel.indexOf(kapitel) ?? -1) + 1;
        setze({ simLauf: { kapitel, tiefencheck, seit: Date.now() }, simFehler: null, simMeldung: null });
        try {
          const basisHash = hash(kapitel);
          const r = await fuehreAufgabeAus(await leser(), transport(), get().kiEinstellungen(), leserSimulationAufgabe(kapitel, { tiefencheck, basisHash }), {
            signal: steuerung.signal,
            oberflaeche: sprache(),
          });
          // Kam die Antwort trotz Abbruch an (Transport kann nicht abbrechen): verwerfen, nichts speichern.
          if (steuerung.signal.aborted) return null;
          // Projekt inzwischen gewechselt: nicht in das falsche Projekt schreiben
          if (get().fs !== projektFs) throw new KiFehler('auftrag', texte().state.kileser.projektGewechselt);
          const daten = get().daten;
          if (!daten) return null;
          const alt = daten.kiLeser ?? leereAblage<LeserStand>();
          const ids = new Set(alt.eintraege.map(standId));
          let id = `${kapitel}-${Date.now().toString(36)}`;
          for (let n = 2; ids.has(id); n++) id = `${kapitel}-${Date.now().toString(36)}-${n}`;
          // Übernahmen (Faden, Notiz) gleicher Fragen aus der vorigen Simulation des Kapitels mitnehmen
          const stand: LeserStand = uebernahmenMitnehmen(
            staendeFuer(alt.eintraege, kapitel)[0],
            alsLeserStand({ ...r.ergebnis, id, modell: r.modell, datum: r.datum }),
          );
          const eintraege = ordneStaende([...alt.eintraege, stand], daten.projekt.kapitel);
          await get().speichereKiLeser({ version: 1, eintraege, lauf: { datum: r.datum, modell: r.modell, ...(r.kostenBekannt === false ? {} : { kostenUsd: Math.round(r.kostenUsd * 10000) / 10000 }) } });
          setze({ simVerworfen: { ...zustand().simVerworfen, [id]: r.verworfen.map((v) => v.grund) } });
          melden({ kapitel, stand: id, nr, art: 'fertig' });
          return id;
        } catch (e) {
          // Abbruch ist kein Fehler: Zustand sauber zurück, keine Meldung
          if (!steuerung.signal.aborted && !(e instanceof KiFehler && e.art === 'abgebrochen')) {
            const fehler = kiFehlerAnzeige(e);
            console.warn('Leser-Simulation fehlgeschlagen:', e);
            setze({ simFehler: { kapitel, fehler } });
            melden({ kapitel, nr, art: 'fehler', text: fehler.text });
          }
          return null;
        } finally {
          if (simAbbruch === steuerung) simAbbruch = null;
          setze({ simLauf: null });
        }
      },

      simAbbrechen() {
        simAbbruch?.abort();
      },

      meldungSchliessen() {
        setze({ simMeldung: null });
      },

      async alsFaden(stand, frageId, angaben) {
        if (!frageIn(stand, frageId)) return null;
        const name = angaben.name.trim();
        if (!name) return null;
        const id = await get().struktur.fadenNeu(name, angaben.eroeffnetIn);
        await get().struktur.fadenAendern(id, { aufloesungIn: angaben.aufloesungIn || undefined, notiz: angaben.notiz.trim() || undefined });
        if (angaben.bewusstOffen) await get().planung.fadenStatusSetzen(id, 'bewusst_offen');
        await frageAendern(stand, frageId, { faden: id });
        return id;
      },

      async alsNotiz(stand, frageId, anker, notiz) {
        const frage = frageIn(stand, frageId);
        if (!frage || !notiz.trim()) return null;
        const a = await get().anmerkungAnlegen(anker, notiz, null);
        await frageAendern(stand, frageId, { anmerkung: a.id });
        return a.id;
      },

      async standEntfernen(stand) {
        const alt = get().daten?.kiLeser;
        if (!alt || !alt.eintraege.some((e) => standId(e) === stand)) return;
        await get().speichereKiLeser({ ...alt, eintraege: alt.eintraege.filter((e) => standId(e) !== stand) });
      },

      async standErledigt(stand, erledigt) {
        await standAendern(stand, (e) => {
          const { erledigt: _alt, ...rest } = e;
          void _alt;
          return erledigt ? { ...rest, erledigt: new Date().toISOString() } : rest;
        });
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
            ...(s.kostenBekannt === false ? { kostenBekannt: false as const } : {}),
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
            lauf: { datum: r.datum, modell: r.modell, ...(eintrag.kostenUsd !== undefined ? { kostenUsd: eintrag.kostenUsd } : {}) },
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
        setze({ simFehler: null, frageFehler: null, simMeldung: null });
      },
    },
  };
};
