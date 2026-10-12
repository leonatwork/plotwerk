/**
 * Import .docx (S-11): Kapitel an Überschrift 1 trennen, fett/kursiv übernehmen, Text unverändert (E7).
 * WordprocessingML wird direkt gelesen (jszip + fast-xml-parser), damit kein Zeichen umgeformt wird.
 */
import JSZip from 'jszip';
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Hinweis, TextAnker, Zitat } from '../model/types';
import { ankerErzeugen, findeZitat, wortzahl } from '../text';
import { absatzZuMarkdown, blockText, leseMarkdown, markdownKlartext, SZENENTRENNER, ueberschriftZuMarkdown, type Lauf } from './markdown';
import { kind, kinder, parseXml, textInhalt, wert, type XmlKnoten } from './xml';

export interface ImportKapitel {
  titel: string;
  /** Markdown-Body (Absätze, **fett**, *kursiv*), Text unverändert (keine Typografie-Umwandlung) */
  text: string;
}

export interface ImportKommentarAntwort {
  autor: string;
  /** ISO-Datum oder '' */
  datum: string;
  text: string;
}

/** Ein Word-Kommentar (mit Antworten) und die Stelle, an der er hängt. */
export interface ImportKommentar {
  /** Index in ImportErgebnis.kapitel; -1 = Vorspann */
  kapitel: number;
  /**
   * Textanker im Klartext des Kapitels; anker.kapitel ist der Platzhalter „#<Nummer>“ und wird beim
   * Übernehmen durch die echte ID ersetzt. null = Kapitel ohne Text (Kommentar an der Überschrift).
   */
  anker: TextAnker | null;
  /** hängt an der Kapitelüberschrift → Notiz zum ganzen Kapitel */
  ueberschrift: boolean;
  autor: string;
  /** ISO-Datum oder '' */
  datum: string;
  text: string;
  /** in Word als erledigt markiert */
  erledigt: boolean;
  antworten: ImportKommentarAntwort[];
}

export interface ImportErgebnis {
  kapitel: ImportKapitel[];
  /** Word-Kommentare mit Stelle (Antworten zusammengefasst); fehlt bei älteren Ergebnissen */
  kommentare?: ImportKommentar[];
  /** z. B. leere Überschrift am Ende, leeres Kapitel */
  hinweise: Hinweis[];
  /** Text vor der ersten Überschrift 1, falls vorhanden */
  vorspann: string;
  /** Text eines Absatzes im Format „Titel“ vor der ersten Überschrift (nicht im Vorspann enthalten) */
  buchtitel?: string;
}

/** Zitate in Import-Hinweisen verweisen mit „#<Nummer>“ (1-basiert) auf ImportErgebnis.kapitel; „#0“ = Vorspann. */
export const IMPORT_KAPITEL_PRAEFIX = '#';

export function importKapitelNummer(kapitelId: string): number | null {
  const m = /^#(\d+)$/.exec(kapitelId);
  return m ? Number(m[1]) : null;
}

/** Kapitelnummer (1-basiert), auf die sich ein Import-Hinweis bezieht, sonst null. */
export function importHinweisKapitel(h: Hinweis): number | null {
  const ausZitat = h.zitate[0] ? importKapitelNummer(h.zitate[0].kapitel) : null;
  if (ausZitat) return ausZitat;
  const m = /^struktur:import:(?:leeres-kapitel|satzende|ueberschrift-ohne-text)-(\d+)$/.exec(h.schluessel);
  return m ? Number(m[1]) : null;
}

export class DocxFehler extends Error {}

