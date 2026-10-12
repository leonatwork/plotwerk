/** Hinweise-Ansicht: Status, Filter, Gruppierung, Schreibweisen-Varianten. Reine Funktionen. */
import type { Entscheidungen, Hinweis, HinweisEntscheidung, HinweisTyp, Id, ProjektDaten, Verweis } from '@core/model/types';
import { HINWEIS_TYP_NAME } from '@core/index/hinweisTypen';
import { guillemets } from '../beziehungen/gemeinsam';

export type HinweisStatus = 'neu' | HinweisEntscheidung;

export interface HinweisFilter {
  typ: HinweisTyp | 'alle';
  kapitel: Id | 'alle';
  status: HinweisStatus | 'alle';
}

export const STANDARD_FILTER: HinweisFilter = { typ: 'alle', kapitel: 'alle', status: 'neu' };

/** Reihenfolge und Bezeichnungen wie in der Anforderung (Hinweis-Typen). */
export const HINWEIS_TYPEN: { typ: HinweisTyp; label: string; farbe: string; beschreibung: string }[] = [
  { typ: 'pruefen', label: HINWEIS_TYP_NAME.pruefen, farbe: 'var(--accent-dark)', beschreibung: 'Angaben, die sich widersprechen könnten' },
  { typ: 'schreibweise', label: HINWEIS_TYP_NAME.schreibweise, farbe: 'var(--arbeit-dark)', beschreibung: 'derselbe Name, verschieden geschrieben' },
  { typ: 'offener_faden', label: HINWEIS_TYP_NAME.offener_faden, farbe: 'var(--warm-dark)', beschreibung: 'Fragen, die der Text noch nicht beantwortet' },
  { typ: 'unbekannt', label: HINWEIS_TYP_NAME.unbekannt, farbe: 'var(--vage-dark)', beschreibung: 'Namen ohne zugeordnete Figur' },
  { typ: 'struktur', label: HINWEIS_TYP_NAME.struktur, farbe: 'var(--ink-soft)', beschreibung: 'leere Kapitel, Satzabbrüche, leere Überschriften' },
  { typ: 'zeitleiste', label: HINWEIS_TYP_NAME.zeitleiste, farbe: 'var(--organisation-dark)', beschreibung: 'Zeitpunkte, die nicht zusammenpassen, und zeitliche Verankerung' },
  { typ: 'sprache', label: HINWEIS_TYP_NAME.sprache, farbe: 'var(--ink-quiet)', beschreibung: 'Sprache und Figurenstimme – nur markiert, nie korrigiert' },
];

export const TYP_LABEL = Object.fromEntries(HINWEIS_TYPEN.map((t) => [t.typ, t.label])) as Record<HinweisTyp, string>;
export const TYP_FARBE = Object.fromEntries(HINWEIS_TYPEN.map((t) => [t.typ, t.farbe])) as Record<HinweisTyp, string>;

export const STATUS_LABEL: Record<HinweisStatus, string> = { neu: 'Neu', absicht: 'Ist Absicht', erledigt: 'Erledigt' };

/** Status mit Leons Entscheidung (entscheidungen.json hat Vorrang vor dem gespeicherten Status). */
export function hinweisStatus(h: Hinweis, e: Entscheidungen | undefined): HinweisStatus {
  const d = e?.hinweise.find((x) => x.schluessel === h.schluessel);
  return d ? d.entscheidung : h.status;
}

export function mitStatus(hinweise: Hinweis[], e: Entscheidungen | undefined): Hinweis[] {
  return hinweise.map((h) => {
    const status = hinweisStatus(h, e);
    return status === h.status ? h : { ...h, status };
  });
}

export function filtern(hinweise: Hinweis[], f: HinweisFilter): Hinweis[] {
  return hinweise.filter(
    (h) =>
      (f.typ === 'alle' || h.typ === f.typ) &&
      (f.status === 'alle' || h.status === f.status) &&
      (f.kapitel === 'alle' || h.zitate.some((z) => z.kapitel === f.kapitel)),
  );
}

/** Nach Typ gruppiert (Reihenfolge HINWEIS_TYPEN), innerhalb nach erstem Kapitel. */
export function gruppieren(daten: ProjektDaten, hinweise: Hinweis[]): { typ: HinweisTyp; hinweise: Hinweis[] }[] {
  const pos = (h: Hinweis) => Math.min(...h.zitate.map((z) => daten.projekt.kapitel.indexOf(z.kapitel)).filter((i) => i >= 0), 9999);
  return HINWEIS_TYPEN.map(({ typ }) => ({
    typ,
    hinweise: hinweise.filter((h) => h.typ === typ).sort((a, b) => pos(a) - pos(b)),
  })).filter((g) => g.hinweise.length > 0);
}

/** Zähler je Status über alle Hinweise (für den Status-Umschalter). */
export function zaehleStatus(hinweise: Hinweis[]): Record<HinweisStatus | 'alle', number> {
  const z = { neu: 0, absicht: 0, erledigt: 0, alle: hinweise.length };
  for (const h of hinweise) z[h.status]++;
  return z;
}

/** Varianten einer Schreibweise: aus »…« im Titel, sonst aus den Zitaten (ohne Dubletten). */
export function schreibweisenVarianten(h: Hinweis): string[] {
  const ausTitel = [...new Set(guillemets(h.titel))];
  if (ausTitel.length >= 2) return ausTitel;
  return [...new Set(h.zitate.map((z) => z.text.trim()).filter(Boolean))];
}

/** Name aus einem Hinweis „unbekannt“ (»Fiete« im Titel, sonst das erste Zitat). */
export function unbekannterName(h: Hinweis): string {
  return guillemets(h.titel)[0] ?? h.zitate[0]?.text.trim() ?? '';
}

/** Ziel einer Schreibweise: Ort oder Figur, deren Name/Alias einer Variante entspricht. */
export function schreibweisenZiel(daten: ProjektDaten, varianten: string[]): Verweis | undefined {
  const v = new Set(varianten.map((x) => x.toLocaleLowerCase('de')));
  const passt = (name: string, aliase: string[]) => [name, ...aliase].some((n) => v.has(n.toLocaleLowerCase('de')));
  const ort = Object.values(daten.orte).find((o) => passt(o.name, o.aliase));
  if (ort) return { typ: 'ort', id: ort.id };
  const figur = Object.values(daten.figuren).find((f) => passt(f.name, f.aliase));
  return figur ? { typ: 'figur', id: figur.id } : undefined;
}
