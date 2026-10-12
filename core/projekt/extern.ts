/**
 * Von außen geänderte Dateien übernehmen (Obsidian, OneDrive …): nur die Teile von `neu`, die zu den
 * geänderten Pfaden gehören; alles andere bleibt der Stand im Speicher (der kann neuer sein als die
 * Platte, z. B. während eines laufenden Schreibvorgangs).
 */
import type { Id, ProjektDaten } from '../model/types';
import { idAusPfad, PFADE, standardPlan } from './lesen';

function ersetze<T>(alt: Record<Id, T>, neu: Record<Id, T>, id: Id): Record<Id, T> {
  const ergebnis = { ...alt };
  const wert = neu[id];
  if (wert === undefined) delete ergebnis[id];
  else ergebnis[id] = wert;
  return ergebnis;
}

/** Optionale Felder (KI-Ablagen): Wert aus `neu` übernehmen, fehlt er dort, entfällt das Feld. */
function feldUebernehmen<K extends keyof ProjektDaten>(d: ProjektDaten, neu: ProjektDaten, feld: K): ProjektDaten {
  const ergebnis = { ...d };
  if (neu[feld] === undefined) delete ergebnis[feld];
  else ergebnis[feld] = neu[feld];
  return ergebnis;
}

/** Werkzeug-Dateien (G1–G8): Pfad → Feld in ProjektDaten */
const WERKZEUG_DATEIEN: [string, keyof ProjektDaten][] = [
  [PFADE.zeitleiste, 'zeitleiste'],
  [PFADE.faeden, 'fadenplanung'],
  [PFADE.boegen, 'boegen'],
  [PFADE.marken, 'marken'],
  [PFADE.statistik, 'statistik'],
  [PFADE.fassungen, 'fassungen'],
  [PFADE.lektorat, 'lektorat'],
  [PFADE.recherche, 'recherche'],
  [PFADE.kiZeit, 'kiZeitVorschlaege'],
  [PFADE.kiZustand, 'kiZustandVorschlaege'],
  [PFADE.kiStimmen, 'kiStimmen'],
  [PFADE.kiLeser, 'kiLeser'],
  [PFADE.kiFragen, 'kiFragen'],
];

const imOrdner = (pfad: string, ordner: string, endung: string) =>
  pfad.startsWith(`${ordner}/`) && pfad.endsWith(endung) && !pfad.slice(ordner.length + 1).includes('/');

export function uebernehmeExterneAenderungen(alt: ProjektDaten, neu: ProjektDaten, pfade: string[]): ProjektDaten {
  let d: ProjektDaten = alt;
  const kapitelBetroffen = new Set<Id>();
  for (const pfad of pfade) {
    const werkzeug = WERKZEUG_DATEIEN.find(([p]) => p === pfad);
    if (werkzeug) d = feldUebernehmen(d, neu, werkzeug[1]);
    else if (pfad === PFADE.projekt) d = { ...d, projekt: neu.projekt };
    else if (pfad === PFADE.akte) d = { ...d, akte: neu.akte };
    else if (pfad === PFADE.straenge) d = { ...d, straenge: neu.straenge };
    else if (pfad === PFADE.ideen) d = { ...d, ideen: neu.ideen };
    else if (pfad === PFADE.motive) d = { ...d, motive: neu.motive };
    else if (pfad === PFADE.anmerkungen) d = { ...d, anmerkungen: neu.anmerkungen };
    else if (pfad === PFADE.entscheidungen) d = { ...d, entscheidungen: neu.entscheidungen };
    else if (pfad === PFADE.hinweise) d = { ...d, kiHinweise: neu.kiHinweise };
    else if (pfad === PFADE.vorschlaege) {
      const { kiVorschlaege: _alt, ...rest } = d;
      void _alt;
      d = neu.kiVorschlaege ? { ...rest, kiVorschlaege: neu.kiVorschlaege } : rest;
    }
    else if (imOrdner(pfad, PFADE.manuskript, '.md')) {
      const id = idAusPfad(pfad);
      kapitelBetroffen.add(id);
      d = { ...d, kapitel: ersetze(d.kapitel, neu.kapitel, id) };
    } else if (imOrdner(pfad, PFADE.planKapitel, '.md')) {
      const id = idAusPfad(pfad);
      kapitelBetroffen.add(id);
      d = { ...d, plaene: ersetze(d.plaene, neu.plaene, id) };
    } else if (imOrdner(pfad, PFADE.figuren, '.md')) d = { ...d, figuren: ersetze(d.figuren, neu.figuren, idAusPfad(pfad)) };
    else if (imOrdner(pfad, PFADE.gruppen, '.md')) d = { ...d, gruppen: ersetze(d.gruppen, neu.gruppen, idAusPfad(pfad)) };
    else if (imOrdner(pfad, PFADE.orte, '.md')) d = { ...d, orte: ersetze(d.orte, neu.orte, idAusPfad(pfad)) };
    else if (imOrdner(pfad, PFADE.analysen, '.json')) d = { ...d, analysen: ersetze(d.analysen, neu.analysen, idAusPfad(pfad)) };
  }

  // Neue Kapitel (Datei von außen angelegt) hinten anhängen, wie beim Laden
  if (kapitelBetroffen.size && !pfade.includes(PFADE.projekt)) {
    const dazu = neu.projekt.kapitel.filter((id) => kapitelBetroffen.has(id) && !d.projekt.kapitel.includes(id));
    if (dazu.length) d = { ...d, projekt: { ...d.projekt, kapitel: [...d.projekt.kapitel, ...dazu] } };
  }
  // Jedes Kapitel der Reihenfolge hat Text-Eintrag und Plan (wie ladeProjekt)
  const fehlend = d.projekt.kapitel.filter((id) => !d.kapitel[id] || !d.plaene[id]);
  if (fehlend.length) {
    const kapitel = { ...d.kapitel };
    const plaene = { ...d.plaene };
    for (const id of fehlend) {
      const k = kapitel[id] ?? neu.kapitel[id] ?? { id, titel: plaene[id]?.titel || id, text: '' };
      kapitel[id] = k;
      plaene[id] ??= neu.plaene[id] ?? standardPlan(k);
    }
    d = { ...d, kapitel, plaene };
  }
  return d;
}
