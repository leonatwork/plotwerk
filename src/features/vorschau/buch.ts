/**
 * Lesevorschau – Aufbereitung des Manuskripts als Buch (rein, ohne DOM).
 *
 * Nur der Manuskripttext in Projektreihenfolge: keine Anmerkungen, Markierungen, Verweise oder Pläne.
 * Kapitel ohne Text entfallen. Markdown wird wie beim Export über core/docx/markdown (CommonMark) gelesen.
 */
import type { Lauf } from '@core/docx/markdown';
import { buchSprache, fmt, type Sprache } from '@core/i18n';
import { satzBloecke, type SatzBlock } from '@core/satz';
import type { Id, Kapitel, ProjektDaten } from '@core/model/types';
import { woerterbuch } from '../../i18n';

/** Buchtexte (Kapitelkopf, Ersatztitel) in der Buchsprache – nicht in der Oberflächensprache. */
function buchTexte(sprache: Sprache) {
  return woerterbuch(sprache).vorschau.buch;
}

/** Satzblöcke (gemeinsam mit dem EPUB-Export, core/satz). */
export type BuchBlock = SatzBlock;

export interface BuchKapitel {
  id: Id;
  /** fortlaufende Nummer im Buch (übersprungene Kapitel zählen nicht) */
  nummer: number;
  titel: string;
  bloecke: BuchBlock[];
  /** HTML des Kapiteltexts ohne Kapitelkopf (Blöcke mit data-b, in Reihenfolge) */
  html: string;
  /** Prüfsumme über Titel und Text (Cache-Schlüssel der Paginierung) */
  hash: string;
  /** Zeichen im Text (Schätzung der Seitenzahl, Fortschritt) */
  zeichen: number;
}

export interface Buch {
  titel: string;
  kapitel: BuchKapitel[];
  zeichen: number;
}

// ---------------------------------------------------------------------------
// Blöcke (core/satz)
// ---------------------------------------------------------------------------

export const buchBloecke = satzBloecke;

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const ENTITAETEN: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function htmlMaskieren(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ENTITAETEN[c]!);
}

export function laeufeHtml(laeufe: Lauf[]): string {
  let html = '';
  for (const l of laeufe) {
    let t = htmlMaskieren(l.text).replace(/\n/g, '<br>');
    if (l.kursiv) t = `<em>${t}</em>`;
    if (l.fett) t = `<strong>${t}</strong>`;
    html += t;
  }
  return html;
}

/** Szenentrenner im Satz: drei Sternchen mit Halbgeviert-Abstand */
export const TRENNER_ZEICHEN = '* * *';

/** Blöcke als HTML; jeder Block trägt data-b (Index für Leseposition und Messung). `sprache` = Buchsprache. */
export function bloeckeHtml(bloecke: BuchBlock[], sprache: Sprache = 'de'): string {
  const trenner = htmlMaskieren(buchTexte(sprache).szenenwechsel);
  let html = '';
  for (const b of bloecke) {
    if (b.art === 'trenner') html += `<div data-b class="pw-v-trenner" role="separator" aria-label="${trenner}">${TRENNER_ZEICHEN}</div>`;
    else if (b.art === 'ueberschrift') html += `<h3 data-b class="pw-v-zwischentitel">${laeufeHtml(b.laeufe)}</h3>`;
    else html += b.einzug ? `<p data-b class="pw-v-e">${laeufeHtml(b.laeufe)}</p>` : `<p data-b>${laeufeHtml(b.laeufe)}</p>`;
  }
  return html;
}

export type KopfArt = 'buch' | 'ebook';

/** Kapitelkopf: Buch mit Abstand oben, Nummer und Titel; E-Book kompakter mit „Kapitel n“ (in der Buchsprache). */
export function kopfHtml(k: Pick<BuchKapitel, 'nummer' | 'titel'>, art: KopfArt, sprache: Sprache = 'de'): string {
  const titel = htmlMaskieren(k.titel);
  return art === 'buch'
    ? `<header class="pw-v-kopf pw-v-kopf--buch"><div class="pw-v-kopf__nummer">${k.nummer}</div><h2 class="pw-v-kopf__titel">${titel}</h2></header>`
    : `<header class="pw-v-kopf pw-v-kopf--ebook"><div class="pw-v-kopf__nummer">${htmlMaskieren(fmt(buchTexte(sprache).kapitelKopf, { nr: k.nummer }))}</div><h2 class="pw-v-kopf__titel">${titel}</h2></header>`;
}

