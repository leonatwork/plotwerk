/** Orte: Baum, Kapitel je Ort, Schreibweisen-Varianten. Reine Funktionen. Besitzer: Planung. */
import type { Index } from '@core/index/index';
import type { Hinweis, Id, Ort, ProjektDaten, Verweis } from '@core/model/types';
import { findeVarianten, indexBereit, schreibweisenSchluessel, type Variante } from '../../state/slices/planung';

export interface OrtKnoten {
  ort: Ort;
  tiefe: number;
}

/** Orte als Baum (Unterorte unter ihrem `in`), Geschwister alphabetisch; Zyklen werden aufgelöst. */
export function ortBaum(orte: Record<Id, Ort>): OrtKnoten[] {
  const kinder = new Map<Id | null, Ort[]>();
  const alle = Object.values(orte);
  for (const o of alle) {
    const eltern = o.in && orte[o.in] && o.in !== o.id ? o.in : null;
    const l = kinder.get(eltern) ?? [];
    l.push(o);
    kinder.set(eltern, l);
  }
  for (const l of kinder.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const ergebnis: OrtKnoten[] = [];
  const besucht = new Set<Id>();
  const lauf = (eltern: Id | null, tiefe: number) => {
    for (const o of kinder.get(eltern) ?? []) {
      if (besucht.has(o.id)) continue;
      besucht.add(o.id);
      ergebnis.push({ ort: o, tiefe });
      lauf(o.id, tiefe + 1);
    }
  };
  lauf(null, 0);
  // Orte in Zyklen (a in b, b in a) landen oben
  for (const o of alle) if (!besucht.has(o.id)) {
    besucht.add(o.id);
    ergebnis.push({ ort: o, tiefe: 0 });
    lauf(o.id, 1);
  }
  return ergebnis;
}

/** IDs des Orts und aller Unterorte (für die Auswahl „liegt in“, damit keine Zyklen entstehen). */
export function nachfahren(orte: Record<Id, Ort>, id: Id): Set<Id> {
  const ergebnis = new Set<Id>([id]);
  let gewachsen = true;
  while (gewachsen) {
    gewachsen = false;
    for (const o of Object.values(orte))
      if (o.in && ergebnis.has(o.in) && !ergebnis.has(o.id)) {
        ergebnis.add(o.id);
        gewachsen = true;
      }
  }
  return ergebnis;
}

/** Kapitel, in denen der Ort vorkommt (Text, sonst – ohne Index – laut Plan). */
export function kapitelDesOrts(id: Id, daten: ProjektDaten, index: Index): Id[] {
  if (indexBereit(index)) {
    const set = new Set(index.erwaehnungen.filter((e) => e.zielTyp === 'ort' && e.ziel === id).map((e) => e.kapitel));
    return daten.projekt.kapitel.filter((k) => set.has(k));
  }
  return daten.projekt.kapitel.filter((k) => daten.plaene[k]?.orte.includes(id));
}

/** Varianten aus einem Schreibweisen-Hinweis: »…« im Titel, sonst die Zitate (das sind die Formen). */
export function variantenAusHinweis(h: Hinweis): string[] {
  const titel = [...h.titel.matchAll(/»([^«]+)«/g)].map((m) => m[1]!.trim()).filter(Boolean);
  if (new Set(titel).size >= 2) return [...new Set(titel)];
  return [...new Set(h.zitate.map((z) => z.text.trim()).filter(Boolean))];
}

/** Ort oder Figur, deren Name/Alias einer Variante entspricht (Groß/klein, Leerzeichen, Bindestrich egal). */
export function zielFuerVarianten(daten: ProjektDaten, varianten: string[]): Verweis | undefined {
  const s = new Set(varianten.map(schreibweisenSchluessel));
  const passt = (name: string, aliase: string[]) => [name, ...aliase].some((n) => s.has(schreibweisenSchluessel(n)));
  const ort = Object.values(daten.orte).find((o) => passt(o.name, o.aliase));
  if (ort) return { typ: 'ort', id: ort.id };
  const figur = Object.values(daten.figuren).find((f) => passt(f.name, f.aliase));
  return figur ? { typ: 'figur', id: figur.id } : undefined;
}

/** Schreibweisen-Varianten des Ortsnamens im Text (O-02). */
export function ortVarianten(o: Ort, texte: { kapitel: Id; text: string }[]): Variante[] {
  return findeVarianten([o.name], texte);
}
