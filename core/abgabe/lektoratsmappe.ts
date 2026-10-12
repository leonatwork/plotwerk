/**
 * Lektoratsmappe (G7): offene Hinweise eines Kapitels oder des ganzen Buchs als PDF – je Hinweis Typ, Titel,
 * wörtliches Zitat (mit Kapitel) und Erklärung. „Offen“ = Status „neu“ (nicht als Absicht/erledigt entschieden).
 * Private Felder kommen nicht hinein; die Hinweise stehen so in der Mappe, wie Plotwerk sie anzeigt.
 */
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Hinweis, HinweisTyp, Id, ProjektDaten } from '../model/types';
import type { PdfSchrift } from '../pdf';
import { pdfErzeugen, pdfHauptschrift, pdfStuecke } from './pdf';
import { buchSprache, fmt, localeVon, texteJe, type Sprache } from '../i18n';
import { HINWEIS_TYP_NAME, hinweisTypName } from '../index/hinweisTypen';

/** Anzeigenamen wie in der Hinweise-Ansicht (gemeinsame Liste in core/index/hinweisTypen.ts). */
export { HINWEIS_TYP_NAME, hinweisTypName };

/** Beschriftungen der Mappe in der Buchsprache (angaben.sprache). Die Hinweise selbst stehen so drin, wie Plotwerk sie anzeigt. */
const T = texteJe(
  {
    kap: 'Kap. {n} · {titel}',
    kapitel: 'Kapitel {n} · {titel}',
    ohneStelle: 'Ohne Textstelle',
    ganzesBuch: 'Ganzes Buch',
    ohneTitel: 'Ohne Titel',
    mappe: 'Lektoratsmappe',
    stand: 'Stand {datum}',
    offen: { one: '{n} offener Hinweis', other: '{n} offene Hinweise' },
    keine: 'Keine offenen Hinweise.',
    ki: 'KI',
    zitat: '„{text}“',
    dokumentTitel: 'Lektoratsmappe – {titel}',
  },
  {
    kap: 'Ch. {n} · {titel}',
    kapitel: 'Chapter {n} · {titel}',
    ohneStelle: 'No text passage',
    ganzesBuch: 'Whole book',
    ohneTitel: 'Untitled',
    mappe: 'Editing report',
    stand: 'As of {datum}',
    offen: { one: '{n} open note', other: '{n} open notes' },
    keine: 'No open notes.',
    ki: 'AI',
    zitat: '“{text}”',
    dokumentTitel: 'Editing report – {titel}',
  },
);

export interface MappenZitat {
  kapitel: Id;
  /** „Kap. 3 · Titel“ */
  kapitelName: string;
  text: string;
}

export interface MappenHinweis {
  schluessel: string;
  typ: HinweisTyp;
  typName: string;
  titel: string;
  zitate: MappenZitat[];
  erklaerung: string;
  quelle: 'lokal' | 'ki';
}

export interface MappenAbschnitt {
  /** Kapitel-ID; null = Hinweise ohne Textstelle */
  kapitel: Id | null;
  titel: string;
  hinweise: MappenHinweis[];
}

export interface Lektoratsmappe {
  buchtitel: string;
  autor?: string;
  /** „Ganzes Buch“ bzw. „Kapitel 3 · Titel“ */
  umfang: string;
  /** ISO-Zeitpunkt der Erstellung */
  datum: string;
  anzahl: number;
  abschnitte: MappenAbschnitt[];
  /** Buchsprache der Beschriftungen (fehlt = Deutsch) */
  sprache?: Sprache;
}

export interface MappenOptionen {
  /** nur dieses Kapitel; fehlt = ganzes Buch */
  kapitel?: Id | null;
  /** Hinweistypen, die in die Mappe kommen (fehlt = alle) */
  typen?: HinweisTyp[];
  jetzt?: string;
}

const offen = (h: Hinweis) => h.status === 'neu';

