/**
 * Antwortprüfung: Zitate (E6, harte Regel 3), Ersatztext (harte Regel 2), bewusst Vages
 * (harte Regel 4), Etikett „offen“, Schlüssel, lose Enden.
 */
import { hinweisSchluessel } from '../index';
import type { Hinweis, HinweisTyp, Id, KapitelAnalyse, Zitat } from '../model/types';
import { ankerFinden, findeZitat, normalisiere, type Bereich } from '../text';
import { KI_HINWEIS_TYPEN } from './anfrage';
import type { BuchKontext, KontextKapitel, KontextRealitaet } from './kontext';

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
];

/** Grund, wenn der Text einen Ersatz- oder Formulierungsvorschlag enthält; sonst null. */
export function ersatztextGrund(text: string): string | null {
  for (const { muster, name } of ERSATZTEXT_MUSTER) {
    if (muster.test(text)) return `Formulierungsvorschlag (${name})`;
  }
  return null;
}

const ZITAT_IN_ERKLAERUNG = /[„"»‚‹]([^„"»«“”‚‘‹›]{3,200})[“”"«‘›]/g;

/** Längere zitierte Passagen in der Erklärung, die weder im Buch noch in der Planung stehen (vermutlich Ersatztext). */
export function fremdesZitat(text: string, kontext: BuchKontext): string | null {
  const planTexte = [
    ...kontext.figuren.flatMap((f) => f.plan.map((p) => p.wert)),
    ...kontext.kapitel.flatMap((k) => [k.plan.szene, k.plan.notiz]),
  ].filter(Boolean);
  for (const m of text.matchAll(ZITAT_IN_ERKLAERUNG)) {
    const inhalt = (m[1] ?? '').trim();
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

const ARTIKEL = /^(der|die|das|ein|eine|einer|eines|den|dem)\s+/i;

/** Wortgrenzen nach E5 (Unicode-Buchstaben), Genitiv-s/Apostroph erlaubt. */
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

const STOPPWOERTER = new Set(
  'aber alle also auch beim dass dann denn diese dieser dieses doch eine einem einen einer eines etwas hier jemand kapitel nach noch nicht oder ohne schon sein seine seiner sich sind soll über unter vorher wann warum weil wenn wer wie wieder wird wurde zwei zweite zweites zweiter erste erster erstes'.split(' '),
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

  constructor(
    readonly kontext: BuchKontext,
    private readonly entschieden: Set<string> = new Set(),
  ) {
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
    if (typeof kapitelAngabe !== 'string' || typeof text !== 'string') return 'Zitat unvollständig';
    const k = this.kapitelZu(kapitelAngabe);
    if (!k) return `Zitat aus unbekanntem Kapitel „${kapitelAngabe}“`;
    const roh = text.trim();
    if (normalisiere(roh).text.replace(/\s/g, '').length < 3) return `Zitat zu kurz („${roh}“)`;
    const bereiche = k.text ? findeZitat(k.text, roh) : [];
    const erster = bereiche[0];
    if (!erster) return `Zitat steht nicht wörtlich in Kap. ${k.nr} „${k.titel}“: „${roh}“`;
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
      if (f.existenz === stufe && nennt(voll, [f.name, ...f.aliase, ...f.formen])) return `Figur „${f.name}“`;
    }
    const zitierte = new Set(stellen.map((s) => s.kapitel.id));
    for (const r of this.kontext.realitaet) {
      if (r.stufe !== stufe) continue;
      const bereich = this.bereichDesAnkers(r);
      if (bereich && r.anker) {
        const anker = r.anker;
        if (stellen.some((s) => s.kapitel.id === anker.kapitel && s.bereiche.some((b) => ueberlappt(b, bereich)))) {
          return `Stelle „${anker.exakt}“`;
        }
      }
      if (!alleKapitel && !zitierte.has(r.kapitel)) continue;
      const wort = kennwortTreffer(voll, kennwoerter(r.text, this.namenKlein));
      if (wort) return `„${r.text}“`;
    }
    return null;
  }

  /** Prüft einen Rohhinweis des Modells. `aufgabe` = Kapitel, die in dieser Anfrage geprüft wurden. */
  hinweis(roh: unknown, aufgabe: Set<Id>): { hinweis: Hinweis } | { entschieden: string } | Verworfen {
    const verwerfen = (grund: string): Verworfen => ({ grund, roh });
    if (!roh || typeof roh !== 'object') return verwerfen('Hinweis hat kein gültiges Format');
    const h = roh as Record<string, unknown>;
    const typ = h.typ as HinweisTyp;
    if (!(KI_HINWEIS_TYPEN as readonly string[]).includes(typ)) return verwerfen(`Unbekannter Hinweis-Typ „${String(h.typ)}“`);
    const titel = typeof h.titel === 'string' ? h.titel.trim() : '';
    const erklaerung = typeof h.erklaerung === 'string' ? h.erklaerung.trim() : '';
    if (!titel) return verwerfen('Hinweis ohne Titel');
    if (!Array.isArray(h.zitate) || h.zitate.length === 0) return verwerfen('Hinweis ohne Zitat');

    const stellen: ZitatStelle[] = [];
    for (const z of h.zitate as unknown[]) {
      const zz = (z ?? {}) as Record<string, unknown>;
      const stelle = this.zitatFinden(zz.kapitel, zz.text);
      if (typeof stelle === 'string') return verwerfen(stelle);
      if (!stellen.some((s) => s.zitat.kapitel === stelle.zitat.kapitel && s.zitat.text === stelle.zitat.text)) stellen.push(stelle);
    }
    if (!stellen.some((s) => aufgabe.has(s.kapitel.id))) return verwerfen('Hinweis betrifft kein geprüftes Kapitel');

    const ersatz = ersatztextGrund(`${titel}\n${erklaerung}`);
    if (ersatz) return verwerfen(ersatz);
    const fremd = fremdesZitat(`${titel}\n${erklaerung}`, this.kontext);
    if (fremd) return verwerfen(`Erklärung zitiert Text, der nicht im Buch steht („${fremd}“)`);

    const plan = this.planBezug(h.plan);
    if (typeof plan === 'string') return verwerfen(plan);
    if (typ === 'pruefen') {
      const vage = this.betrifft('bewusst_vage', stellen, `${titel}\n${erklaerung}`, true);
      if (vage) return verwerfen(`Widerspruch zu bewusst Vagem (${vage})`);
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
      if (!f) return `Plan-Bezug auf unbekannte Figur „${figurId}“`;
      if (f.existenz === 'bewusst_vage') return `Plan-Widerspruch bei bewusst vager Figur „${f.name}“`;
      bezug.figur = f.id;
      const feld = f.plan.find((x) => x.feld.toLocaleLowerCase('de') === feldRoh.toLocaleLowerCase('de'));
      if (feld) bezug.feld = feld.feld;
    }
    if (kapitelId) {
      const k = this.kapitelZu(kapitelId);
      if (!k) return `Plan-Bezug auf unbekanntes Kapitel „${kapitelId}“`;
      bezug.kapitel = k.id;
      if (!bezug.feld && feldRoh) bezug.feld = feldRoh;
    }
    return bezug;
  }

  analyse(roh: unknown, aufgabe: Set<Id>, modell: string, datum: string): { analyse: KapitelAnalyse } | Verworfen {
    const verwerfen = (grund: string): Verworfen => ({ grund, roh });
    if (!roh || typeof roh !== 'object') return verwerfen('Analyse hat kein gültiges Format');
    const a = roh as Record<string, unknown>;
    const k = typeof a.kapitel === 'string' ? this.kapitelZu(a.kapitel) : undefined;
    if (!k) return verwerfen(`Analyse für unbekanntes Kapitel „${String(a.kapitel)}“`);
    if (!aufgabe.has(k.id)) return verwerfen(`Analyse für Kap. ${k.nr} gehört nicht zum Auftrag`);
    const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const zusammenfassung = s(a.zusammenfassung);
    if (!zusammenfassung) return verwerfen(`Analyse für Kap. ${k.nr} ohne Zusammenfassung`);
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
