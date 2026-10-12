/**
 * Projektordner schreiben: serializeX(obj, vorhanden?) je Dateityp, speichereX(fs, …), Schnappschüsse.
 *
 * Frontmatter: YAML (2 Leerzeichen), Schlüssel in der Reihenfolge der Typdefinition. Ist `vorhanden`
 * (der bisherige Dateiinhalt) angegeben, bleiben unbekannte Frontmatter-Felder erhalten – auch in
 * Listeneinträgen mit `id` (Abweichungen, Realität, Spuren, Stränge, Ideen) bzw. `nummer` (Akte).
 * Die speichereX-Funktionen lesen die vorhandene Datei dafür selbst und schreiben nur bei Änderung.
 */
import { stringify } from 'yaml';
import type {
  Akt,
  Anmerkung,
  BenannteFassung,
  BuchFrage,
  Fadenplanung,
  Figurenbogen,
  KiAblage,
  LektoratsAenderung,
  LeserStand,
  Markenliste,
  Recherche,
  Schreibstatistik,
  FigurFakt,
  StimmenBeobachtung,
  Szene,
  Zeitleiste,
  Zeitpunkt,
  ZeitVorschlag,
  ZustandVorschlag,
  Entscheidungen,
  Figur,
  Gruppe,
  Hinweis,
  Idee,
  Kapitel,
  KapitelAnalyse,
  KapitelPlan,
  Motiv,
  Ort,
  Projekt,
  Strang,
} from '../model/types';
import { versionsPfadMitZusatz } from '../versionen/index';
import type { ProjektDateisystem } from './fs';
import {
  FIGUR_ABSCHNITTE,
  PFADE,
  analysePfad,
  figurPfad,
  gruppePfad,
  istObjekt,
  kapitelPfad,
  ortPfad,
  parseFrontmatter,
  planPfad,
} from './lesen';

// ---------------------------------------------------------------------------
// Schlüsselreihenfolgen (= Typdefinitionen in core/model/types.ts)
// ---------------------------------------------------------------------------

const S = {
  projekt: ['version', 'titel', 'kapitel', 'ki', 'angaben'],
  angaben: ['autor', 'untertitel', 'genre', 'sprache'],
  ki: ['endpoint', 'deployments', 'anbieter', 'claude'],
  deployments: ['erkennung', 'pruefung', 'tiefencheck'],
  claude: ['endpoint', 'modelle'],
  kapitel: ['id', 'titel'],
  plan: ['id', 'titel', 'akt', 'status', 'szene', 'straenge', 'figuren', 'orte', 'abweichungen', 'realitaet', 'zeit', 'szenen'],
  zeitpunkt: ['tag', 'wochentag', 'datum', 'tageszeit', 'uhrzeit', 'dauer', 'sicherheit', 'beleg', 'notiz'],
  szene: ['id', 'index', 'titel', 'ort', 'figuren', 'zeit', 'notiz'],
  abweichung: ['id', 'notiz', 'entscheidung', 'datum', 'alterPlan'],
  realitaet: ['id', 'text', 'stufe', 'anker'],
  anker: ['kapitel', 'exakt', 'davor', 'danach'],
  akt: ['nummer', 'titel', 'quintessenz', 'wendepunkt', 'antagonisten'],
  strang: ['id', 'name', 'farbe', 'gruppe'],
  idee: ['id', 'titel', 'notiz', 'straenge'],
  motiv: ['id', 'name', 'aliase'],
  figur: ['id', 'name', 'aliase', 'formen', 'rolle', 'kurz', 'existenz', 'gruppe', 'beziehungen', 'plan', 'netz', 'ruheSchwelle', 'spitznamen'],
  beziehung: ['zu', 'art', 'abKapitel', 'kategorie', 'strang', 'notiz', 'unsicher'],
  gruppe: ['id', 'name', 'typ', 'status', 'mitglieder', 'strang', 'spuren', 'praesenz', 'netz', 'rollen'],
  spur: ['id', 'text', 'kapitel', 'anker', 'status'],
  ort: ['id', 'name', 'aliase', 'in'],
  hinweis: ['schluessel', 'typ', 'titel', 'zitate', 'erklaerung', 'quelle', 'offen', 'status'],
  zitat: ['kapitel', 'text'],
  analyse: ['kapitel', 'textHash', 'zusammenfassung', 'kurz', 'wendung', 'antagonistenBezug', 'loseEnden', 'modell', 'datum'],
} as const;

