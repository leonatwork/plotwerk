/**
 * Lokale Hinweise rund um Figurennamen (Typ „figuren“, ohne KI):
 * - F-11 Spitzname, bevor der Leser ihn kennt: Die Figur wird zuerst über einen Spitznamen erkannt, ihr Name
 *   fällt erst später.
 * - F-12 Verwechselbare Namen: Namen zweier Figuren unterscheiden sich nur in einem Buchstaben oder beginnen
 *   gleich und sind gleich lang.
 * - F-13 Ruhende Figuren: Eine Figur kommt mehrere Kapitel lang nicht vor (wie ruhende Fäden, K-02).
 *
 * Schlüssel hängen an Figur und Namen bzw. Kapitel, nicht an Zitaten, damit „Ist Absicht“ Textänderungen übersteht.
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Erwaehnung, Figur, Hinweis, Id, ProjektDaten, Zitat } from '../model/types';
import { klartext } from '../text';
import { namensVergleich } from './namen';

const T = texteJe(
  {
    nr: 'Kap. {n}',
    vorher: '{alias} steht vor dem Namen {name}',
    vorherErklaerung:
      '{figur} wird in {nrAlias} zuerst als {alias} erkannt, der Name {name} fällt erst in {nrName}. Wer das Buch liest, weiß bis dahin vielleicht nicht, wer gemeint ist. Gewollt? Dann „Ist Absicht“.',
    aehnlich: 'Leicht zu verwechseln: {a} und {b}',
    aehnlichEinBuchstabe: 'Die Namen {a} ({figurA}) und {b} ({figurB}) unterscheiden sich nur in einem Buchstaben.',
    aehnlichAnfang: 'Die Namen {a} ({figurA}) und {b} ({figurB}) beginnen gleich und sind gleich lang.',
    ruht: '{figur} ruht seit {nr}',
    ruhtErklaerung: {
      one: '{figur} kommt nach {nr} ein Kapitel lang nicht mehr vor ({von}).',
      other: '{figur} kommt nach {nr} {n} Kapitel lang nicht mehr vor ({von}–{bis}).',
    },
    zitat: '»{text}«',
  },
  {
    nr: 'Ch. {n}',
    vorher: '{alias} appears before the name {name}',
    vorherErklaerung:
      '{figur} is first recognised as {alias} in {nrAlias}; the name {name} only appears in {nrName}. Readers may not know who is meant until then. Intended? Then “Intentional”.',
    aehnlich: 'Easy to confuse: {a} and {b}',
    aehnlichEinBuchstabe: 'The names {a} ({figurA}) and {b} ({figurB}) differ in only one letter.',
    aehnlichAnfang: 'The names {a} ({figurA}) and {b} ({figurB}) start the same and have the same length.',
    ruht: '{figur} has been absent since {nr}',
    ruhtErklaerung: {
      one: 'After {nr}, {figur} does not appear for one chapter ({von}).',
      other: 'After {nr}, {figur} does not appear for {n} chapters ({von}–{bis}).',
    },
    zitat: '“{text}”',
  },
);

/** Standard-Schwellen für ruhende Figuren (Kapitel ohne Vorkommen); Statisten nie. */
export const RUHE_SCHWELLE = { haupt: 3, neben: 6 } as const;

/** Schwelle einer Figur: eigene Angabe (null = nie melden), sonst nach Rolle. */
export function ruheSchwelle(f: Figur): number | null {
  if (f.ruheSchwelle !== undefined) return f.ruheSchwelle;
  return f.rolle === 'haupt' ? RUHE_SCHWELLE.haupt : f.rolle === 'neben' ? RUHE_SCHWELLE.neben : null;
}

