/**
 * Markennamen (G4, lokal, ohne KI): Treffer aus Leons Markenliste (plan/marken.md) und Vorschläge einer
 * Heuristik (Wörter in Versalien, mehrteilige Eigennamen mitten im Satz, typische Muster, bekannte Marken).
 * Vorschläge nimmt nur Leon in die Liste auf; ignorierte Wörter meldet die Heuristik nie wieder.
 */
import type { Id, Marke, Markenliste } from '../model/types';
import { saetze, STOPPWOERTER, woerter, type Wort } from './woerter';

export interface MarkenStelle {
  start: number;
  ende: number;
  /** Schreibweise im Text */
  text: string;
}

export interface MarkenTreffer {
  marke: Marke;
  stellen: MarkenStelle[];
}

export type KandidatGrund = 'versalien' | 'eigenname' | 'muster' | 'bekannt';

export interface MarkenKandidat {
  /** Schreibweise im Text (häufigste) */
  name: string;
  grund: KandidatGrund;
  stellen: MarkenStelle[];
}

export const GRUND_TEXT: Record<KandidatGrund, string> = {
  versalien: 'in Versalien',
  eigenname: 'mehrteiliger Eigenname',
  muster: 'typische Schreibweise',
  bekannt: 'bekannte Marke',
};

/** Häufige Marken, die die Heuristik auch ohne Leons Liste meldet. */
export const BEKANNTE_MARKEN: readonly string[] = [
  'Adidas', 'Airbnb', 'Aldi', 'Amazon', 'Aperol', 'Apple', 'Audi', 'Balenciaga', 'Barbour', 'Beck’s', 'Bionade',
  'Birkenstock', 'Bosch', 'Burberry', 'Bugatti', 'Calvin Klein', 'Canon', 'Carhartt', 'Chanel', 'Club-Mate', 'Coca-Cola', 'Cola Zero',
  'Converse', 'Dior', 'Dyson', 'Edeka', 'Facebook', 'Ferrari', 'Fiat', 'Gucci', 'Google', 'Gorillas', 'Haribo', 'Heineken',
  'Hermès', 'Hugo Boss', 'IKEA', 'Ikea', 'Instagram', 'iPad', 'iPhone', 'Jägermeister', 'Kinder Bueno', 'Lacoste', 'Lamborghini',
  'Levi’s', 'Lidl', 'LinkedIn', 'Lufthansa', 'Maserati', 'McDonald’s', 'Mercedes', 'Miele', 'Moët', 'Montblanc', 'Netflix',
  'Nespresso', 'Nike', 'Nintendo', 'Nivea', 'Nokia', 'Nutella', 'Patagonia', 'Pepsi', 'PlayStation', 'Porsche', 'Prada',
  'Ray-Ban', 'Red Bull', 'Rewe', 'Rimowa', 'Rolex', 'Ryanair', 'Samsung', 'Sixt', 'Skoda', 'Sony', 'Spotify', 'Starbucks', 'Snapchat',
  'Tesla', 'TikTok', 'Tinder', 'Tommy Hilfiger', 'Twitter', 'Uber', 'Vapiano', 'Volkswagen', 'Volvo', 'Vodafone', 'WhatsApp',
  'Xbox', 'YouTube', 'Zalando', 'Zara',
];

/** Abkürzungen in Versalien, die keine Marken sind. */
const KEINE_MARKEN = new Set(
  'USA EU UN UNO DDR BRD NATO WG TV PC CEO CFO CTO COO PDF SMS MMS OK KI IT HR PR VIP DJ UFO LKW PKW GPS WLAN USB DVD CD SUV ICE ID PIN TAN WC FKK SOS ABC AG GMBH KG CO NRW HH UK OMG LOL CV MBA BWL IQ PS ADHS DNA HIV AIDS NYC LA ARD ZDF NDR WDR RTL'.split(
    ' ',
  ),
);

/** Wörter, die mitten im Satz groß geschrieben werden, aber keine Eigennamen sind. */
const KEINE_EIGENNAMEN = new Set(
  'herr frau herrn doktor dr professor prof montag dienstag mittwoch donnerstag freitag samstag sonntag morgen abend mittag nacht januar februar märz april mai juni juli august september oktober november dezember gott'.split(
    ' ',
  ),
);

const ROEMISCH = /^[IVXLCDM]+$/u;

