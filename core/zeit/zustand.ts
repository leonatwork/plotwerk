/**
 * Figurenzustände („Pauls Zustand“, G1): Zustand einer Figur je Kapitel bzw. Szene, frei erweiterbare
 * Zustandsliste in plan/zeitleiste.md. Reine Funktionen – gespeichert wird im Store (speichereZeitleiste).
 */
import type { FigurZustand, Id, ProjektDaten, TextAnker, Zeitleiste, ZustandsArt } from '../model/types';
import { leereZeitleiste } from '../projekt/lesen';
import { kapitelReihenfolge, type ZeitEinheit } from './leiste';

/** Farb-Tokens (ohne „--“), aus denen Leon für eine Zustandsart wählen kann. In hell und dunkel lesbar. */
export const ZUSTAND_FARBEN: readonly { token: string; name: string }[] = [
  { token: 'real-gesichert', name: 'Grün' },
  { token: 'strang-warm', name: 'Ocker' },
  { token: 'strang-violett', name: 'Violett' },
  { token: 'arbeit-line', name: 'Hellblau' },
  { token: 'strang-arbeit', name: 'Blau' },
  { token: 'accent', name: 'Rosa' },
  { token: 'accent-dark', name: 'Weinrot' },
  { token: 'warm-dark', name: 'Braun' },
  { token: 'organisation-dashed', name: 'Grau' },
  { token: 'ink', name: 'Tinte' },
];

/** CSS-Wert der Farbe einer Zustandsart; unbekannte Token-Namen fallen auf „ink-quiet“ zurück. */
export function zustandsFarbe(art: Pick<ZustandsArt, 'farbe'> | undefined): string {
  const t = art?.farbe?.trim() ?? '';
  return /^[a-z][a-z0-9-]*$/.test(t) ? `var(--${t})` : 'var(--ink-quiet)';
}

export function zeitleisteVon(daten: ProjektDaten): Zeitleiste {
  return daten.zeitleiste ?? leereZeitleiste();
}

/**
 * Hauptfigur für die Zustandsspur: Figur mit Rolle „haupt“, die in den meisten Kapitelplänen vorkommt
 * (bei Gleichstand nach Name); ohne Hauptfigur die häufigste Figur überhaupt.
 */
export function hauptfigur(daten: ProjektDaten): Id | undefined {
  const figuren = Object.values(daten.figuren ?? {});
  if (!figuren.length) return undefined;
  const anzahl = (id: Id) => Object.values(daten.plaene ?? {}).filter((p) => p.figuren.includes(id)).length;
  const kandidaten = figuren.some((f) => f.rolle === 'haupt') ? figuren.filter((f) => f.rolle === 'haupt') : figuren;
  return [...kandidaten].sort((a, b) => anzahl(b.id) - anzahl(a.id) || a.name.localeCompare(b.name, 'de'))[0]?.id;
}

export interface ZustandTreffer {
  zustand: FigurZustand;
  art?: ZustandsArt;
  /** Zustand gilt fürs ganze Kapitel und wird für die Szene übernommen */
  geerbt: boolean;
}

/** Zustand einer Figur in einer Einheit: zuerst der Szene, sonst des ganzen Kapitels. */
export function zustandIn(zl: Zeitleiste, figur: Id, kapitel: Id, szene?: Id): ZustandTreffer | undefined {
  const art = (z: FigurZustand) => zl.zustandsarten.find((a) => a.id === z.zustand);
  if (szene) {
    const s = zl.zustaende.find((z) => z.figur === figur && z.kapitel === kapitel && z.szene === szene);
    if (s) return { zustand: s, art: art(s), geerbt: false };
  }
  const k = zl.zustaende.find((z) => z.figur === figur && z.kapitel === kapitel && !z.szene);
  return k ? { zustand: k, art: art(k), geerbt: !!szene } : undefined;
}

