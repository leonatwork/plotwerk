// Erzeugt fixtures/test-manuskript.docx aus testManuskript.ts (Node ≥ 23.6, TypeScript ohne Build).
// Aufruf im Projektordner: node core/docx/testdaten/erzeugen.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { erzeugeTestManuskript } from './testManuskript.ts';

const ziel = fileURLToPath(new URL('../../../fixtures/test-manuskript.docx', import.meta.url));
const daten = await erzeugeTestManuskript();
writeFileSync(ziel, daten);
console.log(`${ziel} (${daten.length} Bytes)`);
