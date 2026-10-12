/**
 * Deep-Link über den URL-Hash, z. B. `#bereich=schreiben&kapitel=9` oder `#bereich=figuren&figur=Lotte`.
 * Dient Screenshots und dem Design-Abgleich; Nummern zählen ab 1 in Buchreihenfolge, sonst ID oder Name.
 *
 *   bereich  schreiben | kapitel | akte | figuren | beziehungen | orte | hinweise
 *            | zeitleiste | faeden | statistik | recherche | fragen
 *   kapitel  Kapitelnummer, ID oder Titel        plan  dasselbe für die Plan-Karte im Akt-Board
 *   figur    ID oder Name                        ort   ID oder Name
 *   stand    Netz-Stand: Kapitelnummer oder akt1, akt2 …
 *   fokus    1 = Fokus-Modus                     dialog  import | export | versionen | ki-pruefen | ki-einstellungen
 *            (und die Werkzeug-Dialoge: zeit-vorschlaege, stimme-pruefen, marken, fassung, versionsvergleich,
 *             leser-simulation, abgabe-export, rueckimport, recherche-eintrag)
 */
import type { Id, ProjektDaten } from '@core/model/types';
import type { Auswahl, DialogId, Store } from '../state/store';
import { BEREICHE } from './bereiche';

const DIALOGE: DialogId[] = [
  'import',
  'export',
  'versionen',
  'ki-pruefen',
  'ki-einstellungen',
  'schnellsuche',
  'zeit-vorschlaege',
  'stimme-pruefen',
  'marken',
  'fassung',
  'versionsvergleich',
  'leser-simulation',
  'abgabe-export',
  'rueckimport',
  'recherche-eintrag',
];

function klein(s: string): string {
  return s.trim().toLocaleLowerCase('de');
}

function kapitelAus(daten: ProjektDaten, wert: string): Id | undefined {
  const reihe = daten.projekt.kapitel;
  if (/^\d+$/.test(wert)) return reihe[Number(wert) - 1];
  if (daten.kapitel[wert]) return wert;
  return reihe.find((id) => klein(daten.kapitel[id]?.titel ?? '') === klein(wert));
}

function benanntAus<T extends { id: Id; name: string }>(eintraege: Record<Id, T>, wert: string): Id | undefined {
  if (eintraege[wert]) return wert;
  const alle = Object.values(eintraege);
  return (alle.find((e) => klein(e.name) === klein(wert)) ?? alle.find((e) => klein(e.name).includes(klein(wert))))?.id;
}

function standAus(daten: ProjektDaten, wert: string): Id | null | undefined {
  const akt = /^akt\s*(\d+)$/i.exec(wert);
  if (!akt) return kapitelAus(daten, wert);
  const nummer = Number(akt[1]);
  const imAkt = daten.projekt.kapitel.filter((id) => daten.plaene[id]?.akt === nummer);
  return imAkt[imAkt.length - 1];
}

/** Wendet den Hash auf den Zustand an. Unbekannte oder nicht auflösbare Werte werden ignoriert. */
export function deepLinkAnwenden(hash: string, s: Store): void {
  const daten = s.daten;
  if (!daten || hash.replace(/^#/, '') === '') return;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const auswahl: Partial<Auswahl> = {};
  const kapitel = p.get('kapitel');
  if (kapitel) auswahl.kapitel = kapitelAus(daten, kapitel);
  const plan = p.get('plan');
  if (plan) auswahl.plan = kapitelAus(daten, plan);
  const figur = p.get('figur');
  if (figur) auswahl.figur = benanntAus(daten.figuren, figur);
  const ort = p.get('ort');
  if (ort) auswahl.ort = benanntAus(daten.orte, ort);
  for (const k of Object.keys(auswahl) as (keyof Auswahl)[]) if (auswahl[k] === undefined) delete auswahl[k];

  const bereich = BEREICHE.find((b) => b.id === p.get('bereich'))?.id ?? s.bereich;
  s.oeffne(bereich, auswahl);

  const stand = p.get('stand');
  if (stand) {
    const id = standAus(daten, stand);
    if (id !== undefined) s.setzeNetzStand(id);
  }
  const fokus = p.get('fokus');
  if (fokus !== null && (fokus === '1') !== s.fokusModus) s.umschalteFokus();
  const dialog = p.get('dialog') as DialogId | null;
  if (dialog && DIALOGE.includes(dialog)) s.oeffneDialog(dialog);
}
