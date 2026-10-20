/**
 * Slice „statistik“ (G5 Versionen & Statistik: Fassungen, Vergleich, Schreibziele). Besitzer: G5. Zustand im Store unter `statistik` (eigener Namensraum).
 * Persistenz nur über die speichereX-Aktionen des Stores (get().speichereX), KI nur über core/ki.
 *
 * Tagesstatistik: Der Slice beobachtet den Store. Ändert sich die Wortzahl des Buchs (nach dem Speichern eines
 * Kapitels), wird die Änderung nach der Zählregel in core/statistik gebucht (Löschen zählt nicht negativ).
 * Die Tageswerte sammeln sich in `offen` und werden höchstens alle 15 s, beim Beenden und vor einem
 * Projektwechsel in statistik.json geschrieben.
 */
import type { BenannteFassung, Id, Schreibstatistik } from '@core/model/types';
import * as persistenz from '@core/projekt';
import {
  bucheAenderung,
  fassungsKapitel,
  fassungsVersion,
  kapitelFuerFassung,
  leereSchreibstatistik,
  neueFassung,
  offeneUebernehmen,
  offenHinzufuegen,
  tagSchluessel,
  WortzahlSpeicher,
  type LoeschPuffer,
  type OffeneTage,
} from '@core/statistik';
import type { StateCreator } from 'zustand';
import { texte } from '../../i18n';
import type { DialogId, Store } from '../store';

export type StatistikAnsicht = 'ueberblick' | 'fassungen';

export interface FassungEingabe {
  name: string;
  notiz?: string;
  /** 'buch' = alle Kapitel mit Text in Buchreihenfolge */
  kapitel: Id[] | 'buch';
}

export interface WiederherstellErgebnis {
  wiederhergestellt: Id[];
  uebersprungen: { id: Id; grund: string }[];
}

export interface Statistik {
  /** Benutzerinitiierte Ersetzung zählt nur den Buchstand nach. */
  ohneZaehlen<T>(arbeit: () => Promise<T>): Promise<T>;
  ansicht: StatistikAnsicht;
  setzeAnsicht(a: StatistikAnsicht): void;
  /** Tageswerte, die noch nicht in statistik.json stehen (geschrieben wird addiert, stand ersetzt) */
  offen: OffeneTage;
  /** Ziele ändern; ein optionales Ziel mit undefined entfernt es. */
  zielSetzen(teil: Partial<Schreibstatistik['ziel']>): Promise<void>;
  /** Offene Tageswerte sofort schreiben. */
  sichern(): Promise<void>;
  /** Benannte Fassung: Schnappschuss je Kapitel (immer, auch ohne Änderung) und Eintrag in fassungen.json. */
  fassungSichern(eingabe: FassungEingabe): Promise<BenannteFassung>;
  fassungAendern(id: Id, teil: { name?: string; notiz?: string }): Promise<void>;
  /** Entfernt nur den Eintrag; die Schnappschüsse bleiben unter .versionen/ (dann normale Aufbewahrung). */
  fassungEntfernen(id: Id): Promise<void>;
  /** Kapitel der Fassung wiederherstellen (vorher Schnappschuss der aktuellen Fassung je Kapitel). */
  fassungWiederherstellen(id: Id, kapitel?: Id[]): Promise<WiederherstellErgebnis>;
  /** store.versionWiederherstellen, ohne dass der zurückgeholte Text als geschrieben zählt. */
  versionWiederherstellen(kapitel: Id, versionsPfad: string): Promise<void>;
}

export interface StatistikSlice {
  statistik: Statistik;
}

/** Statistik mit den noch nicht gespeicherten Tageswerten. */
export function statistikMitOffenen(gespeichert: Schreibstatistik | undefined, offen: OffeneTage): Schreibstatistik {
  return offeneUebernehmen(gespeichert ?? leereSchreibstatistik(), offen);
}

