/**
 * Recherche-Ablage (G8): Bilder, Links und Notizen im Projektordner unter recherche/.
 * Reines TypeScript ohne DOM/Tauri. Besitzer: G8 Recherche & Mac.
 *
 * - Einträge stehen in recherche/recherche.json (Typ `Recherche`), Bilder als Dateien unter recherche/dateien/.
 * - Ein Eintrag ist an Figuren, Orte, Kapitel oder Szenen geheftet (`verweise`).
 * - Links werden nie automatisch geladen: hier wird eine URL nur geprüft und zerlegt.
 * - Recherche geht nie an die KI (E12).
 */
import { fmt, localeVon, texteJe, type Sprache } from '../i18n';
import { nachRolle } from '../figuren/namen';
import type { Id, ProjektDaten, Recherche, RechercheArt, RechercheEintrag, Szene, Verweis, VerweisTyp } from '../model/types';

export const RECHERCHE_ORDNER = 'recherche/dateien';

/** größte Datei, die in die Ablage kopiert wird */
export const MAX_DATEIGROESSE = 50 * 1024 * 1024;

export const ART_NAME: Record<RechercheArt, string> = { bild: 'Bild', link: 'Link', notiz: 'Notiz' };
export const ART_MEHRZAHL: Record<RechercheArt, string> = { bild: 'Bilder', link: 'Links', notiz: 'Notizen' };

/** Beschriftungen und Meldungen (Oberflächensprache). Die Konstanten oben bleiben deutsch. */
const T = texteJe(
  {
    art: { bild: 'Bild', link: 'Link', notiz: 'Notiz' } as Record<RechercheArt, string>,
    artMehrzahl: { bild: 'Bilder', link: 'Links', notiz: 'Notizen' } as Record<RechercheArt, string>,
    zielArt: {
      figur: 'Figur',
      ort: 'Ort',
      kapitel: 'Kapitel',
      szene: 'Szene',
      plan: 'Plan-Karte',
      idee: 'Idee',
      gruppe: 'Gruppe',
    } as Record<ZielArt, string>,
    kap: 'Kap. {nr}',
    szene: 'Szene {nr}',
    bildWaehlen: 'Bitte ein Bild wählen.',
    adresse: 'Bitte eine gültige Adresse (http oder https) eingeben.',
    notizLeer: 'Die Notiz ist leer.',
    byte: '{n} Byte',
  },
  {
    art: { bild: 'Image', link: 'Link', notiz: 'Note' },
    artMehrzahl: { bild: 'Images', link: 'Links', notiz: 'Notes' },
    zielArt: {
      figur: 'Character',
      ort: 'Place',
      kapitel: 'Chapter',
      szene: 'Scene',
      plan: 'Plan card',
      idee: 'Idea',
      gruppe: 'Group',
    },
    kap: 'Ch. {nr}',
    szene: 'Scene {nr}',
    bildWaehlen: 'Please choose an image.',
    adresse: 'Please enter a valid address (http or https).',
    notizLeer: 'The note is empty.',
    byte: '{n} bytes',
  },
);

export function artName(art: RechercheArt, sprache: Sprache = 'de'): string {
  return T(sprache).art[art];
}

export function artMehrzahl(art: RechercheArt, sprache: Sprache = 'de'): string {
  return T(sprache).artMehrzahl[art];
}

// ---------------------------------------------------------------------------
// Bilddateien
// ---------------------------------------------------------------------------

const BILD_TYPEN: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

/** Endungen für den Datei-Dialog */
export const BILD_ENDUNGEN = Object.keys(BILD_TYPEN);

export function dateiEndung(name: string): string {
  return /\.([A-Za-z0-9]{1,8})$/.exec(name)?.[1]?.toLowerCase() ?? '';
}

export function istBildDatei(name: string): boolean {
  return dateiEndung(name) in BILD_TYPEN;
}

