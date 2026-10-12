/**
 * KI-Vorschläge für Zeitpunkte und Figurenzustände verwalten (G1): mischen, übernehmen, verwerfen.
 * Reine Funktionen ohne DOM/Tauri; gespeichert wird im Store (speicherePlan, speichereZeitleiste,
 * speichereKiZeitVorschlaege, speichereKiZustandVorschlaege). Nichts wird automatisch übernommen –
 * jede Übernahme ist eine Aktion von Leon.
 */
import type {
  Id,
  KapitelPlan,
  KiAblage,
  ProjektDaten,
  VorschlagsStatus,
  Zeitleiste,
  Zeitpunkt,
  ZeitVorschlag,
  Zitat,
  ZustandVorschlag,
} from '../model/types';
import { belegAusZitat } from './beleg';
import { bereinigeZeitpunkt, enthaeltZeit, gleicheZeit } from './zeitpunkt';
import { setzeZustand, zeitleisteVon, zustandIn, zustandsId } from './zustand';

export function zeitVorschlagSchluessel(kapitel: Id, szene?: Id): string {
  return szene ? `zeit:${kapitel}#${szene}` : `zeit:${kapitel}`;
}

export function zustandVorschlagSchluessel(figur: Id, kapitel: Id, szene?: Id): string {
  return szene ? `zustand:${figur}@${kapitel}#${szene}` : `zustand:${figur}@${kapitel}`;
}

/** Gibt es das Kapitel (und ggf. die geplante Szene) noch? */
export function einheitExistiert(daten: ProjektDaten, kapitel: Id, szene?: Id): boolean {
  if (!daten.kapitel?.[kapitel] && !daten.plaene?.[kapitel]) return false;
  return !szene || !!daten.plaene?.[kapitel]?.szenen?.some((s) => s.id === szene);
}

/** Von Leon eingetragener Zeitpunkt des Kapitels bzw. der Szene (ohne Vererbung). */
export function eigenerZeitpunkt(daten: ProjektDaten, kapitel: Id, szene?: Id): Zeitpunkt | undefined {
  const plan = daten.plaene?.[kapitel];
  if (!szene) return plan?.zeit;
  return plan?.szenen?.find((s) => s.id === szene)?.zeit;
}

/** Zeitangaben des Vorschlags (ohne Beleg/Notiz) */
function zeitTeil(z: Zeitpunkt): Partial<Zeitpunkt> {
  const { beleg: _b, notiz: _n, sicherheit: _s, ...rest } = z;
  void _b;
  void _n;
  void _s;
  return rest;
}

/** Steht alles, was der Vorschlag sagt, schon so im Plan? */
export function zeitVorschlagErfuellt(daten: ProjektDaten, v: Pick<ZeitVorschlag, 'kapitel' | 'szene' | 'zeit'>): boolean {
  return enthaeltZeit(eigenerZeitpunkt(daten, v.kapitel, v.szene), zeitTeil(v.zeit));
}

export function zustandVorschlagErfuellt(daten: ProjektDaten, v: Pick<ZustandVorschlag, 'figur' | 'kapitel' | 'szene' | 'zustand'>): boolean {
  const t = zustandIn(zeitleisteVon(daten), v.figur, v.kapitel, v.szene);
  return !!t && !t.geerbt && t.zustand.zustand === v.zustand;
}

export interface MischErgebnis<T> {
  ablage: KiAblage<T>;
  /** neu in der Ablage */
  neu: number;
  /** schon entschieden (gleicher Vorschlag wurde verworfen) */
  bereitsEntschieden: number;
  /** steht schon so im Plan */
  schonEingetragen: number;
}

type Lauf = NonNullable<KiAblage<unknown>['lauf']>;

