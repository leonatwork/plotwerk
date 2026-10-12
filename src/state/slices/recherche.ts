/**
 * Slice „recherche“ (G8 Recherche-Ablage). Besitzer: G8. Zustand im Store unter `recherche` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 * Recherche geht nie an die KI (E12).
 */
import type { StateCreator } from 'zustand';
import type { Id, RechercheEintrag, Verweis } from '@core/model/types';
import {
  eintragAendern,
  eintragAnlegen,
  eintragEntfernen,
  heften,
  istBildDatei,
  leereRechercheAblage,
  loesen,
  MAX_DATEIGROESSE,
  RECHERCHE_ORDNER,
  standardTitel,
  verwaisteDatei,
  verweisSchluessel,
  zielDateipfad,
  groesseText,
  type ArtFilter,
  type EintragEntwurf,
} from '@core/recherche/index';
import type { Store } from '../store';

export type RechercheDarstellung = 'raster' | 'liste';

/** Datei, die erst beim Speichern in recherche/dateien/ kopiert wird */
export interface NeueDatei {
  name: string;
  daten: Uint8Array;
}

/** Hörer für geänderte/entfernte Bilddateien (die Bildvorschau vergisst ihren Zwischenspeicher). */
const dateiHoerer = new Set<(pfad: string) => void>();
export function beiDateiAenderung(h: (pfad: string) => void): () => void {
  dateiHoerer.add(h);
  return () => void dateiHoerer.delete(h);
}
const dateiGeaendert = (pfad: string) => dateiHoerer.forEach((h) => h(pfad));

export interface RechercheZustand {
  suche: string;
  art: ArtFilter;
  /** Filter „geheftet an“ als Schlüssel `typ:id` */
  ziel: string | null;
  schlagwort: string | null;
  darstellung: RechercheDarstellung;
  /** ausgewählter Eintrag (Inspektor) */
  gewaehlt: Id | null;
  setzeSuche(s: string): void;
  setzeArt(a: ArtFilter): void;
  setzeZiel(z: Verweis | null): void;
  setzeSchlagwort(s: string | null): void;
  setzeDarstellung(d: RechercheDarstellung): void;
  waehle(id: Id | null): void;
  filterZuruecksetzen(): void;
  /** Prüft Endung und Größe; Fehlertext oder null */
  dateiPruefen(name: string, groesse: number): string | null;
  /** Kopiert eine Bilddatei nach recherche/dateien/ und liefert den Projektpfad. */
  dateiKopieren(datei: NeueDatei): Promise<string>;
  /**
   * Legt an (ohne id) oder ändert. `neueDatei` wird vorher kopiert und ersetzt `entwurf.datei`;
   * eine dadurch frei gewordene alte Datei wird (mit Schnappschuss) entfernt. Rückgabe: der Eintrag.
   */
  speichern(entwurf: EintragEntwurf, optionen?: { id?: Id; neueDatei?: NeueDatei }): Promise<RechercheEintrag>;
  /** Entfernt den Eintrag; die Bilddatei nur, wenn kein anderer Eintrag sie nutzt (vorher Schnappschuss). */
  entfernen(id: Id): Promise<void>;
  /** Legt für Bilder, die schon im Ordner recherche/dateien/ liegen, Einträge an (ohne Kopie). */
  dateienUebernehmen(pfade: string[], verweise?: Verweis[]): Promise<RechercheEintrag[]>;
  heften(id: Id, ziel: Verweis): Promise<void>;
  loesen(id: Id, ziel: Verweis): Promise<void>;
  /** Wechselt in den Bereich Recherche und wählt den Eintrag (Filter, die ihn verbergen, werden gelöst). */
  zeigen(id: Id): void;
}

export interface RechercheSlice {
  recherche: RechercheZustand;
}