/** Während dieser Dialoge geänderter Text zählt nicht als geschrieben. */
const NICHT_ZAEHLEN: ReadonlySet<DialogId> = new Set<DialogId>(['import', 'versionen', 'versionsvergleich', 'rueckimport']);
const SICHERN_NACH_MS = 15_000;

export const createStatistikSlice: StateCreator<Store, [], [], StatistikSlice> = (set, get, api) => {
  const setze = (teil: Partial<Statistik>) => set((s) => ({ statistik: { ...s.statistik, ...teil } }));

  const woerter = new WortzahlSpeicher();
  let stand: number | null = null;
  let puffer: LoeschPuffer | null = null;
  let aussetzen = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backendFuerBeenden: unknown = null;

  async function sichern(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const s = get();
    const offen = s.statistik.offen;
    if (!s.daten || !s.fs || Object.keys(offen).length === 0) return;
    const neu = statistikMitOffenen(s.daten.statistik, offen);
    setze({ offen: {} });
    await s.speichereStatistik(neu);
  }

  function spaeterSichern(): void {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      sichern().catch((e: unknown) => console.warn('Schreibstatistik nicht gespeichert:', e));
    }, SICHERN_NACH_MS);
  }

  function grundlinie(s: Store): void {
    woerter.leeren();
    stand = s.daten ? woerter.buch(s.daten) : null;
    puffer = null;
  }

  async function ohneZaehlen<T>(f: () => Promise<T>): Promise<T> {
    aussetzen++;
    try {
      return await f();
    } finally {
      aussetzen--;
    }
  }

  api.subscribe((s, vorher) => {
    if (s.backend && s.backend !== backendFuerBeenden) {
      backendFuerBeenden = s.backend;
      s.backend.beimBeenden(async () => {
        await get()
          .editorSichern()
          .catch(() => undefined);
        await sichern();
      });
    }

    if (s.fs !== vorher.fs || !s.daten || (s.ladeStatus === 'bereit' && vorher.ladeStatus !== 'bereit')) {
      // Projektwechsel/Neuladen: offene Werte gehören zum vorigen Projekt
      const offen = vorher.statistik.offen;
      if (vorher.fs && vorher.daten && s.fs !== vorher.fs && Object.keys(offen).length > 0) {
        void persistenz
          .speichereStatistik(vorher.fs, statistikMitOffenen(vorher.daten.statistik, offen))
          .catch((e: unknown) => console.warn('Schreibstatistik des vorigen Projekts nicht gespeichert:', e));
      }
      if (Object.keys(s.statistik.offen).length > 0 && s.fs !== vorher.fs) setze({ offen: {} });
      if (timer && s.fs !== vorher.fs) {
        clearTimeout(timer);
        timer = null;
      }
      grundlinie(s);
      return;
    }
    if (!vorher.daten || stand === null) {
      grundlinie(s);
      return;
    }
    if (s.daten.kapitel === vorher.daten.kapitel && s.daten.projekt.kapitel === vorher.daten.projekt.kapitel) return;

    const neu = woerter.buch(s.daten);
    if (neu === stand) return;
    const nurStand =
      aussetzen > 0 || s.externeAenderung !== vorher.externeAenderung || (s.dialog !== null && NICHT_ZAEHLEN.has(s.dialog.id));
    const b = bucheAenderung(stand, neu, new Date(), puffer, nurStand);
    stand = neu;
    puffer = b.puffer;
    const schonEintrag = !!s.statistik.offen[b.tag] || !!s.daten.statistik?.tage[b.tag];
     if (b.geschrieben === 0 && !schonEintrag && !s.suche.laeuft) return;
    setze({ offen: offenHinzufuegen(s.statistik.offen, b) });
    spaeterSichern();
  });

  return {
    statistik: {
      ohneZaehlen,
      ansicht: 'ueberblick',
      setzeAnsicht: (ansicht) => setze({ ansicht }),
      offen: {},

      async zielSetzen(teil) {
        const s = get();
        if (!s.daten) return;
        const basis = statistikMitOffenen(s.daten.statistik, s.statistik.offen);
        const ziel = { ...basis.ziel, ...teil };
        for (const k of Object.keys(ziel) as (keyof typeof ziel)[]) if (ziel[k] === undefined) delete ziel[k];
        ziel.tagWoerter = Math.max(0, Math.round(ziel.tagWoerter || 0));
        if (ziel.buchWoerter !== undefined) ziel.buchWoerter = Math.max(0, Math.round(ziel.buchWoerter));
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        setze({ offen: {} });
        await s.speichereStatistik({ ...basis, ziel });
      },

      sichern,

      async fassungSichern({ name, notiz, kapitel }) {
        const titel = name.trim();
        if (!titel) throw new Error(texte().state.statistik.fassungOhneName);
        await get().editorSichern();
        await get().alleSpeichernAbwarten();
        const d = get().daten;
        if (!d) throw new Error(texte().state.fehler.keinProjekt);
        const ids = kapitel === 'buch' ? kapitelFuerFassung(d) : kapitel.filter((id) => d.kapitel[id]);
        const dateien: BenannteFassung['dateien'] = [];
        for (const id of ids) {
          const pfad = persistenz.kapitelPfad(id);
          const version = await get().schnappschuss(pfad, 'benannt');
          if (version) dateien.push({ pfad, version });
        }
        if (dateien.length === 0) throw new Error(texte().state.statistik.keinKapitelMitText);
        const vorhandene = get().daten?.fassungen ?? [];
        const fassung = neueFassung(
          get().neueId(titel, vorhandene.map((f) => f.id)),
          titel,
          new Date(),
          dateien,
          notiz,
        );
        await get().speichereFassungen([...vorhandene, fassung]);
        return fassung;
      },

      async fassungAendern(id, teil) {
        const liste = get().daten?.fassungen ?? [];
        const neu = liste.map((f) => {
          if (f.id !== id) return f;
          const name = teil.name?.trim() || f.name;
          const notiz = teil.notiz === undefined ? f.notiz : teil.notiz.trim();
          const { notiz: _alt, ...rest } = f;
          void _alt;
          return notiz ? { ...rest, name, notiz } : { ...rest, name };
        });
        await get().speichereFassungen(neu);
      },

      async fassungEntfernen(id) {
        const liste = get().daten?.fassungen ?? [];
        await get().speichereFassungen(liste.filter((f) => f.id !== id));
      },

      async fassungWiederherstellen(id, auswahl) {
        const s = get();
        const d = s.daten;
        const fs = s.fs;
        const f = d?.fassungen?.find((x) => x.id === id);
        const t = texte().state.statistik;
        if (!d || !fs || !f) throw new Error(t.fassungFehlt);
        const ergebnis: WiederherstellErgebnis = { wiederhergestellt: [], uebersprungen: [] };
        await ohneZaehlen(async () => {
          for (const kid of auswahl ?? fassungsKapitel(f)) {
            const version = fassungsVersion(f, kid);
            if (!version) {
              ergebnis.uebersprungen.push({ id: kid, grund: t.nichtInFassung });
              continue;
            }
            if (!get().daten?.projekt.kapitel.includes(kid)) {
              ergebnis.uebersprungen.push({ id: kid, grund: t.nichtImBuch });
              continue;
            }
            const inhalt = await fs.lesen(version);
            if (inhalt === null) {
              ergebnis.uebersprungen.push({ id: kid, grund: t.schnappschussFehlt });
              continue;
            }
            if (persistenz.parseKapitel(inhalt, kid).text === get().daten?.kapitel[kid]?.text) continue;
            await get().versionWiederherstellen(kid, version);
            ergebnis.wiederhergestellt.push(kid);
          }
        });
        return ergebnis;
      },

      versionWiederherstellen: (kapitel, versionsPfad) => ohneZaehlen(() => get().versionWiederherstellen(kapitel, versionsPfad)),
    },
  };
};

/** Heutiger Tag (lokal) – für Anzeigen, die sich um Mitternacht ändern. */
export const heutigerTag = (): string => tagSchluessel(new Date());
