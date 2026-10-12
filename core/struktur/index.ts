/**
 * Lokale Struktur-Hinweise ohne KI (E10). Besitzer: Kernlogik.
 *
 * - Kapitel ohne Text → „Kap. N ohne Text“. AUSNAHME von „jeder Hinweis hat ein Zitat“: Es gibt keinen
 *   Text, der zitiert werden könnte, deshalb `zitate: []`. Das gilt nur für Struktur-Hinweise.
 * - Kapitel endet mitten im Satz → Zitat = die letzten 3–6 Wörter wörtlich.
 * - Mehrere Leerzeichen hintereinander → Zitat = die Stelle mit den Nachbarwörtern.
 * - Leere Überschrift im Markdown („#“ ohne Text) → Zitat = die letzten Wörter davor (sonst die ersten danach).
 * - Kapitel ohne Titel → Zitat = die ersten Wörter des Kapitels.
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Hinweis, Id, ProjektDaten, Zitat } from '../model/types';
import { absaetze, bloecke, zitatSchluessel } from '../text';

/** Titel und Erklärungen in der Oberflächensprache; die Schlüssel hängen nie von der Sprache ab. */
const T = texteJe(
  {
    nr: 'Kap. {n}',
    ohneText: '{nr} ohne Text',
    ohneTextErklaerung: 'Das Kapitel »{titel}« ist angelegt, hat aber noch keinen Text.',
    ohneTitel: '{nr} ohne Überschrift',
    ohneTitelErklaerung: 'Das Kapitel hat keinen Titel.',
    satzende: '{nr} endet mitten im Satz',
    satzendeErklaerung: 'Der letzte Satz von »{titel}« hat kein Satzzeichen am Ende: »… {zitat}«.',
    leerzeichen: 'Doppelte Leerzeichen in {nr}',
    leerzeichenErklaerung: {
      one: 'An einer Stelle stehen mehrere Leerzeichen hintereinander.',
      other: 'An {n} Stellen stehen mehrere Leerzeichen hintereinander.',
    },
    leereUeberschriftEnde: 'Leere Überschrift am Ende von {nr}',
    leereUeberschrift: 'Leere Überschrift in {nr}',
    leereUeberschriftEndeErklaerung: 'Am Ende des Kapitels steht eine Überschrift ohne Text (etwa aus dem Word-Import).',
    leereUeberschriftErklaerung: 'Im Kapitel steht eine Überschrift ohne Text (etwa aus dem Word-Import).',
  },
  {
    nr: 'Ch. {n}',
    ohneText: '{nr} has no text',
    ohneTextErklaerung: 'The chapter “{titel}” exists but has no text yet.',
    ohneTitel: '{nr} has no heading',
    ohneTitelErklaerung: 'The chapter has no title.',
    satzende: '{nr} ends mid-sentence',
    satzendeErklaerung: 'The last sentence of “{titel}” has no closing punctuation: “… {zitat}”.',
    leerzeichen: 'Double spaces in {nr}',
    leerzeichenErklaerung: {
      one: 'In one place there are several spaces in a row.',
      other: 'In {n} places there are several spaces in a row.',
    },
    leereUeberschriftEnde: 'Empty heading at the end of {nr}',
    leereUeberschrift: 'Empty heading in {nr}',
    leereUeberschriftEndeErklaerung: 'The chapter ends with a heading that has no text (for example from a Word import).',
    leereUeberschriftErklaerung: 'The chapter contains a heading without text (for example from a Word import).',
  },
);

