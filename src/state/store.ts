/**
 * Zentraler Zustand (zustand). Besitzer: Fundament. Die Bereiche ergänzen eigene Slices in
 * src/state/slices/<bereich>.ts; diese lesen get().daten / get().fs und nutzen die speichereX-Aktionen.
 *
 * Persistenz: jede speichereX-Aktion aktualisiert `daten` sofort, schreibt dann atomar über `fs`
 * (je Pfad in Reihenfolge, immer der neueste Stand) und stößt die Index-Neuberechnung an
 * (300 ms entprellt). Fehler beim Schreiben werden geworfen und in `speichern.fehler` vermerkt.
 */
import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';
import { figurenZusammenfuehren as zusammenfuehren } from '@core/figuren/zusammenfuehren';
import { berechneIndex, LEERER_INDEX, type Index } from '@core/index/index';
import type {
  Akt,
  Anmerkung,
  BenannteFassung,
  BuchFrage,
  Entscheidungen,
  Fadenplanung,
  Figurenbogen,
  KiAblage,
  LektoratsAenderung,
  LeserStand,
  Markenliste,
  Recherche,
  Schreibstatistik,
  FigurFakt,
  StimmenBeobachtung,
  StrangVorschlag,
  Zeitleiste,
  ZeitVorschlag,
  ZustandVorschlag,
  Figur,
  Gruppe,
  Hinweis,
  Id,
  Idee,
  Kapitel,
  KapitelAnalyse,
  KapitelPlan,
  KiVorschlaege,
  Motiv,
  Ort,
  Projekt,
  ProjektDaten,
  Strang,
  TextAnker,
} from '@core/model/types';
import * as persistenz from '@core/projekt';
import type { ProjektDateisystem } from '@core/projekt';
import { aufbewahrungAnwenden, sollSchnappschuss, standGesichert, type SchnappschussAnlass } from '@core/versionen/index';
import { waehleBackend, type Backend } from '../backend';
import { mitKiSperre } from './funktionen';
import { f, sprache, texte, useSprachStore } from '../i18n';
import { neueId as erzeugeId } from './neueId';
import { createHinweiseSlice, type HinweiseSlice } from './slices/hinweise';
import { createImportExportSlice, type ImportExportSlice } from './slices/importexport';
import { createKiSlice, type KiSlice } from './slices/ki';
import { createVorschlaegeSlice, type VorschlaegeSlice } from './slices/vorschlaege';
import { createNetzSlice, type NetzSlice } from './slices/netz';
import { createPlanungSlice, type PlanungSlice } from './slices/planung';
import { createSchreibenSlice, type SchreibenSlice } from './slices/schreiben';
// Werkzeuge G1–G8 (je Gruppe ein Slice, Besitzer: die Gruppe)
import { createAbgabeSlice, type AbgabeSlice } from './slices/abgabe';
import { createEditorwerkzeugeSlice, type EditorwerkzeugeSlice } from './slices/editorwerkzeuge';
import { createFigurenbogenSlice, type FigurenbogenSlice } from './slices/figurenbogen';
import { createKiLeserSlice, type KiLeserSlice } from './slices/kileser';
import { createRechercheSlice, type RechercheSlice } from './slices/recherche';
import { createStatistikSlice, type StatistikSlice } from './slices/statistik';
import { createStrukturSlice, type StrukturSlice } from './slices/struktur';
import { createZeitSlice, type ZeitSlice } from './slices/zeit';

export type Bereich =
  | 'schreiben'
  | 'kapitel'
  | 'akte'
  | 'figuren'
  | 'beziehungen'
  | 'orte'
  | 'hinweise'
  // Werkzeuge (Seitenleisten-Gruppe „Werkzeuge“)
  | 'zeitleiste'
  | 'faeden'
  | 'statistik'
  | 'recherche'
  | 'fragen';
export type DialogId =
  | 'import'
  | 'export'
  | 'versionen'
  | 'ki-pruefen'
  | 'ki-einstellungen'
  | 'schnellsuche'
  /** E16: Funktionsumfang anpassen (aus den Einstellungen) */
  | 'funktionen'
  // Werkzeuge G1–G8 (Komponenten in src/features/<bereich>/, Zuordnung in src/app/dialoge.tsx)
  /** G1: KI schlägt Zeitpunkte/Zustände vor */
  | 'zeit-vorschlaege'
  /** G3: Figurenstimme prüfen; param {figur?: Id} */
  | 'stimme-pruefen'
  /** G2: KI schlägt Erzählstränge, Zuordnungen und Rückfragen vor */
  | 'straenge-vorschlagen'
  | 'figurenfakten'
  /** G4: Markennamen-Übersicht */
  | 'marken'
  /** G5: benannte Fassung anlegen */
  | 'fassung'
  /** G5: zwei Fassungen nebeneinander; param {links?: string, rechts?: string, kapitel?: Id, pfad?: string} */
  | 'versionsvergleich'
  /** G6: Leser-Simulation; param {kapitel?: Id} */
  | 'leser-simulation'
  /** G7: Normseite, Exposé, EPUB, Lektoratsmappe */
  | 'abgabe-export'
  /** G7: Kommentare und Änderungen aus Word zurückholen */
  | 'rueckimport'
  /** G8: Recherche-Eintrag anlegen/bearbeiten; param {id?: Id, verweis?: Verweis} */
  | 'recherche-eintrag';

export interface Auswahl {
  kapitel?: Id;
  figur?: Id;
  ort?: Id;
  gruppe?: Id;
  /** Hinweis-Schlüssel */
  hinweis?: string;
  /** Kapitel-ID einer Plan-Karte */
  plan?: Id;
}

/** Stelle, zu der der Editor springen und die er hervorheben soll. */
export interface Markierung {
  kapitel: Id;
  anker: TextAnker;
}

/** 'initial' vor initialisieren(), 'start' = kein Projekt (Startbildschirm). */
export type LadeStatus = 'initial' | 'laedt' | 'start' | 'bereit' | 'fehler';

export interface SpeicherStatus {
  /** laufende Schreibvorgänge */
  laufend: number;
  /** letzter Fehler (null nach dem nächsten erfolgreichen Schreiben) */
  fehler: string | null;
  /** Zeitpunkt (ms) des letzten erfolgreichen Schreibens */
  zuletzt: number | null;
}