type Roh = Record<string, unknown>;

/** Bekannte Schlüssel in fester Reihenfolge, danach unbekannte Schlüssel aus `alt`. undefined entfällt. */
function ordne(neu: object, schluessel: readonly string[], alt?: unknown): Roh {
  const quelle = neu as Roh;
  const out: Roh = {};
  for (const k of schluessel) if (quelle[k] !== undefined) out[k] = quelle[k];
  if (istObjekt(alt)) for (const [k, v] of Object.entries(alt)) if (!schluessel.includes(k) && !(k in out)) out[k] = v;
  return out;
}

/** Listeneinträge ordnen; unbekannte Felder über den Schlüssel (`id`/`nummer`) aus der alten Liste übernehmen. */
function ordneListe(neu: readonly object[], schluessel: readonly string[], alt: unknown, idFeld = 'id'): Roh[] {
  const alte = new Map<unknown, unknown>();
  if (Array.isArray(alt)) for (const a of alt) if (istObjekt(a)) alte.set(a[idFeld], a);
  return neu.map((n) => ordne(n, schluessel, alte.get((n as Roh)[idFeld])));
}

function anker(a: unknown): Roh | undefined {
  return a ? ordne(a as object, S.anker) : undefined;
}

function zeitpunkt(z: Zeitpunkt | undefined, alt?: unknown): Roh | undefined {
  return z ? ordne({ ...z, beleg: anker(z.beleg) }, S.zeitpunkt, alt) : undefined;
}

/** Szene im Plan-Frontmatter: ohne `kapitel` (steht schon in der Datei). */
function szeneRoh(sz: Szene): Roh {
  const { kapitel: _k, ...rest } = sz;
  void _k;
  return { ...rest, figuren: [...sz.figuren], zeit: zeitpunkt(sz.zeit) };
}

function yaml(daten: Roh): string {
  return stringify(daten, { indent: 2, lineWidth: 0, minContentWidth: 0, aliasDuplicateObjects: false });
}

function mitFrontmatter(daten: Roh, body: string): string {
  const kopf = `---\n${yaml(daten)}---\n`;
  return body ? `${kopf}\n${body}\n` : kopf;
}

function alteDaten(vorhanden?: string | null): { daten: Roh; body: string } {
  if (!vorhanden) return { daten: {}, body: '' };
  const fm = parseFrontmatter(vorhanden);
  return { daten: fm.fehler ? {} : fm.daten, body: fm.fehler ? '' : fm.body };
}

