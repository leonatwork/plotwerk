/**
 * KI-Aufgabe Figurenstimme (G3): Hinweise, wenn eine Figur auffällig anders klingt – nur Beobachtung mit Zitaten.
 * Besitzer: G3 Figuren. Nutzt fuehreAufgabeAus/AufgabenDefinition aus ./aufgabe. Nur ProjektLeser und KiTransport.
 *
 * Ablauf: ganzes Buch als gecachter Prefix (Allowlist E12), Aufgabe „stimme“ für genau eine Figur. Die Antwort
 * nennt je Beobachtung die auffällige(n) Stelle(n) und typische Vergleichsstellen – beide wörtlich (E6).
 * Verworfen wird: ohne Zitat oder Vergleich, Vergleich = dieselbe Stelle, Formulierungsvorschläge (harte Regel 2),
 * bei bewusst vagen Figuren alles, was das Modell nicht als deutlich einstuft (nur mit Vorsicht).
 * Schreibt nichts – gespeichert wird im Store (.plotwerk/stimmen.json).
 */
import type { Id, KiEinstellungen, StimmenBeobachtung, Zitat } from '../model/types';
import type { ProjektLeser } from '../projekt/fs';
import { zitatKern } from '../text';
import type { KiRolle } from './anfrage';
import { KiFehler } from './antwort';
import {
  fuehreAufgabeAus,
  schaetzeAufgabe,
  type AufgabenDefinition,
  type AufgabenErgebnis,
  type AufgabenOptionen,
  type AufgabenPruefung,
} from './aufgabe';
import type { KiTransport, Schaetzung } from './index';
import type { BuchKontext, KontextFigur } from './kontext';
import { meldungenIn } from './meldungen';
import { redestellen, redestellenDerFigur, type Redestelle } from './stimmeRede';
import { ANTWORTSPRACHE_EN, kapKurz, zitiert, type Sprache } from './sprache';

export { redestellen, redestellenDerFigur, redestellenImKapitel, type RedeFigur, type Redestelle } from './stimmeRede';

/** Kennung im Aufgabenkopf (<aufgabe art="stimme" figur="…">); Demo-Antworten sind unter diesem Schlüssel registriert. */
export const STIMME_ART = 'stimme';

/** Unter so vielen Redestellen gibt es keine „typische“ Stimme. */
export const STIMME_MIN_REDE = 3;

export interface StimmenAuftrag {
  figur: Id;
  /** Opus statt Sonnet */
  tiefencheck?: boolean;
}

export interface StimmenErgebnis {
  figur: Id;
  /** geprüfte Beobachtungen (Status „neu“) */
  beobachtungen: StimmenBeobachtung[];
  /** Das Modell meldet: zu wenig Rede für einen Vergleich */
  zuWenigRede: boolean;
  /** lokal gefundene Redestellen, die zur Figur gehören könnten */
  redestellen: number;
  /** Figur ist bewusst vage (nur deutliche Auffälligkeiten wurden behalten) */
  vage: boolean;
}

