/**
 * F-17 Figurenfakten: Ablage der KI-Angaben (.plotwerk/figurenfakten.json), Gruppierung je Merkmal, Widersprüche
 * (gleiches Merkmal, verschiedene Werte) und Abweichungen von der Planung – lokal, ohne KI.
 * Widersprüche werden Hinweise vom Typ „pruefen“ mit Figur-Bezug (bewusst Vages filtert hinweiseBerechnen).
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { FigurFakt, Hinweis, Id, KiAblage, ProjektDaten } from '../model/types';
import { findeZitat, klartext } from '../text';

const T = texteJe(
  {
    widerspruch: '{figur}: {merkmal} – {werte}?',
    widerspruchErklaerung: 'Der Text nennt für {figur} verschiedene Angaben zu „{merkmal}“: {liste}.',
    plan: '{figur}: {merkmal} laut Planung {plan}, im Text {text}',
    planErklaerung: 'Im Planungsfeld „{feld}“ steht {plan}, der Text sagt {text} ({nr}).',
    nr: 'Kap. {n}',
    zitat: '„{text}“',
    oder: ' oder ',
  },
  {
    widerspruch: '{figur}: {merkmal} – {werte}?',
    widerspruchErklaerung: 'The text gives different values for {figur}’s “{merkmal}”: {liste}.',
    plan: '{figur}: {merkmal} planned as {plan}, in the text {text}',
    planErklaerung: 'The plan field “{feld}” says {plan}, the text says {text} ({nr}).',
    nr: 'Ch. {n}',
    zitat: '“{text}”',
    oder: ' or ',
  },
);

export function leereFakten(): KiAblage<FigurFakt> {
  return { version: 1, eintraege: [] };
}

/** Vergleichsform eines Merkmals */
export const merkmalForm = (s: string) => s.trim().toLocaleLowerCase('de');

const FUELLWOERTER = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'sein', 'seine', 'seinen', 'ihr', 'ihre', 'ihren', 'alt', 'alte', 'alter', 'alten', 'altes', 'the', 'a', 'an', 'his', 'her', 'their', 'old']);

/** Vergleichsform eines Werts: klein, ohne Satzzeichen und Füllwörter („seinem alten Saab 900“ → „saab 900“). */
export function wertForm(s: string): string {
  return s
    .toLocaleLowerCase('de')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w && !FUELLWOERTER.has(w))
    .join(' ');
}

