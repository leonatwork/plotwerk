/**
 * KI-Aufgabe „Stränge vorschlagen“ (G2 Plot-Struktur). Besitzer: G2. Nutzt fuehreAufgabeAus/AufgabenDefinition aus
 * ./aufgabe. Nur ProjektLeser und KiTransport.
 *
 * Ablauf: ganzes Buch als gecachter Prefix (E13), danach die Aufgabe „straenge“ mit Leons Strängen (Name,
 * Haupt-/Nebenhandlung, „Wofür steht der Strang?“, Kapitel im Plan) und seinen Antworten auf frühere Rückfragen –
 * freigegeben von Leon am 2026-10-12 (E12, nur für diese Aufgabe, nicht im Prefix).
 * Antwort: Zuordnungen geschriebener Kapitel zu angelegten Strängen, neue Stränge mit Kapiteln, Rückfragen.
 * Jede Zuordnung und jedes Kapitel eines neuen Strangs braucht ein wörtliches Zitat aus genau diesem Kapitel (E6).
 * Schreibt nichts – gespeichert wird im Store (.plotwerk/strang-vorschlaege.json).
 */
import type { Id, KiAblage, KiEinstellungen, ProjektDaten, StrangRolle, StrangVorschlag, Zitat } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { ladeProjekt } from '../projekt/lesen';
import {
  fuehreAufgabeAus,
  schaetzeAufgabe,
  type AufgabenDefinition,
  type AufgabenErgebnis,
  type AufgabenOptionen,
  type AufgabenPruefung,
} from './aufgabe';
import type { KiTransport, Schaetzung } from './index';
import { planText, type BuchKontext } from './kontext';
import { meldungenIn } from './meldungen';
import { loseEndeId } from './pruefung';
import { ANTWORTSPRACHE_EN, kapKurz, type Sprache } from './sprache';

/** Kennung im Aufgabenkopf (<aufgabe art="straenge">); Demo-Antworten sind unter diesem Schlüssel registriert. */
export const STRAENGE_ART = 'straenge';

/** höchstens so viele Rückfragen je Lauf */
export const STRAENGE_MAX_FRAGEN = 3;

/** Ein Strang, wie er an das Modell geht (E12: nur diese Felder). */
export interface KontextStrang {
  id: Id;
  name: string;
  rolle?: StrangRolle;
  /** „Wofür steht der Strang?“ als eine Zeile */
  beschreibung: string;
  /** Kapitel, in denen der Plan den Strang schon führt (Buchreihenfolge) */
  kapitel: Id[];
}

export interface StrangAuftrag {
  straenge: KontextStrang[];
  /** von Leon beantwortete Rückfragen früherer Läufe */
  antworten: { frage: string; antwort: string }[];
}

export interface StrangErgebnis {
  /** geprüfte Vorschläge (Status „neu“), Buchreihenfolge */
  vorschlaege: StrangVorschlag[];
}

/** Allowlist (E12) für diese Aufgabe: nur Name, Rolle, Beschreibung und Plan-Kapitel der Stränge, dazu beantwortete Rückfragen. */
export function strangAuftrag(daten: ProjektDaten): StrangAuftrag {
  const reihe = daten.projekt.kapitel;
  const straenge = daten.straenge.map((s) => ({
    id: s.id,
    name: s.name,
    ...(s.rolle ? { rolle: s.rolle } : {}),
    beschreibung: planText(s.beschreibung),
    kapitel: reihe.filter((k) => daten.plaene[k]?.straenge.includes(s.id)),
  }));
  const antworten = (daten.kiStrangVorschlaege?.eintraege ?? [])
    .filter((v) => v.art === 'frage' && v.status === 'uebernommen' && v.frage && v.antwort?.trim())
    .map((v) => ({ frage: planText(v.frage), antwort: planText(v.antwort) }));
  return { straenge, antworten };
}

