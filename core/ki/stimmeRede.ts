/**
 * Redestellen je Figur (G3 Figurenstimme), lokal und ohne KI. Besitzer: G3 Figuren.
 *
 * Heuristik: wörtliche Rede steht in Anführungszeichen („…“, "…", »…«). Als mögliche Sprecher gelten
 * die Figuren, die im selben Absatz genannt werden; „sage ich“/„frage ich“ … markiert den Ich-Erzähler.
 * Das Ergebnis dient nur der Orientierung (Aufgabentext für das Modell, Zähler in der Oberfläche) –
 * die Zuordnung ist unsicher und wird nie als Tatsache gespeichert.
 * Nur core/text, kein Dateizugriff (harte Regel 1).
 */
import type { Id } from '../model/types';
import { normalisiere } from '../text';

export interface Redestelle {
  kapitel: Id;
  /** Absatzindex im Klartext des Kapitels (0-basiert, Absätze durch Leerzeilen/Zeilenumbrüche getrennt) */
  absatz: number;
  /** die Rede ohne Anführungszeichen, wörtlich aus dem Klartext */
  text: string;
  /** im Absatz genannte Figuren (mögliche Sprecher, Reihenfolge der Nennung) */
  sprecher: Id[];
  /** „sage ich“, „ich sage“ … im Absatz: der Ich-Erzähler spricht */
  ich: boolean;
}

export interface RedeFigur {
  id: Id;
  /** Name, Aliase, Wortformen */
  namen: string[];
}

/** Anführungszeichen-Paare: öffnend → mögliche schließende Zeichen */
const REDE = /[„"“»]([^„"“”»«\n]{2,600}?)[“”"«]/g;
const ICH = /(?<![\p{L}])(sage|sagte|frage|fragte|rufe|rief|antworte|antwortete|flüstere|flüsterte|schreibe|schrieb|murmele|murmle|meine)\s+ich(?![\p{L}])|(?<![\p{L}])ich\s+(sage|sagte|frage|fragte|rufe|rief|antworte|antwortete|flüstere|flüsterte|schreibe|schrieb|murmele|meine)(?![\p{L}])/iu;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Position der ersten Nennung (normalisiert, Wortgrenzen, Genitiv-s erlaubt) oder -1. */
function erstePosition(text: string, namen: string[]): number {
  let beste = -1;
  for (const roh of namen) {
    const name = normalisiere(roh.trim()).text;
    if (name.length < 2) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?:s|'|’)?(?![\\p{L}\\p{N}])`, 'iu');
    const m = re.exec(text);
    if (m && (beste < 0 || m.index < beste)) beste = m.index;
  }
  return beste;
}

/** Wörtliche Rede in einem Kapitel-Klartext mit möglichen Sprechern. */
export function redestellenImKapitel(kapitel: Id, klartext: string, figuren: RedeFigur[]): Redestelle[] {
  const ergebnis: Redestelle[] = [];
  const absaetze = klartext.split(/\n+/);
  absaetze.forEach((absatz, i) => {
    if (!absatz.trim()) return;
    const norm = normalisiere(absatz).text;
    const sprecher = figuren
      .map((f) => ({ id: f.id, pos: erstePosition(norm, f.namen) }))
      .filter((x) => x.pos >= 0)
      .sort((a, b) => a.pos - b.pos)
      .map((x) => x.id);
    const ich = ICH.test(norm);
    for (const m of absatz.matchAll(REDE)) {
      const text = (m[1] ?? '').trim();
      // Einzelwörter in Anführungszeichen (Titel, Betreffzeilen in Versalien) sind keine Rede
      if (text.split(/\s+/).length < 2 || text === text.toLocaleUpperCase('de')) continue;
      ergebnis.push({ kapitel, absatz: i, text, sprecher, ich });
    }
  });
  return ergebnis;
}

/** Redestellen aller Kapitel (Reihenfolge der Kapitel und Absätze). */
export function redestellen(kapitel: { id: Id; text: string }[], figuren: RedeFigur[]): Redestelle[] {
  return kapitel.flatMap((k) => (k.text.trim() ? redestellenImKapitel(k.id, k.text, figuren) : []));
}

/**
 * Redestellen, die zu einer Figur gehören könnten: Die Figur wird im Absatz genannt, oder sie ist
 * Ich-Erzählerin (`ichErzaehler`) und der Absatz markiert die Rede des Ich-Erzählers.
 */
export function redestellenDerFigur(alle: Redestelle[], figur: Id, ichErzaehler = false): Redestelle[] {
  return alle.filter((r) => r.sprecher.includes(figur) || (ichErzaehler && r.ich));
}
