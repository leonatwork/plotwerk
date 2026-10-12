/**
 * Namen und Spitznamen von Figuren: markierten Text in einen Spitznamen verwandeln, Spitznamen ergänzen,
 * Figuren zu einem Namen finden. Reine Funktionen ohne Store.
 */
import type { Figur, FigurRolle, Id, ProjektDaten } from '../model/types';

/** Führende Artikel, die die Erkennung selbst ergänzt („dem Alten“ findet auch „der Alte“ nicht, „Alte“ schon). */
const ARTIKEL = /^(der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|the|a|an)\s+/i;

/** Vergleichsform: getrimmt, klein, ohne führenden Artikel. */
export function namensVergleich(s: string): string {
  return s.trim().replace(ARTIKEL, '').trim().toLocaleLowerCase('de');
}

/**
 * Spitzname aus einer Markierung: ohne Anführungszeichen, Satzzeichen am Rand und führenden Artikel,
 * Leerraum zusammengefasst. Leer, wenn nichts Brauchbares übrig bleibt.
 */
export function spitznameAusText(text: string): string {
  const s = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[»«„“”"‚‘’'›‹([{–—-]+/u, '')
    .replace(/[»«„“”"‚‘’'›‹)\]}.,;:!?…–—-]+$/u, '')
    .trim();
  const ohne = s.replace(ARTIKEL, '').trim();
  return ohne || s;
}

/** Alle Namen einer Figur (Name, Spitznamen, Formen). */
export function namenVon(f: Pick<Figur, 'name' | 'aliase' | 'formen'>): string[] {
  return [f.name, ...f.aliase, ...(f.formen ?? [])];
}

/** Figur, die diesen Namen schon trägt (Name, Spitzname oder Form; ohne Artikel, Groß/klein egal). */
export function figurMitNamensform(daten: Pick<ProjektDaten, 'figuren'>, name: string): Figur | undefined {
  const form = namensVergleich(name);
  if (!form) return undefined;
  return Object.values(daten.figuren).find((f) => namenVon(f).some((n) => namensVergleich(n) === form));
}

/** Figur mit zusätzlichem Spitznamen; null, wenn sie ihn (oder den Namen) schon trägt oder er leer ist. */
export function mitSpitzname(f: Figur, name: string): Figur | null {
  const n = name.trim();
  if (!n || namenVon(f).some((x) => namensVergleich(x) === namensVergleich(n))) return null;
  return { ...f, aliase: [...f.aliase, n] };
}

/** Figuren für eine Suche (Name, Spitznamen, Kurzbeschreibung); Treffer am Anfang zuerst. */
export function figurenSuchen(daten: Pick<ProjektDaten, 'figuren'>, suche: string, bevorzugt: Id[] = []): Figur[] {
  const q = suche.trim().toLocaleLowerCase('de');
  const rang = (f: Figur): number => {
    if (bevorzugt.includes(f.id)) return 0;
    if (!q) return 2;
    const namen = namenVon(f).map((n) => n.toLocaleLowerCase('de'));
    if (namen.some((n) => n.startsWith(q))) return 1;
    if (namen.some((n) => n.includes(q)) || (f.kurz ?? '').toLocaleLowerCase('de').includes(q)) return 2;
    return 99;
  };
  return Object.values(daten.figuren)
    .map((f) => ({ f, r: rang(f) }))
    .filter((x) => x.r < 99)
    .sort((a, b) => a.r - b.r || a.f.name.localeCompare(b.f.name, 'de'))
    .map((x) => x.f);
}

/** Reihenfolge der Rollen in Listen: Haupt-, Neben-, Statistenrollen. */
export const ROLLEN: FigurRolle[] = ['haupt', 'neben', 'statist'];

/** Vergleich für Listen: erst nach Rolle, dann mit `name` (z. B. nach Namen). */
export function nachRolle<T extends { rolle: FigurRolle }>(name: (a: T, b: T) => number): (a: T, b: T) => number {
  return (a, b) => ROLLEN.indexOf(a.rolle) - ROLLEN.indexOf(b.rolle) || name(a, b);
}
