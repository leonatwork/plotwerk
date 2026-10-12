/**
 * Demo-Projekt für Tests (nur Node/Vitest, nicht im App-Bundle verwenden – die Browser-Demo
 * lädt die Dateien über import.meta.glob in src/backend/demo.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ProjektDaten } from '../core/model/types';
import { ladeProjekt, MemoryFs } from '../core/projekt';

export const DEMO_ORDNER = join(__dirname, 'demo-projekt');

/** Alle Dateien des Demo-Projekts: relativer Pfad → Inhalt. */
export function demoDateien(): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  const lauf = (ordner: string) => {
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      const voll = join(ordner, eintrag.name);
      if (eintrag.isDirectory()) lauf(voll);
      else if (eintrag.isFile() && eintrag.name !== '.DS_Store')
        ergebnis[relative(DEMO_ORDNER, voll).split(sep).join('/')] = readFileSync(voll, 'utf8');
    }
  };
  lauf(DEMO_ORDNER);
  return ergebnis;
}

/** Frisches MemoryFs mit dem Demo-Projekt (Änderungen bleiben im Speicher). */
export function demoFs(): MemoryFs {
  return new MemoryFs(demoDateien());
}

export function ladeDemoProjekt(): Promise<ProjektDaten> {
  return ladeProjekt(demoFs());
}
