/** Lokale Volltextsuche. Keine KI, kein DOM und keine Dateizugriffe. */
import type { ProjektDaten } from '../model/types';
import { bloecke, klartext } from '../text';

export interface SuchOptionen { ganzesWort?: boolean; case?: boolean }
export interface TextTreffer { start: number; ende: number; kontext: string; stellen: number[]; verweis: boolean }
export interface SuchFeld { pfad: string[]; text: string; markdown: boolean; bereich: 'manuskript' | 'plan' | 'notizen'; titel: string; kapitel?: string; nummer?: number }
export interface ProjektTreffer extends TextTreffer { feld: SuchFeld }
const WORT = /[\p{L}\p{M}\p{N}]/u;

function sichtbarerText(text: string, markdown: boolean) {
  let sichtbar = ''; const stellen: number[] = []; const verweise = new Set<number>();
  if (markdown) {
    const zeilen = text.split('\n'); let offset = 0;
    const offsets = zeilen.map(z => { const n = offset; offset += z.length + 1; return n; });
    for (const b of bloecke(text)) {
      if (!b.text.trim() || !b.zeilen) continue;
      if (sichtbar) { sichtbar += '\n\n'; stellen.push(-1, -1); }
      const [von, bis] = b.zeilen;
      let pos = offsets[von]!;
      const ende = offsets[bis] ?? text.length;
      if (b.art === 'ueberschrift') pos += /^( {0,3}#{1,6}[ \t]*)/.exec(text.slice(pos))?.[0].length ?? 0;
       for (const c of b.text.split('')) {
         while (pos < ende && text[pos] !== c && !(c === ' ' && text[pos] === '\n')) pos++;
        stellen.push(pos < ende ? pos : -1); sichtbar += c; pos++;
      }
    }
  } else { sichtbar = text; for (let i = 0; i < text.length; i++) stellen.push(i); }
  // Verweise sind in Plan-/Notizfeldern Klartext, keine Markdown-Auszeichnung.
  if (!markdown) {
    let neu = ''; const karte: number[] = [];
    let letzte = 0;
    for (const m of text.matchAll(/\[\[(figur|ort|kapitel|plan|idee|gruppe):([^|\]\n]+)(?:\|([^\]\n]*))?\]\]/g)) {
      const i = m.index; neu += text.slice(letzte, i); karte.push(...stellen.slice(letzte, i));
      if (m[3] !== undefined) {
        const start = i + m[0].indexOf('|') + 1;
        for (let k = 0; k < m[3].length; k++) { verweise.add(neu.length); neu += m[3][k]; karte.push(start + k); }
      } else { neu += '\u0000'; karte.push(-1); }
      letzte = i + m[0].length;
    }
    neu += text.slice(letzte); karte.push(...stellen.slice(letzte)); sichtbar = neu; stellen.splice(0, stellen.length, ...karte);
  }
  return { sichtbar, stellen, verweise };
}

export function sucheText(text: string, suche: string, optionen: SuchOptionen = {}, markdown = false): TextTreffer[] {
  if (!suche || suche.includes('\n')) return [];
  const { sichtbar, stellen, verweise } = sichtbarerText(text, markdown);
  const muster = new RegExp(suche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), optionen.case ? 'gu' : 'giu');
  const ergebnis: TextTreffer[] = [];
  for (const m of sichtbar.matchAll(muster)) {
    const start = m.index; const ende = start + m[0].length;
    const vor = Array.from(sichtbar.slice(0, start)).at(-1) ?? '';
    const nach = Array.from(sichtbar.slice(ende))[0] ?? '';
    if (optionen.ganzesWort && (WORT.test(vor) || WORT.test(nach))) continue;
    const karte = stellen.slice(start, ende);
    if (karte.some(i => i < 0) || sichtbar.slice(start, ende).includes('\n')) continue;
     const absatzStart = sichtbar.lastIndexOf('\n\n', start);
     const links = Math.max(absatzStart < 0 ? 0 : absatzStart + 2, start - 48);
    const absatzEnde = sichtbar.indexOf('\n\n', ende);
    const rechts = Math.min(absatzEnde < 0 ? sichtbar.length : absatzEnde, ende + 48);
     ergebnis.push({ start, ende, stellen: karte, kontext: sichtbar.slice(links, rechts), verweis: karte.some((_, i) => verweise.has(start + i)) });
  }
  return ergebnis;
}

