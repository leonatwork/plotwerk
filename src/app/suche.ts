import type { Id, ProjektDaten } from '@core/model/types';
import { f, sprache, texte, vergleich, woerterbuch, type Sprache, type Woerterbuch } from '../i18n';
import type { Auswahl, Bereich } from '../state/store';
import type { Befehl } from './befehle';
import { BEREICHE, bereichSuchwoerter, bereichTitel } from './bereiche';

export interface Treffer {
  art: 'kapitel' | 'figur' | 'ort' | 'bereich' | 'befehl';
  id: Id;
  titel: string;
  /** Zusatz rechts, z. B. „Kap. 9“ oder „Figur“ (Oberflächensprache) */
  zusatz: string;
  bereich: Bereich;
  auswahl: Partial<Auswahl>;
  /** art 'befehl': statt oeffne(bereich, auswahl) diesen Befehl ausführen */
  befehl?: Befehl;
}

type BefehlText = keyof Woerterbuch['app']['befehle'];

/** Befehle in der Schnellsuche (nur bei passender Eingabe); Texte aus dem Wörterbuch (app.befehle). */
const BEFEHLE: { befehl: Befehl; text: BefehlText }[] = [
  { befehl: 'vorschau', text: 'vorschau' },
  // Werkzeuge G1–G8
  { befehl: 'zeit-vorschlaege', text: 'zeitVorschlaege' },
  { befehl: 'stimme-pruefen', text: 'stimmePruefen' },
  { befehl: 'straenge-vorschlagen', text: 'straengeVorschlagen' },
  { befehl: 'marken', text: 'marken' },
  { befehl: 'typewriter', text: 'typewriter' },
  { befehl: 'wiederholungen', text: 'wiederholungen' },
  { befehl: 'vorlesen', text: 'vorlesen' },
  { befehl: 'fassung', text: 'fassung' },
  { befehl: 'versionsvergleich', text: 'versionsvergleich' },
  { befehl: 'leser-simulation', text: 'leserSimulation' },
  { befehl: 'abgabe', text: 'abgabe' },
  { befehl: 'rueckimport', text: 'rueckimport' },
  { befehl: 'faden-neu', text: 'fadenNeu' },
  { befehl: 'recherche-neu', text: 'rechercheNeu' },
];

function woerterListe(text: string): string[] {
  return text
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Sprachen, deren Begriffe treffen: die Oberflächensprache, im Englischen zusätzlich die deutschen Begriffe. */
function suchSprachen(): Sprache[] {
  return sprache() === 'de' ? ['de'] : [sprache(), 'de'];
}

function ohneAkzente(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Suchformen: Kleinbuchstaben, einmal „ü→ue“, einmal „ü→u“ (findet „Büro“ mit „buero“ und „buro“). */
export function suchformen(s: string): string[] {
  const klein = s.toLocaleLowerCase('de').replace(/ß/g, 'ss');
  const umschrift = ohneAkzente(klein.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
  const ohne = ohneAkzente(klein);
  return umschrift === ohne ? [ohne] : [umschrift, ohne];
}

function passt(anfrage: string, ...texte: string[]): number {
  if (!anfrage.trim()) return 1;
  const fragen = suchformen(anfrage.trim());
  let best = 0;
  for (const t of texte)
    for (const form of suchformen(t))
      for (const q of fragen) {
        if (form.startsWith(q)) best = Math.max(best, 3);
        else if (form.split(/[\s\-–·]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
        else if (form.includes(q)) best = Math.max(best, 1);
      }
  return best;
}

/** Schnellsuche über Kapitel, Figuren, Orte, Werkzeug-Bereiche und Befehle (je höchstens `max` Treffer). */
export function suche(daten: ProjektDaten, eingabe: string, max = 8): Treffer[] {
  const anfrage = eingabe.trim();
  const t = texte();
  const sprachen = suchSprachen();
  const bewertet: { t: Treffer; punkte: number; rang: number }[] = [];
  daten.projekt.kapitel.forEach((id, i) => {
    const k = daten.kapitel[id];
    if (!k) return;
    const n = i + 1;
    const nummern = /\d/.test(anfrage) ? [String(n), `kap ${n}`, `kap. ${n}`, `kapitel ${n}`, `ch ${n}`, `ch. ${n}`, `chapter ${n}`] : [];
    const punkte = passt(anfrage, k.titel, ...nummern);
    if (punkte)
      bewertet.push({
        t: { art: 'kapitel', id, titel: k.titel, zusatz: f(t.gemeinsam.kapitelKurz, { nr: n }), bereich: 'schreiben', auswahl: { kapitel: id } },
        punkte,
        rang: 0,
      });
  });
  for (const fig of Object.values(daten.figuren)) {
    const punkte = passt(anfrage, fig.name, ...fig.aliase);
    if (punkte)
      bewertet.push({
        t: { art: 'figur', id: fig.id, titel: fig.name, zusatz: t.app.trefferArt.figur, bereich: 'figuren', auswahl: { figur: fig.id } },
        punkte,
        rang: 1,
      });
  }
  for (const o of Object.values(daten.orte)) {
    const punkte = passt(anfrage, o.name, ...o.aliase);
    if (punkte)
      bewertet.push({ t: { art: 'ort', id: o.id, titel: o.name, zusatz: t.app.trefferArt.ort, bereich: 'orte', auswahl: { ort: o.id } }, punkte, rang: 2 });
  }
  if (anfrage)
    for (const b of BEREICHE.filter((x) => x.gruppe === 'werkzeuge')) {
      const begriffe = sprachen.flatMap((s) => [bereichTitel(b.id, s), ...bereichSuchwoerter(b.id, s)]);
      const punkte = passt(anfrage, ...begriffe);
      if (punkte)
        bewertet.push({
          t: { art: 'bereich', id: b.id, titel: b.titel, zusatz: b.taste ? `⌘${b.taste}` : t.app.trefferArt.werkzeug, bereich: b.id, auswahl: {} },
          punkte,
          rang: 3,
        });
    }
  if (anfrage)
    for (const b of BEFEHLE) {
      const text = t.app.befehle[b.text];
      const begriffe = sprachen.flatMap((s) => {
        const w = woerterbuch(s).app.befehle[b.text];
        return [w.titel, ...woerterListe(w.woerter)];
      });
      const punkte = passt(anfrage, ...begriffe);
      if (punkte)
        bewertet.push({ t: { art: 'befehl', id: b.befehl, titel: text.titel, zusatz: text.zusatz, bereich: 'schreiben', auswahl: {}, befehl: b.befehl }, punkte, rang: 4 });
    }
  const ergebnis: Treffer[] = [];
  for (const art of ['kapitel', 'figur', 'ort', 'bereich', 'befehl'] as const) {
    const teil = bewertet
      .filter((b) => b.t.art === art)
      .sort((a, b) => b.punkte - a.punkte || (anfrage ? vergleich(a.t.titel, b.t.titel) : 0))
      .slice(0, max)
      .map((b) => b.t);
    ergebnis.push(...teil);
  }
  if (anfrage) ergebnis.sort((a, b) => (bewertet.find((x) => x.t === b)?.punkte ?? 0) - (bewertet.find((x) => x.t === a)?.punkte ?? 0));
  return ergebnis;
}
