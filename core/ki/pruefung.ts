/**
 * Antwortprüfung: Zitate (E6, harte Regel 3), Ersatztext (harte Regel 2), bewusst Vages
 * (harte Regel 4), Etikett „offen“, Schlüssel, lose Enden.
 */
import type { Sprache } from '../i18n';
import { hinweisSchluessel } from '../index';
import type { Hinweis, HinweisTyp, Id, KapitelAnalyse, Zitat } from '../model/types';
import { ankerFinden, findeZitat, normalisiere, type Bereich } from '../text';
import { KI_HINWEIS_TYPEN } from './anfrage';
import type { BuchKontext, KontextKapitel, KontextRealitaet } from './kontext';
import { meldung, meldungenIn } from './meldungen';

export interface Verworfen {
  grund: string;
  roh: unknown;
}

// ---------------------------------------------------------------------------
// Ersatztext / Formulierungsvorschläge
// ---------------------------------------------------------------------------

/** Muster für Ersatz- und Formulierungsvorschläge in Titel oder Erklärung. */
export const ERSATZTEXT_MUSTER: { muster: RegExp; name: string }[] = [
  { muster: /\bstattdessen\b/i, name: '„stattdessen“' },
  { muster: /\bbesser\s*:/i, name: '„besser:“' },
  { muster: /\b(wäre|ist|klingt|passt|wirkt)\s+(es\s+|das\s+)?besser\b/i, name: '„wäre besser“' },
  { muster: /\bbesser\s+(wäre|ist|klingt|passt|wirkt)\b/i, name: '„besser wäre“' },
  { muster: /\bersetze(n|st)?\b/i, name: '„ersetze“' },
  { muster: /\b(um)?formulier(e|en|st)\b/i, name: '„formuliere“' },
  { muster: /\bformulierungs(vorschlag|alternative|idee)/i, name: '„Formulierungsvorschlag“' },
  { muster: /\bumschreib|\bumgeschrieben\b/i, name: '„umschreiben“' },
  { muster: /\bschreib(e|en|st|t)?\s+(lieber|besser|stattdessen|eher)\b/i, name: '„schreib lieber“' },
  { muster: /\b(lieber|besser|eher)\s+(so\s+)?schreiben\b/i, name: '„lieber schreiben“' },
  { muster: /\bvorschlag\s*:/i, name: '„Vorschlag:“' },
  { muster: /\bschlage\b[^.!?]{0,40}\bvor\b/i, name: '„ich schlage vor“' },
  { muster: /\b(alternativ|alternative|neue fassung|neuer text|korrektur|korrigiert)\s*:/i, name: '„Alternative:“' },
  { muster: /\bstreiche\b/i, name: '„streiche“' },
  { muster: /\bergänze\b|\bfüge\b[^.!?]{0,60}\bhinzu\b/i, name: '„ergänze“' },
  { muster: /(?<![\p{L}])änder(e|n)?(?![\p{L}])[^.!?]{0,60}\b(zu|in)\s*[„"»‚'‹]/iu, name: '„ändere in …“' },
  { muster: /\b(an)?statt\s+[„"»‚'‹][^„"»«“”]{1,120}[“”"«'‘›]\s*(lieber|besser|eher)?\s*[„"»‚'‹]/i, name: '„statt … lieber …“' },
  {
    muster: /(?<![\p{L}])(könnte|könntest|sollte|solltest|müsste|müsstest)\s+(man|du|ihr)(?![\p{L}])[^.!?]{0,80}(?<![\p{L}])(schreiben|formulieren|umschreiben|ändern|ersetzen|streichen|ergänzen)(?![\p{L}])/iu,
    name: '„man könnte … schreiben“',
  },
  { muster: /[“”"«»‘’'›‹]\s*(→|->|=>|⇒|⟶|➔)|(→|->|=>|⇒|⟶|➔)\s*[„“"»«‚'‹]/, name: 'Umformulierung mit Pfeil' },
  ...englischeErsatzMuster(),
];

/**
 * Englische Entsprechungen. Sie gelten immer, unabhängig von der Buchsprache (das Modell kann in beiden Sprachen
 * antworten; deutsche Texte enthalten diese Wendungen praktisch nie). Bewusst eng gefasst, damit normale
 * Beobachtungen durchgehen: Verben wie „write“, „use“, „replace“, „cut“ nur als Anweisung (Satzanfang, nach
 * could/should/might/please) oder mit einem zitierten Ersatz; „instead“ nicht in Handlungsbeschreibungen
 * („Paul walks home instead of taking the bus“).
 */
function englischeErsatzMuster(): { muster: RegExp; name: string }[] {
  const Q_AUF = `["“‘'«»„‚]`;
  const Q_ZU = `["”’'«»“‘]`;
  /** Anweisung: Satzanfang oder nach einem Modalverb bzw. „please“ */
  const ANWEISUNG = String.raw`(?:^|[.!?:;\n]\s*|\b(?:could|might|should|would|can|please)\s+)`;
  const re = (s: string) => new RegExp(s, 'i');
  return [
    { muster: /\bbetter\s*:/i, name: '“better:”' },
    { muster: /\b(would|could|might)\s+(read|sound|work|flow)\s+better\b|\b(it|this|that)\s+(would|could|might)\s+be\s+better\b/i, name: '“would read better”' },
    { muster: /\b(reads|flows)\s+better\b/i, name: '“reads better”' },
    { muster: re(`${ANWEISUNG}replace\\b[^.!?]{0,60}\\bwith\\b|\\breplac(e|ing)\\b[^.!?]{0,60}\\bwith\\s*${Q_AUF}`), name: '“replace … with”' },
    { muster: /\b(rephras|reword)\w*/i, name: '“rephrase”' },
    { muster: re(`${ANWEISUNG}rewrite\\b|\\brewrit(e|ing)\\s+(it|this|that)\\s+(as|to|like)\\b`), name: '“rewrite as”' },
    {
      muster: re(`(?:^|[.!?:;\\n]\\s*|\\b(?:you|might|could|may|should)\\s+)consider\\s+(writing|changing|rephrasing|rewording|replacing|cutting|deleting|removing|adding|ending|starting)\\b`),
      name: '“consider writing”',
    },
    {
      muster: /\b(the\s+author|the\s+writer|one)\s+(could|might|may|should|can)\s+(write|change|replace|cut|delete|remove|add|rephrase|reword|rewrite|swap)\b|\byou\s+(could|might|may|should|can)\s+(write|rephrase|reword|rewrite|cut|delete|replace|change\s+(it|this|that|the\s+(line|sentence|word|phrase|passage)))\b/i,
      name: '“you could write”',
    },
    { muster: re(`${ANWEISUNG}change\\s+(it|this|that|the\\s+\\w+(\\s+\\w+)?)\\s+(to|into)\\s*:?\\s*${Q_AUF}`), name: '“change it to …”' },
    { muster: re(`\\b(should|could|would|might)\\s+read\\s*(:|${Q_AUF})|\\b(the\\s+(line|sentence|passage|text)|it)\\s+(should|could|might)\\s+say\\b`), name: '“should read …”' },
    {
      muster: /\b(suggestion|suggested\s+(wording|revision|text|line|change)|alternative(\s+wording)?|revised\s+(version|text|line|sentence)|new\s+(version|wording|text)|correction|corrected|proposal|instead)\s*:/i,
      name: '“Suggestion:”',
    },
    { muster: /\bi\s+(would\s+)?(suggest|recommend|propose)\b/i, name: '“I suggest”' },
    { muster: re(`${ANWEISUNG}(write|say|use|try|put|go\\s+with)\\b[^.!?]{0,60}\\binstead\\b`), name: '“write … instead”' },
    { muster: /\binstead\s*,?\s*(write|use|try|say|go\s+with|put)\b/i, name: '“instead, write …”' },
    { muster: re(`${ANWEISUNG}(cut|delete|remove|drop|strike)\\s+(the|this|that)\\s+(word|sentence|line|phrase|passage|paragraph|clause)\\b`), name: '“delete the sentence”' },
    { muster: re(`${ANWEISUNG}add\\s+(a|an|one)\\s+(sentence|line|word|phrase|beat|paragraph)\\b`), name: '“add a sentence”' },
    {
      muster: re(`\\b(instead\\s+of|rather\\s+than)\\s+${Q_AUF}[^"“”‘’«»„]{1,120}${Q_ZU}\\s*,?\\s*(write|use|say|try|go\\s+with|put)?\\s*${Q_AUF}`),
      name: '“instead of … use …”',
    },
  ];
}

/** Grund, wenn der Text einen Ersatz- oder Formulierungsvorschlag enthält; sonst null. `oberflaeche`: Sprache des Grunds. */
export function ersatztextGrund(text: string, oberflaeche: Sprache = 'de'): string | null {
  for (const { muster, name } of ERSATZTEXT_MUSTER) {
    if (muster.test(text)) return meldung('formulierungsvorschlag', { name }, oberflaeche);
  }
  return null;
}

const ZITAT_IN_ERKLAERUNG = /[„"»‚‹]([^„"»«“”‚‘‹›]{3,200})[“”"«‘›]/g;
/**
 * Englisch: “…” und "…", einfache ‘…’ nur, wenn das schließende ’ kein Apostroph im Wort ist (don’t, Paul’s).
 * Deutsche Zitate („…“) kommen auch in englischen Erklärungen vor (deutsche Zitate im Buch).
 */
const ZITAT_IN_ERKLAERUNG_EN = /[“"„]([^“”"„]{3,200})[”"“]|‘((?:[^‘’]|’(?=\p{L}))+?)’(?!\p{L})/gu;

/** Längere zitierte Passagen in der Erklärung, die weder im Buch noch in der Planung stehen (vermutlich Ersatztext). */
export function fremdesZitat(text: string, kontext: BuchKontext): string | null {
  const planTexte = [
    ...kontext.figuren.flatMap((f) => f.plan.map((p) => p.wert)),
    ...kontext.kapitel.flatMap((k) => [k.plan.szene, k.plan.notiz]),
  ].filter(Boolean);
  for (const m of text.matchAll(kontext.sprache === 'en' ? ZITAT_IN_ERKLAERUNG_EN : ZITAT_IN_ERKLAERUNG)) {
    const inhalt = (m[1] ?? m[2] ?? '').trim();
    if (inhalt.split(/\s+/).length < 3) continue;
    if (kontext.kapitel.some((k) => k.text && findeZitat(k.text, inhalt).length > 0)) continue;
    if (planTexte.some((t) => findeZitat(t, inhalt).length > 0)) continue;
    return inhalt;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Namen, Realitätsebenen
// ---------------------------------------------------------------------------

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ARTIKEL = /^(der|die|das|ein|eine|einer|eines|den|dem|the)\s+/i;

/** Wortgrenzen nach E5 (Unicode-Buchstaben), Genitiv-s/Apostroph bzw. Possessiv (normalisiert "s) erlaubt. */
export function nennt(text: string, namen: string[]): boolean {
  const n = normalisiere(text).text;
  for (const roh of namen) {
    const name = normalisiere(roh.trim()).text;
    if (name.length < 2) continue;
    const varianten = [name];
    const ohneArtikel = name.replace(ARTIKEL, '');
    if (ohneArtikel !== name && ohneArtikel.length >= 3) varianten.push(ohneArtikel);
    for (const v of varianten) {
      if (new RegExp(`(?<![\\p{L}\\p{N}])${escape(v)}(?:s|'|’)?(?![\\p{L}\\p{N}])`, 'iu').test(n)) return true;
    }
  }
  return false;
}

/** Deutsche und englische Funktionswörter (englische Sätze beginnen ebenfalls groß: „When“, „There“). */
const STOPPWOERTER = new Set(
  [
    'aber alle also auch beim dass dann denn diese dieser dieses doch eine einem einen einer eines etwas hier jemand kapitel nach noch nicht oder ohne schon sein seine seiner sich sind soll über unter vorher wann warum weil wenn wer wie wieder wird wurde zwei zweite zweites zweiter erste erster erstes',
    'about after again also because before chapter could does every first from have here into maybe never only other over perhaps second should some someone still that their them then there these they this those under what when where which while will with without would',
  ]
    .join(' ')
    .split(' '),
);

/** Kennwörter einer Realitäts-Beschreibung: großgeschriebene Wörter ≥ 4 Buchstaben ohne Figuren-/Ortsnamen. */
export function kennwoerter(text: string, namen: Set<string>): string[] {
  const woerter = text.match(/\p{Lu}[\p{L}]{3,}/gu) ?? [];
  return [...new Set(woerter)].filter((w) => !STOPPWOERTER.has(w.toLocaleLowerCase('de')) && !namen.has(w.toLocaleLowerCase('de')));
}

function kennwortTreffer(text: string, woerter: string[]): string | null {
  const n = normalisiere(text).text;
  for (const w of woerter) {
    if (new RegExp(`(?<![\\p{L}])${escape(w)}`, 'iu').test(n)) return w;
  }
  return null;
}

function ueberlappt(a: Bereich, b: Bereich): boolean {
  return a.start < b.ende && b.start < a.ende;
}

export interface ZitatStelle {
  kapitel: KontextKapitel;
  zitat: Zitat;
  bereiche: Bereich[];
}

const ANFUEHRUNG = /["„“”»«]/;

/**
 * Der Zitatvergleich (E6) ignoriert Anführungszeichen am Rand. Hat das Modell sie mitzitiert und stehen sie
 * auch im Text direkt an der Fundstelle, gehören sie zum gespeicherten Zitat (sonst fehlt z. B. das
 * schließende „““ in der Anzeige). Der Schlüssel (zitatKern) bleibt derselbe.
 */
export function randAnfuehrung(text: string, b: Bereich, roh: string): Bereich {
  let { start, ende } = b;
  if (ANFUEHRUNG.test(roh.charAt(0)) && start > 0 && ANFUEHRUNG.test(text.charAt(start - 1))) start--;
  if (ANFUEHRUNG.test(roh.charAt(roh.length - 1)) && ende < text.length && ANFUEHRUNG.test(text.charAt(ende))) ende++;
  return { start, ende };
}

export class Pruefer {
  private readonly kapitelNachId = new Map<Id, KontextKapitel>();
  private readonly namenKlein = new Set<string>();
  /** Gründe verworfener Antworten in der Oberflächensprache */
  private readonly m: ReturnType<typeof meldungenIn>;

  constructor(
    readonly kontext: BuchKontext,
    private readonly entschieden: Set<string> = new Set(),
    readonly oberflaeche: Sprache = 'de',
  ) {
    this.m = meldungenIn(oberflaeche);
    for (const k of kontext.kapitel) this.kapitelNachId.set(k.id, k);
    for (const f of kontext.figuren) for (const n of [f.name, ...f.aliase, ...f.formen]) for (const w of n.split(/\s+/)) this.namenKlein.add(w.toLocaleLowerCase('de'));
    for (const o of kontext.orte) for (const n of [o.name, ...o.aliase]) for (const w of n.split(/\s+/)) this.namenKlein.add(w.toLocaleLowerCase('de'));
  }

  kapitel(id: Id): KontextKapitel | undefined {
    return this.kapitelNachId.get(id);
  }

  /** Kapitelangabe des Modells → Kapitel (ID, notfalls Titel). */
  kapitelZu(angabe: string): KontextKapitel | undefined {
    const direkt = this.kapitelNachId.get(angabe);
    if (direkt) return direkt;
    const klein = angabe.trim().toLocaleLowerCase('de');
    return this.kontext.kapitel.find((k) => k.titel.toLocaleLowerCase('de') === klein);
  }

  /** Sucht ein Zitat wörtlich (nach E6) im Kapitel; liefert den Originaltext des Klartexts. */
  zitatFinden(kapitelAngabe: unknown, text: unknown): ZitatStelle | string {
    if (typeof kapitelAngabe !== 'string' || typeof text !== 'string') return this.m('zitatUnvollstaendig');
    const k = this.kapitelZu(kapitelAngabe);
    if (!k) return this.m('zitatUnbekanntesKapitel', { kapitel: kapitelAngabe });
    const roh = text.trim();
    if (normalisiere(roh).text.replace(/\s/g, '').length < 3) return this.m('zitatZuKurz', { text: roh });
    const bereiche = k.text ? findeZitat(k.text, roh) : [];
    const erster = bereiche[0];
    if (!erster) return this.m('zitatNichtWoertlich', { nr: k.nr, titel: k.titel, text: roh });
    const b = randAnfuehrung(k.text, erster, roh);
    return { kapitel: k, zitat: { kapitel: k.id, text: k.text.slice(b.start, b.ende) }, bereiche };
  }

  private bereichDesAnkers(r: KontextRealitaet): Bereich | null {
    const k = r.anker ? this.kapitelNachId.get(r.anker.kapitel) : undefined;
    return k && r.anker ? ankerFinden(k.text, r.anker) : null;
  }

  /** Betrifft der Hinweis etwas mit der Stufe? `alleKapitel`: Beschreibungen aller Kapitel prüfen, nicht nur der zitierten. */
  private betrifft(stufe: 'offen' | 'bewusst_vage', stellen: ZitatStelle[], text: string, alleKapitel: boolean): string | null {
    const voll = [text, ...stellen.map((s) => s.zitat.text)].join('\n');
    for (const f of this.kontext.figuren) {
      if (f.existenz === stufe && nennt(voll, [f.name, ...f.aliase, ...f.formen])) return this.m('betrifftFigur', { name: f.name });
    }
    const zitierte = new Set(stellen.map((s) => s.kapitel.id));
    for (const r of this.kontext.realitaet) {
      if (r.stufe !== stufe) continue;
      const bereich = this.bereichDesAnkers(r);
      if (bereich && r.anker) {
        const anker = r.anker;
        if (stellen.some((s) => s.kapitel.id === anker.kapitel && s.bereiche.some((b) => ueberlappt(b, bereich)))) {
          return this.m('betrifftStelle', { text: anker.exakt });
        }
      }
      if (!alleKapitel && !zitierte.has(r.kapitel)) continue;
      const wort = kennwortTreffer(voll, kennwoerter(r.text, this.namenKlein));
      if (wort) return this.m('betrifftText', { text: r.text });
    }
    return null;
  }

  /** Prüft einen Rohhinweis des Modells. `aufgabe` = Kapitel, die in dieser Anfrage geprüft wurden. */
  hinweis(roh: unknown, aufgabe: Set<Id>): { hinweis: Hinweis } | { entschieden: string } | Verworfen {
    const verwerfen = (grund: string): Verworfen => ({ grund, roh });
    const m = this.m;
    if (!roh || typeof roh !== 'object') return verwerfen(m('hinweisFormat'));
    const h = roh as Record<string, unknown>;
    const typ = h.typ as HinweisTyp;
    if (!(KI_HINWEIS_TYPEN as readonly string[]).includes(typ)) return verwerfen(m('hinweisTypUnbekannt', { typ: String(h.typ) }));
    const titel = typeof h.titel === 'string' ? h.titel.trim() : '';
    const erklaerung = typeof h.erklaerung === 'string' ? h.erklaerung.trim() : '';
    if (!titel) return verwerfen(m('hinweisOhneTitel'));
    if (!Array.isArray(h.zitate) || h.zitate.length === 0) return verwerfen(m('hinweisOhneZitat'));

    const stellen: ZitatStelle[] = [];
    for (const z of h.zitate as unknown[]) {
      const zz = (z ?? {}) as Record<string, unknown>;
      const stelle = this.zitatFinden(zz.kapitel, zz.text);
      if (typeof stelle === 'string') return verwerfen(stelle);
      if (!stellen.some((s) => s.zitat.kapitel === stelle.zitat.kapitel && s.zitat.text === stelle.zitat.text)) stellen.push(stelle);
    }
    if (!stellen.some((s) => aufgabe.has(s.kapitel.id))) return verwerfen(m('hinweisNichtGeprueft'));

    const ersatz = ersatztextGrund(`${titel}\n${erklaerung}`, this.oberflaeche);
    if (ersatz) return verwerfen(ersatz);
    const fremd = fremdesZitat(`${titel}\n${erklaerung}`, this.kontext);
    if (fremd) return verwerfen(m('erklaerungZitiertFremd', { zitat: fremd }));

    const plan = this.planBezug(h.plan);
    if (typeof plan === 'string') return verwerfen(plan);
    if (typ === 'pruefen') {
      const vage = this.betrifft('bewusst_vage', stellen, `${titel}\n${erklaerung}`, true);
      if (vage) return verwerfen(m('widerspruchVage', { was: vage }));
    }

    const zitate = stellen.map((s) => s.zitat);
    const schluessel = hinweisSchluessel(typ, zitate);
    if (this.entschieden.has(schluessel)) return { entschieden: schluessel };
    const offen = this.betrifft('offen', stellen, `${titel}\n${erklaerung}`, false) !== null;
    return {
      hinweis: {
        schluessel,
        typ,
        titel,
        zitate,
        erklaerung,
        quelle: 'ki',
        ...(offen ? { offen: true } : {}),
        ...(plan ? { plan } : {}),
        status: 'neu',
      },
    };
  }

  /** F-05: Plan-Bezug des Modells prüfen. Leer → null; ungültig oder bewusst vage → Grund. */
  private planBezug(roh: unknown): Hinweis['plan'] | null | string {
    if (!roh || typeof roh !== 'object') return null;
    const p = roh as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const figurId = s(p.figur);
    const kapitelId = s(p.kapitel);
    const feldRoh = s(p.feld);
    if (!figurId && !kapitelId) return null;
    const bezug: NonNullable<Hinweis['plan']> = {};
    if (figurId) {
      const f = this.kontext.figuren.find((x) => x.id === figurId);
      if (!f) return this.m('planFigurUnbekannt', { figur: figurId });
      if (f.existenz === 'bewusst_vage') return this.m('planVageFigur', { name: f.name });
      bezug.figur = f.id;
      const feld = f.plan.find((x) => x.feld.toLocaleLowerCase('de') === feldRoh.toLocaleLowerCase('de'));
      if (feld) bezug.feld = feld.feld;
    }
    if (kapitelId) {
      const k = this.kapitelZu(kapitelId);
      if (!k) return this.m('planKapitelUnbekannt', { kapitel: kapitelId });
      bezug.kapitel = k.id;
      if (!bezug.feld && feldRoh) bezug.feld = feldRoh;
    }
    return bezug;
  }

  analyse(roh: unknown, aufgabe: Set<Id>, modell: string, datum: string): { analyse: KapitelAnalyse } | Verworfen {
    const verwerfen = (grund: string): Verworfen => ({ grund, roh });
    const m = this.m;
    if (!roh || typeof roh !== 'object') return verwerfen(m('analyseFormat'));
    const a = roh as Record<string, unknown>;
    const k = typeof a.kapitel === 'string' ? this.kapitelZu(a.kapitel) : undefined;
    if (!k) return verwerfen(m('analyseKapitelUnbekannt', { kapitel: String(a.kapitel) }));
    if (!aufgabe.has(k.id)) return verwerfen(m('analyseNichtImAuftrag', { nr: k.nr }));
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const zusammenfassung = s(a.zusammenfassung);
    if (!zusammenfassung) return verwerfen(m('analyseOhneZusammenfassung', { nr: k.nr }));
    const loseEnden: KapitelAnalyse['loseEnden'] = [];
    for (const l of Array.isArray(a.loseEnden) ? (a.loseEnden as Record<string, unknown>[]) : []) {
      const name = s(l?.name);
      const id = loseEndeId(name);
      if (!name || !id || loseEnden.some((x) => x.id === id)) continue;
      loseEnden.push({ id, name, eroeffnet: l?.eroeffnet === true });
    }
    return {
      analyse: {
        kapitel: k.id,
        textHash: k.hash,
        zusammenfassung,
        kurz: s(a.kurz),
        wendung: s(a.wendung),
        antagonistenBezug: s(a.antagonistenBezug),
        loseEnden,
        modell,
        datum,
      },
    };
  }
}

/** Stabiler Slug für lose Enden („»Fiete«“ → „fiete“, „Die Fremde und die Postkarten“ → „die-fremde-und-die-postkarten“). */
export function loseEndeId(name: string): Id {
  return name
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