/** Betrifft der Hinweis dieses Kapitel (Zitat oder Plan-Bezug)? */
export function hinweisBetrifft(h: Hinweis, kapitel: Id): boolean {
  return h.zitate.some((z) => z.kapitel === kapitel) || h.plan?.kapitel === kapitel;
}

/** Offene Hinweise im Umfang zählen (für den Dialog). */
export function offeneHinweise(hinweise: Hinweis[], optionen: Pick<MappenOptionen, 'kapitel' | 'typen'> = {}): Hinweis[] {
  return hinweise.filter((h) => offen(h) && (!optionen.kapitel || hinweisBetrifft(h, optionen.kapitel)) && (!optionen.typen || optionen.typen.includes(h.typ)));
}

/** Inhalt der Mappe: nach Kapitel (Buchreihenfolge) gruppiert, innerhalb nach Typ; Beschriftungen in der Buchsprache. */
export function lektoratsmappe(daten: ProjektDaten, hinweise: Hinweis[], optionen: MappenOptionen = {}): Lektoratsmappe {
  const sprache = buchSprache(daten.projekt.angaben);
  const t = T(sprache);
  const reihe = daten.projekt.kapitel;
  const nummer = new Map(reihe.map((id, i) => [id, i + 1]));
  const titelVon = (id: Id) => daten.kapitel[id]?.titel.trim() || daten.plaene[id]?.titel.trim() || id;
  const kapitelName = (id: Id) => (nummer.has(id) ? fmt(t.kap, { n: nummer.get(id), titel: titelVon(id) }) : titelVon(id));
  const typReihe = Object.keys(HINWEIS_TYP_NAME) as HinweisTyp[];

  const liste = offeneHinweise(hinweise, optionen);
  const gruppen = new Map<Id | null, MappenHinweis[]>();
  for (const h of liste) {
    const ziel: Id | null = optionen.kapitel ?? h.zitate.map((z) => z.kapitel).find((id) => nummer.has(id)) ?? h.zitate[0]?.kapitel ?? h.plan?.kapitel ?? null;
    const eintrag: MappenHinweis = {
      schluessel: h.schluessel,
      typ: h.typ,
      typName: hinweisTypName(h.typ, sprache),
      titel: h.titel,
      zitate: h.zitate.map((z) => ({ kapitel: z.kapitel, kapitelName: kapitelName(z.kapitel), text: z.text })),
      erklaerung: h.erklaerung,
      quelle: h.quelle,
    };
    gruppen.set(ziel, [...(gruppen.get(ziel) ?? []), eintrag]);
  }
  const abschnitte: MappenAbschnitt[] = [...gruppen.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : (nummer.get(a) ?? 1e9) - (nummer.get(b) ?? 1e9)))
    .map(([kapitel, hs]) => ({
      kapitel,
      titel: kapitel === null ? t.ohneStelle : kapitelName(kapitel),
      hinweise: [...hs].sort((x, y) => typReihe.indexOf(x.typ) - typReihe.indexOf(y.typ)),
    }));
  return {
    buchtitel: daten.projekt.titel.trim() || t.ohneTitel,
    autor: daten.projekt.angaben?.autor?.trim() || undefined,
    umfang: !optionen.kapitel
      ? t.ganzesBuch
      : nummer.has(optionen.kapitel)
        ? fmt(t.kapitel, { n: nummer.get(optionen.kapitel), titel: titelVon(optionen.kapitel) })
        : titelVon(optionen.kapitel),
    datum: optionen.jetzt ?? new Date().toISOString(),
    anzahl: liste.length,
    abschnitte,
    ...(sprache !== 'de' ? { sprache } : {}),
  };
}

