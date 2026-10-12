/**
 * Demo-Antwort für die Aufgabe „frage“ (G6 Fragen an das Buch). Besitzer: G6 KI-Leser.
 * Registriert in ../demoAntworten/leser.ts.
 *
 * Sucht seltene Wörter der Frage in den Sätzen des mitgeschickten Buchs und belegt die Antwort mit diesen Sätzen
 * (wörtliche Ausschnitte der Fixture-Kapitel). Absichtlich enthalten: ein Beleg, der nicht im Buch steht – er wird
 * einzeln verworfen, die Antwort bleibt. Schreibaufträge beantwortet die Demo wie das Modell mit einer Absage.
 */
import type { DemoAntwort } from '../demoAntworten/typen';
import { saetze } from './leser';

const STOPP = new Set(
  'wo wann wer was wie warum wieso weshalb welche welcher welches erwähne erwähnt erwähnen kommt kommen vor ich mein meine meinen gibt steht stehen buch kapitel stelle stellen eigentlich zum ersten mal der die das den dem des ein eine einen einem und oder mit von bei für ist sind hat haben wird im in am an auf aus über nach noch schon nicht'.split(
    ' ',
  ),
);

const STOPP_EN = new Set(
  'where when who what how why which do does did i my me mention mentions mentioned appear appears first time is are was were the a an and or of in on at to for from with by about book chapter passage passages there it its this that still not'.split(
    ' ',
  ),
);

/** grober Wortstamm (Wörter bis vier Buchstaben wie „Ole“ bleiben unverändert) */
function stamm(w: string, englisch = false): string {
  const klein = w.toLocaleLowerCase('de');
  return klein.length <= 4 ? klein : klein.replace(englisch ? /(es|s)$/u : /(es|en|er|e|n|s)$/u, '');
}

const TEXTE = {
  de: {
    stopp: STOPP,
    schreibauftrag: /^(bitte\s+)?(schreib|formulier)|\b(schreib|formulier)\w*\s+(mir|du)\b/iu,
    keinText: 'Ich schreibe keinen Text für das Buch.',
    nichts: 'Dazu steht im Buch nichts.',
    kap: (nr: number, titel: string) => `Kap. ${nr} (${titel})`,
    eine: (wo: string) => `Eine Stelle: ${wo}.`,
    mehrere: (n: number, kapitel: number, wo: string) => `${n} Stellen in ${kapitel === 1 ? 'einem Kapitel' : `${kapitel} Kapiteln`}: ${wo}.`,
    erfunden: 'eine Stelle, die es so nicht gibt',
  },
  en: {
    stopp: STOPP_EN,
    schreibauftrag: /^(please\s+)?(write|rewrite|phrase|rephrase|reword)\b|\b(write|rewrite)\w*\s+(me|for me)\b/iu,
    keinText: 'I don’t write text for the book.',
    nichts: 'There is nothing about this in the book.',
    kap: (nr: number, titel: string) => `Ch. ${nr} (${titel})`,
    eine: (wo: string) => `One passage: ${wo}.`,
    mehrere: (n: number, kapitel: number, wo: string) => `${n} passages in ${kapitel === 1 ? 'one chapter' : `${kapitel} chapters`}: ${wo}.`,
    erfunden: 'a passage that doesn’t exist',
  },
};

export const demoFrage: DemoAntwort = (ctx, anfrage) => {
  const englisch = ctx.sprache === 'en';
  const T = TEXTE[englisch ? 'en' : 'de'];
  const f = anfrage.attribute.frage ?? '';
  if (T.schreibauftrag.test(f)) {
    return { imBuch: false, antwort: T.keinText, belege: [] };
  }
  const alle = ctx.kapitel.flatMap((k) => saetze(k.text).map((s) => ({ k, s, klein: s.toLocaleLowerCase('de') })));
  const begriffe = [...new Set(f.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !T.stopp.has(w.toLocaleLowerCase('de'))).map((w) => stamm(w, englisch)))].filter(
    (w) => w.length >= 3,
  );
  // häufige Wörter (z. B. Hauptfigur) tragen nichts zur Suche bei
  const anzahl = (w: string) => alle.filter((x) => new RegExp(`(?<![\\p{L}])${w}`, 'u').test(x.klein)).length;
  const grenze = Math.max(2, alle.length * 0.2);
  const selten = begriffe.filter((w) => {
    const n = anzahl(w);
    // Genitiv kurzer Namen („Oles“): zählt wie der Name selbst
    const basis = w.length <= 4 && w.endsWith('s') ? anzahl(w.slice(0, -1)) : 0;
    return n > 0 && n <= grenze && basis <= grenze;
  });
  const treffer = alle.filter((x) => selten.some((w) => new RegExp(`(?<![\\p{L}])${w}`, 'u').test(x.klein))).slice(0, 6);
  if (treffer.length === 0) return { imBuch: false, antwort: T.nichts, belege: [] };
  const kapitel = [...new Map(treffer.map((t) => [t.k.id, t.k])).values()];
  const wo = kapitel.map((k) => T.kap(k.nr, k.titel)).join(', ');
  return {
    imBuch: true,
    antwort: treffer.length === 1 ? T.eine(wo) : T.mehrere(treffer.length, kapitel.length, wo),
    belege: [
      ...treffer.map((t) => ({ kapitel: t.k.id, text: t.s })),
      // absichtlich ungültig: wird einzeln verworfen, die Antwort bleibt
      { kapitel: treffer[0]!.k.id, text: T.erfunden },
    ],
  };
};