/** Fehler und Import-Hinweise (Oberflächensprache); Schlüssel der Hinweise bleiben gleich. */
export const DOCX_TEXTE = texteJe(
  {
    altesFormat: 'Die Datei ist im alten Word-Format (.doc) oder mit Kennwort geschützt. Bitte in Word als .docx ohne Kennwort speichern.',
    keinDocx: 'Die Datei ist keine gültige Word-Datei (.docx).',
    keinDokument: 'Die Datei enthält kein Word-Dokument.',
    beschaedigt: 'Das Word-Dokument ist beschädigt und lässt sich nicht lesen.',
    keinInhalt: 'Das Word-Dokument hat keinen Inhalt.',
    kapitel: 'Kapitel {n}',
    nachKapitel: 'nach Kapitel {n} „{titel}“',
    vorErstem: 'vor dem ersten Kapitel',
    leereUeberschriftEnde: 'Leere Überschrift am Ende',
    leereUeberschrift: 'Leere Überschrift',
    leereUeberschriftErklaerung: 'Eine Überschrift 1 ohne Text {lage} wurde nicht als Kapitel übernommen.',
    ohneText: 'Überschrift ohne Text',
    ohneTextErklaerung: 'Kapitel {n} hat eine leere Überschrift und heißt vorerst „{titel}“.',
    leeresKapitel: 'Kapitel ohne Text',
    leeresKapitelErklaerung: 'Kapitel {n} „{titel}“ hat keinen Text und wird als geplantes Kapitel übernommen.',
    satzende: 'Endet mitten im Satz',
    satzendeErklaerung: 'Kapitel {n} „{titel}“ endet ohne Satzzeichen.',
    keineUeberschrift: 'Keine Kapitelüberschriften',
    keineUeberschriftErklaerung: 'Die Datei enthält keine Überschrift 1. Kapitel werden an Absätzen im Format „Überschrift 1“ erkannt.',
    vorspann: 'Text vor der ersten Überschrift',
    vorspannErklaerung: { one: '{n} Wort steht vor der ersten Überschrift 1 und gehört zu keinem Kapitel.', other: '{n} Wörter stehen vor der ersten Überschrift 1 und gehören zu keinem Kapitel.' },
    fussnoten: 'Fußnoten nicht übernommen',
    fussnotenErklaerung: { one: '{n} Fußnote wurde nicht übernommen.', other: '{n} Fußnoten wurden nicht übernommen.' },
    kommentare: 'Word-Kommentare ohne Stelle',
    kommentareErklaerung: {
      one: '{n} Kommentar hängt an keiner Textstelle und wird nicht übernommen.',
      other: '{n} Kommentare hängen an keiner Textstelle und werden nicht übernommen.',
    },
    bilder: 'Bilder nicht übernommen',
    bilderErklaerung: { one: '{n} Bild oder Textfeld wurde nicht übernommen.', other: '{n} Bilder oder Textfelder wurden nicht übernommen.' },
    aenderungen: 'Nachverfolgte Änderungen angenommen',
    aenderungenErklaerung: 'Die Datei enthält nachverfolgte Änderungen. Eingefügter Text wurde übernommen, gelöschter nicht.',
    tabellen: 'Tabellen als Absätze',
    tabellenErklaerung: { one: '{n} Tabelle wurde als einfache Absätze übernommen.', other: '{n} Tabellen wurden als einfache Absätze übernommen.' },
  },
  {
    altesFormat: 'The file is in the old Word format (.doc) or password-protected. Please save it in Word as .docx without a password.',
    keinDocx: 'The file is not a valid Word file (.docx).',
    keinDokument: 'The file doesn’t contain a Word document.',
    beschaedigt: 'The Word document is damaged and can’t be read.',
    keinInhalt: 'The Word document has no content.',
    kapitel: 'Chapter {n}',
    nachKapitel: 'after chapter {n} “{titel}”',
    vorErstem: 'before the first chapter',
    leereUeberschriftEnde: 'Empty heading at the end',
    leereUeberschrift: 'Empty heading',
    leereUeberschriftErklaerung: 'A Heading 1 without text {lage} was not imported as a chapter.',
    ohneText: 'Heading without text',
    ohneTextErklaerung: 'Chapter {n} has an empty heading and is called “{titel}” for now.',
    leeresKapitel: 'Chapter without text',
    leeresKapitelErklaerung: 'Chapter {n} “{titel}” has no text and is imported as a planned chapter.',
    satzende: 'Ends mid-sentence',
    satzendeErklaerung: 'Chapter {n} “{titel}” ends without punctuation.',
    keineUeberschrift: 'No chapter headings',
    keineUeberschriftErklaerung: 'The file contains no Heading 1. Chapters are recognized by paragraphs in the “Heading 1” style.',
    vorspann: 'Text before the first heading',
    vorspannErklaerung: { one: '{n} word comes before the first Heading 1 and belongs to no chapter.', other: '{n} words come before the first Heading 1 and belong to no chapter.' },
    fussnoten: 'Footnotes not imported',
    fussnotenErklaerung: { one: '{n} footnote was not imported.', other: '{n} footnotes were not imported.' },
    kommentare: 'Word comments without a position',
    kommentareErklaerung: {
      one: '{n} comment isn’t attached to any text and won’t be imported.',
      other: '{n} comments aren’t attached to any text and won’t be imported.',
    },
    bilder: 'Images not imported',
    bilderErklaerung: { one: '{n} image or text box was not imported.', other: '{n} images or text boxes were not imported.' },
    aenderungen: 'Tracked changes accepted',
    aenderungenErklaerung: 'The file contains tracked changes. Inserted text was imported, deleted text was not.',
    tabellen: 'Tables as paragraphs',
    tabellenErklaerung: { one: '{n} table was imported as plain paragraphs.', other: '{n} tables were imported as plain paragraphs.' },
  },
);

// ---------------------------------------------------------------------------
// Formatvorlagen
// ---------------------------------------------------------------------------

interface Stil {
  id: string;
  name: string;
  basis?: string;
  gliederung?: number;
  fett?: boolean;
  kursiv?: boolean;
  versteckt?: boolean;
}

interface Stile {
  absatz: Map<string, Stil>;
  zeichen: Map<string, Stil>;
  standardAbsatz?: string;
  standardZeichen?: string;
  vorgabe: { fett?: boolean; kursiv?: boolean };
}

/** w:b, w:i … ohne val = an; val 0/false/off = aus; fehlt das Element: undefined */
function schalter(k: XmlKnoten | undefined): boolean | undefined {
  if (!k) return undefined;
  const v = wert(k);
  return v === undefined ? true : !['0', 'false', 'off', 'none'].includes(v.toLowerCase());
}

function leseStile(xml: string | null): Stile {
  const stile: Stile = { absatz: new Map(), zeichen: new Map(), vorgabe: {} };
  if (!xml) return stile;
  const wurzel = kind(parseXml(xml), 'styles');
  const vorgabeRpr = kind(kind(kind(wurzel, 'docDefaults'), 'rPrDefault'), 'rPr');
  stile.vorgabe = { fett: schalter(kind(vorgabeRpr, 'b')), kursiv: schalter(kind(vorgabeRpr, 'i')) };
  for (const s of kinder(wurzel, 'style')) {
    const typ = s.attr.type ?? 'paragraph';
    const id = s.attr.styleId ?? '';
    if (!id) continue;
    const rPr = kind(s, 'rPr');
    const gliederung = wert(kind(kind(s, 'pPr'), 'outlineLvl'));
    const stil: Stil = {
      id,
      name: wert(kind(s, 'name')) ?? id,
      basis: wert(kind(s, 'basedOn')),
      gliederung: gliederung === undefined ? undefined : Number(gliederung),
      fett: schalter(kind(rPr, 'b')),
      kursiv: schalter(kind(rPr, 'i')),
      versteckt: schalter(kind(rPr, 'vanish')),
    };
    const standard = ['1', 'true', 'on'].includes((s.attr.default ?? '').toLowerCase());
    if (typ === 'paragraph') {
      stile.absatz.set(id, stil);
      if (standard) stile.standardAbsatz = id;
    } else if (typ === 'character') {
      stile.zeichen.set(id, stil);
      if (standard) stile.standardZeichen = id;
    }
  }
  return stile;
}

