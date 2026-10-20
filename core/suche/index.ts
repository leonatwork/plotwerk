import type { ProjektDaten } from '../model/types';
import { diffChars } from 'diff';
import { klartext } from '../text';

export interface SuchOptionen { ganzesWort?: boolean; caseSensitiv?: boolean }
export interface TextTreffer { start: number; ende: number; kontext: string }
export interface SuchFeld { pfad: (string | number)[]; text: string; bereich: 'manuskript' | 'plan' | 'notizen'; titel: string; kapitel?: string; nummer?: number; markdown: boolean }
export interface ProjektTreffer extends TextTreffer { feld: SuchFeld }
export function sucheText(text: string, suche: string, optionen: SuchOptionen = {}, markdown = false): TextTreffer[] {
  if (!suche || /\n/.test(suche)) return [];
  const t = markdown ? klartext(text) : text;
  // Gleiche Syntax wie verweiseZerlegen in der UI; core bleibt unabhängig von src/.
  // Verweise sind keine editierbaren Textspannen, auch ihre gespeicherte Anzeige nicht.
  const verweise = markdown ? [] : [...t.matchAll(/\[\[(figur|ort|kapitel|plan|idee|gruppe):([^|\]\n]+)(?:\|([^\]\n]*))?\]\]/g)]
    .map(m => ({ start: m.index, ende: m.index + m[0].length }));
  const muster = suche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(muster, optionen.caseSensitiv ? 'gu' : 'giu');
  const wort = /[\p{L}\p{N}\p{M}_]/u;
  const result: TextTreffer[] = [];
  for (const m of t.matchAll(re)) {
    const start = m.index, ende = start + m[0].length;
    if (verweise.some(v => start < v.ende && ende > v.start)) continue;
    if (t.slice(start, ende).includes('\n\n')) continue;
    if (optionen.ganzesWort && (wort.test([...t.slice(0, start)].at(-1) ?? '') || wort.test([...t.slice(ende)][0] ?? ''))) continue;
    const vor = t.lastIndexOf('\n\n', start);
    result.push({ start, ende, kontext: t.slice(Math.max(vor < 0 ? 0 : vor + 2, start - 48), Math.min(t.indexOf('\n\n', ende) < 0 ? t.length : t.indexOf('\n\n', ende), ende + 48)) });
  }
  return result;
}