export interface Basis {
  backend: Backend | null;
  fs: ProjektDateisystem | null;
  daten: ProjektDaten | null;
  index: Index;
  ladeStatus: LadeStatus;
  fehler: string | null;
  /** Dateien, die beim Laden nicht vollständig gelesen werden konnten */
  warnungen: { pfad: string; grund: string }[];
  speichern: SpeicherStatus;
  /** zuletzt von außen geänderte Dateien (nach dem Neuladen gesetzt) */
  externeAenderung: { pfade: string[]; zeit: number } | null;

  bereich: Bereich;
  setzeBereich(b: Bereich): void;
  auswahl: Auswahl;
  /** Teile der Auswahl setzen; ein Schlüssel mit undefined hebt die Auswahl auf. */
  waehle(teil: Partial<Auswahl>): void;
  oeffne(bereich: Bereich, auswahlTeil?: Partial<Auswahl>): void;
  markierung: Markierung | null;
  /** Wechselt zu „Schreiben“ und dem Kapitel; der Editor springt zur Stelle und hebt sie hervor. */
  markiere(m: Markierung | null): void;
  fokusModus: boolean;
  umschalteFokus(): void;
  dialog: { id: DialogId; param?: unknown } | null;
  oeffneDialog(id: DialogId, param?: unknown): void;
  schliesseDialog(): void;

  initialisieren(): Promise<void>;
  projektLaden(fs: ProjektDateisystem): Promise<void>;
  projektOeffnen(): Promise<void>;
  neuesProjekt(titel: string): Promise<void>;

  /** Neue Kapitel werden an projekt.kapitel angehängt (projekt.md wird mitgespeichert). */
  speichereKapitel(k: Kapitel): Promise<void>;
  /** Neue Pläne werden an projekt.kapitel angehängt (Kapitel ohne Manuskriptdatei = nur geplant). */
  speicherePlan(p: KapitelPlan): Promise<void>;
  speichereProjekt(p: Projekt): Promise<void>;
  speichereAkte(a: Akt[]): Promise<void>;
  speichereStraenge(s: Strang[]): Promise<void>;
  speichereIdeen(i: Idee[]): Promise<void>;
  /** plan/motive.md (S-10) */
  speichereMotive(m: Motiv[]): Promise<void>;
  speichereFigur(f: Figur): Promise<void>;
  speichereGruppe(g: Gruppe): Promise<void>;
  speichereOrt(o: Ort): Promise<void>;
  speichereAnmerkungen(a: Anmerkung[]): Promise<void>;
  speichereEntscheidungen(e: Entscheidungen): Promise<void>;
  /** je Analyse eine Datei .plotwerk/analysen/<kapitel>.json */
  speichereAnalysen(a: KapitelAnalyse[]): Promise<void>;
  speichereKiHinweise(h: Hinweis[]): Promise<void>;
  /** KI-Vorschläge für Figuren, Orte, Beziehungen (.plotwerk/vorschlaege.json) */
  speichereKiVorschlaege(v: KiVorschlaege): Promise<void>;

  // Werkzeuge G1–G8 (Pfade: core/projekt PFADE, Format: docs/architektur.md)
  /** G1 plan/zeitleiste.md (Zustandsarten, Figurenzustände); Zeitpunkte stehen am KapitelPlan/an der Szene */
  speichereZeitleiste(z: Zeitleiste): Promise<void>;
  /** G2 plan/faeden.md; Szenen stehen im KapitelPlan (speicherePlan) */
  speichereFadenplanung(f: Fadenplanung): Promise<void>;
  /** G3 plan/boegen.md */
  speichereBoegen(b: Figurenbogen[]): Promise<void>;
  /** G4 plan/marken.md */
  speichereMarken(m: Markenliste): Promise<void>;
  /** G5 statistik.json */
  speichereStatistik(s: Schreibstatistik): Promise<void>;
  /** G5 fassungen.json (Schnappschüsse dazu: schnappschuss(pfad, 'benannt')) */
  speichereFassungen(f: BenannteFassung[]): Promise<void>;
  /** G7 lektorat/aenderungen.json */
  speichereLektorat(a: LektoratsAenderung[]): Promise<void>;
  /** G8 recherche/recherche.json */
  speichereRecherche(r: Recherche): Promise<void>;
  /** G1 .plotwerk/zeit-vorschlaege.json */
  speichereKiZeitVorschlaege(a: KiAblage<ZeitVorschlag>): Promise<void>;
  /** G1 .plotwerk/zustand-vorschlaege.json */
  speichereKiZustandVorschlaege(a: KiAblage<ZustandVorschlag>): Promise<void>;
  /** G3 .plotwerk/stimmen.json */
  speichereKiStimmen(a: KiAblage<StimmenBeobachtung>): Promise<void>;
  /** F-17 .plotwerk/figurenfakten.json */
  speichereKiFakten(a: KiAblage<FigurFakt>): Promise<void>;
  /** G6 .plotwerk/leser.json */
  speichereKiLeser(a: KiAblage<LeserStand>): Promise<void>;
  /** G6 .plotwerk/fragen.json */
  speichereKiFragen(a: KiAblage<BuchFrage>): Promise<void>;
  /** G2 .plotwerk/strang-vorschlaege.json */
  speichereKiStrangVorschlaege(a: KiAblage<StrangVorschlag>): Promise<void>;
  /** G8 Binärdatei lesen (nur unter recherche/); null = fehlt */
  leseBinaerDatei(pfad: string): Promise<Uint8Array | null>;
  /** G8 Binärdatei atomar schreiben (nur unter recherche/, Rust fs_schreiben_binaer) */
  speichereBinaerDatei(pfad: string, daten: Uint8Array): Promise<void>;
  /** G8 Binärdatei entfernen; vorher Kopie unter .versionen/recherche/ */
  entferneBinaerDatei(pfad: string): Promise<void>;
  /** Entfernen legt vorher Schnappschüsse an und räumt Verweise in anderen Dateien auf. */
  entferneKapitel(id: Id): Promise<void>;
  kapitelArchivieren(id: Id): Promise<void>;
  kapitelWiederherstellen(id: Id): Promise<void>;
  entferneFigur(id: Id): Promise<void>;
  /** Führt `aufgeben` in `behalten` zusammen (Namen, Beziehungen, Plan, alle Verweise) und entfernt `aufgeben`. */
  figurenZusammenfuehren(behalten: Id, aufgeben: Id): Promise<void>;
  entferneOrt(id: Id): Promise<void>;
  entferneGruppe(id: Id): Promise<void>;
  /** Schnappschuss nach core/versionen (sollSchnappschuss); Rückgabe: Versionspfad oder null. */
  schnappschuss(pfad: string, anlass: SchnappschussAnlass): Promise<string | null>;
  /** Slug aus dem Titel, eindeutig gegenüber `vorhandene`. */
  neueId(titel: string, vorhandene: string[]): string;
  /** Index sofort neu berechnen (sonst 300 ms nach jeder Änderung). */
  indexNeuBerechnen(): void;
  /** Wartet, bis alle Schreibvorgänge abgeschlossen sind. */
  alleSpeichernAbwarten(): Promise<void>;
  /**
   * Sichert den Stand einer Manuskript-Datei vor der ersten Änderung dieser Sitzung (E8). Der Editor ruft
   * das bei der ersten Eingabe auf, damit der Schnappschuss nicht das erste Speichern verzögert.
   */
  sitzungSichern(pfad: string): Promise<void>;
  /**
   * Datei wurde außerhalb der App geändert (Backend-Ereignis). Nach 500 ms Ruhe werden nur die
   * geänderten Dateien übernommen; eigene Schreibvorgänge der letzten 3 s gelten als Echo.
   */
  externGeaendert(pfad: string): void;
}

