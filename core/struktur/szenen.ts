/**
 * Szenen innerhalb eines Kapitels (G2 Plot-Struktur). Besitzer: G2.
 *
 * Szenentrenner „* * *“ (eigene Zeile, E3) teilen den Kapiteltext in Abschnitte (core/text szenenAbschnitte).
 * Leons Plan-Daten je Szene (Titel, Ort, Figuren, Zeit, Notiz) liegen im Kapitelplan (`KapitelPlan.szenen`) und
 * werden über `index` dem Abschnitt im Text zugeordnet. Alles hier ist rein (ohne DOM, ohne Speichern).
 */
import type { Id, Szene, Tageszeit, Wochentag, Zeitpunkt } from '../model/types';
import { szenenAbschnitte, woerterZaehlen, type SzenenAbschnitt } from '../text';

/** Eine Zeile der Szenenliste: Abschnitt im Text und/oder Plan-Daten. */
export interface SzenenZeile {
  /** Position im Kapitel (0-basiert) */
  index: number;
  /** Plan-Daten; fehlt = Szene steht im Text, ist aber noch nicht geplant */
  szene?: Szene;
  /** Abschnitt im Klartext; fehlt = nur geplant (der Text hat noch keinen Abschnitt an dieser Stelle) */
  abschnitt?: SzenenAbschnitt;
  woerter: number;
  /** die ersten Wörter des Abschnitts (Vorschau, wörtlich) */
  anfang: string;
}

const ANFANG_WOERTER = 9;

/** Die ersten Wörter eines Klartexts (wörtlich, ohne Zeilenumbrüche). */
export function szenenAnfang(text: string, woerter = ANFANG_WOERTER): string {
  const t = text.replace(/\s+/g, ' ').trim();
  const teile = t.split(' ');
  return teile.length <= woerter ? t : `${teile.slice(0, woerter).join(' ')} …`;
}

/** Bereich der ersten Wörter einer Szene im Klartext (für einen Textanker „zur Szene springen“). */
export function szenenSprungBereich(abschnitt: SzenenAbschnitt, woerter = 6): { start: number; ende: number } | null {
  const text = abschnitt.text;
  const treffer = [...text.matchAll(/\S+/g)].slice(0, woerter);
  const letztes = treffer[treffer.length - 1];
  if (!treffer.length || !letztes) return null;
  const start = abschnitt.start + treffer[0]!.index;
  return { start, ende: abschnitt.start + letztes.index + letztes[0].length };
}

/**
 * Plan-Szenen sortiert, mit eindeutigem Index: doppelte oder negative Positionen rücken auf die nächste freie
 * Stelle. Ändert nichts an den IDs.
 */
export function szenenOrdnen(szenen: readonly Szene[] | undefined): Szene[] {
  const sortiert = [...(szenen ?? [])].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
  const belegt = new Set<number>();
  return sortiert.map((sz) => {
    let i = Number.isFinite(sz.index) ? Math.max(0, Math.floor(sz.index)) : 0;
    while (belegt.has(i)) i++;
    belegt.add(i);
    return i === sz.index ? sz : { ...sz, index: i };
  });
}

/**
 * Szenenliste eines Kapitels: Abschnitte im Text zusammengeführt mit den Plan-Daten (gleicher Index).
 * Ein Kapitel ohne Text hat keine Abschnitte (nur geplante Szenen).
 */
export function szenenZeilen(markdown: string | undefined, szenen: readonly Szene[] | undefined): SzenenZeile[] {
  const md = markdown ?? '';
  const abschnitte = md.trim() === '' ? [] : szenenAbschnitte(md);
  const plan = szenenOrdnen(szenen);
  const nachIndex = new Map(plan.map((sz) => [sz.index, sz]));
  const anzahl = Math.max(abschnitte.length, plan.length ? plan[plan.length - 1]!.index + 1 : 0);
  const zeilen: SzenenZeile[] = [];
  for (let i = 0; i < anzahl; i++) {
    const abschnitt = abschnitte[i];
    const szene = nachIndex.get(i);
    if (!abschnitt && !szene) continue;
    zeilen.push({
      index: i,
      szene,
      abschnitt,
      woerter: abschnitt ? woerterZaehlen(abschnitt.text) : 0,
      anfang: abschnitt ? szenenAnfang(abschnitt.text) : '',
    });
  }
  return zeilen;
}

/** Ob sich eine Szenenliste lohnt: mehr als ein Abschnitt oder irgendeine geplante Szene. */
export function hatSzenen(zeilen: readonly SzenenZeile[]): boolean {
  return zeilen.length > 1 || zeilen.some((z) => z.szene);
}

/** Stabile Szenen-ID (E1) „<kapitel>-s<n>“, die im Kapitel noch nicht vergeben ist. */
export function neueSzenenId(kapitel: Id, szenen: readonly Szene[] | undefined, index = 0): Id {
  const belegt = new Set((szenen ?? []).map((s) => s.id));
  for (let n = Math.max(1, index + 1); ; n++) {
    const id = `${kapitel}-s${n}`;
    if (!belegt.has(id)) return id;
  }
}

