/**
 * Änderungsvorschläge aus dem Lektorat (G7, Rückimport aus Word) anzeigen und – nur auf Leons Klick –
 * in den Kapiteltext übernehmen. Reine Funktionen: Das Ergebnis ist der neue Markdown-Text, gespeichert
 * wird er von der Oberfläche über die normale Speicherung (menschliche Änderung, keine KI).
 *
 * Vorgehen beim Annehmen: Stelle über den Textanker (E4) im Klartext finden, prüfen, dass dort noch der
 * alte Text steht, dann nur die betroffenen Absätze im Markdown ändern. Zuerst wird minimal ersetzt
 * (Auszeichnung bleibt unberührt); geht das nicht eindeutig, werden die betroffenen Absätze aus ihren
 * Läufen (fett/kursiv) neu geschrieben. Zum Schluss wird der Klartext gegen das erwartete Ergebnis geprüft –
 * stimmt er nicht, wird nichts geändert.
 */
import { absatzZuMarkdown, laeufeText, leseMarkdown, type Lauf } from '../docx/markdown';
import type { LektoratsAenderung } from '../model/types';
import { ankerFinden, bloecke, klartext, normalisiere, zitatKern, type Bereich } from '../text';

export type AenderungsLage =
  /** Stelle gefunden, alter Text steht noch da */
  | 'bereit'
  /** Stelle nicht (eindeutig) gefunden */
  | 'verwaist'
  /** Stelle gefunden, aber der Text dort hat sich geändert */
  | 'veraendert';

export interface AenderungsStelle {
  lage: AenderungsLage;
  /** Bereich im Klartext, der ersetzt wird (bei „einfuegen“ leer: start = ende) */
  bereich: Bereich | null;
}

const LEER = /\s/;

/** Sucht die Stelle der Änderung im Klartext des Kapitels. */
export function aenderungFinden(kt: string, a: LektoratsAenderung): AenderungsStelle {
  const b = ankerFinden(kt, a.anker);
  if (!b) return { lage: 'verwaist', bereich: null };
  if (a.art === 'einfuegen') return { lage: 'bereit', bereich: { start: b.ende, ende: b.ende } };
  let { start, ende } = b;
  if (zitatKern(kt.slice(start, ende)) !== zitatKern(a.alt)) return { lage: 'veraendert', bereich: b };
  // Leerraum am Rand des gelöschten Texts mitnehmen (sonst blieben doppelte Leerzeichen bzw. leere Absätze)
  if (/\s$/.test(a.alt)) while (ende < kt.length && LEER.test(kt[ende]!)) ende++;
  else if (/^\s/.test(a.alt)) while (start > 0 && LEER.test(kt[start - 1]!)) start--;
  else if (a.art === 'loeschen' || a.neu === '') {
    // Wort/Satz ohne Leerraum gelöscht: ein Leerzeichen am Rand mitnehmen (sonst „Wort  Wort“ bzw. „Satz. ¶“)
    const zeilenLeer = (c: string | undefined) => c === ' ' || c === '\t';
    const randVorn = start === 0 || kt[start - 1] === '\n';
    const randHinten = ende >= kt.length || kt[ende] === '\n';
    if (zeilenLeer(kt[start - 1]) && (randHinten || zeilenLeer(kt[ende]))) while (start > 0 && zeilenLeer(kt[start - 1])) start--;
    else if (randVorn && zeilenLeer(kt[ende])) while (ende < kt.length && zeilenLeer(kt[ende])) ende++;
  }
  return { lage: 'bereit', bereich: { start, ende } };
}

export interface AenderungsAnsicht {
  lage: AenderungsLage;
  /** Text vor der Stelle (gekürzt, Klartext) */
  davor: string;
  /** Text, der wegfällt („einfuegen“: leer) */
  alt: string;
  /** Text, der neu dazukommt („loeschen“: leer) */
  neu: string;
  /** Text nach der Stelle (gekürzt) */
  danach: string;
}

const KONTEXT = 70;

function kuerzeVorn(s: string, n: number): string {
  if (s.length <= n) return s;
  const teil = s.slice(s.length - n);
  const leer = teil.search(/\s/);
  return `…${leer >= 0 && leer < 20 ? teil.slice(leer + 1) : teil}`;
}

function kuerzeHinten(s: string, n: number): string {
  if (s.length <= n) return s;
  const teil = s.slice(0, n);
  const leer = teil.lastIndexOf(' ');
  return `${leer > n - 20 ? teil.slice(0, leer) : teil}…`;
}

const einzeilig = (s: string) => s.replace(/\n{2,}/g, ' ¶ ').replace(/\n/g, ' ');

