/**
 * Slice „struktur“ (G2 Plot-Struktur: Fäden-Board, Strang-Raster, Szenen). Besitzer: G2. Zustand im Store unter `struktur` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * - Fäden: Planung in plan/faeden.md (speichereFadenplanung), Status in entscheidungen.faeden (planung.fadenStatusSetzen).
 * - Szenen: Plan-Daten im Kapitelplan (speicherePlan). Der Kapiteltext wird nie verändert.
 */
import type { StateCreator } from 'zustand';
import type { Fadenplanung, Id, KapitelPlan } from '@core/model/types';
import { leereFadenplanung, standardPlan } from '@core/projekt/index';
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
}

export interface StrukturSlice {
  struktur: Struktur;
}

export const createStrukturSlice: StateCreator<Store, [], [], StrukturSlice> = (set, get) => {
  const setze = (teil: Partial<Struktur>) => set((s) => ({ struktur: { ...s.struktur, ...teil } }));

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
    },
  };
};
