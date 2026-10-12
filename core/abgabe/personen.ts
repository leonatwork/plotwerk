/**
 * Personenverzeichnis (G7 Abgabe): Figuren nach Gruppen oder Rolle, je Eintrag Name, Spitznamen, Kurzbeschreibung
 * und Rolle in der Gruppe. Liefert dieselben Blöcke wie das Exposé (exposeDocx/exposeMarkdown) und als Markdown
 * für einen Vorspann vor EPUB und Normseite. Private Felder (`wahrheit`, `notizen`, Planfelder) kommen nie hinein.
 */
import { fmt, texteJe, type Sprache } from '../i18n';
import type { Figur, Id, Kapitel, ProjektDaten } from '../model/types';
import { nachRolle } from '../figuren/namen';
import type { ExposeBlock, ExposeStueck } from './expose';

const T = texteJe(
  {
    titel: 'Personen',
    haupt: 'Hauptfiguren',
    neben: 'Nebenfiguren',
    statist: 'Weitere Figuren',
    ohneGruppe: 'Weitere Figuren',
    auch: 'auch {namen}',
    zitat: '„{text}“',
    keine: 'Noch keine Figuren.',
  },
  {
    titel: 'Characters',
    haupt: 'Main characters',
    neben: 'Supporting characters',
    statist: 'Other characters',
    ohneGruppe: 'Other characters',
    auch: 'also {namen}',
    zitat: '“{text}”',
    keine: 'No characters yet.',
  },
);

export interface PersonenOptionen {
  /** nach Gruppen (Hauptgruppe) oder nach Rolle */
  gliederung: 'gruppen' | 'rolle';
  /** Statisten aufnehmen (Standard: nein) */
  statisten?: boolean;
  /** Spitznamen nennen (Standard: ja) */
  spitznamen?: boolean;
  /** nur Figuren, die bis zu diesem Kapitel im Text vorkommen (kein Spoiler); fehlt = alle im Text */
  bisKapitel?: Id;
  /** auch Figuren, die noch nicht im Text vorkommen (Standard: nein) */
  geplante?: boolean;
  /** „bewusst vage“ Figuren aufnehmen (Standard: nein – sie sollen offen bleiben) */
  vage?: boolean;
}

/** Figuren für das Verzeichnis (Filter nach Optionen), in Listenreihenfolge. */
export function personenAuswahl(daten: ProjektDaten, erstesVorkommen: Record<Id, Id>, optionen: PersonenOptionen): Figur[] {
  const reihe = daten.projekt.kapitel;
  const bis = optionen.bisKapitel ? reihe.indexOf(optionen.bisKapitel) : reihe.length - 1;
  return Object.values(daten.figuren)
    .filter((f) => optionen.statisten || f.rolle !== 'statist')
    .filter((f) => optionen.vage || f.existenz !== 'bewusst_vage')
    .filter((f) => {
      const erst = erstesVorkommen[f.id];
      if (!erst) return !!optionen.geplante && !optionen.bisKapitel;
      return reihe.indexOf(erst) <= bis;
    })
    .sort(nachRolle((a, b) => a.name.localeCompare(b.name, 'de')));
}

function eintrag(f: Figur, daten: ProjektDaten, optionen: PersonenOptionen, sprache: Sprache): ExposeStueck[] {
  const t = T(sprache);
  const teile: ExposeStueck[] = [{ text: f.name, art: 'fett' }];
  const zusatz: string[] = [];
  if (optionen.spitznamen !== false && f.aliase.length) zusatz.push(fmt(t.auch, { namen: f.aliase.map((a) => fmt(t.zitat, { text: a })).join(', ') }));
  const rolle = f.gruppe ? daten.gruppen[f.gruppe]?.rollen?.[f.id] : undefined;
  const beschreibung = [rolle, f.kurz?.trim()].filter(Boolean).join(', ');
  if (beschreibung) teile.push({ text: ` – ${beschreibung}` });
  if (zusatz.length) teile.push({ text: ` (${zusatz.join('; ')})`, art: 'kursiv' });
  return teile;
}

/** Blöcke des Verzeichnisses (Überschrift, Abschnitte, Einträge als Aufzählung). */
export function personenverzeichnis(daten: ProjektDaten, erstesVorkommen: Record<Id, Id>, optionen: PersonenOptionen, sprache: Sprache = 'de'): ExposeBlock[] {
  const t = T(sprache);
  const figuren = personenAuswahl(daten, erstesVorkommen, optionen);
  const bloecke: ExposeBlock[] = [{ art: 'titel', text: t.titel }];
  if (!figuren.length) return [...bloecke, { art: 'absatz', text: [{ text: t.keine }] }];
  const abschnitt = (titel: string, liste: Figur[]) => {
    if (!liste.length) return;
    bloecke.push({ art: 'ueberschrift', ebene: 1, text: titel });
    for (const f of liste) bloecke.push({ art: 'punkt', text: eintrag(f, daten, optionen, sprache) });
  };
  if (optionen.gliederung === 'rolle') {
    abschnitt(t.haupt, figuren.filter((f) => f.rolle === 'haupt'));
    abschnitt(t.neben, figuren.filter((f) => f.rolle === 'neben'));
    abschnitt(t.statist, figuren.filter((f) => f.rolle === 'statist'));
    return bloecke;
  }
  const gruppen = Object.values(daten.gruppen).sort((a, b) => a.name.localeCompare(b.name, sprache));
  for (const g of gruppen) abschnitt(g.name, figuren.filter((f) => f.gruppe === g.id));
  abschnitt(t.ohneGruppe, figuren.filter((f) => !f.gruppe || !daten.gruppen[f.gruppe]));
  return bloecke;
}

/** Als Kapitel für den Vorspann von EPUB und Normseite (Markdown wie im Manuskript: **fett**, *kursiv*). */
export function personenKapitel(bloecke: ExposeBlock[]): Kapitel {
  const stuecke = (s: ExposeStueck[]) => s.map((x) => (x.art === 'fett' ? `**${x.text}**` : x.art === 'kursiv' ? ` *${x.text.trim()}*` : x.text)).join('');
  const titel = bloecke.find((b) => b.art === 'titel');
  const absaetze: string[] = [];
  for (const b of bloecke) {
    if (b.art === 'ueberschrift') absaetze.push(`## ${b.text}`);
    else if (b.art === 'punkt' || b.art === 'absatz') absaetze.push(stuecke(b.text));
  }
  return { id: 'personenverzeichnis', titel: titel?.art === 'titel' ? titel.text : '', text: absaetze.join('\n\n') };
}
