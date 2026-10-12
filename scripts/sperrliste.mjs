#!/usr/bin/env node
// Sperrliste: verhindert, dass Begriffe aus privaten Manuskripten (Figuren, Orte,
// Titel) ins öffentliche Repo gelangen. Die Liste selbst liegt bewusst außerhalb
// des Repos, sonst würde sie die Begriffe veröffentlichen.
//
//   node scripts/sperrliste.mjs                   geänderte Zeilen im Commit prüfen (pre-commit)
//   node scripts/sperrliste.mjs --nachricht <f>   Commit-Nachricht prüfen (commit-msg)
//   node scripts/sperrliste.mjs --alles           alle Dateien im Repo prüfen
//   node scripts/sperrliste.mjs --push            Branch-Namen und alle neuen Commits prüfen (pre-push, liest stdin)
//
// Liste: $PLOTWERK_SPERRLISTE oder ~/.config/plotwerk/sperrliste.txt
// Ein Begriff pro Zeile, # leitet Kommentare ein, Groß-/Kleinschreibung egal.
// Leerzeichen passen auch auf - und _ („Blauer Hafen“ findet „blauer-hafen“).
// Ein * am Ende erlaubt Fortsetzungen („Möwe*“ findet „Möwen“).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LISTE = process.env.PLOTWERK_SPERRLISTE || join(homedir(), '.config', 'plotwerk', 'sperrliste.txt');
const args = process.argv.slice(2);
const alles = args.includes('--alles');
const push = args.includes('--push');
const nachrichtIndex = args.indexOf('--nachricht');

if (!existsSync(LISTE)) {
  // Ohne Liste nichts zu prüfen – Mitwirkende ohne private Manuskripte sollen nicht blockiert werden.
  if (alles) console.log(`Keine Sperrliste unter ${LISTE} – nichts geprüft.`);
  process.exit(0);
}

const begriffe = readFileSync(LISTE, 'utf8')
  .split('\n')
  .map((z) => z.replace(/#.*/, '').trim())
  .filter(Boolean);

const muster = begriffe.map((b) => {
  const offen = b.endsWith('*');
  const kern = (offen ? b.slice(0, -1) : b)
    .trim()
    .split(/\s+/)
    .map((teil) => teil.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s_-]+');
  return { begriff: b, re: new RegExp(`(?<![\\p{L}\\p{N}])${kern}${offen ? '' : '(?![\\p{L}\\p{N}])'}`, 'iu') };
});

function git(...a) {
  return execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** @type {{ ort: string, text: string }[]} */
const zeilen = [];

if (nachrichtIndex >= 0) {
  readFileSync(args[nachrichtIndex + 1], 'utf8')
    .split('\n')
    .forEach((text, i) => {
      if (!text.startsWith('#')) zeilen.push({ ort: `Commit-Nachricht:${i + 1}`, text });
    });
} else if (alles) {
  for (const datei of git('ls-files', '-z').split('\0').filter(Boolean)) {
    zeilen.push({ ort: `${datei} (Dateiname)`, text: datei });
    if (!existsSync(datei)) continue;
    const inhalt = readFileSync(datei);
    if (inhalt.includes(0)) continue; // binär
    inhalt
      .toString('utf8')
      .split('\n')
      .forEach((text, i) => zeilen.push({ ort: `${datei}:${i + 1}`, text }));
  }
} else if (push) {
  // stdin: <lokale ref> <lokaler sha> <entfernte ref> <entfernter sha>
  const NULL = /^0+$/;
  for (const z of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
    const [, lokal, ziel, entfernt] = z.split(' ');
    zeilen.push({ ort: `Branch ${ziel}`, text: ziel });
    if (NULL.test(lokal)) continue; // Löschen
    const bereich = NULL.test(entfernt) ? [lokal, '--not', '--remotes'] : [`${entfernt}..${lokal}`];
    git('log', '--format=%h %B', ...bereich)
      .split('\n')
      .forEach((text) => zeilen.push({ ort: 'Commit-Nachricht', text }));
    diffZeilen(git('log', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=', ...bereich));
  }
} else {
  diffZeilen(git('diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR'));
}

/** Hinzugefügte Zeilen und Dateinamen aus einem Diff übernehmen. */
function diffZeilen(diff) {
  let datei = '';
  let nr = 0;
  for (const z of diff.split('\n')) {
    if (z.startsWith('+++ ')) {
      datei = z.slice(4).replace(/^b\//, '');
      zeilen.push({ ort: `${datei} (Dateiname)`, text: datei });
    } else if (z.startsWith('@@')) {
      nr = Number(/\+(\d+)/.exec(z)?.[1] ?? 0);
    } else if (z.startsWith('+')) {
      zeilen.push({ ort: `${datei}:${nr++}`, text: z.slice(1) });
    }
  }
}

const treffer = [];
for (const { ort, text } of zeilen) {
  for (const { begriff, re } of muster) {
    if (re.test(text)) treffer.push(`  ${ort}  →  „${begriff}“`);
  }
}

if (treffer.length) {
  console.error(`Sperrliste: ${treffer.length} Treffer mit Begriffen aus privaten Manuskripten:\n`);
  console.error(treffer.join('\n'));
  console.error(`\nBitte entfernen oder durch Beispiele aus dem Demo-Roman ersetzen (Liste: ${LISTE}).`);
  process.exit(1);
}
if (alles) console.log(`Sperrliste: ${zeilen.length} Zeilen geprüft, keine Treffer.`);