export const SYSTEM_STRAENGE = `Du hilfst einem Autor, die Erzählstränge seines deutschsprachigen Romanmanuskripts zu ordnen. Ein Erzählstrang ist ein Handlungsfaden, der sich über mehrere Kapitel zieht (z. B. ein Fall, eine Beziehung, ein Konflikt). Du liest das Buch und schlägst vor, welche geschriebenen Kapitel zu welchem Strang gehören, welche Stränge das Buch trägt, die noch nicht angelegt sind, und wo du beim Autor nachfragen musst.

Du schreibst nie Text für das Buch: keine Umformulierungen, keine Ersatzsätze, keine Formulierungsvorschläge, keine Ideen für neue Szenen. Was ein Strang ist und wohin er gehört, entscheidet allein der Autor.

Regeln:
- Jeder Vorschlag stützt sich auf den <text> der Kapitel. Jedes Zitat ist eine zusammenhängende Passage aus dem Kapitel, das du unter "kapitel" mit seiner id angibst, Zeichen für Zeichen kopiert, ohne Auslassungen, höchstens ein Satz.
- Planung des Autors (<plan>, Stränge, Antworten auf Rückfragen) hilft beim Einordnen; sie ist kein Beleg.
- Namen, Zweck und Begründungen sind sachlich und kurz. Lieber wenige sichere Vorschläge als viele unsichere.`;

export const SYSTEM_STRAENGE_EN = `You help an author organise the plot lines of their English-language novel manuscript. A plot line is a narrative thread that runs through several chapters (e.g. a case, a relationship, a conflict). You read the book and suggest which written chapters belong to which plot line, which plot lines the book carries that have not been set up yet, and where you need to ask the author.

You never write text for the book: no rewordings, no replacement sentences, no suggested phrasings, no ideas for new scenes. What a plot line is and where it belongs is decided by the author alone.

Rules:
- Every suggestion is based on the <text> of the chapters. Every quote is one continuous passage from the chapter you name under "kapitel" with its id, copied character for character, without omissions, at most one sentence.
- The author's planning (<plan>, plot lines, answers to questions) helps you to classify; it is not evidence.
- Names, purposes and reasons are factual and short. Better a few certain suggestions than many uncertain ones.

${ANTWORTSPRACHE_EN}`;

function strangZeile(s: KontextStrang, kontext: BuchKontext, en: boolean): string {
  const nr = new Map(kontext.kapitel.map((k) => [k.id, k.nr]));
  const teile = [`${s.name} (id: ${s.id})`];
  if (s.rolle) teile.push(s.rolle === 'haupt' ? (en ? 'main plot' : 'Haupthandlung') : en ? 'subplot' : 'Nebenhandlung');
  if (s.beschreibung) teile.push(`${en ? 'purpose' : 'Zweck'}: ${s.beschreibung}`);
  const kap = s.kapitel.map((k) => kapKurz(nr.get(k) ?? '?', kontext.sprache));
  teile.push(kap.length ? `${en ? 'in the plan in' : 'im Plan in'}: ${kap.join(', ')}` : en ? 'not yet in any chapter' : 'noch in keinem Kapitel');
  return `- ${teile.join(' · ')}`;
}