function jsonText(wert: unknown): string {
  return `${JSON.stringify(wert, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// serializeX
// ---------------------------------------------------------------------------

export function serializeProjekt(p: Projekt, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden).daten;
  const altKi = istObjekt(alt.ki) ? alt.ki : undefined;
  // Claude-API-Einstellungen gehen nie verloren: fehlen sie im Projekt, bleiben die aus der Datei.
  const altClaude = altKi && istObjekt(altKi.claude) ? altKi.claude : undefined;
  const claude = p.ki?.claude
    ? ordne({ endpoint: p.ki.claude.endpoint, modelle: ordne(p.ki.claude.modelle, S.deployments, altClaude?.modelle) }, S.claude, altClaude)
    : altClaude;
  const ki = p.ki
    ? ordne(
        { endpoint: p.ki.endpoint, deployments: ordne(p.ki.deployments, S.deployments, altKi?.deployments), anbieter: p.ki.anbieter, claude },
        S.ki,
        altKi,
      )
    : undefined;
  const angaben = p.angaben ? ordne(p.angaben, S.angaben, alt.angaben) : undefined;
  return mitFrontmatter(ordne({ ...p, kapitel: [...p.kapitel], ki, angaben }, S.projekt, alt), p.notiz);
}

export function serializeKapitel(k: Kapitel, vorhanden?: string | null): string {
  return mitFrontmatter(ordne(k, S.kapitel, alteDaten(vorhanden).daten), k.text);
}

export function serializeKapitelPlan(p: KapitelPlan, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden).daten;
  const daten = ordne(
    {
      ...p,
      straenge: [...p.straenge],
      figuren: [...p.figuren],
      orte: [...p.orte],
      abweichungen: ordneListe(p.abweichungen, S.abweichung, alt.abweichungen),
      realitaet: ordneListe(
        p.realitaet.map((r) => ({ ...r, anker: anker(r.anker) })),
        S.realitaet,
        alt.realitaet,
      ),
      zeit: zeitpunkt(p.zeit, alt.zeit),
      szenen: p.szenen ? ordneListe(p.szenen.map(szeneRoh), S.szene, alt.szenen) : undefined,
    },
    S.plan,
    alt,
  );
  return mitFrontmatter(daten, p.notiz);
}

/** Dateien mit einer Liste im Frontmatter (akte, straenge, ideen): Body der vorhandenen Datei bleibt erhalten. */
function listenDatei(feld: string, liste: Roh[], vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden);
  return mitFrontmatter(ordne({ [feld]: liste }, [feld], alt.daten), alt.body);
}

export function serializeAkte(akte: Akt[], vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden).daten.akte;
  const liste = ordneListe(
    akte.map((a) => ({ ...a, antagonisten: [...a.antagonisten] })),
    S.akt,
    alt,
    'nummer',
  );
  return listenDatei('akte', liste, vorhanden);
}

export function serializeStraenge(straenge: Strang[], vorhanden?: string | null): string {
  return listenDatei('straenge', ordneListe(straenge, S.strang, alteDaten(vorhanden).daten.straenge), vorhanden);
}

export function serializeIdeen(ideen: Idee[], vorhanden?: string | null): string {
  const liste = ordneListe(
    ideen.map((i) => ({ ...i, straenge: [...i.straenge] })),
    S.idee,
    alteDaten(vorhanden).daten.ideen,
  );
  return listenDatei('ideen', liste, vorhanden);
}

export function serializeMotive(motive: Motiv[], vorhanden?: string | null): string {
  const liste = ordneListe(
    motive.map((m) => ({ ...m, aliase: [...m.aliase] })),
    S.motiv,
    alteDaten(vorhanden).daten.motive,
  );
  return listenDatei('motive', liste, vorhanden);
}

export function serializeFigur(f: Figur, vorhanden?: string | null): string {
  const daten = ordne(
    {
      ...f,
      aliase: [...f.aliase],
      formen: f.formen ? [...f.formen] : undefined,
      beziehungen: f.beziehungen.map((b) => ordne(b, S.beziehung)),
      plan: { ...f.plan },
      netz: f.netz ? { x: f.netz.x, y: f.netz.y } : undefined,
    },
    S.figur,
    alteDaten(vorhanden).daten,
  );
  const body =
    `## ${FIGUR_ABSCHNITTE.wahrheit}\n\n` +
    (f.wahrheit ? `${f.wahrheit}\n\n` : '') +
    `## ${FIGUR_ABSCHNITTE.notizen}` +
    (f.notizen ? `\n\n${f.notizen}` : '');
  return mitFrontmatter(daten, body);
}

export function serializeGruppe(g: Gruppe, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden).daten;
  const praesenz = new Map<number, string>();
  for (const k of Object.keys(g.praesenz)
    .map(Number)
    .sort((a, b) => a - b))
    praesenz.set(k, g.praesenz[k] ?? '');
  const daten = ordne(
    {
      ...g,
      mitglieder: [...g.mitglieder],
      spuren: ordneListe(
        g.spuren.map((sp) => ({ ...sp, anker: anker(sp.anker) })),
        S.spur,
        alt.spuren,
      ),
      praesenz,
      netz: g.netz ? { x: g.netz.x, y: g.netz.y, breite: g.netz.breite, hoehe: g.netz.hoehe } : undefined,
    },
    S.gruppe,
    alt,
  );
  return mitFrontmatter(daten, `## Notizen${g.notizen ? `\n\n${g.notizen}` : ''}`);
}