export function zustandFuerEinheit(zl: Zeitleiste, figur: Id, e: Pick<ZeitEinheit, 'kapitel' | 'szene'>): ZustandTreffer | undefined {
  return zustandIn(zl, figur, e.kapitel, e.szene);
}

export interface ZustandSetzen {
  figur: Id;
  kapitel: Id;
  szene?: Id;
  /** ID einer Zustandsart; null entfernt den Eintrag */
  zustand: Id | null;
  notiz?: string;
  beleg?: TextAnker;
}

/**
 * Setzt (oder entfernt) den Zustand einer Figur in einem Kapitel bzw. einer Szene. Notiz und Beleg eines
 * vorhandenen Eintrags bleiben erhalten, solange sie nicht übergeben werden (`beleg: undefined` entfernt den Beleg).
 */
export function setzeZustand(zl: Zeitleiste, s: ZustandSetzen, neueId: (vorhandene: string[]) => Id): Zeitleiste {
  const passt = (z: FigurZustand) => z.figur === s.figur && z.kapitel === s.kapitel && (z.szene ?? '') === (s.szene ?? '');
  const alt = zl.zustaende.find(passt);
  if (s.zustand === null) return { ...zl, zustaende: zl.zustaende.filter((z) => !passt(z)) };
  const notiz = s.notiz !== undefined ? s.notiz.trim() : alt?.notiz;
  // Beleg ausdrücklich übergeben (auch undefined = entfernen), sonst bei gleichem Zustand behalten
  const beleg = 'beleg' in s ? s.beleg : alt && alt.zustand === s.zustand ? alt.beleg : undefined;
  const neu: FigurZustand = {
    id: alt?.id ?? neueId(zl.zustaende.map((z) => z.id)),
    figur: s.figur,
    kapitel: s.kapitel,
    ...(s.szene ? { szene: s.szene } : {}),
    zustand: s.zustand,
    ...(notiz ? { notiz } : {}),
    ...(beleg ? { beleg } : {}),
  };
  return alt ? { ...zl, zustaende: zl.zustaende.map((z) => (z === alt ? neu : z)) } : { ...zl, zustaende: [...zl.zustaende, neu] };
}

/** ID für einen neuen Zustandseintrag „<figur>-<kapitel>[-<szene>]“, eindeutig. */
export function zustandsId(figur: Id, kapitel: Id, szene: Id | undefined, vorhandene: string[]): Id {
  const basis = [figur, kapitel, szene].filter(Boolean).join('-');
  let id = basis;
  for (let i = 2; vorhandene.includes(id); i++) id = `${basis}-${i}`;
  return id;
}

/** Slug für eine neue Zustandsart („Kater am Morgen“ → „kater-am-morgen“), eindeutig. */
export function zustandsartId(name: string, vorhandene: string[]): Id {
  const basis =
    name
      .toLocaleLowerCase('de')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'zustand';
  let id = basis;
  for (let i = 2; vorhandene.includes(id); i++) id = `${basis}-${i}`;
  return id;
}

/** Neue Zustandsart anhängen; Farbe: die erste noch nicht benutzte. */
export function fuegeZustandsartHinzu(zl: Zeitleiste, name: string): { zeitleiste: Zeitleiste; id: Id } | null {
  const n = name.trim();
  if (!n) return null;
  const vorhanden = zl.zustandsarten.find((a) => a.name.toLocaleLowerCase('de') === n.toLocaleLowerCase('de'));
  if (vorhanden) return { zeitleiste: zl, id: vorhanden.id };
  const id = zustandsartId(n, zl.zustandsarten.map((a) => a.id));
  const benutzt = new Set(zl.zustandsarten.map((a) => a.farbe));
  const farbe = ZUSTAND_FARBEN.find((f) => !benutzt.has(f.token))?.token ?? 'ink-quiet';
  return { zeitleiste: { ...zl, zustandsarten: [...zl.zustandsarten, { id, name: n, farbe }] }, id };
}