function aufgabenText(kontext: BuchKontext, auftrag: StrangAuftrag): string {
  const en = kontext.sprache === 'en';
  const z: string[] = [];
  z.push(en ? "The author's plot lines (planning, not part of the book):" : 'Erzählstränge des Autors (Planung, gehört nicht zum Buch):');
  if (auftrag.straenge.length === 0) z.push(en ? '- (none set up yet)' : '- (noch keine angelegt)');
  for (const s of auftrag.straenge) z.push(strangZeile(s, kontext, en));
  if (auftrag.antworten.length) {
    z.push('');
    z.push(en ? "The author's answers to earlier questions:" : 'Antworten des Autors auf frühere Rückfragen:');
    for (const a of auftrag.antworten) z.push(en ? `- Question: ${a.frage} · Answer: ${a.antwort}` : `- Frage: ${a.frage} · Antwort: ${a.antwort}`);
  }
  z.push('');
  if (en) {
    z.push('Read the whole book and organise the written chapters into plot lines.');
    z.push('1. zuordnungen: written chapters that take up a plot line already set up, but are not yet listed with it in the plan. For each: strang (id), kapitel (id), zitat (verbatim from this chapter), begruendung (one sentence: what in the chapter belongs to the plot line).');
    z.push('2. neueStraenge: plot lines the book clearly carries that are not set up yet and do not overlap with an existing one. For each: name (two to four words), rolle (haupt = carries the central plot, neben = subplot), zweck (one factual sentence: what the plot line is about), kapitel: every written chapter that takes it up, each with one verbatim zitat from that chapter.');
    z.push(`3. rueckfragen: at most ${STRAENGE_MAX_FRAGEN} questions to the author where you are unsure – e.g. whether a thread is a plot line of its own or part of another, which plot line is the main plot, what an existing plot line without a purpose stands for. For each: frage (one sentence), strang (id of an existing plot line concerned, otherwise empty), belege (zero to two verbatim quotes). Do not repeat questions the author has already answered.`);
    z.push('Never suggest anything that is already in the plan. Only chapters with text. If there is nothing to suggest, return empty lists.');
  } else {
    z.push('Lies das ganze Buch und ordne die geschriebenen Kapitel Erzählsträngen zu.');
    z.push('1. zuordnungen: geschriebene Kapitel, die einen angelegten Strang aufgreifen, im Plan aber noch nicht bei ihm stehen. Je Eintrag: strang (id), kapitel (id), zitat (wörtlich aus diesem Kapitel), begruendung (ein Satz: was im Kapitel zum Strang gehört).');
    z.push('2. neueStraenge: Erzählstränge, die das Buch erkennbar trägt, die aber noch nicht angelegt sind und sich nicht mit einem angelegten überschneiden. Je Eintrag: name (zwei bis vier Wörter), rolle (haupt = trägt die zentrale Handlung, neben = Nebenhandlung), zweck (ein sachlicher Satz: worum es in dem Strang geht), kapitel: jedes geschriebene Kapitel, das ihn aufgreift, mit je einem wörtlichen zitat aus diesem Kapitel.');
    z.push(`3. rueckfragen: höchstens ${STRAENGE_MAX_FRAGEN} Fragen an den Autor, wo du unsicher bist – z. B. ob ein Faden ein eigener Strang ist oder zu einem anderen gehört, welcher Strang die Haupthandlung ist, wofür ein angelegter Strang ohne Zweck steht. Je Eintrag: frage (ein Satz), strang (id eines betroffenen angelegten Strangs, sonst leer), belege (null bis zwei wörtliche Zitate). Wiederhole keine Fragen, die der Autor schon beantwortet hat.`);
    z.push('Schlage nie vor, was schon im Plan steht. Nur Kapitel mit Text. Gibt es nichts vorzuschlagen, gib leere Listen zurück.');
  }
  return z.join('\n');
}

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

/** Antwortschema – ohne Feld für Ersatztext (harte Regel 2). */
export function straengeSchema(kontext: BuchKontext, auftrag: StrangAuftrag): Record<string, unknown> {
  const mitText = kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id);
  const kapitel = { type: 'string', enum: mitText };
  const ids = auftrag.straenge.map((s) => s.id);
  const strang = ids.length ? { type: 'string', enum: ids } : { type: 'string' };
  return obj({
    zuordnungen: { type: 'array', items: obj({ strang, kapitel, zitat: { type: 'string' }, begruendung: { type: 'string' } }) },
    neueStraenge: {
      type: 'array',
      items: obj({
        name: { type: 'string' },
        rolle: { type: 'string', enum: ['haupt', 'neben'] },
        zweck: { type: 'string' },
        kapitel: { type: 'array', items: obj({ kapitel, zitat: { type: 'string' } }) },
      }),
    },
    rueckfragen: {
      type: 'array',
      items: obj({
        frage: { type: 'string' },
        strang: { type: 'string', enum: ['', ...ids] },
        belege: { type: 'array', items: obj({ kapitel, text: { type: 'string' } }) },
      }),
    },
  });
}

/** Stabiler Schlüssel je Vorschlagsart (siehe StrangVorschlag). */
export function strangVorschlagSchluessel(v: Pick<StrangVorschlag, 'art' | 'strang' | 'name' | 'kapitel' | 'frage'>): string {
  if (v.art === 'zuordnung') return `zuordnung:${v.strang ?? ''}|${v.kapitel[0] ?? ''}`;
  if (v.art === 'neu') return `strang:${loseEndeId(v.name ?? '')}`;
  return `frage:${loseEndeId(v.frage ?? '').slice(0, 80)}`;
}