export function serializeOrt(o: Ort, vorhanden?: string | null): string {
  const daten = ordne({ ...o, aliase: [...o.aliase] }, S.ort, alteDaten(vorhanden).daten);
  const body = (o.beschreibung ? `${o.beschreibung}\n\n` : '') + '## Notizen' + (o.notizen ? `\n\n${o.notizen}` : '');
  return mitFrontmatter(daten, body);
}

export function serializeAnmerkungen(anmerkungen: Anmerkung[]): string {
  return jsonText(
    anmerkungen.map((a) => ({
      id: a.id,
      anker: anker(a.anker),
      notiz: a.notiz,
      ziel: a.ziel,
      erstellt: a.erstellt,
      ...(a.quelle ? { quelle: a.quelle } : {}),
      ...(a.autor ? { autor: a.autor } : {}),
    })),
  );
}

export function serializeEntscheidungen(e: Entscheidungen): string {
  return jsonText({
    version: 1,
    schreibweisen: e.schreibweisen,
    hinweise: e.hinweise,
    zuordnungen: e.zuordnungen.map((z) => ({ anker: anker(z.anker), ziel: z.ziel, status: z.status })),
    faeden: e.faeden,
    zusammenfassungen: e.zusammenfassungen,
    realitaet: e.realitaet.map((r) => ({ anker: anker(r.anker), stufe: r.stufe })),
  });
}

export function serializeAnalyse(a: KapitelAnalyse): string {
  return jsonText(ordne(a, S.analyse));
}

export function serializeHinweise(hinweise: Hinweis[]): string {
  return jsonText(hinweise.map((h) => ordne({ ...h, zitate: h.zitate.map((z) => ordne(z, S.zitat)) }, S.hinweis)));
}

/** Schlüsselreihenfolge = Typdefinitionen KiVorschlaege, FigurVorschlag, OrtVorschlag, BeziehungsVorschlag */
const SV = {
  ablage: ['version', 'figuren', 'orte', 'beziehungen', 'lauf'],
  figur: ['schluessel', 'name', 'aliase', 'rolle', 'kurz', 'belege', 'status', 'figur', 'ziel'],
  ort: ['schluessel', 'name', 'aliase', 'in', 'belege', 'status', 'ort'],
  beziehung: ['schluessel', 'von', 'zu', 'art', 'kategorie', 'abKapitel', 'unsicher', 'belege', 'begruendung', 'status'],
  verweis: ['typ', 'id', 'name'],
  lauf: ['datum', 'modell'],
} as const;

export function serializeKiVorschlaege(v: import('../model/types').KiVorschlaege): string {
  const belege = (b: readonly object[]) => b.map((z) => ordne(z, S.zitat));
  const verweis = (x: object | undefined) => (x ? ordne(x, SV.verweis) : undefined);
  return jsonText(
    ordne(
      {
        version: 1,
        figuren: v.figuren.map((f) => ordne({ ...f, belege: belege(f.belege) }, SV.figur)),
        orte: v.orte.map((o) => ordne({ ...o, in: verweis(o.in), belege: belege(o.belege) }, SV.ort)),
        beziehungen: v.beziehungen.map((b) =>
          ordne({ ...b, von: verweis(b.von), zu: verweis(b.zu), belege: belege(b.belege) }, SV.beziehung),
        ),
        lauf: v.lauf ? ordne(v.lauf, SV.lauf) : undefined,
      },
      SV.ablage,
    ),
  );
}

// ---------------------------------------------------------------------------
// Werkzeuge G1–G8
// ---------------------------------------------------------------------------

