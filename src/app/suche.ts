import type { Id, ProjektDaten } from '@core/model/types';
import type { Auswahl, Bereich } from '../state/store';
import type { Befehl } from './befehle';
import { BEREICHE } from './bereiche';

export interface Treffer {
  art: 'kapitel' | 'figur' | 'ort' | 'bereich' | 'befehl';
  id: Id;
  titel: string;
  /** Zusatz rechts, z. B. „Kap. 9“ oder „Figur“ */
  zusatz: string;
  bereich: Bereich;
  auswahl: Partial<Auswahl>;
  /** art 'befehl': statt oeffne(bereich, auswahl) diesen Befehl ausführen */
  befehl?: Befehl;
}

/** Befehle in der Schnellsuche (nur bei passender Eingabe) */
const BEFEHLE: { befehl: Befehl; titel: string; zusatz: string; woerter: string[] }[] = [
  { befehl: 'vorschau', titel: 'Buch-Vorschau', zusatz: '⌘⇧B', woerter: ['Vorschau', 'Lesevorschau', 'E-Book', 'Buch'] },
  // Werkzeuge G1–G8
  { befehl: 'zeit-vorschlaege', titel: 'Zeitpunkte vorschlagen …', zusatz: 'KI', woerter: ['Zeitleiste', 'Zeit', 'Zustand', 'Wann'] },
  { befehl: 'stimme-pruefen', titel: 'Figurenstimme prüfen …', zusatz: 'KI', woerter: ['Stimme', 'Ton', 'Figur', 'Rede'] },
  { befehl: 'marken', titel: 'Markennamen …', zusatz: 'Lektorat', woerter: ['Marken', 'Markenliste', 'Lektorat'] },
  { befehl: 'typewriter', titel: 'Typewriter-Modus', zusatz: '⌘⇧T', woerter: ['Schreibmaschine', 'Zeile mittig', 'Fokus'] },
  { befehl: 'wiederholungen', titel: 'Wiederholungen markieren', zusatz: 'Editor', woerter: ['Wortwiederholung', 'Satzanfänge', 'häufige Wörter'] },
  { befehl: 'vorlesen', titel: 'Vorlesen', zusatz: 'Editor', woerter: ['Stimme', 'vorlesen', 'Sprachausgabe'] },
  { befehl: 'fassung', titel: 'Fassung sichern …', zusatz: '⌘⇧S', woerter: ['Schnappschuss', 'Version', 'benennen', 'Lektorat'] },
  { befehl: 'versionsvergleich', titel: 'Fassungen vergleichen …', zusatz: 'Versionen', woerter: ['Vergleich', 'Diff', 'nebeneinander'] },
  { befehl: 'leser-simulation', titel: 'Leser-Simulation …', zusatz: 'KI', woerter: ['Leser', 'Was weiß der Leser', 'offene Fragen'] },
  { befehl: 'abgabe', titel: 'Für die Abgabe exportieren …', zusatz: 'Export', woerter: ['Normseite', 'Exposé', 'EPUB', 'Lektoratsmappe', 'Abgabe'] },
  { befehl: 'rueckimport', titel: 'Lektorat aus Word übernehmen …', zusatz: 'Import', woerter: ['Rückimport', 'Änderungen', 'Kommentare', 'Word'] },
  { befehl: 'faden-neu', titel: 'Neuer Faden …', zusatz: 'Fäden', woerter: ['Faden', 'Lose Enden', 'Handlungsfaden', 'anlegen'] },
  { befehl: 'recherche-neu', titel: 'Recherche-Eintrag anlegen …', zusatz: 'Recherche', woerter: ['Bild', 'Link', 'Notiz', 'Recherche'] },
];

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
    for (const f of suchformen(t))
      for (const q of fragen) {
        if (f.startsWith(q)) best = Math.max(best, 3);
        else if (f.split(/[\s\-–·]+/).some((w) => w.startsWith(q))) best = Math.max(best, 2);
        else if (f.includes(q)) best = Math.max(best, 1);
      }
  return best;
}

/** Schnellsuche über Kapitel, Figuren, Orte, Werkzeug-Bereiche und Befehle (je höchstens `max` Treffer). */
export function suche(daten: ProjektDaten, eingabe: string, max = 8): Treffer[] {
  const anfrage = eingabe.trim();
  const bewertet: { t: Treffer; punkte: number; rang: number }[] = [];
  daten.projekt.kapitel.forEach((id, i) => {
    const k = daten.kapitel[id];
    if (!k) return;
    const nummern = /\d/.test(anfrage) ? [String(i + 1), `kap ${i + 1}`, `kap. ${i + 1}`] : [];
    const punkte = passt(anfrage, k.titel, ...nummern);
    if (punkte)
      bewertet.push({
        t: { art: 'kapitel', id, titel: k.titel, zusatz: `Kap. ${i + 1}`, bereich: 'schreiben', auswahl: { kapitel: id } },
        punkte,
        rang: 0,
      });
  });
  for (const f of Object.values(daten.figuren)) {
    const punkte = passt(anfrage, f.name, ...f.aliase);
    if (punkte)
      bewertet.push({ t: { art: 'figur', id: f.id, titel: f.name, zusatz: 'Figur', bereich: 'figuren', auswahl: { figur: f.id } }, punkte, rang: 1 });
  }
  for (const o of Object.values(daten.orte)) {
    const punkte = passt(anfrage, o.name, ...o.aliase);
    if (punkte)
      bewertet.push({ t: { art: 'ort', id: o.id, titel: o.name, zusatz: 'Ort', bereich: 'orte', auswahl: { ort: o.id } }, punkte, rang: 2 });
  }
  if (anfrage)
    for (const b of BEREICHE.filter((x) => x.gruppe === 'werkzeuge')) {
      const punkte = passt(anfrage, b.titel, ...(b.suchwoerter ?? []));
      if (punkte)
        bewertet.push({ t: { art: 'bereich', id: b.id, titel: b.titel, zusatz: b.taste ? `⌘${b.taste}` : 'Werkzeug', bereich: b.id, auswahl: {} }, punkte, rang: 3 });
    }
  if (anfrage)
    for (const b of BEFEHLE) {
      const punkte = passt(anfrage, b.titel, ...b.woerter);
      if (punkte)
        bewertet.push({ t: { art: 'befehl', id: b.befehl, titel: b.titel, zusatz: b.zusatz, bereich: 'schreiben', auswahl: {}, befehl: b.befehl }, punkte, rang: 4 });
    }
  const ergebnis: Treffer[] = [];
  for (const art of ['kapitel', 'figur', 'ort', 'bereich', 'befehl'] as const) {
    const teil = bewertet
      .filter((b) => b.t.art === art)
      .sort((a, b) => b.punkte - a.punkte || (anfrage ? a.t.titel.localeCompare(b.t.titel, 'de') : 0))
      .slice(0, max)
      .map((b) => b.t);
    ergebnis.push(...teil);
  }
  if (anfrage) ergebnis.sort((a, b) => (bewertet.find((x) => x.t === b)?.punkte ?? 0) - (bewertet.find((x) => x.t === a)?.punkte ?? 0));
  return ergebnis;
}
