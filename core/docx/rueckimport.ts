/**
 * Rückimport aus Word (G7): Eine Lektorin schickt die exportierte .docx mit Kommentaren und nachverfolgten
 * Änderungen zurück. Kommentare werden über die bestehende Kommentar-Logik (importiereDocx +
 * kommentareAlsAnmerkungen) zu Anmerkungen, nachverfolgte Änderungen (w:ins/w:del, auch Absatzmarken und
 * Verschiebungen) zu Änderungsvorschlägen mit Textanker (E4) im ursprünglichen Text – also in Leons Fassung.
 * Leon nimmt jede Änderung einzeln an oder lehnt sie ab (core/abgabe/lektorat.ts). Nichts wird automatisch
 * in den Manuskripttext übernommen.
 */
import JSZip from 'jszip';
import { fmt, type Sprache } from '../i18n';
import type { Anmerkung, Id, Kapitel, LektoratsAenderung, TextAnker } from '../model/types';
import { ankerErzeugen, ankerFinden, klartext, normalisiere, woerterZaehlen } from '../text';
import { DOCX_TEXTE, DocxFehler, importiereDocx, type ImportKommentar } from './importieren';
import { kommentareAlsAnmerkungen } from './kommentare';
import { kind, kinder, parseXml, textInhalt, wert, type XmlKnoten } from './xml';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Nachverfolgte Änderung, verankert im ursprünglichen Kapiteltext der Datei (anker.kapitel = „#<Nummer>“). */
export interface RueckimportAenderung {
  art: LektoratsAenderung['art'];
  anker: TextAnker;
  alt: string;
  neu: string;
  autor?: string;
  datum?: string;
}

export interface RueckimportKapitel {
  /** Titel in der Datei (ursprüngliche Fassung, ohne Änderungen der Lektorin) */
  titel: string;
  /** Titel mit angenommenen Änderungen (falls die Lektorin den Titel geändert hat) */
  titelNeu: string;
  /** ursprünglicher Klartext des Kapitels in der Datei */
  text: string;
  woerter: number;
  aenderungen: RueckimportAenderung[];
  /** Anzahl Word-Kommentare in diesem Kapitel */
  kommentare: number;
}

export interface Rueckimport {
  kapitel: RueckimportKapitel[];
  /** Word-Kommentare (aus importiereDocx; kapitel = Index in `kapitel`, -1 = vor dem ersten Kapitel) */
  kommentare: ImportKommentar[];
  /** Änderungen vor der ersten Überschrift 1 (Titelseite, Vorspann) – werden nicht übernommen */
  aenderungenOhneKapitel: number;
  /** Formatierungsänderungen (fett, kursiv, Absatzformat) – werden nicht übernommen */
  formatierungen: number;
  /** Autorinnen und Autoren der Änderungen und Kommentare */
  autoren: string[];
}

// ---------------------------------------------------------------------------
// Datei lesen
// ---------------------------------------------------------------------------

interface Stil {
  name: string;
  basis?: string;
  gliederung?: number;
}

const norm = (s: string) => s.toLocaleLowerCase('de').replace(/\s+/g, '');
const UEBERSCHRIFT = /^(heading|überschrift|ueberschrift|berschrift)([1-9])$/;

function leseStile(xml: string | null): { stile: Map<string, Stil>; standard?: string } {
  const stile = new Map<string, Stil>();
  let standard: string | undefined;
  if (!xml) return { stile };
  for (const s of kinder(kind(parseXml(xml), 'styles'), 'style')) {
    if ((s.attr.type ?? 'paragraph') !== 'paragraph' || !s.attr.styleId) continue;
    const gl = wert(kind(kind(s, 'pPr'), 'outlineLvl'));
    stile.set(s.attr.styleId, { name: wert(kind(s, 'name')) ?? s.attr.styleId, basis: wert(kind(s, 'basedOn')), gliederung: gl === undefined ? undefined : Number(gl) });
    if (['1', 'true', 'on'].includes((s.attr.default ?? '').toLowerCase())) standard = s.attr.styleId;
  }
  return { stile, standard };
}

/** Gliederungsebene 1–9 einer Formatvorlage (wie beim Import: eigene outlineLvl vor dem Namen). */
function ebeneAusStil(stile: Map<string, Stil>, id: string | undefined): number | null {
  const besucht = new Set<string>();
  let aktuell = id;
  let erster = true;
  while (aktuell && !besucht.has(aktuell)) {
    besucht.add(aktuell);
    const s = stile.get(aktuell);
    if (!s) {
      if (!erster) break;
      const m = UEBERSCHRIFT.exec(norm(aktuell));
      return m ? Number(m[2]) : null;
    }
    if (s.gliederung !== undefined && Number.isFinite(s.gliederung)) return s.gliederung < 9 ? s.gliederung + 1 : null;
    const m = UEBERSCHRIFT.exec(norm(s.name)) ?? UEBERSCHRIFT.exec(norm(aktuell));
    if (m) return Number(m[2]);
    aktuell = s.basis;
    erster = false;
  }
  return null;
}

type Art = 'text' | 'ins' | 'del';

interface Segment {
  art: Art;
  text: string;
  autor?: string;
  datum?: string;
}

interface WAbsatz {
  ebene: number | null;
  segmente: Segment[];
  /** Absatzmarke eingefügt bzw. gelöscht */
  marke: Art;
  markeAutor?: string;
  markeDatum?: string;
}

interface Lesestand {
  formatierungen: number;
  autoren: Set<string>;
}

function aenderungVon(k: XmlKnoten, art: Art, stand: Lesestand): { art: Art; autor?: string; datum?: string } {
  const autor = k.attr.author || undefined;
  if (autor) stand.autoren.add(autor);
  return { art, autor, datum: k.attr.date || undefined };
}

function laufText(r: XmlKnoten): string {
  const rPr = kind(r, 'rPr');
  const versteckt = kind(rPr, 'vanish');
  if (versteckt && !['0', 'false', 'off'].includes((wert(versteckt) ?? '').toLowerCase())) return '';
  let text = '';
  for (const c of r.kinder) {
    switch (c.name) {
      case 't':
      case 'delText':
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
        const code = parseInt(c.attr.char ?? '', 16);
        if (Number.isFinite(code) && !/symbol|wingdings|webdings/i.test(c.attr.font ?? '')) text += String.fromCodePoint(code >= 0xf000 ? code - 0xf000 : code);
        break;
      }
      default:
        break;
    }
  }
  return text;
}

