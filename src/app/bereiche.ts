/**
 * Registrierung der Bereiche. Jeder Bereich lädt lazy src/features/<bereich>/index.tsx mit:
 *   export default function Ansicht()          – Inhalt inkl. eigenem <Inspektor>
 *   export function Seitenleiste()             – optional, unter der Navigation
 *   export function Titelaktionen()            – optional, rechts in der Titelleiste
 *   export function kontext(state: Store)      – optional, Text neben dem Projektnamen
 */
import { useEffect, useState, type ComponentType } from 'react';
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
  titel: string;
  Icon: ComponentType<IconProps>;
  /** ⌘-Taste (Werkzeuge ohne eigene Taste: nur über Seitenleiste, Menü und Schnellsuche) */
  taste?: string;
  /** Werkzeuge stehen in der Seitenleiste in einer eigenen, einklappbaren Gruppe */
  gruppe?: 'werkzeuge';
  /** weitere Suchwörter für die Schnellsuche */
  suchwoerter?: string[];
  laden: () => Promise<BereichModul>;
}

export const BEREICHE: BereichDefinition[] = [
  { id: 'schreiben', titel: 'Schreiben', Icon: IconSchreiben, taste: '1', laden: () => import('../features/schreiben/index') },
  { id: 'kapitel', titel: 'Kapitel-Überblick', Icon: IconKapitel, taste: '2', laden: () => import('../features/kapitel/index') },
  { id: 'akte', titel: 'Akte planen', Icon: IconAkte, taste: '3', laden: () => import('../features/akte/index') },
  { id: 'figuren', titel: 'Figuren', Icon: IconFiguren, taste: '4', laden: () => import('../features/figuren/index') },
  { id: 'beziehungen', titel: 'Beziehungen', Icon: IconBeziehungen, taste: '5', laden: () => import('../features/beziehungen/index') },
  { id: 'orte', titel: 'Orte', Icon: IconOrte, taste: '6', laden: () => import('../features/orte/index') },
  { id: 'hinweise', titel: 'Hinweise', Icon: IconHinweise, taste: '7', laden: () => import('../features/hinweise/index') },
  // Werkzeuge (G1–G8)
  {
    id: 'zeitleiste',
    titel: 'Zeitleiste',
    Icon: IconZeitleiste,
    taste: '8',
    gruppe: 'werkzeuge',
    suchwoerter: ['Zeit', 'Tag', 'Uhrzeit', 'Zustand', 'Zustand einer Figur'],
    laden: () => import('../features/zeitleiste/index'),
  },
  {
    id: 'faeden',
    titel: 'Fäden',
    Icon: IconFaeden,
    taste: '9',
    gruppe: 'werkzeuge',
    suchwoerter: ['Lose Enden', 'Faden', 'Auflösung'],
    laden: () => import('../features/faeden/index'),
  },
  {
    id: 'recherche',
    titel: 'Recherche',
    Icon: IconRecherche,
    taste: '0',
    gruppe: 'werkzeuge',
    suchwoerter: ['Bilder', 'Links', 'Notizen', 'Ablage'],
    laden: () => import('../features/recherche/index'),
  },
  {
    id: 'statistik',
    titel: 'Statistik',
    Icon: IconStatistik,
    gruppe: 'werkzeuge',
    suchwoerter: ['Schreibziel', 'Tagesziel', 'Wörter pro Tag', 'Fortschritt'],
    laden: () => import('../features/statistik/index'),
  },
  {
    id: 'fragen',
    titel: 'Fragen',
    Icon: IconFragen,
    gruppe: 'werkzeuge',
    suchwoerter: ['Fragen an das Buch', 'Chat', 'Belegstellen'],
    laden: () => import('../features/fragen/index'),
  },
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