function mische<T extends { schluessel: string; kapitel: Id; status: VorschlagsStatus }>(
  alt: KiAblage<T> | undefined,
  neue: T[],
  lauf: Lauf,
  umfang: (v: T) => boolean,
  gleich: (a: T, b: T) => boolean,
  erfuellt: (v: T) => boolean,
): MischErgebnis<T> {
  // offene Vorschläge aus dem Umfang dieses Laufs werden ersetzt
  const eintraege = (alt?.eintraege ?? []).filter((e) => !(e.status === 'neu' && umfang(e)));
  const ergebnis: MischErgebnis<T> = { ablage: { version: 1, eintraege, lauf }, neu: 0, bereitsEntschieden: 0, schonEingetragen: 0 };
  for (const v of neue) {
    const i = eintraege.findIndex((e) => e.schluessel === v.schluessel);
    const vorhanden = i >= 0 ? eintraege[i]! : undefined;
    if (vorhanden && vorhanden.status === 'neu') continue; // doppelt in derselben Antwort
    if (vorhanden && vorhanden.status === 'verworfen' && gleich(vorhanden, v)) {
      ergebnis.bereitsEntschieden++;
      continue;
    }
    if (erfuellt(v)) {
      ergebnis.schonEingetragen++;
      continue;
    }
    const eintrag = { ...v, status: 'neu' as const };
    if (vorhanden) eintraege[i] = eintrag;
    else eintraege.push(eintrag);
    ergebnis.neu++;
  }
  return ergebnis;
}

/**
 * Neue Zeit-Vorschläge in die Ablage mischen. Offene Vorschläge der Kapitel in `kapitel` (Umfang des Laufs)
 * werden ersetzt; Verworfenes kommt mit gleichem Inhalt nicht wieder; was schon im Plan steht, entfällt.
 */
export function mischeZeitVorschlaege(
  alt: KiAblage<ZeitVorschlag> | undefined,
  neue: ZeitVorschlag[],
  lauf: Lauf,
  daten: ProjektDaten,
  kapitel: Id[],
): MischErgebnis<ZeitVorschlag> {
  const umfang = new Set(kapitel);
  return mische(
    alt,
    neue,
    lauf,
    (v) => umfang.has(v.kapitel),
    (a, b) => gleicheZeit(a.zeit, b.zeit),
    (v) => zeitVorschlagErfuellt(daten, v),
  );
}

/** Neue Zustands-Vorschläge einer Figur mischen (Umfang: diese Figur). */
export function mischeZustandVorschlaege(
  alt: KiAblage<ZustandVorschlag> | undefined,
  neue: ZustandVorschlag[],
  lauf: Lauf,
  daten: ProjektDaten,
  figur: Id,
): MischErgebnis<ZustandVorschlag> {
  return mische(
    alt,
    neue,
    lauf,
    (v) => v.figur === figur,
    (a, b) => a.zustand === b.zustand,
    (v) => zustandVorschlagErfuellt(daten, v),
  );
}

export function setzeVorschlagStatus<T extends { schluessel: string; status: VorschlagsStatus }>(
  ablage: KiAblage<T>,
  schluessel: string,
  status: VorschlagsStatus,
): KiAblage<T> {
  return { ...ablage, eintraege: ablage.eintraege.map((e) => (e.schluessel === schluessel ? { ...e, status } : e)) };
}

/** Offene Zeit-Vorschläge (Status „neu“, Einheit existiert, noch nicht eingetragen) in Lesereihenfolge. */
export function offeneZeitVorschlaege(daten: ProjektDaten): ZeitVorschlag[] {
  const reihe = daten.projekt?.kapitel ?? [];
  return (daten.kiZeitVorschlaege?.eintraege ?? [])
    .filter((v) => v.status === 'neu' && einheitExistiert(daten, v.kapitel, v.szene) && !zeitVorschlagErfuellt(daten, v))
    .sort((a, b) => reihe.indexOf(a.kapitel) - reihe.indexOf(b.kapitel) || szenenIndex(daten, a) - szenenIndex(daten, b));
}

/** Offene Zustands-Vorschläge (optional nur einer Figur). Zustandsart muss es noch geben. */
export function offeneZustandVorschlaege(daten: ProjektDaten, figur?: Id): ZustandVorschlag[] {
  const reihe = daten.projekt?.kapitel ?? [];
  const arten = new Set(zeitleisteVon(daten).zustandsarten.map((a) => a.id));
  return (daten.kiZustandVorschlaege?.eintraege ?? [])
    .filter(
      (v) =>
        v.status === 'neu' &&
        (!figur || v.figur === figur) &&
        !!daten.figuren?.[v.figur] &&
        arten.has(v.zustand) &&
        einheitExistiert(daten, v.kapitel, v.szene) &&
        !zustandVorschlagErfuellt(daten, v),
    )
    .sort((a, b) => reihe.indexOf(a.kapitel) - reihe.indexOf(b.kapitel) || szenenIndex(daten, a) - szenenIndex(daten, b));
}

