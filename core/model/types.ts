/**
 * Plotwerk – gemeinsames Datenmodell.
 *
 * Diese Datei ist der Vertrag zwischen allen Modulen. Änderungen nur additiv
 * (neue optionale Felder), nie umbenennen oder entfernen, ohne alle Nutzer
 * anzupassen. Siehe docs/architektur.md.
 */

/** Stabile ID. Wird einmal bei der Anlage aus dem Titel abgeleitet (Slug) und nie wieder geändert. */
export type Id = string;

export type KapitelStatus = 'geplant' | 'entwurf' | 'geschrieben';

/** Realitätsebene für Figuren, Ereignisse und Textstellen. */
export type Realitaet = 'gesichert' | 'offen' | 'bewusst_vage';

// ---------------------------------------------------------------------------
// Projekt (projekt.md)
// ---------------------------------------------------------------------------

/** KI-Anbieter: Claude in Microsoft Foundry oder die Claude API von Anthropic direkt. */
export type KiAnbieter = 'foundry' | 'claude';

/** Modell je Aufgabe (Foundry: Deployment-Namen, Claude API: Modell-IDs). */
export interface KiModelle {
  /** Erkennung von Figuren/Orten pro Kapitel (Standard: claude-haiku-5-5) */
  erkennung: string;
  /** Konsistenzprüfung, Zusammenfassungen (Standard: claude-sonnet-5-5) */
  pruefung: string;
  /** Optionaler Tiefencheck des ganzen Buchs (Standard: claude-opus-5-5) */
  tiefencheck: string;
}

/** Claude API (Anthropic direkt). Schlüssel im Schlüsselbund, Konto „anthropic-api“. */
export interface KiClaudeEinstellungen {
  /** Basis-URL ohne /v1/messages (Standard: https://api.anthropic.com) */
  endpoint: string;
  /** Modell-IDs (Standard: claude-haiku-5-5, claude-sonnet-5-5, claude-opus-5-5) */
  modelle: KiModelle;
}

export interface KiEinstellungen {
  /** Foundry: z. B. https://<resource>.services.ai.azure.com/anthropic – ohne /v1/messages */
  endpoint: string;
  /** Foundry: Deployment-Namen */
  deployments: {
    /** Erkennung von Figuren/Orten pro Kapitel (Standard: claude-haiku-5-5) */
    erkennung: string;
    /** Konsistenzprüfung, Zusammenfassungen (Standard: claude-sonnet-5-5) */
    pruefung: string;
    /** Optionaler Tiefencheck des ganzen Buchs (Standard: claude-opus-5-5) */
    tiefencheck: string;
  };
  /** Gewählter Anbieter. Fehlt (ältere projekt.md) = 'foundry'. */
  anbieter?: KiAnbieter;
  /** Einstellungen der Claude API; bleiben erhalten, solange Foundry gewählt ist. */
  claude?: KiClaudeEinstellungen;
}

export interface Projekt {
  version: 1;
  titel: string;
  /** Reihenfolge aller Kapitel (IDs). Einzige Quelle der Reihenfolge. */
  kapitel: Id[];
  ki?: KiEinstellungen;
  /** G7: Angaben zum Buch (Exposé, EPUB, Normseite) */
  angaben?: ProjektAngaben;
  /** Freitext unterhalb des Frontmatters */
  notiz: string;
}

// ---------------------------------------------------------------------------
// Manuskript (manuskript/<id>.md) – Frontmatter {id, titel}, Body = Markdown
// ---------------------------------------------------------------------------