/** Zwei Werte passen zusammen, wenn einer im anderen steckt („Saab“ ~ „alter Saab 900“). */
export function werteVertraeglich(a: string, b: string): boolean {
  const x = wertForm(a);
  const y = wertForm(b);
  if (!x || !y) return true;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Lauf in die Ablage mischen: Angaben der abgefragten Figuren werden ersetzt, verworfene bleiben verworfen und
 * kommen nicht wieder; andere Figuren bleiben unberührt.
 */
export function mischeFakten(
  ablage: KiAblage<FigurFakt> | undefined,
  figuren: Id[],
  neu: FigurFakt[],
  lauf?: KiAblage<FigurFakt>['lauf'],
): { ablage: KiAblage<FigurFakt>; neu: number } {
  const a = ablage ?? leereFakten();
  const betroffen = new Set(figuren);
  const verworfen = a.eintraege.filter((f) => betroffen.has(f.figur) && f.status === 'verworfen');
  const weg = new Set(verworfen.map((f) => f.schluessel));
  const vorher = new Set(a.eintraege.map((f) => f.schluessel));
  const frisch = neu.filter((f) => !weg.has(f.schluessel)).map((f) => ({ ...f, status: 'neu' as const }));
  return {
    ablage: { ...a, version: 1, eintraege: [...a.eintraege.filter((f) => !betroffen.has(f.figur)), ...verworfen, ...frisch], ...(lauf ? { lauf } : {}) },
    neu: frisch.filter((f) => !vorher.has(f.schluessel)).length,
  };
}

/** Ablage mit verworfener (bzw. wiederhergestellter) Angabe. */
export function setzeFaktStatus(ablage: KiAblage<FigurFakt> | undefined, schluessel: string, status: FigurFakt['status']): KiAblage<FigurFakt> {
  const a = ablage ?? leereFakten();
  return { ...a, eintraege: a.eintraege.map((f) => (f.schluessel === schluessel ? { ...f, status } : f)) };
}

/** Steht der Beleg noch wörtlich im Text? */
export function faktGueltig(daten: ProjektDaten, f: FigurFakt): boolean {
  const md = daten.kapitel[f.zitat.kapitel]?.text;
  return !!md && findeZitat(klartext(md), f.zitat.text).length > 0;
}

export interface MerkmalGruppe {
  merkmal: string;
  fakten: FigurFakt[];
  /** verschiedene, nicht verträgliche Werte */
  widerspruch: boolean;
  /** Planfeld gleichen Namens mit Wert, der zu keinem Textwert passt */
  plan?: { feld: string; wert: string; abweichend: boolean };
}

/** Gültige, nicht verworfene Angaben einer Figur je Merkmal (Buchreihenfolge), mit Widerspruch und Planabgleich. */
export function faktenDerFigur(daten: ProjektDaten, figur: Id): MerkmalGruppe[] {
  const reihe = daten.projekt.kapitel;
  const f = daten.figuren[figur];
  const liste = (daten.kiFakten?.eintraege ?? [])
    .filter((x) => x.figur === figur && x.status !== 'verworfen' && faktGueltig(daten, x))
    .sort((a, b) => reihe.indexOf(a.kapitel) - reihe.indexOf(b.kapitel));
  const gruppen = new Map<string, MerkmalGruppe>();
  for (const x of liste) {
    const k = merkmalForm(x.merkmal);
    const g = gruppen.get(k);
    if (g) g.fakten.push(x);
    else gruppen.set(k, { merkmal: x.merkmal, fakten: [x], widerspruch: false });
  }
  for (const [k, g] of gruppen) {
    g.widerspruch = g.fakten.some((a, i) => g.fakten.slice(i + 1).some((b) => !werteVertraeglich(a.wert, b.wert)));
    const feld = f ? Object.keys(f.plan).find((p) => merkmalForm(p) === k && f.plan[p]?.trim()) : undefined;
    if (f && feld) {
      const wert = f.plan[feld]!.trim();
      g.plan = { feld, wert, abweichend: g.fakten.every((x) => !werteVertraeglich(x.wert, wert)) };
    }
  }
  return [...gruppen.values()];
}

/** Widersprüche und Planabweichungen als Hinweise (Typ „pruefen“, Figur-Bezug). */
export function faktenHinweise(daten: ProjektDaten, sprache: Sprache = 'de'): Hinweis[] {
  if (!daten.kiFakten?.eintraege.length) return [];
  const t = T(sprache);
  const pos = new Map(daten.projekt.kapitel.map((id, i) => [id, i + 1]));
  const nr = (k: Id) => fmt(t.nr, { n: pos.get(k) ?? '?' });
  const q = (x: string) => fmt(t.zitat, { text: x });
  const ergebnis: Hinweis[] = [];
  const figuren = [...new Set(daten.kiFakten.eintraege.map((f) => f.figur))].filter((id) => daten.figuren[id]);
  for (const id of figuren) {
    const f = daten.figuren[id]!;
    for (const g of faktenDerFigur(daten, id)) {
      if (g.widerspruch) {
        const werte = [...new Map(g.fakten.map((x) => [wertForm(x.wert), x.wert])).values()];
        ergebnis.push({
          schluessel: `fakt:widerspruch:${id}|${merkmalForm(g.merkmal)}`,
          typ: 'pruefen',
          titel: fmt(t.widerspruch, { figur: f.name, merkmal: g.merkmal, werte: werte.map(q).join(t.oder) }),
          erklaerung: fmt(t.widerspruchErklaerung, { figur: f.name, merkmal: g.merkmal, liste: g.fakten.map((x) => `${nr(x.kapitel)} ${q(x.wert)}`).join(', ') }),
          zitate: g.fakten.map((x) => x.zitat),
          quelle: 'ki',
          plan: { figur: id },
          status: 'neu',
        });
      }
      if (g.plan?.abweichend) {
        const x = g.fakten[0]!;
        ergebnis.push({
          schluessel: `fakt:plan:${id}|${merkmalForm(g.plan.feld)}`,
          typ: 'pruefen',
          titel: fmt(t.plan, { figur: f.name, merkmal: g.merkmal, plan: q(g.plan.wert), text: q(x.wert) }),
          erklaerung: fmt(t.planErklaerung, { feld: g.plan.feld, plan: q(g.plan.wert), text: q(x.wert), nr: nr(x.kapitel) }),
          zitate: [x.zitat],
          quelle: 'ki',
          plan: { figur: id, feld: g.plan.feld },
          status: 'neu',
        });
      }
    }
  }
  return ergebnis;
}