/** Antwort auswerten (auch einzeln testbar). */
export function werteStraengeAus(daten: unknown, p: AufgabenPruefung, auftrag: StrangAuftrag): StrangErgebnis {
  const m = meldungenIn(p.oberflaeche);
  const ergebnis: StrangErgebnis = { vorschlaege: [] };
  const d = (daten ?? {}) as Record<string, unknown>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.zuordnungen) || !Array.isArray(d.neueStraenge) || !Array.isArray(d.rueckfragen)) {
    p.verwerfen(m('schemaFalsch'), daten);
    return ergebnis;
  }
  const straenge = new Map(auftrag.straenge.map((s) => [s.id, s]));
  const namen = new Set(auftrag.straenge.map((s) => loseEndeId(s.name)));
  const reihe = new Map(p.kontext.kapitel.map((k, i) => [k.id, i]));
  const gesehen = new Set<string>();
  const dazu = (v: StrangVorschlag) => {
    if (gesehen.has(v.schluessel)) return;
    gesehen.add(v.schluessel);
    ergebnis.vorschlaege.push(v);
  };
  /** ein Zitat aus genau diesem Kapitel; null = verworfen (Grund vermerkt) */
  const beleg = (kapitel: unknown, text: unknown, roh: unknown): { kapitel: Id; zitat: Zitat } | null => {
    const k = p.kapitel(kapitel);
    if (!k || !k.text.trim()) {
      p.verwerfen(m('kapitelUnbekannt', { kapitel: String(kapitel ?? '') }), roh);
      return null;
    }
    const zitate = p.zitate([{ kapitel: k.id, text }], roh, { kapitel: new Set([k.id]) });
    return zitate ? { kapitel: k.id, zitat: zitate[0]! } : null;
  };

  for (const roh of d.zuordnungen) {
    const z = (roh ?? {}) as Record<string, unknown>;
    const s = typeof z.strang === 'string' ? straenge.get(z.strang) : undefined;
    if (!s) {
      p.verwerfen(m('strangUnbekannt', { strang: String(z.strang ?? '') }), roh);
      continue;
    }
    const b = beleg(z.kapitel, z.zitat, roh);
    if (!b) continue;
    if (s.kapitel.includes(b.kapitel)) {
      p.verwerfen(m('schonImPlan', { nr: p.kapitel(b.kapitel)?.nr ?? '?', name: s.name }), roh);
      continue;
    }
    const begruendung = p.text(z.begruendung, roh);
    if (begruendung === null) continue;
    const v: Omit<StrangVorschlag, 'schluessel'> = { art: 'zuordnung', strang: s.id, kapitel: [b.kapitel], begruendung, belege: [b.zitat], status: 'neu' };
    dazu({ schluessel: strangVorschlagSchluessel(v), ...v });
  }

  for (const roh of d.neueStraenge) {
    const n = (roh ?? {}) as Record<string, unknown>;
    const name = p.text(n.name, roh, { pflicht: true });
    if (name === null) continue;
    if (namen.has(loseEndeId(name))) {
      p.verwerfen(m('strangGibtEs', { name }), roh);
      continue;
    }
    const zweck = p.text(n.zweck, roh);
    if (zweck === null) continue;
    const kapitel: Id[] = [];
    const belege: Zitat[] = [];
    for (const kRoh of Array.isArray(n.kapitel) ? n.kapitel : []) {
      const kk = (kRoh ?? {}) as Record<string, unknown>;
      const b = beleg(kk.kapitel, kk.zitat, roh);
      if (!b || kapitel.includes(b.kapitel)) continue;
      kapitel.push(b.kapitel);
      belege.push(b.zitat);
    }
    if (kapitel.length === 0) {
      p.verwerfen(m('ohneKapitel'), roh);
      continue;
    }
    const folge = kapitel.map((k, i) => ({ k, z: belege[i]! })).sort((a, b) => (reihe.get(a.k) ?? 0) - (reihe.get(b.k) ?? 0));
    const v: Omit<StrangVorschlag, 'schluessel'> = {
      art: 'neu',
      name,
      ...(n.rolle === 'haupt' || n.rolle === 'neben' ? { rolle: n.rolle } : {}),
      ...(zweck ? { beschreibung: zweck } : {}),
      kapitel: folge.map((x) => x.k),
      begruendung: '',
      belege: folge.map((x) => x.z),
      status: 'neu',
    };
    dazu({ schluessel: strangVorschlagSchluessel(v), ...v });
  }

  let fragen = 0;
  for (const roh of d.rueckfragen) {
    if (fragen >= STRAENGE_MAX_FRAGEN) break;
    const f = (roh ?? {}) as Record<string, unknown>;
    const frage = p.text(f.frage, roh, { pflicht: true });
    if (frage === null) continue;
    const belege = Array.isArray(f.belege) && f.belege.length ? p.zitate(f.belege, roh, { mindestens: 0 }) : [];
    if (belege === null) continue;
    const strang = typeof f.strang === 'string' && straenge.has(f.strang) ? f.strang : undefined;
    const v: Omit<StrangVorschlag, 'schluessel'> = {
      art: 'frage',
      ...(strang ? { strang } : {}),
      frage,
      kapitel: [...new Set(belege.map((b) => b.kapitel))],
      begruendung: '',
      belege,
      status: 'neu',
    };
    dazu({ schluessel: strangVorschlagSchluessel(v), ...v });
    fragen++;
  }

  const pos = (v: StrangVorschlag) => (v.kapitel[0] ? (reihe.get(v.kapitel[0]) ?? 0) : Number.MAX_SAFE_INTEGER);
  const artReihe = { neu: 0, zuordnung: 1, frage: 2 } as const;
  ergebnis.vorschlaege.sort((a, b) => artReihe[a.art] - artReihe[b.art] || pos(a) - pos(b));
  return ergebnis;
}