/** Index, an dem „+ Szene planen“ eine neue Szene anlegt: erster Abschnitt ohne Plan, sonst hinten an. */
export function naechsterSzenenIndex(zeilen: readonly SzenenZeile[]): number {
  const frei = zeilen.find((z) => !z.szene);
  if (frei) return frei.index;
  return zeilen.length ? zeilen[zeilen.length - 1]!.index + 1 : 0;
}

export type SzenenTeil = Partial<Pick<Szene, 'titel' | 'ort' | 'figuren' | 'zeit' | 'notiz'>>;

/** Leere optionale Felder entfernen (ort: '' / undefined, zeit ohne Angaben). */
function bereinigt(sz: Szene): Szene {
  const ergebnis: Szene = { ...sz };
  if (!ergebnis.ort) delete ergebnis.ort;
  if (!ergebnis.zeit || !zeitHatAngaben(ergebnis.zeit)) delete ergebnis.zeit;
  return ergebnis;
}

/**
 * Plan-Daten der Szene an `index` ändern; gibt es dort noch keine, wird sie angelegt (neue ID).
 * Gibt die neue, geordnete Szenenliste zurück.
 */
export function szeneAendern(kapitel: Id, szenen: readonly Szene[] | undefined, index: number, teil: SzenenTeil): Szene[] {
  const liste = szenenOrdnen(szenen);
  const vorhanden = liste.find((s) => s.index === index);
  if (vorhanden) return liste.map((s) => (s === vorhanden ? bereinigt({ ...s, ...teil }) : s));
  const neu: Szene = bereinigt({
    id: neueSzenenId(kapitel, liste, index),
    kapitel,
    index,
    titel: '',
    figuren: [],
    notiz: '',
    ...teil,
  });
  return szenenOrdnen([...liste, neu]);
}

/** Plan-Daten einer Szene entfernen (der Text bleibt unberührt). */
export function szeneEntfernen(szenen: readonly Szene[] | undefined, id: Id): Szene[] {
  return szenenOrdnen((szenen ?? []).filter((s) => s.id !== id));
}

/**
 * Plan-Daten einer Szene an eine andere Position legen (z. B. nachdem Leon im Text einen Trenner eingefügt hat).
 * Liegt dort schon eine geplante Szene, tauschen beide den Platz.
 */
export function szeneVerschieben(szenen: readonly Szene[] | undefined, id: Id, nachIndex: number): Szene[] {
  const liste = szenenOrdnen(szenen);
  const sz = liste.find((s) => s.id === id);
  const ziel = Math.max(0, Math.floor(nachIndex));
  if (!sz || sz.index === ziel) return liste;
  const andere = liste.find((s) => s.index === ziel);
  return szenenOrdnen(
    liste.map((s) => (s === sz ? { ...s, index: ziel } : s === andere ? { ...s, index: sz.index } : s)),
  );
}

// ---------------------------------------------------------------------------
// Zeit (Anzeige; Zeitpunkte gehören zu G1, Szenen tragen sie nur als Plan-Daten)
// ---------------------------------------------------------------------------

export const TAGESZEIT_LABEL: Record<Tageszeit, string> = {
  frueh: 'früh',
  morgens: 'morgens',
  vormittags: 'vormittags',
  mittags: 'mittags',
  nachmittags: 'nachmittags',
  abends: 'abends',
  nachts: 'nachts',
};

const WOCHENTAG_KURZ: Record<Wochentag, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
  sonntag: 'So',
};

/** Hat der Zeitpunkt irgendeine Angabe außer der Sicherheit? */
export function zeitHatAngaben(z: Zeitpunkt | undefined): boolean {
  return !!z && (z.tag !== undefined || !!z.wochentag || !!z.datum || !!z.tageszeit || !!z.uhrzeit || z.dauer !== undefined);
}

/** „Tag 8 · Mo · 23:00“, „ca. Tag 3 · abends“; leer, wenn nichts angegeben ist. */
export function zeitKurz(z: Zeitpunkt | undefined): string {
  if (!z || !zeitHatAngaben(z)) return '';
  const teile: string[] = [];
  if (z.tag !== undefined) teile.push(`Tag ${z.tag}`);
  if (z.wochentag) teile.push(WOCHENTAG_KURZ[z.wochentag]);
  if (z.datum && z.tag === undefined) teile.push(datumKurz(z.datum));
  if (z.uhrzeit) teile.push(z.uhrzeit);
  else if (z.tageszeit) teile.push(TAGESZEIT_LABEL[z.tageszeit]);
  const text = teile.join(' · ');
  return z.sicherheit === 'ungefaehr' ? `ca. ${text}` : z.sicherheit === 'unklar' ? `${text} (?)` : text;
}

function datumKurz(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : iso;
}

/** Uhrzeit „H:MM“/„HH:MM“ (24 h) prüfen und auf „HH:MM“ bringen; ungültig → null. */
export function uhrzeitNormalisieren(eingabe: string): string | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*(?:uhr)?\s*$/i.exec(eingabe);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
