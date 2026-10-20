/** Schnappschuss-Politik, Aufbewahrung, Diff (E8). Besitzer: Kernlogik. */
import { diffWordsWithSpace } from 'diff';
import type { ProjektDateisystem, ProjektLeser } from '../projekt/fs';

/** extern: vor dem Überschreiben einer Fassung, die außerhalb der App geändert wurde (immer). */
/** 'benannt': für eine benannte Fassung (G5) – immer ein Schnappschuss. */
export type SchnappschussAnlass = 'kapitelwechsel' | 'intervall' | 'beenden' | 'wiederherstellen' | 'entfernen' | 'extern' | 'benannt' | 'ersetzen';

export interface Version {
  /** Originalpfad, z. B. manuskript/grundriss.md */
  pfad: string;
  /** ISO-Zeit */
  zeit: string;
  /** Pfad des Schnappschusses unter .versionen/ */
  versionsPfad: string;
}

function zweistellig(n: number): string {
  return String(n).padStart(2, '0');
}

/** .versionen/<pfad>/<YYYY-MM-DDTHH-mm-ss>.md (lokale Zeit) */
export function versionsPfad(pfad: string, zeit: Date): string {
  const stempel =
    `${zeit.getFullYear()}-${zweistellig(zeit.getMonth() + 1)}-${zweistellig(zeit.getDate())}` +
    `T${zweistellig(zeit.getHours())}-${zweistellig(zeit.getMinutes())}-${zweistellig(zeit.getSeconds())}`;
  return `.versionen/${pfad}/${stempel}.md`;
}

/**
 * Zweiter, dritter … Schnappschuss in derselben Sekunde: „…-2.md“, „…-3.md“ (n ≥ 2).
 */
export function versionsPfadMitZusatz(pfad: string, zeit: Date, n: number): string {
  const basis = versionsPfad(pfad, zeit);
  return n < 2 ? basis : basis.replace(/\.md$/, `-${n}.md`);
}

/** Zeitstempel aus dem Dateinamen (lokale Zeit); toleriert Zusätze wie „…-2.md“. */
const STEMPEL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})(?:[-_.][^/]*)?\.md$/;
const ZUSATZ = /-(\d+)\.md$/;
const zusatzNummer = (name: string) => {
  const ohneStempel = name.slice(19);
  const m = ZUSATZ.exec(ohneStempel);
  return m ? Number(m[1]) : 1;
};

/** Alle Schnappschüsse einer Datei, neueste zuerst. */
export async function versionenAuflisten(leser: ProjektLeser, pfad: string): Promise<Version[]> {
  const ordner = `.versionen/${pfad}`;
  const ergebnis: Version[] = [];
  for (const eintrag of await leser.auflisten(ordner)) {
    const voll = eintrag.startsWith(`${ordner}/`) ? eintrag : `${ordner}/${eintrag}`;
    const name = voll.slice(ordner.length + 1);
    if (name.includes('/')) continue;
    const m = STEMPEL.exec(name);
    if (!m) continue;
    const [j, mo, t, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
    const zeit = new Date(j, mo - 1, t, h, mi, s);
    if (Number.isNaN(zeit.getTime())) continue;
    ergebnis.push({ pfad, zeit: zeit.toISOString(), versionsPfad: voll });
  }
  const nummer = (v: Version) => zusatzNummer(v.versionsPfad.slice(ordner.length + 1));
  return ergebnis.sort((a, b) => b.zeit.localeCompare(a.zeit) || nummer(b) - nummer(a) || b.versionsPfad.localeCompare(a.versionsPfad));
}

/**
 * Ist der aktuelle Inhalt von `pfad` schon als Schnappschuss gesichert (neuester Schnappschuss identisch)?
 * Vor der ersten Änderung einer Datei in einer Sitzung: sonst ginge der Stand verloren, wenn die vorige
 * Sitzung nicht sauber beendet wurde. Fehlt die Datei, gibt es nichts zu sichern (true).
 */
export async function standGesichert(leser: ProjektLeser, pfad: string): Promise<boolean> {
  const inhalt = await leser.lesen(pfad);
  if (inhalt === null) return true;
  const [neueste] = await versionenAuflisten(leser, pfad);
  if (!neueste) return false;
  return (await leser.lesen(neueste.versionsPfad)) === inhalt;
}

const ZEHN_MINUTEN = 10 * 60 * 1000;

/**
 * Soll jetzt ein Schnappschuss entstehen? Intervall: höchstens alle 10 min und nur bei Änderungen.
 * Kapitelwechsel/Beenden: bei Änderung immer. Wiederherstellen/Entfernen: bei Änderung oder wenn es in
 * dieser Sitzung noch keinen Schnappschuss der Datei gibt (der alte Stand darf nie verloren gehen).
 */
export function sollSchnappschuss(
  anlass: SchnappschussAnlass,
  letzter: Date | null,
  jetzt: Date,
  geaendertSeitLetztem: boolean,
): boolean {
  switch (anlass) {
    case 'extern':
    case 'benannt':
    case 'ersetzen':
      return true;
    case 'intervall':
      return geaendertSeitLetztem && (letzter === null || jetzt.getTime() - letzter.getTime() >= ZEHN_MINUTEN);
    case 'wiederherstellen':
    case 'entfernen':
      return geaendertSeitLetztem || letzter === null;
    default:
      return geaendertSeitLetztem;
  }
}

const TAG = 24 * 60 * 60 * 1000;
const AUFBEWAHRUNG_ALLE = 90 * TAG;

/** ISO-Woche (lokale Zeit) als „JJJJ-Www“. */
export function isoWoche(zeit: Date): string {
  const d = new Date(Date.UTC(zeit.getFullYear(), zeit.getMonth(), zeit.getDate()));
  const wochentag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wochentag);
  const jahresanfang = Date.UTC(d.getUTCFullYear(), 0, 1);
  const woche = Math.ceil(((d.getTime() - jahresanfang) / TAG + 1) / 7);
  return `${d.getUTCFullYear()}-W${zweistellig(woche)}`;
}

