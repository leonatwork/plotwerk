import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Volltext bleibt lokal und getrennt von KI', () => {
  it('Core und Projektsuche importieren nur ihre expliziten öffentlichen Schnittstellen', () => {
    const ordner = [resolve(__dirname), resolve(__dirname, '../../src/features/suche')];
    const erlaubt = new Set(['diff', '../model/types', '../text', 'react', '@core/suche', '@core/text', '@tiptap/core', '@tiptap/pm/state', '@tiptap/pm/view', '../../i18n', '../../state/store', '../../ui', '../../app/dialogTypen', '../schreiben/klartext', '../schreiben/markdown']);
    for (const dir of ordner) for (const name of readdirSync(dir).filter(n => /\.tsx?$/.test(n) && !n.includes('.test.'))) {
      const quelle = readFileSync(resolve(dir, name), 'utf8');
      expect(quelle).not.toMatch(/core\/ki|@core\/ki|@tauri-apps|fetch\(|KiTransport/);
      for (const m of quelle.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)) {
        expect(m[2]!.startsWith('./') || erlaubt.has(m[2]!), `${name}: ${m[2]}`).toBe(true);
      }
    }
    const slice = readFileSync(resolve(__dirname, '../../src/state/slices/suche.ts'), 'utf8');
    expect(slice).not.toMatch(/core\/ki|@core\/ki|backend|fetch\(|KiTransport/);
  });
});
