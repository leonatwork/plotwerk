/**
 * Slice „figurenbogen“ (G3 Figuren: Bögen, Figurenstimme). Besitzer: G3. Zustand im Store unter `figurenbogen` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * Bögen: plan/boegen.md (speichereBoegen). Figurenstimme: Ergebnis der KI in .plotwerk/stimmen.json
 * (speichereKiStimmen); Leons Entscheidung („Ist Absicht“/„Erledigt“) in entscheidungen.json über
 * hinweisEntscheiden, damit sie auch in der Hinweise-Ansicht gilt.
 */
import type { StateCreator } from 'zustand';
import {
  belegAusZitat,
  bogenVon,
  gleicherAnker,
  mischeStimmen,
  neueStufenId,
  setzeBogen,
  setzeStimmenStatus,
  stimmenStatus,
} from '@core/figuren/index';
import { mischeFakten, setzeFaktStatus } from '@core/figuren/fakten';
import { bekannteKosten, KiFehler, pruefeStimme, sammleFakten, schaetzeFakten, schaetzeStimme, type FaktenAuftrag, type Schaetzung, type StimmenAuftrag } from '@core/ki/index';
import type { BogenStufe, Figurenbogen as BogenDaten, HinweisEntscheidung, Id, ProjektDaten, TextAnker } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import { sprache, texte } from '../../i18n';
import type { Store } from '../store';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from './ki';

export interface StimmenLaufErgebnis {
  figur: Id;
  /** neue Beobachtungen in der Ablage */
  neu: number;
  /** offene Beobachtungen der Figur nach dem Lauf */
  offen: number;
  /** vom Modell gemeldet, aber schon entschieden */
  bereitsEntschieden: number;
  /** verworfene Teile der Antwort (Zitat nicht im Text, Formulierungsvorschlag, …) */
  verworfen: { grund: string }[];
  zuWenigRede: boolean;
  redestellen: number;
  vage: boolean;
  modell: string;
  kostenUsd: number;
  /** false = Kosten unbekannt (OpenAI-kompatibler Dienst) */
  kostenBekannt?: false;
  zeit: number;
}

/** F-17: Ergebnis eines Laufs „Figurenfakten“ */
export interface FaktenLaufErgebnis {
  figur?: Id;
  /** gültige Angaben aus der Antwort */
  angaben: number;
  /** neu in der Ablage */
  neu: number;
  /** verworfene Teile der Antwort */
  verworfen: { grund: string }[];
  modell: string;
  kostenUsd: number;
  /** false = Kosten unbekannt (OpenAI-kompatibler Dienst) */
  kostenBekannt?: false;
}

export interface Figurenbogen {
  /** Bereich „Figuren“: Figurenkarte oder Figuren-Bögen */
  figurenAnsicht: 'karte' | 'boegen' | 'besetzung';
  setzeFigurenAnsicht(a: 'karte' | 'boegen' | 'besetzung'): void;

  /** Figurenkarte: Spalte „Stimme“ neben der Karte sichtbar */
  stimmeSpalte: boolean;
  setzeStimmeSpalte(offen: boolean): void;

  /** Bögen: weitere Figuren zum Vergleich (unter der gewählten Figur) */
  vergleich: Id[];
  setzeVergleich(ids: Id[]): void;
  /** Bögen: gewählte Stufe (Bearbeitung unter dem Raster) */
  gewaehlteStufe: { figur: Id; stufe: Id } | null;
  waehleStufe(w: { figur: Id; stufe: Id } | null): void;

  /** Neue Stufe; Rückgabe: ID der Stufe */
  stufeAnlegen(figur: Id, teil: { titel: string; kapitel?: Id; akt?: number; notiz?: string }): Promise<Id>;
  /** Stufe ersetzen (gleiche ID) */
  stufeSpeichern(figur: Id, stufe: BogenStufe): Promise<void>;
  stufeEntfernen(figur: Id, stufe: Id): Promise<void>;
  /** Beleg als Anker anfügen (doppelte werden ignoriert) */
  belegHinzufuegen(figur: Id, stufe: Id, anker: TextAnker): Promise<void>;
  /** Beleg aus einem wörtlichen Zitat; Rückgabe: Fehlertext oder null */
  belegAusZitatHinzufuegen(figur: Id, stufe: Id, kapitel: Id, zitat: string): Promise<string | null>;
  belegEntfernen(figur: Id, stufe: Id, index: number): Promise<void>;

  /** Figurenstimme: laufende Prüfung */
  stimmeLauf: { figur: Id; tiefencheck: boolean } | null;
  stimmeFehler: KiFehlerAnzeige | null;
  stimmeErgebnis: StimmenLaufErgebnis | null;
  stimmeSchaetzen(auftrag: StimmenAuftrag): Promise<Schaetzung>;
  /** Lauf starten; Ergebnis wird in .plotwerk/stimmen.json gemischt */
  stimmePruefen(auftrag: StimmenAuftrag): Promise<void>;
  stimmeAbbrechen(): void;
  stimmeZuruecksetzen(): void;
  /** „Ist Absicht“ / „Erledigt“; null setzt zurück */
  stimmeEntscheiden(schluessel: string, entscheidung: HinweisEntscheidung | null): Promise<void>;