export interface Kapitel {
  id: Id;
  titel: string;
  /** Markdown-Body ohne Frontmatter. Absätze durch Leerzeile, **fett**, *kursiv*, "* * *" = Szenentrenner. */
  text: string;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type AbweichungsEntscheidung = 'plan_anpassen' | 'alternative' | 'spaeter';

export interface Abweichung {
  id: Id;
  notiz: string;
  entscheidung: AbweichungsEntscheidung;
  /** ISO-Datum */
  datum: string;
  /** Plan-Notiz zum Zeitpunkt der Abweichung (alter Plan bleibt erhalten) */
  alterPlan?: string;
}

/** Ein Ereignis oder eine Textstelle mit Realitätsebene (K-04). */
export interface RealitaetsEintrag {
  id: Id;
  text: string;
  stufe: Realitaet;
  anker?: TextAnker;
}

/** plan/kapitel/<id>.md – gleiche ID wie das Manuskript-Kapitel. Body = „Was soll hier passieren?“ */
export interface KapitelPlan {
  id: Id;
  titel: string;
  /** Aktnummer; null = noch keinem Akt zugeordnet */
  akt: number | null;
  status: KapitelStatus;
  /** Kurzbeschreibung in einer Zeile (Oberfläche „Kurzbeschreibung“, früher „Geplante Szene“), z. B. „Paul trifft Lotte am Lindenhof“ */
  szene: string;
  /** Funktion des Kapitels im Buch, z. B. „Opening“, „Wendepunkt“ (Vorschläge in der Oberfläche oder frei). Nicht an die KI. */
  funktion?: string;
  straenge: Id[];
  figuren: Id[];
  orte: Id[];
  notiz: string;
  abweichungen: Abweichung[];
  realitaet: RealitaetsEintrag[];
  /** G1: wann das Kapitel spielt */
  zeit?: Zeitpunkt;
  /** G2: Szenen des Kapitels (Reihenfolge = index) */
  szenen?: Szene[];
}

/** plan/akte.md – Frontmatter {akte: Akt[]} */
export interface Akt {
  nummer: number;
  titel: string;
  quintessenz: string;
  wendepunkt: string;
  /** Gruppen-IDs aktiver Antagonisten */
  antagonisten: Id[];
}

/** Haupthandlung oder Nebenhandlung */
export type StrangRolle = 'haupt' | 'neben';

/** plan/straenge.md – Frontmatter {straenge: Strang[]} */
export interface Strang {
  id: Id;
  name: string;
  /** Hex-Farbe aus den Design-Tokens, z. B. #3D5A75 */
  farbe: string;
  /** Wenn der Strang zu einer Gruppe (Antagonist) gehört */
  gruppe?: Id;
  /** Haupthandlung oder Nebenhandlung; fehlt = nicht festgelegt */
  rolle?: StrangRolle;
  /** „Wofür steht der Strang?“ – Zweck des Erzählstrangs in Leons Worten */
  beschreibung?: string;
}

/** plan/ideen.md – Frontmatter {ideen: Idee[]} */
export interface Idee {
  id: Id;
  titel: string;
  notiz: string;
  straenge: Id[];
}

/**
 * plan/motive.md – Frontmatter {motive: Motiv[]}. Wiederkehrende Motive (Bleistifte, Postkarten …), im Tab
 * „Erkannt“ pro Kapitel gezählt (S-10). Erkennung wie bei Namen mit Wortgrenzen.
 */
export interface Motiv {
  id: Id;
  name: string;
  /** weitere Wortformen, z. B. „Bleistift“ zu „Bleistifte“ */
  aliase: string[];
}

// ---------------------------------------------------------------------------
// Figuren, Gruppen, Orte
// ---------------------------------------------------------------------------

export type BeziehungsKategorie = 'arbeit' | 'dates' | 'sonstige';

export interface Beziehung {
  zu: Id;
  art: string;
  /** Kapitel-ID, ab dem die Bezeichnung gilt (Zeitregler B-02) */
  abKapitel?: Id;
  kategorie: BeziehungsKategorie;
  strang?: Id;
  notiz?: string;
  /** gestrichelt darstellen: nur erwähnt oder unsicher */
  unsicher?: boolean;
}

export type FigurRolle = 'haupt' | 'neben' | 'statist';

/** F-16: Kontext zu einem Spitznamen (der Name selbst steht in `Figur.aliase`, das die Erkennung speist). */
export interface SpitznameKontext {
  /** wie in `aliase` */
  name: string;
  /** Figuren, die die Figur so nennen */
  von?: Id[];
  /** gilt ab diesem Kapitel (früher im Text → Hinweis) */
  abKapitel?: Id;
  notiz?: string;
}

/** figuren/<id>.md – Body-Abschnitte „## Wahrheit hinter den Kulissen“ und „## Notizen“ (beide privat) */
export interface Figur {
  id: Id;
  name: string;
  aliase: string[];
  /** Zusätzliche Wortformen für die Erkennung (z. B. „Herrn Kessler“). Genitiv-s wird automatisch erkannt. */
  formen?: string[];
  rolle: FigurRolle;
  /** Kurzbeschreibung für Listen und Netzkarten, z. B. „Jugendfreundin“, „Ich-Erzähler“ (Plan, nicht an die KI) */
  kurz?: string;
  existenz: Realitaet;
  /** Hauptgruppe (Farbe, Platz im Netz); maßgeblich für die Mitgliedschaft ist Gruppe.mitglieder (A-05: mehrere Gruppen) */
  gruppe: Id | null;
  beziehungen: Beziehung[];
  /** Freie Planungsfelder („Deine Planung“), Reihenfolge = Anzeige-Reihenfolge */
  plan: Record<string, string>;
  /** PRIVAT – geht nie an die KI */
  wahrheit: string;
  /** PRIVAT – geht nie an die KI */
  notizen: string;
  /** Position der Karte im Beziehungsnetz */
  netz?: { x: number; y: number };
  /**
   * F-13: nach so vielen Kapiteln ohne Vorkommen melden; null = nie; fehlt = nach Rolle
   * (Hauptfigur 3, Nebenfigur 6, Statist nie)
   */
  ruheSchwelle?: number | null;
  /** F-16: Kontext je Spitzname (nur für Namen in `aliase`) */
  spitznamen?: SpitznameKontext[];
}

export type GruppenTyp = 'antagonist' | 'firma' | 'familie' | 'sonstige';

export interface Spur {
  id: Id;
  text: string;
  kapitel: Id;
  anker?: TextAnker;
  status: 'vorschlag' | 'bestaetigt' | 'verworfen';
}

/** gruppen/<id>.md */
export interface Gruppe {
  id: Id;
  name: string;
  typ: GruppenTyp;
  status: 'im_text' | 'geplant';
  mitglieder: Id[];
  strang?: Id;
  spuren: Spur[];
  /** Präsenz pro Akt (manuell geplant), z. B. {1: 'eingeführt', 2: 'Druck'} */
  praesenz: Record<number, string>;
  /** PRIVAT */
  notizen: string;
  /** Fläche im Beziehungsnetz */
  netz?: { x: number; y: number; breite: number; hoehe: number };
  /** A-06: Rolle eines Mitglieds in der Gruppe (Figur-ID → z. B. „Chef“, „Praktikant“) */
  rollen?: Record<Id, string>;
}

/** orte/<id>.md – Body = Beschreibung (Plan), Abschnitt „## Notizen“ privat */
export interface Ort {
  id: Id;
  name: string;
  aliase: string[];
  /** Übergeordneter Ort (Zeichensaal → Büro) */
  in?: Id;
  beschreibung: string;
  notizen: string;
}

// ---------------------------------------------------------------------------
// Anker, Anmerkungen, Entscheidungen
// ---------------------------------------------------------------------------

/**
 * Verankerung einer Textstelle über Zitat + Kontext (W3C TextQuoteSelector).
 * Übersteht Bearbeitungen außerhalb der App; Positionen werden nur abgeleitet.
 * Alle Strings beziehen sich auf den normalisierten Klartext (siehe core/text).
 */
export interface TextAnker {
  kapitel: Id;
  exakt: string;
  /** bis zu 32 Zeichen vor der Stelle */
  davor: string;
  /** bis zu 32 Zeichen nach der Stelle */
  danach: string;
}

export type VerweisTyp = 'figur' | 'ort' | 'kapitel' | 'plan' | 'idee' | 'gruppe';

export interface Verweis {
  typ: VerweisTyp;
  id: Id;
}

/** anmerkungen.json – Array */
export interface Anmerkung {
  id: Id;
  anker: TextAnker;
  notiz: string;
  /** woran die Notiz geheftet ist (Figur, Ort, Kapitel, Plan-Karte) */
  ziel: Verweis | null;
  erstellt: string;
  /** Herkunft: aus einem Word-Kommentar beim Import übernommen */
  quelle?: 'word';
  /** Autor des Word-Kommentars */
  autor?: string;
}

export type HinweisEntscheidung = 'absicht' | 'erledigt';

export interface Schreibweise {
  /** alle bekannten Varianten inkl. der gültigen */
  varianten: string[];
  gueltig: string;
  ziel?: Verweis;
}

/** entscheidungen.json – alles, was Leon entscheidet und was nie neu berechnet werden darf */
export interface Entscheidungen {
  version: 1;
  schreibweisen: Schreibweise[];
  /** Hinweis-Schlüssel → Entscheidung; wird nie erneut gemeldet */
  hinweise: { schluessel: string; entscheidung: HinweisEntscheidung; datum: string }[];
  /** bestätigte/verworfene KI-Vorschläge für Erwähnungen */
  zuordnungen: {
    anker: TextAnker;
    ziel: Verweis | null;
    status: 'bestaetigt' | 'verworfen';
  }[];
  /** Status loser Enden */
  faeden: { id: Id; status: 'offen' | 'erledigt' | 'bewusst_offen' }[];
  /** Von Leon bearbeitete Zusammenfassungen – werden nie überschrieben */
  zusammenfassungen: {
    kapitel: Id;
    text: string;
    kurz?: string;
    wendung?: string;
    /** Text-Hash des Kapitels, auf dem die Bearbeitung basiert → sonst „veraltet“ */
    basisHash: string;
  }[];
  /** Realitätsebene für Textstellen, die nicht an einem Kapitelplan hängen */
  realitaet: { anker: TextAnker; stufe: Realitaet }[];
}

// ---------------------------------------------------------------------------
// Abgeleitete Daten (Index / Analysen)
// ---------------------------------------------------------------------------

export type ErwaehnungsArt = 'auftritt' | 'erwaehnt' | 'nachricht' | 'unbestimmt';

export interface Erwaehnung {
  zielTyp: 'figur' | 'ort';
  ziel: Id;
  kapitel: Id;
  /** Absatzindex im Kapitel (0-basiert) */
  absatz: number;
  /** Zeichenoffsets im Klartext des Kapitels (core/text klartext, nicht normalisiert) */
  start: number;
  ende: number;
  /** tatsächlich gefundener Text, z. B. „Pauls“ */
  treffer: string;
  art: ErwaehnungsArt;
  quelle: 'exakt' | 'ki';
  bestaetigt: boolean;
}

export type HinweisTyp =
  | 'pruefen'
  | 'schreibweise'
  | 'offener_faden'
  | 'unbekannt'
  | 'struktur'
  | 'zeitleiste'
  | 'sprache'
  /** lokal: Namen und Vorkommen von Figuren (F-11–F-13) */
  | 'figuren';

export interface Zitat {
  kapitel: Id;
  /** wörtlich im Kapiteltext (nach Normalisierung) */
  text: string;
}

export interface Hinweis {
  /** stabiler Schlüssel aus Typ + normalisierten Zitaten (für Entscheidungen) */
  schluessel: string;
  typ: HinweisTyp;
  titel: string;
  zitate: Zitat[];
  erklaerung: string;
  quelle: 'lokal' | 'ki';
  /** Hinweis betrifft etwas mit Realitätsebene „offen“ */
  offen?: boolean;
  /** F-05: Der Text widerspricht der Planung dieser Figur bzw. dieses Kapitels */
  plan?: { figur?: Id; kapitel?: Id; feld?: string };
  status: 'neu' | HinweisEntscheidung;
}

export interface LoseEnde {
  /** stabiler Slug aus dem Namen */
  id: Id;
  name: string;
}

/** .plotwerk/analysen/<kapitel-id>.json – bezahltes KI-Ergebnis, bleibt im Projektordner */
export interface KapitelAnalyse {
  kapitel: Id;
  textHash: string;
  zusammenfassung: string;
  /** Einzeiler für „Bis hierhin passiert“ */
  kurz: string;
  wendung: string;
  antagonistenBezug: string;
  /** lose Enden, die in diesem Kapitel eröffnet oder aufgegriffen werden */
  loseEnden: { id: Id; name: string; eroeffnet: boolean }[];
  modell: string;
  datum: string;
}

export interface Faden {
  id: Id;
  name: string;
  eroeffnetIn: Id;
  aufgegriffenIn: Id[];
  zuletztIn: Id;
  status: 'offen' | 'erledigt' | 'bewusst_offen';
}

// ---------------------------------------------------------------------------
// Gesamtzustand eines geladenen Projekts
// ---------------------------------------------------------------------------

export interface ProjektDaten {
  projekt: Projekt;
  kapitel: Record<Id, Kapitel>;
  plaene: Record<Id, KapitelPlan>;
  akte: Akt[];
  straenge: Strang[];
  ideen: Idee[];
  /** plan/motive.md; fehlt bei Daten aus älteren Ständen (dann keine Motive) */
  motive?: Motiv[];
  figuren: Record<Id, Figur>;
  gruppen: Record<Id, Gruppe>;
  orte: Record<Id, Ort>;
  anmerkungen: Anmerkung[];
  entscheidungen: Entscheidungen;
  /** KI-Ergebnisse aus .plotwerk/analysen */
  analysen: Record<Id, KapitelAnalyse>;
  /** KI-Hinweise aus .plotwerk/hinweise.json */
  kiHinweise: Hinweis[];
  /** KI-Vorschläge für Figuren, Orte, Beziehungen aus .plotwerk/vorschlaege.json; fehlt, solange es keine gibt */
  kiVorschlaege?: KiVorschlaege;

