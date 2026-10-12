/**
 * Projektordner lesen: parseX(text) je Dateityp und ladeProjekt(leser).
 * NUR lesend – dieses Modul importiert nichts, was schreiben kann (darf von core/ki genutzt werden).
 */
import { parse as yamlParse } from 'yaml';
import type {
  Abweichung,
  LeserAussage,
  Akt,
  Anmerkung,
  BenannteFassung,
  Beziehung,
  BogenStufe,
  BuchFrage,
  Fadenplanung,
  FadenPlan,
  Figurenbogen,
  FigurZustand,
  KiAblage,
  LektoratsAenderung,
  LeserStand,
  Marke,
  Markenliste,
  ProjektAngaben,
  Recherche,
  RechercheEintrag,
  Schreibstatistik,
  StimmenBeobachtung,
  Szene,
  Tageszeit,
  Wochentag,
  Zeitleiste,
  Zeitpunkt,
  ZeitVorschlag,
  Zitat,
  ZustandsArt,
  ZustandVorschlag,
  Entscheidungen,
  Figur,
  Gruppe,
  Hinweis,
  Id,
  Idee,
  Kapitel,
  KapitelAnalyse,
  KapitelPlan,
  KiEinstellungen,
  Motiv,
  Ort,
  Projekt,
  ProjektDaten,
  RealitaetsEintrag,
  SpitznameKontext,
  Spur,
  Strang,
  TextAnker,
  Verweis,
} from '../model/types';
import type { ProjektLeser } from './fs';

// ---------------------------------------------------------------------------
// Pfade (reine Konstanten, auch von schreiben.ts genutzt)
// ---------------------------------------------------------------------------

export const PFADE = {
  projekt: 'projekt.md',
  manuskript: 'manuskript',
  planKapitel: 'plan/kapitel',
  akte: 'plan/akte.md',
  straenge: 'plan/straenge.md',
  ideen: 'plan/ideen.md',
  motive: 'plan/motive.md',
  figuren: 'figuren',
  gruppen: 'gruppen',
  orte: 'orte',
  anmerkungen: 'anmerkungen.json',
  entscheidungen: 'entscheidungen.json',
  analysen: '.plotwerk/analysen',
  hinweise: '.plotwerk/hinweise.json',
  /** KI-Vorschläge für Figuren, Orte, Beziehungen (KiVorschlaege) */
  vorschlaege: '.plotwerk/vorschlaege.json',
  versionen: '.versionen',
  // Werkzeuge G1–G8 (docs/architektur.md)
  /** G1 Zeitleiste und Zustände (Zeitleiste) */
  zeitleiste: 'plan/zeitleiste.md',
  /** G2 Fadenplanung (Fadenplanung) */
  faeden: 'plan/faeden.md',
  /** G3 Figuren-Bögen (Figurenbogen[]) */
  boegen: 'plan/boegen.md',
  /** G4 Markenliste (Markenliste) */
  marken: 'plan/marken.md',
  /** G5 Schreibziele und Tagesstatistik (Schreibstatistik) */
  statistik: 'statistik.json',
  /** G5 benannte Fassungen (BenannteFassung[]) */
  fassungen: 'fassungen.json',
  /** G7 Änderungsvorschläge aus Word (LektoratsAenderung[]) */
  lektorat: 'lektorat/aenderungen.json',
  /** G8 Recherche-Ablage (Recherche) und ihre Dateien */
  recherche: 'recherche/recherche.json',
  rechercheDateien: 'recherche/dateien',
  /** G1 KI-Vorschläge für Zeitpunkte (KiAblage<ZeitVorschlag>) */
  kiZeit: '.plotwerk/zeit-vorschlaege.json',
  /** G1 KI-Vorschläge für Figurenzustände (KiAblage<ZustandVorschlag>) */
  kiZustand: '.plotwerk/zustand-vorschlaege.json',
  /** G3 KI-Beobachtungen zur Figurenstimme (KiAblage<StimmenBeobachtung>) */
  kiStimmen: '.plotwerk/stimmen.json',
  /** G6 Leser-Simulation (KiAblage<LeserStand>) */
  kiLeser: '.plotwerk/leser.json',
  /** G6 Fragen an das Buch (KiAblage<BuchFrage>) */
  kiFragen: '.plotwerk/fragen.json',
} as const;

export const kapitelPfad = (id: Id): string => `${PFADE.manuskript}/${id}.md`;
export const planPfad = (id: Id): string => `${PFADE.planKapitel}/${id}.md`;
export const figurPfad = (id: Id): string => `${PFADE.figuren}/${id}.md`;
export const gruppePfad = (id: Id): string => `${PFADE.gruppen}/${id}.md`;
export const ortPfad = (id: Id): string => `${PFADE.orte}/${id}.md`;
export const analysePfad = (id: Id): string => `${PFADE.analysen}/${id}.json`;