export const SYSTEM_STIMME = `Du bist Lektorats-Leser für ein deutschsprachiges Romanmanuskript. Du liest das Buch so, wie eine Leserin es liest: den Text der Kapitel in ihrer Reihenfolge und die wenigen Angaben des Autors zu Figuren, Orten, Gruppen und Realitätsebenen. Dazu kommt die Planung des Autors (Zeilen „Planung“ bei Figuren, <plan> bei Kapiteln); sie gehört nicht zum Buch.

Deine Aufgabe ist, auf die Stimme einer Figur zu achten: wie sie spricht und schreibt (Ton, Wortwahl, Anrede, Satzbau). Du meldest Stellen, an denen sie auffällig anders klingt als sonst, und belegst das mit wörtlichen Zitaten der auffälligen und der typischen Stellen.

Du schreibst nie Text für das Buch: keine Umformulierungen, keine Ersatzsätze, keine Formulierungsvorschläge, keine Korrekturen, auch nicht als Beispiel. Ob eine Abweichung gewollt ist und ob die Stelle geändert wird, entscheidet allein der Autor.

Regeln:
- Jedes Zitat ist eine zusammenhängende Passage aus dem Kapitel, das du unter "kapitel" mit seiner id angibst, Zeichen für Zeichen aus dem <text> kopiert, ohne Auslassungen, höchstens ein Satz.
- Die Erklärung beschreibt nur die Beobachtung: was ist an der Stelle anders als sonst, und woran erkennt man es.
- Als „bewusst vage“ markierte Figuren sind absichtlich mehrdeutig; ein Bruch in ihrer Stimme kann gewollt sein. Melde bei ihnen nur sehr deutliche Auffälligkeiten.
- Lieber keine Beobachtung als eine unsichere. Geschmacksfragen sind keine Beobachtungen.`;

/** Englische Fassung (Buchsprache en). */
export const SYSTEM_STIMME_EN = `You are an editorial reader for an English-language novel. You read the book the way a reader does: the text of the chapters in their order and the author's few notes on characters, places, groups and levels of reality. In addition there is the author's planning (lines “Plan” for characters, <plan> for chapters); it is not part of the book.

Your task is to pay attention to the voice of one character: how they speak and write (tone, choice of words, forms of address, sentence structure). You report passages where they sound noticeably different from usual, and support this with verbatim quotes of the striking and of the typical passages.

You never write text for the book: no rewordings, no replacement sentences, no suggested phrasings, no corrections, not even as an example. Whether a deviation is intended and whether the passage is changed is decided by the author alone.

Rules:
- Every quote is one continuous passage from the chapter you name under "kapitel" with its id, copied character for character from the <text>, without omissions, at most one sentence.
- The explanation only describes the observation: what is different at this passage from usual, and how it can be recognised.
- Characters marked “deliberately vague” are intentionally ambiguous; a break in their voice may be intended. For them, report only very clear irregularities.
- Better no observation than an uncertain one. Matters of taste are not observations.

${ANTWORTSPRACHE_EN}`;

/** Stabiler Schlüssel „stimme:<figur>|<kapitel>/<zitatkern>|…“ aus den auffälligen Zitaten (Reihenfolge egal). */
export function stimmenSchluessel(figur: Id, zitate: Zitat[]): string {
  const teile = [...new Set(zitate.map((z) => `${z.kapitel}/${zitatKern(z.text)}`))].sort();
  return `stimme:${figur}|${teile.join('|')}`;
}

function figurZeileEn(f: KontextFigur): string {
  const teile = [`${f.name} (id: ${f.id})`, f.rolle === 'haupt' ? 'main character' : 'minor character'];
  if (f.aliase.length) teile.push(`also called: ${f.aliase.join(', ')}`);
  if (f.existenz === 'bewusst_vage') teile.push('deliberately vague');
  else if (f.existenz === 'offen') teile.push('existence still open');
  return teile.join(' · ');
}

function figurZeile(f: KontextFigur): string {
  const teile = [`${f.name} (id: ${f.id})`, f.rolle === 'haupt' ? 'Hauptfigur' : 'Nebenfigur'];
  if (f.aliase.length) teile.push(`auch genannt: ${f.aliase.join(', ')}`);
  if (f.existenz === 'bewusst_vage') teile.push('bewusst vage');
  else if (f.existenz === 'offen') teile.push('Existenz noch offen');
  return teile.join(' · ');
}

/** Redestellen der Figur aus dem Kontext (Kapiteltexte, Namen, Aliase, Wortformen). */
export function redestellenAusKontext(kontext: BuchKontext, figur: Id): { stellen: Redestelle[]; ich: Redestelle[] } {
  const figuren = kontext.figuren.map((f) => ({ id: f.id, namen: [f.name, ...f.aliase, ...f.formen] }));
  const alle = redestellen(kontext.kapitel, figuren);
  return {
    stellen: redestellenDerFigur(alle, figur),
    ich: alle.filter((r) => r.ich && !r.sprecher.includes(figur)),
  };
}

