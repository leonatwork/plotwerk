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

/** grober Wortstamm (Wörter bis vier Buchstaben wie „Ole“ bleiben unverändert) */
function stamm(w: string): string {
  const klein = w.toLocaleLowerCase('de');
  return klein.length <= 4 ? klein : klein.replace(/(es|en|er|e|n|s)$/u, '');
}

export const demoFrage: DemoAntwort = (ctx, anfrage) => {
  const f = anfrage.attribute.frage ?? '';
  if (/^(bitte\s+)?(schreib|formulier)|\b(schreib|formulier)\w*\s+(mir|du)\b/iu.test(f)) {
    return { imBuch: false, antwort: 'Ich schreibe keinen Text für das Buch.', belege: [] };
  }
  const alle = ctx.kapitel.flatMap((k) => saetze(k.text).map((s) => ({ k, s, klein: s.toLocaleLowerCase('de') })));
  const begriffe = [...new Set(f.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOPP.has(w.toLocaleLowerCase('de'))).map(stamm))].filter(
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
  if (treffer.length === 0) return { imBuch: false, antwort: 'Dazu steht im Buch nichts.', belege: [] };
  const kapitel = [...new Map(treffer.map((t) => [t.k.id, t.k])).values()];
  const wo = kapitel.map((k) => `Kap. ${k.nr} (${k.titel})`).join(', ');
  return {
    imBuch: true,
    antwort: treffer.length === 1 ? `Eine Stelle: ${wo}.` : `${treffer.length} Stellen in ${kapitel.length === 1 ? 'einem Kapitel' : `${kapitel.length} Kapiteln`}: ${wo}.`,
    belege: [
      ...treffer.map((t) => ({ kapitel: t.k.id, text: t.s })),
      // absichtlich ungültig: wird einzeln verworfen, die Antwort bleibt
      { kapitel: treffer[0]!.k.id, text: 'eine Stelle, die es so nicht gibt' },
    ],
  };
};

