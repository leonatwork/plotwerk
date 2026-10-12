/**
 * Slice „struktur“ (G2 Plot-Struktur: Fäden-Board, Strang-Raster, Szenen). Besitzer: G2. Zustand im Store unter `struktur` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * - Fäden: Planung in plan/faeden.md (speichereFadenplanung), Status in entscheidungen.faeden (planung.fadenStatusSetzen).
 * - Szenen: Plan-Daten im Kapitelplan (speicherePlan). Der Kapiteltext wird nie verändert.
 */
import type { StateCreator } from 'zustand';
import { bekannteKosten, KiFehler, mischeStrangVorschlaege, schaetzeStraenge, schlageStraengeVor, type Schaetzung } from '@core/ki/index';
import type { Fadenplanung, Id, KapitelPlan, Strang } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import { leereFadenplanung, standardPlan } from '@core/projekt/index';
import { strangAusFaden, strangFrageBeantworten, strangVorschlagUebernehmen, strangVorschlagVerwerfen } from '@core/struktur/straenge';
import { fadenKarten } from '@core/struktur/faeden';
import { sprache, texte } from '../../i18n';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from './ki';
import {
  fadenAnlegen,
  fadenEntfernen,
  fadenPlanAendern,
  spaltenAenderung,
  type FadenPlanTeil,
  type FadenSpalte,
} from '@core/struktur/faeden';
import {
  naechsterSzenenIndex,
  szeneAendern,
  szeneEntfernen,
  szenenZeilen,
  szeneVerschieben,
  type SzenenTeil,
} from '@core/struktur/szenen';
import type { Store } from '../store';

/** Ergebnis eines KI-Laufs „Stränge vorschlagen“ (für den Dialog). */
export interface StrangLaufErgebnis {
  /** neue Vorschläge in der Ablage */
  neu: number;
  /** offene Vorschläge nach dem Lauf */
  offen: number;
  /** vom Modell gemeldet, aber schon entschieden */
  bereitsEntschieden: number;
  verworfen: { grund: string }[];
  modell: string;
  kostenUsd: number;
  /** false = Kosten unbekannt (OpenAI-kompatibler Dienst) */
  kostenBekannt?: false;
}

/** Felder eines Strangs, die Leon im Inspektor ändert */
export type StrangTeil = Partial<Pick<Strang, 'name' | 'farbe' | 'rolle' | 'beschreibung'>>;

export interface FadenFilter {
  /** nur Fäden dieses Strangs; null = alle */
  strang: Id | null;
  /** nur ruhende Fäden */
  nurRuhend: boolean;
}

export interface Struktur {
  /** Akt-Board oder Strang-Raster (Kapitel × Stränge) im Bereich „Akte planen“ */
  akteDarstellung: 'board' | 'straenge';
  setzeAkteDarstellung(d: 'board' | 'straenge'): void;

  // Fäden-Board
  /** im Inspektor gezeigter Faden */
  fadenAuswahl: Id | null;
  waehleFaden(id: Id | null): void;
  fadenFilter: FadenFilter;
  setzeFadenFilter(teil: Partial<FadenFilter>): void;
  /** Dialog „+ Faden“ offen */
  fadenNeuOffen: boolean;
  setzeFadenNeuOffen(offen: boolean): void;
  /** Leons Planung eines Fadens ändern (Auflösung, Notiz, Strang, Schwelle, Name/Eröffnung bei eigenen Fäden) */
  fadenAendern(id: Id, teil: FadenPlanTeil): Promise<void>;
  /** neuer Faden von Leon; gibt die ID zurück und wählt ihn aus */
  fadenNeu(name: string, eroeffnetIn?: Id): Promise<Id>;
  /** nur für von Leon angelegte Fäden: Planung und Status löschen */
  fadenLoeschen(id: Id): Promise<void>;
  /**
   * Faden in eine Spalte legen. „Auflösung geplant“ braucht ein Kapitel (`aufloesungIn` oder die schon geplante);
   * fehlt es, passiert nichts und es kommt false zurück.
   */
  fadenVerschieben(id: Id, spalte: FadenSpalte, aufloesungIn?: Id): Promise<boolean>;
  /** Standard-Schwelle für ruhende Fäden (Kapitel) */
  ruheSchwelleSetzen(n: number): Promise<void>;

