/**
 * Fragen an das Buch (G6). Besitzer: G6 KI-Leser.
 *
 * Leon fragt („Wo erwähne ich Pauls Bleistifte?“), das Modell antwortet nur aus dem Buchtext und belegt jede Antwort
 * mit wörtlichen Zitaten (E6). Das ganze Buch geht als derselbe gecachte Prefix wie bei der Prüfung mit (E13),
 * die Frage steht im zweiten Block – weitere Fragen lesen den Prefix aus dem Cache.
 * Zitate, die nicht wörtlich im Buch stehen, werden einzeln verworfen; Antworten mit Formulierungsvorschlägen
 * oder erfundenen Zitaten ganz. Antworten ohne gültigen Beleg bleiben stehen, gelten aber als „ohne Beleg“.
 * HARTE REGEL 1: nichts hier schreibt; gespeichert wird im Store (speichereKiFragen).
 */
import type { BuchFrage, Id, Zitat } from '../model/types';
import type { AufgabenDefinition, AufgabenErgebnis, AufgabenPruefung } from './aufgabe';
import type { KiRolle } from './anfrage';
import type { BuchKontext } from './kontext';
import { meldungenIn } from './meldungen';
import { ANTWORTSPRACHE_EN, type Sprache } from './sprache';

export const SYSTEM_FRAGEN = `Du beantwortest Fragen eines Autors zu seinem eigenen, deutschsprachigen Romanmanuskript. Du antwortest ausschließlich aus dem <text> der Kapitel. Angaben und Planung des Autors (<angaben>, <plan>) helfen dir nur beim Zuordnen von Namen; sie sind keine Belege.

Regeln:
- Jede Antwort stützt sich auf wörtliche Zitate aus dem <text>: zeichengenau kopiert, kurz (ein Satz oder Satzteil), mit der Kapitel-ID. Nenne alle passenden Stellen, höchstens 12, in Buchreihenfolge.
- Steht die Antwort nicht im Buch, sag das knapp (imBuch = false, belege leer). Nichts erfinden, nichts ergänzen, was nicht im Text steht.
- Du schreibst keinen Text für das Buch, schlägst keine Formulierungen vor und gibst keine Schreibtipps – auch nicht, wenn danach gefragt wird. Dann antwortest du nur: Ich schreibe keinen Text für das Buch.
- Antwort kurz und sachlich auf Deutsch (höchstens drei Sätze), Kapitel als „Kap. n“. Zitate gehören in belege, nicht in die Antwort.`;

/** Englische Fassung (Buchsprache en). */
export const SYSTEM_FRAGEN_EN = `You answer an author's questions about their own English-language novel manuscript. You answer exclusively from the <text> of the chapters. The author's notes and planning (<angaben>, <plan>) only help you to assign names; they are not evidence.

Rules:
- Every answer is based on verbatim quotes from the <text>: copied character for character, short (a sentence or part of a sentence), with the chapter id. Give all matching passages, at most 12, in the order of the book.
- If the answer is not in the book, say so briefly (imBuch = false, belege empty). Invent nothing, add nothing that is not in the text.
- You write no text for the book, suggest no phrasings and give no writing tips – not even when asked to. Then you only answer: I don't write text for the book.
- Answer briefly and factually in English (at most three sentences), chapters as “Ch. n”. Quotes belong in belege, not in the answer.

${ANTWORTSPRACHE_EN}`;

/** Ergebnis einer Frage (vor dem Speichern als BuchFrage). */
export interface FrageAntwort {
  antwort: string;
  belege: Zitat[];
  /** das Modell sagt: steht im Buch */
  imBuch: boolean;
  /** Belege, die nicht wörtlich im Buch standen und verworfen wurden */
  verworfeneBelege: number;
  /** Grund, wenn die ganze Antwort verworfen wurde (antwort ist dann leer) */
  verworfen?: string;
}

export interface FragenVerlaufEintrag {
  frage: string;
  antwort: string;
}

export interface FrageOptionen {
  /** bisherige Fragen (älteste zuerst); nur die letzten drei gehen als Kontext mit */
  verlauf?: FragenVerlaufEintrag[];
  /** Standard „pruefung“ (Sonnet); „erkennung“ = Haiku (schnell, günstig) */
  rolle?: KiRolle;
}

/**
 * Die Frage verlangt Text für das Buch (wird lokal abgefangen, ohne Anfrage). Deutsch und Englisch, unabhängig
 * von der Buchsprache („Schreib mir …“, „Rewrite …“, „Can you write …“, „How should I phrase …“).
 */
export function schreibAuftrag(frage: string): boolean {
  const f = frage.trim();
  return (
    /^(bitte\s+)?(schreib|formulier|verbesser|überarbeit|ueberarbeit|umschreib|erfind|dicht|ergänz|kürz|korrigier)\w*(?![\p{L}])/iu.test(f) ||
    /\b(schreib|formulier|umschreib|verbesser|überarbeit)\w*\s+(mir|uns|du)\b/iu.test(f) ||
    /\b(kannst|könntest|würdest)\s+du\b[^?]{0,80}\b(schreiben|formulieren|umschreiben|verbessern|überarbeiten|ergänzen|kürzen|neu\s+fassen)\b/iu.test(f) ||
    /\b(formulierungs|text)vorschl(a|ä)g/iu.test(f) ||
    /\bwie\s+(könnte|sollte|würde)\s+ich\b[^?]{0,60}\b(schreiben|formulieren)\b/iu.test(f) ||
    // Englisch
    /^(please\s+)?(write|rewrite|rephrase|reword|improve|polish|edit|fix|correct|shorten|expand|continue|draft|compose|invent|finish)\b/i.test(f) ||
    /\b(can|could|would|will)\s+you\b[^?]{0,80}\b(write|rewrite|rephrase|reword|improve|polish|shorten|expand|continue|draft|compose|finish)\b/i.test(f) ||
    /\b(suggest|propose|give\s+me|offer)\b[^?]{0,40}\b(wording|phrasing|sentences?|lines?|paragraphs?|dialogue|rewrite|alternatives?|better\s+version|new\s+version)\b/i.test(f) ||
    /\bhow\s+(should|could|would|might|can)\s+i\b[^?]{0,60}\b(write|phrase|word|rewrite)\b/i.test(f)
  );
}

