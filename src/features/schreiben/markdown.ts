/**
 * Markdown ↔ Editor-Dokument für die Teilmenge des Manuskripts (CommonMark wie in core/text):
 *
 * - Absätze durch Leerzeile getrennt. Zeilenwechsel im Absatz: weich ("\n", im Klartext ein
 *   Leerzeichen) oder hart ("\\\n" bzw. zwei Leerzeichen + "\n"). Der Editor zeigt beide als Umbruch;
 *   Umschalt+Eingabe erzeugt einen harten Umbruch, gespeichert als "\\\n".
 * - `#`…`######` + Leerzeichen = Überschrift; Text + Zeile aus `=`/`-` = Überschrift (Setext).
 * - Eigene Zeile aus drei oder mehr `*`, `-` oder `_` = Szenentrenner (kanonisch `* * *`).
 * - `**fett**`/`__fett__`, `*kursiv*`/`_kursiv_` nach den CommonMark-Regeln; `\` maskiert ASCII-Satzzeichen.
 * - Alles andere (Listen-, Zitat-, Code-Zeichen, Links, Entities, „“‚‘’–…»«) bleibt wörtlicher Text;
 *   beim Speichern wird es so maskiert, dass core/text und der Export dasselbe lesen wie der Editor.
 *
 * Laden und unverändertes Speichern ergeben byte-identischen Text: Schreibweisen der Auszeichnung,
 * Umbrüche und Leerraum am Absatzrand stehen in nicht dargestellten Attributen (siehe schema.ts).
 * Gespeichert wird ohne Leerraum am Anfang/Ende des Kapitels, Blöcke durch genau eine Leerzeile getrennt.
 */