/** „manuskript/lotte.md“ → „lotte“ */
export function idAusPfad(pfad: string): Id {
  const name = pfad.split('/').pop() ?? pfad;
  return name.replace(/\.(md|json)$/i, '');
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export interface Frontmatter {
  daten: Record<string, unknown>;
  body: string;
  /** YAML nicht lesbar – dann ist `daten` leer und `body` der vollständige Dateiinhalt (nichts geht verloren) */
  fehler?: string;
}

const FRONTMATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

function zeilenumbrueche(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Body ohne führende Leerzeilen und ohne Leerraum am Ende. */
function bodyBereinigen(body: string): string {
  return body.replace(/^\n+/, '').replace(/\s+$/, '');
}

/** Fehlertext von parseFrontmatter, wenn das YAML keine Zuordnung ist (wird in ladeProjektMitBericht übersetzt). */
export const FRONTMATTER_KEINE_ZUORDNUNG = 'Frontmatter ist keine Zuordnung';

/**
 * Warnungen beim Laden in der Oberflächensprache. lesen.ts importiert bewusst nichts außer yaml/model/fs
 * (core/ki liest über diese Datei, siehe core/ki/importe.test.ts) – daher hier ohne core/i18n;
 * der Typ entspricht `Sprache` aus core/i18n.
 */
type LadeSprache = 'de' | 'en';
const LADE_TEXTE = {
  de: { frontmatter: (fehler: string) => `Frontmatter nicht lesbar: ${fehler}`, keineZuordnung: 'Frontmatter ist keine Zuordnung' },
  en: { frontmatter: (fehler: string) => `Front matter not readable: ${fehler}`, keineZuordnung: 'front matter is not a key–value mapping' },
} as const;

export function parseFrontmatter(text: string): Frontmatter {
  const t = zeilenumbrueche(text);
  const m = FRONTMATTER.exec(t);
  if (!m) return { daten: {}, body: bodyBereinigen(t) };
  try {
    const roh: unknown = yamlParse(m[1] ?? '');
    if (roh === null || roh === undefined) return { daten: {}, body: bodyBereinigen(t.slice(m[0].length)) };
    if (!istObjekt(roh)) {
      return { daten: {}, body: bodyBereinigen(t), fehler: FRONTMATTER_KEINE_ZUORDNUNG };
    }
    return { daten: roh, body: bodyBereinigen(t.slice(m[0].length)) };
  } catch (e) {
    return { daten: {}, body: bodyBereinigen(t), fehler: e instanceof Error ? e.message : String(e) };
  }
}

/** Body in „## Überschrift“-Abschnitte zerlegen. */
export function abschnitte(body: string): { vorspann: string; teile: { titel: string; inhalt: string }[] } {
  const zeilen = body.split('\n');
  const teile: { titel: string; zeilen: string[] }[] = [];
  const vorspann: string[] = [];
  for (const zeile of zeilen) {
    const m = /^##[ \t]+(.+?)[ \t]*$/.exec(zeile);
    if (m) teile.push({ titel: m[1] ?? '', zeilen: [] });
    else (teile.length ? teile[teile.length - 1]!.zeilen : vorspann).push(zeile);
  }
  const fertig = (z: string[]) => bodyBereinigen(z.join('\n'));
  return { vorspann: fertig(vorspann), teile: teile.map((t) => ({ titel: t.titel, inhalt: fertig(t.zeilen) })) };
}

function gleicherTitel(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');
}

/**
 * Holt bekannte Abschnitte heraus; alles andere (Vorspann, fremde Abschnitte) wird an `rest`
 * angehängt, damit beim Speichern nichts verloren geht.
 */
function abschnitteZuordnen(body: string, bekannte: string[]): { werte: string[]; rest: string } {
  const { vorspann, teile } = abschnitte(body);
  const werte = bekannte.map(() => '');
  const gefunden = bekannte.map(() => false);
  const rest: string[] = [];
  for (const teil of teile) {
    const i = bekannte.findIndex((b, j) => !gefunden[j] && gleicherTitel(b, teil.titel));
    if (i >= 0) {
      werte[i] = teil.inhalt;
      gefunden[i] = true;
    } else {
      rest.push(teil.inhalt ? `## ${teil.titel}\n\n${teil.inhalt}` : `## ${teil.titel}`);
    }
  }
  return { werte, rest: [vorspann, ...rest].filter(Boolean).join('\n\n') };
}

function verbinde(...teile: string[]): string {
  return teile.filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// Werte tolerant lesen (Dateien können von Hand bearbeitet sein)
// ---------------------------------------------------------------------------

export function istObjekt(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function s(v: unknown, standard = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return standard;
}

function sOpt(v: unknown): string | undefined {
  const w = s(v);
  return w === '' ? undefined : w;
}

function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function texte(v: unknown): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  return liste(v).map((x) => s(x)).filter((x) => x !== '');
}

function zahl(v: unknown, standard: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : standard;
}

function eines<T extends string>(v: unknown, erlaubt: readonly T[], standard: T): T {
  return typeof v === 'string' && (erlaubt as readonly string[]).includes(v) ? (v as T) : standard;
}

/** Entfernt Schlüssel mit undefined (damit Roundtrips exakt vergleichbar sind). */
function ohneUndefined<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

const REALITAET = ['gesichert', 'offen', 'bewusst_vage'] as const;

function json(text: string): unknown {
  return JSON.parse(zeilenumbrueche(text));
}

export function parseAnker(v: unknown): TextAnker | undefined {
  if (!istObjekt(v)) return undefined;
  return { kapitel: s(v.kapitel), exakt: s(v.exakt), davor: s(v.davor), danach: s(v.danach) };
}

function parseVerweis(v: unknown): Verweis | null {
  if (!istObjekt(v)) return null;
  const typ = eines(v.typ, ['figur', 'ort', 'kapitel', 'plan', 'idee', 'gruppe'] as const, 'figur');
  const id = s(v.id);
  return id ? { typ, id } : null;
}

// ---------------------------------------------------------------------------
// parseX je Dateityp
// ---------------------------------------------------------------------------

/** Standardmodelle, wenn projekt.md nur einen Teil der KI-Einstellungen enthält (entspricht STANDARD_KI). */
const STANDARD_DEPLOYMENTS = { erkennung: 'claude-haiku-5-5', pruefung: 'claude-sonnet-5-5', tiefencheck: 'claude-opus-5-5' };

function parseKiModelle(v: unknown): KiEinstellungen['deployments'] {
  const d = istObjekt(v) ? v : {};
  return {
    erkennung: s(d.erkennung, STANDARD_DEPLOYMENTS.erkennung),
    pruefung: s(d.pruefung, STANDARD_DEPLOYMENTS.pruefung),
    tiefencheck: s(d.tiefencheck, STANDARD_DEPLOYMENTS.tiefencheck),
  };
}

/** Ältere projekt.md ohne `anbieter`/`claude` bleiben gültig (gelten als Foundry). */
function parseKi(v: unknown): KiEinstellungen | undefined {
  if (!istObjekt(v)) return undefined;
  const c = istObjekt(v.claude) ? v.claude : undefined;
  return ohneUndefined<KiEinstellungen>({
    endpoint: s(v.endpoint),
    deployments: parseKiModelle(v.deployments),
    anbieter: v.anbieter === 'claude' ? 'claude' : v.anbieter === 'foundry' ? 'foundry' : undefined,
    claude: c ? { endpoint: s(c.endpoint), modelle: parseKiModelle(c.modelle) } : undefined,
  });
}

export function parseProjekt(text: string): Projekt {
  const { daten, body } = parseFrontmatter(text);
  return ohneUndefined({
    version: 1 as const,
    titel: s(daten.titel),
    kapitel: texte(daten.kapitel),
    ki: parseKi(daten.ki),
    angaben: parseAngaben(daten.angaben),
    notiz: body,
  });
}

export function parseKapitel(text: string, id?: Id): Kapitel {
  const { daten, body } = parseFrontmatter(text);
  const kid = s(daten.id) || id || '';
  return { id: kid, titel: s(daten.titel) || kid, text: body };
}

function parseAbweichung(v: unknown, i: number): Abweichung | null {
  if (!istObjekt(v)) return null;
  return ohneUndefined({
    id: s(v.id) || `abweichung-${i + 1}`,
    notiz: s(v.notiz),
    entscheidung: eines(v.entscheidung, ['plan_anpassen', 'alternative', 'spaeter'] as const, 'spaeter'),
    datum: s(v.datum),
    alterPlan: sOpt(v.alterPlan),
  });
}

function parseRealitaetsEintrag(v: unknown, i: number): RealitaetsEintrag | null {
  if (!istObjekt(v)) return null;
  return ohneUndefined({
    id: s(v.id) || `realitaet-${i + 1}`,
    text: s(v.text),
    stufe: eines(v.stufe, REALITAET, 'offen'),
    anker: parseAnker(v.anker),
  });
}

function nichtNull<T>(x: T | null): x is T {
  return x !== null;
}

export function parseKapitelPlan(text: string, id?: Id): KapitelPlan {
  const { daten, body } = parseFrontmatter(text);
  const pid = s(daten.id) || id || '';
  const akt = daten.akt === null || daten.akt === undefined || daten.akt === '' ? null : zahl(daten.akt, NaN);
  const zeit = parseZeitpunkt(daten.zeit);
  return {
    id: pid,
    titel: s(daten.titel) || pid,
    akt: akt === null || Number.isNaN(akt) ? null : akt,
    status: eines(daten.status, ['geplant', 'entwurf', 'geschrieben'] as const, 'geplant'),
    szene: s(daten.szene),
    straenge: texte(daten.straenge),
    figuren: texte(daten.figuren),
    orte: texte(daten.orte),
    notiz: body,
    abweichungen: liste(daten.abweichungen).map(parseAbweichung).filter(nichtNull),
    realitaet: liste(daten.realitaet).map(parseRealitaetsEintrag).filter(nichtNull),
    ...(zeit ? { zeit } : {}),
    ...(Array.isArray(daten.szenen) ? { szenen: parseSzenen(daten.szenen, pid) } : {}),
  };
}

export function parseAkte(text: string): Akt[] {
  const { daten } = parseFrontmatter(text);
  return liste(daten.akte)
    .filter(istObjekt)
    .map((a, i) => ({
      nummer: zahl(a.nummer, i + 1),
      titel: s(a.titel),
      quintessenz: s(a.quintessenz),
      wendepunkt: s(a.wendepunkt),
      antagonisten: texte(a.antagonisten),
    }));
}

export function parseStraenge(text: string): Strang[] {
  const { daten } = parseFrontmatter(text);
  return liste(daten.straenge)
    .filter(istObjekt)
    .map((st) => ohneUndefined({ id: s(st.id), name: s(st.name), farbe: s(st.farbe), gruppe: sOpt(st.gruppe) }))
    .filter((st) => st.id !== '');
}

export function parseIdeen(text: string): Idee[] {
  const { daten } = parseFrontmatter(text);
  return liste(daten.ideen)
    .filter(istObjekt)
    .map((i) => ({ id: s(i.id), titel: s(i.titel), notiz: s(i.notiz), straenge: texte(i.straenge) }))
    .filter((i) => i.id !== '');
}

export function parseMotive(text: string): Motiv[] {
  const { daten } = parseFrontmatter(text);
  return liste(daten.motive)
    .filter(istObjekt)
    .map((m) => ({ id: s(m.id), name: s(m.name), aliase: texte(m.aliase) }))
    .filter((m) => m.id !== '' && m.name.trim() !== '');
}

function parseBeziehung(v: unknown): Beziehung | null {
  if (!istObjekt(v)) return null;
  const zu = s(v.zu);
  if (!zu) return null;
  return ohneUndefined({
    zu,
    art: s(v.art),
    abKapitel: sOpt(v.abKapitel) ?? sOpt(v.ab_kapitel),
    kategorie: eines(v.kategorie, ['arbeit', 'dates', 'sonstige'] as const, 'sonstige'),
    strang: sOpt(v.strang),
    notiz: sOpt(v.notiz),
    unsicher: v.unsicher === true ? true : undefined,
  });
}

function parsePlanFelder(v: unknown): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  if (istObjekt(v)) for (const [k, w] of Object.entries(v)) ergebnis[k] = s(w);
  return ergebnis;
}

function parseSpitznamen(v: unknown): SpitznameKontext[] | undefined {
  const l = liste(v)
    .filter(istObjekt)
    .filter((x) => s(x.name))
    .map((x) =>
      ohneUndefined({
        name: s(x.name),
        von: x.von === undefined ? undefined : texte(x.von),
        abKapitel: sOpt(x.abKapitel),
        notiz: sOpt(x.notiz),
      }),
    );
  return l.length ? l : undefined;
}

export const FIGUR_ABSCHNITTE = { wahrheit: 'Wahrheit hinter den Kulissen', notizen: 'Notizen' } as const;

export function parseFigur(text: string, id?: Id): Figur {
  const { daten, body } = parseFrontmatter(text);
  const fid = s(daten.id) || id || '';
  const {
    werte: [wahrheit = '', notizen = ''],
    rest,
  } = abschnitteZuordnen(body, [FIGUR_ABSCHNITTE.wahrheit, FIGUR_ABSCHNITTE.notizen]);
  const netz = istObjekt(daten.netz) ? { x: zahl(daten.netz.x, 0), y: zahl(daten.netz.y, 0) } : undefined;
  return ohneUndefined({
    id: fid,
    name: s(daten.name) || fid,
    aliase: texte(daten.aliase),
    formen: daten.formen === undefined ? undefined : texte(daten.formen),
    rolle: eines(daten.rolle, ['haupt', 'neben', 'statist'] as const, 'neben'),
    kurz: sOpt(daten.kurz),
    existenz: eines(daten.existenz, REALITAET, 'gesichert'),
    gruppe: sOpt(daten.gruppe) ?? null,
    beziehungen: liste(daten.beziehungen).map(parseBeziehung).filter(nichtNull),
    plan: parsePlanFelder(daten.plan),
    wahrheit,
    notizen: verbinde(notizen, rest),
    netz,
    ruheSchwelle: daten.ruheSchwelle === null ? null : typeof daten.ruheSchwelle === 'number' ? Math.max(1, Math.round(daten.ruheSchwelle)) : undefined,
    spitznamen: parseSpitznamen(daten.spitznamen),
  });
}

function parseSpur(v: unknown, i: number): Spur | null {
  if (!istObjekt(v)) return null;
  return ohneUndefined({
    id: s(v.id) || `spur-${i + 1}`,
    text: s(v.text),
    kapitel: s(v.kapitel),
    anker: parseAnker(v.anker),
    status: eines(v.status, ['vorschlag', 'bestaetigt', 'verworfen'] as const, 'vorschlag'),
  });
}

export function parseGruppe(text: string, id?: Id): Gruppe {
  const { daten, body } = parseFrontmatter(text);
  const gid = s(daten.id) || id || '';
  const {
    werte: [notizen = ''],
    rest,
  } = abschnitteZuordnen(body, ['Notizen']);
  const praesenz: Record<number, string> = {};
  if (istObjekt(daten.praesenz)) {
    for (const [k, w] of Object.entries(daten.praesenz)) {
      const n = Number(k);
      if (Number.isFinite(n)) praesenz[n] = s(w);
    }
  }
  const n = daten.netz;
  const netz = istObjekt(n)
    ? { x: zahl(n.x, 0), y: zahl(n.y, 0), breite: zahl(n.breite, 0), hoehe: zahl(n.hoehe, 0) }
    : undefined;
  return ohneUndefined({
    id: gid,
    name: s(daten.name) || gid,
    typ: eines(daten.typ, ['antagonist', 'firma', 'familie', 'sonstige'] as const, 'sonstige'),
    status: eines(daten.status, ['im_text', 'geplant'] as const, 'geplant'),
    mitglieder: texte(daten.mitglieder),
    strang: sOpt(daten.strang),
    spuren: liste(daten.spuren).map(parseSpur).filter(nichtNull),
    praesenz,
    notizen: verbinde(notizen, rest),
    netz,
    rollen: istObjekt(daten.rollen) && Object.keys(daten.rollen).length ? parsePlanFelder(daten.rollen) : undefined,
  });
}

export function parseOrt(text: string, id?: Id): Ort {
  const { daten, body } = parseFrontmatter(text);
  const oid = s(daten.id) || id || '';
  const zeilen = body.split('\n');
  const i = zeilen.findIndex((z) => /^##[ \t]+Notizen[ \t]*$/i.test(z));
  const beschreibung = i < 0 ? body : bodyBereinigen(zeilen.slice(0, i).join('\n'));
  const notizen = i < 0 ? '' : bodyBereinigen(zeilen.slice(i + 1).join('\n'));
  return ohneUndefined({
    id: oid,
    name: s(daten.name) || oid,
    aliase: texte(daten.aliase),
    in: sOpt(daten.in),
    beschreibung,
    notizen,
  });
}

export function parseAnmerkungen(text: string): Anmerkung[] {
  return liste(json(text))
    .filter(istObjekt)
    .map((a, i) => ({
      id: s(a.id) || `anmerkung-${i + 1}`,
      anker: parseAnker(a.anker) ?? { kapitel: '', exakt: '', davor: '', danach: '' },
      notiz: s(a.notiz),
      ziel: parseVerweis(a.ziel),
      erstellt: s(a.erstellt),
      ...(a.quelle === 'word' ? { quelle: 'word' as const } : {}),
      ...(s(a.autor) ? { autor: s(a.autor) } : {}),
    }));
}

export function leereEntscheidungen(): Entscheidungen {
  return { version: 1, schreibweisen: [], hinweise: [], zuordnungen: [], faeden: [], zusammenfassungen: [], realitaet: [] };
}

export function parseEntscheidungen(text: string): Entscheidungen {
  const roh = json(text);
  const e = istObjekt(roh) ? roh : {};
  return {
    version: 1,
    schreibweisen: liste(e.schreibweisen)
      .filter(istObjekt)
      .map((x) => {
        const ziel = parseVerweis(x.ziel);
        return ohneUndefined({ varianten: texte(x.varianten), gueltig: s(x.gueltig), ziel: ziel ?? undefined });
      }),
    hinweise: liste(e.hinweise)
      .filter(istObjekt)
      .map((x) => ({
        schluessel: s(x.schluessel),
        entscheidung: eines(x.entscheidung, ['absicht', 'erledigt'] as const, 'erledigt'),
        datum: s(x.datum),
      })),
    zuordnungen: liste(e.zuordnungen)
      .filter(istObjekt)
      .map((x) => ({
        anker: parseAnker(x.anker) ?? { kapitel: '', exakt: '', davor: '', danach: '' },
        ziel: parseVerweis(x.ziel),
        status: eines(x.status, ['bestaetigt', 'verworfen'] as const, 'bestaetigt'),
      })),
    faeden: liste(e.faeden)
      .filter(istObjekt)
      .map((x) => ({ id: s(x.id), status: eines(x.status, ['offen', 'erledigt', 'bewusst_offen'] as const, 'offen') })),
    zusammenfassungen: liste(e.zusammenfassungen)
      .filter(istObjekt)
      .map((x) =>
        ohneUndefined({
          kapitel: s(x.kapitel),
          text: s(x.text),
          kurz: sOpt(x.kurz),
          wendung: sOpt(x.wendung),
          basisHash: s(x.basisHash),
        }),
      ),
    realitaet: liste(e.realitaet)
      .filter(istObjekt)
      .map((x) => ({
        anker: parseAnker(x.anker) ?? { kapitel: '', exakt: '', davor: '', danach: '' },
        stufe: eines(x.stufe, REALITAET, 'offen'),
      })),
  };
}

export function parseAnalyse(text: string, id?: Id): KapitelAnalyse {
  const roh = json(text);
  const a = istObjekt(roh) ? roh : {};
  return {
    kapitel: s(a.kapitel) || id || '',
    textHash: s(a.textHash),
    zusammenfassung: s(a.zusammenfassung),
    kurz: s(a.kurz),
    wendung: s(a.wendung),
    antagonistenBezug: s(a.antagonistenBezug),
    loseEnden: liste(a.loseEnden)
      .filter(istObjekt)
      .map((l) => ({ id: s(l.id), name: s(l.name), eroeffnet: l.eroeffnet === true })),
    modell: s(a.modell),
    datum: s(a.datum),
  };
}

const HINWEIS_TYPEN = ['pruefen', 'schreibweise', 'offener_faden', 'unbekannt', 'struktur', 'zeitleiste', 'sprache', 'figuren'] as const;

export function parseHinweise(text: string): Hinweis[] {
  return liste(json(text))
    .filter(istObjekt)
    .map((h) =>
      ohneUndefined({
        schluessel: s(h.schluessel),
        typ: eines(h.typ, HINWEIS_TYPEN, 'pruefen'),
        titel: s(h.titel),
        zitate: liste(h.zitate)
          .filter(istObjekt)
          .map((z) => ({ kapitel: s(z.kapitel), text: s(z.text) })),
        erklaerung: s(h.erklaerung),
        quelle: eines(h.quelle, ['lokal', 'ki'] as const, 'ki'),
        offen: h.offen === true ? true : undefined,
        status: eines(h.status, ['neu', 'absicht', 'erledigt'] as const, 'neu'),
      }),
    );
}

// KI-Vorschläge (.plotwerk/vorschlaege.json) – Typen inline, damit die Importliste oben unberührt bleibt
type KiVorschlaegeT = import('../model/types').KiVorschlaege;
type VorschlagsVerweisT = import('../model/types').VorschlagsVerweis;

const VORSCHLAGS_STATUS = ['neu', 'uebernommen', 'verworfen'] as const;

function parseVorschlagsVerweis(v: unknown): VorschlagsVerweisT | undefined {
  if (!istObjekt(v) || !s(v.id)) return undefined;
  return { typ: eines(v.typ, ['angelegt', 'vorschlag'] as const, 'angelegt'), id: s(v.id), name: s(v.name) };
}

function parseBelege(v: unknown): { kapitel: Id; text: string }[] {
  return liste(v)
    .filter(istObjekt)
    .map((z) => ({ kapitel: s(z.kapitel), text: s(z.text) }));
}

export function parseKiVorschlaege(text: string): KiVorschlaegeT {
  const roh = json(text);
  const d = istObjekt(roh) ? roh : {};
  const lauf = istObjekt(d.lauf) ? { datum: s(d.lauf.datum), modell: s(d.lauf.modell) } : undefined;
  return ohneUndefined({
    version: 1 as const,
    figuren: liste(d.figuren)
      .filter(istObjekt)
      .filter((f) => s(f.schluessel) && s(f.name))
      .map((f) =>
        ohneUndefined({
          schluessel: s(f.schluessel),
          name: s(f.name),
          aliase: texte(f.aliase),
          rolle: eines(f.rolle, ['haupt', 'neben', 'statist'] as const, 'neben'),
          kurz: s(f.kurz),
          belege: parseBelege(f.belege),
          status: eines(f.status, VORSCHLAGS_STATUS, 'neu'),
          figur: sOpt(f.figur),
          ziel: sOpt(f.ziel),
        }),
      ),
    orte: liste(d.orte)
      .filter(istObjekt)
      .filter((o) => s(o.schluessel) && s(o.name))
      .map((o) =>
        ohneUndefined({
          schluessel: s(o.schluessel),
          name: s(o.name),
          aliase: texte(o.aliase),
          in: parseVorschlagsVerweis(o.in),
          belege: parseBelege(o.belege),
          status: eines(o.status, VORSCHLAGS_STATUS, 'neu'),
          ort: sOpt(o.ort),
        }),
      ),
    beziehungen: liste(d.beziehungen)
      .filter(istObjekt)
      .map((b) => ({ b, von: parseVorschlagsVerweis(b.von), zu: parseVorschlagsVerweis(b.zu) }))
      .filter((x) => s(x.b.schluessel) && x.von && x.zu)
      .map(({ b, von, zu }) =>
        ohneUndefined({
          schluessel: s(b.schluessel),
          von: von!,
          zu: zu!,
          art: s(b.art),
          kategorie: eines(b.kategorie, ['arbeit', 'dates', 'sonstige'] as const, 'sonstige'),
          abKapitel: sOpt(b.abKapitel),
          unsicher: b.unsicher === true,
          belege: parseBelege(b.belege),
          begruendung: s(b.begruendung),
          status: eines(b.status, VORSCHLAGS_STATUS, 'neu'),
        }),
      ),
    lauf,
  });
}

// ---------------------------------------------------------------------------
// Werkzeuge G1–G8: Standardwerte und parseX
// ---------------------------------------------------------------------------

export const WOCHENTAGE: readonly Wochentag[] = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
export const TAGESZEITEN: readonly Tageszeit[] = ['frueh', 'morgens', 'vormittags', 'mittags', 'nachmittags', 'abends', 'nachts'];

/** Zustandsliste, solange plan/zeitleiste.md keine eigene enthält (Farben = Token-Namen). */
export const STANDARD_ZUSTANDSARTEN: readonly ZustandsArt[] = [
  { id: 'ausgeruht', name: 'ausgeruht', farbe: 'real-gesichert' },
  { id: 'erschoepft', name: 'erschöpft', farbe: 'strang-warm' },
  { id: 'krank', name: 'krank', farbe: 'strang-violett' },
  { id: 'verletzt', name: 'verletzt', farbe: 'arbeit-line' },
  { id: 'betrunken', name: 'betrunken', farbe: 'accent' },
];

/** K-02: Fäden, die seit 3 oder mehr Kapiteln ruhen, werden hervorgehoben. */
export const STANDARD_RUHESCHWELLE = 3;

export function leereZeitleiste(): Zeitleiste {
  return { zustandsarten: STANDARD_ZUSTANDSARTEN.map((z) => ({ ...z })), zustaende: [], notiz: '' };
}
export function leereFadenplanung(): Fadenplanung {
  return { ruheSchwelle: STANDARD_RUHESCHWELLE, faeden: [] };
}
export function leereMarkenliste(): Markenliste {
  return { marken: [], ignoriert: [] };
}
export function leereStatistik(): Schreibstatistik {
  return { version: 1, ziel: { tagWoerter: 0 }, tage: {} };
}
export function leereRecherche(): Recherche {
  return { version: 1, eintraege: [] };
}
export function leereKiAblage<T>(): KiAblage<T> {
  return { version: 1, eintraege: [] };
}

function parseAngaben(v: unknown): ProjektAngaben | undefined {
  if (!istObjekt(v)) return undefined;
  const a = ohneUndefined<ProjektAngaben>({ autor: sOpt(v.autor), untertitel: sOpt(v.untertitel), genre: sOpt(v.genre), sprache: sOpt(v.sprache) });
  return Object.keys(a).length ? a : undefined;
}

/** Wochentag tolerant („Montag“, „montag“, „Mo“). */
function parseWochentag(v: unknown): Wochentag | undefined {
  if (typeof v !== 'string') return undefined;
  const w = v.trim().toLocaleLowerCase('de');
  if (w.length < 2) return undefined;
  return WOCHENTAGE.find((t) => t === w || t.startsWith(w));
}

function zahlOpt(v: unknown): number | undefined {
  const n = zahl(v, NaN);
  return Number.isNaN(n) ? undefined : n;
}

export function parseZeitpunkt(v: unknown): Zeitpunkt | undefined {
  if (!istObjekt(v)) return undefined;
  const tageszeit = typeof v.tageszeit === 'string' ? TAGESZEITEN.find((t) => t === v.tageszeit) : undefined;
  return ohneUndefined<Zeitpunkt>({
    tag: zahlOpt(v.tag),
    wochentag: parseWochentag(v.wochentag),
    datum: sOpt(v.datum),
    tageszeit,
    uhrzeit: sOpt(v.uhrzeit),
    dauer: zahlOpt(v.dauer),
    sicherheit: eines(v.sicherheit, ['fest', 'ungefaehr', 'unklar'] as const, 'ungefaehr'),
    beleg: parseAnker(v.beleg),
    notiz: sOpt(v.notiz),
  });
}

function parseSzenen(v: unknown[], kapitel: Id): Szene[] {
  return v
    .filter(istObjekt)
    .map((sz, i) =>
      ohneUndefined<Szene>({
        id: s(sz.id) || `${kapitel}-s${i + 1}`,
        kapitel,
        index: zahl(sz.index, i),
        titel: s(sz.titel),
        ort: sOpt(sz.ort),
        figuren: texte(sz.figuren),
        zeit: parseZeitpunkt(sz.zeit),
        notiz: s(sz.notiz),
      }),
    );
}

export function parseZeitleiste(text: string): Zeitleiste {
  const { daten, body } = parseFrontmatter(text);
  const b = istObjekt(daten.beginn) ? daten.beginn : undefined;
  const beginn = b ? ohneUndefined({ wochentag: parseWochentag(b.wochentag), datum: sOpt(b.datum) }) : undefined;
  const zustandsarten: ZustandsArt[] = Array.isArray(daten.zustandsarten)
    ? daten.zustandsarten
        .filter(istObjekt)
        .map((z) => ({ id: s(z.id), name: s(z.name) || s(z.id), farbe: s(z.farbe) || 'ink-quiet' }))
        .filter((z) => z.id !== '')
    : STANDARD_ZUSTANDSARTEN.map((z) => ({ ...z }));
  const zustaende: FigurZustand[] = liste(daten.zustaende)
    .filter(istObjekt)
    .map((z, i) =>
      ohneUndefined<FigurZustand>({
        id: s(z.id) || `zustand-${i + 1}`,
        figur: s(z.figur),
        kapitel: s(z.kapitel),
        szene: sOpt(z.szene),
        zustand: s(z.zustand),
        notiz: sOpt(z.notiz),
        beleg: parseAnker(z.beleg),
      }),
    )
    .filter((z) => z.figur !== '' && z.kapitel !== '' && z.zustand !== '');
  return ohneUndefined<Zeitleiste>({
    beginn: beginn && Object.keys(beginn).length ? beginn : undefined,
    zustandsarten,
    zustaende,
    notiz: body,
  });
}

export function parseFadenplanung(text: string): Fadenplanung {
  const { daten } = parseFrontmatter(text);
  return {
    ruheSchwelle: Math.max(1, zahl(daten.ruheSchwelle, STANDARD_RUHESCHWELLE)),
    faeden: liste(daten.faeden)
      .filter(istObjekt)
      .map((f) =>
        ohneUndefined<FadenPlan>({
          id: s(f.id),
          name: sOpt(f.name),
          eroeffnetIn: sOpt(f.eroeffnetIn),
          aufloesungIn: sOpt(f.aufloesungIn),
          notiz: sOpt(f.notiz),
          ruheSchwelle: zahlOpt(f.ruheSchwelle),
          strang: sOpt(f.strang),
        }),
      )
      .filter((f) => f.id !== ''),
  };
}

function parseBogenStufe(v: Record<string, unknown>, i: number): BogenStufe {
  return ohneUndefined<BogenStufe>({
    id: s(v.id) || `stufe-${i + 1}`,
    kapitel: sOpt(v.kapitel),
    akt: zahlOpt(v.akt),
    titel: s(v.titel),
    notiz: sOpt(v.notiz),
    belege: liste(v.belege)
      .map(parseAnker)
      .filter((a): a is TextAnker => !!a),
  });
}

export function parseBoegen(text: string): Figurenbogen[] {
  const { daten } = parseFrontmatter(text);
  return liste(daten.boegen)
    .filter(istObjekt)
    .map((b) => ({ figur: s(b.figur), stufen: liste(b.stufen).filter(istObjekt).map(parseBogenStufe) }))
    .filter((b) => b.figur !== '');
}

export function parseMarken(text: string): Markenliste {
  const { daten } = parseFrontmatter(text);
  return {
    marken: liste(daten.marken)
      .filter(istObjekt)
      .map((m) =>
        ohneUndefined<Marke>({ id: s(m.id), name: s(m.name), aliase: texte(m.aliase), kategorie: sOpt(m.kategorie), notiz: sOpt(m.notiz) }),
      )
      .filter((m) => m.id !== '' && m.name.trim() !== ''),
    ignoriert: texte(daten.ignoriert),
  };
}

export function parseStatistik(text: string): Schreibstatistik {
  const roh = json(text);
  const d = istObjekt(roh) ? roh : {};
  const z = istObjekt(d.ziel) ? d.ziel : {};
  const tage: Schreibstatistik['tage'] = {};
  if (istObjekt(d.tage)) {
    for (const datum of Object.keys(d.tage).sort()) {
      const t = d.tage[datum];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !istObjekt(t)) continue;
      tage[datum] = { geschrieben: Math.max(0, zahl(t.geschrieben, 0)), stand: Math.max(0, zahl(t.stand, 0)) };
    }
  }
  return {
    version: 1,
    ziel: ohneUndefined({ tagWoerter: Math.max(0, zahl(z.tagWoerter, 0)), buchWoerter: zahlOpt(z.buchWoerter), abgabe: sOpt(z.abgabe) }),
    tage,
  };
}

export function parseFassungen(text: string): BenannteFassung[] {
  return liste(json(text))
    .filter(istObjekt)
    .map((f, i) =>
      ohneUndefined<BenannteFassung>({
        id: s(f.id) || `fassung-${i + 1}`,
        name: s(f.name),
        datum: s(f.datum),
        notiz: sOpt(f.notiz),
        dateien: liste(f.dateien)
          .filter(istObjekt)
          .map((d) => ({ pfad: s(d.pfad), version: s(d.version) }))
          .filter((d) => d.pfad !== '' && d.version !== ''),
      }),
    );
}

export function parseLektorat(text: string): LektoratsAenderung[] {
  return liste(json(text))
    .filter(istObjekt)
    .map((a, i) =>
      ohneUndefined<LektoratsAenderung>({
        id: s(a.id) || `aenderung-${i + 1}`,
        anker: parseAnker(a.anker) ?? { kapitel: '', exakt: '', davor: '', danach: '' },
        art: eines(a.art, ['einfuegen', 'loeschen', 'ersetzen'] as const, 'ersetzen'),
        alt: s(a.alt),
        neu: s(a.neu),
        autor: sOpt(a.autor),
        datum: sOpt(a.datum),
        quelle: sOpt(a.quelle),
        status: eines(a.status, ['offen', 'angenommen', 'abgelehnt'] as const, 'offen'),
      }),
    );
}

const VERWEIS_TYPEN = ['figur', 'ort', 'kapitel', 'plan', 'idee', 'gruppe'] as const;

export function parseRecherche(text: string): Recherche {
  const roh = json(text);
  const d = istObjekt(roh) ? roh : {};
  return {
    version: 1,
    eintraege: liste(d.eintraege)
      .filter(istObjekt)
      .map((e, i) =>
        ohneUndefined<RechercheEintrag>({
          id: s(e.id) || `recherche-${i + 1}`,
          art: eines(e.art, ['bild', 'link', 'notiz'] as const, 'notiz'),
          titel: s(e.titel),
          datei: sOpt(e.datei),
          url: sOpt(e.url),
          text: s(e.text),
          verweise: liste(e.verweise)
            .filter(istObjekt)
            .filter((v) => (VERWEIS_TYPEN as readonly string[]).includes(s(v.typ)))
            .map(parseVerweis)
            .filter(nichtNull),
          erstellt: s(e.erstellt),
          schlagworte: e.schlagworte === undefined ? undefined : texte(e.schlagworte),
        }),
      ),
  };
}

// KI-Ablagen (.plotwerk/…) – gemeinsames Gerüst {version, eintraege, lauf}

function parseKiAblage<T>(text: string, eintrag: (v: Record<string, unknown>, i: number) => T | null): KiAblage<T> {
  const roh = json(text);
  const d = istObjekt(roh) ? roh : {};
  const l = istObjekt(d.lauf) ? d.lauf : undefined;
  return ohneUndefined<KiAblage<T>>({
    version: 1,
    eintraege: liste(d.eintraege)
      .filter(istObjekt)
      .map(eintrag)
      .filter((x): x is T => x !== null),
    lauf: l ? ohneUndefined({ datum: s(l.datum), modell: s(l.modell), kostenUsd: zahlOpt(l.kostenUsd) }) : undefined,
  });
}

function parseZitate(v: unknown): Zitat[] {
  return liste(v)
    .filter(istObjekt)
    .map((z) => ({ kapitel: s(z.kapitel), text: s(z.text) }))
    .filter((z) => z.kapitel !== '' && z.text !== '');
}

const VORSCHLAGS_STATI = ['neu', 'uebernommen', 'verworfen'] as const;
const BEOBACHTUNGS_STATI = ['neu', 'absicht', 'erledigt'] as const;

export function parseKiZeitVorschlaege(text: string): KiAblage<ZeitVorschlag> {
  return parseKiAblage(text, (v) => {
    const zeit = parseZeitpunkt(v.zeit);
    if (!s(v.schluessel) || !s(v.kapitel) || !zeit) return null;
    return ohneUndefined<ZeitVorschlag>({
      schluessel: s(v.schluessel),
      kapitel: s(v.kapitel),
      szene: sOpt(v.szene),
      zeit,
      belege: parseZitate(v.belege),
      begruendung: s(v.begruendung),
      status: eines(v.status, VORSCHLAGS_STATI, 'neu'),
    });
  });
}

export function parseKiZustandVorschlaege(text: string): KiAblage<ZustandVorschlag> {
  return parseKiAblage(text, (v) => {
    if (!s(v.schluessel) || !s(v.figur) || !s(v.kapitel) || !s(v.zustand)) return null;
    return ohneUndefined<ZustandVorschlag>({
      schluessel: s(v.schluessel),
      figur: s(v.figur),
      kapitel: s(v.kapitel),
      szene: sOpt(v.szene),
      zustand: s(v.zustand),
      belege: parseZitate(v.belege),
      begruendung: s(v.begruendung),
      status: eines(v.status, VORSCHLAGS_STATI, 'neu'),
    });
  });
}

export function parseKiStimmen(text: string): KiAblage<StimmenBeobachtung> {
  return parseKiAblage(text, (v) => {
    if (!s(v.schluessel) || !s(v.figur)) return null;
    return {
      schluessel: s(v.schluessel),
      figur: s(v.figur),
      kapitel: s(v.kapitel),
      titel: s(v.titel),
      erklaerung: s(v.erklaerung),
      zitate: parseZitate(v.zitate),
      vergleich: parseZitate(v.vergleich),
      status: eines(v.status, BEOBACHTUNGS_STATI, 'neu'),
    };
  });
}

export function parseKiLeser(text: string): KiAblage<LeserStand> {
  return parseKiAblage(text, (v) => {
    if (!s(v.kapitel)) return null;
    return {
      kapitel: s(v.kapitel),
      basisHash: s(v.basisHash),
      weiss: liste(v.weiss)
        .filter(istObjekt)
        .map((a) => ({ text: s(a.text), belege: parseZitate(a.belege) })),
      fragen: liste(v.fragen)
        .filter(istObjekt)
        .map((f, i) => ohneUndefined({ id: s(f.id) || `frage-${i + 1}`, frage: s(f.frage), belege: parseZitate(f.belege), beantwortetIn: sOpt(f.beantwortetIn) })),
      modell: s(v.modell),
      datum: s(v.datum),
      ...ohneUndefined({
        vermutungen: Array.isArray(v.vermutungen) ? parseLeserAussagen(v.vermutungen) : undefined,
        spannung: Array.isArray(v.spannung) ? parseLeserAussagen(v.spannung) : undefined,
        plan: Array.isArray(v.plan)
          ? v.plan.filter(istObjekt).flatMap((p) => {
              const status = LESER_PLAN_STATI.find((x) => x === p.status);
              return status && s(p.aussage)
                ? [{ kapitel: s(p.kapitel), aussage: s(p.aussage), status, erklaerung: s(p.erklaerung), belege: parseZitate(p.belege) }]
                : [];
            })
          : undefined,
      }),
    };
  });
}

const LESER_PLAN_STATI = ['belegt', 'teilweise', 'nicht_belegt'] as const;

function parseLeserAussagen(v: unknown[]): LeserAussage[] {
  return v.filter(istObjekt).map((a) => ({ text: s(a.text), belege: parseZitate(a.belege) }));
}

export function parseKiFragen(text: string): KiAblage<BuchFrage> {
  return parseKiAblage(text, (v, i) => {
    if (!s(v.frage)) return null;
    return ohneUndefined<BuchFrage>({
      id: s(v.id) || `frage-${i + 1}`,
      frage: s(v.frage),
      datum: s(v.datum),
      antwort: s(v.antwort),
      belege: parseZitate(v.belege),
      modell: s(v.modell),
      kostenUsd: zahlOpt(v.kostenUsd),
      imBuch: typeof v.imBuch === 'boolean' ? v.imBuch : undefined,
    });
  });
}

// ---------------------------------------------------------------------------
// Ganzes Projekt laden
// ---------------------------------------------------------------------------

export interface LadeBericht {
  daten: ProjektDaten;
  /** Dateien, die nicht (vollständig) gelesen werden konnten – mit Grund */
  warnungen: { pfad: string; grund: string }[];
}

/** Plan für ein Kapitel ohne Plandatei. */
export function standardPlan(kapitel: Kapitel): KapitelPlan {
  return {
    id: kapitel.id,
    titel: kapitel.titel,
    akt: null,
    status: kapitel.text.trim() ? 'entwurf' : 'geplant',
    szene: '',
    straenge: [],
    figuren: [],
    orte: [],
    notiz: '',
    abweichungen: [],
    realitaet: [],
  };
}

/**
 * Lädt den Projektordner. Fehlende Dateien ergeben Leerwerte; Kapitel aus projekt.kapitel ohne
 * Manuskriptdatei sind nur geplant (text ''). Manuskript-/Plandateien, die in projekt.kapitel fehlen,
 * werden hinten angehängt (nur im Speicher). Jedes Kapitel hat danach einen Plan (ggf. Standardplan).
 */
export async function ladeProjektMitBericht(leser: ProjektLeser, sprache: LadeSprache = 'de'): Promise<LadeBericht> {
  const warnungen: LadeBericht['warnungen'] = [];
  const t = LADE_TEXTE[sprache] ?? LADE_TEXTE.de;

  async function lies<T>(pfad: string, parse: (text: string) => T): Promise<T | null> {
    const text = await leser.lesen(pfad);
    if (text === null) return null;
    try {
      return parse(text);
    } catch (e) {
      warnungen.push({ pfad, grund: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  async function liesFrontmatter<T>(pfad: string, parse: (text: string, id: Id) => T): Promise<T | null> {
    const text = await leser.lesen(pfad);
    if (text === null) return null;
    const fm = parseFrontmatter(text);
    if (fm.fehler)
      warnungen.push({ pfad, grund: t.frontmatter(fm.fehler === FRONTMATTER_KEINE_ZUORDNUNG ? t.keineZuordnung : fm.fehler) });
    return parse(text, idAusPfad(pfad));
  }

  async function ordner<T extends { id: Id }>(pfad: string, endung: string, parse: (text: string, id: Id) => T) {
    const dateien = (await leser.auflisten(pfad)).filter((p) => p.endsWith(endung));
    const werte = await Promise.all(dateien.map((p) => liesFrontmatter(p, parse)));
    const ergebnis: Record<Id, T> = {};
    for (const w of werte) if (w && w.id) ergebnis[w.id] = w;
    return ergebnis;
  }

  const [projektRoh, manuskript, planDateien, akte, straenge, ideen, motive, figuren, gruppen, orte, anmerkungen, entscheidungen, kiHinweise] =
    await Promise.all([
      liesFrontmatter(PFADE.projekt, (t) => parseProjekt(t)),
      ordner(PFADE.manuskript, '.md', parseKapitel),
      ordner(PFADE.planKapitel, '.md', parseKapitelPlan),
      liesFrontmatter(PFADE.akte, (t) => parseAkte(t)),
      liesFrontmatter(PFADE.straenge, (t) => parseStraenge(t)),
      liesFrontmatter(PFADE.ideen, (t) => parseIdeen(t)),
      liesFrontmatter(PFADE.motive, (t) => parseMotive(t)),
      ordner(PFADE.figuren, '.md', parseFigur),
      ordner(PFADE.gruppen, '.md', parseGruppe),
      ordner(PFADE.orte, '.md', parseOrt),
      lies(PFADE.anmerkungen, parseAnmerkungen),
      lies(PFADE.entscheidungen, parseEntscheidungen),
      lies(PFADE.hinweise, parseHinweise),
    ]);

  const analyseDateien = (await leser.auflisten(PFADE.analysen)).filter((p) => p.endsWith('.json'));
  const analyseListe = await Promise.all(analyseDateien.map((p) => lies(p, (t) => parseAnalyse(t, idAusPfad(p)))));
  const analysen: Record<Id, KapitelAnalyse> = {};
  for (const a of analyseListe) if (a && a.kapitel) analysen[a.kapitel] = a;
  const kiVorschlaege = await lies(PFADE.vorschlaege, parseKiVorschlaege);
  const [zeitleiste, fadenplanung, boegen, marken, statistik, fassungen, lektorat, recherche] = await Promise.all([
    liesFrontmatter(PFADE.zeitleiste, (t) => parseZeitleiste(t)),
    liesFrontmatter(PFADE.faeden, (t) => parseFadenplanung(t)),
    liesFrontmatter(PFADE.boegen, (t) => parseBoegen(t)),
    liesFrontmatter(PFADE.marken, (t) => parseMarken(t)),
    lies(PFADE.statistik, parseStatistik),
    lies(PFADE.fassungen, parseFassungen),
    lies(PFADE.lektorat, parseLektorat),
    lies(PFADE.recherche, parseRecherche),
  ]);
  const [kiZeitVorschlaege, kiZustandVorschlaege, kiStimmen, kiLeser, kiFragen] = await Promise.all([
    lies(PFADE.kiZeit, parseKiZeitVorschlaege),
    lies(PFADE.kiZustand, parseKiZustandVorschlaege),
    lies(PFADE.kiStimmen, parseKiStimmen),
    lies(PFADE.kiLeser, parseKiLeser),
    lies(PFADE.kiFragen, parseKiFragen),
  ]);

  const projekt: Projekt = projektRoh ?? { version: 1, titel: '', kapitel: [], notiz: '' };
  const reihenfolge: Id[] = [];
  const gesehen = new Set<Id>();
  const dazu = (id: Id) => {
    if (id && !gesehen.has(id)) {
      gesehen.add(id);
      reihenfolge.push(id);
    }
  };
  projekt.kapitel.forEach(dazu);
  Object.keys(manuskript).sort().forEach(dazu);
  Object.keys(planDateien).sort().forEach(dazu);

  const kapitel: Record<Id, Kapitel> = {};
  const plaene: Record<Id, KapitelPlan> = {};
  for (const id of reihenfolge) {
    const plan = planDateien[id];
    const k = manuskript[id] ?? { id, titel: plan?.titel || id, text: '' };
    kapitel[id] = k;
    plaene[id] = plan ?? standardPlan(k);
  }

  return {
    daten: {
      projekt: { ...projekt, kapitel: reihenfolge },
      kapitel,
      plaene,
      akte: akte ?? [],
      straenge: straenge ?? [],
      ideen: ideen ?? [],
      motive: motive ?? [],
      figuren,
      gruppen,
      orte,
      anmerkungen: anmerkungen ?? [],
      entscheidungen: entscheidungen ?? leereEntscheidungen(),
      analysen,
      kiHinweise: kiHinweise ?? [],
      ...(kiVorschlaege ? { kiVorschlaege } : {}),
      zeitleiste: zeitleiste ?? leereZeitleiste(),
      fadenplanung: fadenplanung ?? leereFadenplanung(),
      boegen: boegen ?? [],
      marken: marken ?? leereMarkenliste(),
      statistik: statistik ?? leereStatistik(),
      fassungen: fassungen ?? [],
      lektorat: lektorat ?? [],
      recherche: recherche ?? leereRecherche(),
      ...(kiZeitVorschlaege ? { kiZeitVorschlaege } : {}),
      ...(kiZustandVorschlaege ? { kiZustandVorschlaege } : {}),
      ...(kiStimmen ? { kiStimmen } : {}),
      ...(kiLeser ? { kiLeser } : {}),
      ...(kiFragen ? { kiFragen } : {}),
    },
    warnungen,
  };
}

export async function ladeProjekt(leser: ProjektLeser): Promise<ProjektDaten> {
  return (await ladeProjektMitBericht(leser)).daten;
}
