/**
 * G5 Benannte Fassungen und Fassungsvergleich – reine Logik. Besitzer: G5.
 * Eine benannte Fassung ist eine Liste von Schnappschüssen unter .versionen/ (fassungen.json); die Schnappschüsse
 * entstehen über store.schnappschuss(pfad, 'benannt') und sind von der Aufbewahrung ausgenommen.
 */
import type { BenannteFassung, Id, ProjektDaten } from '../model/types';
import { idAusPfad, kapitelPfad, parseKapitel, PFADE } from '../projekt/lesen';
import type { ProjektLeser } from '../projekt/fs';
import { klartext, wortzahl } from '../text';
import { wortDiff, type DiffTeil } from '../versionen';

/** Kapitel-ID aus „manuskript/<id>.md“; null für andere Pfade. */
export function kapitelAusPfad(pfad: string): Id | null {
  return pfad.startsWith(`${PFADE.manuskript}/`) && pfad.endsWith('.md') ? idAusPfad(pfad) : null;
}

/** Kapitel-ID aus einem Schnappschuss-Pfad „.versionen/manuskript/<id>.md/<zeit>.md“; null für andere. */
export function kapitelAusVersionsPfad(versionsPfad: string): Id | null {
  const m = /^\.versionen\/(.+\.md)\/[^/]+\.md$/.exec(versionsPfad);
  return m ? kapitelAusPfad(m[1]!) : null;
}

/** Kapitel einer Fassung in ihrer gespeicherten Reihenfolge. */
export function fassungsKapitel(f: BenannteFassung): Id[] {
  return f.dateien.map((d) => kapitelAusPfad(d.pfad)).filter((id): id is Id => id !== null);
}

/** Schnappschuss eines Kapitels in einer Fassung (undefined = Kapitel gehört nicht zur Fassung). */
export function fassungsVersion(f: BenannteFassung, kapitel: Id): string | undefined {
  return f.dateien.find((d) => d.pfad === kapitelPfad(kapitel))?.version;
}

/** Neueste zuerst. */
export function fassungenSortiert(liste: readonly BenannteFassung[]): BenannteFassung[] {
  return [...liste].sort((a, b) => b.datum.localeCompare(a.datum) || a.name.localeCompare(b.name, 'de'));
}

/** Versionspfad → Fassungen, zu denen der Schnappschuss gehört (für Beschriftungen im Versionsverlauf). */
export function fassungenJeVersion(liste: readonly BenannteFassung[]): Map<string, BenannteFassung[]> {
  const karte = new Map<string, BenannteFassung[]>();
  for (const f of liste) {
    for (const d of f.dateien) {
      const l = karte.get(d.version) ?? [];
      l.push(f);
      karte.set(d.version, l);
    }
  }
  return karte;
}

/** Kapitel, die in eine Fassung „ganzes Buch“ gehören: Buchreihenfolge, nur Kapitel mit Manuskript-Text. */
export function kapitelFuerFassung(daten: ProjektDaten): Id[] {
  return daten.projekt.kapitel.filter((id) => (daten.kapitel[id]?.text ?? '').trim() !== '');
}

export function neueFassung(id: Id, name: string, datum: Date, dateien: BenannteFassung['dateien'], notiz?: string): BenannteFassung {
  const n = notiz?.trim();
  return { id, name: name.trim(), datum: datum.toISOString(), ...(n ? { notiz: n } : {}), dateien };
}

// ---------------------------------------------------------------------------
// Quellen für den Vergleich
// ---------------------------------------------------------------------------

/** 'aktuell' | 'f:<fassungs-id>' | 'v:<versionspfad>' */
export type Quelle = string;

export const AKTUELL: Quelle = 'aktuell';
export const fassungsQuelle = (id: Id): Quelle => `f:${id}`;
export const versionsQuelle = (pfad: string): Quelle => `v:${pfad}`;

