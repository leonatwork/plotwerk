/**
 * Wörter, Stammformen und Sätze im Klartext (core/text.klartext). Reine Funktionen, ohne KI.
 * Alle Offsets beziehen sich auf den übergebenen Klartext – derselbe, den Editor, Index und Anker benutzen.
 */

export interface Wort {
  /** Wort wie im Text */
  text: string;
  /** Kleinschreibung (NFC) */
  klein: string;
  /** einfache Stammform für den Vergleich („sagte“, „sagten“ → „sagt“) */
  stamm: string;
  start: number;
  ende: number;
  /** laufende Nummer im Text (für Abstände in Wörtern) */
  nr: number;
}

export interface Satz {
  text: string;
  start: number;
  ende: number;
  /** erstes Wort des Satzes (ohne Anführungszeichen, Gedankenstriche) */
  erstesWort: Wort | null;
}

/** Buchstabe am Anfang, danach Buchstaben/Ziffern, Bindestrich- und Apostroph-Teile („Schwip-Schwap“, „McDonald’s“). */
const WORT = /\p{L}[\p{L}\p{M}\p{N}]*(?:[-‐’'][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;

/** Häufige deutsche Funktionswörter – werden bei Häufigkeit und Nähe nicht gezählt. */
export const STOPPWOERTER: ReadonlySet<string> = new Set(
  `aber alle allem allen aller alles als also am an ander andere anderem anderen anderer anderes anders auch auf aus bei beide beiden beim bin bis bist bloß da dabei dafür dagegen daher dahin damals damit danach daneben dann daran darauf daraus darin darüber darum darunter das dass daß davon davor dazu dein deine deinem deinen deiner dem den denen denn dennoch der deren derselbe des deshalb dessen dich die dies diese diesem diesen dieser dieses dir doch dort du durch eben ebenso ein eine einem einen einer eines einfach einige einigen einmal er es etwa etwas euch euer eure für gab gar gegen gewesen geworden gibt ging habe haben hat hatte hätte hatten hätten her heraus herein hier hin hinter ich ihm ihn ihnen ihr ihre ihrem ihren ihrer ihres im immer in indem ins ist ja je jede jedem jeden jeder jedes jedoch jemand jetzt kam kann kaum kein keine keinem keinen keiner kommt konnte könnte man manche manchmal mehr mein meine meinem meinen meiner mich mir mit muss musste müssen nach nachdem neben nein nicht nichts noch nun nur ob oder ohne schon sehr sei sein seine seinem seinen seiner seit selbst sich sie sind so sogar soll sollte sondern sonst statt um und uns unser unsere unter viel viele vom von vor wann war wäre waren wären warum was weil weiter welche welchem welchen welcher welches wem wen wenn wer werde werden wie wieder will wir wird wo wohl wollte worden würde würden zu zum zur zwar zwischen über hab hast habt seid wart wurde wurden kein mal okay ok`.split(
    /\s+/,
  ),
);

const ENDUNGEN = ['ern', 'en', 'em', 'er', 'es', 'e', 's', 'n'];

/** Einfache Stammform: Kleinschreibung, Endungen ab fünf Buchstaben abgeschnitten (Rest mindestens drei Buchstaben). */
export function stamm(wort: string): string {
  const w = wort.normalize('NFC').toLowerCase().replace(/[’']s$/u, '');
  if (w.length < 5) return w;
  for (const e of ENDUNGEN) {
    if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length);
  }
  return w;
}

export function woerter(text: string): Wort[] {
  const liste: Wort[] = [];
  for (const m of text.matchAll(WORT)) {
    const t = m[0];
    const klein = t.normalize('NFC').toLowerCase();
    liste.push({ text: t, klein, stamm: stamm(t), start: m.index, ende: m.index + t.length, nr: liste.length });
  }
  return liste;
}

/** Abkürzungen, nach denen kein Satz endet. */
const ABKUERZUNGEN = new Set(
  'z.b u.a d.h ca dr nr bzw usw etc hr fr st str vgl ggf evtl inkl max min mio mrd prof s ebd jh ff o.ä u.ä z.t'.split(' '),
);

const SATZENDE = /[.!?…]+[»«“”"'’)\]]*/gu;

/** Teilt den Klartext in Sätze. Absatzwechsel beenden immer einen Satz; Szenentrenner „* * *“ entfallen. */
export function saetze(text: string): Satz[] {
  const ergebnis: Satz[] = [];
  const alleWoerter = woerter(text);
  let wi = 0;
  const hinzu = (start: number, ende: number) => {
    // Leerraum und Trennerzeilen abschneiden
    while (start < ende && /\s/u.test(text[start]!)) start++;
    while (ende > start && /\s/u.test(text[ende - 1]!)) ende--;
    if (ende <= start) return;
    const t = text.slice(start, ende);
    if (!/\p{L}|\p{N}/u.test(t)) return;
    while (wi < alleWoerter.length && alleWoerter[wi]!.start < start) wi++;
    const erstes = alleWoerter[wi] && alleWoerter[wi]!.start < ende ? alleWoerter[wi]! : null;
    ergebnis.push({ text: t, start, ende, erstesWort: erstes });
  };
  let absatzStart = 0;
  const absaetze = text.split(/\n\n/);
  for (const absatz of absaetze) {
    let satzStart = 0;
    for (const m of absatz.matchAll(SATZENDE)) {
      const ende = m.index + m[0].length;
      const naechstes = absatz.slice(ende);
      // Satzende nur vor Leerraum + Großbuchstabe/Anführungszeichen/Ziffer/Gedankenstrich oder am Absatzende
      if (naechstes.length && !/^\s+(?:[„“"»«‚‘'(–—-]|\p{Lu}|\p{N})/u.test(naechstes)) continue;
      if (m[0].startsWith('.') && m[0].length === 1) {
        const vor = absatz.slice(satzStart, m.index);
        const letztes = /([\p{L}.]+)$/u.exec(vor)?.[1]?.toLowerCase() ?? '';
        if (ABKUERZUNGEN.has(letztes) || /^\p{L}$/u.test(letztes)) continue;
        // Ordinalzahl („am 3. Mai“) – nur wenn ein Wort folgt, das klein beginnt oder ein Monat ist
        if (/\d$/u.test(vor) && /^\s+(?:\p{Ll}|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/u.test(naechstes)) continue;
      }
      hinzu(absatzStart + satzStart, absatzStart + ende);
      satzStart = ende;
    }
    hinzu(absatzStart + satzStart, absatzStart + absatz.length);
    absatzStart += absatz.length + 2;
  }
  return ergebnis;
}

/** Kurzer Ausschnitt um eine Stelle (für Listen), Leerraum zusammengefasst. */
export function ausschnitt(text: string, start: number, ende: number, rand = 32): { vor: string; treffer: string; nach: string } {
  const a = Math.max(0, start - rand);
  const b = Math.min(text.length, ende + rand);
  let vor = text.slice(a, start).replace(/\s+/gu, ' ');
  let nach = text.slice(ende, b).replace(/\s+/gu, ' ');
  if (a > 0) vor = `…${vor.replace(/^\S*\s/u, '')}`;
  if (b < text.length) nach = `${nach.replace(/\s\S*$/u, '')}…`;
  return { vor, treffer: text.slice(start, ende), nach };
}