/** Versionen, die nach der Aufbewahrungsregel gelöscht werden dürfen (90 Tage alle, danach eine pro Woche). */
export function zuLoeschen(versionen: Version[], jetzt: Date): Version[] {
  const grenze = jetzt.getTime() - AUFBEWAHRUNG_ALLE;
  const gruppen = new Map<string, { v: Version; t: number }[]>();
  for (const v of versionen) {
    const t = new Date(v.zeit).getTime();
    if (Number.isNaN(t) || t >= grenze) continue;
    const schluessel = `${v.pfad}\u0000${isoWoche(new Date(t))}`;
    const g = gruppen.get(schluessel) ?? [];
    g.push({ v, t });
    gruppen.set(schluessel, g);
  }
  const ergebnis: Version[] = [];
  for (const g of gruppen.values()) {
    g.sort((a, b) => b.t - a.t || b.v.versionsPfad.localeCompare(a.v.versionsPfad));
    ergebnis.push(...g.slice(1).map((x) => x.v));
  }
  return ergebnis.sort((a, b) => a.zeit.localeCompare(b.zeit));
}

export interface DiffTeil {
  typ: 'gleich' | 'neu' | 'entfernt';
  text: string;
}

/** Wort-Diff (Leerraum zählt mit), benachbarte Teile gleichen Typs zusammengefasst. */
export function wortDiff(alt: string, neu: string): DiffTeil[] {
  const teile: DiffTeil[] = [];
  for (const c of diffWordsWithSpace(alt, neu)) {
    if (!c.value) continue;
    const typ: DiffTeil['typ'] = c.added ? 'neu' : c.removed ? 'entfernt' : 'gleich';
    const letzter = teile[teile.length - 1];
    if (letzter && letzter.typ === typ) letzter.text += c.value;
    else teile.push({ typ, text: c.value });
  }
  return teile;
}

/**
 * Aufbewahrung anwenden (E8): löscht im ganzen Projekt die Schnappschüsse, die nach `zuLoeschen` entfallen.
 * `geschuetzt`: Schnappschüsse benannter Fassungen (fassungen.json, G5) bleiben immer erhalten.
 * Gibt die Anzahl gelöschter Schnappschüsse zurück.
 */
export async function aufbewahrungAnwenden(fs: ProjektDateisystem, jetzt: Date, geschuetzt: ReadonlySet<string> = new Set()): Promise<number> {
  const pfade = new Set<string>();
  for (const datei of await fs.auflisten('.versionen')) {
    const ordner = datei.slice(0, datei.lastIndexOf('/'));
    if (ordner.startsWith('.versionen/')) pfade.add(ordner.slice('.versionen/'.length));
  }
  let geloescht = 0;
  for (const pfad of pfade) {
    for (const v of zuLoeschen(await versionenAuflisten(fs, pfad), jetzt)) {
      if (geschuetzt.has(v.versionsPfad)) continue;
      await fs.entfernen(v.versionsPfad);
      geloescht++;
    }
  }
  return geloescht;
}