export type Store = Basis &
  SchreibenSlice &
  PlanungSlice &
  NetzSlice &
  HinweiseSlice &
  ImportExportSlice &
  KiSlice &
  VorschlaegeSlice &
  ZeitSlice &
  StrukturSlice &
  FigurenbogenSlice &
  EditorwerkzeugeSlice &
  StatistikSlice &
  KiLeserSlice &
  AbgabeSlice &
  RechercheSlice;

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const createBasis: StateCreator<Store, [], [], Basis> = (set, get) => {
  /** Schreibvorgänge je Pfad in Reihenfolge */
  const ketten = new Map<string, Promise<unknown>>();
  /** Pfade, die seit dem letzten Schnappschuss geschrieben wurden */
  const geaendert = new Set<string>();
  const letzteSchnappschuesse = new Map<string, Date>();
  /** Manuskript-Dateien, deren Stand vor der ersten Änderung dieser Sitzung gesichert ist */
  const sitzungGesichert = new Set<string>();
  /** eigene Schreibvorgänge (Pfad → ms), um Watcher-Echos zu ignorieren */
  const eigene = new Map<string, number>();
  let indexTimer: ReturnType<typeof setTimeout> | null = null;
  let externTimer: ReturnType<typeof setTimeout> | null = null;
  const externePfade = new Set<string>();
  let initialisierung: Promise<void> | null = null;
  let archivAktion = false;
  let umbaut = false;
  let letzterArchivFehler: string | null = null;

  async function kapitelUmbauen(id: Id, wiederherstellen: boolean): Promise<void> {
    if (archivAktion) throw new Error(texte().schreiben.archiv.beschaeftigt);
    archivAktion = true;
    try {
      if (letzterArchivFehler && get().speichern.fehler === letzterArchivFehler) {
        set((s) => ({ speichern: { ...s.speichern, fehler: null } }));
      }
      letzterArchivFehler = null;
      await get().editorSichern();
      await alleSpeichernAbwarten();
      if (get().speichern.fehler) throw new Error(get().speichern.fehler!);
      const fs = get().fs;
      if (!fs) throw new Error(texte().state.fehler.keinProjekt);
      const aktion = wiederherstellen ? persistenz.stelleKapitelWiederHer : persistenz.archiviereKapitel;
      umbaut = true;
      const neu = await aktion(fs, id, new Date(), sprache());
      if (get().fs !== fs) return;
      for (const p of [persistenz.kapitelPfad(id), persistenz.planPfad(id), persistenz.PFADE.projekt, persistenz.PFADE.archiv,
        persistenz.analysePfad(id), persistenz.PFADE.hinweise, `archiv/${persistenz.kapitelPfad(id)}`, `archiv/${persistenz.planPfad(id)}`]) eigene.set(p, Date.now());
      geaendert.delete(persistenz.kapitelPfad(id));
      sitzungGesichert.delete(persistenz.kapitelPfad(id));
      set((s) => ({
        daten: neu,
        auswahl: wiederherstellen ? { ...s.auswahl, kapitel: id, plan: id } : {
          ...s.auswahl,
          kapitel: s.auswahl.kapitel === id ? neu.projekt.kapitel[0] : s.auswahl.kapitel,
          plan: s.auswahl.plan === id ? undefined : s.auswahl.plan,
        },
        speichern: { ...s.speichern, fehler: null, zuletzt: Date.now() },
      }));
      get().indexNeuBerechnen();
    } catch (e) {
      if (umbaut) letzterArchivFehler = fehlertext(e);
      set((s) => ({ speichern: { ...s.speichern, fehler: fehlertext(e) } }));
      throw e;
    } finally { archivAktion = false; umbaut = false; }
  }

  function inReihe<T>(pfad: string, arbeit: () => Promise<T>): Promise<T> {
    const vorher = ketten.get(pfad) ?? Promise.resolve();
    const p = vorher.catch(() => undefined).then(arbeit);
    ketten.set(pfad, p);
    void p.then(
      () => ketten.get(pfad) === p && ketten.delete(pfad),
      () => ketten.get(pfad) === p && ketten.delete(pfad),
    );
    return p;
  }

  function daten(): ProjektDaten {
    const d = get().daten;
    if (!d) throw new Error(texte().state.fehler.keinProjekt);
    return d;
  }

  function setzeDaten(aendern: (d: ProjektDaten) => ProjektDaten): ProjektDaten {
    const neu = aendern(daten());
    set({ daten: neu });
    indexAnstossen();
    return neu;
  }

  /**
   * Vor der ersten Änderung einer Manuskript-Datei in dieser Sitzung: Schnappschuss, falls der Stand noch
   * nicht gesichert ist (sonst wäre er nach einem Absturz der vorigen Sitzung nicht wiederherstellbar).
   */
  async function sitzungsSicherung(fs: ProjektDateisystem, pfad: string): Promise<void> {
    if (!pfad.startsWith(`${persistenz.PFADE.manuskript}/`) || sitzungGesichert.has(pfad)) return;
    sitzungGesichert.add(pfad);
    try {
      if (await standGesichert(fs, pfad)) return;
      await persistenz.schnappschuss(fs, pfad, new Date());
    } catch (e) {
      console.warn(`Schnappschuss vor der ersten Änderung von ${pfad} fehlgeschlagen:`, e);
    }
  }

  /** Schreibt über `schreiben(fs)` (liest dort den neuesten Stand aus get()). */
  async function persistiere(pfad: string, schreiben: (fs: ProjektDateisystem) => Promise<boolean>): Promise<void> {
    const fs = get().fs;
    if (!fs) throw new Error(texte().state.fehler.keinProjekt);
    set((s) => ({ speichern: { ...s.speichern, laufend: s.speichern.laufend + 1 } }));
    try {
      const geschrieben = await inReihe(pfad, async () => {
        await sitzungsSicherung(fs, pfad);
        return schreiben(fs);
      });
      if (geschrieben) {
        geaendert.add(pfad);
        eigene.set(pfad, Date.now());
      }
      set((s) => ({ speichern: { laufend: s.speichern.laufend - 1, fehler: null, zuletzt: Date.now() } }));
    } catch (e) {
      set((s) => ({ speichern: { ...s.speichern, laufend: s.speichern.laufend - 1, fehler: fehlertext(e) } }));
      throw e;
    }
  }

  async function entferneDatei(pfad: string): Promise<void> {
    const fs = get().fs;
    if (!fs) throw new Error(texte().state.fehler.keinProjekt);
    await inReihe(pfad, async () => {
      await persistenz.entferneMitSchnappschuss(fs, pfad);
      eigene.set(pfad, Date.now());
      geaendert.delete(pfad);
    });
  }

  const aktuell = {
    projekt: () => get().daten?.projekt,
    kapitel: (id: Id) => get().daten?.kapitel[id],
    plan: (id: Id) => get().daten?.plaene[id],
    figur: (id: Id) => get().daten?.figuren[id],
    gruppe: (id: Id) => get().daten?.gruppen[id],
    ort: (id: Id) => get().daten?.orte[id],
  };

  const speichereProjektDatei = () =>
    persistiere(persistenz.PFADE.projekt, async (fs) => {
      const p = aktuell.projekt();
      return p ? persistenz.speichereProjekt(fs, p) : false;
    });
  const speichereKapitelDatei = (id: Id) =>
    persistiere(persistenz.kapitelPfad(id), async (fs) => {
      const k = aktuell.kapitel(id);
      return k ? persistenz.speichereKapitel(fs, k) : false;
    });
  const speicherePlanDatei = (id: Id) =>
    persistiere(persistenz.planPfad(id), async (fs) => {
      const p = aktuell.plan(id);
      return p ? persistenz.speicherePlan(fs, p) : false;
    });
  const speichereFigurDatei = (id: Id) =>
    persistiere(persistenz.figurPfad(id), async (fs) => {
      const f = aktuell.figur(id);
      return f ? persistenz.speichereFigur(fs, f) : false;
    });
  const speichereGruppeDatei = (id: Id) =>
    persistiere(persistenz.gruppePfad(id), async (fs) => {
      const g = aktuell.gruppe(id);
      return g ? persistenz.speichereGruppe(fs, g) : false;
    });
  const speichereOrtDatei = (id: Id) =>
    persistiere(persistenz.ortPfad(id), async (fs) => {
      const o = aktuell.ort(id);
      return o ? persistenz.speichereOrt(fs, o) : false;
    });

  /** Optionales Feld der ProjektDaten setzen und die zugehörige Datei mit dem neuesten Stand schreiben. */
  async function speichereFeld<K extends keyof ProjektDaten>(
    feld: K,
    wert: NonNullable<ProjektDaten[K]>,
    pfad: string,
    schreiben: (fs: ProjektDateisystem, w: NonNullable<ProjektDaten[K]>) => Promise<boolean>,
  ): Promise<void> {
    setzeDaten((d) => ({ ...d, [feld]: wert }));
    await persistiere(pfad, async (fs) => {
      const aktuell = get().daten?.[feld];
      return aktuell === undefined || aktuell === null ? false : schreiben(fs, aktuell as NonNullable<ProjektDaten[K]>);
    });
  }

  function binaerFs(): ProjektDateisystem {
    const fs = get().fs;
    if (!fs) throw new Error(texte().state.fehler.keinProjekt);
    return fs;
  }

  function indexBerechnen(): void {
    if (indexTimer) {
      clearTimeout(indexTimer);
      indexTimer = null;
    }
    const { daten: d, index, backend } = get();
    if (!d) return;
    try {
      const neu = berechneIndex(d, index, sprache());
      set({ index: neu });
      backend?.indexSpeicher.speichern(neu).catch((e) => console.warn('Index nicht gespeichert:', e));
    } catch (e) {
      console.error('Index-Berechnung fehlgeschlagen:', e);
    }
  }

  // Lokale Hinweise (Titel/Erklärung) entstehen in der Oberflächensprache: beim Umschalten neu berechnen.
  // Browser-Demo: das Demo-Projekt folgt der Oberflächensprache („Hafenlichter“ bzw. „Harbour Lights“).
  useSprachStore.subscribe((jetzt, vorher) => {
    if (jetzt.sprache === vorher.sprache) return;
    const demo = get().backend?.demoFuerSprache?.(get().fs);
    if (demo) void demoWechseln(demo);
    else if (get().daten) indexBerechnen();
  });

  async function demoWechseln(fs: ProjektDateisystem): Promise<void> {
    await get()
      .editorSichern()
      .catch((e: unknown) => console.error('Sichern vor dem Sprachwechsel fehlgeschlagen:', e));
    await alleSpeichernAbwarten();
    await get().projektLaden(fs);
  }

  function indexAnstossen(): void {
    if (indexTimer) clearTimeout(indexTimer);
    indexTimer = setTimeout(indexBerechnen, 300);
  }

  function externeAenderung(pfad: string): void {
    if (pfad.startsWith(`${persistenz.PFADE.versionen}/`)) return;
    const zuletzt = eigene.get(pfad);
    if (zuletzt !== undefined && Date.now() - zuletzt < 3000) return;
    externePfade.add(pfad);
    if (externTimer) clearTimeout(externTimer);
    externTimer = setTimeout(async () => {
      externTimer = null;
      const fs = get().fs;
      const pfade = [...externePfade];
      externePfade.clear();
      if (!fs) return;
      try {
        await alleSpeichernAbwarten();
        const { daten: neu, warnungen } = await persistenz.ladeProjektMitBericht(fs, sprache());
        const alt = get().daten;
        if (!alt || get().fs !== fs) return;
        set({
          daten: persistenz.uebernehmeExterneAenderungen(alt, neu, pfade),
          warnungen,
          externeAenderung: { pfade, zeit: Date.now() },
        });
        indexAnstossen();
      } catch (e) {
        console.error('Neuladen nach externer Änderung fehlgeschlagen:', e);
      }
    }, 500);
  }

  async function alleSpeichernAbwarten(): Promise<void> {
    while (ketten.size > 0) await Promise.allSettled([...ketten.values()]);
  }

  return {
    backend: null,
    fs: null,
    daten: null,
    index: LEERER_INDEX,
    ladeStatus: 'initial',
    fehler: null,
    warnungen: [],
    speichern: { laufend: 0, fehler: null, zuletzt: null },
    externeAenderung: null,

    bereich: 'schreiben',
    setzeBereich: (b) => set({ bereich: b }),
    auswahl: {},
    waehle: (teil) => set((s) => ({ auswahl: { ...s.auswahl, ...teil } })),
    oeffne: (bereich, teil) => set((s) => ({ bereich, auswahl: teil ? { ...s.auswahl, ...teil } : s.auswahl })),
    markierung: null,
    markiere: (m) =>
      set((s) =>
        m ? { markierung: m, bereich: 'schreiben', auswahl: { ...s.auswahl, kapitel: m.kapitel } } : { markierung: null },
      ),
    fokusModus: false,
    umschalteFokus: () => set((s) => ({ fokusModus: !s.fokusModus })),
    dialog: null,
    oeffneDialog: (id, param) => set({ dialog: { id, param } }),
    schliesseDialog: () => set({ dialog: null }),

    initialisieren() {
      initialisierung ??= (async () => {
        set({ ladeStatus: 'laedt', fehler: null });
        try {
          const gewaehlt = await waehleBackend();
          // No-AI-Modus (E17): Sperre direkt am Transport, damit keine Aufgabe sie umgehen kann
          const backend: Backend = { ...gewaehlt, ki: mitKiSperre(gewaehlt.ki) };
          set({ backend });
          backend.beimBeenden(async () => {
            await get()
              .editorSichern()
              .catch((e: unknown) => console.error('Sichern beim Beenden fehlgeschlagen:', e));
            await alleSpeichernAbwarten();
            for (const pfad of [...geaendert]) await get().schnappschuss(pfad, 'beenden');
          });
          backend.aufExterneAenderung((pfad) => get().externGeaendert(pfad));
          const fs = await backend.letztesProjekt();
          if (fs) await get().projektLaden(fs);
          else set({ ladeStatus: 'start' });
        } catch (e) {
          set({ ladeStatus: 'fehler', fehler: fehlertext(e) });
        }
      })();
      return initialisierung;
    },

    async projektLaden(fs) {
      set({ ladeStatus: 'laedt', fehler: null });
      try {
        const { daten: d, warnungen } = await persistenz.ladeProjektMitBericht(fs, sprache());
        let vorher: Index | null = null;
        try {
          vorher = (await get().backend?.indexSpeicher.laden()) ?? null;
        } catch (e) {
          console.warn('Gespeicherter Index nicht lesbar:', e);
        }
        geaendert.clear();
        letzteSchnappschuesse.clear();
        sitzungGesichert.clear();
        set({
          fs,
          daten: d,
          warnungen,
          index: vorher ?? LEERER_INDEX,
          ladeStatus: 'bereit',
          auswahl: { kapitel: d.projekt.kapitel[0] },
          markierung: null,
          externeAenderung: null,
        });
        indexBerechnen();
        // Aufbewahrung der Schnappschüsse (E8) im Hintergrund
        const geschuetzt = new Set((d.fassungen ?? []).flatMap((f) => f.dateien.map((x) => x.version)));
        void aufbewahrungAnwenden(fs, new Date(), geschuetzt).catch((e: unknown) => console.warn('Alte Schnappschüsse nicht aufgeräumt:', e));
      } catch (e) {
        set({ ladeStatus: 'fehler', fehler: fehlertext(e) });
      }
    },

    async projektOeffnen() {
      const backend = get().backend;
      if (!backend) return;
      const fs = await backend.projektOeffnen();
      if (fs) await get().projektLaden(fs);
    },

    async neuesProjekt(titel) {
      const backend = get().backend;
      if (!backend) return;
      const fs = await backend.neuesProjekt(titel);
      if (fs) await get().projektLaden(fs);
    },

    async speichereKapitel(k) {
      if (umbaut) throw new Error(texte().schreiben.archiv.beschaeftigt);
      if (daten().archiv?.[k.id]) throw new Error(texte().schreiben.archiv.status);
      let neuImProjekt = false;
      setzeDaten((d) => {
        neuImProjekt = !d.projekt.kapitel.includes(k.id);
        return {
          ...d,
          projekt: neuImProjekt ? { ...d.projekt, kapitel: [...d.projekt.kapitel, k.id] } : d.projekt,
          kapitel: { ...d.kapitel, [k.id]: k },
          plaene: d.plaene[k.id] ? d.plaene : { ...d.plaene, [k.id]: persistenz.standardPlan(k) },
        };
      });
      await Promise.all([speichereKapitelDatei(k.id), neuImProjekt ? speichereProjektDatei() : undefined]);
    },

    async speicherePlan(p) {
      if (umbaut) throw new Error(texte().schreiben.archiv.beschaeftigt);
      if (daten().archiv?.[p.id]) throw new Error(texte().schreiben.archiv.status);
      let neuImProjekt = false;
      setzeDaten((d) => {
        neuImProjekt = !d.projekt.kapitel.includes(p.id);
        return {
          ...d,
          projekt: neuImProjekt ? { ...d.projekt, kapitel: [...d.projekt.kapitel, p.id] } : d.projekt,
          kapitel: d.kapitel[p.id] ? d.kapitel : { ...d.kapitel, [p.id]: { id: p.id, titel: p.titel, text: '' } },
          plaene: { ...d.plaene, [p.id]: p },
        };
      });
      await Promise.all([speicherePlanDatei(p.id), neuImProjekt ? speichereProjektDatei() : undefined]);
    },

    async speichereProjekt(p) {
      if (umbaut) throw new Error(texte().schreiben.archiv.beschaeftigt);
      setzeDaten((d) => ({ ...d, projekt: p }));
      await speichereProjektDatei();
    },

    async speichereAkte(akte) {
      setzeDaten((d) => ({ ...d, akte }));
      await persistiere(persistenz.PFADE.akte, async (fs) => persistenz.speichereAkte(fs, daten().akte));
    },

    async speichereStraenge(straenge) {
      setzeDaten((d) => ({ ...d, straenge }));
      await persistiere(persistenz.PFADE.straenge, async (fs) => persistenz.speichereStraenge(fs, daten().straenge));
    },

    async speichereIdeen(ideen) {
      setzeDaten((d) => ({ ...d, ideen }));
      await persistiere(persistenz.PFADE.ideen, async (fs) => persistenz.speichereIdeen(fs, daten().ideen));
    },

    async speichereMotive(motive) {
      setzeDaten((d) => ({ ...d, motive }));
      await persistiere(persistenz.PFADE.motive, async (fs) => persistenz.speichereMotive(fs, daten().motive ?? []));
    },

    async speichereFigur(f) {
      setzeDaten((d) => ({ ...d, figuren: { ...d.figuren, [f.id]: f } }));
      await speichereFigurDatei(f.id);
    },

    async speichereGruppe(g) {
      setzeDaten((d) => ({ ...d, gruppen: { ...d.gruppen, [g.id]: g } }));
      await speichereGruppeDatei(g.id);
    },

    async speichereOrt(o) {
      setzeDaten((d) => ({ ...d, orte: { ...d.orte, [o.id]: o } }));
      await speichereOrtDatei(o.id);
    },

    async speichereAnmerkungen(anmerkungen) {
      setzeDaten((d) => ({ ...d, anmerkungen }));
      await persistiere(persistenz.PFADE.anmerkungen, async (fs) =>
        persistenz.speichereAnmerkungen(fs, daten().anmerkungen),
      );
    },

    async speichereEntscheidungen(entscheidungen) {
      setzeDaten((d) => ({ ...d, entscheidungen }));
      await persistiere(persistenz.PFADE.entscheidungen, async (fs) =>
        persistenz.speichereEntscheidungen(fs, daten().entscheidungen),
      );
    },

    async speichereAnalysen(liste) {
      setzeDaten((d) => {
        const analysen = { ...d.analysen };
        for (const a of liste) analysen[a.kapitel] = a;
        return { ...d, analysen };
      });
      await Promise.all(
        liste.map((a) =>
          persistiere(persistenz.analysePfad(a.kapitel), async (fs) => {
            const neu = get().daten?.analysen[a.kapitel];
            return neu ? persistenz.speichereAnalyse(fs, neu) : false;
          }),
        ),
      );
    },

    async speichereKiHinweise(kiHinweise) {
      setzeDaten((d) => ({ ...d, kiHinweise }));
      await persistiere(persistenz.PFADE.hinweise, async (fs) => persistenz.speichereHinweise(fs, daten().kiHinweise));
    },

    async speichereKiVorschlaege(kiVorschlaege) {
      setzeDaten((d) => ({ ...d, kiVorschlaege }));
      await persistiere(persistenz.PFADE.vorschlaege, async (fs) => {
        const v = get().daten?.kiVorschlaege;
        return v ? persistenz.speichereKiVorschlaege(fs, v) : false;
      });
    },

    speichereZeitleiste: (z) => speichereFeld('zeitleiste', z, persistenz.PFADE.zeitleiste, persistenz.speichereZeitleiste),
    speichereFadenplanung: (f) => speichereFeld('fadenplanung', f, persistenz.PFADE.faeden, persistenz.speichereFadenplanung),
    speichereBoegen: (b) => speichereFeld('boegen', b, persistenz.PFADE.boegen, persistenz.speichereBoegen),
    speichereMarken: (m) => speichereFeld('marken', m, persistenz.PFADE.marken, persistenz.speichereMarken),
    speichereStatistik: (st) => speichereFeld('statistik', st, persistenz.PFADE.statistik, persistenz.speichereStatistik),
    speichereFassungen: (f) => speichereFeld('fassungen', f, persistenz.PFADE.fassungen, persistenz.speichereFassungen),
    speichereLektorat: (a) => speichereFeld('lektorat', a, persistenz.PFADE.lektorat, persistenz.speichereLektorat),
    speichereRecherche: (r) => speichereFeld('recherche', r, persistenz.PFADE.recherche, persistenz.speichereRecherche),
    speichereKiZeitVorschlaege: (a) =>
      speichereFeld('kiZeitVorschlaege', a, persistenz.PFADE.kiZeit, persistenz.speichereKiZeitVorschlaege),
    speichereKiZustandVorschlaege: (a) =>
      speichereFeld('kiZustandVorschlaege', a, persistenz.PFADE.kiZustand, persistenz.speichereKiZustandVorschlaege),
    speichereKiStimmen: (a) => speichereFeld('kiStimmen', a, persistenz.PFADE.kiStimmen, persistenz.speichereKiStimmen),
    speichereKiFakten: (a) => speichereFeld('kiFakten', a, persistenz.PFADE.kiFakten, persistenz.speichereKiFakten),
    speichereKiLeser: (a) => speichereFeld('kiLeser', a, persistenz.PFADE.kiLeser, persistenz.speichereKiLeser),
    speichereKiFragen: (a) => speichereFeld('kiFragen', a, persistenz.PFADE.kiFragen, persistenz.speichereKiFragen),
    speichereKiStrangVorschlaege: (a) =>
      speichereFeld('kiStrangVorschlaege', a, persistenz.PFADE.kiStraenge, persistenz.speichereKiStrangVorschlaege),

    leseBinaerDatei: (pfad) => persistenz.leseBinaer(binaerFs(), pfad, sprache()),
    async speichereBinaerDatei(pfad, inhalt) {
      const fs = binaerFs();
      const p = persistenz.pruefePfad(pfad);
      if (!persistenz.binaerPfadErlaubt(p)) throw new Error(f(texte().backend.binaerNurRecherche, { pfad }));
      set((s) => ({ speichern: { ...s.speichern, laufend: s.speichern.laufend + 1 } }));
      try {
        await inReihe(p, () => persistenz.schreibeBinaer(fs, p, inhalt, sprache()));
        eigene.set(p, Date.now());
        set((s) => ({ speichern: { laufend: s.speichern.laufend - 1, fehler: null, zuletzt: Date.now() } }));
      } catch (e) {
        set((s) => ({ speichern: { ...s.speichern, laufend: s.speichern.laufend - 1, fehler: fehlertext(e) } }));
        throw e;
      }
    },
    async entferneBinaerDatei(pfad) {
      const fs = binaerFs();
      const p = persistenz.pruefePfad(pfad);
      await inReihe(p, async () => {
        await persistenz.entferneBinaerMitSchnappschuss(fs, p, undefined, sprache());
        eigene.set(p, Date.now());
      });
    },

    async entferneKapitel(id) {
      if (umbaut) throw new Error(texte().schreiben.archiv.beschaeftigt);
      if (daten().kapitel[id]?.text.trim() || daten().archiv?.[id]) throw new Error(texte().state.fehler.kapitelMitText);
      setzeDaten((d) => {
        const kapitel = { ...d.kapitel };
        const plaene = { ...d.plaene };
        delete kapitel[id];
        delete plaene[id];
        return { ...d, projekt: { ...d.projekt, kapitel: d.projekt.kapitel.filter((k) => k !== id) }, kapitel, plaene };
      });
      set((s) => ({ auswahl: s.auswahl.kapitel === id ? { ...s.auswahl, kapitel: undefined } : s.auswahl }));
      await Promise.all([
        entferneDatei(persistenz.kapitelPfad(id)),
        entferneDatei(persistenz.planPfad(id)),
        speichereProjektDatei(),
      ]);
    },

    async entferneFigur(id) {
      const vorher = daten();
      setzeDaten((d) => {
        const figuren: Record<Id, Figur> = {};
        for (const f of Object.values(d.figuren)) {
          if (f.id === id) continue;
          figuren[f.id] = f.beziehungen.some((b) => b.zu === id)
            ? { ...f, beziehungen: f.beziehungen.filter((b) => b.zu !== id) }
            : f;
        }
        const plaene: Record<Id, KapitelPlan> = {};
        for (const p of Object.values(d.plaene))
          plaene[p.id] = p.figuren.includes(id) ? { ...p, figuren: p.figuren.filter((f) => f !== id) } : p;
        const gruppen: Record<Id, Gruppe> = {};
        for (const g of Object.values(d.gruppen))
          gruppen[g.id] = g.mitglieder.includes(id) ? { ...g, mitglieder: g.mitglieder.filter((m) => m !== id) } : g;
        return { ...d, figuren, plaene, gruppen };
      });
      set((s) => ({ auswahl: s.auswahl.figur === id ? { ...s.auswahl, figur: undefined } : s.auswahl }));
      const nachher = daten();
      await Promise.all([
        entferneDatei(persistenz.figurPfad(id)),
        ...Object.keys(nachher.figuren)
          .filter((f) => nachher.figuren[f] !== vorher.figuren[f])
          .map(speichereFigurDatei),
        ...Object.keys(nachher.plaene)
          .filter((p) => nachher.plaene[p] !== vorher.plaene[p])
          .map(speicherePlanDatei),
        ...Object.keys(nachher.gruppen)
          .filter((g) => nachher.gruppen[g] !== vorher.gruppen[g])
          .map(speichereGruppeDatei),
      ]);
    },

    async figurenZusammenfuehren(behalten, aufgeben) {
      const vorher = daten();
      if (!vorher.figuren[behalten] || !vorher.figuren[aufgeben] || behalten === aufgeben) return;
      setzeDaten((d) => zusammenfuehren(d, behalten, aufgeben));
      set((s) => ({
        auswahl: s.auswahl.figur === aufgeben ? { ...s.auswahl, figur: behalten } : s.auswahl,
        netzAuswahl: s.netzAuswahl?.typ === 'figur' && s.netzAuswahl.id === aufgeben ? { typ: 'figur', id: behalten } : s.netzAuswahl,
      }));
      const nachher = daten();
      const geaendert = <T,>(alt: Record<Id, T>, neu: Record<Id, T>) => Object.keys(neu).filter((k) => neu[k] !== alt[k]);
      // Dateien mit einem Wert für das ganze Projekt: nur, wenn sich etwas geändert hat
      const felder: { [K in keyof ProjektDaten]?: (w: NonNullable<ProjektDaten[K]>) => Promise<void> } = {
        akte: get().speichereAkte,
        straenge: get().speichereStraenge,
        ideen: get().speichereIdeen,
        anmerkungen: get().speichereAnmerkungen,
        entscheidungen: get().speichereEntscheidungen,
        kiHinweise: get().speichereKiHinweise,
        kiVorschlaege: get().speichereKiVorschlaege,
        zeitleiste: get().speichereZeitleiste,
        fadenplanung: get().speichereFadenplanung,
        boegen: get().speichereBoegen,
        recherche: get().speichereRecherche,
        kiZustandVorschlaege: get().speichereKiZustandVorschlaege,
        kiStimmen: get().speichereKiStimmen,
        kiFakten: get().speichereKiFakten,
      };
      const einzeln = (Object.keys(felder) as (keyof ProjektDaten)[])
        .filter((k) => nachher[k] !== vorher[k] && nachher[k] != null)
        .map((k) => (felder[k] as (w: unknown) => Promise<void>)(nachher[k]));
      await Promise.all([
        entferneDatei(persistenz.figurPfad(aufgeben)),
        ...geaendert(vorher.figuren, nachher.figuren).map(speichereFigurDatei),
        ...geaendert(vorher.plaene, nachher.plaene).map(speicherePlanDatei),
        ...geaendert(vorher.gruppen, nachher.gruppen).map(speichereGruppeDatei),
        ...geaendert(vorher.orte, nachher.orte).map(speichereOrtDatei),
        ...einzeln,
      ]);
    },

    async entferneOrt(id) {
      const vorher = daten();
      setzeDaten((d) => {
        const orte: Record<Id, Ort> = {};
        for (const o of Object.values(d.orte)) {
          if (o.id === id) continue;
          if (o.in === id) {
            const { in: _entfernt, ...rest } = o;
            void _entfernt;
            orte[o.id] = rest;
          } else orte[o.id] = o;
        }
        const plaene: Record<Id, KapitelPlan> = {};
        for (const p of Object.values(d.plaene))
          plaene[p.id] = p.orte.includes(id) ? { ...p, orte: p.orte.filter((o) => o !== id) } : p;
        return { ...d, orte, plaene };
      });
      set((s) => ({ auswahl: s.auswahl.ort === id ? { ...s.auswahl, ort: undefined } : s.auswahl }));
      const nachher = daten();
      await Promise.all([
        entferneDatei(persistenz.ortPfad(id)),
        ...Object.keys(nachher.orte)
          .filter((o) => nachher.orte[o] !== vorher.orte[o])
          .map(speichereOrtDatei),
        ...Object.keys(nachher.plaene)
          .filter((p) => nachher.plaene[p] !== vorher.plaene[p])
          .map(speicherePlanDatei),
      ]);
    },

    async entferneGruppe(id) {
      const vorher = daten();
      setzeDaten((d) => {
        const gruppen = { ...d.gruppen };
        delete gruppen[id];
        const figuren: Record<Id, Figur> = {};
        for (const f of Object.values(d.figuren)) figuren[f.id] = f.gruppe === id ? { ...f, gruppe: null } : f;
        const akte = d.akte.map((a) =>
          a.antagonisten.includes(id) ? { ...a, antagonisten: a.antagonisten.filter((g) => g !== id) } : a,
        );
        const straenge = d.straenge.map((s) => {
          if (s.gruppe !== id) return s;
          const { gruppe: _entfernt, ...rest } = s;
          void _entfernt;
          return rest;
        });
        return { ...d, gruppen, figuren, akte, straenge };
      });
      set((s) => ({ auswahl: s.auswahl.gruppe === id ? { ...s.auswahl, gruppe: undefined } : s.auswahl }));
      const nachher = daten();
      await Promise.all([
        entferneDatei(persistenz.gruppePfad(id)),
        ...Object.keys(nachher.figuren)
          .filter((f) => nachher.figuren[f] !== vorher.figuren[f])
          .map(speichereFigurDatei),
        nachher.akte.some((a, i) => a !== vorher.akte[i])
          ? persistiere(persistenz.PFADE.akte, async (fs) => persistenz.speichereAkte(fs, daten().akte))
          : undefined,
        nachher.straenge.some((s, i) => s !== vorher.straenge[i])
          ? persistiere(persistenz.PFADE.straenge, async (fs) => persistenz.speichereStraenge(fs, daten().straenge))
          : undefined,
      ]);
    },

    async schnappschuss(pfad, anlass) {
      const fs = get().fs;
      if (!fs) return null;
      const jetzt = new Date();
      if (!sollSchnappschuss(anlass, letzteSchnappschuesse.get(pfad) ?? null, jetzt, geaendert.has(pfad))) return null;
      const ziel = await inReihe(pfad, () => persistenz.schnappschuss(fs, pfad, jetzt));
      if (ziel) {
        letzteSchnappschuesse.set(pfad, jetzt);
        geaendert.delete(pfad);
      }
      return ziel;
    },

    neueId: (titel, vorhandene) => erzeugeId(titel, [...vorhandene, ...(get().daten?.reservierteKapitelIds ?? []), ...Object.keys(get().daten?.archiv ?? {})]),
    kapitelArchivieren: (id) => kapitelUmbauen(id, false),
    kapitelWiederherstellen: (id) => kapitelUmbauen(id, true),
    indexNeuBerechnen: indexBerechnen,
    alleSpeichernAbwarten,
    sitzungSichern(pfad) {
      const fs = get().fs;
      if (!fs || sitzungGesichert.has(pfad)) return Promise.resolve();
      return inReihe(pfad, () => sitzungsSicherung(fs, pfad));
    },
    externGeaendert: externeAenderung,
  };
};

/** Neuer, unabhängiger Store (Tests). Die App nutzt `useStore`. */
export function erstelleStore(): UseBoundStore<StoreApi<Store>> {
  return create<Store>()((...a) => ({
    ...createBasis(...a),
    ...createSchreibenSlice(...a),
    ...createPlanungSlice(...a),
    ...createNetzSlice(...a),
    ...createHinweiseSlice(...a),
    ...createImportExportSlice(...a),
    ...createKiSlice(...a),
    ...createVorschlaegeSlice(...a),
    ...createZeitSlice(...a),
    ...createStrukturSlice(...a),
    ...createFigurenbogenSlice(...a),
    ...createEditorwerkzeugeSlice(...a),
    ...createStatistikSlice(...a),
    ...createKiLeserSlice(...a),
    ...createAbgabeSlice(...a),
    ...createRechercheSlice(...a),
  }));
}

export const useStore = erstelleStore();