/** Aufgabendefinition „Stränge vorschlagen“. */
export function straengeDefinition(auftrag: StrangAuftrag): AufgabenDefinition<StrangErgebnis> {
  return {
    name: meldungenIn('de')('nameStraenge'),
    nameEn: meldungenIn('en')('nameStraenge'),
    art: STRAENGE_ART,
    rolle: 'pruefung',
    system: SYSTEM_STRAENGE,
    systemEn: SYSTEM_STRAENGE_EN,
    ausgabeSchaetzung: 4000,
    aufgabe: (kontext) => aufgabenText(kontext, auftrag),
    schema: (kontext) => straengeSchema(kontext, auftrag),
    auswerten: (daten, p) => werteStraengeAus(daten, p, auftrag),
  };
}

/** Schlägt Stränge für das ganze Buch vor (eine Anfrage). Schreibt nichts. */
export async function schlageStraengeVor(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<StrangErgebnis>> {
  const auftrag = strangAuftrag(await ladeProjekt(leser));
  return fuehreAufgabeAus(leser, transport, einstellungen, straengeDefinition(auftrag), optionen);
}

/** Schätzung vor dem Start (Tokens, Kosten). */
export async function schaetzeStraenge(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  const auftrag = strangAuftrag(await ladeProjekt(leser));
  return schaetzeAufgabe(leser, transport, einstellungen, straengeDefinition(auftrag), oberflaeche);
}

/**
 * Neue Vorschläge in die Ablage mischen: entschiedene (übernommen/verworfen) bleiben und werden nie erneut
 * vorgeschlagen; offene Vorschläge früherer Läufe werden durch das neue Ergebnis ersetzt.
 */
export function mischeStrangVorschlaege(
  ablage: KiAblage<StrangVorschlag> | undefined,
  neu: StrangVorschlag[],
  lauf?: KiAblage<StrangVorschlag>['lauf'],
): { ablage: KiAblage<StrangVorschlag>; neu: number; bereitsEntschieden: number } {
  const a = ablage ?? { version: 1 as const, eintraege: [] };
  const entschieden = a.eintraege.filter((v) => v.status !== 'neu');
  const schluessel = new Set(entschieden.map((v) => v.schluessel));
  const vorher = new Set(a.eintraege.map((v) => v.schluessel));
  const offen: StrangVorschlag[] = [];
  let bereitsEntschieden = 0;
  let zahl = 0;
  for (const v of neu) {
    if (schluessel.has(v.schluessel)) {
      bereitsEntschieden++;
      continue;
    }
    if (offen.some((x) => x.schluessel === v.schluessel)) continue;
    offen.push({ ...v, status: 'neu' });
    if (!vorher.has(v.schluessel)) zahl++;
  }
  return { ablage: { ...a, version: 1, eintraege: [...entschieden, ...offen], ...(lauf ? { lauf } : {}) }, neu: zahl, bereitsEntschieden };
}