/** MIME-Typ für die Anzeige (Blob-URL); unbekannt → application/octet-stream */
export function bildMimeTyp(name: string): string {
  return BILD_TYPEN[dateiEndung(name)] ?? 'application/octet-stream';
}

/** Dateiname → Titel-Vorschlag („kaffee_kontor-2024.JPG“ → „kaffee kontor 2024“) */
export function titelAusDateiname(name: string, sprache: Sprache = 'de'): string {
  const ohne = name.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return ohne.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim() || T(sprache).art.bild;
}

function dateiSlug(s: string): string {
  return (
    s
      .toLocaleLowerCase('de')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'bild'
  );
}

/**
 * Zielpfad für eine kopierte Datei: recherche/dateien/<slug>.<endung>, eindeutig gegenüber `vorhandene`
 * (Projektpfade). „Lindenhof Foto.JPG“ → „recherche/dateien/lindenhof-foto.jpg“, danach „…-2.jpg“.
 */
export function zielDateipfad(name: string, vorhandene: Iterable<string>): string {
  const belegt = new Set([...vorhandene].map((p) => p.toLowerCase()));
  const endung = dateiEndung(name) || 'bin';
  const basis = dateiSlug(name.replace(/^.*[\\/]/, '').replace(/\.[A-Za-z0-9]{1,8}$/, ''));
  for (let n = 1; ; n++) {
    const pfad = `${RECHERCHE_ORDNER}/${n === 1 ? basis : `${basis}-${n}`}.${endung === 'jpeg' ? 'jpg' : endung}`;
    if (!belegt.has(pfad)) return pfad;
  }
}

export function groesseText(bytes: number, sprache: Sprache = 'de'): string {
  if (bytes < 1024) return fmt(T(sprache).byte, { n: bytes });
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString(localeVon(sprache), { maximumFractionDigits: 1 })} MB`;
}

// ---------------------------------------------------------------------------
// Links (nur prüfen, nie laden)
// ---------------------------------------------------------------------------

export interface GepruefterLink {
  url: string;
  /** Host ohne „www.“ */
  host: string;
}

/**
 * Prüft eine eingegebene Adresse. Ohne Schema wird https:// ergänzt; erlaubt sind nur http und https
 * (kein javascript:, file:, data:). Leerraum am Rand wird entfernt. null = keine gültige Adresse.
 */
export function linkPruefen(eingabe: string): GepruefterLink | null {
  let roh = eingabe.trim();
  if (!roh || /\s/.test(roh)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(roh)) {
    if (roh.startsWith('//')) roh = roh.slice(2);
    roh = `https://${roh}`;
  }
  let u: URL;
  try {
    u = new URL(roh);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || (!u.hostname.includes('.') && u.hostname !== 'localhost')) return null;
  if (u.username || u.password) return null;
  return { url: u.href, host: u.hostname.replace(/^www\./, '') };
}

export function linkHost(url: string | undefined): string {
  return (url && linkPruefen(url)?.host) || '';
}

/** Titel-Vorschlag aus der Adresse, ohne die Seite zu laden: letzter Pfadteil oder Host. */
export function titelAusLink(url: string): string {
  const l = linkPruefen(url);
  if (!l) return '';
  const u = new URL(l.url);
  const teil = u.pathname
    .split('/')
    .filter(Boolean)
    .pop();
  let name = '';
  if (teil) {
    try {
      name = decodeURIComponent(teil);
    } catch {
      name = teil;
    }
    name = name.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').trim();
  }
  return name && !/^\d+$/.test(name) ? `${name[0]!.toLocaleUpperCase('de')}${name.slice(1)} (${l.host})` : l.host;
}

// ---------------------------------------------------------------------------
// Ziele (Figuren, Orte, Kapitel, Szenen)
// ---------------------------------------------------------------------------

/**
 * Szenen haben (noch) keinen eigenen VerweisTyp. Ein Szenen-Verweis wird als `{typ: 'plan', id: <Szenen-ID>}`
 * gespeichert – Szenen gehören zu den Plan-Daten, Szenen-IDs („rot-s2“) unterscheiden sich von Kapitel-IDs.
 * Gibt es später den Typ „szene“, wird er hier ebenfalls erkannt.
 */
