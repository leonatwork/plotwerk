/**
 * Demo-Projekte für Tests (nur Node/Vitest, nicht im App-Bundle verwenden – die Browser-Demo
 * lädt die Dateien über import.meta.glob in src/backend/demo.ts): „Hafenlichter“ (deutsch, Standard)
 * und die englische Fassung „Harbour Lights“ (demo-projekt-en).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { ProjektDaten } from '../core/model/types';
import { ladeProjekt, MemoryFs } from '../core/projekt';

export const DEMO_ORDNER = join(__dirname, 'demo-projekt');
export const DEMO_ORDNER_EN = join(__dirname, 'demo-projekt-en');

function dateienAus(wurzel: string): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  const lauf = (ordner: string) => {
    for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
      const voll = join(ordner, eintrag.name);
      if (eintrag.isDirectory()) lauf(voll);
      else if (eintrag.isFile() && eintrag.name !== '.DS_Store') ergebnis[relative(wurzel, voll).split(sep).join('/')] = readFileSync(voll, 'utf8');
    }
  };
  lauf(wurzel);
  return ergebnis;
}

/** Alle Dateien des Demo-Projekts: relativer Pfad → Inhalt. */
export function demoDateien(): Record<string, string> {
  return dateienAus(DEMO_ORDNER);
}

/** Frisches MemoryFs mit dem Demo-Projekt (Änderungen bleiben im Speicher). */
export function demoFs(): MemoryFs {
  return new MemoryFs(demoDateien());
}

export function ladeDemoProjekt(): Promise<ProjektDaten> {
  return ladeProjekt(demoFs());
}

/** Alle Dateien des englischen Demo-Projekts „Harbour Lights“. */
export function demoDateienEn(): Record<string, string> {
  return dateienAus(DEMO_ORDNER_EN);
}

export function demoFsEn(): MemoryFs {
  return new MemoryFs(demoDateienEn());
}

export function ladeDemoProjektEn(): Promise<ProjektDaten> {
  return ladeProjekt(demoFsEn());
}
