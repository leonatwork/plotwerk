/**
 * Browser-Demo: Demo-Projekt im Speicher, Änderungen zusätzlich in localStorage. Kein Dateisystem,
 * keine echte KI. Die Oberflächensprache wählt das Projekt: Englisch → fixtures/demo-projekt-en
 * („Harbour Lights“), sonst fixtures/demo-projekt („Hafenlichter“).
 */
import type { Sprache } from '@core/i18n';
import type { Index } from '@core/index/index';
import { STANDARD_KI } from '@core/ki/index';
import type { KiAnbieter } from '@core/model/types';
import { MemoryFs, serializeProjekt } from '@core/projekt';
import { sprache } from '../i18n/sprache';
import { ladeDemoAenderungen, sichereDemoAenderungen } from './demoSpeicher';
import { erstelleDemoKiTransport } from './ki/demo';
import type { Backend, GewaehlteDatei } from './types';

const DATEIEN_DE = import.meta.glob<string>('/fixtures/demo-projekt/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
  exhaustive: true,
});
const DATEIEN_EN = import.meta.glob<string>('/fixtures/demo-projekt-en/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
  exhaustive: true,
});

export { demoGeaendert, demoZuruecksetzen } from './demoSpeicher';

/** Dateien des Demo-Projekts im Auslieferungszustand (relativer Pfad → Inhalt). */
export function demoGrundstand(s: Sprache = sprache()): Record<string, string> {
  const [dateien, praefix] = s === 'en' ? [DATEIEN_EN, '/fixtures/demo-projekt-en/'] : [DATEIEN_DE, '/fixtures/demo-projekt/'];
  const ergebnis: Record<string, string> = {};
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    if (!pfad.startsWith(praefix) || pfad.endsWith('.DS_Store')) continue;
    ergebnis[pfad.slice(praefix.length)] = inhalt;
  }
  return ergebnis;
}

/** Demo-Projekt inkl. gespeicherter Änderungen; jede weitere Änderung landet in localStorage. */
export function erstelleDemoFs(s: Sprache = sprache()): MemoryFs {
  const dateien = demoGrundstand(s);
  const aenderungen = ladeDemoAenderungen(s);
  for (const [pfad, inhalt] of Object.entries(aenderungen)) {
    if (inhalt === null) delete dateien[pfad];
    else if (typeof inhalt === 'string') dateien[pfad] = inhalt;
  }
  const fs = new MemoryFs(dateien);
  fs.beobachten((pfad, inhalt) => {
    aenderungen[pfad] = inhalt;
    sichereDemoAenderungen(aenderungen, s);
  });
  return fs;
}

function dateiWaehlen(endungen: string[]): Promise<GewaehlteDatei | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = endungen.map((e) => `.${e.replace(/^\./, '')}`).join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    let fertig = false;
    const ende = (wert: GewaehlteDatei | null) => {
      if (fertig) return;
      fertig = true;
      input.remove();
      resolve(wert);
    };
    input.addEventListener('change', () => {
      const datei = input.files?.[0];
      if (!datei) return ende(null);
      datei.arrayBuffer().then(
        (puffer) => ende({ name: datei.name, daten: new Uint8Array(puffer) }),
        () => ende(null),
      );
    });
    input.addEventListener('cancel', () => ende(null));
    input.click();
  });
}

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  md: 'text/markdown',
  json: 'application/json',
};

async function dateiSpeichern(vorschlag: string, daten: Uint8Array): Promise<boolean> {
  const endung = vorschlag.split('.').pop()?.toLowerCase() ?? '';
  const blob = new Blob([daten as BlobPart], { type: MIME[endung] ?? 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = vorschlag;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function erstelleDemoBackend(): Backend {
  /** je Sprache ein Demo-Projekt (einmal erstellt, damit Änderungen beim Hin- und Herschalten bleiben) */
  const demoFs: Partial<Record<Sprache, MemoryFs>> = {};
  const demo = (s: Sprache = sprache()) => (demoFs[s] ??= erstelleDemoFs(s));
  const gespeicherterIndex: Partial<Record<Sprache, Index | null>> = {};
  const indexSprache = () => (Object.entries(demoFs).find(([, fs]) => fs === aktuellOffen)?.[0] as Sprache | undefined) ?? sprache();
  let aktuellOffen: MemoryFs | null = null;
  const oeffne = () => (aktuellOffen = demo());
  /** je Anbieter, nur im Speicher (die Demo nutzt keinen Schlüssel) */
  const schluesselGesetzt: Record<KiAnbieter, boolean> = { foundry: false, claude: false };

  return {
    art: 'demo',
    async projektOeffnen() {
      return oeffne();
    },
    async neuesProjekt(titel) {
      return new MemoryFs({
        'projekt.md': serializeProjekt({ version: 1, titel, kapitel: [], ki: STANDARD_KI, notiz: '' }),
      });
    },
    async letztesProjekt() {
      return oeffne();
    },
    dateiWaehlen,
    dateiSpeichern,
    ki: erstelleDemoKiTransport(),
    indexSpeicher: {
      async laden() {
        return gespeicherterIndex[indexSprache()] ?? null;
      },
      async speichern(index) {
        gespeicherterIndex[indexSprache()] = index;
      },
      async leeren() {
        gespeicherterIndex[indexSprache()] = null;
      },
    },
    schluessel: {
      async setzen(wert, anbieter = 'foundry') {
        schluesselGesetzt[anbieter] = wert.trim() !== '';
      },
      async vorhanden(anbieter = 'foundry') {
        return schluesselGesetzt[anbieter];
      },
      async loeschen(anbieter = 'foundry') {
        schluesselGesetzt[anbieter] = false;
      },
    },
    beimBeenden(cb) {
      window.addEventListener('pagehide', () => void cb());
    },
    aufExterneAenderung() {
      // Im Browser ändert niemand die Dateien von außen.
    },
    demoFuerSprache(offen) {
      const istDemo = Object.values(demoFs).some((fs) => fs === offen);
      if (!istDemo || offen === demo()) return null;
      return oeffne();
    },
  };
}