export type QuellenArt = { art: 'aktuell' } | { art: 'fassung'; id: Id } | { art: 'version'; pfad: string };

export function quelleLesen(q: Quelle): QuellenArt {
  if (q.startsWith('f:')) return { art: 'fassung', id: q.slice(2) };
  if (q.startsWith('v:')) return { art: 'version', pfad: q.slice(2) };
  return { art: 'aktuell' };
}

export type QuellenText =
  | { status: 'ok'; text: string }
  /** Kapitel gehört nicht zu dieser Fassung */
  | { status: 'fehlt-in-fassung' }
  /** Schnappschuss-Datei ist nicht (mehr) da */
  | { status: 'datei-fehlt'; pfad: string };

/** Markdown-Text eines Kapitels aus einer Quelle. */
export async function quellenText(leser: ProjektLeser, daten: ProjektDaten, fassungen: readonly BenannteFassung[], q: Quelle, kapitel: Id): Promise<QuellenText> {
  const a = quelleLesen(q);
  if (a.art === 'aktuell') {
    const k = daten.kapitel[kapitel];
    return k && daten.projekt.kapitel.includes(kapitel) ? { status: 'ok', text: k.text } : { status: 'fehlt-in-fassung' };
  }
  let pfad: string | undefined;
  if (a.art === 'fassung') {
    const f = fassungen.find((x) => x.id === a.id);
    pfad = f ? fassungsVersion(f, kapitel) : undefined;
    if (!pfad) return { status: 'fehlt-in-fassung' };
  } else pfad = a.pfad;
  const inhalt = await leser.lesen(pfad);
  if (inhalt === null) return { status: 'datei-fehlt', pfad };
  return { status: 'ok', text: parseKapitel(inhalt, kapitel).text };
}