const kurz = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

function aufgabenTextEn(f: KontextFigur, stellen: Redestelle[], ich: Redestelle[], zeile: (r: Redestelle) => string): string {
  const z: string[] = [];
  z.push(`Character: ${figurZeileEn(f)}`);
  z.push('');
  z.push(
    `Read all passages in the whole book where ${f.name} speaks or writes themselves (direct speech, messages, notes). If ${f.name} narrates a chapter in the first person, the speech of the first-person narrator belongs to it as well.`,
  );
  z.push(
    `Report only passages where ${f.name} sounds noticeably different from the other passages: tone (terse instead of detailed, formal instead of casual, cold instead of warm), choice of words (jargon, slang, foreign words, coarse words), forms of address (first name or surname, titles, nicknames, terms of endearment), sentence structure, dialect or register.`,
  );
  z.push('For each observation:');
  z.push('- titel: a short, neutral description of the irregularity (at most eight words)');
  z.push(`- erklaerung: what is different at this passage from usual – only the observation, no suggestion of how ${f.name} could speak there`);
  z.push('- zitate: the striking passage (one or two quotes, verbatim)');
  z.push(`- vergleich: one to three other passages where ${f.name} sounds typical (verbatim, not the same passage)`);
  z.push('- deutlich: true if the deviation is clearly noticeable when reading; false for a slight tendency');
  z.push('You may report a gradual change over several chapters once if it stands out; the author decides whether it is intended (e.g. as the character’s development).');
  z.push(
    `If ${f.name} speaks too little to recognise a typical voice (fewer than ${STIMME_MIN_REDE} passages of speech), return no observations and set zuWenigRede to true; otherwise false.`,
  );
  if (f.existenz === 'bewusst_vage') {
    z.push('');
    z.push(
      `${f.name} is deliberately vague. Breaks in tone and voice may be part of the ambiguity. Report only very clear irregularities (deutlich: true) and explain them cautiously, without settling who ${f.name} really is.`,
    );
  }
  z.push('');
  z.push('Passages of speech the app found locally (assignment uncertain, for orientation only; the text is what counts):');
  if (stellen.length === 0) z.push('- (no reliably assigned speech found)');
  for (const r of stellen.slice(0, 60)) z.push(zeile(r));
  if (ich.length > 0) {
    z.push('Speech of a first-person narrator (only relevant if the character narrates there):');
    for (const r of ich.slice(0, 20)) z.push(zeile(r));
  }
  return z.join('\n');
}

