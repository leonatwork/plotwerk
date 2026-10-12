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

export const SYSTEM_FRAGEN = `Du beantwortest Fragen eines Autors zu seinem eigenen, deutschsprachigen Romanmanuskript. Du antwortest ausschließlich aus dem <text> der Kapitel. Angaben und Planung des Autors (<angaben>, <plan>) helfen dir nur beim Zuordnen von Namen; sie sind keine Belege.

Regeln:
- Jede Antwort stützt sich auf wörtliche Zitate aus dem <text>: zeichengenau kopiert, kurz (ein Satz oder Satzteil), mit der Kapitel-ID. Nenne alle passenden Stellen, höchstens 12, in Buchreihenfolge.
- Steht die Antwort nicht im Buch, sag das knapp (imBuch = false, belege leer). Nichts erfinden, nichts ergänzen, was nicht im Text steht.
- Du schreibst keinen Text für das Buch, schlägst keine Formulierungen vor und gibst keine Schreibtipps – auch nicht, wenn danach gefragt wird. Dann antwortest du nur: Ich schreibe keinen Text für das Buch.
- Antwort kurz und sachlich auf Deutsch (höchstens drei Sätze), Kapitel als „Kap. n“. Zitate gehören in belege, nicht in die Antwort.`;

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

/** Die Frage verlangt Text für das Buch (wird lokal abgefangen, ohne Anfrage). */
export function schreibAuftrag(frage: string): boolean {
  const f = frage.trim();
  return (
    /^(bitte\s+)?(schreib|formulier|verbesser|überarbeit|ueberarbeit|umschreib|erfind|dicht|ergänz|kürz|korrigier)\w*(?![\p{L}])/iu.test(f) ||
    /\b(schreib|formulier|umschreib|verbesser|überarbeit)\w*\s+(mir|uns|du)\b/iu.test(f) ||
    /\b(kannst|könntest|würdest)\s+du\b[^?]{0,80}\b(schreiben|formulieren|umschreiben|verbessern|überarbeiten|ergänzen|kürzen|neu\s+fassen)\b/iu.test(f) ||
    /\b(formulierungs|text)vorschl(a|ä)g/iu.test(f) ||
    /\bwie\s+(könnte|sollte|würde)\s+ich\b[^?]{0,60}\b(schreiben|formulieren)\b/iu.test(f)
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

export function frageAufgabeText(frage: string, verlauf: FragenVerlaufEintrag[] = []): string {
  const z: string[] = [];
  const letzte = verlauf.filter((v) => v.frage.trim() && v.antwort.trim()).slice(-3);
  if (letzte.length) {
    z.push('Bisherige Fragen (nur zum Einordnen von Rückfragen, keine Belege):');
    for (const v of letzte) {
      z.push(`- Frage: ${kuerze(v.frage, 200)}`);
      z.push(`  Antwort: ${kuerze(v.antwort, 300)}`);
    }
    z.push('');
  }
  z.push('Beantworte diese Frage nur aus dem <text> der Kapitel, mit wörtlichen Belegen:');
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
    return { antwort: '', belege: [], imBuch: false, verworfeneBelege, verworfen: p.verworfen[vorher]?.grund ?? 'Antwort fehlt' };
  }
  return { antwort, belege, imBuch: d.imBuch !== false, verworfeneBelege };
}

/** Aufgabe „Frage an das Buch“ – ganzes Buch als gecachter Prefix, Frage im Aufgabenblock. */
export function frageAufgabe(frage: string, optionen: FrageOptionen = {}): AufgabenDefinition<FrageAntwort> {
  return {
    name: 'Frage an das Buch',
    art: 'frage',
    attribute: { frage: kuerze(frage, 300) },
    rolle: optionen.rolle ?? 'pruefung',
    system: SYSTEM_FRAGEN,
    ausgabeSchaetzung: 1500,
    aufgabe: () => frageAufgabeText(frage, optionen.verlauf),
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
    kostenUsd: Math.round(e.kostenUsd * 10000) / 10000,
    imBuch: e.ergebnis.imBuch,
  };
}

/** Antwort hat keinen prüfbaren Beleg (wird in der Oberfläche als „ohne Beleg“ markiert). */
export function ohneBeleg(f: Pick<BuchFrage, 'belege'>): boolean {
  return f.belege.length === 0;
}
