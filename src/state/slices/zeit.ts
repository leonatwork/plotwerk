/**
 * Slice „zeit“ (G1 Zeit & Zustand: Zeitleiste, Zustandskurve). Besitzer: G1. Zustand im Store unter `zeit` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * Zeitpunkte stehen am Kapitelplan bzw. an der Szene (speicherePlan), Zustände und Zustandsarten in
 * plan/zeitleiste.md (speichereZeitleiste). KI-Vorschläge liegen in .plotwerk/zeit-vorschlaege.json und
 * .plotwerk/zustand-vorschlaege.json; übernommen wird nur auf Leons Klick.
 */
import type { StateCreator } from 'zustand';
import {
  KiFehler,
  schaetzeZeitpunkte,
  schaetzeZustaende,
  schlageZeitpunkteVor,
  schlageZustaendeVor,
  type Schaetzung,
  type ZeitAuftrag,
  type ZeitSzene,
  type ZustandAuftrag,
} from '@core/ki/index';
import type { Id, KiAblage, ProjektDaten, Zeitleiste, Zeitpunkt, ZeitVorschlag, ZustandsArt, ZustandVorschlag } from '@core/model/types';
import type { ProjektLeser } from '@core/projekt/fs';
import {
  aendereZustandsart,
  bereinigeZeitpunkt,
  eigenerZeitpunkt,
  entferneZustandsart,
  fuegeZustandsartHinzu,
  geplanteSzenen,
  hatZeitangabe,
  mischeZeitVorschlaege,
  mischeZustandVorschlaege,
  planMitZeit,
  planOderNeu,
  setzeVorschlagStatus,
  setzeZustand,
  verschiebeZustandsart,
  zeitAusVorschlag,
  zeitleisteMitZustandVorschlag,
  zeitleisteVon,
  zustandsId,
  type ZustandSetzen,
} from '@core/zeit/index';
import type { Store } from '../store';
import { kiFehlerAnzeige, type KiFehlerAnzeige } from './ki';

export type ZeitKiArt = 'zeit' | 'zustand';

export interface ZeitKiAuftrag {
  art: ZeitKiArt;
  /** nur bei „zustand“ */
  figur?: Id;
  /** nur diese Kapitel; fehlt = alle mit Text */
  kapitel?: Id[];
  tiefencheck?: boolean;
}

export interface ZeitLaufErgebnis {
  art: ZeitKiArt;
  figur?: Id;
  /** neu in der Ablage */
  neu: number;
  /** steht schon so im Plan */
  schonEingetragen: number;
  /** gleicher Vorschlag wurde schon verworfen */
  bereitsEntschieden: number;
  verworfen: { grund: string }[];
  /** Kapitel im Umfang */
  kapitel: number;
  modell: string;
  kostenUsd: number;
  zeit: number;
}

export interface Zeit {
  /** gewählte Einheit der Zeitleiste („kapitel“ bzw. „kapitel#szene“) */
  auswahl: string | null;
  waehle(schluessel: string | null): void;
  /** Figur der Zustandsspur; null = Hauptfigur */
  figur: Id | null;
  setzeFigur(id: Id | null): void;
  /** Kapitel mit geplanten Szenen in Szenen aufteilen */
  szenen: boolean;
  setzeSzenen(an: boolean): void;
  /** Spuren unter den Karten */
  spuren: { ort: boolean; zustand: boolean };
  setzeSpur(spur: 'ort' | 'zustand', an: boolean): void;

  /** Zeitpunkt eines Kapitels bzw. einer Szene ersetzen (null entfernt ihn) */
  setzeZeitpunkt(kapitel: Id, szene: Id | undefined, zeit: Zeitpunkt | null): Promise<void>;
  /**
   * Teile des Zeitpunkts ändern (undefined löscht ein Feld). Ein neuer Zeitpunkt ist „gesichert“ (von Leon gesetzt).
   * Bleibt nichts außer der Sicherheit, wird der Zeitpunkt entfernt.
   */
  aendereZeitpunkt(kapitel: Id, szene: Id | undefined, teil: Partial<Zeitpunkt>): Promise<void>;
  /** Bezug für Tag 1 (plan/zeitleiste.md) */
  setzeBeginn(beginn: Zeitleiste['beginn'] | undefined): Promise<void>;
  setzeNotiz(notiz: string): Promise<void>;