function aufgabenText(kontext: BuchKontext, f: KontextFigur): string {
  const nr = new Map(kontext.kapitel.map((k) => [k.id, k]));
  const { stellen, ich } = redestellenAusKontext(kontext, f.id);
  const zeile = (r: Redestelle) => {
    const k = nr.get(r.kapitel);
    return `- ${kapKurz(k?.nr ?? '?', kontext.sprache)} (id: ${r.kapitel}): ${zitiert(kurz(r.text), kontext.sprache)}`;
  };
  if (kontext.sprache === 'en') return aufgabenTextEn(f, stellen, ich, zeile);
  const z: string[] = [];
  z.push(`Figur: ${figurZeile(f)}`);
  z.push('');
  z.push(
    `Lies alle Stellen, an denen ${f.name} selbst spricht oder schreibt (wörtliche Rede, Nachrichten, Briefe), im ganzen Buch. Erzählt ${f.name} ein Kapitel in der Ich-Form, gehört auch die Rede des Ich-Erzählers dazu.`,
  );
  z.push(
    `Melde nur Stellen, an denen ${f.name} auffällig anders klingt als an den übrigen Stellen: Ton (knapp statt ausführlich, förmlich statt locker, kühl statt herzlich), Wortwahl (Fachsprache, Jugendsprache, Anglizismen, derbe Wörter), Anrede (du oder Sie, groß- oder kleingeschriebene Anrede, Spitznamen), Satzbau.`,
  );
  z.push('Für jede Beobachtung:');
  z.push('- titel: kurze, neutrale Beschreibung der Auffälligkeit (höchstens acht Wörter)');
  z.push(`- erklaerung: was an der Stelle anders ist als sonst – nur die Beobachtung, kein Vorschlag, wie ${f.name} dort sprechen könnte`);
  z.push('- zitate: die auffällige Stelle (ein bis zwei Zitate, wörtlich)');
  z.push(`- vergleich: ein bis drei andere Stellen, an denen ${f.name} typisch klingt (wörtlich, nicht dieselbe Stelle)`);
  z.push('- deutlich: true, wenn die Abweichung beim Lesen klar auffällt; false bei einer leichten Tendenz');
  z.push(
    `Eine allmähliche Veränderung über mehrere Kapitel darfst du einmal melden, wenn sie auffällt; der Autor entscheidet, ob sie gewollt ist (z. B. als Entwicklung der Figur).`,
  );
  z.push(
    `Spricht ${f.name} zu wenig, um eine typische Stimme zu erkennen (weniger als ${STIMME_MIN_REDE} Redestellen), gib keine Beobachtungen zurück und setze zuWenigRede auf true; sonst false.`,
  );
  if (f.existenz === 'bewusst_vage') {
    z.push('');
    z.push(
      `${f.name} ist bewusst vage angelegt. Brüche in Ton und Stimme können zur Mehrdeutigkeit gehören. Melde nur sehr deutliche Auffälligkeiten (deutlich: true) und erkläre sie vorsichtig, ohne festzulegen, wer ${f.name} wirklich ist.`,
    );
  }
  z.push('');
  z.push('Redestellen, die die App lokal gefunden hat (Zuordnung unsicher, nur zur Orientierung; maßgeblich ist der Text):');
  if (stellen.length === 0) z.push('- (keine sicher zugeordnete Rede gefunden)');
  for (const r of stellen.slice(0, 60)) z.push(zeile(r));
  if (ich.length > 0) {
    z.push('Rede eines Ich-Erzählers (nur relevant, falls die Figur dort erzählt):');
    for (const r of ich.slice(0, 20)) z.push(zeile(r));
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
export function stimmeSchema(kontext: BuchKontext): Record<string, unknown> {
  const kapitel = { type: 'string', enum: kontext.kapitel.filter((k) => k.text.trim()).map((k) => k.id) };
  const zitate = { type: 'array', items: obj({ kapitel, text: { type: 'string' } }) };
  return obj({
    zuWenigRede: { type: 'boolean' },
    beobachtungen: {
      type: 'array',
      items: obj({
        titel: { type: 'string' },
        erklaerung: { type: 'string' },
        deutlich: { type: 'boolean' },
        zitate,
        vergleich: zitate,
      }),
    },
  });
}

function ueberlappt(a: Zitat, b: Zitat): boolean {
  if (a.kapitel !== b.kapitel) return false;
  const x = zitatKern(a.text);
  const y = zitatKern(b.text);
  return x === y || x.includes(y) || y.includes(x);
}

/** Antwort auswerten (auch einzeln testbar). */
export function werteStimmeAus(daten: unknown, p: AufgabenPruefung, figur: Id): StimmenErgebnis {
  const f = p.kontext.figuren.find((x) => x.id === figur);
  const vage = f?.existenz === 'bewusst_vage';
  const anzahl = f ? redestellenAusKontext(p.kontext, figur).stellen.length : 0;
  const ergebnis: StimmenErgebnis = { figur, beobachtungen: [], zuWenigRede: false, redestellen: anzahl, vage };
  const m = meldungenIn(p.oberflaeche);
  const d = (daten ?? {}) as Record<string, unknown>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.beobachtungen)) {
    p.verwerfen(m('schemaFalsch'), daten);
    return ergebnis;
  }
  ergebnis.zuWenigRede = d.zuWenigRede === true;
  const reihe = new Map(p.kontext.kapitel.map((k, i) => [k.id, i]));
  const gesehen = new Set<string>();
  for (const roh of d.beobachtungen) {
    const b = (roh ?? {}) as Record<string, unknown>;
    const titel = p.text(b.titel, roh, { pflicht: true });
    const erklaerung = p.text(b.erklaerung, roh, { pflicht: true });
    if (titel === null || erklaerung === null) continue;
    const zitate = p.zitate(b.zitate, roh);
    if (!zitate) continue;
    const vergleichRoh = p.zitate(b.vergleich, roh);
    if (!vergleichRoh) continue;
    const vergleich = vergleichRoh.filter((v) => !zitate.some((z) => ueberlappt(z, v)));
    if (vergleich.length === 0) {
      p.verwerfen(m('vergleichGleicheStelle'), roh);
      continue;
    }
    if (vage && b.deutlich !== true) {
      p.verwerfen(m('vageFigurNurDeutlich', { name: f?.name ?? figur }), roh);
      continue;
    }
    const schluessel = stimmenSchluessel(figur, zitate);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.beobachtungen.push({
      schluessel,
      figur,
      kapitel: zitate[0]!.kapitel,
      titel,
      erklaerung,
      zitate,
      vergleich,
      status: 'neu',
    });
  }
  ergebnis.beobachtungen.sort((a, b) => (reihe.get(a.kapitel) ?? 0) - (reihe.get(b.kapitel) ?? 0));
  return ergebnis;
}