export function szenenVerweis(szeneId: Id): Verweis {
  return { typ: 'plan', id: szeneId };
}

export function alleSzenen(daten: ProjektDaten): Szene[] {
  const liste: Szene[] = [];
  for (const k of daten.projekt.kapitel) for (const s of daten.plaene[k]?.szenen ?? []) liste.push({ ...s, kapitel: s.kapitel || k });
  return liste;
}

export function findeSzene(daten: ProjektDaten, id: Id): Szene | undefined {
  return alleSzenen(daten).find((s) => s.id === id);
}

export type ZielArt = 'figur' | 'ort' | 'kapitel' | 'szene' | 'plan' | 'idee' | 'gruppe';

/** Anzeigename der Ziel-Art in der Sprache (ZIEL_ART_NAME bleibt deutsch). */
export function zielArtName(art: ZielArt, sprache: Sprache = 'de'): string {
  return T(sprache).zielArt[art];
}

export const ZIEL_ART_NAME: Record<ZielArt, string> = {
  figur: 'Figur',
  ort: 'Ort',
  kapitel: 'Kapitel',
  szene: 'Szene',
  plan: 'Plan-Karte',
  idee: 'Idee',
  gruppe: 'Gruppe',
};

export interface ZielInfo {
  art: ZielArt;
  /** aktuelle Anzeige; null = Ziel gibt es nicht mehr */
  name: string | null;
  /** Kapitel der Szene bzw. des Kapitels */
  kapitel?: Id;
}

function kapitelName(daten: ProjektDaten, id: Id, sprache: Sprache): string | null {
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const titel = daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel;
  if (titel === undefined) return null;
  return nr > 0 ? `${fmt(T(sprache).kap, { nr })} · ${titel}` : titel;
}

function szenenName(daten: ProjektDaten, s: Szene, sprache: Sprache): string {
  const t = T(sprache);
  const nr = daten.projekt.kapitel.indexOf(s.kapitel) + 1;
  const titel = s.titel.trim() || fmt(t.szene, { nr: s.index + 1 });
  return nr > 0 ? `${fmt(t.kap, { nr: `${nr}.${s.index + 1}` })} · ${titel}` : titel;
}

/** Art und aktuelle Anzeige eines Verweises (Szenen-Verweise erkannt, siehe szenenVerweis); `sprache` für „Kap. n“. */
export function zielInfo(daten: ProjektDaten, v: Verweis, sprache: Sprache = 'de'): ZielInfo {
  const typ = v.typ as VerweisTyp | 'szene';
  switch (typ) {
    case 'figur':
      return { art: 'figur', name: daten.figuren[v.id]?.name ?? null };
    case 'ort':
      return { art: 'ort', name: daten.orte[v.id]?.name ?? null };
    case 'kapitel':
      return { art: 'kapitel', name: kapitelName(daten, v.id, sprache), kapitel: v.id };
    case 'gruppe':
      return { art: 'gruppe', name: daten.gruppen[v.id]?.name ?? null };
    case 'idee':
      return { art: 'idee', name: daten.ideen.find((i) => i.id === v.id)?.titel ?? null };
    case 'szene':
    case 'plan': {
      const plan = typ === 'plan' ? daten.plaene[v.id] : undefined;
      if (plan) return { art: 'plan', name: plan.szene || plan.titel, kapitel: v.id };
      const s = findeSzene(daten, v.id);
      return { art: 'szene', name: s ? szenenName(daten, s, sprache) : null, kapitel: s?.kapitel };
    }
  }
  return { art: 'figur', name: null };
}

export function gleicherVerweis(a: Verweis, b: Verweis): boolean {
  return a.typ === b.typ && a.id === b.id;
}

export function verweisSchluessel(v: Verweis): string {
  return `${v.typ}:${v.id}`;
}