function kette(map: Map<string, Stil>, id: string | undefined): Stil[] {
  const ergebnis: Stil[] = [];
  const besucht = new Set<string>();
  let s = id ? map.get(id) : undefined;
  while (s && !besucht.has(s.id)) {
    besucht.add(s.id);
    ergebnis.push(s);
    s = s.basis ? map.get(s.basis) : undefined;
  }
  return ergebnis;
}

const norm = (s: string) => s.toLocaleLowerCase('de').replace(/\s+/g, '');
const UEBERSCHRIFT = /^(heading|überschrift|ueberschrift|berschrift)([1-9])$/;

/** Gliederungsebene 1–9 aus der Formatvorlagen-Kette (eigene outlineLvl vor Name), sonst null. */
function ebeneAusStil(stile: Stile, id: string | undefined): number | null {
  const liste = kette(stile.absatz, id);
  // Vorlage nicht in styles.xml definiert: nur die ID zählt
  if (liste.length === 0 && id) liste.push({ id, name: id });
  for (const s of liste) {
    if (s.gliederung !== undefined && Number.isFinite(s.gliederung)) return s.gliederung < 9 ? s.gliederung + 1 : null;
    const m = UEBERSCHRIFT.exec(norm(s.name)) ?? UEBERSCHRIFT.exec(norm(s.id));
    if (m) return Number(m[2]);
  }
  return null;
}

function istTitelStil(stile: Stile, id: string | undefined): boolean {
  const liste = kette(stile.absatz, id);
  if (liste.length === 0 && id) liste.push({ id, name: id });
  return liste.some((s) => ['title', 'titel'].includes(norm(s.name)) || ['title', 'titel'].includes(norm(s.id)));
}

// ---------------------------------------------------------------------------
// Dokument
// ---------------------------------------------------------------------------

/** Kommentarmarke in einem Absatz; pos = Zeichenposition im Rohtext des Absatzes (Läufe verbunden). */
interface Marke {
  id: string;
  art: 'start' | 'ende' | 'ref';
  pos: number;
}

interface WordAbsatz {
  laeufe: Lauf[];
  ebene: number | null;
  titel: boolean;
  marken: Marke[];
}

interface Zaehler {
  fussnoten: number;
  bilder: number;
  aenderungen: number;
  tabellen: number;
}

interface Kontext {
  stile: Stile;
  absatzStil: string | undefined;
  laeufe: Lauf[];
  zaehler: Zaehler;
  marken: Marke[];
}

function laenge(ctx: Kontext): number {
  let n = 0;
  for (const l of ctx.laeufe) n += l.text.length;
  return n;
}

function format(ctx: Kontext, rPr: XmlKnoten | undefined): { fett: boolean; kursiv: boolean; versteckt: boolean } {
  const zeichenKette = kette(ctx.stile.zeichen, wert(kind(rPr, 'rStyle')) ?? ctx.stile.standardZeichen);
  const absatzKette = kette(ctx.stile.absatz, ctx.absatzStil);
  const aufloesen = (direkt: boolean | undefined, feld: 'fett' | 'kursiv' | 'versteckt', vorgabe?: boolean) => {
    if (direkt !== undefined) return direkt;
    for (const s of zeichenKette) if (s[feld] !== undefined) return s[feld]!;
    for (const s of absatzKette) if (s[feld] !== undefined) return s[feld]!;
    return vorgabe ?? false;
  };
  return {
    fett: aufloesen(schalter(kind(rPr, 'b')), 'fett', ctx.stile.vorgabe.fett),
    kursiv: aufloesen(schalter(kind(rPr, 'i')), 'kursiv', ctx.stile.vorgabe.kursiv),
    versteckt: aufloesen(schalter(kind(rPr, 'vanish')) ?? schalter(kind(rPr, 'specVanish')), 'versteckt'),
  };
}

