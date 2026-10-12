/**
 * Slice „planung“ (Akte, Kapitel-Überblick, Figuren, Orte). Besitzer: Planung.
 * Persistenz ausschließlich über die speichereX-Aktionen des Stores. Reine Hilfsfunktionen sind
 * exportiert und getestet (src/features/akte/planung.test.ts).
 */
import type { StateCreator } from 'zustand';
import type { Index } from '@core/index/index';
import type {
  AbweichungsEntscheidung,
  Akt,
  Beziehung,
  Entscheidungen,
  Faden,
  Figur,
  FigurRolle,
  Id,
  Idee,
  KapitelPlan,
  KapitelStatus,
  Ort,
  ProjektDaten,
  Realitaet,
  TextAnker,
  Verweis,
} from '@core/model/types';
import type { Store } from '../store';

// ---------------------------------------------------------------------------
// Reine Logik
// ---------------------------------------------------------------------------

const aktRang = (akt: number | null | undefined): number => (akt === null || akt === undefined ? Infinity : akt);

/** Kapitel eines Akts in Buchreihenfolge (akt null = ohne Akt). */
export function kapitelImAkt(reihenfolge: Id[], plaene: Record<Id, KapitelPlan>, akt: number | null): Id[] {
  return reihenfolge.filter((id) => (plaene[id]?.akt ?? null) === akt);
}

/**
 * Neue Buchreihenfolge, wenn `id` in Akt `zielAkt` an Position `zielIndex` (unter den Kapiteln dieses
 * Akts) landet. Die übrigen Kapitel behalten ihre relative Reihenfolge.
 */
export function verschiebeKapitel(
  reihenfolge: Id[],
  plaene: Record<Id, KapitelPlan>,
  id: Id,
  zielAkt: number | null,
  zielIndex: number,
): Id[] {
  const ohne = reihenfolge.filter((k) => k !== id);
  const imZiel = ohne.filter((k) => (plaene[k]?.akt ?? null) === zielAkt);
  let pos: number;
  if (imZiel.length > 0) {
    const i = Math.max(0, Math.min(zielIndex, imZiel.length));
    pos = i < imZiel.length ? ohne.indexOf(imZiel[i]!) : ohne.indexOf(imZiel[imZiel.length - 1]!) + 1;
  } else {
    const rang = aktRang(zielAkt);
    let letzteDavor = -1;
    ohne.forEach((k, i) => {
      if (aktRang(plaene[k]?.akt) < rang) letzteDavor = i;
    });
    if (letzteDavor >= 0) pos = letzteDavor + 1;
    else {
      const ersteDanach = ohne.findIndex((k) => aktRang(plaene[k]?.akt) > rang);
      pos = ersteDanach >= 0 ? ersteDanach : ohne.length;
    }
  }
  return [...ohne.slice(0, pos), id, ...ohne.slice(pos)];
}

/** Abweichungen, die noch gelten (nach „Plan anpassen“ weicht das Kapitel nicht mehr ab). */
export function aktiveAbweichungen(plan: KapitelPlan | undefined) {
  return (plan?.abweichungen ?? []).filter((a) => a.entscheidung !== 'plan_anpassen');
}

export function istVeraltet(basisHash: string | undefined, aktuellerHash: string | undefined): boolean {
  return !!basisHash && !!aktuellerHash && basisHash !== aktuellerHash;
}

export interface KapitelZusammenfassung {
  /** bearbeitet = Leons Fassung (Vorrang), ki = Analyse, keine = noch nicht geprüft */
  quelle: 'bearbeitet' | 'ki' | 'keine';
  text: string;
  kurz: string;
  wendung: string;
  antagonisten: string;
  /** bearbeitete Fassung beruht auf einem älteren Kapiteltext */
  veraltet: boolean;
  /** KI-Analyse beruht auf einem älteren Kapiteltext */
  analyseVeraltet: boolean;
  hatAnalyse: boolean;
}