  setzeZustand(s: ZustandSetzen): Promise<void>;
  /** Rückgabe: ID der (neuen oder gleichnamigen) Zustandsart, null bei leerem Namen */
  zustandsartAnlegen(name: string): Promise<Id | null>;
  zustandsartAendern(id: Id, teil: Partial<Pick<ZustandsArt, 'name' | 'farbe'>>): Promise<void>;
  zustandsartEntfernen(id: Id): Promise<void>;
  zustandsartVerschieben(id: Id, richtung: -1 | 1): Promise<void>;

  /** KI: laufende Anfrage */
  lauf: ZeitKiAuftrag | null;
  fehler: KiFehlerAnzeige | null;
  ergebnis: ZeitLaufErgebnis | null;
  schaetzen(a: ZeitKiAuftrag): Promise<Schaetzung>;
  /** Vorschläge holen und in die Ablage mischen (nichts wird übernommen) */
  vorschlagen(a: ZeitKiAuftrag): Promise<void>;
  abbrechen(): void;
  zuruecksetzen(): void;
  zeitVorschlagUebernehmen(schluessel: string): Promise<void>;
  zeitVorschlagVerwerfen(schluessel: string): Promise<void>;
  zustandVorschlagUebernehmen(schluessel: string): Promise<void>;
  zustandVorschlagVerwerfen(schluessel: string): Promise<void>;
}

export interface ZeitSlice {
  zeit: Zeit;
}

/** Geplante Szenen je Kapitel für die KI-Zuordnung (nur IDs und Index, nie Titel). */
export function szenenFuerKi(daten: ProjektDaten): Record<Id, ZeitSzene[]> {
  const ergebnis: Record<Id, ZeitSzene[]> = {};
  for (const [id, plan] of Object.entries(daten.plaene ?? {})) {
    const s = geplanteSzenen(plan);
    if (s.length) ergebnis[id] = s.map((x) => ({ id: x.id, index: x.index }));
  }
  return ergebnis;
}