/** Schlüsselreihenfolgen der Werkzeug-Dateien (= Typdefinitionen) */
const SW = {
  zeitleiste: ['beginn', 'zustandsarten', 'zustaende'],
  beginn: ['wochentag', 'datum'],
  zustandsart: ['id', 'name', 'farbe'],
  zustand: ['id', 'figur', 'kapitel', 'szene', 'zustand', 'notiz', 'beleg'],
  faeden: ['ruheSchwelle', 'faeden'],
  faden: ['id', 'name', 'eroeffnetIn', 'aufloesungIn', 'notiz', 'ruheSchwelle', 'strang'],
  boegen: ['boegen'],
  bogen: ['figur', 'stufen'],
  stufe: ['id', 'kapitel', 'akt', 'titel', 'notiz', 'belege'],
  marken: ['marken', 'ignoriert'],
  marke: ['id', 'name', 'aliase', 'kategorie', 'notiz'],
  statistik: ['version', 'ziel', 'tage'],
  ziel: ['tagWoerter', 'buchWoerter', 'abgabe'],
  tag: ['geschrieben', 'stand'],
  fassung: ['id', 'name', 'datum', 'notiz', 'dateien'],
  fassungsDatei: ['pfad', 'version'],
  aenderung: ['id', 'anker', 'art', 'alt', 'neu', 'autor', 'datum', 'quelle', 'status'],
  recherche: ['version', 'eintraege'],
  rechercheEintrag: ['id', 'art', 'titel', 'datei', 'url', 'text', 'verweise', 'erstellt', 'schlagworte'],
  verweis: ['typ', 'id'],
  ablage: ['version', 'eintraege', 'lauf'],
  lauf: ['datum', 'modell', 'kostenUsd'],
  zeitVorschlag: ['schluessel', 'kapitel', 'szene', 'zeit', 'belege', 'begruendung', 'status'],
  zustandVorschlag: ['schluessel', 'figur', 'kapitel', 'szene', 'zustand', 'belege', 'begruendung', 'status'],
  stimme: ['schluessel', 'figur', 'kapitel', 'titel', 'erklaerung', 'zitate', 'vergleich', 'status'],
  fakt: ['schluessel', 'figur', 'merkmal', 'wert', 'kapitel', 'zitat', 'status'],
  leser: ['kapitel', 'basisHash', 'weiss', 'fragen', 'vermutungen', 'spannung', 'plan', 'modell', 'datum'],
  leserPlan: ['kapitel', 'aussage', 'status', 'erklaerung', 'belege'],
  leserAussage: ['text', 'belege'],
  leserFrage: ['id', 'frage', 'belege', 'beantwortetIn'],
  buchFrage: ['id', 'frage', 'datum', 'antwort', 'belege', 'imBuch', 'modell', 'kostenUsd'],
} as const;

const zitate = (z: readonly object[]) => z.map((x) => ordne(x, S.zitat));

/** plan/zeitleiste.md – Body = Notiz */
export function serializeZeitleiste(z: Zeitleiste, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden).daten;
  const daten = ordne(
    {
      beginn: z.beginn ? ordne(z.beginn, SW.beginn, alt.beginn) : undefined,
      zustandsarten: ordneListe(z.zustandsarten, SW.zustandsart, alt.zustandsarten),
      zustaende: ordneListe(
        z.zustaende.map((x) => ({ ...x, beleg: anker(x.beleg) })),
        SW.zustand,
        alt.zustaende,
      ),
    },
    SW.zeitleiste,
    alt,
  );
  return mitFrontmatter(daten, z.notiz);
}

export function serializeFadenplanung(f: Fadenplanung, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden);
  const daten = ordne({ ruheSchwelle: f.ruheSchwelle, faeden: ordneListe(f.faeden, SW.faden, alt.daten.faeden) }, SW.faeden, alt.daten);
  return mitFrontmatter(daten, alt.body);
}

export function serializeBoegen(boegen: Figurenbogen[], vorhanden?: string | null): string {
  const altListe = alteDaten(vorhanden).daten.boegen;
  const alteBoegen = new Map<unknown, Roh>();
  if (Array.isArray(altListe)) for (const b of altListe) if (istObjekt(b)) alteBoegen.set(b.figur, b);
  const liste = boegen.map((b) =>
    ordne(
      {
        figur: b.figur,
        stufen: ordneListe(
          b.stufen.map((st) => ({ ...st, belege: st.belege.map((a) => anker(a)) })),
          SW.stufe,
          alteBoegen.get(b.figur)?.stufen,
        ),
      },
      SW.bogen,
      alteBoegen.get(b.figur),
    ),
  );
  return listenDatei('boegen', liste, vorhanden);
}