/** Klartextoffset → Quellzeichen. Nur sichtbare Zeichen ändern, Auszeichnung bleibt erhalten. */
function quellKarte(text: string): number[] {
  let quelle = 0;
  const karte: number[] = [];
  for (const teil of diffChars(text, klartext(text))) {
    if (teil.removed) quelle += teil.value.length;
    else if (teil.added) for (let i = 0; i < teil.value.length; i++) karte.push(Math.max(0, quelle - 1));
    else for (let i = 0; i < teil.value.length; i++) karte.push(quelle++);
  }
  return karte;
}
export function ersetzeTreffer(text: string, treffer: TextTreffer[], ersatz: string, markdown = false): string {
  const karte = markdown ? quellKarte(text) : Array.from({ length: text.length }, (_, i) => i);
  const einfuegen = markdown ? ersatz.replace(/[\\*_#=\-]/g, '\\$&').replace(/\n/g, '\\\n') : ersatz;
  for (const t of [...treffer].sort((a, b) => b.start - a.start)) {
    const positionen = [...new Set(karte.slice(t.start, t.ende))].sort((a, b) => b - a);
    // Entferne nur Auszeichnung, deren kompletter Inhalt gelöscht wird und in der kein
    // Ersatz steht. Andernfalls würden leere **…**-Spannen zu sichtbaren Sternen werden.
    if (markdown) {
      const geloescht = new Set(positionen);
      const einfuegePos = positionen.at(-1)!;
      // Das Escape gehört zum sichtbaren Satzzeichen. Würde nur das Zeichen gelöscht,
      // bliebe ein wörtlicher Backslash zurück oder maskierte den Ersatztext.
      for (const pos of positionen) {
        if (!/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(text[pos]!)) continue;
        let davor = pos - 1;
        while (davor >= 0 && text[davor] === '\\') davor--;
        if ((pos - davor - 1) % 2 === 1) geloescht.add(pos - 1);
      }
      for (const m of text.matchAll(/(\*\*|__|\*|_)([^*_\n]+)\1/g)) {
        const start = m.index + m[1]!.length, ende = start + m[2]!.length;
        if (einfuegePos >= start && einfuegePos < ende && einfuegen) continue;
        if (Array.from({ length: ende - start }, (_, i) => start + i).every(p => geloescht.has(p))) {
          for (let i = 0; i < m[1]!.length; i++) { geloescht.add(m.index + i); geloescht.add(ende + i); }
        }
      }
      positionen.splice(0, positionen.length, ...[...geloescht].sort((a, b) => b - a));
      for (const pos of positionen) text = text.slice(0, pos) + (pos === einfuegePos ? einfuegen : '') + text.slice(pos + 1);
      continue;
    }
    for (const pos of positionen) text = text.slice(0, pos) + (pos === positionen.at(-1) ? einfuegen : '') + text.slice(pos + 1);
  }
  return text;
}
export function ersetzeText(text: string, suche: string, ersatz: string, optionen: SuchOptionen = {}, markdown = false): string {
  return ersetzeTreffer(text, sucheText(text, suche, optionen, markdown), ersatz, markdown);
}

// Explizite Text-Allowlist: niemals IDs, Verweise, Enumwerte, Anker, KI-Ablagen oder Fassungen.
const TEXT = new Set(['titel', 'name', 'funktion', 'notiz', 'notizen', 'wahrheit', 'kurz', 'beschreibung', 'quintessenz', 'wendepunkt', 'wendung', 'text', 'alterPlan', 'autor', 'untertitel', 'genre']);
const LISTEN = new Set(['aliase', 'formen', 'ignoriert', 'varianten', 'schlagworte']);
const RECORDS = new Set(['plan', 'praesenz', 'rollen']);
const AUS = new Set(['anker', 'beleg', 'belege', 'zeitpunkt', 'netz']);
export function projektFelder(d: ProjektDaten): SuchFeld[] {
  const result: SuchFeld[] = [];
  const gehe = (wert: unknown, pfad: (string | number)[], titel: string, kapitel?: string, privat = false, frei = false) => {
    if (typeof wert === 'string') {
      if (frei) result.push({ pfad, text: wert, titel, kapitel, bereich: privat ? 'notizen' : 'plan', markdown: false });
      return;
    }
    if (Array.isArray(wert)) wert.forEach((x, i) => gehe(x, [...pfad, i], titel, kapitel, privat, frei));
    else if (wert && typeof wert === 'object') for (const [key, x] of Object.entries(wert)) {
      if (AUS.has(key) && !frei) continue;
      const spezial = (key === 'szene' && pfad[0] === 'plaene' && pfad.length === 2) || (key === 'art' && pfad.includes('beziehungen')) || (key === 'kategorie' && pfad[0] === 'marken');
      gehe(x, [...pfad, key], titel, kapitel, privat || ['notiz', 'notizen', 'wahrheit', 'alterPlan'].includes(key) || (pfad[0] === 'recherche' && key === 'text'), frei || spezial || TEXT.has(key) || LISTEN.has(key) || RECORDS.has(key));
    }
  };
  d.projekt.kapitel.forEach((id, i) => {
    const k = d.kapitel[id];
    if (k) result.push({ pfad: ['kapitel', id, 'text'], text: k.text, titel: k.titel, kapitel: id, nummer: i + 1, bereich: 'manuskript', markdown: true });
    if (d.plaene[id]) gehe(d.plaene[id], ['plaene', id], d.plaene[id]!.titel, id);
  });
  for (const [id, p] of Object.entries(d.plaene)) if (!d.projekt.kapitel.includes(id)) gehe(p, ['plaene', id], p.titel, id);
  for (const root of ['figuren', 'orte', 'gruppen'] as const) for (const [id, x] of Object.entries(d[root])) gehe(x, [root, id], x.name);
  for (const root of ['akte', 'straenge', 'ideen', 'motive', 'zeitleiste', 'fadenplanung', 'boegen', 'marken', 'anmerkungen', 'recherche'] as const) gehe(d[root], [root], root);
  gehe(d.projekt.notiz, ['projekt', 'notiz'], d.projekt.titel, undefined, true, true);
  gehe(d.projekt.angaben, ['projekt', 'angaben'], d.projekt.titel);
  gehe(d.entscheidungen.zusammenfassungen, ['entscheidungen', 'zusammenfassungen'], d.projekt.titel);
  return result;
}
export function sucheProjekt(daten: ProjektDaten, suche: string, optionen: SuchOptionen = {}): ProjektTreffer[] {
  return projektFelder(daten).flatMap(feld => sucheText(feld.text, suche, optionen, feld.markdown).map(t => ({ ...t, feld })));
}

/** Unveränderliche Aktualisierung genau eines Textfelds. */
export function feldSetzen(d: ProjektDaten, pfad: SuchFeld['pfad'], text: string): ProjektDaten {
  const setze = (obj: unknown, keys: SuchFeld['pfad']): unknown => {
    if (!keys.length) return text;
    const [key, ...rest] = keys;
    if (Array.isArray(obj)) return obj.map((x, i) => i === key ? setze(x, rest) : x);
    const record = obj as Record<string, unknown>;
    return { ...record, [key!]: setze(record[String(key)], rest) };
  };
  return setze(d, pfad) as ProjektDaten;
}