function lauf(r: XmlKnoten, ctx: Kontext): void {
  const rPr = kind(r, 'rPr');
  const f = format(ctx, rPr);
  if (f.versteckt) return;
  let text = '';
  for (const c of r.kinder) {
    switch (c.name) {
      case 't':
        text += textInhalt(c);
        break;
      case 'tab':
      case 'ptab':
        text += '\t';
        break;
      case 'br': {
        const typ = c.attr.type;
        if (!typ || typ === 'textWrapping') text += '\n';
        break;
      }
      case 'cr':
        text += '\n';
        break;
      case 'noBreakHyphen':
        text += '‑';
        break;
      case 'sym': {
        const schrift = c.attr.font ?? '';
        const code = parseInt(c.attr.char ?? '', 16);
        if (Number.isFinite(code) && !/symbol|wingdings|webdings/i.test(schrift))
          text += String.fromCodePoint(code >= 0xf000 ? code - 0xf000 : code);
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference':
        ctx.zaehler.fussnoten++;
        break;
      case 'commentReference':
        if (c.attr.id !== undefined) ctx.marken.push({ id: c.attr.id, art: 'ref', pos: laenge(ctx) + text.length });
        break;
      case 'drawing':
      case 'pict':
      case 'object':
      case 'AlternateContent':
        ctx.zaehler.bilder++;
        break;
      default:
        break;
    }
  }
  if (!text) return;
  const letzte = ctx.laeufe[ctx.laeufe.length - 1];
  if (letzte && letzte.fett === f.fett && letzte.kursiv === f.kursiv) letzte.text += text;
  else ctx.laeufe.push({ text, fett: f.fett, kursiv: f.kursiv });
}

function inline(knoten: XmlKnoten[], ctx: Kontext): void {
  for (const k of knoten) {
    switch (k.name) {
      case 'r':
        lauf(k, ctx);
        break;
      case 'commentRangeStart':
      case 'commentRangeEnd':
        if (k.attr.id !== undefined) ctx.marken.push({ id: k.attr.id, art: k.name === 'commentRangeStart' ? 'start' : 'ende', pos: laenge(ctx) });
        break;
      case 'hyperlink':
      case 'smartTag':
      case 'customXml':
      case 'fldSimple':
      case 'dir':
      case 'bdo':
      case 'moveTo':
        inline(k.kinder, ctx);
        break;
      case 'ins':
        ctx.zaehler.aenderungen++;
        inline(k.kinder, ctx);
        break;
      case 'del':
      case 'moveFrom':
        ctx.zaehler.aenderungen++;
        break;
      case 'sdt':
        inline(kind(k, 'sdtContent')?.kinder ?? [], ctx);
        break;
      default:
        break;
    }
  }
}

function absatz(p: XmlKnoten, stile: Stile, zaehler: Zaehler): WordAbsatz {
  const pPr = kind(p, 'pPr');
  const stilId = wert(kind(pPr, 'pStyle')) ?? stile.standardAbsatz;
  const direkt = wert(kind(pPr, 'outlineLvl'));
  let ebene: number | null;
  if (direkt !== undefined && Number.isFinite(Number(direkt))) ebene = Number(direkt) < 9 ? Number(direkt) + 1 : null;
  else ebene = ebeneAusStil(stile, stilId);
  const ctx: Kontext = { stile, absatzStil: stilId, laeufe: [], zaehler, marken: [] };
  inline(p.kinder, ctx);
  return { laeufe: ctx.laeufe, ebene, titel: ebene === null && istTitelStil(stile, stilId), marken: ctx.marken };
}

/** Kommentarmarken zwischen Absätzen: Start gilt ab dem nächsten Absatz, Ende am Schluss des vorigen. */
interface Koerper {
  offeneStarts: string[];
}

function bloecke(knoten: XmlKnoten[], stile: Stile, zaehler: Zaehler, ausgabe: WordAbsatz[], koerper: Koerper = { offeneStarts: [] }): void {
  for (const k of knoten) {
    switch (k.name) {
      case 'p': {
        const a = absatz(k, stile, zaehler);
        if (koerper.offeneStarts.length) {
          a.marken.unshift(...koerper.offeneStarts.map((id) => ({ id, art: 'start' as const, pos: 0 })));
          koerper.offeneStarts = [];
        }
        ausgabe.push(a);
        break;
      }
      case 'commentRangeStart':
        if (k.attr.id !== undefined) koerper.offeneStarts.push(k.attr.id);
        break;
      case 'commentRangeEnd': {
        const vorher = ausgabe[ausgabe.length - 1];
        if (vorher && k.attr.id !== undefined) vorher.marken.push({ id: k.attr.id, art: 'ende', pos: vorher.laeufe.reduce((n, l) => n + l.text.length, 0) });
        break;
      }
      case 'tbl':
        zaehler.tabellen++;
        for (const tr of kinder(k, 'tr')) for (const tc of kinder(tr, 'tc')) bloecke(tc.kinder, stile, zaehler, ausgabe, koerper);
        break;
      case 'sdt':
        bloecke(kind(k, 'sdtContent')?.kinder ?? [], stile, zaehler, ausgabe, koerper);
        break;
      case 'customXml':
      case 'ins':
      case 'moveTo':
        bloecke(k.kinder, stile, zaehler, ausgabe, koerper);
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Datei lesen
// ---------------------------------------------------------------------------

function istOle(datei: Uint8Array): boolean {
  return datei.length >= 4 && datei[0] === 0xd0 && datei[1] === 0xcf && datei[2] === 0x11 && datei[3] === 0xe0;
}

function relationen(xml: string | null): { typ: string; ziel: string }[] {
  if (!xml) return [];
  return kinder(kind(parseXml(xml), 'Relationships'), 'Relationship').map((r) => ({
    typ: r.attr.Type ?? '',
    ziel: r.attr.Target ?? '',
  }));
}

function pfadAufloesen(basisOrdner: string, ziel: string): string {
  if (ziel.startsWith('/')) return ziel.slice(1);
  const teile = basisOrdner ? basisOrdner.split('/') : [];
  for (const t of ziel.split('/')) {
    if (t === '..') teile.pop();
    else if (t !== '.' && t !== '') teile.push(t);
  }
  return teile.join('/');
}

async function lies(zip: JSZip, pfad: string | undefined): Promise<string | null> {
  if (!pfad) return null;
  const datei = zip.file(pfad) ?? zip.file(new RegExp(`^${pfad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0];
  return datei ? datei.async('string') : null;
}

interface WordKommentar {
  id: string;
  autor: string;
  datum: string;
  text: string;
  /** w14:paraId des letzten Absatzes (Schlüssel in commentsExtended.xml) */
  paraId?: string;
  /** paraId des Eltern-Kommentars, wenn dies eine Antwort ist */
  eltern?: string;
  erledigt: boolean;
}

interface WordDokument {
  absaetze: WordAbsatz[];
  zaehler: Zaehler;
  kommentare: WordKommentar[];
}

/** Text eines Kommentars: Absätze mit Zeilenumbruch, Läufe ohne Kommentarzeichen. */
function kommentarText(c: XmlKnoten): string {
  const absaetze: string[] = [];
  const sammle = (k: XmlKnoten, aus: string[]) => {
    for (const x of k.kinder) {
      if (x.name === 't') aus.push(textInhalt(x));
      else if (x.name === 'tab') aus.push('\t');
      else if (x.name === 'br' || x.name === 'cr') aus.push('\n');
      else if (x.name !== 'delText' && x.name !== 'del' && x.kinder.length) sammle(x, aus);
    }
  };
  for (const p of kinder(c, 'p')) {
    const teile: string[] = [];
    sammle(p, teile);
    absaetze.push(teile.join(''));
  }
  return absaetze.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function leseKommentare(xml: string | null, erweitertXml: string | null): WordKommentar[] {
  if (!xml) return [];
  const erweitert = new Map<string, { eltern?: string; erledigt: boolean }>();
  if (erweitertXml) {
    for (const e of kinder(kind(parseXml(erweitertXml), 'commentsEx'), 'commentEx')) {
      if (!e.attr.paraId) continue;
      erweitert.set(e.attr.paraId, { eltern: e.attr.paraIdParent || undefined, erledigt: e.attr.done === '1' });
    }
  }
  return kinder(kind(parseXml(xml), 'comments'), 'comment').map((c) => {
    const absaetze = kinder(c, 'p');
    const paraId = absaetze[absaetze.length - 1]?.attr.paraId;
    const ext = paraId ? erweitert.get(paraId) : undefined;
    return {
      id: c.attr.id ?? '',
      autor: c.attr.author ?? '',
      datum: c.attr.date ?? '',
      text: kommentarText(c),
      ...(paraId ? { paraId } : {}),
      ...(ext?.eltern ? { eltern: ext.eltern } : {}),
      erledigt: ext?.erledigt ?? false,
    };
  });
}

async function leseDokument(datei: Uint8Array, sprache: Sprache): Promise<WordDokument> {
  const t = DOCX_TEXTE(sprache);
  if (istOle(datei)) throw new DocxFehler(t.altesFormat);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(datei);
  } catch {
    throw new DocxFehler(t.keinDocx);
  }
  const haupt = relationen(await lies(zip, '_rels/.rels')).find((r) => r.typ.endsWith('/officeDocument'));
  const dokPfad = haupt ? pfadAufloesen('', haupt.ziel) : 'word/document.xml';
  const dokXml = await lies(zip, dokPfad);
  if (!dokXml) throw new DocxFehler(t.keinDokument);
  const ordner = dokPfad.includes('/') ? dokPfad.slice(0, dokPfad.lastIndexOf('/')) : '';
  const name = dokPfad.slice(dokPfad.lastIndexOf('/') + 1);
  const rels = relationen(await lies(zip, `${ordner ? `${ordner}/` : ''}_rels/${name}.rels`));
  const zielVon = (endung: string) => {
    const r = rels.find((x) => x.typ.endsWith(endung));
    return r ? pfadAufloesen(ordner, r.ziel) : undefined;
  };
  const stile = leseStile((await lies(zip, zielVon('/styles'))) ?? (await lies(zip, `${ordner}/styles.xml`)));
  const kommentare = leseKommentare(await lies(zip, zielVon('/comments')), await lies(zip, zielVon('/commentsExtended')));

  let wurzel: XmlKnoten | undefined;
  try {
    wurzel = kind(kind(parseXml(dokXml), 'document'), 'body');
  } catch {
    throw new DocxFehler(t.beschaedigt);
  }
  if (!wurzel) throw new DocxFehler(t.keinInhalt);
  const zaehler: Zaehler = { fussnoten: 0, bilder: 0, aenderungen: 0, tabellen: 0 };
  const absaetze: WordAbsatz[] = [];
  bloecke(wurzel.kinder, stile, zaehler, absaetze);
  return { absaetze, zaehler, kommentare };
}

// ---------------------------------------------------------------------------
// Kapitel bilden
// ---------------------------------------------------------------------------

const klartextVon = markdownKlartext;

function absaetzeZuMarkdown(absaetze: WordAbsatz[]): string {
  const teile: string[] = [];
  for (const a of absaetze) {
    if (a.ebene !== null) {
      const zeile = ueberschriftZuMarkdown(a.ebene, a.laeufe.map((l) => l.text).join(''));
      if (zeile) teile.push(zeile);
    } else teile.push(...absatzZuMarkdown(a.laeufe));
  }
  return teile.join('\n\n');
}

function titelText(a: WordAbsatz): string {
  return a.laeufe
    .map((l) => l.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Die letzten Wörter des letzten Textabsatzes (Szenentrenner und Überschriften zählen nicht). */
function letzteWorte(markdown: string): string | null {
  const bl = leseMarkdown(markdown).filter((b) => b.art === 'absatz' && blockText(b).trim() !== '' && blockText(b).trim() !== SZENENTRENNER);
  const letzter = bl[bl.length - 1];
  return letzter ? blockText(letzter).trim().split(/\s+/).slice(-6).join(' ') : null;
}

/** Letzter Textabsatz endet ohne Satzzeichen (Szenentrenner und Überschriften zählen nicht). */
export function endetMittenImSatz(markdown: string): string | null {
  const bl = leseMarkdown(markdown).filter((b) => b.art === 'absatz' && blockText(b).trim() !== '');
  const letzter = bl[bl.length - 1];
  if (!letzter) return null;
  const text = blockText(letzter).trimEnd();
  if (text === SZENENTRENNER || /[.!?…"“”„»«›‹'’)\]–—]$/u.test(text)) return null;
  const woerter = text.split(/\s+/);
  return woerter.slice(-6).join(' ');
}

function hinweis(art: string, titel: string, erklaerung: string, zitate: Zitat[] = []): Hinweis {
  return { schluessel: `struktur:import:${art}`, typ: 'struktur', titel, zitate, erklaerung, quelle: 'lokal', status: 'neu' };
}

/**
 * Liest eine .docx. `sprache`: Oberflächensprache der Import-Hinweise und Fehlermeldungen (auch für den
 * vorläufigen Titel „Kapitel n“ einer Überschrift ohne Text).
 */
export async function importiereDocx(datei: Uint8Array, sprache: Sprache = 'de'): Promise<ImportErgebnis> {
  const t = DOCX_TEXTE(sprache);
  const dok = await leseDokument(datei, sprache);
  /** Hinweise mit Position im Buch (Kapitelnummer; 0 = davor, Infinity = ganze Datei) */
  const gemeldet: { pos: number; h: Hinweis }[] = [];
  const melden = (pos: number, h: Hinweis) => gemeldet.push({ pos, h });

  const roh: Roh[] = [];
  const vorspann: WordAbsatz[] = [];
  let buchtitel: string | undefined;
  let titelAbsatz: WordAbsatz | undefined;
  for (const a of dok.absaetze) {
    if (a.ebene === 1) {
      roh.push({ titel: titelText(a), kopf: a, absaetze: [] });
      continue;
    }
    const aktuell = roh[roh.length - 1];
    if (aktuell) aktuell.absaetze.push(a);
    else if (a.titel && buchtitel === undefined && titelText(a)) {
      buchtitel = titelText(a);
      titelAbsatz = a;
    } else vorspann.push(a);
  }

  const kapitel: ImportKapitel[] = [];
  /** roh-Index → Index in `kapitel` (-1 = nicht übernommene leere Überschrift) */
  const rohZuKapitel: number[] = roh.map(() => -1);
  for (let i = 0; i < roh.length; i++) {
    const r = roh[i]!;
    const text = absaetzeZuMarkdown(r.absaetze);
    const nummer = kapitel.length + 1;
    if (!r.titel) {
      if (!klartextVon(text)) {
        const vorher = kapitel[kapitel.length - 1];
        const amEnde = roh.slice(i + 1).every((x) => !x.titel && !klartextVon(absaetzeZuMarkdown(x.absaetze)));
        const lage = vorher ? fmt(t.nachKapitel, { n: kapitel.length, titel: vorher.titel }) : t.vorErstem;
        // Zitat: die letzten Wörter davor, damit die Stelle auffindbar ist (E10)
        const davor = vorher ? letzteWorte(vorher.text) : null;
        melden(
          kapitel.length + 0.5,
          hinweis(
            `leere-ueberschrift-${i + 1}`,
            amEnde && vorher ? t.leereUeberschriftEnde : t.leereUeberschrift,
            fmt(t.leereUeberschriftErklaerung, { lage }),
            davor ? [{ kapitel: `${IMPORT_KAPITEL_PRAEFIX}${kapitel.length}`, text: davor }] : [],
          ),
        );
        continue;
      }
      r.titel = fmt(t.kapitel, { n: nummer });
      melden(
        nummer,
        hinweis(`ueberschrift-ohne-text-${nummer}`, t.ohneText, fmt(t.ohneTextErklaerung, { n: nummer, titel: r.titel }), [
          { kapitel: `${IMPORT_KAPITEL_PRAEFIX}${nummer}`, text: klartextVon(text).slice(0, 60) },
        ]),
      );
    }
    kapitel.push({ titel: r.titel, text });
    rohZuKapitel[i] = kapitel.length - 1;
  }

  kapitel.forEach((k, i) => {
    const nummer = i + 1;
    if (!klartextVon(k.text)) {
      melden(nummer, hinweis(`leeres-kapitel-${nummer}`, t.leeresKapitel, fmt(t.leeresKapitelErklaerung, { n: nummer, titel: k.titel })));
      return;
    }
    const ende = endetMittenImSatz(k.text);
    if (ende)
      melden(
        nummer,
        hinweis(`satzende-${nummer}`, t.satzende, fmt(t.satzendeErklaerung, { n: nummer, titel: k.titel }), [
          { kapitel: `${IMPORT_KAPITEL_PRAEFIX}${nummer}`, text: ende },
        ]),
      );
  });

  const vorspannText = absaetzeZuMarkdown(vorspann);
  const vorspannKlar = klartextVon(vorspannText);
  if (roh.length === 0)
    melden(
      0,
      hinweis('keine-ueberschrift', t.keineUeberschrift, t.keineUeberschriftErklaerung),
    );
  else if (vorspannKlar)
    melden(
      0,
      hinweis('vorspann', t.vorspann, fmt(t.vorspannErklaerung, { n: wortzahl(vorspannText) }, sprache), [
        { kapitel: `${IMPORT_KAPITEL_PRAEFIX}0`, text: vorspannKlar.slice(0, 60) },
      ]),
    );

  const { kommentare, ohneStelle } = kommentareZuordnen(dok, { roh, rohZuKapitel, kapitel, vorspann, vorspannText, titelAbsatz });

  const z = dok.zaehler;
  if (z.fussnoten) melden(Infinity, hinweis('fussnoten', t.fussnoten, fmt(t.fussnotenErklaerung, { n: z.fussnoten }, sprache)));
  if (ohneStelle) melden(Infinity, hinweis('kommentare', t.kommentare, fmt(t.kommentareErklaerung, { n: ohneStelle }, sprache)));
  if (z.bilder) melden(Infinity, hinweis('bilder', t.bilder, fmt(t.bilderErklaerung, { n: z.bilder }, sprache)));
  if (z.aenderungen) melden(Infinity, hinweis('aenderungen', t.aenderungen, t.aenderungenErklaerung));
  if (z.tabellen) melden(Infinity, hinweis('tabellen', t.tabellen, fmt(t.tabellenErklaerung, { n: z.tabellen }, sprache)));

  const hinweise = gemeldet.sort((a, b) => a.pos - b.pos).map((x) => x.h);
  return { kapitel, kommentare, hinweise, vorspann: vorspannText, ...(buchtitel ? { buchtitel } : {}) };
}

// ---------------------------------------------------------------------------
// Word-Kommentare → Stellen
// ---------------------------------------------------------------------------

interface Roh {
  titel: string;
  kopf: WordAbsatz;
  absaetze: WordAbsatz[];
}

interface Gliederung {
  roh: Roh[];
  rohZuKapitel: number[];
  kapitel: ImportKapitel[];
  vorspann: WordAbsatz[];
  vorspannText: string;
  titelAbsatz: WordAbsatz | undefined;
}

type Bereich = { art: 'kapitel'; roh: number; absatz: number } | { art: 'kopf'; roh: number } | { art: 'vorspann'; absatz: number } | { art: 'titel' };

interface Fundstelle {
  bereich: Bereich;
  pos: number;
}

function rohText(a: WordAbsatz): string {
  return a.laeufe.map((l) => l.text).join('');
}

function stueckText(a: WordAbsatz): string {
  return klartextVon(a.ebene !== null ? ueberschriftZuMarkdown(a.ebene, rohText(a)) : absatzZuMarkdown(a.laeufe).join('\n\n'));
}

/** Lage jedes Absatzes im Klartext des Kapitels (start -1 = Absatz ohne Text). */
function lagen(absaetze: WordAbsatz[], kt: string): { start: number; roh: string; stueck: string }[] {
  let cursor = 0;
  return absaetze.map((a) => {
    const stueck = stueckText(a);
    if (!stueck.trim()) return { start: -1, roh: rohText(a), stueck };
    let start = kt.indexOf(stueck, cursor);
    if (start < 0) start = Math.min(cursor, kt.length);
    cursor = start + stueck.length;
    return { start, roh: rohText(a), stueck };
  });
}

/** Rohtext-Position im Absatz → Offset im Klartext (Leerraum am Rand wird beim Import entfernt). */
function versatz(l: { start: number; roh: string; stueck: string }, pos: number): number {
  const vorne = l.roh.length - l.roh.trimStart().length;
  return l.start + Math.max(0, Math.min(l.stueck.length, pos - vorne));
}

/** Wort an bzw. nach einer Position (bei Kommentaren ohne markierten Text). */
function wortBei(kt: string, pos: number): { start: number; ende: number } | null {
  const wort = /[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu;
  let vorher: { start: number; ende: number } | null = null;
  for (const m of kt.matchAll(wort)) {
    const start = m.index ?? 0;
    const ende = start + m[0].length;
    if (ende >= pos) return start <= pos || !vorher ? { start, ende } : pos - vorher.ende <= start - pos ? vorher : { start, ende };
    vorher = { start, ende };
  }
  return vorher;
}

/** Spanne im Klartext zwischen zwei Fundstellen desselben Bereichs (Kapiteltext oder Vorspann). */
function spanne(absaetze: WordAbsatz[], kt: string, von: { absatz: number; pos: number }, bis: { absatz: number; pos: number } | null): { start: number; ende: number } | null {
  if (!kt.trim()) return null;
  const l = lagen(absaetze, kt);
  const a = l[von.absatz];
  if (!a) return null;
  const startRoh = a.start < 0 ? null : versatz(a, von.pos);
  let ende = startRoh ?? 0;
  let exaktRoh = '';
  if (bis && bis.absatz >= von.absatz) {
    const b = l[bis.absatz];
    if (b && b.start >= 0) ende = versatz(b, bis.pos);
    if (bis.absatz === von.absatz) exaktRoh = a.roh.slice(von.pos, bis.pos);
    else
      exaktRoh = [a.roh.slice(von.pos), ...l.slice(von.absatz + 1, bis.absatz).map((x) => x.roh), (b?.roh ?? '').slice(0, bis.pos)]
        .filter((t) => t.trim())
        .join('\n\n');
  }
  const ungefaehr = startRoh ?? (l.slice(von.absatz).find((x) => x.start >= 0)?.start ?? 0);
  const gesucht = exaktRoh.trim();
  if (gesucht) {
    const treffer = findeZitat(kt, gesucht);
    if (treffer.length) {
      const besser = treffer.reduce((x, y) => (Math.abs(y.start - ungefaehr) < Math.abs(x.start - ungefaehr) ? y : x));
      return besser;
    }
  }
  let s = Math.min(ungefaehr, kt.length);
  let e = Math.max(s, Math.min(ende, kt.length));
  while (s < e && /\s/.test(kt[s]!)) s++;
  while (e > s && /\s/.test(kt[e - 1]!)) e--;
  if (e > s) return { start: s, ende: e };
  return wortBei(kt, s);
}

/** Erste Wörter eines Kapitels (Kommentare an der Überschrift hängen am Kapitelanfang). */
function anfang(kt: string): { start: number; ende: number } | null {
  const zeile = kt.split('\n')[0] ?? '';
  const m = /^\s*(\S+(?:\s+\S+){0,5})/u.exec(zeile);
  if (!m || !m[1]) return null;
  const start = zeile.indexOf(m[1]);
  return { start, ende: start + m[1].length };
}

function kommentareZuordnen(dok: WordDokument, g: Gliederung): { kommentare: ImportKommentar[]; ohneStelle: number } {
  if (dok.kommentare.length === 0) return { kommentare: [], ohneStelle: 0 };

  const bereiche = new Map<WordAbsatz, Bereich>();
  g.roh.forEach((r, ri) => {
    bereiche.set(r.kopf, { art: 'kopf', roh: ri });
    r.absaetze.forEach((a, ai) => bereiche.set(a, { art: 'kapitel', roh: ri, absatz: ai }));
  });
  g.vorspann.forEach((a, ai) => bereiche.set(a, { art: 'vorspann', absatz: ai }));
  if (g.titelAbsatz) bereiche.set(g.titelAbsatz, { art: 'titel' });

  const starts = new Map<string, Fundstelle>();
  const enden = new Map<string, Fundstelle>();
  const refs = new Map<string, Fundstelle>();
  const reihenfolge: string[] = [];
  for (const a of dok.absaetze) {
    const bereich = bereiche.get(a);
    if (!bereich) continue;
    for (const m of a.marken) {
      const fund = { bereich, pos: m.pos };
      if (m.art === 'start' && !starts.has(m.id)) starts.set(m.id, fund);
      else if (m.art === 'ende') enden.set(m.id, fund);
      else if (m.art === 'ref' && !refs.has(m.id)) refs.set(m.id, fund);
      if (!reihenfolge.includes(m.id)) reihenfolge.push(m.id);
    }
  }

  // Antworten an den obersten Kommentar hängen
  const nachPara = new Map<string, WordKommentar>();
  for (const k of dok.kommentare) if (k.paraId) nachPara.set(k.paraId, k);
  const wurzelVon = (k: WordKommentar): WordKommentar => {
    let w = k;
    const besucht = new Set<string>();
    while (w.eltern && nachPara.has(w.eltern) && !besucht.has(w.id)) {
      besucht.add(w.id);
      w = nachPara.get(w.eltern)!;
    }
    return w;
  };
  const antworten = new Map<string, ImportKommentarAntwort[]>();
  for (const k of dok.kommentare) {
    const w = wurzelVon(k);
    if (w === k) continue;
    const liste = antworten.get(w.id) ?? [];
    liste.push({ autor: k.autor, datum: k.datum, text: k.text });
    antworten.set(w.id, liste);
  }

  const kommentare: ImportKommentar[] = [];
  let ohneStelle = 0;
  const wurzeln = dok.kommentare.filter((k) => wurzelVon(k) === k);
  wurzeln.sort((a, b) => {
    const ia = reihenfolge.indexOf(a.id);
    const ib = reihenfolge.indexOf(b.id);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  });
  for (const k of wurzeln) {
    const von = starts.get(k.id) ?? refs.get(k.id);
    if (!von) {
      ohneStelle++;
      continue;
    }
    const bis = enden.get(k.id) ?? refs.get(k.id) ?? null;
    const basis = {
      autor: k.autor,
      datum: k.datum,
      text: k.text,
      erledigt: k.erledigt,
      antworten: antworten.get(k.id) ?? [],
    };
    const b = von.bereich;
    if (b.art === 'titel') {
      kommentare.push({ ...basis, kapitel: -1, anker: null, ueberschrift: true });
      continue;
    }
    if (b.art === 'vorspann') {
      const kt = klartextVon(g.vorspannText);
      const bisImVorspann = bis && bis.bereich.art === 'vorspann' ? { absatz: bis.bereich.absatz, pos: bis.pos } : null;
      const sp = spanne(g.vorspann, kt, { absatz: b.absatz, pos: von.pos }, bisImVorspann);
      kommentare.push({ ...basis, kapitel: -1, anker: sp ? ankerErzeugen(`${IMPORT_KAPITEL_PRAEFIX}0`, kt, sp.start, sp.ende) : null, ueberschrift: false });
      continue;
    }
    const ki = g.rohZuKapitel[b.roh] ?? -1;
    const kap = g.kapitel[ki];
    if (ki < 0 || !kap) {
      ohneStelle++;
      continue;
    }
    const kt = klartextVon(kap.text);
    const platzhalter = `${IMPORT_KAPITEL_PRAEFIX}${ki + 1}`;
    if (b.art === 'kopf') {
      const sp = anfang(kt);
      kommentare.push({ ...basis, kapitel: ki, anker: sp ? ankerErzeugen(platzhalter, kt, sp.start, sp.ende) : null, ueberschrift: true });
      continue;
    }
    const bisImKapitel = bis && bis.bereich.art === 'kapitel' && bis.bereich.roh === b.roh ? { absatz: bis.bereich.absatz, pos: bis.pos } : null;
    const sp = spanne(g.roh[b.roh]!.absaetze, kt, { absatz: b.absatz, pos: von.pos }, bisImKapitel ?? { absatz: b.absatz, pos: rohText(g.roh[b.roh]!.absaetze[b.absatz]!).length });
    kommentare.push({ ...basis, kapitel: ki, anker: sp ? ankerErzeugen(platzhalter, kt, sp.start, sp.ende) : null, ueberschrift: false });
  }
  return { kommentare, ohneStelle };
}