/** Datum in der Buchsprache: „12.03.2026“ bzw. “March 12, 2026”. */
const datumText = (iso: string, sprache: Sprache) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return sprache === 'en'
    ? d.toLocaleDateString(localeVon(sprache), { day: 'numeric', month: 'long', year: 'numeric' })
    : d.toLocaleDateString(localeVon(sprache), { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Lektoratsmappe als PDF (A4, Newsreader wenn übergeben, sonst Times); Beschriftungen in mappe.sprache. */
export async function exportiereLektoratsmappe(mappe: Lektoratsmappe, schriften?: PdfSchrift[] | null): Promise<Uint8Array> {
  const sprache = mappe.sprache ?? 'de';
  const tx = T(sprache);
  const t = (text: string, extra: Partial<ContentText> = {}): ContentText => ({ text: pdfStuecke(text, schriften), ...extra });
  const inhalt: Content[] = [
    t(tx.mappe, { style: 'marke' }),
    t(mappe.buchtitel, { style: 'titel' }),
    t(
      [mappe.autor, mappe.umfang, fmt(tx.stand, { datum: datumText(mappe.datum, sprache) }), fmt(tx.offen, { n: mappe.anzahl }, sprache)]
        .filter(Boolean)
        .join('  ·  '),
      { style: 'meta' },
    ),
  ];
  if (mappe.anzahl === 0) inhalt.push(t(tx.keine, { style: 'leer' }));
  let lfd = 0;
  for (const a of mappe.abschnitte) {
    inhalt.push(t(a.titel, { style: 'kapitel', headlineLevel: 1 }));
    for (const h of a.hinweise) {
      lfd++;
      const block: Content[] = [
        { text: [{ text: `${lfd}  `, style: 'nummer' }, { text: `${h.typName.toLocaleUpperCase(sprache)}${h.quelle === 'ki' ? ` · ${tx.ki}` : ''}`, style: 'typ' }] },
        t(h.titel, { style: 'hinweisTitel' }),
      ];
      for (const z of h.zitate) {
        block.push({
          stack: [t(fmt(tx.zitat, { text: z.text }), { style: 'zitat' }), ...(a.kapitel !== z.kapitel || h.zitate.length > 1 ? [t(z.kapitelName, { style: 'zitatQuelle' })] : [])],
          margin: [10, 2, 0, 2],
        });
      }
      if (h.erklaerung.trim()) block.push(t(h.erklaerung.trim(), { style: 'erklaerung' }));
      inhalt.push({ stack: block, unbreakable: h.zitate.length <= 3, margin: [0, 0, 0, 14] });
    }
  }

  const def: TDocumentDefinitions = {
    info: { title: fmt(tx.dokumentTitel, { titel: mappe.buchtitel }), author: mappe.autor, creator: 'Plotwerk', producer: 'Plotwerk' },
    language: localeVon(sprache),
    pageSize: 'A4',
    pageMargins: [64, 64, 64, 72],
    content: inhalt,
    defaultStyle: { font: pdfHauptschrift(schriften), fontSize: 11, lineHeight: 1.35, color: '#1F1D1A' },
    styles: {
      marke: { fontSize: 9, characterSpacing: 1.5, color: '#8A847B' },
      titel: { fontSize: 26, margin: [0, 4, 0, 4], lineHeight: 1.1 },
      meta: { fontSize: 10, color: '#6B655D', margin: [0, 0, 0, 22] },
      leer: { fontSize: 12, italics: true, color: '#6B655D' },
      kapitel: { fontSize: 15, margin: [0, 14, 0, 10], lineHeight: 1.2 },
      nummer: { fontSize: 9, color: '#8A847B' },
      typ: { fontSize: 9, bold: true, characterSpacing: 0.8, color: '#9C3D5A' },
      hinweisTitel: { fontSize: 12, bold: true, margin: [0, 2, 0, 3] },
      zitat: { italics: true, color: '#3A3631' },
      zitatQuelle: { fontSize: 9, color: '#8A847B' },
      erklaerung: { fontSize: 10.5, color: '#3A3631', margin: [0, 3, 0, 0] },
    },
    footer: (seite: number, gesamt: number) => ({
      columns: [
        { text: pdfStuecke(`${mappe.buchtitel} · ${tx.mappe}`, schriften), alignment: 'left' },
        { text: `${seite} / ${gesamt}`, alignment: 'right' },
      ],
      fontSize: 9,
      color: '#8A847B',
      margin: [64, 30, 64, 0],
    }),
  };
  return pdfErzeugen(def, schriften);
}
