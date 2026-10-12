#!/usr/bin/env node
// Version an allen Stellen gleich halten: package.json, package-lock.json, src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml, src-tauri/Cargo.lock.
//
//   node scripts/version.mjs 0.2.0            setzen
//   node scripts/version.mjs --pruefen 0.2.0  prüfen (Release-Workflow), Exit 1 bei Abweichung
//   node scripts/version.mjs                  aktuelle Versionen anzeigen
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const pfad = (p) => join(wurzel, p);
const lesen = (p) => readFileSync(pfad(p), 'utf8');

const CARGO_PAKET = /(\[package\][^[]*?\nversion = ")([^"]+)(")/;
const LOCK_PAKET = /(\[\[package\]\]\nname = "plotwerk"\nversion = ")([^"]+)(")/;

const stellen = {
  'package.json': () => JSON.parse(lesen('package.json')).version,
  'package-lock.json': () => JSON.parse(lesen('package-lock.json')).version,
  'src-tauri/tauri.conf.json': () => JSON.parse(lesen('src-tauri/tauri.conf.json')).version,
  'src-tauri/Cargo.toml': () => lesen('src-tauri/Cargo.toml').match(CARGO_PAKET)?.[2],
  'src-tauri/Cargo.lock': () => lesen('src-tauri/Cargo.lock').match(LOCK_PAKET)?.[2],
};

function setzen(neu) {
  // JSON-Dateien nur an der Versionszeile ändern, damit die Formatierung bleibt
  const jsonVersion = (p) => {
    const text = lesen(p);
    const re = /("version":\s*")([^"]+)(")/;
    if (!re.test(text)) throw new Error(`${p}: keine Version gefunden`);
    writeFileSync(pfad(p), text.replace(re, `$1${neu}$3`));
  };
  jsonVersion('package.json');
  jsonVersion('src-tauri/tauri.conf.json');
  const lock = JSON.parse(lesen('package-lock.json'));
  lock.version = neu;
  if (lock.packages?.['']) lock.packages[''].version = neu;
  writeFileSync(pfad('package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  for (const [p, re] of [
    ['src-tauri/Cargo.toml', CARGO_PAKET],
    ['src-tauri/Cargo.lock', LOCK_PAKET],
  ]) {
    const text = lesen(p);
    if (!re.test(text)) throw new Error(`${p}: keine Version gefunden`);
    writeFileSync(pfad(p), text.replace(re, `$1${neu}$3`));
  }
}

const args = process.argv.slice(2);
const pruefen = args[0] === '--pruefen';
const ziel = pruefen ? args[1] : args[0];

if (ziel && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(ziel)) {
  console.error(`Keine gültige Version: ${ziel} (erwartet z. B. 0.2.0 oder 0.2.0-beta.1)`);
  process.exit(2);
}

if (ziel && !pruefen) {
  setzen(ziel);
  console.log(`Version ${ziel} gesetzt. Danach: git commit -am "Version ${ziel}" && git tag v${ziel} && git push --follow-tags`);
}

let abweichung = false;
for (const [datei, holen] of Object.entries(stellen)) {
  const v = holen();
  const passt = !ziel || v === ziel;
  if (!passt) abweichung = true;
  console.log(`${passt ? '✓' : '✗'} ${datei}: ${v ?? '(nicht gefunden)'}`);
}
if (abweichung) {
  console.error(`Version stimmt nicht überall mit ${ziel} überein. Setzen mit: node scripts/version.mjs ${ziel}`);
  process.exit(1);
}
