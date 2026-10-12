/** Gemeinsame Helfer der Editor-Werkzeuge (G4): Namen, Sprung zu einer Stelle, Markenliste. */
import type { Id, Marke, Markenliste, ProjektDaten } from '@core/model/types';
import { markenId } from '@core/stil/index';
import { ankerErzeugen } from '@core/text/index';
import { prozent as prozentText, zahl } from '../../../i18n';
import { useStore } from '../../../state/store';

export const LEERE_MARKENLISTE: Markenliste = { marken: [], ignoriert: [] };

/** Namen von Figuren, Orten, Gruppen und Motiven – zählen nie als Wiederholung oder Marke. */
export function bekannteNamen(d: ProjektDaten): string[] {
  const namen: string[] = [];
  for (const f of Object.values(d.figuren)) namen.push(f.name, ...f.aliase, ...(f.formen ?? []));
  for (const o of Object.values(d.orte)) namen.push(o.name, ...o.aliase);
  for (const g of Object.values(d.gruppen)) namen.push(g.name);
  for (const m of d.motive ?? []) namen.push(m.name, ...m.aliase);
  return namen.filter((n) => n.trim());
}

/** Namen von Figuren und Orten – fürs Zählen der Wiederholungen ignoriert. */
export function eigennamen(d: ProjektDaten): string[] {
  const namen: string[] = [];
  for (const f of Object.values(d.figuren)) namen.push(f.name, ...f.aliase, ...(f.formen ?? []));
  for (const o of Object.values(d.orte)) namen.push(o.name, ...o.aliase);
  return namen;
}

/** Springt zur Stelle [start, ende) im Klartext eines Kapitels (öffnet es bei Bedarf) und markiert sie. */
export function zeigeStelle(kapitel: Id, klartext: string, start: number, ende: number): void {
  if (ende <= start) return;
  useStore.getState().markiere({ kapitel, anker: ankerErzeugen(kapitel, klartext, start, ende) });
}

/** Marke in Leons Liste aufnehmen (gleiches Wort ignoriert → dort entfernt). */
export async function markeAufnehmen(name: string, kategorie?: string): Promise<Marke | null> {
  const s = useStore.getState();
  const liste = s.daten?.marken ?? LEERE_MARKENLISTE;
  const n = name.trim();
  if (!n) return null;
  const schon = liste.marken.find((m) => [m.name, ...m.aliase].some((x) => x.toLowerCase() === n.toLowerCase()));
  if (schon) return schon;
  const marke: Marke = { id: markenId(n, liste.marken.map((m) => m.id)), name: n, aliase: [], ...(kategorie?.trim() ? { kategorie: kategorie.trim() } : {}) };
  await s.speichereMarken({
    ...liste,
    marken: [...liste.marken, marke],
    ignoriert: liste.ignoriert.filter((x) => x.toLowerCase() !== n.toLowerCase()),
  });
  return marke;
}

/** Wort nie wieder als Marke vorschlagen. */
export async function markeIgnorieren(name: string): Promise<void> {
  const s = useStore.getState();
  const liste = s.daten?.marken ?? LEERE_MARKENLISTE;
  const n = name.trim();
  if (!n || liste.ignoriert.some((x) => x.toLowerCase() === n.toLowerCase())) return;
  await s.speichereMarken({ ...liste, ignoriert: [...liste.ignoriert, n] });
}

/** Zahl im Format der Oberflächensprache (1.234 / 1,234). */
export const zahlText = (n: number) => zahl(n);
/** Anteil 0…1 als Prozent mit einer Nachkommastelle („12,5 %“ / „12.5%“). */
export const prozent = (anteil: number) => prozentText(anteil, 1);