export function schluesselAlsVerweis(s: string): Verweis | null {
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { typ: s.slice(0, i) as VerweisTyp, id: s.slice(i + 1) };
}

export interface HeftZiel {
  verweis: Verweis;
  art: ZielArt;
  name: string;
  /** Texte, in denen die Auswahl sucht */
  suche: string[];
}

/** Alles, woran Leon einen Eintrag heften kann: Figuren, Orte, Kapitel, Szenen (in dieser Reihenfolge). */
export function heftZiele(daten: ProjektDaten, sprache: Sprache = 'de'): HeftZiel[] {
  const liste: HeftZiel[] = [];
  const figuren = Object.values(daten.figuren).sort(nachRolle((a, b) => a.name.localeCompare(b.name, 'de')));
  for (const f of figuren) liste.push({ verweis: { typ: 'figur', id: f.id }, art: 'figur', name: f.name, suche: [f.name, ...f.aliase] });
  for (const o of Object.values(daten.orte).sort((a, b) => a.name.localeCompare(b.name, 'de')))
    liste.push({ verweis: { typ: 'ort', id: o.id }, art: 'ort', name: o.name, suche: [o.name, ...o.aliase] });
  daten.projekt.kapitel.forEach((id, i) => {
    const name = kapitelName(daten, id, sprache) ?? id;
    const suche = [name, `Kapitel ${i + 1}`];
    if (sprache === 'en') suche.push(`Chapter ${i + 1}`);
    liste.push({ verweis: { typ: 'kapitel', id }, art: 'kapitel', name, suche });
  });
  for (const s of alleSzenen(daten)) {
    const name = szenenName(daten, s, sprache);
    liste.push({ verweis: szenenVerweis(s.id), art: 'szene', name, suche: [name, s.titel, s.id] });
  }
  return liste;
}

const klein = (s: string) => s.toLocaleLowerCase('de');

/** Ziele zur Anfrage (leer = alle), bereits gewählte ausgelassen; Wortanfänge zuerst. */
export function heftZielVorschlaege(daten: ProjektDaten, anfrage: string, ohne: Verweis[] = [], max = 8, sprache: Sprache = 'de'): HeftZiel[] {
  const q = klein(anfrage.trim());
  return heftZiele(daten, sprache)
    .filter((z) => !ohne.some((v) => gleicherVerweis(v, z.verweis)))
    .map((z, reihenfolge) => {
      let wert = q ? Infinity : 0;
      for (const t of z.suche.map(klein)) {
        if (t.startsWith(q)) wert = Math.min(wert, 0);
        else if (t.split(/[\s\-–·.,»«„“]+/).some((w) => w.startsWith(q))) wert = Math.min(wert, 1);
        else if (t.includes(q)) wert = Math.min(wert, 2);
      }
      return { z, wert, reihenfolge };
    })
    .filter((x) => x.wert < Infinity)
    .sort((a, b) => a.wert - b.wert || a.reihenfolge - b.reihenfolge)
    .slice(0, max)
    .map((x) => x.z);
}

// ---------------------------------------------------------------------------
// [[-Verweise im Notiztext
// ---------------------------------------------------------------------------

const MUSTER = /\[\[(figur|ort|kapitel|plan|idee|gruppe|szene):([^|\]\n]+)(?:\|([^\]\n]*))?\]\]/g;

/** `[[typ:id|Anzeige]]` → Anzeige (für Suche und Vorschau). */
export function verweiseAlsText(text: string): string {
  return text.replace(MUSTER, (_m, _typ: string, id: string, anzeige?: string) => (anzeige ?? '').trim() || id.trim());
}

/** Verweise, die im Text eines Eintrags stehen. */
export function textVerweise(text: string): Verweis[] {
  return [...text.matchAll(MUSTER)].map((m) => ({ typ: m[1] as VerweisTyp, id: m[2]!.trim() }));
}

// ---------------------------------------------------------------------------
// Einträge finden, filtern, zusammenstellen
// ---------------------------------------------------------------------------