function szenenIndex(daten: ProjektDaten, v: { kapitel: Id; szene?: Id }): number {
  if (!v.szene) return -1;
  return daten.plaene?.[v.kapitel]?.szenen?.find((s) => s.id === v.szene)?.index ?? 999;
}

/** Erster Beleg aus dem Kapitel `kapitel` (sonst der erste überhaupt) als Textanker. */
function ankerAusBelegen(daten: ProjektDaten, kapitel: Id, belege: Zitat[]): Zeitpunkt['beleg'] {
  const sortiert = [...belege.filter((z) => z.kapitel === kapitel), ...belege.filter((z) => z.kapitel !== kapitel)];
  for (const z of sortiert) {
    const r = belegAusZitat(daten, z.kapitel, z.text);
    if ('anker' in r) return r.anker;
  }
  return undefined;
}

/**
 * Zeitpunkt nach der Übernahme: die Zeitangaben und die Sicherheit kommen aus dem Vorschlag, der Beleg aus
 * dessen erstem Zitat; Leons Notiz bleibt.
 */
export function zeitAusVorschlag(daten: ProjektDaten, v: ZeitVorschlag): Zeitpunkt {
  const alt = eigenerZeitpunkt(daten, v.kapitel, v.szene);
  const beleg = ankerAusBelegen(daten, v.kapitel, v.belege);
  return bereinigeZeitpunkt({
    ...zeitTeil(v.zeit),
    sicherheit: v.zeit.sicherheit === 'unklar' ? 'ungefaehr' : v.zeit.sicherheit,
    ...(beleg ? { beleg } : {}),
    ...(alt?.notiz ? { notiz: alt.notiz } : {}),
  } as Zeitpunkt);
}

/** Leerer Kapitelplan für ein Kapitel ohne Plan-Datei. */
export function planOderNeu(daten: ProjektDaten, kapitel: Id): KapitelPlan {
  const p = daten.plaene?.[kapitel];
  if (p) return p;
  const k = daten.kapitel?.[kapitel];
  return {
    id: kapitel,
    titel: k?.titel ?? kapitel,
    akt: null,
    status: k?.text.trim() ? 'entwurf' : 'geplant',
    szene: '',
    straenge: [],
    figuren: [],
    orte: [],
    notiz: '',
    abweichungen: [],
    realitaet: [],
  };
}

/** Plan mit neuem Zeitpunkt für das Kapitel bzw. die Szene (undefined entfernt ihn). */
export function planMitZeit(plan: KapitelPlan, szene: Id | undefined, zeit: Zeitpunkt | undefined): KapitelPlan {
  const z = zeit ? bereinigeZeitpunkt(zeit) : undefined;
  if (!szene) {
    const { zeit: _alt, ...rest } = plan;
    void _alt;
    return z ? { ...rest, zeit: z } : rest;
  }
  return {
    ...plan,
    szenen: (plan.szenen ?? []).map((s) => {
      if (s.id !== szene) return s;
      const { zeit: _alt, ...rest } = s;
      void _alt;
      return z ? { ...rest, zeit: z } : rest;
    }),
  };
}

/** Zeitleiste nach Übernahme eines Zustands-Vorschlags (Beleg = erstes Zitat). */
export function zeitleisteMitZustandVorschlag(daten: ProjektDaten, v: ZustandVorschlag): Zeitleiste {
  const zl = zeitleisteVon(daten);
  const beleg = ankerAusBelegen(daten, v.kapitel, v.belege);
  return setzeZustand(
    zl,
    { figur: v.figur, kapitel: v.kapitel, ...(v.szene ? { szene: v.szene } : {}), zustand: v.zustand, ...(beleg ? { beleg } : {}) },
    (vorhandene) => zustandsId(v.figur, v.kapitel, v.szene, vorhandene),
  );
}