export function ersetzeTreffer(text: string, treffer: TextTreffer[], ersatz: string, markdown = false): string {
  if (treffer.some(t => t.verweis) && /[\]|\n]/.test(ersatz)) throw new Error('verweis');
   const wert = markdown ? ersatz.replace(/([\\*_#=\-])/g, '\\$1') : ersatz;
  for (const t of [...treffer].sort((a,b) => b.start-a.start)) {
    let erste = t.stellen[0]!;
    const loeschen = new Set(t.stellen);
    if (markdown) for (const pos of t.stellen) {
      let n = 0; for (let i = pos-1; i >= 0 && text[i] === '\\'; i--) n++;
      if (n % 2 && /[!-/:-@[-`{-~]/.test(text[pos]!)) {loeschen.add(pos-1); erste = Math.min(erste,pos-1);}
    }
    if (markdown) {
      const sichtbar = new Set(sichtbarerText(text,true).stellen);
      const offen = new Map<string,number>();
      for (const m of text.matchAll(/\*+|_+/g)) {
        if ([...m[0]].some((_,i) => sichtbar.has(m.index+i))) continue;
        const anfang = offen.get(m[0]);
        if (anfang === undefined) {offen.set(m[0],m.index);continue;}
        offen.delete(m[0]);
        const innen = [...sichtbar].filter(p => p >= anfang+m[0].length && p < m.index);
        const ersatzInnen = wert && erste >= anfang+m[0].length && erste < m.index;
        if (innen.length && innen.every(p => loeschen.has(p)) && !ersatzInnen) {
          for (let i = 0; i < m[0].length; i++) {loeschen.add(anfang+i);loeschen.add(m.index+i);}
        }
      }
    }
    // Löschpositionen rechts nach links; der Einfügepunkt wandert mit entfernten Öffnern.
    let einfuegen = erste;
    for (const pos of [...loeschen].sort((a,b) => b-a)) {
      text = text.slice(0,pos) + text.slice(pos+1);
      if (pos < erste) einfuegen--;
    }
    text = text.slice(0,einfuegen) + wert + text.slice(einfuegen);
  }
  return text;
}
export function ersetzeText(text: string, suche: string, ersatz: string, optionen: SuchOptionen = {}, markdown = false): string {
  return ersetzeTreffer(text, sucheText(text, suche, optionen, markdown), ersatz, markdown);
}

export function feldWert(d: ProjektDaten, pfad: string[]): string {
  let w: unknown = d; for (const k of pfad) w = (w as Record<string, unknown>)?.[k]; return typeof w === 'string' ? w : '';
}
export function setzeFeld(d: ProjektDaten, pfad: string[], wert: string): ProjektDaten {
  const kopie = (obj: unknown, i: number): unknown => {
    const o = obj as Record<string, unknown>;
    const neu = Array.isArray(obj) ? [...obj] : { ...o };
    (neu as Record<string, unknown>)[pfad[i]!] = i === pfad.length-1 ? wert : kopie(o[pfad[i]!] , i+1);
    return neu;
  };
  return kopie(d, 0) as ProjektDaten;
}

/** Explizite Freitext-Allowlist: niemals IDs, Anker, Status, Farben oder KI-Ablagen. */
export function projektFelder(d: ProjektDaten): SuchFeld[] {
  const felder: SuchFeld[] = [];
  const add = (pfad: string[], bereich: SuchFeld['bereich'], titel: string, markdown = false, kapitel?: string, nummer?: number) => {
    const text = feldWert(d,pfad); if (text) felder.push({pfad, text, bereich, titel, markdown, kapitel, nummer});
  };
  d.projekt.kapitel.forEach((id,i) => add(['kapitel',id,'text'], 'manuskript', d.kapitel[id]?.titel ?? id, true, id, i+1));
   const freitext = new Set(['titel','name','szene','funktion','quintessenz','wendepunkt','wendung','beschreibung','kurz','art','kategorie','autor','untertitel','genre','gueltig']);
  const notizen = new Set(['notiz','notizen','wahrheit','alterPlan']);
  const listen = new Set(['aliase','formen','ignoriert','schlagworte','varianten']);
  const strukturen = new Set(['abweichungen','realitaet','szenen','zeit','beziehungen','spitznamen','spuren','zustaende','zustandsarten','faeden','stufen','marken','eintraege','angaben','zusammenfassungen','schreibweisen']);
  const walk = (obj: unknown, pfad: string[], titel: string) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach((v,i) => walk(v,[...pfad,String(i)],titel)); return; }
     for (const [k,v] of Object.entries(obj)) {
       const p = [...pfad,k];
       // Gleichnamige Felder sind nicht überall Freitext: Szene am Zustand ist eine ID.
       if (k === 'szene' && pfad[0] !== 'plaene') continue;
       if (k === 'kategorie' && pfad[0] !== 'marken') continue;
       if (k === 'art' && pfad[0] === 'recherche') continue;
      if (typeof v === 'string' && (freitext.has(k) || notizen.has(k) || k === 'text')) add(p, notizen.has(k) || pfad[0] === 'recherche' ? 'notizen' : 'plan', titel);
      else if (listen.has(k) && Array.isArray(v)) v.forEach((_,i) => add([...p,String(i)],'plan',titel));
      else if (k === 'plan' || k === 'praesenz' || k === 'rollen') { for (const key of Object.keys(v ?? {})) add([...p,key], 'plan', titel); }
      else if (strukturen.has(k)) walk(v,p,titel);
    }
  };
  walk(d.projekt,['projekt'],d.projekt.titel);
  for (const key of ['plaene','figuren','orte','gruppen'] as const) for (const [id,v] of Object.entries(d[key])) walk(v,[key,id], 'name' in v ? v.name : v.titel);
   for (const key of ['akte','straenge','ideen','motive','anmerkungen','zeitleiste','fadenplanung','boegen','marken','recherche','entscheidungen'] as const) walk(d[key],[key],key);
  return felder;
}
export function sucheProjekt(d: ProjektDaten, suche: string, optionen: SuchOptionen = {}): ProjektTreffer[] {
  return projektFelder(d).flatMap(feld => sucheText(feld.text,suche,optionen,feld.markdown).map(t => ({...t,feld})));
}
export { klartext };