  // Szenen
  /** aufgeklappte Szene im Schreiben-Inspektor */
  szeneOffen: { kapitel: Id; index: number } | null;
  setzeSzeneOffen(s: { kapitel: Id; index: number } | null): void;
  /** Plan-Daten der Szene an `index` ändern (legt sie bei Bedarf an) */
  szeneAendern(kapitel: Id, index: number, teil: SzenenTeil): Promise<void>;
  /** „+ Szene planen“: nächster Abschnitt ohne Plan oder neue Szene am Ende; gibt den Index zurück */
  szeneHinzufuegen(kapitel: Id): Promise<number>;
  szeneEntfernen(kapitel: Id, id: Id): Promise<void>;
  szeneVerschieben(kapitel: Id, id: Id, nachIndex: number): Promise<void>;

  // Strang-Raster
  /** Strang im Kapitelplan an- oder abwählen (Zelle im Raster) */
  strangUmschalten(kapitel: Id, strang: Id): Promise<void>;
  /** im Strang-Raster gewählter Strang (Inspektor); null = Übersicht mit allen KI-Vorschlägen */
  strangAuswahl: Id | null;
  /** wählt den Strang (oder die Übersicht) und zeigt im Raster-Inspektor wieder die Stränge statt eines Kapitels */
  waehleStrang(id: Id | null): void;
  /** Raster-Inspektor zeigt das gewählte Kapitel (Klick auf eine Kapitelnummer) statt der Stränge */
  rasterKapitel: boolean;
  setzeRasterKapitel(an: boolean): void;
  /** Name, Farbe, Haupt-/Nebenhandlung oder „Wofür steht der Strang?“ ändern; leere Werte entfernen das Feld */
  strangAendern(id: Id, teil: StrangTeil): Promise<void>;

  // KI: Stränge vorschlagen (.plotwerk/strang-vorschlaege.json)
  strangLauf: boolean;
  strangFehler: KiFehlerAnzeige | null;
  strangErgebnis: StrangLaufErgebnis | null;
  strangSchaetzen(): Promise<Schaetzung>;
  strangVorschlagen(): Promise<void>;
  strangAbbrechen(): void;
  strangZuruecksetzen(): void;
  /** Zuordnung oder neuen Strang übernehmen; `kapitel`: Auswahl der Kapitel bei einem neuen Strang */
  strangVorschlagUebernehmen(schluessel: string, kapitel?: Id[]): Promise<void>;
  strangVorschlagVerwerfen(schluessel: string): Promise<void>;
  /** Rückfrage beantworten (leer = wieder offen) */
  strangFrageBeantworten(schluessel: string, antwort: string): Promise<void>;
  /** Faden (loses Ende aus der Prüfung oder eigener) als Strang anlegen; Rückgabe: Strang-ID */
  strangAusFaden(faden: Id): Promise<Id | null>;

  /** Fäden: Board oder Tabelle (Fäden × Kapitel) */
  fadenDarstellung: 'board' | 'tabelle';
  setzeFadenDarstellung(d: 'board' | 'tabelle'): void;
}

export interface StrukturSlice {
  struktur: Struktur;
}

