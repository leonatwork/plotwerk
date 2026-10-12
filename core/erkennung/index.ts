/**
 * Exakte Erkennung von Figuren und Orten (E5) und Schreibweisen-Varianten. Besitzer: Kernlogik.
 *
 * Gesucht wird im normalisierten Klartext (E6), Offsets beziehen sich auf den Klartext (core/text).
 * - Wortgrenzen über Unicode-Buchstaben/Ziffern: „Ole“ trifft nicht „Oleander“, „Lotte“ nicht „Lotterie“.
 * - Name, Aliase, `formen`; automatisch Genitiv („Pauls“, „Paul’s“; bei s/x/z/ß „Hans’“).
 * - Mehrwort-Namen mit Artikel („Die Fremde“): der/die/das/den/dem/des, Nomen auf -e auch mit -n.
 *   Klein beginnende Namen („alter Mann“) auch am Satzanfang; „Herr X“ auch als „Herrn X“.
 * - Schreibweisen aus entscheidungen.schreibweisen sowie Varianten mit/ohne Leerzeichen/Bindestrich
 *   werden erst NACH Leons Entscheidung erkannt; vorher meldet schreibweisenHinweise sie.
 *
 * Buchsprache (projekt.angaben.sprache, nicht die Oberflächensprache): Die deutschen Regeln (Genitiv-s ohne
 * Apostroph „Pauls“, Artikel der/die/das, „Herrn“, -e/-en) gelten nur für deutsche Bücher. Englisch: Possessiv
 * ’s/'s („Lotte’s“, „James’s“), bei Namen auf -s auch nur ’ („James’“), Plural-Possessiv s’ („the Millers’“),
 * Artikel „The“ („The Stranger“ / „the Stranger“); ein schließendes doppeltes Anführungszeichen nach dem Namen
 * gehört nie zum Treffer.
 */
import { buchSprache, fmt, texteJe, type Sprache } from '../i18n';
import type { Erwaehnung, Figur, Hinweis, Id, Kapitel, Motiv, Ort, ProjektDaten, Schreibweise, Zitat } from '../model/types';
import {
  absaetze,
  absatzIndex,
  editierdistanz,
  klartext as klartextAus,
  normalisiere,
  normalisiereMitBereichen,
  textHash,
  zitatSchluessel,
  zuOriginalBereich,
} from '../text';

/** `projekt.angaben.sprache` bestimmt die Buchsprache der Erkennung (fehlt = Deutsch). */
export type ErkennungsDaten = Pick<ProjektDaten, 'figuren' | 'orte' | 'entscheidungen'> & {
  projekt?: { angaben?: { sprache?: string } };
};

/** Buchsprache der Erkennung (nicht die Sprache der Oberfläche oder der Hinweistexte). */
export function erkennungsSprache(daten: { projekt?: { angaben?: { sprache?: string } } }): Sprache {
  return buchSprache(daten.projekt?.angaben);
}

export interface NamensTreffer {
  zielTyp: 'figur' | 'ort';
  ziel: Id;
  /** Offsets im übergebenen Text */
  start: number;
  ende: number;
  treffer: string;
}

const VOR = '(?<![\\p{L}\\p{N}\\p{M}])';
const NACH = '(?![\\p{L}\\p{N}\\p{M}])';