export function serializeMarken(m: Markenliste, vorhanden?: string | null): string {
  const alt = alteDaten(vorhanden);
  const daten = ordne(
    {
      marken: ordneListe(
        m.marken.map((x) => ({ ...x, aliase: [...x.aliase] })),
        SW.marke,
        alt.daten.marken,
      ),
      ignoriert: [...m.ignoriert],
    },
    SW.marken,
    alt.daten,
  );
  return mitFrontmatter(daten, alt.body);
}

export function serializeStatistik(st: Schreibstatistik): string {
  const tage: Roh = {};
  for (const datum of Object.keys(st.tage).sort()) tage[datum] = ordne(st.tage[datum]!, SW.tag);
  return jsonText(ordne({ version: 1, ziel: ordne(st.ziel, SW.ziel), tage }, SW.statistik));
}

export function serializeFassungen(f: BenannteFassung[]): string {
  return jsonText(f.map((x) => ordne({ ...x, dateien: x.dateien.map((d) => ordne(d, SW.fassungsDatei)) }, SW.fassung)));
}

export function serializeLektorat(a: LektoratsAenderung[]): string {
  return jsonText(a.map((x) => ordne({ ...x, anker: anker(x.anker) }, SW.aenderung)));
}

export function serializeRecherche(r: Recherche): string {
  return jsonText(
    ordne(
      {
        version: 1,
        eintraege: r.eintraege.map((e) =>
          ordne({ ...e, verweise: e.verweise.map((v) => ordne(v, SW.verweis)), schlagworte: e.schlagworte ? [...e.schlagworte] : undefined }, SW.rechercheEintrag),
        ),
      },
      SW.recherche,
    ),
  );
}

function serializeKiAblage<T>(a: KiAblage<T>, eintrag: (x: T) => Roh): string {
  return jsonText(ordne({ version: 1, eintraege: a.eintraege.map(eintrag), lauf: a.lauf ? ordne(a.lauf, SW.lauf) : undefined }, SW.ablage));
}

export const serializeKiZeitVorschlaege = (a: KiAblage<ZeitVorschlag>) =>
  serializeKiAblage(a, (v) => ordne({ ...v, zeit: zeitpunkt(v.zeit), belege: zitate(v.belege) }, SW.zeitVorschlag));

export const serializeKiZustandVorschlaege = (a: KiAblage<ZustandVorschlag>) =>
  serializeKiAblage(a, (v) => ordne({ ...v, belege: zitate(v.belege) }, SW.zustandVorschlag));

export const serializeKiStimmen = (a: KiAblage<StimmenBeobachtung>) =>
  serializeKiAblage(a, (v) => ordne({ ...v, zitate: zitate(v.zitate), vergleich: zitate(v.vergleich) }, SW.stimme));

export const serializeKiFakten = (a: KiAblage<FigurFakt>) =>
  serializeKiAblage(a, (v) => ordne({ ...v, zitat: zitate([v.zitat])[0] }, SW.fakt));

export const serializeKiLeser = (a: KiAblage<LeserStand>) =>
  serializeKiAblage(a, (v) =>
    ordne(
      {
        ...v,
        weiss: v.weiss.map((w) => ordne({ ...w, belege: zitate(w.belege) }, SW.leserAussage)),
        fragen: v.fragen.map((f) => ordne({ ...f, belege: zitate(f.belege) }, SW.leserFrage)),
        vermutungen: v.vermutungen?.map((w) => ordne({ ...w, belege: zitate(w.belege) }, SW.leserAussage)),
        spannung: v.spannung?.map((w) => ordne({ ...w, belege: zitate(w.belege) }, SW.leserAussage)),
        plan: v.plan?.map((p) => ordne({ ...p, belege: zitate(p.belege) }, SW.leserPlan)),
      },
      SW.leser,
    ),
  );

export const serializeKiFragen = (a: KiAblage<BuchFrage>) =>
  serializeKiAblage(a, (v) => ordne({ ...v, belege: zitate(v.belege) }, SW.buchFrage));

// ---------------------------------------------------------------------------
// Speichern über ProjektDateisystem
// ---------------------------------------------------------------------------