/** K-01/K-03: bearbeitete Fassung hat Vorrang, fehlende Teile kommen aus der Analyse. */
export function zusammenfassungFuer(daten: ProjektDaten, index: Pick<Index, 'textHashes'>, kapitel: Id): KapitelZusammenfassung {
  const analyse = daten.analysen[kapitel];
  const eigene = daten.entscheidungen.zusammenfassungen.find((z) => z.kapitel === kapitel);
  const hash = index.textHashes[kapitel];
  const basis = {
    antagonisten: analyse?.antagonistenBezug ?? '',
    analyseVeraltet: !!analyse && istVeraltet(analyse.textHash, hash),
    hatAnalyse: !!analyse,
  };
  if (eigene)
    return {
      ...basis,
      quelle: 'bearbeitet',
      text: eigene.text,
      kurz: eigene.kurz ?? analyse?.kurz ?? '',
      wendung: eigene.wendung ?? analyse?.wendung ?? '',
      veraltet: istVeraltet(eigene.basisHash, hash),
    };
  if (analyse)
    return { ...basis, quelle: 'ki', text: analyse.zusammenfassung, kurz: analyse.kurz, wendung: analyse.wendung, veraltet: false };
  return { ...basis, quelle: 'keine', text: '', kurz: '', wendung: '', veraltet: false };
}

/** Einzeiler eines Kapitels für „Bis hierhin passiert“ und den Kontext im Akt-Board. */
export function kurzfassung(daten: ProjektDaten, index: Pick<Index, 'textHashes'>, kapitel: Id): string {
  const z = zusammenfassungFuer(daten, index, kapitel);
  if (z.kurz) return z.kurz;
  const plan = daten.plaene[kapitel];
  if (!daten.kapitel[kapitel]?.text.trim()) return plan?.szene || erstesSatzstueck(plan?.notiz) || 'Noch leer.';
  return plan?.szene || erstesSatzstueck(plan?.notiz) || 'Noch nicht geprüft.';
}

function erstesSatzstueck(s: string | undefined): string {
  const t = (s ?? '').trim().split(/\n\s*\n/)[0] ?? '';
  const satz = t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t;
  return satz.trim();
}

export type FadenStatus = Faden['status'];

export interface FadenBisHier {
  faden: Faden;
  status: FadenStatus;
  /** Positionen in der Buchreihenfolge (0-basiert) */
  eroeffnetPos: number;
  zuletztPos: number;
  /** Kapitel seit dem letzten Aufgreifen (0 = in diesem Kapitel) */
  ruhendSeit: number;
  /** offen und seit ≥ 3 Kapiteln nicht aufgegriffen (K-02) */
  ruhend: boolean;
}

/** K-02: lose Enden bis einschließlich `kapitel`, die zuletzt eröffneten zuerst. */
export function faedenBisKapitel(
  faeden: Faden[],
  reihenfolge: Id[],
  kapitel: Id,
  entscheidungen?: Pick<Entscheidungen, 'faeden'>,
): FadenBisHier[] {
  const sel = reihenfolge.indexOf(kapitel);
  if (sel < 0) return [];
  const pos = (k: Id) => reihenfolge.indexOf(k);
  const ergebnis: FadenBisHier[] = [];
  for (const f of faeden) {
    const eroeffnetPos = pos(f.eroeffnetIn);
    if (eroeffnetPos < 0 || eroeffnetPos > sel) continue;
    let zuletztPos = eroeffnetPos;
    for (const k of [...f.aufgegriffenIn, f.zuletztIn]) {
      const p = pos(k);
      if (p > zuletztPos && p <= sel) zuletztPos = p;
    }
    const status = entscheidungen?.faeden.find((e) => e.id === f.id)?.status ?? f.status;
    const ruhendSeit = sel - zuletztPos;
    ergebnis.push({ faden: f, status, eroeffnetPos, zuletztPos, ruhendSeit, ruhend: status === 'offen' && ruhendSeit >= 3 });
  }
  return ergebnis.sort((a, b) => b.eroeffnetPos - a.eroeffnetPos || b.zuletztPos - a.zuletztPos);
}

/** Feldnamen-Reihenfolge erhalten, Schlüssel umbenennen. */
export function feldUmbenennen(plan: Record<string, string>, alt: string, neu: string): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  for (const [k, v] of Object.entries(plan)) ergebnis[k === alt ? neu : k] = v;
  return ergebnis;
}