export const createStrukturSlice: StateCreator<Store, [], [], StrukturSlice> = (set, get) => {
  const setze = (teil: Partial<Struktur>) => set((s) => ({ struktur: { ...s.struktur, ...teil } }));
  let abbruch: AbortController | null = null;

  /** Nur-Lese-Sicht auf das Projekt (harte Regel 1: core/ki bekommt nie das schreibende Dateisystem). */
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

  const planung = (): Fadenplanung => get().daten?.fadenplanung ?? leereFadenplanung();
  const speichernPlanung = async (aendern: (p: Fadenplanung) => Fadenplanung) => {
    if (!get().daten) return;
    const neu = aendern(planung());
    if (neu !== planung()) await get().speichereFadenplanung(neu);
  };

  /** Kapitelplan (oder Standardplan, falls es nur das Manuskript gibt) */
  const kapitelPlan = (kapitel: Id): KapitelPlan | null => {
    const d = get().daten;
    if (!d) return null;
    const plan = d.plaene[kapitel];
    if (plan) return plan;
    const k = d.kapitel[kapitel];
    return k ? standardPlan(k) : null;
  };
  const speichernSzenen = async (kapitel: Id, aendern: (p: KapitelPlan) => KapitelPlan['szenen']) => {
    const plan = kapitelPlan(kapitel);
    if (!plan) return;
    const szenen = aendern(plan);
    const neu: KapitelPlan = { ...plan, szenen: szenen && szenen.length ? szenen : undefined };
    if (!neu.szenen) delete neu.szenen;
    await get().speicherePlan(neu);
  };

  return {
    struktur: {
      akteDarstellung: 'board',
      setzeAkteDarstellung: (akteDarstellung) => setze({ akteDarstellung }),

      fadenAuswahl: null,
      waehleFaden: (fadenAuswahl) => setze({ fadenAuswahl }),
      fadenFilter: { strang: null, nurRuhend: false },
      setzeFadenFilter: (teil) => setze({ fadenFilter: { ...get().struktur.fadenFilter, ...teil } }),
      fadenNeuOffen: false,
      setzeFadenNeuOffen: (fadenNeuOffen) => setze({ fadenNeuOffen }),

      async fadenAendern(id, teil) {
        await speichernPlanung((p) => fadenPlanAendern(p, id, teil));
      },

      async fadenNeu(name, eroeffnetIn) {
        const vorhandene = get().index.faeden.map((f) => f.id);
        const { planung: neu, id } = fadenAnlegen(planung(), name, eroeffnetIn, vorhandene);
        setze({ fadenAuswahl: id });
        await get().speichereFadenplanung(neu);
        return id;
      },

      async fadenLoeschen(id) {
        const d = get().daten;
        if (!d) return;
        if (get().struktur.fadenAuswahl === id) setze({ fadenAuswahl: null });
        await speichernPlanung((p) => fadenEntfernen(p, id));
        if (d.entscheidungen.faeden.some((f) => f.id === id)) await get().planung.fadenStatusSetzen(id, 'offen');
      },

      async fadenVerschieben(id, spalte, aufloesungIn) {
        const d = get().daten;
        if (!d) return false;
        const bisher = planung().faeden.find((f) => f.id === id)?.aufloesungIn;
        const aenderung = spaltenAenderung(spalte, bisher, aufloesungIn);
        if (!aenderung) return false;
        const status = d.entscheidungen.faeden.find((f) => f.id === id)?.status ?? 'offen';
        if (aenderung.aufloesungIn !== bisher) await speichernPlanung((p) => fadenPlanAendern(p, id, { aufloesungIn: aenderung.aufloesungIn }));
        if (aenderung.status !== status) await get().planung.fadenStatusSetzen(id, aenderung.status);
        return true;
      },

      async ruheSchwelleSetzen(n) {
        const wert = Math.max(1, Math.min(99, Math.round(n)));
        await speichernPlanung((p) => (p.ruheSchwelle === wert ? p : { ...p, ruheSchwelle: wert }));
      },

      szeneOffen: null,
      setzeSzeneOffen: (szeneOffen) => setze({ szeneOffen }),

      async szeneAendern(kapitel, index, teil) {
        await speichernSzenen(kapitel, (p) => szeneAendern(kapitel, p.szenen, index, teil));
      },

      async szeneHinzufuegen(kapitel) {
        const plan = kapitelPlan(kapitel);
        if (!plan) return -1;
        const index = naechsterSzenenIndex(szenenZeilen(get().daten?.kapitel[kapitel]?.text, plan.szenen));
        await speichernSzenen(kapitel, (p) => szeneAendern(kapitel, p.szenen, index, {}));
        setze({ szeneOffen: { kapitel, index } });
        return index;
      },

      async szeneEntfernen(kapitel, id) {
        const offen = get().struktur.szeneOffen;
        const sz = kapitelPlan(kapitel)?.szenen?.find((s) => s.id === id);
        if (offen && sz && offen.kapitel === kapitel && offen.index === sz.index) setze({ szeneOffen: null });
        await speichernSzenen(kapitel, (p) => szeneEntfernen(p.szenen, id));
      },

      async szeneVerschieben(kapitel, id, nachIndex) {
        await speichernSzenen(kapitel, (p) => szeneVerschieben(p.szenen, id, nachIndex));
        const offen = get().struktur.szeneOffen;
        if (offen?.kapitel === kapitel) setze({ szeneOffen: { kapitel, index: nachIndex } });
      },

      async strangUmschalten(kapitel, strang) {
        const plan = kapitelPlan(kapitel);
        if (!plan) return;
        const straenge = plan.straenge.includes(strang) ? plan.straenge.filter((s) => s !== strang) : [...plan.straenge, strang];
        await get().speicherePlan({ ...plan, straenge });
      },

      strangAuswahl: null,
      waehleStrang: (strangAuswahl) => setze({ strangAuswahl, rasterKapitel: false }),
      rasterKapitel: false,
      setzeRasterKapitel: (rasterKapitel) => setze({ rasterKapitel }),

      async strangAendern(id, teil) {
        const d = get().daten;
        if (!d) return;
        const straenge = d.straenge.map((s) => {
          if (s.id !== id) return s;
          const neu: Strang = { ...s, ...teil };
          if (!neu.name.trim()) neu.name = s.name;
          if (!neu.rolle) delete neu.rolle;
          if (!neu.beschreibung?.trim()) delete neu.beschreibung;
          return neu;
        });
        await get().speichereStraenge(straenge);
      },

      strangLauf: false,
      strangFehler: null,
      strangErgebnis: null,

      async strangSchaetzen() {
        return schaetzeStraenge(await leser(), transport(), get().kiEinstellungen(), sprache());
      },

      async strangVorschlagen() {
        if (get().struktur.strangLauf) return;
        const steuerung = new AbortController();
        abbruch = steuerung;
        setze({ strangLauf: true, strangFehler: null, strangErgebnis: null });
        try {
          const r = await schlageStraengeVor(await leser(), transport(), get().kiEinstellungen(), { signal: steuerung.signal, oberflaeche: sprache() });
          if (steuerung.signal.aborted) throw new KiFehler('abgebrochen', texte().state.ki.pruefungAbgebrochen);
          const gemischt = mischeStrangVorschlaege(get().daten?.kiStrangVorschlaege, r.ergebnis.vorschlaege, {
            datum: r.datum,
            modell: r.modell,
            ...bekannteKosten(r),
          });
          await get().speichereKiStrangVorschlaege(gemischt.ablage);
          setze({
            strangErgebnis: {
              neu: gemischt.neu,
              offen: gemischt.ablage.eintraege.filter((v) => v.status === 'neu').length,
              bereitsEntschieden: gemischt.bereitsEntschieden,
              verworfen: r.verworfen.map((v) => ({ grund: v.grund })),
              modell: r.modell,
              kostenUsd: r.kostenUsd,
              ...(r.kostenBekannt === false ? { kostenBekannt: false as const } : {}),
            },
          });
        } catch (e) {
          setze({ strangFehler: kiFehlerAnzeige(e) });
        } finally {
          if (abbruch === steuerung) abbruch = null;
          setze({ strangLauf: false });
        }
      },

      strangAbbrechen() {
        abbruch?.abort();
      },

      strangZuruecksetzen() {
        if (get().struktur.strangLauf) return;
        setze({ strangErgebnis: null, strangFehler: null });
      },

      async strangVorschlagUebernehmen(schluessel, kapitel) {
        const d = get().daten;
        if (!d) return;
        const u = strangVorschlagUebernehmen(d, schluessel, kapitel);
        if (!u) return;
        if (u.straenge !== d.straenge) await get().speichereStraenge(u.straenge);
        for (const p of u.plaene) await get().speicherePlan(p);
        await get().speichereKiStrangVorschlaege(u.ablage);
      },

      async strangVorschlagVerwerfen(schluessel) {
        const ablage = get().daten?.kiStrangVorschlaege;
        if (ablage) await get().speichereKiStrangVorschlaege(strangVorschlagVerwerfen(ablage, schluessel));
      },

      async strangAusFaden(faden) {
        const d = get().daten;
        if (!d) return null;
        const karte = fadenKarten(d, get().index.faeden).find((k) => k.id === faden);
        if (!karte) return null;
        const u = strangAusFaden(d, karte);
        await get().speichereStraenge(u.straenge);
        for (const p of u.plaene) await get().speicherePlan(p);
        await get().speichereFadenplanung(u.fadenplanung);
        return u.strang;
      },

      fadenDarstellung: 'board',
      setzeFadenDarstellung: (fadenDarstellung) => setze({ fadenDarstellung }),

      async strangFrageBeantworten(schluessel, antwort) {
        const ablage = get().daten?.kiStrangVorschlaege;
        if (ablage) await get().speichereKiStrangVorschlaege(strangFrageBeantworten(ablage, schluessel, antwort));
      },
    },
  };
};