/**
 * Schreibt `inhalt`, wenn er sich vom Dateiinhalt unterscheidet. Gibt true zurück, wenn geschrieben wurde.
 * Ist die vorhandene Datei kein gültiges JSON (`jsonPruefen`), wird vorher ein Schnappschuss angelegt.
 */
export async function schreibeWennGeaendert(
  fs: ProjektDateisystem,
  pfad: string,
  inhalt: string | ((vorhanden: string | null) => string),
  jsonPruefen = false,
): Promise<boolean> {
  const vorhanden = await fs.lesen(pfad);
  const neu = typeof inhalt === 'function' ? inhalt(vorhanden) : inhalt;
  if (neu === vorhanden) return false;
  if (jsonPruefen && vorhanden !== null) {
    try {
      JSON.parse(vorhanden);
    } catch {
      await schnappschuss(fs, pfad, new Date());
    }
  }
  await fs.schreiben(pfad, neu);
  return true;
}

export const speichereProjekt = (fs: ProjektDateisystem, p: Projekt) =>
  schreibeWennGeaendert(fs, PFADE.projekt, (v) => serializeProjekt(p, v));

export const speichereKapitel = (fs: ProjektDateisystem, k: Kapitel) =>
  schreibeWennGeaendert(fs, kapitelPfad(k.id), (v) => serializeKapitel(k, v));

export const speicherePlan = (fs: ProjektDateisystem, p: KapitelPlan) =>
  schreibeWennGeaendert(fs, planPfad(p.id), (v) => serializeKapitelPlan(p, v));

export const speichereAkte = (fs: ProjektDateisystem, akte: Akt[]) =>
  schreibeWennGeaendert(fs, PFADE.akte, (v) => serializeAkte(akte, v));

export const speichereStraenge = (fs: ProjektDateisystem, straenge: Strang[]) =>
  schreibeWennGeaendert(fs, PFADE.straenge, (v) => serializeStraenge(straenge, v));

export const speichereIdeen = (fs: ProjektDateisystem, ideen: Idee[]) =>
  schreibeWennGeaendert(fs, PFADE.ideen, (v) => serializeIdeen(ideen, v));

export const speichereMotive = (fs: ProjektDateisystem, motive: Motiv[]) =>
  schreibeWennGeaendert(fs, PFADE.motive, (v) => serializeMotive(motive, v));

export const speichereFigur = (fs: ProjektDateisystem, f: Figur) =>
  schreibeWennGeaendert(fs, figurPfad(f.id), (v) => serializeFigur(f, v));

export const speichereGruppe = (fs: ProjektDateisystem, g: Gruppe) =>
  schreibeWennGeaendert(fs, gruppePfad(g.id), (v) => serializeGruppe(g, v));

export const speichereOrt = (fs: ProjektDateisystem, o: Ort) =>
  schreibeWennGeaendert(fs, ortPfad(o.id), (v) => serializeOrt(o, v));

export const speichereAnmerkungen = (fs: ProjektDateisystem, a: Anmerkung[]) =>
  schreibeWennGeaendert(fs, PFADE.anmerkungen, serializeAnmerkungen(a), true);

export const speichereEntscheidungen = (fs: ProjektDateisystem, e: Entscheidungen) =>
  schreibeWennGeaendert(fs, PFADE.entscheidungen, serializeEntscheidungen(e), true);

export const speichereAnalyse = (fs: ProjektDateisystem, a: KapitelAnalyse) =>
  schreibeWennGeaendert(fs, analysePfad(a.kapitel), serializeAnalyse(a), true);

export const speichereHinweise = (fs: ProjektDateisystem, h: Hinweis[]) =>
  schreibeWennGeaendert(fs, PFADE.hinweise, serializeHinweise(h), true);

export const speichereKiVorschlaege = (fs: ProjektDateisystem, v: import('../model/types').KiVorschlaege) =>
  schreibeWennGeaendert(fs, PFADE.vorschlaege, serializeKiVorschlaege(v), true);

// Werkzeuge G1–G8

export const speichereZeitleiste = (fs: ProjektDateisystem, z: Zeitleiste) =>
  schreibeWennGeaendert(fs, PFADE.zeitleiste, (v) => serializeZeitleiste(z, v));