export function eindeutigerName(wunsch: string, vorhandene: Iterable<string>): string {
  const belegt = new Set(vorhandene);
  const basis = wunsch.trim() || 'Neues Feld';
  if (!belegt.has(basis)) return basis;
  for (let n = 2; ; n++) if (!belegt.has(`${basis} ${n}`)) return `${basis} ${n}`;
}

/** Absätze einer Notiz (Leerzeile trennt). */
export function notizAbsaetze(notizen: string): string[] {
  return notizen
    .split(/\n\s*\n/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export interface FigurenBereiche {
  haupt: Figur[];
  neben: Figur[];
  /** Existenz ≠ gesichert */
  offen: Figur[];
  /** noch kein Vorkommen im Text (nur, wenn der Index berechnet ist) */
  geplant: Figur[];
}

export function indexBereit(index: Pick<Index, 'textHashes' | 'erwaehnungen'>): boolean {
  return Object.keys(index.textHashes).length > 0 || index.erwaehnungen.length > 0;
}

/** F-01: Hauptfiguren, Nebenfiguren, Realität offen, geplant (noch nicht im Text). */
export function figurenBereiche(daten: Pick<ProjektDaten, 'figuren'>, index: Pick<Index, 'textHashes' | 'erwaehnungen' | 'erstesVorkommen'>): FigurenBereiche {
  const bereit = indexBereit(index);
  const b: FigurenBereiche = { haupt: [], neben: [], offen: [], geplant: [] };
  const liste = Object.values(daten.figuren).sort((x, y) => x.name.localeCompare(y.name, 'de'));
  for (const f of liste) {
    if (f.existenz !== 'gesichert') b.offen.push(f);
    else if (bereit && !index.erstesVorkommen[f.id]) b.geplant.push(f);
    else (f.rolle === 'haupt' ? b.haupt : b.neben).push(f);
  }
  return b;
}

/** Strings, die die Variante in einem Namen zusammendrücken: „Linden-Hof“ → „lindenhof“. */
export function schreibweisenSchluessel(s: string): string {
  return s.toLocaleLowerCase('de').replace(/[\s\-‐‑–_.]+/g, '');
}

function regexEscape(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface Variante {
  text: string;
  anzahl: number;
  kapitel: Id[];
  /** erstes Vorkommen im durchsuchten Text */
  erste: { kapitel: Id; start: number; ende: number };
}

/**
 * O-02: Schreibweisen eines Namens im Text (getrennt, mit Bindestrich, zusammen; Groß/klein egal),
 * z. B. „Lindenhof“, „Linden Hof“, „Linden-Hof“. `texte` = Kapitel-ID → durchsuchter Klartext.
 */
export function findeVarianten(namen: string[], texte: { kapitel: Id; text: string }[]): Variante[] {
  const schluessel = [...new Set(namen.map(schreibweisenSchluessel).filter((s) => s.length >= 4))];
  if (schluessel.length === 0) return [];
  const muster = schluessel
    .map((s) => [...s].map(regexEscape).join('[\\s\\-‐‑]?'))
    .sort((a, b) => b.length - a.length)
    .join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${muster})(?![\\p{L}\\p{N}])`, 'giu');
  const varianten = new Map<string, Variante>();
  for (const { kapitel, text } of texte) {
    for (const m of text.matchAll(re)) {
      const t = m[0];
      const start = m.index ?? 0;
      const v = varianten.get(t);
      if (v) {
        v.anzahl++;
        if (!v.kapitel.includes(kapitel)) v.kapitel.push(kapitel);
      } else varianten.set(t, { text: t, anzahl: 1, kapitel: [kapitel], erste: { kapitel, start, ende: start + t.length } });
    }
  }
  return [...varianten.values()].sort((a, b) => b.anzahl - a.anzahl || a.text.localeCompare(b.text, 'de'));
}

const ROEMISCH: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function roemisch(n: number): string {
  let rest = Math.max(1, Math.floor(n));
  let s = '';
  for (const [wert, zeichen] of ROEMISCH)
    while (rest >= wert) {
      s += zeichen;
      rest -= wert;
    }
  return s;
}

export function leererPlan(id: Id, titel: string, akt: number | null, status: KapitelStatus = 'geplant'): KapitelPlan {
  return { id, titel, akt, status, szene: '', straenge: [], figuren: [], orte: [], notiz: '', abweichungen: [], realitaet: [] };
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export type AkteAnsicht = 'plan' | 'plantext';
export type OrteAnsicht = 'ort' | 'weg' | 'schreibweisen';

/** Zustand und Aktionen der Planung – im Store unter `planung` (eigener Namensraum, keine Kollisionen). */
export interface Planung {
  /** P-05: „Nur Plan“ oder „Plan + Text“ */
  akteAnsicht: AkteAnsicht;
  setzeAkteAnsicht(a: AkteAnsicht): void;
  /** gewählte Ideen-Karte im Akt-Board (statt Kapitel-Plan) */
  ideeAuswahl: Id | null;
  waehleIdee(id: Id | null): void;
  figurenSuche: string;
  setzeFigurenSuche(s: string): void;
  orteSuche: string;
  setzeOrteSuche(s: string): void;
  orteAnsicht: OrteAnsicht;
  setzeOrteAnsicht(a: OrteAnsicht): void;
  /** Figur für den Weg einer Figur (O-03); leer = Hauptfigur */
  wegFigur: Id;
  setzeWegFigur(id: Id): void;

  // Akte
  kapitelVerschieben(id: Id, zielAkt: number | null, zielIndex: number): Promise<void>;
  kapitelPlanen(akt: number | null, titel?: string): Promise<Id>;
  kapitelPlanAendern(id: Id, teil: Partial<Omit<KapitelPlan, 'id'>>): Promise<void>;
  schreibenBeginnen(id: Id): Promise<void>;
  /** nur für Kapitel ohne Text */
  geplantesKapitelEntfernen(id: Id): Promise<void>;
  abweichungEntscheiden(kapitel: Id, abweichung: Id, entscheidung: AbweichungsEntscheidung): Promise<void>;
  aktAendern(nummer: number, teil: Partial<Omit<Akt, 'nummer'>>): Promise<void>;
  aktHinzufuegen(): Promise<number>;
  /** nur leere Akte */
  aktEntfernen(nummer: number): Promise<void>;
  praesenzSetzen(gruppe: Id, akt: number, text: string): Promise<void>;
  ideeAnlegen(titel?: string): Promise<Id>;
  ideeAendern(id: Id, teil: Partial<Omit<Idee, 'id'>>): Promise<void>;
  ideeEntfernen(id: Id): Promise<void>;
  ideenSortieren(ids: Id[]): Promise<void>;
  /** P-06: Idee wird zum geplanten Kapitel im Akt */
  ideeEinplanen(id: Id, akt: number | null, index?: number): Promise<Id>;

  // Kapitel-Überblick
  zusammenfassungSpeichern(kapitel: Id, teil: { text: string; kurz?: string; wendung?: string }): Promise<void>;
  zusammenfassungZuruecksetzen(kapitel: Id): Promise<void>;
  /** bearbeitete Fassung passt weiterhin → Basis-Hash auf den aktuellen Text setzen */
  zusammenfassungBestaetigen(kapitel: Id): Promise<void>;
  fadenStatusSetzen(id: Id, status: FadenStatus): Promise<void>;
  realitaetHinzufuegen(kapitel: Id, text: string, stufe?: Realitaet): Promise<Id>;
  realitaetAendern(kapitel: Id, eintrag: Id, teil: { text?: string; stufe?: Realitaet }): Promise<void>;
  realitaetEntfernen(kapitel: Id, eintrag: Id): Promise<void>;
  /** Realitätsebene einer Textstelle ohne Kapitelplan-Eintrag (entscheidungen.realitaet); null entfernt */
  stelleRealitaetSetzen(anker: TextAnker, stufe: Realitaet | null): Promise<void>;

  // Figuren
  figurAnlegen(name: string, rolle?: FigurRolle): Promise<Id>;
  figurAendern(id: Id, teil: Partial<Omit<Figur, 'id'>>): Promise<void>;
  planFeldSetzen(figur: Id, feld: string, wert: string): Promise<void>;
  /** gibt den tatsächlichen (eindeutigen) Feldnamen zurück */
  planFeldHinzufuegen(figur: Id, feld: string): Promise<string>;
  planFeldUmbenennen(figur: Id, alt: string, neu: string): Promise<void>;
  planFeldEntfernen(figur: Id, feld: string): Promise<void>;
  figurNotizHinzufuegen(figur: Id, text: string): Promise<void>;
  figurNotizEntfernen(figur: Id, absatz: number): Promise<void>;
  beziehungHinzufuegen(figur: Id, b: Beziehung): Promise<void>;
  beziehungEntfernen(figur: Id, index: number): Promise<void>;

  // Orte
  ortAnlegen(name: string, inOrt?: Id): Promise<Id>;
  ortAendern(id: Id, teil: Partial<Omit<Ort, 'id'>>): Promise<void>;
  /** O-02: gültige Schreibweise festlegen; die übrigen werden Aliase des Ziels (Ort oder Figur) */
  schreibweiseFestlegen(varianten: string[], gueltig: string, ziel?: Verweis): Promise<void>;
  schreibweiseAufheben(gueltig: string): Promise<void>;
}

export interface PlanungSlice {
  planung: Planung;
}

export const createPlanungSlice: StateCreator<Store, [], [], PlanungSlice> = (set, get) => {
  const setze = (teil: Partial<Planung>) => set((s) => ({ planung: { ...s.planung, ...teil } }));

  function daten(): ProjektDaten {
    const d = get().daten;
    if (!d) throw new Error('Kein Projekt geöffnet');
    return d;
  }

  function plan(id: Id): KapitelPlan {
    const p = daten().plaene[id];
    if (!p) throw new Error(`Kein Plan für Kapitel ${id}`);
    return p;
  }

  function figur(id: Id): Figur {
    const f = daten().figuren[id];
    if (!f) throw new Error(`Figur ${id} fehlt`);
    return f;
  }

  function ort(id: Id): Ort {
    const o = daten().orte[id];
    if (!o) throw new Error(`Ort ${id} fehlt`);
    return o;
  }

  async function neuerPlanAnStelle(p: KapitelPlan, index: number): Promise<void> {
    const s = get();
    const gespeichert = s.speicherePlan(p);
    const d = daten();
    const reihenfolge = verschiebeKapitel(d.projekt.kapitel, d.plaene, p.id, p.akt, index);
    await Promise.all([gespeichert, s.speichereProjekt({ ...d.projekt, kapitel: reihenfolge })]);
  }

  function entscheidungen(aendern: (e: Entscheidungen) => Entscheidungen): Promise<void> {
    return get().speichereEntscheidungen(aendern(daten().entscheidungen));
  }

  const planung: Planung = {
    akteAnsicht: 'plantext',
    setzeAkteAnsicht: (akteAnsicht) => setze({ akteAnsicht }),
    ideeAuswahl: null,
    waehleIdee: (ideeAuswahl) => setze({ ideeAuswahl }),
    figurenSuche: '',
    setzeFigurenSuche: (figurenSuche) => setze({ figurenSuche }),
    orteSuche: '',
    setzeOrteSuche: (orteSuche) => setze({ orteSuche }),
    orteAnsicht: 'ort',
    setzeOrteAnsicht: (orteAnsicht) => setze({ orteAnsicht }),
    wegFigur: '',
    setzeWegFigur: (wegFigur) => setze({ wegFigur }),

    async kapitelVerschieben(id, zielAkt, zielIndex) {
      const s = get();
      const d = daten();
      const p = plan(id);
      const reihenfolge = verschiebeKapitel(d.projekt.kapitel, d.plaene, id, zielAkt, zielIndex);
      const aufgaben: Promise<void>[] = [];
      if (p.akt !== zielAkt) aufgaben.push(s.speicherePlan({ ...p, akt: zielAkt }));
      if (reihenfolge.some((k, i) => k !== d.projekt.kapitel[i]))
        aufgaben.push(s.speichereProjekt({ ...daten().projekt, kapitel: reihenfolge }));
      await Promise.all(aufgaben);
    },

    async kapitelPlanen(akt, titel = 'Neues Kapitel') {
      const d = daten();
      const id = get().neueId(titel, [...d.projekt.kapitel, ...Object.keys(d.kapitel), ...Object.keys(d.plaene)]);
      setze({ ideeAuswahl: null });
      get().waehle({ plan: id });
      await neuerPlanAnStelle(leererPlan(id, titel, akt), Infinity);
      return id;
    },

    async kapitelPlanAendern(id, teil) {
      const s = get();
      const alt = plan(id);
      const neu = { ...alt, ...teil, id };
      const aufgaben = [s.speicherePlan(neu)];
      const k = daten().kapitel[id];
      if (teil.titel !== undefined && k && k.titel !== teil.titel && (alt.status !== 'geplant' || k.text.trim()))
        aufgaben.push(s.speichereKapitel({ ...k, titel: teil.titel }));
      await Promise.all(aufgaben);
    },

    async schreibenBeginnen(id) {
      const s = get();
      const p = plan(id);
      const k = daten().kapitel[id] ?? { id, titel: p.titel, text: '' };
      const aufgaben = [s.speichereKapitel({ ...k, titel: p.titel || k.titel })];
      if (p.status === 'geplant') aufgaben.push(s.speicherePlan({ ...p, status: 'entwurf' }));
      s.oeffne('schreiben', { kapitel: id, plan: id });
      await Promise.all(aufgaben);
    },

    async geplantesKapitelEntfernen(id) {
      const k = daten().kapitel[id];
      if (k?.text.trim()) throw new Error('Kapitel mit Text werden hier nicht gelöscht.');
      const s = get();
      if (s.auswahl.plan === id) s.waehle({ plan: undefined });
      await s.entferneKapitel(id);
    },

    async abweichungEntscheiden(kapitel, abweichung, entscheidung) {
      const p = plan(kapitel);
      const a = p.abweichungen.find((x) => x.id === abweichung);
      if (!a) return;
      let notiz = p.notiz;
      const neu = { ...a, entscheidung, alterPlan: a.alterPlan ?? p.notiz };
      if (entscheidung === 'plan_anpassen' && a.entscheidung !== 'plan_anpassen') notiz = a.notiz;
      await get().speicherePlan({ ...p, notiz, abweichungen: p.abweichungen.map((x) => (x.id === abweichung ? neu : x)) });
    },

    async aktAendern(nummer, teil) {
      const akte = daten().akte.map((a) => (a.nummer === nummer ? { ...a, ...teil, nummer } : a));
      await get().speichereAkte(akte);
    },

    async aktHinzufuegen() {
      const akte = daten().akte;
      const nummer = akte.reduce((m, a) => Math.max(m, a.nummer), 0) + 1;
      await get().speichereAkte([...akte, { nummer, titel: `Akt ${roemisch(nummer)}`, quintessenz: '', wendepunkt: '', antagonisten: [] }]);
      return nummer;
    },

    async aktEntfernen(nummer) {
      const d = daten();
      if (Object.values(d.plaene).some((p) => p.akt === nummer)) throw new Error('Der Akt enthält noch Kapitel.');
      await get().speichereAkte(d.akte.filter((a) => a.nummer !== nummer));
    },

    async praesenzSetzen(gruppeId, akt, text) {
      const g = daten().gruppen[gruppeId];
      if (!g) return;
      const praesenz = { ...g.praesenz };
      if (text.trim()) praesenz[akt] = text.trim();
      else delete praesenz[akt];
      await get().speichereGruppe({ ...g, praesenz });
    },

    async ideeAnlegen(titel = 'Neue Idee') {
      const ideen = daten().ideen;
      const id = get().neueId(titel, ideen.map((i) => i.id));
      setze({ ideeAuswahl: id });
      await get().speichereIdeen([...ideen, { id, titel, notiz: '', straenge: [] }]);
      return id;
    },

    async ideeAendern(id, teil) {
      await get().speichereIdeen(daten().ideen.map((i) => (i.id === id ? { ...i, ...teil, id } : i)));
    },

    async ideeEntfernen(id) {
      if (get().planung.ideeAuswahl === id) setze({ ideeAuswahl: null });
      await get().speichereIdeen(daten().ideen.filter((i) => i.id !== id));
    },

    async ideenSortieren(ids) {
      const nachId = new Map(daten().ideen.map((i) => [i.id, i]));
      const sortiert = ids.map((id) => nachId.get(id)).filter((i): i is Idee => !!i);
      for (const i of daten().ideen) if (!ids.includes(i.id)) sortiert.push(i);
      await get().speichereIdeen(sortiert);
    },

    async ideeEinplanen(ideeId, akt, index = Infinity) {
      const d = daten();
      const idee = d.ideen.find((i) => i.id === ideeId);
      if (!idee) throw new Error('Idee nicht gefunden');
      const id = get().neueId(idee.titel, [...d.projekt.kapitel, ...Object.keys(d.kapitel), ...Object.keys(d.plaene)]);
      const p: KapitelPlan = { ...leererPlan(id, idee.titel, akt), notiz: idee.notiz, straenge: [...idee.straenge] };
      setze({ ideeAuswahl: null });
      get().waehle({ plan: id });
      await Promise.all([neuerPlanAnStelle(p, index), get().speichereIdeen(daten().ideen.filter((i) => i.id !== ideeId))]);
      return id;
    },

    async zusammenfassungSpeichern(kapitel, teil) {
      const basisHash = get().index.textHashes[kapitel] ?? '';
      await entscheidungen((e) => ({
        ...e,
        zusammenfassungen: [
          ...e.zusammenfassungen.filter((z) => z.kapitel !== kapitel),
          {
            kapitel,
            text: teil.text.trim(),
            ...(teil.kurz?.trim() ? { kurz: teil.kurz.trim() } : {}),
            ...(teil.wendung?.trim() ? { wendung: teil.wendung.trim() } : {}),
            basisHash,
          },
        ],
      }));
    },

    async zusammenfassungZuruecksetzen(kapitel) {
      await entscheidungen((e) => ({ ...e, zusammenfassungen: e.zusammenfassungen.filter((z) => z.kapitel !== kapitel) }));
    },

    async zusammenfassungBestaetigen(kapitel) {
      const basisHash = get().index.textHashes[kapitel] ?? '';
      await entscheidungen((e) => ({
        ...e,
        zusammenfassungen: e.zusammenfassungen.map((z) => (z.kapitel === kapitel ? { ...z, basisHash } : z)),
      }));
    },

    async fadenStatusSetzen(id, status) {
      await entscheidungen((e) => ({
        ...e,
        faeden: [...e.faeden.filter((f) => f.id !== id), ...(status === 'offen' ? [] : [{ id, status }])],
      }));
    },

    async realitaetHinzufuegen(kapitel, text, stufe = 'offen') {
      const p = plan(kapitel);
      const id = get().neueId(text.slice(0, 40) || 'stelle', p.realitaet.map((r) => r.id));
      await get().speicherePlan({ ...p, realitaet: [...p.realitaet, { id, text: text.trim(), stufe }] });
      return id;
    },

    async realitaetAendern(kapitel, eintrag, teil) {
      const p = plan(kapitel);
      await get().speicherePlan({ ...p, realitaet: p.realitaet.map((r) => (r.id === eintrag ? { ...r, ...teil } : r)) });
    },

    async realitaetEntfernen(kapitel, eintrag) {
      const p = plan(kapitel);
      await get().speicherePlan({ ...p, realitaet: p.realitaet.filter((r) => r.id !== eintrag) });
    },

    async stelleRealitaetSetzen(anker, stufe) {
      const gleich = (a: TextAnker) => a.kapitel === anker.kapitel && a.exakt === anker.exakt && a.davor === anker.davor && a.danach === anker.danach;
      await entscheidungen((e) => ({
        ...e,
        realitaet: stufe
          ? e.realitaet.some((r) => gleich(r.anker))
            ? e.realitaet.map((r) => (gleich(r.anker) ? { ...r, stufe } : r))
            : [...e.realitaet, { anker, stufe }]
          : e.realitaet.filter((r) => !gleich(r.anker)),
      }));
    },

    async figurAnlegen(name, rolle = 'neben') {
      const figuren = daten().figuren;
      const id = get().neueId(name, Object.keys(figuren));
      const f: Figur = {
        id,
        name: name.trim(),
        aliase: [],
        rolle,
        existenz: 'gesichert',
        gruppe: null,
        beziehungen: [],
        plan: { Alter: '', Beruf: '', Aussehen: '' },
        wahrheit: '',
        notizen: '',
      };
      get().waehle({ figur: id });
      await get().speichereFigur(f);
      return id;
    },

    async figurAendern(id, teil) {
      await get().speichereFigur({ ...figur(id), ...teil, id });
    },

    async planFeldSetzen(id, feld, wert) {
      const f = figur(id);
      await get().speichereFigur({ ...f, plan: { ...f.plan, [feld]: wert } });
    },

    async planFeldHinzufuegen(id, feld) {
      const f = figur(id);
      const name = eindeutigerName(feld, Object.keys(f.plan));
      await get().speichereFigur({ ...f, plan: { ...f.plan, [name]: '' } });
      return name;
    },

    async planFeldUmbenennen(id, alt, neu) {
      const f = figur(id);
      const ziel = neu.trim();
      if (!ziel || ziel === alt || !(alt in f.plan)) return;
      const name = eindeutigerName(ziel, Object.keys(f.plan).filter((k) => k !== alt));
      await get().speichereFigur({ ...f, plan: feldUmbenennen(f.plan, alt, name) });
    },

    async planFeldEntfernen(id, feld) {
      const f = figur(id);
      const neu = { ...f.plan };
      delete neu[feld];
      await get().speichereFigur({ ...f, plan: neu });
    },

    async figurNotizHinzufuegen(id, text) {
      const f = figur(id);
      const t = text.trim();
      if (!t) return;
      await get().speichereFigur({ ...f, notizen: [...notizAbsaetze(f.notizen), t].join('\n\n') });
    },

    async figurNotizEntfernen(id, absatz) {
      const f = figur(id);
      await get().speichereFigur({ ...f, notizen: notizAbsaetze(f.notizen).filter((_, i) => i !== absatz).join('\n\n') });
    },

    async beziehungHinzufuegen(id, b) {
      const f = figur(id);
      await get().speichereFigur({ ...f, beziehungen: [...f.beziehungen, b] });
    },

    async beziehungEntfernen(id, index) {
      const f = figur(id);
      await get().speichereFigur({ ...f, beziehungen: f.beziehungen.filter((_, i) => i !== index) });
    },

    async ortAnlegen(name, inOrt) {
      const orte = daten().orte;
      const id = get().neueId(name, Object.keys(orte));
      const o: Ort = { id, name: name.trim(), aliase: [], ...(inOrt ? { in: inOrt } : {}), beschreibung: '', notizen: '' };
      setze({ orteAnsicht: 'ort' });
      get().waehle({ ort: id });
      await get().speichereOrt(o);
      return id;
    },

    async ortAendern(id, teil) {
      const neu: Ort = { ...ort(id), ...teil, id };
      if ('in' in teil && !teil.in) delete neu.in;
      await get().speichereOrt(neu);
    },

    async schreibweiseFestlegen(varianten, gueltig, ziel) {
      const alle = [...new Set([gueltig, ...varianten].map((v) => v.trim()).filter(Boolean))];
      const aufgaben: Promise<void>[] = [
        entscheidungen((e) => ({
          ...e,
          schreibweisen: [
            ...e.schreibweisen.filter((s) => !s.varianten.some((v) => alle.includes(v)) && !alle.includes(s.gueltig)),
            { varianten: alle, gueltig, ...(ziel ? { ziel } : {}) },
          ],
        })),
      ];
      const d = daten();
      const aliaseNeu = (name: string, aliase: string[]) =>
        [...new Set([...aliase, ...alle, name])].filter((a) => a !== gueltig && a.trim());
      if (ziel?.typ === 'ort' && d.orte[ziel.id]) {
        const o = d.orte[ziel.id]!;
        aufgaben.push(get().speichereOrt({ ...o, name: gueltig, aliase: aliaseNeu(o.name, o.aliase) }));
      } else if (ziel?.typ === 'figur' && d.figuren[ziel.id]) {
        const f = d.figuren[ziel.id]!;
        aufgaben.push(get().speichereFigur({ ...f, name: gueltig, aliase: aliaseNeu(f.name, f.aliase) }));
      }
      await Promise.all(aufgaben);
    },

    async schreibweiseAufheben(gueltig) {
      await entscheidungen((e) => ({ ...e, schreibweisen: e.schreibweisen.filter((s) => s.gueltig !== gueltig) }));
    },
  };
  return { planung };
};