function kapitelIds(kontext: BuchKontext): Id[] {
  const ids = kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id);
  return ids.length ? ids : kontext.kapitel.map((k) => k.id);
}

export function frageSchema(kontext: BuchKontext): Record<string, unknown> {
  const str = { type: 'string' };
  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  return obj({
    imBuch: { type: 'boolean' },
    antwort: str,
    belege: { type: 'array', items: obj({ kapitel: { type: 'string', enum: kapitelIds(kontext) }, text: str }) },
  });
}

function kuerze(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')} …`;
}

export function frageAufgabeText(frage: string, verlauf: FragenVerlaufEintrag[] = [], sprache?: Sprache): string {
  const en = sprache === 'en';
  const z: string[] = [];
  const letzte = verlauf.filter((v) => v.frage.trim() && v.antwort.trim()).slice(-3);
  if (letzte.length) {
    z.push(en ? 'Previous questions (only to place follow-up questions, not evidence):' : 'Bisherige Fragen (nur zum Einordnen von Rückfragen, keine Belege):');
    for (const v of letzte) {
      z.push(`- ${en ? 'Question' : 'Frage'}: ${kuerze(v.frage, 200)}`);
      z.push(`  ${en ? 'Answer' : 'Antwort'}: ${kuerze(v.antwort, 300)}`);
    }
    z.push('');
  }
  z.push(
    en
      ? 'Answer this question only from the <text> of the chapters, with verbatim evidence (answer in English, even if the question is asked in another language):'
      : 'Beantworte diese Frage nur aus dem <text> der Kapitel, mit wörtlichen Belegen:',
  );
  z.push(frage.trim());
  return z.join('\n');
}

export function werteFrageAntwortAus(daten: unknown, p: AufgabenPruefung): FrageAntwort {
  const d = (daten ?? {}) as Record<string, unknown>;
  const belege: Zitat[] = [];
  let verworfeneBelege = 0;
  for (const z of Array.isArray(d.belege) ? d.belege : []) {
    const ok = p.zitate([z], { art: 'beleg', ...(z as object) });
    if (!ok) {
      verworfeneBelege++;
      continue;
    }
    for (const x of ok) if (!belege.some((b) => b.kapitel === x.kapitel && b.text === x.text)) belege.push(x);
  }
  // Buchreihenfolge
  const pos = new Map(p.kontext.kapitel.map((k, i) => [k.id, i]));
  const textPos = (b: Zitat) => p.kontext.kapitel[pos.get(b.kapitel) ?? 0]?.text.indexOf(b.text) ?? 0;
  belege.sort((a, b) => (pos.get(a.kapitel) ?? 0) - (pos.get(b.kapitel) ?? 0) || textPos(a) - textPos(b));

  const vorher = p.verworfen.length;
  const antwort = p.text(d.antwort, d, { pflicht: true });
  if (antwort === null) {
    return { antwort: '', belege: [], imBuch: false, verworfeneBelege, verworfen: p.verworfen[vorher]?.grund ?? meldungenIn(p.oberflaeche)('antwortFehlt') };
  }
  return { antwort, belege, imBuch: d.imBuch !== false, verworfeneBelege };
}

/** Aufgabe „Frage an das Buch“ – ganzes Buch als gecachter Prefix, Frage im Aufgabenblock. */
export function frageAufgabe(frage: string, optionen: FrageOptionen = {}): AufgabenDefinition<FrageAntwort> {
  return {
    name: 'Frage an das Buch',
    nameEn: meldungenIn('en')('nameFrage'),
    art: 'frage',
    attribute: { frage: kuerze(frage, 300) },
    rolle: optionen.rolle ?? 'pruefung',
    system: SYSTEM_FRAGEN,
    systemEn: SYSTEM_FRAGEN_EN,
    ausgabeSchaetzung: 1500,
    aufgabe: (kontext) => frageAufgabeText(frage, optionen.verlauf, kontext.sprache),
    schema: frageSchema,
    auswerten: werteFrageAntwortAus,
  };
}

/** Speicherform für .plotwerk/fragen.json */
export function alsBuchFrage(id: Id, frage: string, e: AufgabenErgebnis<FrageAntwort>): BuchFrage {
  return {
    id,
    frage: frage.trim(),
    datum: e.datum,
    antwort: e.ergebnis.antwort,
    belege: e.ergebnis.belege,
    modell: e.modell,
    ...(e.kostenBekannt === false ? {} : { kostenUsd: Math.round(e.kostenUsd * 10000) / 10000 }),
    imBuch: e.ergebnis.imBuch,
  };
}

/** Antwort hat keinen prüfbaren Beleg (wird in der Oberfläche als „ohne Beleg“ markiert). */
export function ohneBeleg(f: Pick<BuchFrage, 'belege'>): boolean {
  return f.belege.length === 0;
}