function esc(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

function norm(s: string): string {
  return normalisiere(s).text.trim();
}

/** Nur Buchstaben und Ziffern, klein – „Linden-Hof“ und „Lindenhof“ ergeben denselben Schlüssel. */
export function kompakt(s: string): string {
  return norm(s)
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLocaleLowerCase('de');
}

function istKlein(c: string): boolean {
  return c.toLocaleLowerCase('de') === c && c.toLocaleUpperCase('de') !== c;
}

const ARTIKEL = /^(der|die|das)$/i;

/** Englisch: „The Stranger“ trifft auch „the Stranger“; Possessiv nur mit Apostroph (normalisiert "). */
function namensMusterEn(n: string): string {
  const woerter = n.split(' ');
  const teile = woerter.map(esc);
  const erstes = woerter[0]!;
  if (woerter.length >= 2 && /^the$/i.test(erstes)) teile[0] = '[Tt]he';
  else if (istKlein(erstes[0]!)) teile[0] = `[${erstes[0]!}${erstes[0]!.toLocaleUpperCase('en')}]${esc(erstes.slice(1))}`;
  // James’ / James’s; sonst Lotte’s und Plural-Possessiv Millers’
  const possessiv = /s$/i.test(n) ? '(?:"s|")?' : '(?:"s|s")?';
  return teile.join(' ') + possessiv;
}

/** Regex-Baustein für einen Namen (normalisiert), inklusive Genitiv bzw. Possessiv der Buchsprache. */
function namensMuster(name: string, sprache: Sprache = 'de'): string | null {
  const n = norm(name);
  if (!n) return null;
  if (sprache === 'en') return namensMusterEn(n);
  const woerter = n.split(' ');
  const teile = woerter.map(esc);
  const mehrwortig = woerter.length >= 2;
  if (mehrwortig && ARTIKEL.test(woerter[0]!)) {
    teile[0] = '[Dd](?:er|ie|as|en|em|es)';
    for (let k = 1; k < woerter.length; k++) if (/e$/.test(woerter[k]!)) teile[k] += 'n?';
  } else {
    const erstes = woerter[0]!;
    const b = erstes[0]!;
    if (istKlein(b)) teile[0] = `[${b}${b.toLocaleUpperCase('de')}]${esc(erstes.slice(1))}`;
    if (erstes === 'Herr' && mehrwortig) teile[0] = 'Herrn?';
    if (mehrwortig)
      for (let k = 0; k < woerter.length - 1; k++) if (istKlein(woerter[k]![0]!) && /e$/.test(woerter[k]!)) teile[k] += 'n?';
  }
  const genitiv = /[sxzß]$/i.test(n) ? '"?' : '(?:s|"s)?';
  return teile.join(' ') + genitiv;
}

/** Nach Entscheidung: Buchstabenfolge mit optionalem Leerzeichen/Bindestrich dazwischen, ohne Groß/klein. */
function kompaktMuster(s: string, sprache: Sprache = 'de'): string | null {
  const k = kompakt(s);
  if (k.length < 4) return null;
  return [...k].map(esc).join('[ -]?') + (sprache === 'en' ? '(?:"s|")?' : '(?:s|"s|")?');
}

interface Ziel {
  zielTyp: 'figur' | 'ort';
  ziel: Id;
  /** definierte Formen (normalisiert): Name, Aliase, formen */
  formen: string[];
  muster: RegExp[];
}

function passtZuSchreibweise(sw: Schreibweise, zielTyp: 'figur' | 'ort', id: Id, formen: string[]): boolean {
  if (sw.ziel) return sw.ziel.typ === zielTyp && sw.ziel.id === id;
  const schluessel = new Set(formen.map(kompakt));
  return [sw.gueltig, ...sw.varianten].some((v) => schluessel.has(kompakt(v)));
}

function zielBauen(zielTyp: 'figur' | 'ort', id: Id, formen: string[], daten: ErkennungsDaten): Ziel | null {
  const sprache = erkennungsSprache(daten);
  const definiert = [...new Set(formen.map(norm).filter(Boolean))];
  const exakt = new Set<string>();
  const ohneFall = new Set<string>();
  for (const f of definiert) {
    const m = namensMuster(f, sprache);
    if (m) exakt.add(m);
  }
  for (const sw of daten.entscheidungen?.schreibweisen ?? []) {
    if (!passtZuSchreibweise(sw, zielTyp, id, definiert)) continue;
    for (const v of [sw.gueltig, ...sw.varianten, ...definiert]) {
      const m = namensMuster(v, sprache);
      if (m) exakt.add(m);
      const k = kompaktMuster(v, sprache);
      if (k) ohneFall.add(k);
    }
  }
  if (!exakt.size) return null;
  const sortiert = (s: Set<string>) => [...s].sort((a, b) => b.length - a.length);
  const muster = [new RegExp(`${VOR}(?:${sortiert(exakt).join('|')})${NACH}`, 'gu')];
  if (ohneFall.size) muster.push(new RegExp(`${VOR}(?:${sortiert(ohneFall).join('|')})${NACH}`, 'giu'));
  return { zielTyp, ziel: id, formen: definiert, muster };
}

/** Signatur aller erkennungsrelevanten Daten (ändert sie sich, muss jedes Kapitel neu erkannt werden). */
export function erkennungsSignatur(daten: ErkennungsDaten): string {
  const figuren = Object.values(daten.figuren ?? {})
    .map((f) => [f.id, f.name, f.aliase, f.formen ?? []])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const orte = Object.values(daten.orte ?? {})
    .map((o) => [o.id, o.name, o.aliase])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const teile: unknown[] = ['e1', figuren, orte, daten.entscheidungen?.schreibweisen ?? []];
  // Buchsprache nur, wenn nicht Deutsch (bestehende Signaturen deutscher Projekte bleiben gleich)
  const sprache = erkennungsSprache(daten);
  if (sprache !== 'de') teile.push(sprache);
  return textHash(JSON.stringify(teile));
}

const zielSpeicher = new Map<string, Ziel[]>();

function zieleFuer(daten: ErkennungsDaten): Ziel[] {
  const sig = erkennungsSignatur(daten);
  const vorhanden = zielSpeicher.get(sig);
  if (vorhanden) return vorhanden;
  const ziele: Ziel[] = [];
  for (const f of Object.values(daten.figuren ?? {})) {
    const z = zielBauen('figur', f.id, [f.name, ...(f.aliase ?? []), ...(f.formen ?? [])], daten);
    if (z) ziele.push(z);
  }
  for (const o of Object.values(daten.orte ?? {})) {
    const z = zielBauen('ort', o.id, [o.name, ...(o.aliase ?? [])], daten);
    if (z) ziele.push(z);
  }
  if (zielSpeicher.size > 16) zielSpeicher.clear();
  zielSpeicher.set(sig, ziele);
  return ziele;
}

/** Alle Namen im Text (beliebiger Text, z. B. Hinweis-Titel); Offsets im übergebenen Text. */
export function erkenneInText(text: string, daten: ErkennungsDaten): NamensTreffer[] {
  const n = normalisiereMitBereichen(text);
  const englisch = erkennungsSprache(daten) === 'en';
  /** Englisch: nur ’ ' ‘ ` ´ sind Apostrophe, ein schließendes ” oder " nach dem Namen gehört nicht dazu. */
  const keinApostroph = (i: number) => !/[’'‘`´′]/u.test(text.charAt(n.start[i] ?? -1));
  const alle: (NamensTreffer & { laenge: number })[] = [];
  for (const z of zieleFuer(daten)) {
    const eigene: { a: number; b: number }[] = [];
    for (const re of z.muster) {
      re.lastIndex = 0;
      for (let m = re.exec(n.text); m; m = re.exec(n.text)) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        let ende = m.index + m[0].length;
        if (englisch) {
          // „James”“ (Rede endet) → James; „Lotte”s“ gibt es nicht → Lotte
          if (m[0].endsWith('"') && keinApostroph(ende - 1)) ende--;
          else if (m[0].endsWith('"s') && keinApostroph(ende - 2)) ende -= 2;
        }
        // Apostroph ohne s nur bei Namen auf s/x/z/ß als Teil des Treffers
        else if (m[0].endsWith('"') && !/[sxzß]"$/i.test(m[0])) ende--;
        eigene.push({ a: m.index, b: ende });
      }
    }
    eigene.sort((x, y) => x.a - y.a || y.b - x.b);
    let bis = -1;
    for (const e of eigene) {
      if (e.a < bis) continue;
      bis = e.b;
      const ber = zuOriginalBereich(n, e.a, e.b, text.length);
      alle.push({ zielTyp: z.zielTyp, ziel: z.ziel, start: ber.start, ende: ber.ende, treffer: text.slice(ber.start, ber.ende), laenge: ber.ende - ber.start });
    }
  }
  // Innerhalb eines Typs gewinnt der längere Name („Paul Ahrens“ vor „Paul“).
  const ergebnis = alle.filter(
    (t) =>
      !alle.some(
        (u) => u !== t && u.zielTyp === t.zielTyp && u.ziel !== t.ziel && u.laenge > t.laenge && u.start <= t.start && u.ende >= t.ende,
      ),
  );
  ergebnis.sort((a, b) => a.start - b.start || a.ende - b.ende || a.zielTyp.localeCompare(b.zielTyp) || a.ziel.localeCompare(b.ziel));
  return ergebnis.map(({ laenge: _l, ...t }) => t);
}

/** Erwähnungen in einem Kapitel; Offsets im Klartext (core/text). quelle = 'exakt', art = 'unbestimmt'. */
export function erkenneKapitel(kapitel: Kapitel, daten: ErkennungsDaten): Erwaehnung[] {
  const text = kapitel.text ?? '';
  if (!text.trim()) return [];
  const kt = klartextAus(text);
  const abs = absaetze(text);
  return erkenneInText(kt, daten).map((t) => ({
    zielTyp: t.zielTyp,
    ziel: t.ziel,
    kapitel: kapitel.id,
    absatz: absatzIndex(abs, t.start),
    start: t.start,
    ende: t.ende,
    treffer: t.treffer,
    art: 'unbestimmt',
    quelle: 'exakt',
    bestaetigt: true,
  }));
}

// ---------------------------------------------------------------------------
// Schreibweisen
// ---------------------------------------------------------------------------

interface Beleg {
  kapitel: Id;
  /** wörtlich aus dem Klartext */
  text: string;
}

interface Form {
  /** normalisierte Schreibweise, wie zuerst gefunden */
  form: string;
  belege: Beleg[];
}

const MAX_BELEGKAPITEL = 3;

function kapitelReihenfolge(daten: ProjektDaten): Id[] {
  const reihe = [...(daten.projekt?.kapitel ?? [])];
  for (const id of Object.keys(daten.kapitel ?? {})) if (!reihe.includes(id)) reihe.push(id);
  return reihe;
}

/** Texte der Schreibweisen-Hinweise (Oberflächensprache); die Schlüssel hängen nur an den Zitaten. */
const SW = texteJe(
  {
    kap: 'Kap. {n}',
    zahlwoerter: ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'],
    zitat: '»{text}«',
    oder: ' oder ',
    figur: 'Die Figur',
    ort: 'Der Ort',
    statt: '»{form}« statt »{name}«',
    mehrereFormen: '{art} »{name}« steht in {zahl} Schreibweisen im Text: {belege}.',
    andereForm: '{art} ist als »{name}« angelegt, im Text steht {belege}.',
    derselbeName: 'Derselbe Name steht in {zahl} Schreibweisen im Text: {belege}.',
    aehnlich: 'Sehr ähnliche Namen, die sich nur in einem Zeichen unterscheiden: {belege}.',
    angelegt: '»{form}« (angelegt)',
  },
  {
    kap: 'Ch. {n}',
    zahlwoerter: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
    zitat: '“{text}”',
    oder: ' or ',
    figur: 'The character',
    ort: 'The place',
    statt: '“{form}” instead of “{name}”',
    mehrereFormen: '{art} “{name}” appears in {zahl} spellings in the text: {belege}.',
    andereForm: '{art} is set up as “{name}”, but the text has {belege}.',
    derselbeName: 'The same name appears in {zahl} spellings in the text: {belege}.',
    aehnlich: 'Very similar names that differ by only one character: {belege}.',
    angelegt: '“{form}” (set up)',
  },
);

function kapNr(reihe: Id[], id: Id, sprache: Sprache = 'de'): string {
  const i = reihe.indexOf(id);
  return i >= 0 ? fmt(SW(sprache).kap, { n: i + 1 }) : id;
}

/** Fügt einen Beleg hinzu (je Form höchstens ein Beleg pro Kapitel, höchstens MAX_BELEGKAPITEL Kapitel). */
function belegen(formen: Map<string, Form>, form: string, beleg: Beleg): void {
  const schluessel = form.toLocaleLowerCase('de');
  let f = formen.get(schluessel);
  if (!f) {
    f = { form, belege: [] };
    formen.set(schluessel, f);
  }
  if (f.belege.length < MAX_BELEGKAPITEL && !f.belege.some((b) => b.kapitel === beleg.kapitel)) f.belege.push(beleg);
}

function entschieden(daten: ProjektDaten, formen: string[]): boolean {
  const gesucht = formen.map((f) => norm(f).toLocaleLowerCase('de'));
  return (daten.entscheidungen?.schreibweisen ?? []).some((sw) => {
    const bekannt = new Set([sw.gueltig, ...sw.varianten].map((v) => norm(v).toLocaleLowerCase('de')));
    return gesucht.every((g) => bekannt.has(g));
  });
}

const zahlwort = (n: number, sprache: Sprache = 'de') => SW(sprache).zahlwoerter[n] ?? String(n);

function liste(formen: string[], sprache: Sprache = 'de'): string {
  const t = SW(sprache);
  const q = formen.map((f) => fmt(t.zitat, { text: f }));
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')}${t.oder}${q[q.length - 1]}`;
}

function hinweisAus(titel: string, erklaerung: string, formen: Form[], reihe: Id[]): Hinweis {
  const zitate: Zitat[] = formen
    .flatMap((f) => f.belege)
    .sort((a, b) => reihe.indexOf(a.kapitel) - reihe.indexOf(b.kapitel))
    .map((b) => ({ kapitel: b.kapitel, text: b.text }));
  return { schluessel: zitatSchluessel('schreibweise', zitate), typ: 'schreibweise', titel, zitate, erklaerung, quelle: 'lokal', status: 'neu' };
}

function belegText(formen: Form[], reihe: Id[], sprache: Sprache = 'de'): string {
  return formen
    .filter((f) => f.belege.length)
    .map((f) => `${fmt(SW(sprache).zitat, { text: f.form })} (${f.belege.map((b) => kapNr(reihe, b.kapitel, sprache)).join(', ')})`)
    .join(', ');
}

const STOPPWOERTER = new Set(
  (
    'der die das den dem des ein eine einen einem einer eines im am auf aus bei beim mit nach von vom zu zum zur in ins an ans ' +
    'über unter vor hinter neben zwischen durch für gegen ohne um bis seit er sie es ich du wir ihr man mein meine dein deine sein seine ' +
    'ihre unser unsere euer dann da doch und oder aber als wenn wie was wer wo warum wieso weshalb weil dass ob auch noch nur schon jetzt ' +
    'heute gestern morgen hier dort erst kurz nicht kein keine alle jeder jede jedes dieser diese dieses jemand niemand nichts etwas so ' +
    'ja nein nun also denn sondern während danach davor dabei darauf trotzdem eben gerade immer nie vielleicht ihnen ihm ihn mir mich dir dich uns euch'
  ).split(' '),
);

/** Englische Buchsprache: großgeschriebene Funktionswörter am Satzanfang gehören nicht zum Namen. */
const STOPPWOERTER_EN = new Set(
  (
    'the a an i he she it we they you me him her us them my your his its our their this that these those there here ' +
    'then when where what who whom whose why how which while after before because but and or nor so if as at in on of to for from with ' +
    'by into onto about over under up down out off not no yes oh well now just also yet still even again once later maybe perhaps ' +
    'nobody someone somebody everyone everybody nothing something everything anyone anything today tonight tomorrow yesterday ' +
    'every each all some any both either neither neither another such only already always never sometimes though although unless until since'
  ).split(' '),
);

/** Stoppwörter für Namensfolgen je Buchsprache (Vergleich klein, normalisiert). */
function namensStoppwoerter(daten: ErkennungsDaten): Set<string> {
  return erkennungsSprache(daten) === 'en' ? STOPPWOERTER_EN : STOPPWOERTER;
}

const NAMENSFOLGE = /(?<![\p{L}\p{N}\p{M}])\p{Lu}[\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*(?:[ \u00a0]+\p{Lu}[\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*)*(?![\p{L}\p{N}\p{M}])/gu;

/** Unterscheiden sich zwei Formen nur durch eine Flexionsendung (Genitiv, Plural, Herr/Herrn, Adjektiv)? */
function nurFlexion(a: string, b: string): boolean {
  const wa = a.split(' ');
  const wb = b.split(' ');
  if (wa.length !== wb.length) return false;
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue;
    const [kurz, lang] = wa[i]!.length <= wb[i]!.length ? [wa[i]!, wb[i]!] : [wb[i]!, wa[i]!];
    if (!lang.startsWith(kurz)) return false;
    const endung = lang.slice(kurz.length);
    const ok =
      endung === 's' ||
      endung === 'e' ||
      endung === '"' ||
      endung === '"s' ||
      (endung === 'n' && (/(e|el|er)$/.test(kurz) || kurz === 'Herr')) ||
      ((endung === 'r' || endung === 'm') && /e$/.test(kurz));
    if (!ok) return false;
  }
  return true;
}

class Gruppen {
  private eltern = new Map<string, string>();
  finde(x: string): string {
    let p = this.eltern.get(x) ?? x;
    if (p !== x) {
      p = this.finde(p);
      this.eltern.set(x, p);
    }
    return p;
  }
  verbinde(a: string, b: string): void {
    const pa = this.finde(a);
    const pb = this.finde(b);
    if (pa !== pb) this.eltern.set(pa, pb);
  }
}

/** Hinweise vom Typ 'schreibweise' (z. B. Lindenhof / Linden Hof / Linden-Hof). */
export function schreibweisenHinweise(daten: ProjektDaten, sprache: Sprache = 'de'): Hinweis[] {
  const sw = SW(sprache);
  const reihe = kapitelReihenfolge(daten);
  const texte = reihe
    .map((id) => ({ id, kt: klartextAus(daten.kapitel?.[id]?.text ?? '') }))
    .filter((k) => k.kt.trim() !== '');
  const hinweise: Hinweis[] = [];

  // A) Varianten angelegter Namen (mit/ohne Leerzeichen/Bindestrich)
  interface Bekannt {
    zielTyp: 'figur' | 'ort';
    name: string;
    definiert: Set<string>;
  }
  const bekannte = new Map<string, Bekannt>();
  const alleDefinierten = new Map<string, Set<string>>();
  const eintragen = (zielTyp: 'figur' | 'ort', id: Id, name: string, formen: string[]) => {
    for (const f of formen.map(norm).filter(Boolean)) {
      const s = alleDefinierten.get(f) ?? new Set<string>();
      s.add(`${zielTyp}:${id}`);
      alleDefinierten.set(f, s);
      const k = kompakt(f);
      if (k.length < 6) continue;
      const b = bekannte.get(k) ?? { zielTyp, name: norm(name), definiert: new Set<string>() };
      b.definiert.add(f.toLocaleLowerCase('de'));
      bekannte.set(k, b);
    }
  };
  for (const f of Object.values(daten.figuren ?? {}) as Figur[]) eintragen('figur', f.id, f.name, [f.name, ...(f.aliase ?? []), ...(f.formen ?? [])]);
  for (const o of Object.values(daten.orte ?? {}) as Ort[]) eintragen('ort', o.id, o.name, [o.name, ...(o.aliase ?? [])]);

  for (const [k, b] of bekannte) {
    const re = new RegExp(`${VOR}(${[...k].map(esc).join('[ -]?')})(?:s|"s|")?${NACH}`, 'giu');
    const formen = new Map<string, Form>();
    for (const { id, kt } of texte) {
      const n = normalisiereMitBereichen(kt);
      re.lastIndex = 0;
      for (let m = re.exec(n.text); m; m = re.exec(n.text)) {
        const ber = zuOriginalBereich(n, m.index, m.index + m[1]!.length, kt.length);
        belegen(formen, m[1]!, { kapitel: id, text: kt.slice(ber.start, ber.ende) });
      }
    }
    const gefunden = [...formen.values()];
    const abweichend = gefunden.filter((f) => !b.definiert.has(f.form.toLocaleLowerCase('de')));
    if (!abweichend.length) continue;
    if (entschieden(daten, gefunden.map((f) => f.form))) continue;
    const art = b.zielTyp === 'figur' ? sw.figur : sw.ort;
    const titel = gefunden.length > 1 ? liste(gefunden.map((f) => f.form), sprache) : fmt(sw.statt, { form: gefunden[0]!.form, name: b.name });
    const belege = belegText(gefunden, reihe, sprache);
    const erklaerung =
      gefunden.length > 1
        ? fmt(sw.mehrereFormen, { art, name: b.name, zahl: zahlwort(gefunden.length, sprache), belege })
        : fmt(sw.andereForm, { art, name: b.name, belege });
    hinweise.push(hinweisAus(titel, erklaerung, gefunden, reihe));
  }

  // B) Ähnliche Eigennamen ohne angelegte Figur/Ort (Funktionswörter der Buchsprache am Rand abschneiden)
  const stopp = namensStoppwoerter(daten);
  const kandidaten = new Map<string, Form>(); // nur mehrwortige Namensfolgen
  const kompaktFormen = new Map<string, Map<string, Form>>(); // kompakter Schlüssel → Formen
  const einzelwoerter = new Map<string, Form>();
  for (const { id, kt } of texte) {
    for (const abs of absaetze(daten.kapitel?.[id]?.text ?? '')) {
      NAMENSFOLGE.lastIndex = 0;
      for (let m = NAMENSFOLGE.exec(abs.text); m; m = NAMENSFOLGE.exec(abs.text)) {
        const woerter: { w: string; a: number }[] = [];
        const wre = /\S+/g;
        for (let w = wre.exec(m[0]); w; w = wre.exec(m[0])) woerter.push({ w: w[0], a: m.index + w.index });
        while (woerter.length && stopp.has(woerter[0]!.w.toLocaleLowerCase('de'))) woerter.shift();
        while (woerter.length && stopp.has(woerter[woerter.length - 1]!.w.toLocaleLowerCase('de'))) woerter.pop();
        if (!woerter.length) continue;
        const letztes = woerter[woerter.length - 1]!;
        const a = woerter[0]!.a;
        const e = letztes.a + letztes.w.length;
        const wortlaut = kt.slice(abs.start + a, abs.start + e);
        const form = norm(wortlaut);
        const beleg = { kapitel: id, text: wortlaut };
        const k = kompakt(form);
        if (bekannte.has(k)) continue;
        const km = kompaktFormen.get(k) ?? new Map<string, Form>();
        belegen(km, form, beleg);
        kompaktFormen.set(k, km);
        if (woerter.length >= 2) belegen(kandidaten, form, beleg);
        else if (form.length >= 6) belegen(einzelwoerter, form, beleg);
        // Einzelwörter aus Folgen auch einzeln vergleichen (z. B. „Philipp“ in „Philipp Weber“)
        if (woerter.length >= 2)
          for (const w of woerter) {
            const f = norm(w.w);
            if (f.length >= 6 && !bekannte.has(kompakt(f)))
              belegen(einzelwoerter, f, { kapitel: id, text: kt.slice(abs.start + w.a, abs.start + w.a + w.w.length) });
          }
      }
    }
  }

  const gemeldet = new Set<string>();
  // B1) gleiche Buchstabenfolge, verschieden geschrieben (Schwip Schwap / Schwip-Schwap / Schwipschwap)
  for (const km of kompaktFormen.values()) {
    const formen = [...km.values()];
    if (formen.length < 2 || !formen.some((f) => /[ -]/.test(f.form))) continue;
    if (entschieden(daten, formen.map((f) => f.form))) continue;
    formen.forEach((f) => gemeldet.add(f.form));
    hinweise.push(
      hinweisAus(
        liste(formen.map((f) => f.form), sprache),
        fmt(sw.derselbeName, { zahl: zahlwort(formen.length, sprache), belege: belegText(formen, reihe, sprache) }),
        formen,
        reihe,
      ),
    );
  }

  // B2) Editierdistanz 1 bei mindestens 6 Zeichen
  const gruppen = new Gruppen();
  const formTabelle = new Map<string, Form>();
  const definiertNamen = [...alleDefinierten.keys()].filter((f) => f.length >= 6);
  const istDefiniert = (f: string) => alleDefinierten.has(f);
  const kante = (a: string, b: string) => {
    if (a === b || a.length < 6 || b.length < 6) return;
    if (istDefiniert(a) && istDefiniert(b)) return;
    if (kompakt(a) === kompakt(b) || nurFlexion(a, b)) return;
    if (editierdistanz(a, b, 1) !== 1) return;
    gruppen.verbinde(a, b);
  };
  const mehr = [...kandidaten.values()];
  for (const f of mehr) formTabelle.set(f.form, f);
  for (const f of einzelwoerter.values()) if (!formTabelle.has(f.form)) formTabelle.set(f.form, f);
  for (let i = 0; i < mehr.length; i++) for (let j = i + 1; j < mehr.length; j++) kante(mehr[i]!.form, mehr[j]!.form);
  for (const f of formTabelle.values()) {
    if (istDefiniert(f.form)) continue;
    for (const d of definiertNamen) if (Math.abs(d.length - f.form.length) <= 1) kante(f.form, d);
  }
  const komponenten = new Map<string, Set<string>>();
  for (const f of [...formTabelle.keys(), ...definiertNamen]) {
    const w = gruppen.finde(f);
    const s = komponenten.get(w) ?? new Set<string>();
    s.add(f);
    komponenten.set(w, s);
  }
  for (const mitglieder of komponenten.values()) {
    if (mitglieder.size < 2) continue;
    const namen = [...mitglieder];
    if (namen.some((n) => gemeldet.has(n))) continue;
    const formen = namen.map((n) => formTabelle.get(n) ?? { form: n, belege: [] });
    if (!formen.some((f) => f.belege.length)) continue;
    if (entschieden(daten, namen)) continue;
    formen.sort((a, b) => {
      const ka = a.belege[0] ? reihe.indexOf(a.belege[0].kapitel) : Infinity;
      const kb = b.belege[0] ? reihe.indexOf(b.belege[0].kapitel) : Infinity;
      return ka - kb;
    });
    const angelegt = formen.filter((f) => istDefiniert(f.form) && !f.belege.length).map((f) => fmt(sw.angelegt, { form: f.form }));
    const belegt = belegText(formen, reihe, sprache);
    hinweise.push(
      hinweisAus(
        `${liste(formen.map((f) => f.form), sprache)}?`,
        fmt(sw.aehnlich, { belege: [belegt, ...angelegt].filter(Boolean).join(', ') }),
        formen,
        reihe,
      ),
    );
  }
  return hinweise;
}

// ---------------------------------------------------------------------------
// Motive (S-10)
// ---------------------------------------------------------------------------

export interface MotivTreffer {
  motiv: Id;
  /** Offsets im übergebenen Klartext */
  start: number;
  ende: number;
  treffer: string;
}

/**
 * Motive im Klartext eines Kapitels: Name und Aliase mit Wortgrenzen, dazu die üblichen
 * Endungen der Buchsprache (Deutsch: Bleistift → Bleistifte, Postkarte → Postkarten, Kolas; Englisch: pencil → pencils, box → boxes,
 * pencil’s). Groß-/Kleinschreibung zählt wie bei Namen.
 */
export function motiveImText(klartext: string, motive: Motiv[], sprache: Sprache = 'de'): MotivTreffer[] {
  const n = normalisiereMitBereichen(klartext);
  const ergebnis: MotivTreffer[] = [];
  const endungen = sprache === 'en' ? '(?:es|s|"s)?' : '(?:e|en|n|s|es|er|ern)?';
  for (const m of motive) {
    const formen = [m.name, ...m.aliase].map(norm).filter((f) => f.length >= 2);
    if (!formen.length) continue;
    const alternativen = [...new Set(formen)].sort((a, b) => b.length - a.length).map(esc);
    const re = new RegExp(`${VOR}(?:${alternativen.join('|')})${endungen}${NACH}`, 'gu');
    for (const t of n.text.matchAll(re)) {
      const b = zuOriginalBereich(n, t.index, t.index + t[0].length, klartext.length);
      ergebnis.push({ motiv: m.id, start: b.start, ende: b.ende, treffer: klartext.slice(b.start, b.ende) });
    }
  }
  return ergebnis.sort((a, b) => a.start - b.start || a.motiv.localeCompare(b.motiv));
}
