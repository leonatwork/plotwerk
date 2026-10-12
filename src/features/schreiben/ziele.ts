/** Figuren im Fokus einer Szene und Beschriftung von Notiz-Zielen. */
import type { Figur, Id, KapitelPlan, ProjektDaten, Verweis } from '@core/model/types';
import { f, texte } from '../../i18n';
import { kapitelAnzeige, zielName } from './verweise';

/** Ich-Erzähler (steht in jeder Szene, ist daher nie „Figur im Fokus“). */
export function istErzaehler(f: Figur): boolean {
  if (/erzähler|narrator/i.test(f.kurz ?? '')) return true;
  return Object.entries(f.plan).some(([feld, wert]) => /rolle|role/i.test(feld) && /erzähler|narrator/i.test(wert));
}

/**
 * Hauptfiguren der geplanten Szene: Figuren des Kapitelplans außer dem Ich-Erzähler
 * (im Screen: „Paul trifft Lotte“ → Lotte akzentuiert, Paul neutral).
 */
export function fokusFiguren(plan: KapitelPlan | undefined, figuren: Record<Id, Figur>): Set<Id> {
  return new Set((plan?.figuren ?? []).filter((id) => figuren[id] && !istErzaehler(figuren[id]!)));
}

export function notizFarbe(ziel: Verweis | null, fokus: Set<Id>): 'gelb' | 'rosa' {
  return ziel?.typ === 'figur' && fokus.has(ziel.id) ? 'rosa' : 'gelb';
}

/** Präposition je Ziel (Schlüssel in t.schreiben.notizen) */
const PRAEPOSITION: Record<Verweis['typ'], 'an' | 'zu' | 'zur'> = {
  figur: 'an',
  ort: 'zu',
  kapitel: 'zu',
  plan: 'zur',
  idee: 'zur',
  gruppe: 'zu',
};

/** „Notiz an Paul“, „Notiz zu Lindenhof“, „Notiz zum Kapitel“ … (in der Oberflächensprache) */
export function notizKopf(daten: ProjektDaten, ziel: Verweis | null, kapitel: Id, neu = false): { praefix: string; name: string } {
  const T = texte().schreiben.notizen;
  const notiz = neu ? T.neueNotiz : T.notiz;
  if (!ziel) return { praefix: notiz, name: '' };
  if (ziel.typ === 'kapitel' && ziel.id === kapitel) return { praefix: f(T.zum, { notiz }), name: T.kapitel };
  if (ziel.typ === 'plan' && ziel.id === kapitel) return { praefix: f(T.zur, { notiz }), name: T.planKarte };
  if (ziel.typ === 'idee') return { praefix: f(T.zurIdee, { notiz }), name: zielName(daten, ziel) ?? ziel.id };
  if (ziel.typ === 'plan') return { praefix: f(T.zurPlanKarte, { notiz }), name: kapitelAnzeige(daten, ziel.id) };
  return { praefix: f(T[PRAEPOSITION[ziel.typ]], { notiz }), name: zielName(daten, ziel) ?? ziel.id };
}

export function verweisSchluessel(v: Verweis | null): string {
  return v ? `${v.typ}:${v.id}` : '';
}

export function schluesselVerweis(s: string): Verweis | null {
  const i = s.indexOf(':');
  if (i < 0) return null;
  return { typ: s.slice(0, i) as Verweis['typ'], id: s.slice(i + 1) };
}