/** Kontext für die Anzeige (wie in Word: Gelöschtes durchgestrichen, Eingefügtes unterstrichen). */
export function aenderungAnsicht(kt: string, a: LektoratsAenderung): AenderungsAnsicht {
  const stelle = aenderungFinden(kt, a);
  const neu = a.art === 'loeschen' ? '' : a.neu;
  if (!stelle.bereich) {
    return { lage: stelle.lage, davor: kuerzeVorn(a.anker.davor, KONTEXT), alt: a.art === 'einfuegen' ? '' : a.alt, neu, danach: kuerzeHinten(a.anker.danach, KONTEXT) };
  }
  const { start, ende } = stelle.bereich;
  if (a.art === 'einfuegen') {
    return { lage: stelle.lage, davor: einzeilig(kuerzeVorn(kt.slice(0, start), KONTEXT)), alt: '', neu: einzeilig(neu), danach: einzeilig(kuerzeHinten(kt.slice(start), KONTEXT)) };
  }
  return {
    lage: stelle.lage,
    davor: einzeilig(kuerzeVorn(kt.slice(0, start), KONTEXT)),
    alt: einzeilig(kt.slice(start, ende)),
    neu: einzeilig(neu),
    danach: einzeilig(kuerzeHinten(kt.slice(ende), KONTEXT)),
  };
}

// ---------------------------------------------------------------------------
// Anwenden
// ---------------------------------------------------------------------------

export type AnwendenErgebnis = { ok: true; text: string } | { ok: false; grund: string };

interface QuellBlock {
  art: string;
  /** Klartext des Blocks */
  text: string;
  start: number;
  ende: number;
  zeilen: [number, number];
}

/** Nicht-leere Blöcke mit Klartext-Bereich und Zeilen im Markdown (gleiche Zählung wie core/text). */
function quellBloecke(markdown: string): QuellBlock[] | null {
  const ergebnis: QuellBlock[] = [];
  let pos = 0;
  for (const b of bloecke(markdown)) {
    if (b.text.trim() === '') continue;
    if (!b.zeilen) return null;
    if (ergebnis.length) pos += 2;
    ergebnis.push({ art: b.art, text: b.text, start: pos, ende: pos + b.text.length, zeilen: b.zeilen });
    pos += b.text.length;
  }
  return ergebnis;
}

/** Vergleichsform: normalisiert (E6), Absatzgrenzen bleiben erhalten (sonst fiele ein Zusammenführen nicht auf). */
const vergleich = (s: string) =>
  s
    .split(/\n{2,}/)
    .map((t) => normalisiere(t).text.trim())
    .filter(Boolean)
    .join('\u00b6');

/** Klartext-Offsets eines Blocks → Positionen in seiner Markdown-Quelle (Auszeichnung wird übersprungen). */
function quellPositionen(quelle: string, text: string): number[] | null {
  const pos: number[] = [];
  let i = 0;
  for (let j = 0; j < text.length; j++) {
    const c = text[j]!;
    while (i < quelle.length) {
      const q = quelle[i]!;
      if (q === c || (c === ' ' && q === '\n')) break;
      i++;
    }
    if (i >= quelle.length) return null;
    pos.push(i);
    i++;
  }
  return pos;
}