/** Aufgabendefinition „Figurenstimme prüfen“ für genau eine Figur. */
export function stimmeDefinition(auftrag: StimmenAuftrag): AufgabenDefinition<StimmenErgebnis> {
  const rolle: KiRolle = auftrag.tiefencheck ? 'tiefencheck' : 'pruefung';
  return {
    name: 'Figurenstimme',
    nameEn: meldungenIn('en')('nameStimme'),
    art: STIMME_ART,
    attribute: { figur: auftrag.figur },
    rolle,
    system: SYSTEM_STIMME,
    systemEn: SYSTEM_STIMME_EN,
    ausgabeSchaetzung: auftrag.tiefencheck ? 6000 : 3000,
    aufgabe(kontext, oberflaeche) {
      const f = kontext.figuren.find((x) => x.id === auftrag.figur);
      if (!f) throw new KiFehler('auftrag', meldungenIn(oberflaeche)('figurFehlt', { figur: auftrag.figur }));
      return aufgabenText(kontext, f);
    },
    schema: stimmeSchema,
    auswerten: (daten, p) => werteStimmeAus(daten, p, auftrag.figur),
  };
}

/** Prüft die Stimme einer Figur (eine Anfrage). Schreibt nichts. */
export function pruefeStimme(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: StimmenAuftrag,
  optionen: AufgabenOptionen = {},
): Promise<AufgabenErgebnis<StimmenErgebnis>> {
  return fuehreAufgabeAus(leser, transport, einstellungen, stimmeDefinition(auftrag), optionen);
}

/** Schätzung vor dem Start (Tokens, Kosten). */
export function schaetzeStimme(
  leser: ProjektLeser,
  transport: KiTransport,
  einstellungen: KiEinstellungen | undefined,
  auftrag: StimmenAuftrag,
  oberflaeche: Sprache = 'de',
): Promise<Schaetzung> {
  return schaetzeAufgabe(leser, transport, einstellungen, stimmeDefinition(auftrag), oberflaeche);
}
