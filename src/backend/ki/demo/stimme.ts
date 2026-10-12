/**
 * Demo-Antwort für die Aufgabe „stimme“ (G3 Figurenstimme). Besitzer: G3 Figuren.
 * Registriert in ../demoAntworten/figuren.ts. Alle echten Zitate sind wörtliche Ausschnitte der Fixture-Kapitel;
 * sie werden nur geliefert, wenn sie im mitgeschickten Kontext stehen (sonst fällt die Beobachtung weg).
 * Absichtlich enthalten: ein erfundenes Zitat, ein Formulierungsvorschlag und eine leichte Tendenz bei einer
 * bewusst vagen Figur – die Auswertung in core/ki/stimme.ts muss alle drei verwerfen.
 */
import type { DemoAntwort } from '../demoAntworten/typen';

interface Zitat {
  kapitel: string;
  text: string;
}

interface Beobachtung {
  titel: string;
  erklaerung: string;
  deutlich: boolean;
  zitate: Zitat[];
  vergleich: Zitat[];
  /** absichtlich ungültig (Test der Antwortprüfung) – wird ohne Fundprüfung geliefert */
  ungueltig?: boolean;
}

const z = (kapitel: string, text: string): Zitat => ({ kapitel, text });

const BEOBACHTUNGEN: Record<string, Beobachtung[]> = {
  paul: [
    {
      titel: 'Paul antwortet nur mit einer Zahl',
      erklaerung:
        'Sonst erklärt Paul ausführlich und anschaulich, was er tut. Im Kornspeicher antwortet er dem Wachmann nur mit der Zahl der Fenster, ohne aufzusehen; der Ton wirkt abwesend und mechanisch.',
      deutlich: true,
      zitate: [z('staub', 'Paul sieht nicht vom Zollstock auf und sagt nur: „Achtzehn auf jeder Seite.“')],
      vergleich: [z('grundriss', 'Ein Haus muss man in die Hand nehmen können, sagt er.')],
    },
    {
      titel: 'Großgeschriebene Anrede gegenüber Vera',
      erklaerung:
        'Gegenüber Vera schreibt Paul die Anrede groß wie in einem förmlichen Brief. In seiner Nachricht an Lotte ist die Anrede klein und der Ton knapp und locker.',
      deutlich: false,
      zitate: [z('ebbe', 'er verspricht: „Ich melde mich bei Dir!“')],
      vergleich: [z('lotte', '„Bestell dir schon mal was, ich beeil mich.“')],
    },
    {
      titel: 'Paul verspricht einen Anruf',
      erklaerung: 'Paul klingt hier ungewohnt verbindlich.',
      deutlich: true,
      zitate: [z('funkstille', 'Paul sagt: „Ich ruf dich morgen an, versprochen.“')],
      vergleich: [z('grundriss', 'Ein Haus muss man in die Hand nehmen können, sagt er.')],
      ungueltig: true,
    },
    {
      titel: 'Knapper Satz an der Brücke',
      erklaerung: 'Besser wäre hier ein vollständiger Satz, wie Paul ihn sonst spricht.',
      deutlich: false,
      zitate: [z('lotte', '„Bestell dir schon mal was, ich beeil mich.“')],
      vergleich: [z('grundriss', 'Ein Haus muss man in die Hand nehmen können, sagt er.')],
      ungueltig: true,
    },
  ],
  'die-fremde': [
    {
      titel: 'Vom Gruß zum Vorwurf',
      erklaerung:
        'Die erste Postkarte klingt freundlich und lässt alles offen, die zweite spricht Paul direkt und vorwurfsvoll an. Ob beide Postkarten von derselben Person stammen, lässt der Text offen.',
      deutlich: true,
      zitate: [z('funkstille', '„Warum bist du nicht gekommen?“')],
      vergleich: [z('bis-bald', 'Auf der Vorderseite der Postkarte ist der alte Leuchtturm zu sehen, auf der Rückseite steht in blauer Tinte „Bis bald“.')],
    },
    {
      titel: 'Kürzere Sätze auf der zweiten Postkarte',
      erklaerung: 'Leichte Tendenz zu kürzeren Sätzen.',
      deutlich: false,
      zitate: [z('funkstille', '„Warum bist du nicht gekommen?“')],
      vergleich: [z('bis-bald', 'Auf der Vorderseite der Postkarte ist der alte Leuchtturm zu sehen, auf der Rückseite steht in blauer Tinte „Bis bald“.')],
      ungueltig: true,
    },
  ],
  konrad: [
    {
      titel: 'Konrad wird knapp und bestimmt',
      erklaerung:
        'Konrad gibt in der Besprechung sonst nur weiter, was andere wollen, im Konjunktiv und vorsichtig. Zum Schluss setzt er selbst eine Frist; der Ton wird knapp und bestimmt.',
      deutlich: false,
      zitate: [z('fassade', 'Konrad will die neuen Zeichnungen bis Monatsende sehen.')],
      vergleich: [z('fassade', 'Zwölf Millionen seien so gut wie unterschrieben, sagt Konrad, aber nur mit der Glasfassade.')],
    },
  ],
};

export const demoStimme: DemoAntwort = (ctx, anfrage) => {
  const figur = anfrage.attribute.figur ?? '';
  const steht = (q: Zitat) => !!ctx.kapitel.find((k) => k.id === q.kapitel)?.text.includes(q.text);
  const liste = (BEOBACHTUNGEN[figur] ?? []).filter((b) => b.ungueltig || [...b.zitate, ...b.vergleich].every(steht));
  return {
    zuWenigRede: liste.length === 0,
    beobachtungen: liste.map(({ titel, erklaerung, deutlich, zitate, vergleich }) => ({ titel, erklaerung, deutlich, zitate, vergleich })),
  };
};