export function aendereZustandsart(zl: Zeitleiste, id: Id, teil: Partial<Pick<ZustandsArt, 'name' | 'farbe'>>): Zeitleiste {
  return {
    ...zl,
    zustandsarten: zl.zustandsarten.map((a) =>
      a.id === id ? { ...a, ...(teil.name !== undefined && teil.name.trim() ? { name: teil.name.trim() } : {}), ...(teil.farbe ? { farbe: teil.farbe } : {}) } : a,
    ),
  };
}

/** Entfernt eine Zustandsart samt aller Einträge, die sie benutzen. */
export function entferneZustandsart(zl: Zeitleiste, id: Id): Zeitleiste {
  return { ...zl, zustandsarten: zl.zustandsarten.filter((a) => a.id !== id), zustaende: zl.zustaende.filter((z) => z.zustand !== id) };
}

export function verschiebeZustandsart(zl: Zeitleiste, id: Id, richtung: -1 | 1): Zeitleiste {
  const i = zl.zustandsarten.findIndex((a) => a.id === id);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= zl.zustandsarten.length) return zl;
  const arten = [...zl.zustandsarten];
  [arten[i], arten[j]] = [arten[j]!, arten[i]!];
  return { ...zl, zustandsarten: arten };
}

export function zustandsartBenutzt(zl: Zeitleiste, id: Id): number {
  return zl.zustaende.filter((z) => z.zustand === id).length;
}

export interface KurvenPunkt {
  kapitel: Id;
  nr: number;
  titel: string;
  /** Zustände im Kapitel (Kapitel-Eintrag und Szenen-Einträge, in Szenenreihenfolge) */
  zustaende: { szene?: Id; art?: ZustandsArt; zustand: FigurZustand }[];
}

/** Zustandskurve einer Figur in Lesereihenfolge (ein Punkt je Kapitel). */
export function zustandsKurve(daten: ProjektDaten, figur: Id): KurvenPunkt[] {
  const zl = zeitleisteVon(daten);
  return kapitelReihenfolge(daten).map((id, i) => {
    const plan = daten.plaene?.[id];
    const reihenfolge = new Map((plan?.szenen ?? []).map((s) => [s.id, s.index]));
    const eintraege = zl.zustaende
      .filter((z) => z.figur === figur && z.kapitel === id)
      .sort((a, b) => (a.szene ? (reihenfolge.get(a.szene) ?? 99) + 1 : 0) - (b.szene ? (reihenfolge.get(b.szene) ?? 99) + 1 : 0))
      .map((z) => ({ ...(z.szene ? { szene: z.szene } : {}), art: zl.zustandsarten.find((a) => a.id === z.zustand), zustand: z }));
    return { kapitel: id, nr: i + 1, titel: daten.kapitel?.[id]?.titel || plan?.titel || id, zustaende: eintraege };
  });
}

/**
 * Zustände einer Figur in einem Kapitel für die Kapitel-Ansicht (Szenen nicht aufgeteilt): Kapitel-Eintrag
 * und Szenen-Einträge in Szenenreihenfolge.
 */
export function zustaendeImKapitel(daten: ProjektDaten, figur: Id, kapitel: Id): ZustandTreffer[] {
  const zl = zeitleisteVon(daten);
  const plan = daten.plaene?.[kapitel];
  const reihenfolge = new Map((plan?.szenen ?? []).map((s) => [s.id, s.index]));
  return zl.zustaende
    .filter((z) => z.figur === figur && z.kapitel === kapitel)
    .sort((a, b) => (a.szene ? (reihenfolge.get(a.szene) ?? 99) + 1 : 0) - (b.szene ? (reihenfolge.get(b.szene) ?? 99) + 1 : 0))
    .map((z) => ({ zustand: z, art: zl.zustandsarten.find((a) => a.id === z.zustand), geerbt: false }));
}