function maskiere(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Regex für eine Schreibweise: Leerraum und Bindestrich gelten als gleich, Genitiv-s erlaubt, Wortgrenzen (E5). */
function muster(name: string): RegExp | null {
  const teile = name.trim().split(/[\s\-‐]+/u).filter(Boolean).map(maskiere);
  if (!teile.length) return null;
  const kern = teile.join('[\\s\\-‐]+').replace(/[’']/gu, "[’']");
  return new RegExp(`(?<![\\p{L}\\p{N}])${kern}(?:s|[’']s?)?(?![\\p{L}\\p{N}])`, 'giu');
}

interface Rohtreffer extends MarkenStelle {
  schluessel: number;
}

/** Nicht überlappende Treffer: frühester zuerst, bei gleichem Anfang der längste. */
function ohneUeberlappung<T extends { start: number; ende: number }>(liste: T[]): T[] {
  liste.sort((a, b) => a.start - b.start || b.ende - a.ende);
  const ergebnis: T[] = [];
  let bis = -1;
  for (const t of liste) {
    if (t.start < bis) continue;
    ergebnis.push(t);
    bis = t.ende;
  }
  return ergebnis;
}

/** Wo kommen Leons Marken im Text vor? Nur Marken mit Treffern, in Listenreihenfolge. */
export function findeMarken(text: string, liste: Markenliste): MarkenTreffer[] {
  const roh: Rohtreffer[] = [];
  liste.marken.forEach((marke, schluessel) => {
    for (const name of [marke.name, ...marke.aliase]) {
      const re = muster(name);
      if (!re) continue;
      for (const m of text.matchAll(re)) roh.push({ start: m.index, ende: m.index + m[0].length, text: m[0], schluessel });
    }
  });
  const jeMarke = new Map<number, MarkenStelle[]>();
  for (const t of ohneUeberlappung(roh)) {
    const l = jeMarke.get(t.schluessel) ?? [];
    l.push({ start: t.start, ende: t.ende, text: t.text });
    jeMarke.set(t.schluessel, l);
  }
  return liste.marken.flatMap((marke, i) => {
    const stellen = jeMarke.get(i);
    return stellen ? [{ marke, stellen }] : [];
  });
}

/** Leerraum/Bindestrich vereinheitlicht, Apostroph vereinheitlicht – Groß-/Kleinschreibung bleibt. */
function einheitlich(s: string): string {
  return s.normalize('NFC').replace(/[\s\-‐]+/gu, ' ').replace(/’/gu, "'");
}

function satzAnfaenge(text: string): Set<number> {
  return new Set(saetze(text).flatMap((s) => (s.erstesWort ? [s.erstesWort.start] : [])));
}

function grossGeschrieben(w: Wort): boolean {
  return /^\p{Lu}/u.test(w.text);
}

function versalien(w: Wort): boolean {
  return w.text.length >= 3 && /^[\p{Lu}\p{N}\-‐&]+$/u.test(w.text) && /\p{Lu}{2}/u.test(w.text);
}

/** nur Großbuchstaben (auch kurze Wörter wie „IS“) – Teil einer Versalien-Folge */
function nurGross(w: Wort): boolean {
  return /\p{Lu}/u.test(w.text) && w.text === w.text.toUpperCase();
}

/** Steht direkt vor dem Wort ein öffnendes Anführungszeichen, Doppelpunkt oder Gedankenstrich? Dann beginnt dort ein Satz. */
function nachSatzzeichen(text: string, start: number): boolean {
  const vor = text.slice(Math.max(0, start - 3), start);
  return /(?:^|[„“"»«‚(:–—]|\n)\s*$/u.test(vor);
}

/**
 * Vorschläge für Marken, die noch nicht in Leons Liste stehen.
 * `bekannteNamen`: Figuren, Orte, Gruppen, Motive … mit Aliasen – die gelten nie als Marke.
 */
export function markenKandidaten(text: string, liste: Markenliste, bekannteNamen: Iterable<string> = []): MarkenKandidat[] {
  const ausgeschlossen = new Set<string>();
  const ausschliessen = (s: string) => {
    const n = s.normalize('NFC').toLowerCase().replace(/[\s\-‐]+/gu, ' ').trim();
    if (n) ausgeschlossen.add(n);
  };
  for (const n of bekannteNamen) {
    ausschliessen(n);
    for (const w of woerter(n)) ausschliessen(w.text);
  }
  for (const n of liste.ignoriert) ausschliessen(n);
  // bereits gelistete Marken (auch Teile mehrteiliger Namen nicht noch einmal vorschlagen)
  const gelistet = findeMarken(text, liste);
  const belegt: { start: number; ende: number }[] = gelistet.flatMap((t) => t.stellen);
  for (const m of liste.marken) for (const n of [m.name, ...m.aliase]) ausschliessen(n);

  const roh: (MarkenStelle & { grund: KandidatGrund; schluessel: string })[] = [];
  const hinzu = (start: number, ende: number, grund: KandidatGrund) => {
    const t = text.slice(start, ende);
    const schluessel = t.normalize('NFC').toLowerCase().replace(/[\s\-‐]+/gu, ' ').trim();
    if (!schluessel || ausgeschlossen.has(schluessel)) return;
    if (belegt.some((b) => start < b.ende && ende > b.start)) return;
    roh.push({ start, ende, text: t, grund, schluessel });
  };

  // 1. bekannte Marken
  for (const name of BEKANNTE_MARKEN) {
    const re = muster(name);
    if (!re) continue;
    // bekannte Marken nur in der üblichen Schreibweise (Groß-/Kleinschreibung wie in der Liste)
    const soll = einheitlich(name);
    for (const m of text.matchAll(re)) {
      const ist = einheitlich(m[0]);
      if (ist !== soll && ist.replace(/(?:'s?|s)$/u, '') !== soll) continue;
      hinzu(m.index, m.index + m[0].length, 'bekannt');
    }
  }

  const alle = woerter(text);
  const anfaenge = satzAnfaenge(text);
  const istAnfang = (w: Wort) => anfaenge.has(w.start) || nachSatzzeichen(text, w.start);
  const nurLeerraum = (a: Wort, b: Wort) => /^[  ]$/u.test(text.slice(a.ende, b.start));
  const wortZahl = new Map<string, number>();
  for (const w of alle) wortZahl.set(w.klein, (wortZahl.get(w.klein) ?? 0) + 1);
  /** wie oft die Wortfolge (ohne Groß/Klein) im Text steht */
  const folgenCache = new Map<string, number>();
  const folgenZahl = (schluessel: string): number => {
    let n = folgenCache.get(schluessel);
    if (n === undefined) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${schluessel.split(' ').map(maskiere).join('\\s')}(?![\\p{L}\\p{N}])`, 'giu');
      n = [...text.matchAll(re)].length;
      folgenCache.set(schluessel, n);
    }
    return n;
  };

  for (let i = 0; i < alle.length; i++) {
    const w = alle[i]!;
    // 2. Versalien („DYSON“) – keine Folgen aus mehreren Versalien-Wörtern (Schilder, Rufe)
    if (versalien(w)) {
      const vorher = alle[i - 1];
      const nachher = alle[i + 1];
      const inFolge = (vorher && nurGross(vorher) && nurLeerraum(vorher, w)) || (nachher && nurGross(nachher) && nurLeerraum(w, nachher));
      if (!inFolge && !KEINE_MARKEN.has(w.text.replace(/[\-‐&]/gu, '')) && !ROEMISCH.test(w.text) && !STOPPWOERTER.has(w.klein)) hinzu(w.start, w.ende, 'versalien');
      continue;
    }
    // 3. typische Muster: Binnenmajuskel (iPhone, PlayStation, YouTube), Buchstaben mit Ziffern (A4, X5)
    if (/^\p{Ll}+\p{Lu}/u.test(w.text) || /^\p{Lu}\p{Ll}+\p{Lu}\p{Ll}/u.test(w.text) || /^\p{L}{1,3}\d{1,3}$/u.test(w.text)) {
      if (!/^\d/u.test(w.text)) hinzu(w.start, w.ende, 'muster');
      continue;
    }
    // 4. mehrteilige Eigennamen mitten im Satz („Carl Hansen“, „Schwip Schwap“)
    if (grossGeschrieben(w) && !istAnfang(w) && !KEINE_EIGENNAMEN.has(w.klein) && !STOPPWOERTER.has(w.klein)) {
      let j = i;
      while (j + 1 < alle.length) {
        const n = alle[j + 1]!;
        if (!grossGeschrieben(n) || !nurLeerraum(alle[j]!, n) || KEINE_EIGENNAMEN.has(n.klein) || STOPPWOERTER.has(n.klein) || versalien(n)) break;
        j++;
      }
      const teile = alle.slice(i, j + 1);
      // Im Deutschen sind auch Substantive groß („eine Tasse Kakao“): steht ein Teil auch in anderer
      // Verbindung im Text, ist die Folge eher eine Wortgruppe als ein Name.
      const schluessel = teile.map((t) => t.klein).join(' ');
      const auchAllein = teile.some((t) => (wortZahl.get(t.klein) ?? 0) > folgenZahl(schluessel));
      if (j > i && !auchAllein && !teile.some((t) => ausgeschlossen.has(t.klein) || ausgeschlossen.has(t.klein.replace(/s$/u, '')))) {
        hinzu(w.start, alle[j]!.ende, 'eigenname');
        i = j;
      }
    }
  }
  // 5. Muster mit & („H&M“, „Dolce & Gabbana“) und Markenzeichen ®/™
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}]*\s?&\s?\p{Lu}[\p{L}]*(?![\p{L}\p{N}])/gu)) hinzu(m.index, m.index + m[0].length, 'muster');
  for (const m of text.matchAll(/(\p{L}[\p{L}\p{N}\- ]{0,30}?)\s?[®™]/gu)) {
    const name = m[1]!.trim().split(/\s+/u).slice(-2).join(' ');
    const start = m.index + m[0].indexOf(name);
    hinzu(start, start + name.length, 'muster');
  }

  // zusammenfassen: gleiche Schreibweise (ohne Groß/Klein, Leerraum/Bindestrich) = ein Kandidat
  const gruppen = new Map<string, { grund: KandidatGrund; stellen: MarkenStelle[] }>();
  const RANG: Record<KandidatGrund, number> = { bekannt: 0, muster: 1, versalien: 2, eigenname: 3 };
  for (const t of ohneUeberlappung(roh)) {
    const g = gruppen.get(t.schluessel);
    if (g) {
      g.stellen.push({ start: t.start, ende: t.ende, text: t.text });
      if (RANG[t.grund] < RANG[g.grund]) g.grund = t.grund;
    } else gruppen.set(t.schluessel, { grund: t.grund, stellen: [{ start: t.start, ende: t.ende, text: t.text }] });
  }
  return [...gruppen.values()]
    .map((g) => ({ name: haeufigsteSchreibweise(g.stellen), grund: g.grund, stellen: g.stellen }))
    .sort((a, b) => RANG[a.grund] - RANG[b.grund] || b.stellen.length - a.stellen.length || a.name.localeCompare(b.name, 'de'));
}

function haeufigsteSchreibweise(stellen: MarkenStelle[]): string {
  const z = new Map<string, number>();
  for (const s of stellen) z.set(s.text, (z.get(s.text) ?? 0) + 1);
  return [...z.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

// ---------------------------------------------------------------------------
// Übersicht über das ganze Buch
// ---------------------------------------------------------------------------

export interface KapitelText {
  id: Id;
  titel: string;
  /** Klartext (core/text.klartext) */
  text: string;
}

export interface MarkeImKapitel {
  kapitel: Id;
  stellen: MarkenStelle[];
}

export interface MarkenZeile {
  marke: Marke;
  gesamt: number;
  kapitel: MarkeImKapitel[];
  /** Schreibweisen im Text mit Anzahl (für uneinheitliche Schreibung) */
  schreibweisen: { text: string; anzahl: number }[];
}

export interface KandidatImBuch {
  name: string;
  grund: KandidatGrund;
  gesamt: number;
  kapitel: MarkeImKapitel[];
}

export interface MarkenUebersicht {
  zeilen: MarkenZeile[];
  /** Marken aus der Liste, die im Text nicht vorkommen */
  ohneTreffer: Marke[];
  kandidaten: KandidatImBuch[];
}

function schreibweiseNormal(t: string): string {
  return t.replace(/(?:[’']s?)$/u, '').replace(/(?<=\p{L}{3})s$/u, '');
}

export function markenUebersicht(kapitel: KapitelText[], liste: Markenliste, bekannteNamen: Iterable<string> = []): MarkenUebersicht {
  const namen = [...bekannteNamen];
  const zeilen = new Map<Id, MarkenZeile>();
  const kandidaten = new Map<string, KandidatImBuch>();
  for (const k of kapitel) {
    for (const t of findeMarken(k.text, liste)) {
      const z = zeilen.get(t.marke.id) ?? { marke: t.marke, gesamt: 0, kapitel: [], schreibweisen: [] };
      z.gesamt += t.stellen.length;
      z.kapitel.push({ kapitel: k.id, stellen: t.stellen });
      for (const s of t.stellen) {
        const form = schreibweiseNormal(s.text);
        const vorhanden = z.schreibweisen.find((x) => x.text === form);
        if (vorhanden) vorhanden.anzahl++;
        else z.schreibweisen.push({ text: form, anzahl: 1 });
      }
      zeilen.set(t.marke.id, z);
    }
    for (const c of markenKandidaten(k.text, liste, namen)) {
      const schluessel = c.name.toLowerCase().replace(/[\s\-‐]+/gu, ' ');
      const g = kandidaten.get(schluessel) ?? { name: c.name, grund: c.grund, gesamt: 0, kapitel: [] };
      g.gesamt += c.stellen.length;
      g.kapitel.push({ kapitel: k.id, stellen: c.stellen });
      kandidaten.set(schluessel, g);
    }
  }
  const sortiert = [...zeilen.values()].sort((a, b) => b.gesamt - a.gesamt || a.marke.name.localeCompare(b.marke.name, 'de'));
  for (const z of sortiert) z.schreibweisen.sort((a, b) => b.anzahl - a.anzahl);
  return {
    zeilen: sortiert,
    ohneTreffer: liste.marken.filter((m) => !zeilen.has(m.id)),
    kandidaten: [...kandidaten.values()].sort((a, b) => b.gesamt - a.gesamt || a.name.localeCompare(b.name, 'de')),
  };
}

// ---------------------------------------------------------------------------
// Liste fürs Lektorat
// ---------------------------------------------------------------------------

function kapitelAngabe(zeile: { kapitel: MarkeImKapitel[] }, kapitel: KapitelText[]): string[] {
  return zeile.kapitel.map((k) => {
    const nr = kapitel.findIndex((x) => x.id === k.kapitel) + 1;
    const titel = kapitel[nr - 1]?.titel ?? k.kapitel;
    return `Kap. ${nr} „${titel}“ (${k.stellen.length}×)`;
  });
}

function zelle(s: string): string {
  return s.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}

/** Markdown-Liste aller Marken mit Vorkommen je Kapitel (für die Lektorin). */
export function markenAlsMarkdown(u: MarkenUebersicht, kapitel: KapitelText[], buchtitel: string, datum = new Date()): string {
  const zeilen = [
    `# Markennamen – ${buchtitel}`,
    '',
    `Stand: ${datum.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })} · ${u.zeilen.length} Marken im Text, ${u.zeilen.reduce((s, z) => s + z.gesamt, 0)} Vorkommen`,
    '',
    '| Marke | Kategorie | Vorkommen | Kapitel | Schreibweisen | Notiz |',
    '| --- | --- | ---: | --- | --- | --- |',
    ...u.zeilen.map((z) =>
      `| ${[
        zelle(z.marke.name),
        zelle(z.marke.kategorie ?? ''),
        String(z.gesamt),
        zelle(kapitelAngabe(z, kapitel).join('; ')),
        zelle(z.schreibweisen.length > 1 ? z.schreibweisen.map((s) => `${s.text} (${s.anzahl}×)`).join(', ') : ''),
        zelle(z.marke.notiz ?? ''),
      ].join(' | ')} |`,
    ),
  ];
  if (u.ohneTreffer.length) zeilen.push('', `Ohne Vorkommen im Text: ${u.ohneTreffer.map((m) => m.name).join(', ')}`);
  return `${zeilen.join('\n')}\n`;
}

function csvFeld(s: string): string {
  return /[";\n]/u.test(s) ? `"${s.replace(/"/gu, '""')}"` : s;
}

/** CSV (Semikolon, für Excel/Numbers in deutscher Einstellung). */
export function markenAlsCsv(u: MarkenUebersicht, kapitel: KapitelText[]): string {
  const kopf = ['Marke', 'Kategorie', 'Vorkommen', 'Kapitel', 'Schreibweisen', 'Notiz'];
  const zeilen = u.zeilen.map((z) =>
    [
      z.marke.name,
      z.marke.kategorie ?? '',
      String(z.gesamt),
      kapitelAngabe(z, kapitel).join('; '),
      z.schreibweisen.length > 1 ? z.schreibweisen.map((s) => `${s.text} (${s.anzahl}×)`).join(', ') : '',
      z.marke.notiz ?? '',
    ]
      .map(csvFeld)
      .join(';'),
  );
  return `﻿${[kopf.join(';'), ...zeilen].join('\r\n')}\r\n`;
}

/** Eindeutige ID für eine neue Marke (Slug aus dem Namen). */
export function markenId(name: string, vorhanden: Iterable<Id>): Id {
  const basis =
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/ß/gu, 'ss')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'marke';
  const belegt = new Set(vorhanden);
  let id = basis;
  for (let i = 2; belegt.has(id); i++) id = `${basis}-${i}`;
  return id;
}