  /** F-17 Figurenfakten: laufender Lauf (figur: nur diese Figur, sonst alle) */
  faktenLauf: FaktenAuftrag | null;
  faktenFehler: KiFehlerAnzeige | null;
  faktenErgebnis: FaktenLaufErgebnis | null;
  faktenSchaetzen(auftrag: FaktenAuftrag): Promise<Schaetzung>;
  /** Ergebnis wird in .plotwerk/figurenfakten.json gemischt */
  faktenSammeln(auftrag: FaktenAuftrag): Promise<void>;
  faktenAbbrechen(): void;
  faktenZuruecksetzen(): void;
  /** falsch erkannte Angabe verwerfen (kommt nicht wieder) bzw. wiederherstellen */
  faktVerwerfen(schluessel: string, verworfen?: boolean): Promise<void>;
}

export interface FigurenbogenSlice {
  figurenbogen: Figurenbogen;
}

export const createFigurenbogenSlice: StateCreator<Store, [], [], FigurenbogenSlice> = (set, get) => {
  const setze = (teil: Partial<Figurenbogen>) => set((s) => ({ figurenbogen: { ...s.figurenbogen, ...teil } }));
  let abbruch: AbortController | null = null;

  function daten(): ProjektDaten {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  }

  /** Bogen einer Figur immer vom neuesten Stand aus ändern und speichern. */
  async function bogenAendern(figur: Id, aendern: (b: BogenDaten) => BogenDaten) {
    const d = daten();
    const neu = aendern(bogenVon(d.boegen, figur));
    await get().speichereBoegen(setzeBogen(get().daten?.boegen, neu));
  }

  async function stufeAendern(figur: Id, stufe: Id, aendern: (s: BogenStufe) => BogenStufe) {
    await bogenAendern(figur, (b) => ({ ...b, stufen: b.stufen.map((s) => (s.id === stufe ? aendern(s) : s)) }));
  }

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

  return {
    figurenbogen: {
      figurenAnsicht: 'karte',
      setzeFigurenAnsicht: (figurenAnsicht) => setze({ figurenAnsicht }),

      stimmeSpalte: false,
      setzeStimmeSpalte: (stimmeSpalte) => setze({ stimmeSpalte }),

      vergleich: [],
      setzeVergleich: (ids) => setze({ vergleich: [...new Set(ids)] }),
      gewaehlteStufe: null,
      waehleStufe: (gewaehlteStufe) => setze({ gewaehlteStufe }),

      async stufeAnlegen(figur, teil) {
        const titel = teil.titel.trim() || texte().state.standard.stufe;
        const bogen = bogenVon(daten().boegen, figur);
        const id = neueStufenId(bogen, titel);
        const stufe: BogenStufe = {
          id,
          titel,
          belege: [],
          ...(teil.kapitel ? { kapitel: teil.kapitel } : teil.akt !== undefined ? { akt: teil.akt } : {}),
          ...(teil.notiz?.trim() ? { notiz: teil.notiz.trim() } : {}),
        };
        await bogenAendern(figur, (b) => ({ ...b, stufen: [...b.stufen, stufe] }));
        setze({ gewaehlteStufe: { figur, stufe: id } });
        return id;
      },

      async stufeSpeichern(figur, stufe) {
        await stufeAendern(figur, stufe.id, () => stufe);
      },

      async stufeEntfernen(figur, stufe) {
        await bogenAendern(figur, (b) => ({ ...b, stufen: b.stufen.filter((s) => s.id !== stufe) }));
        const w = get().figurenbogen.gewaehlteStufe;
        if (w && w.figur === figur && w.stufe === stufe) setze({ gewaehlteStufe: null });
      },

      async belegHinzufuegen(figur, stufe, anker) {
        await stufeAendern(figur, stufe, (s) => (s.belege.some((b) => gleicherAnker(b, anker)) ? s : { ...s, belege: [...s.belege, anker] }));
      },

      async belegAusZitatHinzufuegen(figur, stufe, kapitel, zitat) {
        const r = belegAusZitat(daten(), kapitel, zitat);
        if ('fehler' in r) return r.fehler;
        await get().figurenbogen.belegHinzufuegen(figur, stufe, r.anker);
        return null;
      },

      async belegEntfernen(figur, stufe, index) {
        await stufeAendern(figur, stufe, (s) => ({ ...s, belege: s.belege.filter((_, i) => i !== index) }));
      },

      stimmeLauf: null,
      stimmeFehler: null,
      stimmeErgebnis: null,

      async stimmeSchaetzen(auftrag) {
        return schaetzeStimme(await leser(), transport(), get().kiEinstellungen(), auftrag, sprache());
      },

      async stimmePruefen(auftrag) {
        if (get().figurenbogen.stimmeLauf) return;
        const steuerung = new AbortController();
        abbruch = steuerung;
        setze({ stimmeLauf: { figur: auftrag.figur, tiefencheck: !!auftrag.tiefencheck }, stimmeFehler: null, stimmeErgebnis: null });
        try {
          const r = await pruefeStimme(await leser(), transport(), get().kiEinstellungen(), auftrag, { signal: steuerung.signal, oberflaeche: sprache() });
          if (steuerung.signal.aborted) throw new KiFehler('abgebrochen', texte().state.ki.pruefungAbgebrochen);
          const d = daten();
          const gemischt = mischeStimmen(
            d.kiStimmen,
            auftrag.figur,
            r.ergebnis.beobachtungen,
            { datum: r.datum, modell: r.modell, ...bekannteKosten(r) },
            d.entscheidungen,
          );
          await get().speichereKiStimmen(gemischt.ablage);
          const nachher = get().daten;
          const offen = (nachher?.kiStimmen?.eintraege ?? []).filter(
            (b) => b.figur === auftrag.figur && stimmenStatus(b, nachher?.entscheidungen) === 'neu',
          ).length;
          setze({
            stimmeErgebnis: {
              figur: auftrag.figur,
              neu: gemischt.neu,
              offen,
              bereitsEntschieden: gemischt.bereitsEntschieden,
              verworfen: r.verworfen.map((v) => ({ grund: v.grund })),
              zuWenigRede: r.ergebnis.zuWenigRede,
              redestellen: r.ergebnis.redestellen,
              vage: r.ergebnis.vage,
              modell: r.modell,
              kostenUsd: r.kostenUsd,
              ...(r.kostenBekannt === false ? { kostenBekannt: false as const } : {}),
              zeit: Date.now(),
            },
          });
        } catch (e) {
          setze({ stimmeFehler: kiFehlerAnzeige(e) });
        } finally {
          if (abbruch === steuerung) abbruch = null;
          setze({ stimmeLauf: null });
        }
      },

      stimmeAbbrechen() {
        abbruch?.abort();
      },

      stimmeZuruecksetzen() {
        if (get().figurenbogen.stimmeLauf) return;
        setze({ stimmeErgebnis: null, stimmeFehler: null });
      },

      faktenLauf: null,
      faktenFehler: null,
      faktenErgebnis: null,

      async faktenSchaetzen(auftrag) {
        return schaetzeFakten(await leser(), transport(), get().kiEinstellungen(), auftrag, sprache());
      },

      async faktenSammeln(auftrag) {
        if (get().figurenbogen.faktenLauf) return;
        const steuerung = new AbortController();
        abbruch = steuerung;
        setze({ faktenLauf: auftrag, faktenFehler: null, faktenErgebnis: null });
        try {
          const r = await sammleFakten(await leser(), transport(), get().kiEinstellungen(), auftrag, { signal: steuerung.signal, oberflaeche: sprache() });
          if (steuerung.signal.aborted) throw new KiFehler('abgebrochen', texte().state.ki.pruefungAbgebrochen);
          const gemischt = mischeFakten(daten().kiFakten, r.ergebnis.figuren, r.ergebnis.fakten, { datum: r.datum, modell: r.modell, ...bekannteKosten(r) });
          await get().speichereKiFakten(gemischt.ablage);
          setze({
            faktenErgebnis: {
              figur: auftrag.figur,
              angaben: r.ergebnis.fakten.length,
              neu: gemischt.neu,
              verworfen: r.verworfen.map((v) => ({ grund: v.grund })),
              modell: r.modell,
              kostenUsd: r.kostenUsd,
              ...(r.kostenBekannt === false ? { kostenBekannt: false as const } : {}),
            },
          });
        } catch (e) {
          setze({ faktenFehler: kiFehlerAnzeige(e) });
        } finally {
          if (abbruch === steuerung) abbruch = null;
          setze({ faktenLauf: null });
        }
      },

      faktenAbbrechen() {
        abbruch?.abort();
      },

      faktenZuruecksetzen() {
        if (get().figurenbogen.faktenLauf) return;
        setze({ faktenErgebnis: null, faktenFehler: null });
      },

      async faktVerwerfen(schluessel, verworfen = true) {
        await get().speichereKiFakten(setzeFaktStatus(get().daten?.kiFakten, schluessel, verworfen ? 'verworfen' : 'neu'));
      },

      async stimmeEntscheiden(schluessel, entscheidung) {
        await get().hinweisEntscheiden(schluessel, entscheidung);
        // Zurücksetzen gilt auch für einen in der Datei gespeicherten Status
        const ablage = get().daten?.kiStimmen;
        if (entscheidung === null && ablage?.eintraege.some((b) => b.schluessel === schluessel && b.status !== 'neu')) {
          await get().speichereKiStimmen(setzeStimmenStatus(ablage, schluessel, null));
        }
      },
    },
  };
};