export const createZeitSlice: StateCreator<Store, [], [], ZeitSlice> = (set, get) => {
  const setze = (teil: Partial<Zeit>) => set((s) => ({ zeit: { ...s.zeit, ...teil } }));
  let abbruch: AbortController | null = null;

  function daten(): ProjektDaten {
    const d = get().daten;
    if (!d) throw new Error('Kein Projekt geöffnet.');
    return d;
  }

  async function zeitleisteAendern(aendern: (zl: Zeitleiste) => Zeitleiste): Promise<void> {
    await get().speichereZeitleiste(aendern(zeitleisteVon(daten())));
  }

  /** Nur-Lese-Sicht auf das Projekt (harte Regel 1: core/ki bekommt nie das schreibende Dateisystem). */
  async function leser(): Promise<ProjektLeser> {
    const fs = get().fs;
    if (!fs || !get().daten) throw new KiFehler('auftrag', 'Kein Projekt geöffnet.');
    await get().editorSichern();
    await get().alleSpeichernAbwarten();
    return { lesen: (p) => fs.lesen(p), auflisten: (o) => fs.auflisten(o), existiert: (p) => fs.existiert(p) };
  }

  function transport() {
    const b = get().backend;
    if (!b) throw new KiFehler('nicht_bereit', 'Die App ist noch nicht bereit.');
    return b.ki;
  }

  function kernAuftrag(a: ZeitKiAuftrag): ZeitAuftrag | ZustandAuftrag {
    const d = daten();
    const basis: ZeitAuftrag = {
      szenen: szenenFuerKi(d),
      ...(a.kapitel ? { kapitel: a.kapitel } : {}),
      ...(a.tiefencheck ? { tiefencheck: true } : {}),
    };
    if (a.art === 'zeit') return basis;
    if (!a.figur || !d.figuren[a.figur]) throw new KiFehler('auftrag', 'Wähle zuerst eine Figur.');
    const arten = zeitleisteVon(d).zustandsarten.map((x) => ({ id: x.id, name: x.name }));
    return { ...basis, figur: a.figur, arten };
  }

  async function ablageZeit(aendern: (a: KiAblage<ZeitVorschlag>) => KiAblage<ZeitVorschlag>) {
    const a = daten().kiZeitVorschlaege;
    if (a) await get().speichereKiZeitVorschlaege(aendern(a));
  }
  async function ablageZustand(aendern: (a: KiAblage<ZustandVorschlag>) => KiAblage<ZustandVorschlag>) {
    const a = daten().kiZustandVorschlaege;
    if (a) await get().speichereKiZustandVorschlaege(aendern(a));
  }

  const zeit: Zeit = {
    auswahl: null,
    waehle: (auswahl) => setze({ auswahl }),
    figur: null,
    setzeFigur: (figur) => setze({ figur }),
    szenen: true,
    setzeSzenen: (szenen) => setze({ szenen }),
    spuren: { ort: true, zustand: true },
    setzeSpur: (spur, an) => set((s) => ({ zeit: { ...s.zeit, spuren: { ...s.zeit.spuren, [spur]: an } } })),

    async setzeZeitpunkt(kapitel, szene, z) {
      const d = daten();
      await get().speicherePlan(planMitZeit(planOderNeu(d, kapitel), szene, z ?? undefined));
    },

    async aendereZeitpunkt(kapitel, szene, teil) {
      const d = daten();
      const alt: Zeitpunkt = eigenerZeitpunkt(d, kapitel, szene) ?? { sicherheit: 'fest' };
      const neu = bereinigeZeitpunkt({ ...alt, ...teil } as Zeitpunkt);
      for (const [k, v] of Object.entries(teil)) if (v === undefined) delete (neu as unknown as Record<string, unknown>)[k];
      const behalten = hatZeitangabe(neu) || !!neu.notiz || !!neu.beleg;
      await get().zeit.setzeZeitpunkt(kapitel, szene, behalten ? neu : null);
    },

    async setzeBeginn(beginn) {
      await zeitleisteAendern((zl) => {
        const { beginn: _alt, ...rest } = zl;
        void _alt;
        const b = beginn ? Object.fromEntries(Object.entries(beginn).filter(([, v]) => v)) : {};
        return Object.keys(b).length ? { ...rest, beginn: b as Zeitleiste['beginn'] } : rest;
      });
    },

    async setzeNotiz(notiz) {
      await zeitleisteAendern((zl) => ({ ...zl, notiz }));
    },

    async setzeZustand(s) {
      await zeitleisteAendern((zl) => setzeZustand(zl, s, (vorhandene) => zustandsId(s.figur, s.kapitel, s.szene, vorhandene)));
    },

    async zustandsartAnlegen(name) {
      const r = fuegeZustandsartHinzu(zeitleisteVon(daten()), name);
      if (!r) return null;
      await get().speichereZeitleiste(r.zeitleiste);
      return r.id;
    },

    async zustandsartAendern(id, teil) {
      await zeitleisteAendern((zl) => aendereZustandsart(zl, id, teil));
    },

    async zustandsartEntfernen(id) {
      await zeitleisteAendern((zl) => entferneZustandsart(zl, id));
    },

    async zustandsartVerschieben(id, richtung) {
      await zeitleisteAendern((zl) => verschiebeZustandsart(zl, id, richtung));
    },

    lauf: null,
    fehler: null,
    ergebnis: null,

    async schaetzen(a) {
      const auftrag = kernAuftrag(a);
      return a.art === 'zeit'
        ? schaetzeZeitpunkte(await leser(), transport(), get().kiEinstellungen(), auftrag)
        : schaetzeZustaende(await leser(), transport(), get().kiEinstellungen(), auftrag as ZustandAuftrag);
    },

    async vorschlagen(a) {
      if (get().zeit.lauf) return;
      const steuerung = new AbortController();
      abbruch = steuerung;
      setze({ lauf: a, fehler: null, ergebnis: null });
      try {
        const auftrag = kernAuftrag(a);
        const einstellungen = get().kiEinstellungen();
        if (a.art === 'zeit') {
          const r = await schlageZeitpunkteVor(await leser(), transport(), einstellungen, auftrag, { signal: steuerung.signal });
          if (steuerung.signal.aborted) throw new KiFehler('abgebrochen', 'Abgebrochen.');
          const gemischt = mischeZeitVorschlaege(
            daten().kiZeitVorschlaege,
            r.ergebnis.vorschlaege,
            { datum: r.datum, modell: r.modell, kostenUsd: r.kostenUsd },
            daten(),
            r.ergebnis.kapitel,
          );
          await get().speichereKiZeitVorschlaege(gemischt.ablage);
          setze({
            ergebnis: {
              art: 'zeit',
              neu: gemischt.neu,
              schonEingetragen: gemischt.schonEingetragen,
              bereitsEntschieden: gemischt.bereitsEntschieden,
              verworfen: r.verworfen.map((v) => ({ grund: v.grund })),
              kapitel: r.ergebnis.kapitel.length,
              modell: r.modell,
              kostenUsd: r.kostenUsd,
              zeit: Date.now(),
            },
          });
        } else {
          const za = auftrag as ZustandAuftrag;
          const r = await schlageZustaendeVor(await leser(), transport(), einstellungen, za, { signal: steuerung.signal });
          if (steuerung.signal.aborted) throw new KiFehler('abgebrochen', 'Abgebrochen.');
          const gemischt = mischeZustandVorschlaege(
            daten().kiZustandVorschlaege,
            r.ergebnis.vorschlaege,
            { datum: r.datum, modell: r.modell, kostenUsd: r.kostenUsd },
            daten(),
            za.figur,
          );
          await get().speichereKiZustandVorschlaege(gemischt.ablage);
          setze({
            ergebnis: {
              art: 'zustand',
              figur: za.figur,
              neu: gemischt.neu,
              schonEingetragen: gemischt.schonEingetragen,
              bereitsEntschieden: gemischt.bereitsEntschieden,
              verworfen: r.verworfen.map((v) => ({ grund: v.grund })),
              kapitel: r.ergebnis.kapitel.length,
              modell: r.modell,
              kostenUsd: r.kostenUsd,
              zeit: Date.now(),
            },
          });
        }
      } catch (e) {
        setze({ fehler: kiFehlerAnzeige(e) });
      } finally {
        if (abbruch === steuerung) abbruch = null;
        setze({ lauf: null });
      }
    },

    abbrechen() {
      abbruch?.abort();
    },

    zuruecksetzen() {
      if (get().zeit.lauf) return;
      setze({ ergebnis: null, fehler: null });
    },

    async zeitVorschlagUebernehmen(schluessel) {
      const d = daten();
      const v = d.kiZeitVorschlaege?.eintraege.find((e) => e.schluessel === schluessel);
      if (!v) return;
      await get().zeit.setzeZeitpunkt(v.kapitel, v.szene, zeitAusVorschlag(d, v));
      await ablageZeit((a) => setzeVorschlagStatus(a, schluessel, 'uebernommen'));
    },

    async zeitVorschlagVerwerfen(schluessel) {
      await ablageZeit((a) => setzeVorschlagStatus(a, schluessel, 'verworfen'));
    },

    async zustandVorschlagUebernehmen(schluessel) {
      const d = daten();
      const v = d.kiZustandVorschlaege?.eintraege.find((e) => e.schluessel === schluessel);
      if (!v) return;
      await get().speichereZeitleiste(zeitleisteMitZustandVorschlag(d, v));
      await ablageZustand((a) => setzeVorschlagStatus(a, schluessel, 'uebernommen'));
    },

    async zustandVorschlagVerwerfen(schluessel) {
      await ablageZustand((a) => setzeVorschlagStatus(a, schluessel, 'verworfen'));
    },
  };

  return { zeit };
};