function maskieren(s: string): string {
  return s.replace(/[\\*_`[\]<~]/g, (c) => `\\${c}`);
}

/** Läufe an einer Klartext-Spanne ändern (Format des umgebenden Laufs wird übernommen). */
function laeufeAendern(laeufe: Lauf[], s: number, e: number, neu: string): Lauf[] {
  const aus: Lauf[] = [];
  let pos = 0;
  let eingefuegt = false;
  const einfuegen = (vorlage: Lauf | undefined) => {
    if (eingefuegt) return;
    eingefuegt = true;
    if (neu) aus.push({ text: neu, fett: vorlage?.fett ?? false, kursiv: vorlage?.kursiv ?? false });
  };
  for (const l of laeufe) {
    const a = pos;
    const b = pos + l.text.length;
    pos = b;
    if (b <= s) {
      aus.push({ ...l });
      if (b === s && s === e && !eingefuegt) einfuegen(l);
      continue;
    }
    if (a >= e && eingefuegt) {
      aus.push({ ...l });
      continue;
    }
    const vorn = l.text.slice(0, Math.max(0, s - a));
    const hinten = l.text.slice(Math.max(0, e - a));
    if (vorn) aus.push({ ...l, text: vorn });
    if (a <= s || !eingefuegt) einfuegen(l);
    if (hinten && a < e) aus.push({ ...l, text: hinten });
    else if (a >= e) aus.push({ ...l });
  }
  einfuegen(laeufe[laeufe.length - 1]);
  // gleiche Formate zusammenfassen
  const glatt: Lauf[] = [];
  for (const l of aus) {
    if (!l.text) continue;
    const letzte = glatt[glatt.length - 1];
    if (letzte && letzte.fett === l.fett && letzte.kursiv === l.kursiv) letzte.text += l.text;
    else glatt.push({ ...l });
  }
  return glatt;
}

/**
 * Wendet eine Änderung auf den Markdown-Text eines Kapitels an. Ändert nur die betroffenen Absätze.
 * Gibt einen Grund zurück, wenn die Stelle fehlt, sich geändert hat oder sich nicht sicher ändern lässt.
 */
export function wendeAenderungAn(markdown: string, a: LektoratsAenderung): AnwendenErgebnis {
  const kt = klartext(markdown);
  const stelle = aenderungFinden(kt, a);
  if (stelle.lage === 'verwaist' || !stelle.bereich) return { ok: false, grund: 'Die Stelle steht so nicht mehr im Text.' };
  if (stelle.lage === 'veraendert') return { ok: false, grund: 'Der Text an dieser Stelle hat sich inzwischen geändert.' };
  const { start: s, ende: e } = stelle.bereich;
  const neu = a.art === 'loeschen' ? '' : a.neu;
  const erwartet = vergleich(kt.slice(0, s) + neu + kt.slice(e));

  const liste = quellBloecke(markdown);
  if (!liste || liste.length === 0) return { ok: false, grund: 'Das Kapitel hat keinen Text.' };
  // betroffene Blöcke: der erste, der die Stelle enthält (bei Einfügungen am Absatzende der Absatz davor)
  let i1 = liste.findIndex((b) => s <= b.ende && (e > s ? s < b.ende : true));
  if (i1 < 0) i1 = liste.length - 1;
  let i2 = i1;
  const ueberAbsatz = kt.slice(s, e).includes('\n');
  if (e > s) for (let i = i1; i < liste.length && (liste[i]!.start < e || (ueberAbsatz && liste[i]!.start === e)); i++) i2 = i;
  const betroffen = liste.slice(i1, i2 + 1);
  if (betroffen.some((b) => b.art !== 'absatz' && b.art !== 'trenner')) return { ok: false, grund: 'Änderungen in Überschriften bitte selbst im Text vornehmen.' };

  const zeilen = markdown.split('\n');
  const von = betroffen[0]!.zeilen[0];
  const bis = betroffen[betroffen.length - 1]!.zeilen[1];
  const basis = betroffen[0]!.start;
  const ls = s - basis;
  const le = e - basis;
  const zusammensetzen = (ersatz: string) => [...zeilen.slice(0, von), ...ersatz.split('\n'), ...zeilen.slice(bis)].join('\n');
  const passt = (kandidat: string) => vergleich(klartext(kandidat)) === erwartet;

  // 1. minimal: nur die Zeichen der Stelle in der Quelle ersetzen (ein Absatz, kein Absatzwechsel)
  if (betroffen.length === 1 && betroffen[0]!.art === 'absatz' && !neu.includes('\n') && !kt.slice(s, e).includes('\n')) {
    const quelle = zeilen.slice(von, bis).join('\n');
    const pos = quellPositionen(quelle, betroffen[0]!.text);
    if (pos && pos.length) {
      const qs = ls < pos.length ? pos[ls]! : pos[pos.length - 1]! + 1;
      const qe = le > ls ? pos[le - 1]! + 1 : qs;
      const ersatz = quelle.slice(0, qs) + maskieren(neu) + quelle.slice(qe);
      const kandidat = zusammensetzen(ersatz);
      const neueBloecke = bloecke(ersatz).filter((b) => b.text.trim() !== '');
      if (neueBloecke.length <= 1 && passt(kandidat)) return { ok: true, text: kandidat };
    }
  }

  // 2. betroffene Absätze aus ihren Läufen neu schreiben
  const md = leseMarkdown(zeilen.slice(von, bis).join('\n')).filter((b) => b.art === 'trenner' || laeufeText(b.laeufe).trim() !== '');
  const laeufe: Lauf[] = [];
  md.forEach((b, i) => {
    if (i > 0) laeufe.push({ text: '\n\n', fett: false, kursiv: false });
    if (b.art === 'trenner') laeufe.push({ text: '* * *', fett: false, kursiv: false });
    else laeufe.push(...b.laeufe.map((l) => ({ ...l })));
  });
  if (laeufeText(laeufe) !== kt.slice(basis, betroffen[betroffen.length - 1]!.ende))
    return { ok: false, grund: 'Diese Stelle lässt sich nicht automatisch ändern. Bitte im Text selbst ändern.' };
  try {
    const ersatz = absatzZuMarkdown(laeufeAendern(laeufe, ls, le, neu)).join('\n\n');
    const kandidat = zusammensetzen(ersatz);
    if (passt(kandidat)) return { ok: true, text: kandidat };
  } catch {
    /* unten: Fehler melden */
  }
  return { ok: false, grund: 'Diese Stelle lässt sich nicht automatisch ändern. Bitte im Text selbst ändern.' };
}

/** Zählt Änderungen nach Status. */
export function lektoratZaehlen(liste: LektoratsAenderung[]): { offen: number; angenommen: number; abgelehnt: number } {
  const z = { offen: 0, angenommen: 0, abgelehnt: 0 };
  for (const a of liste) z[a.status]++;
  return z;
}