export const speichereFadenplanung = (fs: ProjektDateisystem, f: Fadenplanung) =>
  schreibeWennGeaendert(fs, PFADE.faeden, (v) => serializeFadenplanung(f, v));

export const speichereBoegen = (fs: ProjektDateisystem, b: Figurenbogen[]) =>
  schreibeWennGeaendert(fs, PFADE.boegen, (v) => serializeBoegen(b, v));

export const speichereMarken = (fs: ProjektDateisystem, m: Markenliste) =>
  schreibeWennGeaendert(fs, PFADE.marken, (v) => serializeMarken(m, v));

export const speichereStatistik = (fs: ProjektDateisystem, st: Schreibstatistik) =>
  schreibeWennGeaendert(fs, PFADE.statistik, serializeStatistik(st), true);

export const speichereFassungen = (fs: ProjektDateisystem, f: BenannteFassung[]) =>
  schreibeWennGeaendert(fs, PFADE.fassungen, serializeFassungen(f), true);

export const speichereLektorat = (fs: ProjektDateisystem, a: LektoratsAenderung[]) =>
  schreibeWennGeaendert(fs, PFADE.lektorat, serializeLektorat(a), true);

export const speichereRecherche = (fs: ProjektDateisystem, r: Recherche) =>
  schreibeWennGeaendert(fs, PFADE.recherche, serializeRecherche(r), true);

export const speichereKiZeitVorschlaege = (fs: ProjektDateisystem, a: KiAblage<ZeitVorschlag>) =>
  schreibeWennGeaendert(fs, PFADE.kiZeit, serializeKiZeitVorschlaege(a), true);

export const speichereKiZustandVorschlaege = (fs: ProjektDateisystem, a: KiAblage<ZustandVorschlag>) =>
  schreibeWennGeaendert(fs, PFADE.kiZustand, serializeKiZustandVorschlaege(a), true);

export const speichereKiStimmen = (fs: ProjektDateisystem, a: KiAblage<StimmenBeobachtung>) =>
  schreibeWennGeaendert(fs, PFADE.kiStimmen, serializeKiStimmen(a), true);
export const speichereKiFakten = (fs: ProjektDateisystem, a: KiAblage<FigurFakt>) =>
  schreibeWennGeaendert(fs, PFADE.kiFakten, serializeKiFakten(a), true);

export const speichereKiLeser = (fs: ProjektDateisystem, a: KiAblage<LeserStand>) =>
  schreibeWennGeaendert(fs, PFADE.kiLeser, serializeKiLeser(a), true);

export const speichereKiFragen = (fs: ProjektDateisystem, a: KiAblage<BuchFrage>) =>
  schreibeWennGeaendert(fs, PFADE.kiFragen, serializeKiFragen(a), true);

// ---------------------------------------------------------------------------
// Schnappschüsse und Entfernen
// ---------------------------------------------------------------------------

/**
 * Kopiert den aktuellen Inhalt von `pfad` nach .versionen/… (core/versionen). null = Datei fehlt.
 * Gibt es in derselben Sekunde schon einen anderen Schnappschuss, bekommt der neue den Zusatz „-2“, „-3“ …;
 * ein identischer wird nicht doppelt angelegt.
 */
export async function schnappschuss(fs: ProjektDateisystem, pfad: string, zeit: Date): Promise<string | null> {
  const inhalt = await fs.lesen(pfad);
  if (inhalt === null) return null;
  for (let n = 1; ; n++) {
    const ziel = versionsPfadMitZusatz(pfad, zeit, n);
    const vorhanden = await fs.lesen(ziel);
    if (vorhanden === inhalt) return ziel;
    if (vorhanden === null) {
      await fs.schreiben(ziel, inhalt);
      return ziel;
    }
  }
}

/** Entfernt eine Datei, vorher Schnappschuss. Gibt den Schnappschuss-Pfad zurück (null = Datei fehlte). */
export async function entferneMitSchnappschuss(fs: ProjektDateisystem, pfad: string, zeit = new Date()): Promise<string | null> {
  const ziel = await schnappschuss(fs, pfad, zeit);
  if (ziel !== null) await fs.entfernen(pfad);
  return ziel;
}