function inline(knoten: XmlKnoten[], kontext: { art: Art; autor?: string; datum?: string }, aus: Segment[], stand: Lesestand): void {
  for (const k of knoten) {
    switch (k.name) {
      case 'r': {
        if (kind(kind(k, 'rPr'), 'rPrChange')) stand.formatierungen++;
        const text = laufText(k);
        if (!text) break;
        const letzte = aus[aus.length - 1];
        if (letzte && letzte.art === kontext.art && letzte.autor === kontext.autor && letzte.datum === kontext.datum) letzte.text += text;
        else aus.push({ ...kontext, text });
        break;
      }
      case 'ins':
      case 'moveTo':
        inline(k.kinder, aenderungVon(k, 'ins', stand), aus, stand);
        break;
      case 'del':
      case 'moveFrom':
        inline(k.kinder, aenderungVon(k, 'del', stand), aus, stand);
        break;
      case 'hyperlink':
      case 'smartTag':
      case 'customXml':
      case 'fldSimple':
      case 'dir':
      case 'bdo':
        inline(k.kinder, kontext, aus, stand);
        break;
      case 'sdt':
        inline(kind(k, 'sdtContent')?.kinder ?? [], kontext, aus, stand);
        break;
      default:
        break;
    }
  }
}

function absatz(p: XmlKnoten, stile: { stile: Map<string, Stil>; standard?: string }, stand: Lesestand): WAbsatz {
  const pPr = kind(p, 'pPr');
  if (kind(pPr, 'pPrChange')) stand.formatierungen++;
  const direkt = wert(kind(pPr, 'outlineLvl'));
  const ebene =
    direkt !== undefined && Number.isFinite(Number(direkt)) ? (Number(direkt) < 9 ? Number(direkt) + 1 : null) : ebeneAusStil(stile.stile, wert(kind(pPr, 'pStyle')) ?? stile.standard);
  const segmente: Segment[] = [];
  inline(p.kinder, { art: 'text' }, segmente, stand);
  const rPr = kind(pPr, 'rPr');
  const ins = kind(rPr, 'ins') ?? kind(rPr, 'moveTo');
  const del = kind(rPr, 'del') ?? kind(rPr, 'moveFrom');
  const marke = ins ? aenderungVon(ins, 'ins', stand) : del ? aenderungVon(del, 'del', stand) : { art: 'text' as const };
  return { ebene, segmente, marke: marke.art, markeAutor: marke.autor, markeDatum: marke.datum };
}

