/**
 * Harte Regel 1 (a): core/ki importiert nichts, was schreiben kann.
 * Erlaubt: ../model/types, ../projekt/fs (nur type), ../projekt/lesen, ../text, ../i18n (Sprache, buchSprache –
 * rein, ohne Dateizugriff), ../index (nur hinweisSchluessel bzw. Typen) und eigene Dateien.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ORDNER = __dirname;

interface Import {
  datei: string;
  pfad: string;
  nurTyp: boolean;
  namen: string[];
}

function importe(datei: string): Import[] {
  const quelle = readFileSync(datei, 'utf8');
  const ergebnis: Import[] = [];
  const muster = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of quelle.matchAll(muster)) {
    const pfad = m[4] ?? m[5] ?? m[6] ?? m[7] ?? '';
    const klammer = /\{([^}]*)\}/.exec(m[3] ?? '')?.[1] ?? '';
    const namen = klammer
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const nurTyp = !!m[2] || (namen.length > 0 && namen.every((n) => n.startsWith('type ')));
    ergebnis.push({ datei, pfad, nurTyp, namen: namen.map((n) => n.replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim()) });
  }
  return ergebnis;
}

const modulDateien = readdirSync(ORDNER)
  .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
  .map((n) => join(ORDNER, n));

describe('core/ki – Importe (harte Regel 1, statisch)', () => {
  it('findet die Moduldateien', () => {
    expect(modulDateien.map((d) => d.split('/').pop())).toEqual(
      expect.arrayContaining(['index.ts', 'anfrage.ts', 'antwort.ts', 'kontext.ts', 'kosten.ts', 'pruefung.ts']),
    );
  });

  it('importiert nur erlaubte Module', () => {
    const verstoesse: string[] = [];
    for (const datei of modulDateien) {
      for (const imp of importe(datei)) {
        const name = `${datei.split('/').pop()}: ${imp.pfad}`;
        if (imp.pfad.startsWith('./')) continue;
        switch (imp.pfad) {
          case '../model/types':
          case '../text':
          case '../projekt/lesen':
          case '../i18n':
            break;
          case '../projekt/fs':
            if (!imp.nurTyp) verstoesse.push(`${name} (nur type erlaubt)`);
            break;
          case '../index':
            if (!imp.nurTyp && imp.namen.some((n) => n !== 'hinweisSchluessel')) verstoesse.push(`${name} (nur hinweisSchluessel)`);
            break;
          default:
            verstoesse.push(name);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it('kein Modul referenziert Schreibfunktionen, MemoryFs, src/ oder Tauri', () => {
    for (const datei of modulDateien) {
      const quelle = readFileSync(datei, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(quelle, datei).not.toMatch(/ProjektDateisystem|schreiben\(|entfernen\(|MemoryFs|@tauri-apps|from ['"][^'"]*src\//);
    }
  });

  it('auch core/projekt/lesen (transitiv) importiert nichts, was schreiben kann', () => {
    const lesen = resolve(ORDNER, '../projekt/lesen.ts');
    const erlaubt = new Set(['yaml', '../model/types', './fs']);
    for (const imp of importe(lesen)) {
      expect(erlaubt.has(imp.pfad), `lesen.ts: ${imp.pfad}`).toBe(true);
      if (imp.pfad === './fs') expect(imp.nurTyp).toBe(true);
    }
    const text = resolve(ORDNER, '../text/index.ts');
    for (const imp of importe(text)) {
      expect(imp.pfad, `core/text: ${imp.pfad}`).not.toMatch(/projekt|schreiben|memoryFs|@tauri-apps|src\/|^node:/);
    }
    // core/i18n ist rein (keine Importe)
    expect(importe(resolve(ORDNER, '../i18n/index.ts'))).toEqual([]);
    expect(dirname(lesen)).toMatch(/projekt$/);
  });
});