export const createRechercheSlice: StateCreator<Store, [], [], RechercheSlice> = (set, get) => {
  const setze = (teil: Partial<RechercheZustand>) => set((s) => ({ recherche: { ...s.recherche, ...teil } }));
  const ablage = () => get().daten?.recherche ?? leereRechercheAblage();

  async function dateiFreigeben(pfad: string | null): Promise<void> {
    if (!pfad) return;
    try {
      await get().entferneBinaerDatei(pfad);
      dateiGeaendert(pfad);
    } catch (e) {
      console.warn('Recherche-Datei nicht entfernt:', pfad, e);
    }
  }

  return {
    recherche: {
      suche: '',
      art: 'alle',
      ziel: null,
      schlagwort: null,
      darstellung: 'raster',
      gewaehlt: null,
      setzeSuche: (suche) => setze({ suche }),
      setzeArt: (art) => setze({ art }),
      setzeZiel: (z) => setze({ ziel: z ? verweisSchluessel(z) : null }),
      setzeSchlagwort: (schlagwort) => setze({ schlagwort }),
      setzeDarstellung: (darstellung) => setze({ darstellung }),
      waehle: (gewaehlt) => setze({ gewaehlt }),
      filterZuruecksetzen: () => setze({ suche: '', art: 'alle', ziel: null, schlagwort: null }),

      dateiPruefen(name, groesse) {
        if (!istBildDatei(name)) return `„${name}“ ist kein Bild (erlaubt: JPG, PNG, GIF, WebP, HEIC, TIFF, SVG …).`;
        if (groesse > MAX_DATEIGROESSE) return `„${name}“ ist ${groesseText(groesse)} groß – höchstens ${groesseText(MAX_DATEIGROESSE)}.`;
        return null;
      },

      async dateiKopieren(datei) {
        const fehler = get().recherche.dateiPruefen(datei.name, datei.daten.length);
        if (fehler) throw new Error(fehler);
        const fs = get().fs;
        if (!fs) throw new Error('Kein Projekt geöffnet');
        const vorhanden = await fs.auflisten(RECHERCHE_ORDNER);
        const pfad = zielDateipfad(datei.name, vorhanden);
        await get().speichereBinaerDatei(pfad, datei.daten);
        dateiGeaendert(pfad);
        return pfad;
      },

      async speichern(entwurf, optionen = {}) {
        let e = entwurf;
        if (optionen.neueDatei) e = { ...e, datei: await get().recherche.dateiKopieren(optionen.neueDatei) };
        const r = ablage();
        if (optionen.id) {
          const alt = r.eintraege.find((x) => x.id === optionen.id);
          if (!alt) throw new Error('Diesen Eintrag gibt es nicht mehr.');
          const neu = eintragAendern(r, optionen.id, e);
          await get().speichereRecherche(neu);
          if (alt.datei && alt.datei !== e.datei) await dateiFreigeben(verwaisteDatei(neu, alt.datei));
          return neu.eintraege.find((x) => x.id === optionen.id)!;
        }
        const id = get().neueId(standardTitel(e), r.eintraege.map((x) => x.id));
        const { recherche, eintrag } = eintragAnlegen(r, id, e, new Date());
        await get().speichereRecherche(recherche);
        setze({ gewaehlt: eintrag.id });
        return eintrag;
      },

      async entfernen(id) {
        const { recherche, dateiFrei } = eintragEntfernen(ablage(), id);
        if (get().recherche.gewaehlt === id) setze({ gewaehlt: null });
        await get().speichereRecherche(recherche);
        await dateiFreigeben(dateiFrei);
      },

      async dateienUebernehmen(pfade, verweise = []) {
        let r = ablage();
        const neu: RechercheEintrag[] = [];
        const jetzt = new Date();
        for (const datei of pfade) {
          if (!istBildDatei(datei) || r.eintraege.some((e) => e.datei === datei)) continue;
          const entwurf: EintragEntwurf = { art: 'bild', titel: '', text: '', datei, verweise };
          const id = get().neueId(standardTitel(entwurf), r.eintraege.map((x) => x.id));
          const erg = eintragAnlegen(r, id, entwurf, jetzt);
          r = erg.recherche;
          neu.push(erg.eintrag);
        }
        if (neu.length) {
          await get().speichereRecherche(r);
          setze({ gewaehlt: neu[neu.length - 1]!.id });
        }
        return neu;
      },

      heften: (id, ziel) => get().speichereRecherche(heften(ablage(), id, ziel)),
      loesen: (id, ziel) => get().speichereRecherche(loesen(ablage(), id, ziel)),

      zeigen(id) {
        setze({ suche: '', art: 'alle', ziel: null, schlagwort: null, gewaehlt: id });
        get().setzeBereich('recherche');
      },
    },
  };
};