const SATZENDE = /[.!?…»«“”„’‘"')\]–—›‹]$/u;
const KLAUSELENDE = /[,;:–—.!?…]["“”»«’‘)]*$/u;
const MAX_STELLEN = 3;

function hinweis(art: string, kapitel: Id, titel: string, erklaerung: string, zitate: Zitat[]): Hinweis {
  const basis = zitate.length ? zitatSchluessel('struktur', zitate) : `struktur:${kapitel}`;
  return { schluessel: `${basis}#${art}`, typ: 'struktur', titel, zitate, erklaerung, quelle: 'lokal', status: 'neu' };
}

/** Die letzten 3–6 Wörter eines Absatzes, wörtlich; an einer Satzgrenze (Komma, Strich …) wird gekürzt. */
export function letzteWoerter(text: string): string {
  const t = text.trimEnd();
  const woerter = [...t.matchAll(/\S+/g)];
  if (!woerter.length) return '';
  let erstes = Math.max(0, woerter.length - 6);
  for (let i = erstes; i < woerter.length - 3; i++) if (KLAUSELENDE.test(woerter[i]![0])) erstes = i + 1;
  return t.slice(woerter[erstes]!.index);
}

/** Die ersten 3–6 Wörter eines Absatzes, wörtlich (bis zum ersten Satzzeichen, sofern ≥ 3 Wörter). */
export function ersteWoerter(text: string): string {
  const t = text.trimStart();
  const woerter = [...t.matchAll(/\S+/g)].slice(0, 6);
  if (!woerter.length) return '';
  let letztes = woerter.length - 1;
  for (let i = 2; i < woerter.length; i++)
    if (/[,;:.!?…–—]$/u.test(woerter[i]![0])) {
      letztes = i;
      break;
    }
  const w = woerter[letztes]!;
  return t.slice(0, w.index + w[0].length).replace(/[,;:–—]$/u, '');
}

function kapitelReihenfolge(daten: ProjektDaten): Id[] {
  const reihe = [...(daten.projekt?.kapitel ?? [])];
  for (const id of Object.keys(daten.kapitel ?? {})) if (!reihe.includes(id)) reihe.push(id);
  return reihe;
}

export function strukturHinweise(daten: ProjektDaten, sprache: Sprache = 'de'): Hinweis[] {
  const t = T(sprache);
  const ergebnis: Hinweis[] = [];
  const reihe = kapitelReihenfolge(daten);
  reihe.forEach((id, i) => {
    const nr = fmt(t.nr, { n: i + 1 });
    const kapitel = daten.kapitel?.[id];
    const titel = kapitel?.titel ?? daten.plaene?.[id]?.titel ?? id;
    const markdown = kapitel?.text ?? '';
    const abs = absaetze(markdown);

    if (!abs.length) {
      ergebnis.push(
        hinweis('ohne-text', id, fmt(t.ohneText, { nr }), fmt(t.ohneTextErklaerung, { titel: titel || id }), []),
      );
      return;
    }

    if (kapitel && !kapitel.titel.trim())
      ergebnis.push(
        hinweis('ohne-titel', id, fmt(t.ohneTitel, { nr }), t.ohneTitelErklaerung, [{ kapitel: id, text: ersteWoerter(abs[0]!.text) }]),
      );

    // Satzende: nur wenn der letzte Block ein Absatz ist (nicht Überschrift, Szenentrenner, Code)
    const bl = bloecke(markdown).filter((b) => b.text.trim() !== '');
    const letzter = bl[bl.length - 1];
    if (letzter?.art === 'absatz' && !SATZENDE.test(letzter.text.trimEnd())) {
      const zitat = letzteWoerter(letzter.text);
      ergebnis.push(
        hinweis(
          'satzende',
          id,
          fmt(t.satzende, { nr }),
          fmt(t.satzendeErklaerung, { titel, zitat }),
          [{ kapitel: id, text: zitat }],
        ),
      );
    }

    // Mehrere Leerzeichen
    const stellen: Zitat[] = [];
    let anzahl = 0;
    for (const a of abs) {
      for (const m of a.text.matchAll(/(\S*)[ \t\u00a0]{2,}(\S*)/g)) {
        anzahl++;
        const stelle = m[0].trim();
        if (stelle && stellen.length < MAX_STELLEN) stellen.push({ kapitel: id, text: stelle });
      }
    }
    if (anzahl)
      ergebnis.push(
        hinweis(
          'leerzeichen',
          id,
          fmt(t.leerzeichen, { nr }),
          fmt(t.leerzeichenErklaerung, { n: anzahl }, sprache),
          stellen,
        ),
      );

    // Leere Überschriften
    const alle = bloecke(markdown);
    let leere = 0;
    alle.forEach((b, k) => {
      if (b.art !== 'ueberschrift' || b.text.trim() !== '') return;
      leere++;
      const vorher = alle.slice(0, k).reverse().find((x) => x.text.trim() !== '' && x.art !== 'trenner');
      const nachher = alle.slice(k + 1).find((x) => x.text.trim() !== '' && x.art !== 'trenner');
      const amEnde = !nachher;
      const zitate: Zitat[] = vorher
        ? [{ kapitel: id, text: letzteWoerter(vorher.text) }]
        : nachher
          ? [{ kapitel: id, text: ersteWoerter(nachher.text) }]
          : [];
      ergebnis.push(
        hinweis(
          `ueberschrift-${leere}`,
          id,
          fmt(amEnde ? t.leereUeberschriftEnde : t.leereUeberschrift, { nr }),
          amEnde ? t.leereUeberschriftEndeErklaerung : t.leereUeberschriftErklaerung,
          zitate,
        ),
      );
    });
  });
  return ergebnis;
}
