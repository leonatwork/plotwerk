/**
 * `[[`-Verweise in Notiz- und Plan-Feldern (S-07). Gespeichert als `[[typ:id|Anzeige]]`, z. B.
 * `[[figur:lotte|Lotte]]`, `[[kapitel:fassade|Kap. 2 · Fassade]]`, `[[plan:lotte|Vorbereitung aufs Treffen]]`.
 * Die ID ist maßgeblich (E1), die Anzeige nur der Text zum Zeitpunkt des Einfügens.
 * Nicht im Manuskripttext selbst.
 */
import type { Id, ProjektDaten, Verweis, VerweisTyp } from '@core/model/types';
import type { Bereich, Store } from '../../state/store';
import { f, sprache, texte, vergleich } from '../../i18n';

export const VERWEIS_TYPEN: VerweisTyp[] = ['figur', 'ort', 'kapitel', 'plan', 'idee', 'gruppe'];

/** Art des Verweisziels als Text („Figur“, „Kapitel“ …) in der Oberflächensprache. */
export function verweisArten(): Record<VerweisTyp, string> {
  return texte().schreiben.verweise.art;
}

const MUSTER = /\[\[(figur|ort|kapitel|plan|idee|gruppe):([^|\]\n]+)(?:\|([^\]\n]*))?\]\]/g;

export interface VerweisVorschlag extends Verweis {
  anzeige: string;
  /** Typ als Text rechts in der Liste („Figur“, „Kapitel“ …) */
  art: string;
  /** Texte, in denen gesucht wird */
  suche: string[];
}

export type VerweisTeil = { art: 'text'; text: string } | { art: 'verweis'; verweis: Verweis; anzeige: string };

export function verweisText(v: Verweis, anzeige: string): string {
  return `[[${v.typ}:${v.id}|${anzeige.replace(/[\]|\n]/g, ' ').trim()}]]`;
}

export function verweiseZerlegen(text: string): VerweisTeil[] {
  const teile: VerweisTeil[] = [];
  let letzte = 0;
  for (const m of text.matchAll(MUSTER)) {
    const i = m.index ?? 0;
    if (i > letzte) teile.push({ art: 'text', text: text.slice(letzte, i) });
    const verweis: Verweis = { typ: m[1] as VerweisTyp, id: m[2]!.trim() };
    teile.push({ art: 'verweis', verweis, anzeige: (m[3] ?? '').trim() || verweis.id });
    letzte = i + m[0].length;
  }
  if (letzte < text.length) teile.push({ art: 'text', text: text.slice(letzte) });
  return teile;
}

/** Verweise im Text durch ihre Anzeige ersetzen (z. B. für Vorschauen). */
export function verweiseAlsText(text: string): string {
  return verweiseZerlegen(text)
    .map((t) => (t.art === 'text' ? t.text : t.anzeige))
    .join('');
}

export function kapitelAnzeige(daten: ProjektDaten, id: Id): string {
  const nr = daten.projekt.kapitel.indexOf(id) + 1;
  const titel = daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id;
  return nr > 0 ? `${kapKurz(nr)} · ${titel}` : titel;
}

/** „Kap. 3“ / „Ch. 3“ */
function kapKurz(nr: number): string {
  return f(texte().gemeinsam.kapitelKurz, { nr });
}

/** Aktuelle Anzeige eines Verweisziels; null, wenn es das Ziel nicht mehr gibt. */
export function zielName(daten: ProjektDaten, v: Verweis): string | null {
  switch (v.typ) {
    case 'figur':
      return daten.figuren[v.id]?.name ?? null;
    case 'ort':
      return daten.orte[v.id]?.name ?? null;
    case 'kapitel':
      return daten.kapitel[v.id] || daten.plaene[v.id] ? kapitelAnzeige(daten, v.id) : null;
    case 'plan': {
      const p = daten.plaene[v.id];
      return p ? p.szene || p.titel : null;
    }
    case 'idee':
      return daten.ideen.find((i) => i.id === v.id)?.titel ?? null;
    case 'gruppe':
      return daten.gruppen[v.id]?.name ?? null;
  }
}

export function alleVerweisZiele(daten: ProjektDaten): VerweisVorschlag[] {
  const liste: VerweisVorschlag[] = [];
  const art = verweisArten();
  const englisch = sprache() === 'en';
  const figuren = Object.values(daten.figuren).sort((a, b) => (a.rolle === b.rolle ? vergleich(a.name, b.name) : a.rolle === 'haupt' ? -1 : 1));
  for (const fig of figuren) liste.push({ typ: 'figur', id: fig.id, anzeige: fig.name, art: art.figur, suche: [fig.name, ...fig.aliase] });
  for (const o of Object.values(daten.orte).sort((a, b) => vergleich(a.name, b.name)))
    liste.push({ typ: 'ort', id: o.id, anzeige: o.name, art: art.ort, suche: [o.name, ...o.aliase] });
  daten.projekt.kapitel.forEach((id, i) => {
    const titel = daten.kapitel[id]?.titel ?? daten.plaene[id]?.titel ?? id;
    const nr = i + 1;
    // „Kap. 2“/„Kapitel 2“ immer, in der englischen Oberfläche auch „Ch. 2“/„Chapter 2“
    const suche = [titel, `Kap. ${nr}`, `Kapitel ${nr}`, ...(englisch ? [`Ch. ${nr}`, `Chapter ${nr}`] : [])];
    liste.push({ typ: 'kapitel', id, anzeige: `${kapKurz(nr)} · ${titel}`, art: art.kapitel, suche });
  });
  for (const id of daten.projekt.kapitel) {
    const p = daten.plaene[id];
    if (p?.szene) liste.push({ typ: 'plan', id, anzeige: p.szene, art: art.plan, suche: [p.szene, p.titel] });
  }
  for (const i of daten.ideen) liste.push({ typ: 'idee', id: i.id, anzeige: i.titel, art: art.idee, suche: [i.titel] });
  for (const g of Object.values(daten.gruppen)) liste.push({ typ: 'gruppe', id: g.id, anzeige: g.name, art: art.gruppe, suche: [g.name] });
  return liste;
}

