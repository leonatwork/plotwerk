/** Kleiner XML-Baum für WordprocessingML (fast-xml-parser, Reihenfolge erhalten, Entitäten selbst dekodiert). */
import { XMLParser } from 'fast-xml-parser';

export interface XmlKnoten {
  /** lokaler Name ohne Präfix, z. B. "p" für w:p; Textknoten: "#text" */
  name: string;
  attr: Record<string, string>;
  kinder: XmlKnoten[];
  text?: string;
}

const ENTITAETEN: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Dekodiert die fünf XML-Entitäten und numerische Zeichenreferenzen in einem Durchgang. */
export function dekodiere(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (ganz, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ganz;
    }
    return ENTITAETEN[name] ?? ganz;
  });
}

function lokal(name: string): string {
  const i = name.indexOf(':');
  return i < 0 ? name : name.slice(i + 1);
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  commentPropName: '#kommentar',
});

type Roh = Record<string, unknown>;

function umwandeln(liste: Roh[]): XmlKnoten[] {
  const ergebnis: XmlKnoten[] = [];
  for (const eintrag of liste) {
    const attrRoh = (eintrag[':@'] ?? {}) as Record<string, unknown>;
    for (const schluessel of Object.keys(eintrag)) {
      if (schluessel === ':@' || schluessel === '#kommentar') continue;
      const wert = eintrag[schluessel];
      if (schluessel === '#text') {
        ergebnis.push({ name: '#text', attr: {}, kinder: [], text: dekodiere(String(wert)) });
        continue;
      }
      const attr: Record<string, string> = {};
      for (const [a, v] of Object.entries(attrRoh)) attr[lokal(a)] = dekodiere(String(v));
      ergebnis.push({ name: lokal(schluessel), attr, kinder: Array.isArray(wert) ? umwandeln(wert as Roh[]) : [] });
    }
  }
  return ergebnis;
}

/** Wurzelknoten (name "#dokument") mit den Elementen der obersten Ebene. */
export function parseXml(xml: string): XmlKnoten {
  return { name: '#dokument', attr: {}, kinder: umwandeln(parser.parse(xml) as Roh[]) };
}

export function kind(k: XmlKnoten | undefined, name: string): XmlKnoten | undefined {
  return k?.kinder.find((c) => c.name === name);
}

export function kinder(k: XmlKnoten | undefined, name: string): XmlKnoten[] {
  return k ? k.kinder.filter((c) => c.name === name) : [];
}

/** Text aller Textknoten direkt unter k. */
export function textInhalt(k: XmlKnoten): string {
  let s = '';
  for (const c of k.kinder) if (c.name === '#text') s += c.text ?? '';
  return s;
}

/** Wert von w:val; fehlt das Attribut, undefined. */
export function wert(k: XmlKnoten | undefined): string | undefined {
  return k?.attr.val;
}
