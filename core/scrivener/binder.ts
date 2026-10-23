import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Sprache } from '../i18n';
import { SCRIVENER_TEXTE } from './texte';

export class ScrivenerFehler extends Error {}

export interface BinderDokument {
  uuid: string;
  titel: string;
  /** Import-interne Aktnummer; null für Dokumente direkt im Draft. */
  akt: number | null;
}

export interface ScrivenerBinder {
  dokumente: BinderDokument[];
  akte: { nummer: number; titel: string }[];
}

interface Knoten {
  UUID?: string;
  Type?: string;
  Title?: string;
  Children?: { BinderItem?: Knoten[] };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'BinderItem',
});

/** UUIDs sind ausschließlich einzelne Pfadkomponenten, niemals Dateipfade. */
function sichereUuid(uuid: string | undefined): uuid is string {
  return !!uuid && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(uuid);
}

/** Reihenfolge und Hierarchie des Draft; Titel sind Nutzerdaten, kein Strukturmerkmal. */
export function parseBinder(xml: string, sprache: Sprache = 'de'): ScrivenerBinder {
  const fehler = () => new ScrivenerFehler(SCRIVENER_TEXTE(sprache).binder);
  // Keine DTD/externen Entitäten und keine tolerante Reparatur beschädigten XMLs.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw fehler();
  let wurzeln: Knoten[];
  try {
    const projekt = parser.parse(xml).ScrivenerProject;
    wurzeln = projekt?.Binder?.BinderItem;
    if (!Array.isArray(wurzeln)) throw fehler();
  } catch {
    throw fehler();
  }
  const drafts = wurzeln.filter((k) => k.Type === 'DraftFolder');
  if (drafts.length !== 1) throw fehler();
  const ergebnis: ScrivenerBinder = { dokumente: [], akte: [] };
  const uuids = new Set<string>();
  const besuchen = (k: Knoten, akt: number | null, obersteEbene: boolean, tiefe: number) => {
    if (tiefe > 256 || !sichereUuid(k.UUID) || uuids.has(k.UUID)) throw fehler();
    uuids.add(k.UUID);
    if (k.Type === 'Folder' && obersteEbene) {
      akt = ergebnis.akte.length + 1;
      ergebnis.akte.push({ nummer: akt, titel: typeof k.Title === 'string' ? k.Title : '' });
    }
    if (k.Type === 'Text') ergebnis.dokumente.push({ uuid: k.UUID, titel: typeof k.Title === 'string' ? k.Title : '', akt });
    // Ordnertext wird nie übernommen. Nichttext-Dokumente und deren Inhalte sind außerhalb des Imports.
    if (k.Type !== 'Folder' && k.Type !== 'Text') return;
    for (const c of k.Children?.BinderItem ?? []) besuchen(c, akt, false, tiefe + 1);
  };
  for (const k of drafts[0]!.Children?.BinderItem ?? []) besuchen(k, null, true, 0);
  return ergebnis;
}
