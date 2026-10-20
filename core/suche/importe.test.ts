import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Suche bleibt lokal und ohne KI-Pfad', () => {
  it('Core hat nur reine Text-/Modellabhängigkeiten; Such-UI ruft keine KI auf', () => {
    for (const datei of readdirSync(__dirname).filter(n => n.endsWith('.ts') && !n.endsWith('.test.ts'))) {
      const quelle = readFileSync(resolve(__dirname,datei),'utf8');
      const imports = [...quelle.matchAll(/from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
      expect(imports.every(p => ['../model/types','../text'].includes(p!))).toBe(true);
      expect(quelle).not.toMatch(/import\(|require\(|\bwindow\b|\bdocument\b|@tauri|core\/ki/);
    }
    const pfade = ['src/features/suche/Projektsuche.tsx','src/features/suche/SuchFelder.tsx','src/features/schreiben/Kapitelsuche.tsx','src/state/slices/suche.ts'];
    for (const pfad of pfade) {
      const quelle = readFileSync(resolve(__dirname,'../..',pfad),'utf8');
      expect(quelle,pfad).not.toMatch(/from\s*['"][^'"]*(?:\/ki|backend)|\b(?:transport|kiTransport|fuehreAufgabeAus|pruefeBuch)\b/);
    }
  });
});