function bloecke(knoten: XmlKnoten[], stile: { stile: Map<string, Stil>; standard?: string }, stand: Lesestand, aus: WAbsatz[]): void {
  for (const k of knoten) {
    switch (k.name) {
      case 'p':
        aus.push(absatz(k, stile, stand));
        break;
      case 'tbl':
        for (const tr of kinder(k, 'tr')) for (const tc of kinder(tr, 'tc')) bloecke(tc.kinder, stile, stand, aus);
        break;
      case 'sdt':
        bloecke(kind(k, 'sdtContent')?.kinder ?? [], stile, stand, aus);
        break;
      case 'customXml':
      case 'ins':
      case 'moveTo':
        bloecke(k.kinder, stile, stand, aus);
        break;
      default:
        break;
    }
  }
}

function relationen(xml: string | null): { typ: string; ziel: string }[] {
  if (!xml) return [];
  return kinder(kind(parseXml(xml), 'Relationships'), 'Relationship').map((r) => ({ typ: r.attr.Type ?? '', ziel: r.attr.Target ?? '' }));
}

function pfadAufloesen(basis: string, ziel: string): string {
  if (ziel.startsWith('/')) return ziel.slice(1);
  const teile = basis ? basis.split('/') : [];
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

async function leseAbsaetze(datei: Uint8Array, stand: Lesestand, sprache: Sprache): Promise<WAbsatz[]> {
  const t = DOCX_TEXTE(sprache);
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
  const stilRel = rels.find((r) => r.typ.endsWith('/styles'));
  const stile = leseStile((await lies(zip, stilRel ? pfadAufloesen(ordner, stilRel.ziel) : undefined)) ?? (await lies(zip, `${ordner}/styles.xml`)));
  const body = kind(kind(parseXml(dokXml), 'document'), 'body');
  if (!body) throw new DocxFehler(t.keinInhalt);
  const absaetze: WAbsatz[] = [];
  bloecke(body.kinder, stile, stand, absaetze);
  return absaetze;
}

// ---------------------------------------------------------------------------
// Änderungen bilden
// ---------------------------------------------------------------------------

const urText = (segmente: Segment[]) => segmente.filter((s) => s.art !== 'ins').map((s) => s.text).join('');
const neuText = (segmente: Segment[]) => segmente.filter((s) => s.art !== 'del').map((s) => s.text).join('');
const titelBereinigen = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Flache Segmentfolge eines Kapitels: Absätze mit Absatzwechsel "\n\n" (eingefügt/gelöscht wie die Absatzmarke). */
function kapitelSegmente(absaetze: WAbsatz[]): Segment[] {
  const aus: Segment[] = [];
  const anhaengen = (s: Segment) => {
    if (!s.text) return;
    const letzte = aus[aus.length - 1];
    if (letzte && letzte.art === s.art && (s.art === 'text' || (letzte.autor === s.autor && letzte.datum === s.datum))) letzte.text += s.text;
    else aus.push({ ...s });
  };
  absaetze.forEach((a, i) => {
    for (const s of a.segmente) anhaengen(s);
    if (i < absaetze.length - 1) anhaengen({ art: a.marke, text: '\n\n', autor: a.markeAutor, datum: a.markeDatum });
  });
  return aus;
}

const LEER = /\s/;

/** Einfügestelle so verschieben, dass sie direkt hinter einem Wort liegt (Anker = Wort davor). */
function einfuegestelle(ur: string, pos: number, neu: string): { pos: number; neu: string } {
  let p = pos;
  let n = neu;
  while (p > 0 && LEER.test(ur[p - 1]!) && n.length > 0 && n[n.length - 1] === ur[p - 1]) {
    n = ur[p - 1]! + n.slice(0, -1);
    p--;
  }
  return { pos: p, neu: n };
}

/** Anker für eine Einfügung: das Wort direkt vor der Stelle, sonst ein leerer Anker (nur Kontext). */
function einfuegeAnker(platzhalter: string, ur: string, pos: number): TextAnker {
  if (pos > 0 && !LEER.test(ur[pos - 1]!)) {
    let q = pos;
    while (q > 0 && !LEER.test(ur[q - 1]!)) q--;
    return ankerErzeugen(platzhalter, ur, q, pos);
  }
  return ankerErzeugen(platzhalter, ur, pos, pos);
}

/** Mehrfache Absatzwechsel zusammenfassen (leere Absätze entfallen im Manuskript). */
const absaetzeGlaetten = (s: string) => s.replace(/\n{3,}/g, '\n\n');

function aenderungenBilden(segmente: Segment[], platzhalter: string): { ur: string; aenderungen: RueckimportAenderung[] } {
  const ur = segmente.filter((s) => s.art !== 'ins').map((s) => s.text).join('');
  const aenderungen: RueckimportAenderung[] = [];
  /** Anfang des Worts vor `start` (Leerraum dazwischen eingeschlossen) */
  const wortDavor = (start: number) => {
    let q = start;
    while (q > 0 && LEER.test(ur[q - 1]!)) q--;
    while (q > 0 && !LEER.test(ur[q - 1]!)) q--;
    return q;
  };
  /** Ersetzen [start, ende) durch `neu`; nur Leerraum (z. B. Absätze zusammengeführt) wird mit dem Wort davor verankert. */
  const ersetzen = (start: number, ende: number, neu: string, autor?: string, datum?: string) => {
    const alt = ur.slice(start, ende);
    if (alt.trim() === '') {
      const q = wortDavor(start);
      if (q === start) return;
      const wort = ur.slice(q, start);
      aenderungen.push({
        art: 'ersetzen',
        anker: ankerErzeugen(platzhalter, ur, q, ende),
        alt: absaetzeGlaetten(wort + alt),
        neu: neu === '' ? wort.trimEnd() : absaetzeGlaetten(wort + neu),
        autor,
        datum,
      });
      return;
    }
    aenderungen.push({ art: 'ersetzen', anker: ankerErzeugen(platzhalter, ur, start, ende), alt: absaetzeGlaetten(alt), neu: absaetzeGlaetten(neu), autor, datum });
  };
  let pos = 0;
  for (let i = 0; i < segmente.length; i++) {
    const s = segmente[i]!;
    if (s.art === 'text') {
      pos += s.text.length;
      continue;
    }
    const folgend = segmente[i + 1];
    if (s.art === 'del') {
      const start = pos;
      pos += s.text.length;
      if (folgend?.art === 'ins') {
        // Löschen + Einfügen an derselben Stelle = Ersetzen
        i++;
        ersetzen(start, pos, folgend.text, s.autor ?? folgend.autor, s.datum ?? folgend.datum);
      } else if (s.text.trim()) {
        aenderungen.push({ art: 'loeschen', anker: ankerErzeugen(platzhalter, ur, start, pos), alt: absaetzeGlaetten(s.text), neu: '', autor: s.autor, datum: s.datum });
      } else {
        // Nur Leerraum gelöscht (Absätze ohne Leerzeichen zusammengeführt)
        ersetzen(start, pos, '', s.autor, s.datum);
      }
      continue;
    }
    // Einfügen (ggf. gefolgt von Löschen = Ersetzen)
    if (folgend?.art === 'del') {
      i++;
      const start = pos;
      pos += folgend.text.length;
      ersetzen(start, pos, s.text, s.autor ?? folgend.autor, s.datum ?? folgend.datum);
      continue;
    }
    const stelle = einfuegestelle(ur, pos, absaetzeGlaetten(s.text));
    aenderungen.push({ art: 'einfuegen', anker: einfuegeAnker(platzhalter, ur, stelle.pos), alt: '', neu: stelle.neu, autor: s.autor, datum: s.datum });
  }
  return { ur, aenderungen };
}

/**
 * Liest eine zurückgeschickte .docx: Kapitel (Überschrift 1), Änderungen und Kommentare.
 * `sprache`: Oberflächensprache der Fehlermeldungen (und des vorläufigen Titels „Kapitel n“).
 */
export async function leseRueckimport(datei: Uint8Array, sprache: Sprache = 'de'): Promise<Rueckimport> {
  const importiert = await importiereDocx(datei, sprache);
  const stand: Lesestand = { formatierungen: 0, autoren: new Set() };
  const absaetze = await leseAbsaetze(datei, stand, sprache);

  const roh: { kopf: WAbsatz; absaetze: WAbsatz[] }[] = [];
  let vorher = 0;
  for (const a of absaetze) {
    if (a.ebene === 1) roh.push({ kopf: a, absaetze: [] });
    else if (roh.length) roh[roh.length - 1]!.absaetze.push(a);
    else vorher += a.segmente.filter((s) => s.art !== 'text' && s.text.trim()).length;
  }

  const kapitel: RueckimportKapitel[] = [];
  for (const r of roh) {
    const titel = titelBereinigen(urText(r.kopf.segmente));
    const titelNeu = titelBereinigen(neuText(r.kopf.segmente));
    const inhalt = r.absaetze.filter((a) => a.segmente.some((s) => s.text.trim()) || a.marke !== 'text');
    const hatText = inhalt.some((a) => a.segmente.some((s) => s.text.trim()));
    // wie beim Import: Überschrift ohne Titel und ohne Text wird nicht übernommen
    if (!titel && !titelNeu && !hatText) continue;
    const platzhalter = `#${kapitel.length + 1}`;
    const { ur, aenderungen } = aenderungenBilden(kapitelSegmente(inhalt), platzhalter);
    const text = absaetzeGlaetten(ur).trim();
    kapitel.push({
      titel: titel || titelNeu || fmt(DOCX_TEXTE(sprache).kapitel, { n: kapitel.length + 1 }),
      titelNeu: titelNeu || titel,
      text,
      woerter: woerterZaehlen(text),
      aenderungen,
      kommentare: 0,
    });
  }

  const kommentare = importiert.kommentare ?? [];
  for (const k of kommentare) {
    if (k.autor) stand.autoren.add(k.autor);
    const ziel = kapitel[k.kapitel];
    if (ziel) ziel.kommentare++;
  }
  return { kapitel, kommentare, aenderungenOhneKapitel: vorher, formatierungen: stand.formatierungen, autoren: [...stand.autoren].sort((a, b) => a.localeCompare(b, 'de')) };
}

// ---------------------------------------------------------------------------
// Zuordnung zu Projektkapiteln
// ---------------------------------------------------------------------------

export type ZuordnungsArt = 'titel' | 'reihenfolge' | 'manuell' | 'keine';

export interface KapitelZuordnung {
  /** Projektkapitel-ID; null = nicht übernehmen */
  kapitel: Id | null;
  art: ZuordnungsArt;
}

const titelSchluessel = (s: string) =>
  s
    .normalize('NFC')
    .toLocaleLowerCase('de')
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();

/**
 * Schlägt je Word-Kapitel ein Projektkapitel vor: zuerst über den Titel (eindeutig, alt oder neu),
 * sonst über die Reihenfolge (gleiche Position unter den noch freien Kapiteln mit Text).
 */
export function kapitelZuordnen(r: Rueckimport, projekt: { id: Id; titel: string; text: string }[]): KapitelZuordnung[] {
  const ergebnis: KapitelZuordnung[] = r.kapitel.map(() => ({ kapitel: null, art: 'keine' }));
  const vergeben = new Set<Id>();
  const nachTitel = new Map<string, Id[]>();
  for (const k of projekt) {
    const s = titelSchluessel(k.titel);
    if (!s) continue;
    nachTitel.set(s, [...(nachTitel.get(s) ?? []), k.id]);
  }
  r.kapitel.forEach((k, i) => {
    for (const t of [k.titel, k.titelNeu]) {
      const treffer = (nachTitel.get(titelSchluessel(t)) ?? []).filter((id) => !vergeben.has(id));
      if (treffer.length === 1) {
        ergebnis[i] = { kapitel: treffer[0]!, art: 'titel' };
        vergeben.add(treffer[0]!);
        return;
      }
    }
  });
  const mitText = projekt.filter((k) => klartext(k.text).trim() !== '');
  r.kapitel.forEach((_, i) => {
    if (ergebnis[i]!.kapitel) return;
    const kandidat = mitText[i] ?? projekt[i];
    if (kandidat && !vergeben.has(kandidat.id)) {
      ergebnis[i] = { kapitel: kandidat.id, art: 'reihenfolge' };
      vergeben.add(kandidat.id);
    }
  });
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Übernahme
// ---------------------------------------------------------------------------

export interface RueckimportUebernahme {
  anmerkungen: Anmerkung[];
  aenderungen: LektoratsAenderung[];
  /** Kapitel-ID → Text für die Plan-Notiz (Kommentare an Kapiteln ohne Text) */
  planNotizen: Record<Id, string>;
  /** Kommentare vor dem ersten Kapitel bzw. an nicht übernommenen Kapiteln */
  projektNotiz: string;
  /** Änderungen und Kommentare, deren Stelle im aktuellen Text nicht (eindeutig) gefunden wurde */
  nichtGefunden: number;
  /** bereits früher übernommen, daher übersprungen */
  doppelt: number;
}

export interface UebernahmeKontext {
  kapitel: Record<Id, Kapitel | undefined>;
  vorhandeneAnmerkungen: Anmerkung[];
  vorhandeneAenderungen: LektoratsAenderung[];
  neueId(titel: string, vorhandene: string[]): string;
  jetzt: string;
  /** Dateiname der .docx */
  quelle: string;
}

/** Anker im aktuellen Kapiteltext neu bilden (Kontext aus Leons Text); null = nicht gefunden. */
function neuVerankern(kt: string, anker: TextAnker, kapitel: Id, einfuegen: boolean): TextAnker | null {
  const b = ankerFinden(kt, { ...anker, kapitel });
  if (!b) return null;
  if (einfuegen && anker.exakt.trim() === '') return ankerErzeugen(kapitel, kt, b.ende, b.ende);
  return ankerErzeugen(kapitel, kt, b.start, b.ende);
}

const gleicherText = (a: string, b: string) => normalisiere(a).text === normalisiere(b).text;

/** Kommentare → Anmerkungen, Änderungen → Änderungsvorschläge (Status „offen“), verankert in Leons aktuellem Text. */
export function rueckimportUebernahme(r: Rueckimport, zuordnung: (Id | null)[], ctx: UebernahmeKontext): RueckimportUebernahme {
  let nichtGefunden = 0;
  let doppelt = 0;
  const kts = new Map<Id, string>();
  const kt = (id: Id) => {
    let t = kts.get(id);
    if (t === undefined) {
      t = klartext(ctx.kapitel[id]?.text ?? '');
      kts.set(id, t);
    }
    return t;
  };

  // Kommentare über die bestehende Kommentar-Logik
  const k = kommentareAlsAnmerkungen(r.kommentare, zuordnung, null, ctx.vorhandeneAnmerkungen.map((a) => a.id), ctx.neueId, ctx.jetzt);
  const anmerkungen: Anmerkung[] = [];
  for (const a of k.anmerkungen) {
    const neu = neuVerankern(kt(a.anker.kapitel), a.anker, a.anker.kapitel, false);
    if (!neu) nichtGefunden++;
    const anmerkung = { ...a, anker: neu ?? a.anker };
    const schon = ctx.vorhandeneAnmerkungen.some(
      (v) => v.quelle === 'word' && v.anker.kapitel === anmerkung.anker.kapitel && v.anker.exakt === anmerkung.anker.exakt && v.notiz === anmerkung.notiz && (v.autor ?? '') === (anmerkung.autor ?? ''),
    );
    if (schon) doppelt++;
    else anmerkungen.push(anmerkung);
  }

  const vergeben = ctx.vorhandeneAenderungen.map((a) => a.id);
  const aenderungen: LektoratsAenderung[] = [];
  r.kapitel.forEach((kap, i) => {
    const id = zuordnung[i];
    if (!id) return;
    for (const a of kap.aenderungen) {
      const anker = neuVerankern(kt(id), a.anker, id, a.art === 'einfuegen');
      if (!anker) nichtGefunden++;
      const kandidat: LektoratsAenderung = {
        id: '',
        anker: anker ?? { ...a.anker, kapitel: id },
        art: a.art,
        alt: a.alt,
        neu: a.neu,
        ...(a.autor ? { autor: a.autor } : {}),
        ...(a.datum ? { datum: a.datum } : {}),
        quelle: ctx.quelle,
        status: 'offen',
      };
      const schon = [...ctx.vorhandeneAenderungen, ...aenderungen].some(
        (v) =>
          v.anker.kapitel === kandidat.anker.kapitel &&
          v.art === kandidat.art &&
          gleicherText(v.alt, kandidat.alt) &&
          gleicherText(v.neu, kandidat.neu) &&
          gleicherText(v.anker.exakt, kandidat.anker.exakt) &&
          (v.autor ?? '') === (kandidat.autor ?? '') &&
          (v.datum ?? '') === (kandidat.datum ?? ''),
      );
      if (schon) {
        doppelt++;
        continue;
      }
      kandidat.id = ctx.neueId(`lektorat ${id}`, vergeben);
      vergeben.push(kandidat.id);
      aenderungen.push(kandidat);
    }
  });
  return { anmerkungen, aenderungen, planNotizen: k.planNotizen, projektNotiz: k.projektNotiz, nichtGefunden, doppelt };
}