const klein = (s: string) => s.toLocaleLowerCase('de');

function trefferWert(v: VerweisVorschlag, anfrage: string): number {
  let bester = Infinity;
  for (const s of v.suche) {
    const t = klein(s);
    if (t.startsWith(anfrage)) bester = Math.min(bester, 0);
    else if (t.split(/[\s\-–·.,»«„“]+/).some((w) => w.startsWith(anfrage))) bester = Math.min(bester, 1);
    else if (t.includes(anfrage)) bester = Math.min(bester, 2);
  }
  return bester;
}

/** Gehört der Vorschlag zum Kontext (z. B. Kapitel und Plan-Karten, in denen die Figur vorkommt)? */
function kontextWert(v: VerweisVorschlag, kontext: Verweis, daten: ProjektDaten): number {
  if (v.typ === kontext.typ && v.id === kontext.id) return 0;
  if (kontext.typ === 'figur' || kontext.typ === 'ort') {
    const p = daten.plaene[v.id];
    const drin = (p?: { figuren: Id[]; orte: Id[] }) => !!p && (kontext.typ === 'figur' ? p.figuren : p.orte).includes(kontext.id);
    const kapitelTitel = klein(daten.kapitel[v.id]?.titel ?? '');
    const name = klein(zielName(daten, kontext) ?? '');
    if (v.typ === 'kapitel' && name && kapitelTitel.includes(name)) return 1;
    if (v.typ === 'plan' && drin(p) && name && klein(p!.szene).includes(name)) return 2;
    if (v.typ === 'kapitel' && drin(p)) return 3;
    if (v.typ === 'plan' && drin(p)) return 4;
  }
  return Infinity;
}

/** Vorschläge für die Anfrage hinter `[[` (leer = alle, bei Kontext die passenden zuerst). */
export function verweisVorschlaege(daten: ProjektDaten, anfrage: string, kontext?: Verweis | null, max = 8): VerweisVorschlag[] {
  const alle = alleVerweisZiele(daten);
  const q = klein(anfrage.trim());
  const bewertet = alle.map((v, reihenfolge) => ({
    v,
    reihenfolge,
    wert: q ? trefferWert(v, q) : 0,
    kontext: kontext ? kontextWert(v, kontext, daten) : Infinity,
  }));
  return bewertet
    .filter((b) => b.wert < Infinity)
    .sort((a, b) => a.wert - b.wert || a.kontext - b.kontext || a.reihenfolge - b.reihenfolge)
    .slice(0, max)
    .map((b) => b.v);
}

/** Offene `[[`-Anfrage direkt vor dem Cursor, sonst null. */
export function offeneAnfrage(text: string, cursor: number): { start: number; anfrage: string } | null {
  const davor = text.slice(0, cursor);
  const start = davor.lastIndexOf('[[');
  if (start < 0) return null;
  const anfrage = davor.slice(start + 2);
  if (/[\]\n]/.test(anfrage) || anfrage.length > 40) return null;
  return { start, anfrage };
}

/** Ersetzt die offene Anfrage durch den Verweis; liefert neuen Text und Cursor. */
export function verweisEinsetzen(text: string, cursor: number, v: VerweisVorschlag): { text: string; cursor: number } {
  const offen = offeneAnfrage(text, cursor);
  const start = offen ? offen.start : cursor;
  const einfuegen = verweisText(v, v.anzeige);
  const neu = text.slice(0, start) + einfuegen + text.slice(cursor);
  return { text: neu, cursor: start + einfuegen.length };
}

/** Kapitel, auf die eine Notiz verweist: `[[kapitel:…]]` und „Kap. 2“ / „Kapitel 2“ im Text. */
export function kapitelVerweise(text: string, daten: ProjektDaten): Id[] {
  const ids: Id[] = [];
  for (const t of verweiseZerlegen(text)) {
    if (t.art === 'verweis' && (t.verweis.typ === 'kapitel' || t.verweis.typ === 'plan') && daten.projekt.kapitel.includes(t.verweis.id)) ids.push(t.verweis.id);
    if (t.art === 'text')
      for (const m of t.text.matchAll(/\b(?:Kap(?:itel|\.)|Ch(?:apter|\.))\s*(\d{1,3})\b/g)) {
        const id = daten.projekt.kapitel[Number(m[1]) - 1];
        if (id) ids.push(id);
      }
  }
  return [...new Set(ids)];
}

/** Ziel öffnen (Klick auf einen Verweis). */
export function verweisOeffnen(store: Pick<Store, 'oeffne'>, v: Verweis): void {
  const ziel: Record<VerweisTyp, [Bereich, Partial<Store['auswahl']>]> = {
    figur: ['figuren', { figur: v.id }],
    ort: ['orte', { ort: v.id }],
    kapitel: ['schreiben', { kapitel: v.id }],
    plan: ['akte', { plan: v.id }],
    idee: ['akte', {}],
    gruppe: ['beziehungen', { gruppe: v.id }],
  };
  const [bereich, auswahl] = ziel[v.typ];
  store.oeffne(bereich, auswahl);
}