/** Vollständiges Kapitel für Satz und Messung: Kopf, Text, Endmarke. */
export function kapitelHtml(k: BuchKapitel, art: KopfArt, sprache: Sprache = 'de'): string {
  return `${kopfHtml(k, art, sprache)}${k.html}<div data-ende></div>`;
}

// ---------------------------------------------------------------------------
// Buch aus den Projektdaten
// ---------------------------------------------------------------------------

/** FNV-1a (32 bit) als Hex – schnell, reicht als Cache-Schlüssel */
export function pruefsumme(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
}

interface Aufbereitet {
  /** Buchsprache, in der das HTML erzeugt wurde */
  sprache: Sprache;
  bloecke: BuchBlock[];
  html: string;
  hash: string;
  zeichen: number;
}

/** Aufbereitung je Kapitel-Objekt (der Store ersetzt nur geänderte Kapitel – der Rest bleibt gecacht). */
const cache = new WeakMap<Kapitel, Aufbereitet>();

/** `sprache` fehlt → jede vorhandene Aufbereitung reicht (nur die Blöcke werden gebraucht). */
function aufbereiten(k: Kapitel, sprache?: Sprache): Aufbereitet {
  const vorhanden = cache.get(k);
  if (vorhanden && (!sprache || vorhanden.sprache === sprache)) return vorhanden;
  const bloecke = buchBloecke(k.text, k.titel);
  let zeichen = 0;
  for (const b of bloecke) if (b.art !== 'trenner') for (const l of b.laeufe) zeichen += l.text.length;
  const html = bloeckeHtml(bloecke, sprache ?? 'de');
  const neu = { sprache: sprache ?? 'de', bloecke, html, hash: pruefsumme(`${k.titel}\u0000${html}`), zeichen };
  cache.set(k, neu);
  return neu;
}

/** Hat ein Kapitel druckbaren Text? (Trenner allein zählen nicht) */
export function hatText(k: Kapitel | undefined): boolean {
  return !!k && aufbereiten(k).bloecke.some((b) => b.art !== 'trenner');
}

/** Das Buch: Kapitel in Projektreihenfolge, Kapitel ohne Text (oder nur geplant) übersprungen. Texte in der Buchsprache. */
export function buchAusProjekt(daten: ProjektDaten): Buch {
  const sprache = buchSprache(daten.projekt.angaben);
  const ohneTitel = buchTexte(sprache).ohneTitel;
  const kapitel: BuchKapitel[] = [];
  let zeichen = 0;
  for (const id of daten.projekt.kapitel) {
    const k = daten.kapitel[id];
    if (!k) continue;
    const { bloecke, html, hash, zeichen: z } = aufbereiten(k, sprache);
    if (!bloecke.some((b) => b.art !== 'trenner')) continue;
    const a = { bloecke, html, hash, zeichen: z };
    kapitel.push({ id, nummer: kapitel.length + 1, titel: k.titel.trim() || ohneTitel, ...a });
    zeichen += a.zeichen;
  }
  return { titel: daten.projekt.titel.trim() || ohneTitel, kapitel, zeichen };
}

/**
 * Kapitel, an dem die Vorschau öffnet: das gewünschte, sonst das nächste folgende mit Text,
 * sonst das letzte davor; null = Anfang des Buchs.
 */
export function startKapitel(buch: Buch, reihenfolge: Id[], kapitelId: Id | null | undefined): Id | null {
  if (!kapitelId) return null;
  const imBuch = new Set(buch.kapitel.map((k) => k.id));
  if (imBuch.has(kapitelId)) return kapitelId;
  const pos = reihenfolge.indexOf(kapitelId);
  if (pos < 0) return null;
  for (let i = pos + 1; i < reihenfolge.length; i++) if (imBuch.has(reihenfolge[i]!)) return reihenfolge[i]!;
  for (let i = pos - 1; i >= 0; i--) if (imBuch.has(reihenfolge[i]!)) return reihenfolge[i]!;
  return null;
}