/** Der Satz um eine Stelle, wörtlich (höchstens ~160 Zeichen, sonst Wörter um die Stelle). */
export function satzUm(text: string, start: number, ende: number): string {
  let a = start;
  while (a > 0 && !/[.!?…\n]/u.test(text[a - 1]!)) a--;
  let b = ende;
  while (b < text.length && !/[.!?…\n]/u.test(text[b]!)) b++;
  if (b < text.length && text[b] !== '\n') b++;
  // schließende Anführungszeichen gehören zum Satz
  while (b < text.length && /[«»“”"’']/u.test(text[b]!)) b++;
  let satz = text.slice(a, b).trim();
  if (satz.length > 160) {
    const vor = text.slice(Math.max(a, start - 60), start).replace(/^\S*\s/u, '');
    const nach = text.slice(ende, Math.min(b, ende + 60)).replace(/\s\S*$/u, '');
    satz = `${vor}${text.slice(start, ende)}${nach}`.trim();
  }
  return satz;
}

function reihe(daten: ProjektDaten): Id[] {
  const r = [...(daten.projekt?.kapitel ?? [])];
  for (const id of Object.keys(daten.kapitel ?? {})) if (!r.includes(id)) r.push(id);
  return r;
}

/** Ist der Treffer der Name der Figur (inkl. Formen und Genitiv) – und kein Spitzname? */
function istName(f: Figur, treffer: string): boolean {
  const t = namensVergleich(treffer);
  return [f.name, ...(f.formen ?? [])].some((n) => {
    const v = namensVergleich(n);
    return t === v || t === `${v}s` || t === `${v}’s` || t === `${v}'s` || t === `${v}’` || t === `${v}'`;
  });
}

/** Levenshtein-Abstand, früh abgebrochen ab 2. */
function abstandHoechstensEins(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let fehler = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++fehler > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return fehler + (a.length - i) + (b.length - j) <= 1;
}

/** Wörter eines Namens, die als Rufname taugen (≥ 4 Buchstaben, groß geschrieben). */
function namensWoerter(f: Figur): string[] {
  const woerter = [f.name, ...f.aliase].flatMap((n) => n.split(/\s+/u)).filter((w) => w.length >= 4 && /^\p{Lu}/u.test(w));
  return [...new Set(woerter)];
}

export function figurenHinweise(daten: ProjektDaten, erwaehnungen: Erwaehnung[], sprache: Sprache = 'de'): Hinweis[] {
  const t = T(sprache);
  const kapitel = reihe(daten);
  const pos = new Map(kapitel.map((id, i) => [id, i]));
  const nr = (id: Id) => fmt(t.nr, { n: (pos.get(id) ?? 0) + 1 });
  const zitatVon = (e: Erwaehnung): Zitat => ({ kapitel: e.kapitel, text: satzUm(klartext(daten.kapitel[e.kapitel]?.text ?? ''), e.start, e.ende) });
  const q = (x: string) => fmt(t.zitat, { text: x });
  const nachFigur = new Map<Id, Erwaehnung[]>();
  for (const e of erwaehnungen) {
    if (e.zielTyp !== 'figur') continue;
    const l = nachFigur.get(e.ziel);
    if (l) l.push(e);
    else nachFigur.set(e.ziel, [e]);
  }
  const hinweis = (schluessel: string, titel: string, erklaerung: string, zitate: Zitat[]): Hinweis => ({
    schluessel,
    typ: 'figuren',
    titel,
    erklaerung,
    zitate,
    quelle: 'lokal',
    status: 'neu',
  });
  const ergebnis: Hinweis[] = [];
  const figuren = Object.values(daten.figuren).sort((a, b) => a.name.localeCompare(b.name, 'de'));

  // F-11: Spitzname vor dem Namen
  for (const f of figuren) {
    if (f.existenz === 'bewusst_vage' || f.aliase.length === 0) continue;
    const liste = (nachFigur.get(f.id) ?? []).filter((e) => e.quelle === 'exakt');
    const ersterName = liste.find((e) => istName(f, e.treffer));
    const ersterAlias = liste.find((e) => !istName(f, e.treffer));
    if (!ersterName || !ersterAlias) continue;
    const vorher =
      (pos.get(ersterAlias.kapitel) ?? 0) < (pos.get(ersterName.kapitel) ?? 0) ||
      (ersterAlias.kapitel === ersterName.kapitel && ersterAlias.start < ersterName.start);
    if (!vorher) continue;
    const alias = ersterAlias.treffer;
    ergebnis.push(
      hinweis(
        `figuren:vorher:${f.id}|${namensVergleich(alias)}`,
        fmt(t.vorher, { alias: q(alias), name: q(f.name) }),
        fmt(t.vorherErklaerung, { figur: f.name, alias: q(alias), name: q(f.name), nrAlias: nr(ersterAlias.kapitel), nrName: nr(ersterName.kapitel) }),
        [zitatVon(ersterAlias), zitatVon(ersterName)],
      ),
    );
  }

  // F-12: verwechselbare Namen (beide Figuren im Text, keine Statisten)
  const imText = figuren.filter((f) => nachFigur.has(f.id));
  for (let i = 0; i < imText.length; i++)
    for (let j = i + 1; j < imText.length; j++) {
      const a = imText[i]!;
      const b = imText[j]!;
      let gefunden: { wa: string; wb: string; art: 'eins' | 'anfang' } | null = null;
      for (const wa of namensWoerter(a)) {
        for (const wb of namensWoerter(b)) {
          const x = wa.toLocaleLowerCase('de');
          const y = wb.toLocaleLowerCase('de');
          if (x === y) continue;
          if (abstandHoechstensEins(x, y)) gefunden = { wa, wb, art: 'eins' };
          else if (x.length === y.length && x.slice(0, 3) === y.slice(0, 3)) gefunden = { wa, wb, art: 'anfang' };
          if (gefunden) break;
        }
        if (gefunden) break;
      }
      if (!gefunden) continue;
      const ea = nachFigur.get(a.id)![0]!;
      const eb = nachFigur.get(b.id)![0]!;
      const [x, y] = [gefunden.wa, gefunden.wb].sort((m, n) => m.localeCompare(n, 'de'));
      ergebnis.push(
        hinweis(
          `figuren:aehnlich:${[a.id, b.id].sort().join('|')}|${x}|${y}`,
          fmt(t.aehnlich, { a: q(gefunden.wa), b: q(gefunden.wb) }),
          fmt(gefunden.art === 'eins' ? t.aehnlichEinBuchstabe : t.aehnlichAnfang, { a: q(gefunden.wa), b: q(gefunden.wb), figurA: a.name, figurB: b.name }),
          [zitatVon(ea), zitatVon(eb)],
        ),
      );
    }

  // F-13: ruhende Figuren
  for (const f of figuren) {
    for (const s of ruhendeStrecken(daten, erwaehnungen, f)) {
      const letzte = (nachFigur.get(f.id) ?? []).filter((e) => e.kapitel === s.nach).pop();
      ergebnis.push(
        hinweis(
          `figuren:ruht:${f.id}@${s.nach}`,
          fmt(t.ruht, { figur: f.name, nr: nr(s.nach) }),
          fmt(t.ruhtErklaerung, { figur: f.name, nr: nr(s.nach), n: s.kapitel.length, von: nr(s.kapitel[0]!), bis: nr(s.kapitel[s.kapitel.length - 1]!) }),
          letzte ? [zitatVon(letzte)] : [],
        ),
      );
    }
  }
  return ergebnis;
}

export interface RuhendeStrecke {
  /** letztes Kapitel mit der Figur vor der Strecke */
  nach: Id;
  /** Kapitel (mit Text) ohne die Figur */
  kapitel: Id[];
}

/**
 * Strecken von mindestens `ruheSchwelle(f)` Kapiteln mit Text, in denen die Figur weder im Text vorkommt noch im
 * Kapitelplan steht – zwischen zwei Vorkommen oder nach dem letzten (nur, solange danach noch Text kommt).
 */
export function ruhendeStrecken(daten: ProjektDaten, erwaehnungen: Erwaehnung[], f: Figur): RuhendeStrecke[] {
  const schwelle = ruheSchwelle(f);
  if (schwelle === null || schwelle < 1) return [];
  const mitText = reihe(daten).filter((id) => daten.kapitel[id]?.text.trim());
  const da = new Set(erwaehnungen.filter((e) => e.zielTyp === 'figur' && e.ziel === f.id).map((e) => e.kapitel));
  for (const p of Object.values(daten.plaene ?? {})) if (p.figuren.includes(f.id)) da.add(p.id);
  const strecken: RuhendeStrecke[] = [];
  let letzte: Id | null = null;
  let luecke: Id[] = [];
  for (const id of mitText) {
    if (da.has(id)) {
      if (letzte && luecke.length >= schwelle) strecken.push({ nach: letzte, kapitel: luecke });
      letzte = id;
      luecke = [];
    } else if (letzte) luecke.push(id);
  }
  if (letzte && luecke.length >= schwelle) strecken.push({ nach: letzte, kapitel: luecke });
  return strecken;
}