  // Werkzeuge G1–G8 (Typen unten). Leons Dateien füllt ladeProjekt mit Standardwerten;
  // KI-Ablagen fehlen, solange es die Datei nicht gibt.
  /** G1 plan/zeitleiste.md */
  zeitleiste?: Zeitleiste;
  /** G2 plan/faeden.md */
  fadenplanung?: Fadenplanung;
  /** G3 plan/boegen.md */
  boegen?: Figurenbogen[];
  /** G4 plan/marken.md */
  marken?: Markenliste;
  /** G5 statistik.json */
  statistik?: Schreibstatistik;
  /** G5 fassungen.json */
  fassungen?: BenannteFassung[];
  /** G7 lektorat/aenderungen.json */
  lektorat?: LektoratsAenderung[];
  /** G8 recherche/recherche.json */
  recherche?: Recherche;
  /** G1 .plotwerk/zeit-vorschlaege.json */
  kiZeitVorschlaege?: KiAblage<ZeitVorschlag>;
  /** G1 .plotwerk/zustand-vorschlaege.json */
  kiZustandVorschlaege?: KiAblage<ZustandVorschlag>;
  /** G3 .plotwerk/stimmen.json */
  kiStimmen?: KiAblage<StimmenBeobachtung>;
  /** F-17 .plotwerk/figurenfakten.json */
  kiFakten?: KiAblage<FigurFakt>;
  /** G6 .plotwerk/leser.json */
  kiLeser?: KiAblage<LeserStand>;
  /** G6 .plotwerk/fragen.json */
  kiFragen?: KiAblage<BuchFrage>;
  /** G2 .plotwerk/strang-vorschlaege.json */
  kiStrangVorschlaege?: KiAblage<StrangVorschlag>;
}

// ---------------------------------------------------------------------------
// KI-Vorschläge für Figuren, Orte und Beziehungen (.plotwerk/vorschlaege.json)
// Besitzer: KI. Bezahltes KI-Ergebnis im Projektordner (E2). Leon übernimmt oder verwirft jeden
// Vorschlag; Verworfenes wird nie erneut vorgeschlagen (Abgleich über `schluessel`).
// ---------------------------------------------------------------------------

export type VorschlagsStatus = 'neu' | 'uebernommen' | 'verworfen';

/** Verweis eines Vorschlags auf etwas Angelegtes (Figur-/Orts-ID) oder auf einen anderen Vorschlag (dessen Schlüssel). */
export interface VorschlagsVerweis {
  typ: 'angelegt' | 'vorschlag';
  /** angelegt: Figur- bzw. Orts-ID · vorschlag: `schluessel` des Figur- bzw. Ortsvorschlags */
  id: string;
  /** Name zum Zeitpunkt des Vorschlags (Anzeige) */
  name: string;
}

export interface FigurVorschlag {
  /** stabiler Schlüssel „figur:<slug des Namens>“ */
  schluessel: string;
  name: string;
  aliase: string[];
  rolle: FigurRolle;
  /** eine sachliche Zeile, was der Text über die Figur sagt; wird bei der Übernahme zu Figur.kurz */
  kurz: string;
  /** wörtliche Zitate (E6) */
  belege: Zitat[];
  status: VorschlagsStatus;
  /** nach der Übernahme: ID der angelegten Figur */
  figur?: Id;
  /**
   * F-10: keine neue Figur, sondern Spitznamen (`name` und `aliase`) für diese angelegte Figur;
   * Schlüssel „spitzname:<figur>|<slug der Namen>“
   */
  ziel?: Id;
}

export interface OrtVorschlag {
  /** stabiler Schlüssel „ort:<slug des Namens>“ */
  schluessel: string;
  name: string;
  aliase: string[];
  /** übergeordneter Ort (angelegt oder ebenfalls vorgeschlagen) */
  in?: VorschlagsVerweis;
  belege: Zitat[];
  status: VorschlagsStatus;
  /** nach der Übernahme: ID des angelegten Orts */
  ort?: Id;
}

export interface BeziehungsVorschlag {
  /** stabiler Schlüssel „beziehung:<slug a>|<slug b>@<abKapitel>“ (Paar alphabetisch, Slugs der Namen) */
  schluessel: string;
  /** die Beziehung wird bei der Übernahme an dieser Figur gespeichert */
  von: VorschlagsVerweis;
  zu: VorschlagsVerweis;
  /** kurze Bezeichnung, höchstens vier Wörter („Kollege“, „Jugendfreundin“) */
  art: string;
  kategorie: BeziehungsKategorie;
  /** Kapitel des ersten Belegs (Zeitregler) */
  abKapitel?: Id;
  unsicher: boolean;
  /** mindestens ein wörtliches Zitat (E6) */
  belege: Zitat[];
  begruendung: string;
  status: VorschlagsStatus;
}

/** .plotwerk/vorschlaege.json */
export interface KiVorschlaege {
  version: 1;
  figuren: FigurVorschlag[];
  orte: OrtVorschlag[];
  beziehungen: BeziehungsVorschlag[];
  /** letzter Lauf */
  lauf?: { datum: string; modell: string };
}

// ===========================================================================
// Werkzeuge (G1–G8, ab 2026-10-10). Nur additiv. Ablage: docs/architektur.md „Projektordner-Format“.
// Leons Daten liegen als Markdown/JSON im Projektordner, bezahlte KI-Ergebnisse unter .plotwerk/ (E2).
// ===========================================================================

// ---------------------------------------------------------------------------
// Gemeinsam
// ---------------------------------------------------------------------------

/** Status einer KI-Beobachtung, über die Leon entscheidet (wie bei Hinweisen). */
export type KiBeobachtungsStatus = 'neu' | HinweisEntscheidung;

/** Ablage für bezahlte KI-Ergebnisse unter .plotwerk/ (E2): je Datei eine Liste plus letzter Lauf. */
export interface KiAblage<T> {
  version: 1;
  eintraege: T[];
  /** letzter Lauf */
  lauf?: { datum: string; modell: string; kostenUsd?: number };
}

/** Angaben zum Buch (projekt.md, Feld `angaben`) – für Exposé, EPUB, Normseiten-Export (G7). Nicht an die KI. */
export interface ProjektAngaben {
  autor?: string;
  untertitel?: string;
  genre?: string;
  /** Sprache des Buchs als BCP-47-Code, Standard „de“ */
  sprache?: string;
}

// ---------------------------------------------------------------------------
// G1 Zeit & Zustand – plan/zeitleiste.md, Zeitpunkte an KapitelPlan/Szene,
// KI: .plotwerk/zeit-vorschlaege.json, .plotwerk/zustand-vorschlaege.json
// ---------------------------------------------------------------------------

export type Wochentag = 'montag' | 'dienstag' | 'mittwoch' | 'donnerstag' | 'freitag' | 'samstag' | 'sonntag';

export type Tageszeit = 'frueh' | 'morgens' | 'vormittags' | 'mittags' | 'nachmittags' | 'abends' | 'nachts';

/** fest = im Text belegt oder von Leon gesetzt · ungefaehr = erschlossen · unklar = Platzhalter */
export type ZeitSicherheit = 'fest' | 'ungefaehr' | 'unklar';

/** Wann ein Kapitel bzw. eine Szene spielt. Alle Angaben optional außer der Sicherheit. */
export interface Zeitpunkt {
  /** Tag der Handlung relativ zum Beginn: 1 = erster Tag, 0/negativ = davor (Rückblende) */
  tag?: number;
  wochentag?: Wochentag;
  /** ISO-Datum YYYY-MM-DD */
  datum?: string;
  tageszeit?: Tageszeit;
  /** „HH:MM“ (24 h) */
  uhrzeit?: string;
  /** Dauer in Minuten */
  dauer?: number;
  sicherheit: ZeitSicherheit;
  /** Textstelle, die den Zeitpunkt belegt (E4) */
  beleg?: TextAnker;
  notiz?: string;
}

/** Ein Zustand aus der frei erweiterbaren Liste („ausgeruht“, „erschöpft“, „krank“, „verletzt“, „betrunken“ …). */
export interface ZustandsArt {
  id: Id;
  name: string;
  /** Name eines Farb-Tokens aus src/theme/tokens.css ohne „--“, z. B. „real-gesichert“ */
  farbe: string;
}

/** Zustand einer Figur in einem Kapitel bzw. einer Szene (Zustandskurve, „Pauls Zustand“). */
export interface FigurZustand {
  id: Id;
  figur: Id;
  kapitel: Id;
  /** Szenen-ID; fehlt = ganzes Kapitel */
  szene?: Id;
  /** ID einer ZustandsArt */
  zustand: Id;
  notiz?: string;
  beleg?: TextAnker;
}

/** plan/zeitleiste.md – Frontmatter {beginn, zustandsarten, zustaende}, Body = freie Notiz. */
export interface Zeitleiste {
  /** Bezug für relative Tage: Tag 1 ist dieser Wochentag bzw. dieses Datum */
  beginn?: { wochentag?: Wochentag; datum?: string };
  /** konfigurierbare Zustandsliste (fehlt in der Datei → STANDARD_ZUSTANDSARTEN) */
  zustandsarten: ZustandsArt[];
  zustaende: FigurZustand[];
  notiz: string;
}

/** KI-Vorschlag für einen Zeitpunkt (.plotwerk/zeit-vorschlaege.json); Leon übernimmt oder verwirft. */
export interface ZeitVorschlag {
  /** stabiler Schlüssel „zeit:<kapitel>“ bzw. „zeit:<kapitel>#<szene>“ */
  schluessel: string;
  kapitel: Id;
  szene?: Id;
  zeit: Zeitpunkt;
  /** wörtliche Zitate (E6) */
  belege: Zitat[];
  begruendung: string;
  status: VorschlagsStatus;
}

/** KI-Vorschlag für einen Figurenzustand (.plotwerk/zustand-vorschlaege.json). */
export interface ZustandVorschlag {
  /** stabiler Schlüssel „zustand:<figur>@<kapitel>“ bzw. „…#<szene>“ */
  schluessel: string;
  figur: Id;
  kapitel: Id;
  szene?: Id;
  /** ID einer ZustandsArt */
  zustand: Id;
  belege: Zitat[];
  begruendung: string;
  status: VorschlagsStatus;
}

// ---------------------------------------------------------------------------
// G2 Plot-Struktur – plan/faeden.md, Szenen in plan/kapitel/<id>.md (KapitelPlan.szenen)
// ---------------------------------------------------------------------------

/**
 * Szene innerhalb eines Kapitels. Szenentrenner „* * *“ (eigene Zeile, E3) teilen den Kapiteltext;
 * `index` 0 ist der Text vor dem ersten Trenner. Plan-Daten, liegen im Frontmatter des Kapitelplans.
 */
export interface Szene {
  /** stabil (E1), z. B. „lotte-s2“ – einmal vergeben, nie geändert */
  id: Id;
  /** Kapitel-ID (= Plan-Datei, in der die Szene steht; wird beim Laden gesetzt) */
  kapitel: Id;
  /** Position im Kapitel (0-basiert, Abschnitte zwischen „* * *“) */
  index: number;
  titel: string;
  ort?: Id;
  figuren: Id[];
  zeit?: Zeitpunkt;
  notiz: string;
}

/** Leons Planung zu einem losen Ende (Faden-ID = loseEndeId des Namens oder frei vergeben). */
export interface FadenPlan {
  id: Id;
  /** Name, falls der Faden von Leon angelegt wurde (sonst kommt er aus den Analysen) */
  name?: string;
  /** von Leon angelegt: eröffnet in diesem Kapitel */
  eroeffnetIn?: Id;
  /** geplante Auflösung in Kapitel X */
  aufloesungIn?: Id;
  notiz?: string;
  /** Warnung, wenn der Faden länger als so viele Kapitel ruht (überschreibt den Standard) */
  ruheSchwelle?: number;
  strang?: Id;
}

/**
 * KI-Vorschlag zu Erzählsträngen (.plotwerk/strang-vorschlaege.json). Leon übernimmt oder verwirft jeden Vorschlag;
 * Verworfenes wird nie erneut vorgeschlagen (Abgleich über `schluessel`).
 * - zuordnung: Kapitel `kapitel[0]` gehört zum angelegten Strang `strang` (Schlüssel „zuordnung:<strang>|<kapitel>“)
 * - neu: ein noch nicht angelegter Strang mit Name, Rolle, Zweck und Kapiteln (Schlüssel „strang:<slug des Namens>“)
 * - frage: Rückfrage an Leon (Schlüssel „frage:<slug der Frage>“); seine Antwort geht beim nächsten Lauf mit
 */
export interface StrangVorschlag {
  schluessel: string;
  art: 'zuordnung' | 'neu' | 'frage';
  /** zuordnung: ID des angelegten Strangs · frage: betroffener Strang, falls einer */
  strang?: Id;
  /** neu: Name des vorgeschlagenen Strangs */
  name?: string;
  rolle?: StrangRolle;
  /** neu: Zweck in einem sachlichen Satz (wird bei der Übernahme zu Strang.beschreibung) */
  beschreibung?: string;
  /** Kapitel in Buchreihenfolge (zuordnung: genau eins) */
  kapitel: Id[];
  /** frage: die Rückfrage */
  frage?: string;
  /** frage: Leons Antwort (dann status 'uebernommen') */
  antwort?: string;
  begruendung: string;
  /** wörtliche Zitate (E6), mindestens eins je Kapitel */
  belege: Zitat[];
  status: VorschlagsStatus;
  /** neu: nach der Übernahme die ID des angelegten Strangs */
  angelegt?: Id;
}

/** plan/faeden.md – Frontmatter {ruheSchwelle, faeden}. Status bleibt in entscheidungen.faeden. */
export interface Fadenplanung {
  /** Standard-Schwelle in Kapiteln (K-02: 3) */
  ruheSchwelle: number;
  faeden: FadenPlan[];
}

// ---------------------------------------------------------------------------
// G3 Figuren – plan/boegen.md, KI: .plotwerk/stimmen.json
// ---------------------------------------------------------------------------

/** Geplante Entwicklungsstufe einer Figur. */
export interface BogenStufe {
  id: Id;
  /** Kapitel, in dem die Stufe erreicht wird – oder nur ein Akt */
  kapitel?: Id;
  akt?: number;
  titel: string;
  notiz?: string;
  /** von Leon gewählte Belegstellen aus dem Text (E4) */
  belege: TextAnker[];
}

/** plan/boegen.md – Frontmatter {boegen: Figurenbogen[]}. Plan, geht nicht an die KI. */
export interface Figurenbogen {
  figur: Id;
  stufen: BogenStufe[];
}

/** KI-Beobachtung: Eine Figur klingt in Rede/Ton auffällig anders als sonst (nur Beobachtung, nie Ersatztext). */
export interface StimmenBeobachtung {
  /** stabiler Schlüssel „stimme:<figur>|<normalisierte Zitate>“ */
  schluessel: string;
  figur: Id;
  kapitel: Id;
  titel: string;
  erklaerung: string;
  /** die auffälligen Stellen (wörtlich, E6) */
  zitate: Zitat[];
  /** typische Stellen zum Vergleich (wörtlich, E6) */
  vergleich: Zitat[];
  status: KiBeobachtungsStatus;
}

/**
 * F-17: Angabe über eine Figur, wie sie im Text steht (KI, wörtlich belegt). Widersprüche (gleiches Merkmal,
 * verschiedene Werte) und Abweichungen von der Planung findet die App selbst (core/figuren/fakten.ts).
 */
export interface FigurFakt {
  /** stabiler Schlüssel „fakt:<figur>|<merkmal>|<kapitel>/<zitatkern>“ */
  schluessel: string;
  figur: Id;
  /** Merkmal, z. B. „Alter“, „Beruf“, „Auto“ (möglichst wie ein Planfeld der Figur benannt) */
  merkmal: string;
  /** Wert laut Text, kurz, z. B. „34“, „alter Saab 900“ */
  wert: string;
  kapitel: Id;
  /** Beleg (wörtlich, E6) */
  zitat: Zitat;
  /** „verworfen“: Leon hält die Angabe für falsch erkannt; kommt nicht wieder */
  status: 'neu' | 'verworfen';
}

// ---------------------------------------------------------------------------
// G4 Editor – plan/marken.md
// ---------------------------------------------------------------------------

export interface Marke {
  id: Id;
  name: string;
  /** weitere Schreibweisen („Schwip Schwap“, „schwip-schwap“) */
  aliase: string[];
  /** z. B. „Getränk“, „Auto“, „Mode“ */
  kategorie?: string;
  notiz?: string;
}

/** plan/marken.md – Frontmatter {marken, ignoriert}. Leons Markenliste fürs Lektorat. */
export interface Markenliste {
  marken: Marke[];
  /** Wörter, die die Heuristik nie als Marke melden soll */
  ignoriert: string[];
}

// ---------------------------------------------------------------------------
// G5 Versionen & Statistik – statistik.json, fassungen.json
// ---------------------------------------------------------------------------

export interface TagesStatistik {
  /** an diesem Tag geschriebene Wörter (netto, nie negativ gezählt) */
  geschrieben: number;
  /** Wortzahl des Buchs am Ende des Tages */
  stand: number;
}

/** statistik.json – Schreibziele und Tagesstatistik (Leons Daten, darum im Projektordner). */
export interface Schreibstatistik {
  version: 1;
  ziel: {
    /** Tagesziel in Wörtern; 0 = kein Ziel */
    tagWoerter: number;
    /** angestrebte Länge des Buchs in Wörtern */
    buchWoerter?: number;
    /** ISO-Datum der Abgabe */
    abgabe?: string;
  };
  /** ISO-Datum (YYYY-MM-DD, lokale Zeit) → Statistik */
  tage: Record<string, TagesStatistik>;
}

/** Benannter Schnappschuss mehrerer Dateien („Fassung vor Lektorat“). */
export interface BenannteFassung {
  id: Id;
  name: string;
  /** ISO-Zeitpunkt */
  datum: string;
  notiz?: string;
  /** Originalpfad → Schnappschuss in .versionen/ (von der Aufbewahrung ausgenommen) */
  dateien: { pfad: string; version: string }[];
}

// ---------------------------------------------------------------------------
// G6 KI-Leser – .plotwerk/leser.json, .plotwerk/fragen.json
// ---------------------------------------------------------------------------

export interface LeserAussage {
  text: string;
  /** wörtliche Belege (E6) */
  belege: Zitat[];
}

export interface LeserFrage {
  id: Id;
  frage: string;
  belege: Zitat[];
  /** im Text (bis zu diesem Kapitel) schon beantwortet in Kapitel … */
  beantwortetIn?: Id;
}

/** Plan-Abgleich der Leser-Simulation: „Plan sagt: … – belegt / nur angedeutet / nicht belegt“. */
export type LeserPlanStatus = 'belegt' | 'teilweise' | 'nicht_belegt';

export interface LeserPlanAbgleich {
  /** Kapitel, aus dessen Plan die Aussage stammt */
  kapitel: Id;
  /** Leons Plan-Text (wörtlich aus Szene oder „Was soll hier passieren?“), nie vom Modell */
  aussage: string;
  status: LeserPlanStatus;
  erklaerung: string;
  belege: Zitat[];
}

/** Leser-Simulation: Was weiß der Leser nach Kapitel n, welche Fragen hat er offen? */
export interface LeserStand {
  kapitel: Id;
  /** Hash der Kapiteltexte bis einschließlich `kapitel` (veraltet, wenn sich etwas ändert) */
  basisHash: string;
  weiss: LeserAussage[];
  fragen: LeserFrage[];
  modell: string;
  datum: string;
  /** was die Leserin vermutet (ältere Stände: als LeserFrage mit Kennung „vermutung|…“) */
  vermutungen?: LeserAussage[];
  /** wo Spannung entsteht (ältere Stände: „spannung|…“) */
  spannung?: LeserAussage[];
  /** Abgleich mit Leons Kapitelplänen (ältere Stände: „plan|status|kapitel|…“) */
  plan?: LeserPlanAbgleich[];
}

/** Frage an das Buch (Chat) – Antworten nur mit Belegstellen. */
export interface BuchFrage {
  id: Id;
  frage: string;
  /** ISO-Zeitpunkt */
  datum: string;
  antwort: string;
  belege: Zitat[];
  modell: string;
  kostenUsd?: number;
  /** false = das Modell sagt, die Antwort steht nicht im Buch (fehlt bei älteren Einträgen) */
  imBuch?: boolean;
}

// ---------------------------------------------------------------------------
// G7 Abgabe – lektorat/aenderungen.json (Rückimport aus Word)
// ---------------------------------------------------------------------------

export type AenderungsArt = 'einfuegen' | 'loeschen' | 'ersetzen';

/**
 * Nachverfolgte Änderung einer Lektorin aus einer zurückgeschickten .docx. Leon nimmt jede einzeln an oder
 * lehnt sie ab. `anker` zeigt bei „loeschen“/„ersetzen“ auf `alt`; bei „einfuegen“ auf das Wort vor der
 * Einfügestelle (eingefügt wird direkt dahinter).
 */
export interface LektoratsAenderung {
  id: Id;
  anker: TextAnker;
  art: AenderungsArt;
  alt: string;
  neu: string;
  autor?: string;
  /** ISO-Zeitpunkt aus Word */
  datum?: string;
  /** Dateiname der zurückgeschickten .docx */
  quelle?: string;
  status: 'offen' | 'angenommen' | 'abgelehnt';
}

// ---------------------------------------------------------------------------
// G8 Recherche – recherche/recherche.json + Dateien unter recherche/dateien/
// ---------------------------------------------------------------------------

export type RechercheArt = 'bild' | 'link' | 'notiz';

export interface RechercheEintrag {
  id: Id;
  art: RechercheArt;
  titel: string;
  /** Bild: Pfad relativ zum Projektordner, z. B. „recherche/dateien/lindenhof.jpg“ */
  datei?: string;
  /** Link */
  url?: string;
  /** Notiz bzw. Beschreibung (Markdown, `[[`-Verweise erlaubt) */
  text: string;
  /** woran der Eintrag geheftet ist (Figuren, Orte, Kapitel …) */
  verweise: Verweis[];
  /** ISO-Zeitpunkt */
  erstellt: string;
  schlagworte?: string[];
}

/** recherche/recherche.json */
export interface Recherche {
  version: 1;
  eintraege: RechercheEintrag[];
}
