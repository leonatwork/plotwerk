/** Reine Manuskript-Diagnose: erst alle IDs prüfen, dann konfliktfreie Texte übernehmen. */
import type { Id, Kapitel, KapitelPlan, ManuskriptKonflikt } from '../model/types';
import { fmt, texteJe, type Sprache } from '../i18n';

const TEXTE = texteJe(
  {
    doppelte_id: 'Kapitel „{id}“ nicht geladen: Mehrere Dateien haben dieselbe ID ({pfade}). Keine Fassung wurde übernommen.',
    name_id_abweichung: 'Kapitel „{id}“ nicht geladen: Der Dateiname passt nicht zur ID im Frontmatter ({pfade}). Erwartet wird {id}.md.',
    datei_fehlt: 'Kapitel „{id}“ nicht geladen: Die Manuskriptdatei fehlt ({pfade}).',
    icloud_platzhalter: 'Kapitel „{id}“ nicht geladen: Es liegt nur ein iCloud-Platzhalter vor ({pfade}). Die Datei ist nicht lokal verfügbar; bitte außerhalb von Plotwerk herunterladen.',
    konfliktname: 'Mögliche Cloud-Konfliktkopie ({pfade}) für Kapitel „{id}“. Die Kopie wurde nicht als neues Kapitel übernommen.',
  },
  {
    doppelte_id: 'Chapter “{id}” not loaded: Multiple files have the same ID ({pfade}). No version was imported.',
    name_id_abweichung: 'Chapter “{id}” not loaded: The filename does not match the frontmatter ID ({pfade}). Expected {id}.md.',
    datei_fehlt: 'Chapter “{id}” not loaded: The manuscript file is missing ({pfade}).',
    icloud_platzhalter: 'Chapter “{id}” not loaded: Only an iCloud placeholder exists ({pfade}). The file is not available locally; please download it outside Plotwerk.',
    konfliktname: 'Possible cloud conflict copy ({pfade}) for chapter “{id}”. The copy was not imported as a new chapter.',
  },
);

/** Nur unmittelbare Dateien in manuskript/; andere Ordner bleiben unverändert. */
export function istManuskriptPfad(pfad: string): boolean {
  return /^manuskript\/[^/]+(?:\.md|\.icloud)$/.test(pfad);
}

/** Sichtbarer iCloud-Name, kein Zugriff auf den Inhalt und kein Download. */
export function icloudKapitelId(pfad: string): Id | null {
  return /^manuskript\/\.(.+)\.md\.icloud$/.exec(pfad)?.[1] ?? null;
}

/** Namensheuristik = Hinweis, kein Beweis. Normale Slugs allein sind kein Konfliktsignal. */
function kopieVon(name: string, bekannteIds: Set<Id>, eigenesKapitel: boolean): Id | null {
  const nummer = /^(.*) ([1-9]\d*)$/.exec(name);
  if (nummer?.[1] && Number(nummer[2]) >= 2) return nummer[1];
  const marker = /^(.*?)\s*\([^)]*(?:conflict|konflikt)[^)]*\)$/i.exec(name);
  if (marker?.[1]) return marker[1];
  // Registrierte Kapitel mit passender ID können reguläre Slugs oder die von
  // Plotwerk erzeugten IDs mit -2, -3 … sein, keine OneDrive-Kopien.
  if (eigenesKapitel) return null;
  // OneDrive hängt den Gerätenamen an (auch kleingeschrieben). Nur mit bekannter
  // Basis prüfen; der Hinweis bleibt eine Heuristik.
  for (const id of [...bekannteIds].sort((a, b) => b.length - a.length)) {
    if (!name.startsWith(`${id}-`)) continue;
    if (name.length > id.length + 1) return id;
  }
  return null;
}

export function pruefeManuskript(
  dateien: string[], eintraege: { pfad: string; kapitel: Kapitel }[],
  reihenfolge: Id[], plaene: Record<Id, KapitelPlan>, sprache: Sprache,
): { kapitel: Record<Id, Kapitel>; konflikte: ManuskriptKonflikt[] } {
  const konflikte: ManuskriptKonflikt[] = [];
  const t = TEXTE(sprache);
  const melden = (art: ManuskriptKonflikt['art'], ids: Id[], pfade: string[]) => {
    const kapitelIds = [...new Set(ids)];
    konflikte.push({ art, kapitelIds, pfade: [...pfade].sort(), grund: fmt(t[art], { id: ids[0] ?? '', pfade: [...pfade].sort().join(', ') }) });
  };
  const nachId = new Map<Id, typeof eintraege>();
  for (const e of eintraege) {
    const gruppe = nachId.get(e.kapitel.id) ?? [];
    gruppe.push(e);
    nachId.set(e.kapitel.id, gruppe);
  }
  const registrierteIds = new Set([...reihenfolge, ...Object.keys(plaene)]);
  const bekannteIds = new Set([...registrierteIds, ...nachId.keys()]);
  const abgelehnt = new Set<string>();
  for (const [id, gruppe] of nachId) {
    if (gruppe.length > 1) {
      melden('doppelte_id', [id], gruppe.map((e) => e.pfad));
      gruppe.forEach((e) => abgelehnt.add(e.pfad));
    }
  }
  for (const e of eintraege) {
    const name = e.pfad.slice('manuskript/'.length, -3);
    if (name !== e.kapitel.id) {
      melden('name_id_abweichung', [e.kapitel.id, name], [e.pfad]);
      abgelehnt.add(e.pfad);
    }
    const basis = kopieVon(name, bekannteIds, name === e.kapitel.id && registrierteIds.has(name));
    if (basis) {
      melden('konfliktname', [basis], [e.pfad]);
      abgelehnt.add(e.pfad);
    }
  }
  const kapitel: Record<Id, Kapitel> = {};
  for (const e of eintraege) if (!abgelehnt.has(e.pfad)) kapitel[e.kapitel.id] = e.kapitel;
  for (const id of reihenfolge) {
    if (kapitel[id]) continue;
    const platzhalter = dateien.filter((p) => icloudKapitelId(p) === id);
    if (platzhalter.length) melden('icloud_platzhalter', [id], platzhalter);
    else if (!konflikte.some((k) => k.art !== 'konfliktname' && k.kapitelIds.includes(id)) && plaene[id]?.status !== 'geplant') {
      melden('datei_fehlt', [id], [`manuskript/${id}.md`]);
    }
  }
  return { kapitel, konflikte };
}

/** Ein reiner Namenshinweis verwirft nur die Kopie, nicht die unveränderte Originaldatei. */
export function nichtGeladeneKapitel(konflikte: ManuskriptKonflikt[]): Set<Id> {
  return new Set(konflikte.filter((k) => k.art !== 'konfliktname').flatMap((k) => k.kapitelIds));
}