/** Kapitel einer Quelle (Buchebene): aktuell = Kapitel mit Text (wie eine Fassung „ganzes Buch“), Fassung = ihre Kapitel, Version = null. */
export function quellenKapitel(daten: ProjektDaten, fassungen: readonly BenannteFassung[], q: Quelle): Id[] | null {
  const a = quelleLesen(q);
  if (a.art === 'aktuell') return kapitelFuerFassung(daten);
  if (a.art === 'fassung') {
    const f = fassungen.find((x) => x.id === a.id);
    return f ? fassungsKapitel(f) : [];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Vergleich
// ---------------------------------------------------------------------------

export interface DiffZaehlung {
  neu: number;
  entfernt: number;
}

const woerterIn = (s: string) => s.match(/\S+/g)?.length ?? 0;

export function zaehleDiff(diff: readonly DiffTeil[]): DiffZaehlung {
  let neu = 0;
  let entfernt = 0;
  for (const t of diff) {
    if (t.typ === 'neu') neu += woerterIn(t.text);
    else if (t.typ === 'entfernt') entfernt += woerterIn(t.text);
  }
  return { neu, entfernt };
}

export interface SpaltenTeil {
  typ: DiffTeil['typ'];
  text: string;
  /** gemeinsamer Index gleicher Abschnitte (für synchrones Scrollen), sonst null */
  anker: number | null;
  /** Position des Teils im Diff (für „nächste Änderung“ über beide Spalten) */
  nr: number;
}

/**
 * Teilt einen Wort-Diff (links → rechts) in zwei Spalten: links stehen gleiche und entfernte Teile, rechts
 * gleiche und neue. Gleiche Teile bekommen in beiden Spalten denselben Anker; lange gleiche Teile werden an
 * Absatzgrenzen geteilt, damit das synchrone Scrollen auch in unveränderten Passagen Halt findet.
 */
export function diffSpalten(diff: readonly DiffTeil[]): { links: SpaltenTeil[]; rechts: SpaltenTeil[] } {
  const links: SpaltenTeil[] = [];
  const rechts: SpaltenTeil[] = [];
  let anker = 0;
  diff.forEach((t, nr) => {
    if (t.typ === 'gleich') {
      for (const stueck of absatzStuecke(t.text)) {
        links.push({ typ: 'gleich', text: stueck, anker, nr });
        rechts.push({ typ: 'gleich', text: stueck, anker, nr });
        anker++;
      }
    } else if (t.typ === 'entfernt') links.push({ typ: 'entfernt', text: t.text, anker: null, nr });
    else rechts.push({ typ: 'neu', text: t.text, anker: null, nr });
  });
  return { links, rechts };
}

/** Text in Stücke teilen, jedes endet hinter einem Absatzwechsel (zusammengefügt wieder der ganze Text). */
function absatzStuecke(text: string): string[] {
  const stuecke = text.split(/(?<=\n\n)/);
  return stuecke.filter((s) => s !== '');
}

/**
 * Änderungsblöcke für „nächste/vorige Änderung“: benachbarte entfernte/neue Teile (ohne gleichen Teil dazwischen)
 * bilden einen Block. Ergebnis: Diff-Position des ersten Teils je Block, aufsteigend.
 */
export function aenderungsBloecke(diff: readonly DiffTeil[]): number[] {
  const bloecke: number[] = [];
  let imBlock = false;
  diff.forEach((t, nr) => {
    if (t.typ === 'gleich') {
      if (t.text.trim() !== '') imBlock = false;
      return;
    }
    if (!imBlock) bloecke.push(nr);
    imBlock = true;
  });
  return bloecke;
}

/** Wort-Diff zweier Kapiteltexte (Markdown) auf Klartext-Ebene. */
export function vergleicheTexte(links: string, rechts: string): DiffTeil[] {
  return wortDiff(klartext(links), klartext(rechts));
}

export type KapitelVergleichStatus = 'gleich' | 'geaendert' | 'nur-links' | 'nur-rechts' | 'datei-fehlt';

export interface KapitelVergleich {
  id: Id;
  status: KapitelVergleichStatus;
  linksWoerter: number | null;
  rechtsWoerter: number | null;
}

/**
 * Überblick über zwei Fassungen (Buchebene): je Kapitel Wortzahlen links/rechts und ob es sich geändert hat.
 * Reihenfolge: Kapitel der rechten Quelle, danach die nur links vorhandenen.
 */
export async function vergleicheBuch(
  leser: ProjektLeser,
  daten: ProjektDaten,
  fassungen: readonly BenannteFassung[],
  links: Quelle,
  rechts: Quelle,
): Promise<KapitelVergleich[]> {
  const l = quellenKapitel(daten, fassungen, links) ?? [];
  const r = quellenKapitel(daten, fassungen, rechts) ?? [];
  const reihe = [...r, ...l.filter((id) => !r.includes(id))];
  const ergebnis: KapitelVergleich[] = [];
  for (const id of reihe) {
    const [a, b] = await Promise.all([
      l.includes(id) ? quellenText(leser, daten, fassungen, links, id) : Promise.resolve<QuellenText>({ status: 'fehlt-in-fassung' }),
      r.includes(id) ? quellenText(leser, daten, fassungen, rechts, id) : Promise.resolve<QuellenText>({ status: 'fehlt-in-fassung' }),
    ]);
    const wa = a.status === 'ok' ? wortzahl(a.text) : null;
    const wb = b.status === 'ok' ? wortzahl(b.text) : null;
    let status: KapitelVergleichStatus;
    if (a.status === 'datei-fehlt' || b.status === 'datei-fehlt') status = 'datei-fehlt';
    else if (a.status !== 'ok') status = 'nur-rechts';
    else if (b.status !== 'ok') status = 'nur-links';
    else status = klartext(a.text) === klartext(b.text) ? 'gleich' : 'geaendert';
    ergebnis.push({ id, status, linksWoerter: wa, rechtsWoerter: wb });
  }
  return ergebnis;
}