import { Mark, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { schreibSchema } from './schema';

export const SZENENTRENNER = '* * *';
/** Standardform des harten Umbruchs */
export const HARTER_UMBRUCH = '\\\n';

const LEERZEILE = /^[ \t]*$/;
const TRENNER = /^ {0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const ATX = /^( {0,3}#{1,6})(?:([ \t]+)(.*))?$/;
const ASCII_SATZZEICHEN = /^[!-/:-@[-`{-~]$/;
/** Platzhalter für Umbrüche beim Serialisieren (zählt als Leerraum) */
const UMBRUCH = '';

function istLeer(c: string | undefined): boolean {
  return c === undefined || c === UMBRUCH || /^\s$/u.test(c);
}

function istSatzzeichen(c: string | undefined): boolean {
  return c !== undefined && /^[\p{P}\p{S}]$/u.test(c);
}

function istWortzeichen(c: string | undefined): boolean {
  return c !== undefined && /^[\p{L}\p{N}]$/u.test(c);
}

/** Harter Umbruch (im Klartext "\n") oder weicher (im Klartext " ")? */
export function istHarterUmbruch(markup: string | null | undefined): boolean {
  return markup == null || markup.startsWith('\\') || /^ {2,}\n/.test(markup);
}

// ---------------------------------------------------------------------------
// Parsen
// ---------------------------------------------------------------------------

type MarkTyp = 'fett' | 'kursiv';

interface Hervorhebung {
  typ: MarkTyp;
  markup: string;
}

interface Begrenzer {
  art: 'begrenzer';
  zeichen: '*' | '_';
  /** noch nicht verbrauchte Zeichen (bleiben am Ende als Text stehen) */
  anzahl: number;
  laenge: number;
  oeffnen: boolean;
  schliessen: boolean;
  aktiv: boolean;
  /** in Reihenfolge des Verbrauchs (innen zuerst) */
  geoeffnet: Hervorhebung[];
  geschlossen: Hervorhebung[];
}

type Teil = { art: 'text'; text: string } | { art: 'umbruch'; markup: string } | Begrenzer;

function zerlegen(src: string): Teil[] {
  const teile: Teil[] = [];
  let puffer = '';
  let letztesMaskiert = false;
  const textAbschliessen = () => {
    if (puffer) teile.push({ art: 'text', text: puffer });
    puffer = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const folgend = src[i + 1];
    if (c === '\\' && folgend !== undefined && ASCII_SATZZEICHEN.test(folgend)) {
      puffer += folgend;
      letztesMaskiert = true;
      i += 2;
      continue;
    }
    if (c === '\n') {
      let markup: string;
      if (puffer.endsWith('\\') && !letztesMaskiert) {
        puffer = puffer.slice(0, -1);
        markup = '\\\n';
      } else {
        const ws = / *$/.exec(puffer)![0];
        puffer = puffer.slice(0, puffer.length - ws.length);
        markup = `${ws}\n`;
      }
      let j = i + 1;
      while (src[j] === ' ' || src[j] === '\t') j++;
      markup += src.slice(i + 1, j);
      textAbschliessen();
      teile.push({ art: 'umbruch', markup });
      letztesMaskiert = false;
      i = j;
      continue;
    }
    if (c === '*' || c === '_') {
      let j = i;
      while (src[j] === c) j++;
      const vor = i > 0 ? src[i - 1] : undefined;
      const nach = src[j];
      const links = !istLeer(nach) && (!istSatzzeichen(nach) || istLeer(vor) || istSatzzeichen(vor));
      const rechts = !istLeer(vor) && (!istSatzzeichen(vor) || istLeer(nach) || istSatzzeichen(nach));
      const oeffnen = c === '*' ? links : links && (!rechts || istSatzzeichen(vor));
      const schliessen = c === '*' ? rechts : rechts && (!links || istSatzzeichen(nach));
      textAbschliessen();
      teile.push({ art: 'begrenzer', zeichen: c, anzahl: j - i, laenge: j - i, oeffnen, schliessen, aktiv: true, geoeffnet: [], geschlossen: [] });
      letztesMaskiert = false;
      i = j;
      continue;
    }
    puffer += c;
    letztesMaskiert = false;
    i++;
  }
  textAbschliessen();
  return teile;
}

/** CommonMark „process emphasis“ (ohne Optimierung der Suchgrenzen). */
function hervorhebungenZuordnen(teile: Teil[]): void {
  const begrenzer = teile.filter((t): t is Begrenzer => t.art === 'begrenzer');
  for (let c = 0; c < begrenzer.length; c++) {
    const schliesser = begrenzer[c]!;
    if (!schliesser.schliessen || !schliesser.aktiv) continue;
    while (schliesser.anzahl > 0) {
      let gefunden = -1;
      for (let o = c - 1; o >= 0; o--) {
        const oeffner = begrenzer[o]!;
        if (!oeffner.aktiv || !oeffner.oeffnen || oeffner.anzahl === 0 || oeffner.zeichen !== schliesser.zeichen) continue;
        const summe = oeffner.laenge + schliesser.laenge;
        if ((oeffner.schliessen || schliesser.oeffnen) && summe % 3 === 0 && !(oeffner.laenge % 3 === 0 && schliesser.laenge % 3 === 0)) continue;
        gefunden = o;
        break;
      }
      if (gefunden < 0) break;
      const oeffner = begrenzer[gefunden]!;
      const n = oeffner.anzahl >= 2 && schliesser.anzahl >= 2 ? 2 : 1;
      const h: Hervorhebung = { typ: n === 2 ? 'fett' : 'kursiv', markup: schliesser.zeichen.repeat(n) };
      oeffner.geoeffnet.push(h);
      schliesser.geschlossen.push(h);
      oeffner.anzahl -= n;
      schliesser.anzahl -= n;
      for (let k = gefunden + 1; k < c; k++) begrenzer[k]!.aktiv = false;
      if (oeffner.anzahl === 0) oeffner.aktiv = false;
    }
    if (schliesser.anzahl === 0 || !schliesser.oeffnen) schliesser.aktiv = false;
  }
}

function markenFuer(aktiv: Hervorhebung[], schema: Schema): readonly Mark[] {
  let marken: readonly Mark[] = Mark.none;
  const fett = aktiv.find((h) => h.typ === 'fett');
  const kursiv = aktiv.find((h) => h.typ === 'kursiv');
  if (fett) marken = schema.marks.bold!.create({ markup: fett.markup === '**' ? null : fett.markup }).addToSet(marken);
  if (kursiv) marken = schema.marks.italic!.create({ markup: kursiv.markup === '*' ? null : kursiv.markup }).addToSet(marken);
  return marken;
}

function inlineParsen(src: string, schema: Schema): PMNode[] {
  const teile = zerlegen(src);
  hervorhebungenZuordnen(teile);
  const knoten: PMNode[] = [];
  const aktiv: Hervorhebung[] = [];
  const text = (t: string) => {
    if (!t) return;
    const marken = markenFuer(aktiv, schema);
    const letzter = knoten[knoten.length - 1];
    if (letzter?.isText && Mark.sameSet(letzter.marks, marken)) knoten[knoten.length - 1] = schema.text(letzter.text! + t, marken);
    else knoten.push(schema.text(t, marken));
  };
  for (const t of teile) {
    if (t.art === 'text') text(t.text);
    else if (t.art === 'umbruch')
      knoten.push(schema.node('hardBreak', { markup: t.markup === HARTER_UMBRUCH ? null : t.markup }, undefined, markenFuer(aktiv, schema)));
    else {
      for (const h of t.geschlossen) {
        const i = aktiv.lastIndexOf(h);
        if (i >= 0) aktiv.splice(i, 1);
      }
      text(t.zeichen.repeat(t.anzahl));
      for (let k = t.geoeffnet.length - 1; k >= 0; k--) aktiv.push(t.geoeffnet[k]!);
    }
  }
  return knoten;
}

function absatzKnoten(zeilen: string[], schema: Schema): PMNode {
  const roh = zeilen.join('\n');
  const einzug = /^[ \t]*/.exec(roh)![0];
  const auslauf = /[ \t]*$/.exec(roh.slice(einzug.length))![0];
  const inhalt = roh.slice(einzug.length, roh.length - auslauf.length);
  return schema.node('paragraph', { einzug, auslauf }, inlineParsen(inhalt, schema));
}

export function markdownZuDoc(markdown: string, schema: Schema = schreibSchema): PMNode {
  const zeilen = markdown.replace(/\r\n?/g, '\n').split('\n');
  const bloecke: PMNode[] = [];
  let absatz: string[] = [];
  const absatzAbschliessen = () => {
    if (absatz.length) bloecke.push(absatzKnoten(absatz, schema));
    absatz = [];
  };
  for (const zeile of zeilen) {
    if (LEERZEILE.test(zeile)) {
      absatzAbschliessen();
      continue;
    }
    const setext = absatz.length ? SETEXT.exec(zeile) : null;
    if (setext) {
      bloecke.push(schema.node('heading', { level: setext[1]![0] === '=' ? 1 : 2, markup: zeile }, inlineParsen(absatz.join('\n'), schema)));
      absatz = [];
      continue;
    }
    if (TRENNER.test(zeile)) {
      absatzAbschliessen();
      bloecke.push(schema.node('horizontalRule', { markup: zeile === SZENENTRENNER ? null : zeile }));
      continue;
    }
    const atx = ATX.exec(zeile);
    if (atx) {
      absatzAbschliessen();
      const rauten = atx[1]!;
      const ebene = rauten.replace(/ /g, '').length;
      const praefix = rauten + (atx[2] ?? '');
      const standard = praefix === `${'#'.repeat(ebene)} ` || (praefix === '#'.repeat(ebene) && atx[3] === undefined);
      bloecke.push(schema.node('heading', { level: ebene, markup: standard ? null : praefix }, inlineParsen(atx[3] ?? '', schema)));
      continue;
    }
    absatz.push(zeile);
  }
  absatzAbschliessen();
  if (bloecke.length === 0) bloecke.push(schema.node('paragraph'));
  return schema.node('doc', null, bloecke);
}

// ---------------------------------------------------------------------------
// Serialisieren
// ---------------------------------------------------------------------------

interface Segment {
  roh: string;
  fett: string | null;
  kursiv: string | null;
}

interface Offen {
  typ: MarkTyp;
  markup: string;
  /** tatsächlich geschriebene Zeichen (bei `_` mitten im Wort ersatzweise `*`) */
  zeichen: string;
}

interface AbsatzMerkmale {
  backticks: boolean;
  links: boolean;
}

function markupVon(knoten: PMNode, name: 'bold' | 'italic'): string | null {
  const m = knoten.marks.find((x) => x.type.name === name);
  if (!m) return null;
  return (m.attrs.markup as string | null) ?? (name === 'bold' ? '**' : '*');
}

const AUTOLINK = /^<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/;
const ENTITY = /^&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z\d]{1,31});/;

/** Maskiert Zeichen, die sonst als Auszeichnung gelesen würden. `vor`/`nach`: Nachbarn außerhalb von `text`. */
function maskieren(text: string, vor: string, nach: string, merkmale: AbsatzMerkmale): string {
  let aus = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const v = i > 0 ? text[i - 1]! : vor;
    const n = i + 1 < text.length ? text[i + 1]! : nach;
    let schutz = false;
    switch (c) {
      case '*':
        schutz = !(istLeer(v) && istLeer(n));
        break;
      case '_':
        schutz = !((istLeer(v) && istLeer(n)) || (istWortzeichen(v) && istWortzeichen(n)));
        break;
      case '\\':
        schutz = ASCII_SATZZEICHEN.test(n);
        break;
      case '`':
        schutz = merkmale.backticks;
        break;
      case '[':
        schutz = merkmale.links;
        break;
      case '<':
        schutz = AUTOLINK.test(text.slice(i));
        break;
      case '&':
        schutz = ENTITY.test(text.slice(i));
        break;
    }
    aus += schutz ? `\\${c}` : c;
  }
  return aus;
}

function segmente(knoten: PMNode, imTitel: boolean, umbrueche: string[]): Segment[] {
  const roh: Segment[] = [];
  knoten.forEach((kind) => {
    let text = '';
    if (kind.isText) text = kind.text ?? '';
    else if (kind.type.name === 'hardBreak') {
      if (imTitel) text = ' ';
      else {
        umbrueche.push((kind.attrs.markup as string | null) ?? HARTER_UMBRUCH);
        text = UMBRUCH;
      }
    }
    if (!text) return;
    roh.push({ roh: text, fett: markupVon(kind, 'bold'), kursiv: markupVon(kind, 'italic') });
  });
  const nurLeer = (s: string) => [...s].every((c) => istLeer(c));
  // Nur-Leerraum mit Auszeichnung: Auszeichnung nur behalten, wenn sie links und rechts weiterläuft
  const bereinigt = roh.map((s, i) => {
    if (!nurLeer(s.roh) || (!s.fett && !s.kursiv)) return s;
    const v = roh[i - 1];
    const n = roh[i + 1];
    return {
      roh: s.roh,
      fett: v && n && v.fett === s.fett && n.fett === s.fett ? s.fett : null,
      kursiv: v && n && v.kursiv === s.kursiv && n.kursiv === s.kursiv ? s.kursiv : null,
    };
  });
  const zusammen: Segment[] = [];
  for (const s of bereinigt) {
    const letzte = zusammen[zusammen.length - 1];
    if (letzte && letzte.fett === s.fett && letzte.kursiv === s.kursiv) letzte.roh += s.roh;
    else zusammen.push({ ...s });
  }
  return zusammen;
}

const VORNE_LEER = /^[\s]*/u;
const HINTEN_LEER = /[\s]*$/u;

/** Inline-Inhalt als Markdown; Umbrüche als Platzhalter UMBRUCH (Markup in `umbrueche`). */
function inlineZuMarkdown(knoten: PMNode, imTitel: boolean, umbrueche: string[]): string {
  const segs = segmente(knoten, imTitel, umbrueche);
  const flach = segs.map((s) => s.roh).join('');
  const merkmale: AbsatzMerkmale = {
    backticks: (flach.match(/`/g)?.length ?? 0) >= 2,
    links: flach.includes(']('),
  };
  const stapel: Offen[] = [];
  let aus = '';

  const schliessen = (bis: number) => {
    const weg = stapel.splice(bis);
    if (!weg.length) return;
    const ws = HINTEN_LEER.exec(aus)![0];
    aus = aus.slice(0, aus.length - ws.length) + weg.reverse().map((o) => o.zeichen).join('') + ws;
  };

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const ziel: Record<MarkTyp, string | null> = { fett: s.fett, kursiv: s.kursiv };
    let behalten = 0;
    while (behalten < stapel.length && ziel[stapel[behalten]!.typ] === stapel[behalten]!.markup) behalten++;
    schliessen(behalten);
    const offen = new Set(stapel.map((o) => o.typ));
    const neu = (['fett', 'kursiv'] as MarkTyp[]).filter((t) => ziel[t] && !offen.has(t));
    const reichweite = (t: MarkTyp) => {
      let j = i;
      while (j < segs.length && segs[j]![t] === ziel[t]) j++;
      return j;
    };
    neu.sort((a, b) => reichweite(b) - reichweite(a));

    const vorne = VORNE_LEER.exec(s.roh)![0];
    const rest = s.roh.slice(vorne.length);
    const hinten = HINTEN_LEER.exec(rest)![0];
    const kern = rest.slice(0, rest.length - hinten.length);
    const nach = i === segs.length - 1 && !hinten ? ' ' : '*';

    if (neu.length) {
      aus += vorne;
      for (const t of neu) {
        const markup = ziel[t]!;
        let zeichen = markup;
        if (markup[0] === '_') {
          const ende = reichweite(t);
          const vorZeichen = aus[aus.length - 1];
          const nachZeichen = segs[ende]?.roh[0];
          const endetMitLeerraum = istLeer(segs[ende - 1]!.roh.slice(-1));
          if (istWortzeichen(vorZeichen) || (!endetMitLeerraum && istWortzeichen(nachZeichen))) zeichen = '*'.repeat(markup.length);
        }
        stapel.push({ typ: t, markup, zeichen });
        aus += zeichen;
      }
      aus += maskieren(kern, '*', nach, merkmale) + hinten;
    } else {
      const vor = vorne || i === 0 ? ' ' : '*';
      aus += vorne + maskieren(kern, vor, nach, merkmale) + hinten;
    }
  }
  schliessen(0);
  return aus;
}

/** Zeilen, die beim Lesen ein anderes Block-Element ergäben, mit `\` schützen. */
function zeileSchuetzen(zeile: string, erste: boolean): string {
  const einzug = /^[ \t]*/.exec(zeile)![0];
  const rest = zeile.slice(einzug.length);
  const schutz = (k: number) => einzug + rest.slice(0, k) + '\\' + rest.slice(k);
  if (/^#{1,6}(?:[ \t]|$)/.test(rest) || TRENNER.test(rest) || /^[*+-](?:[ \t]|$)/.test(rest) || /^>/.test(rest) || /^(?:`{3,}|~{3,})/.test(rest))
    return schutz(0);
  if (!erste && SETEXT.test(rest)) return schutz(0);
  const liste = /^(\d{1,9})[.)](?:[ \t]|$)/.exec(rest);
  if (liste && (erste || liste[1] === '1')) return schutz(liste[1]!.length);
  if (erste && /^\[[^\]]*\]:/.test(rest)) return schutz(0);
  return zeile;
}

function zeilenZusammensetzen(inhalt: string, umbrueche: string[]): string {
  const zeilen = inhalt.split(UMBRUCH);
  let aus = '';
  zeilen.forEach((z, i) => {
    if (i > 0) aus += umbrueche[i - 1] ?? HARTER_UMBRUCH;
    aus += zeileSchuetzen(z, i === 0);
  });
  return aus;
}

export function docZuMarkdown(doc: PMNode): string {
  const bloecke: string[] = [];
  doc.forEach((knoten) => {
    switch (knoten.type.name) {
      case 'horizontalRule':
        bloecke.push((knoten.attrs.markup as string | null) ?? SZENENTRENNER);
        break;
      case 'heading': {
        const markup = knoten.attrs.markup as string | null;
        const ebene = knoten.attrs.level as number;
        if (markup && SETEXT.test(markup)) {
          const umbrueche: string[] = [];
          const inhalt = inlineZuMarkdown(knoten, false, umbrueche);
          if (inhalt.trim()) {
            bloecke.push(`${zeilenZusammensetzen(inhalt, umbrueche)}\n${markup}`);
            break;
          }
        }
        const inhalt = inlineZuMarkdown(knoten, true, []);
        const praefix = markup && !SETEXT.test(markup) ? markup : `${'#'.repeat(ebene)} `;
        bloecke.push(inhalt ? praefix + inhalt : praefix.trimEnd());
        break;
      }
      default: {
        if (!knoten.isTextblock) break;
        const umbrueche: string[] = [];
        const inhalt = inlineZuMarkdown(knoten, false, umbrueche).replace(/^[ \t]+/, '');
        if ([...inhalt].every((c) => istLeer(c))) break;
        const einzug = (knoten.attrs.einzug as string | undefined) ?? '';
        const auslauf = (knoten.attrs.auslauf as string | undefined) ?? '';
        bloecke.push(einzug + zeilenZusammensetzen(inhalt, umbrueche) + auslauf);
      }
    }
  });
  return bloecke.join('\n\n');
}