export type ArtFilter = 'alle' | RechercheArt;

export interface RechercheFilter {
  /** freie Suche: Titel, Text, Adresse, Schlagworte, Namen der Ziele, Dateiname */
  suche?: string;
  art?: ArtFilter;
  /** nur Einträge, die an dieses Ziel geheftet sind (Szenen eines Kapitels zählen zum Kapitel) */
  ziel?: Verweis | null;
  schlagwort?: string | null;
}

/** Ist der Eintrag (direkt oder über eine Szene des Kapitels) an das Ziel geheftet? */
export function istGeheftet(daten: ProjektDaten, e: RechercheEintrag, ziel: Verweis): boolean {
  if (e.verweise.some((v) => gleicherVerweis(v, ziel))) return true;
  if (ziel.typ === 'kapitel') return e.verweise.some((v) => (v.typ === 'plan' || (v.typ as string) === 'szene') && zielInfo(daten, v).kapitel === ziel.id && zielInfo(daten, v).art === 'szene');
  return false;
}

function suchtext(daten: ProjektDaten, e: RechercheEintrag): string {
  const ziele = e.verweise.map((v) => zielInfo(daten, v).name ?? '');
  return klein([e.titel, verweiseAlsText(e.text), e.url ?? '', e.datei?.replace(/^.*\//, '') ?? '', ...(e.schlagworte ?? []), ...ziele].join('\n'));
}

export function filtereEintraege(daten: ProjektDaten, eintraege: RechercheEintrag[], f: RechercheFilter): RechercheEintrag[] {
  const woerter = klein(f.suche ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const schlagwort = f.schlagwort ? klein(f.schlagwort) : null;
  return eintraege.filter((e) => {
    if (f.art && f.art !== 'alle' && e.art !== f.art) return false;
    if (f.ziel && !istGeheftet(daten, e, f.ziel)) return false;
    if (schlagwort && !(e.schlagworte ?? []).some((s) => klein(s) === schlagwort)) return false;
    if (woerter.length) {
      const t = suchtext(daten, e);
      if (!woerter.every((w) => t.includes(w))) return false;
    }
    return true;
  });
}

/** Neueste zuerst; gleiche Zeit nach Titel. */
export function sortiereEintraege(eintraege: RechercheEintrag[]): RechercheEintrag[] {
  return [...eintraege].sort((a, b) => (a.erstellt < b.erstellt ? 1 : a.erstellt > b.erstellt ? -1 : a.titel.localeCompare(b.titel, 'de')));
}

/**
 * Einträge zu einem Ziel (für die RechercheLeiste auf Karten anderer Bereiche): direkt geheftet
 * (beim Kapitel auch über seine Szenen) und solche, die im Text per `[[` darauf verweisen.
 */
export function eintraegeFuer(daten: ProjektDaten, ziel: Verweis): { eintrag: RechercheEintrag; geheftet: boolean }[] {
  const liste = sortiereEintraege(daten.recherche?.eintraege ?? []);
  const ergebnis: { eintrag: RechercheEintrag; geheftet: boolean }[] = [];
  for (const e of liste) {
    if (istGeheftet(daten, e, ziel)) ergebnis.push({ eintrag: e, geheftet: true });
    else if (textVerweise(e.text).some((v) => gleicherVerweis(v, ziel))) ergebnis.push({ eintrag: e, geheftet: false });
  }
  return ergebnis;
}

export interface ZaehlerEintrag {
  wert: string;
  anzahl: number;
}

/** Alle Schlagworte mit Anzahl, häufigste zuerst (Groß/Klein zusammengefasst, erste Schreibweise gewinnt). */
export function schlagwortListe(eintraege: RechercheEintrag[]): ZaehlerEintrag[] {
  const m = new Map<string, ZaehlerEintrag>();
  for (const e of eintraege)
    for (const s of new Set((e.schlagworte ?? []).map((x) => x.trim()).filter(Boolean))) {
      const k = klein(s);
      const z = m.get(k) ?? { wert: s, anzahl: 0 };
      z.anzahl++;
      m.set(k, z);
    }
  return [...m.values()].sort((a, b) => b.anzahl - a.anzahl || a.wert.localeCompare(b.wert, 'de'));
}

/** Ziele, an denen mindestens ein Eintrag hängt (für den Filter), mit Anzahl; nach Art sortiert. */
export function verwendeteZiele(daten: ProjektDaten, eintraege: RechercheEintrag[], sprache: Sprache = 'de'): (HeftZiel & { anzahl: number })[] {
  const zaehl = new Map<string, number>();
  for (const e of eintraege) for (const v of e.verweise) zaehl.set(verweisSchluessel(v), (zaehl.get(verweisSchluessel(v)) ?? 0) + 1);
  return heftZiele(daten, sprache)
    .filter((z) => zaehl.has(verweisSchluessel(z.verweis)))
    .map((z) => ({ ...z, anzahl: zaehl.get(verweisSchluessel(z.verweis))! }));
}

/** „Hafen, Kiez , hafen“ → ['Hafen', 'Kiez'] */
export function schlagworteAusText(text: string): string[] {
  const gesehen = new Set<string>();
  const liste: string[] = [];
  for (const roh of text.split(/[,;\n]/)) {
    const s = roh.trim().replace(/^#/, '').trim();
    if (s && !gesehen.has(klein(s))) {
      gesehen.add(klein(s));
      liste.push(s);
    }
  }
  return liste;
}

// ---------------------------------------------------------------------------
// Ändern (rein, liefert neue Recherche)
// ---------------------------------------------------------------------------

export function leereRechercheAblage(): Recherche {
  return { version: 1, eintraege: [] };
}

export interface EintragEntwurf {
  art: RechercheArt;
  titel: string;
  text: string;
  datei?: string;
  url?: string;
  verweise: Verweis[];
  schlagworte?: string[];
}

function bereinige(e: RechercheEintrag): RechercheEintrag {
  const verweise: Verweis[] = [];
  for (const v of e.verweise) if (!verweise.some((x) => gleicherVerweis(x, v))) verweise.push({ typ: v.typ, id: v.id });
  const neu: RechercheEintrag = { id: e.id, art: e.art, titel: e.titel.trim(), text: e.text, verweise, erstellt: e.erstellt };
  if (e.art === 'bild' && e.datei) neu.datei = e.datei;
  if (e.art === 'link' && e.url) neu.url = e.url;
  if (e.schlagworte && e.schlagworte.length) neu.schlagworte = e.schlagworte;
  // unbekannte Felder (z. B. aus einer neueren Version) bleiben erhalten
  for (const [k, w] of Object.entries(e)) if (!(k in neu) && !['datei', 'url', 'schlagworte'].includes(k)) (neu as unknown as Record<string, unknown>)[k] = w;
  return neu;
}

/** Fehler im Entwurf (leer = in Ordnung), in der Oberflächensprache. */
export function entwurfPruefen(e: EintragEntwurf, sprache: Sprache = 'de'): string[] {
  const t = T(sprache);
  const fehler: string[] = [];
  if (e.art === 'bild' && !e.datei) fehler.push(t.bildWaehlen);
  if (e.art === 'link' && !(e.url && linkPruefen(e.url))) fehler.push(t.adresse);
  if (e.art === 'notiz' && !e.titel.trim() && !e.text.trim()) fehler.push(t.notizLeer);
  return fehler;
}

/** Titel, falls Leon keinen eingibt (Ersatztitel „Bild“/„Link“/„Notiz“ in `sprache`). */
export function standardTitel(e: EintragEntwurf, sprache: Sprache = 'de'): string {
  if (e.titel.trim()) return e.titel.trim();
  if (e.art === 'bild' && e.datei) return titelAusDateiname(e.datei, sprache);
  if (e.art === 'link' && e.url) return titelAusLink(e.url) || T(sprache).art.link;
  const erste = verweiseAlsText(e.text).trim().split('\n')[0] ?? '';
  return erste.length > 60 ? `${erste.slice(0, 57).trimEnd()} …` : erste || T(sprache).art.notiz;
}

/** Legt einen Eintrag an (neueste zuerst in der Datei). */
export function eintragAnlegen(
  r: Recherche,
  id: Id,
  entwurf: EintragEntwurf,
  jetzt: Date,
  sprache: Sprache = 'de',
): { recherche: Recherche; eintrag: RechercheEintrag } {
  const url = entwurf.art === 'link' && entwurf.url ? (linkPruefen(entwurf.url)?.url ?? entwurf.url) : undefined;
  const eintrag = bereinige({
    id,
    art: entwurf.art,
    titel: standardTitel({ ...entwurf, url }, sprache),
    datei: entwurf.datei,
    url,
    text: entwurf.text,
    verweise: entwurf.verweise,
    erstellt: jetzt.toISOString(),
    schlagworte: entwurf.schlagworte,
  });
  return { recherche: { ...r, eintraege: [eintrag, ...r.eintraege] }, eintrag };
}

/** Ändert einen Eintrag (ID und Erstellzeit bleiben). */
export function eintragAendern(r: Recherche, id: Id, entwurf: EintragEntwurf, sprache: Sprache = 'de'): Recherche {
  return {
    ...r,
    eintraege: r.eintraege.map((e) => {
      if (e.id !== id) return e;
      const url = entwurf.art === 'link' && entwurf.url ? (linkPruefen(entwurf.url)?.url ?? entwurf.url) : undefined;
      return bereinige({ ...e, art: entwurf.art, titel: standardTitel({ ...entwurf, url }, sprache), datei: entwurf.datei, url, text: entwurf.text, verweise: entwurf.verweise, schlagworte: entwurf.schlagworte });
    }),
  };
}

/** Datei, die nach dem Entfernen/Ersetzen von keinem Eintrag mehr gebraucht wird (sonst null). */
export function verwaisteDatei(r: Recherche, datei: string | undefined): string | null {
  if (!datei) return null;
  return r.eintraege.some((e) => e.datei === datei) ? null : datei;
}

export function eintragEntfernen(r: Recherche, id: Id): { recherche: Recherche; dateiFrei: string | null } {
  const alt = r.eintraege.find((e) => e.id === id);
  const recherche = { ...r, eintraege: r.eintraege.filter((e) => e.id !== id) };
  return { recherche, dateiFrei: verwaisteDatei(recherche, alt?.datei) };
}

export function heften(r: Recherche, id: Id, ziel: Verweis): Recherche {
  return {
    ...r,
    eintraege: r.eintraege.map((e) => (e.id === id && !e.verweise.some((v) => gleicherVerweis(v, ziel)) ? { ...e, verweise: [...e.verweise, { typ: ziel.typ, id: ziel.id }] } : e)),
  };
}

export function loesen(r: Recherche, id: Id, ziel: Verweis): Recherche {
  return { ...r, eintraege: r.eintraege.map((e) => (e.id === id ? { ...e, verweise: e.verweise.filter((v) => !gleicherVerweis(v, ziel)) } : e)) };
}

/** Verweise, deren Ziel es nicht mehr gibt (Anzeige „fehlt“). */
export function fehlendeZiele(daten: ProjektDaten, e: RechercheEintrag): Verweis[] {
  return e.verweise.filter((v) => zielInfo(daten, v).name === null);
}

/** Bilddateien unter recherche/dateien/, die kein Eintrag nutzt (z. B. von Hand in den Ordner gelegt). */
export function freieDateien(r: Recherche, dateien: string[]): string[] {
  const genutzt = new Set(r.eintraege.map((e) => e.datei).filter(Boolean));
  return dateien.filter((p) => p.startsWith(`${RECHERCHE_ORDNER}/`) && istBildDatei(p) && !genutzt.has(p));
}
