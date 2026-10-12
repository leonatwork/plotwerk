/**
 * Registrierung der Bereiche. Jeder Bereich lädt lazy src/features/<bereich>/index.tsx mit:
 *   export default function Ansicht()          – Inhalt inkl. eigenem <Inspektor>
 *   export function Seitenleiste()             – optional, unter der Navigation
 *   export function Titelaktionen()            – optional, rechts in der Titelleiste
 *   export function kontext(state: Store)      – optional, Text neben dem Projektnamen
 */
import { useEffect, useState, type ComponentType } from 'react';
import { sprache as aktuelleSprache, woerterbuch, type Sprache } from '../i18n';
import type { Bereich, Store } from '../state/store';
import {
  IconAkte,
  IconBeziehungen,
  IconFaeden,
  IconFiguren,
  IconFragen,
  IconHinweise,
  IconKapitel,
  IconOrte,
  IconRecherche,
  IconSchreiben,
  IconStatistik,
  IconZeitleiste,
  type IconProps,
} from '../ui';

export interface BereichModul {
  default: ComponentType;
  Seitenleiste?: ComponentType;
  Titelaktionen?: ComponentType;
  kontext?: (state: Store) => string;
}

export interface BereichDefinition {
  id: Bereich;
  /** Name in der aktuellen Oberflächensprache (wird bei jedem Zugriff gelesen) */
  readonly titel: string;
  Icon: ComponentType<IconProps>;
  /** ⌘-Taste (Werkzeuge ohne eigene Taste: nur über Seitenleiste, Menü und Schnellsuche) */
  taste?: string;
  /** Werkzeuge stehen in der Seitenleiste in einer eigenen, einklappbaren Gruppe */
  gruppe?: 'werkzeuge';
  /** weitere Suchwörter für die Schnellsuche (aktuelle Oberflächensprache) */
  readonly suchwoerter?: string[];
  laden: () => Promise<BereichModul>;
}

/** Name des Bereichs in einer Sprache (Standard: aktuelle Oberflächensprache). */
export function bereichTitel(id: Bereich, sprache: Sprache = aktuelleSprache()): string {
  return woerterbuch(sprache).app.bereiche[id];
}

/** Suchwörter eines Werkzeug-Bereichs in einer Sprache. */
export function bereichSuchwoerter(id: Bereich, sprache: Sprache = aktuelleSprache()): string[] {
  const woerter: Partial<Record<Bereich, string>> = woerterbuch(sprache).app.bereichSuchwoerter;
  return (woerter[id] ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Bereich mit Titel und Suchwörtern, die bei jedem Zugriff der aktuellen Oberflächensprache folgen. */
function bereich(def: Omit<BereichDefinition, 'titel' | 'suchwoerter'>): BereichDefinition {
  return {
    ...def,
    get titel() {
      return bereichTitel(def.id);
    },
    get suchwoerter() {
      return def.gruppe === 'werkzeuge' ? bereichSuchwoerter(def.id) : undefined;
    },
  };
}

export const BEREICHE: BereichDefinition[] = [
  bereich({ id: 'schreiben', Icon: IconSchreiben, taste: '1', laden: () => import('../features/schreiben/index') }),
  bereich({ id: 'kapitel', Icon: IconKapitel, taste: '2', laden: () => import('../features/kapitel/index') }),
  bereich({ id: 'akte', Icon: IconAkte, taste: '3', laden: () => import('../features/akte/index') }),
  bereich({ id: 'figuren', Icon: IconFiguren, taste: '4', laden: () => import('../features/figuren/index') }),
  bereich({ id: 'beziehungen', Icon: IconBeziehungen, taste: '5', laden: () => import('../features/beziehungen/index') }),
  bereich({ id: 'orte', Icon: IconOrte, taste: '6', laden: () => import('../features/orte/index') }),
  bereich({ id: 'hinweise', Icon: IconHinweise, taste: '7', laden: () => import('../features/hinweise/index') }),
  // Werkzeuge (G1–G8)
  bereich({ id: 'zeitleiste', Icon: IconZeitleiste, taste: '8', gruppe: 'werkzeuge', laden: () => import('../features/zeitleiste/index') }),
  bereich({ id: 'faeden', Icon: IconFaeden, taste: '9', gruppe: 'werkzeuge', laden: () => import('../features/faeden/index') }),
  bereich({ id: 'recherche', Icon: IconRecherche, taste: '0', gruppe: 'werkzeuge', laden: () => import('../features/recherche/index') }),
  bereich({ id: 'statistik', Icon: IconStatistik, gruppe: 'werkzeuge', laden: () => import('../features/statistik/index') }),
  bereich({ id: 'fragen', Icon: IconFragen, gruppe: 'werkzeuge', laden: () => import('../features/fragen/index') }),
];

export function bereichDefinition(id: Bereich): BereichDefinition {
  return BEREICHE.find((b) => b.id === id) ?? BEREICHE[0]!;
}

const geladen = new Map<Bereich, BereichModul>();
const ladend = new Map<Bereich, Promise<BereichModul>>();

export function ladeBereich(id: Bereich): Promise<BereichModul> {
  const fertig = geladen.get(id);
  if (fertig) return Promise.resolve(fertig);
  let p = ladend.get(id);
  if (!p) {
    p = bereichDefinition(id)
      .laden()
      .then((m) => {
        geladen.set(id, m);
        return m;
      });
    p.catch(() => ladend.delete(id));
    ladend.set(id, p);
  }
  return p;
}

/** Alle Bereiche im Hintergrund vorladen (schneller Wechsel). */
export function bereicheVorladen(): void {
  for (const b of BEREICHE) ladeBereich(b.id).catch(() => undefined);
}

/** Modul des Bereichs; null während des Ladens. Ladefehler werden geworfen (ErrorBoundary). */
export function useBereichModul(id: Bereich): BereichModul | null {
  const [, neuZeichnen] = useState(0);
  const [fehler, setFehler] = useState<{ id: Bereich; fehler: unknown } | null>(null);
  const modul = geladen.get(id) ?? null;
  useEffect(() => {
    if (geladen.has(id)) return;
    let aktiv = true;
    ladeBereich(id).then(
      () => aktiv && neuZeichnen((n) => n + 1),
      (e: unknown) => aktiv && setFehler({ id, fehler: e }),
    );
    return () => {
      aktiv = false;
    };
  }, [id]);
  if (fehler && fehler.id === id) throw fehler.fehler;
  return modul;
}
