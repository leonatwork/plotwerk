/**
 * Browser-Demo: Demo-Projekt aus fixtures/demo-projekt im Speicher, Änderungen zusätzlich in
 * localStorage. Kein Dateisystem, keine echte KI.
 */
import type { Index } from '@core/index/index';
import { STANDARD_KI } from '@core/ki/index';
import type { KiAnbieter } from '@core/model/types';
import { MemoryFs, serializeProjekt } from '@core/projekt';
import { ladeDemoAenderungen, sichereDemoAenderungen } from './demoSpeicher';
import { erstelleDemoKiTransport } from './ki/demo';
import type { Backend, GewaehlteDatei } from './types';

const DATEIEN = import.meta.glob<string>('/fixtures/demo-projekt/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
  exhaustive: true,
});
const PRAEFIX = '/fixtures/demo-projekt/';

export { demoGeaendert, demoZuruecksetzen } from './demoSpeicher';

/** Dateien des Demo-Projekts im Auslieferungszustand (relativer Pfad → Inhalt). */
export function demoGrundstand(): Record<string, string> {
  const ergebnis: Record<string, string> = {};
  for (const [pfad, inhalt] of Object.entries(DATEIEN)) {
    if (!pfad.startsWith(PRAEFIX) || pfad.endsWith('.DS_Store')) continue;
    ergebnis[pfad.slice(PRAEFIX.length)] = inhalt;
  }
  return ergebnis;
}

/** Demo-Projekt inkl. gespeicherter Änderungen; jede weitere Änderung landet in localStorage. */
export function erstelleDemoFs(): MemoryFs {
  const dateien = demoGrundstand();
  const aenderungen = ladeDemoAenderungen();
  for (const [pfad, inhalt] of Object.entries(aenderungen)) {
    if (inhalt === null) delete dateien[pfad];
    else if (typeof inhalt === 'string') dateien[pfad] = inhalt;
  }
  const fs = new MemoryFs(dateien);
  fs.beobachten((pfad, inhalt) => {
    aenderungen[pfad] = inhalt;
    sichereDemoAenderungen(aenderungen);
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
  let demoFs: MemoryFs | null = null;
  const demo = () => (demoFs ??= erstelleDemoFs());
  let gespeicherterIndex: Index | null = null;
  /** je Anbieter, nur im Speicher (die Demo nutzt keinen Schlüssel) */
  const schluesselGesetzt: Record<KiAnbieter, boolean> = { foundry: false, claude: false };

  return {
    art: 'demo',
    async projektOeffnen() {
      return demo();
    },
    async neuesProjekt(titel) {
      return new MemoryFs({
        'projekt.md': serializeProjekt({ version: 1, titel, kapitel: [], ki: STANDARD_KI, notiz: '' }),
      });
    },
    async letztesProjekt() {
      return demo();
    },
    dateiWaehlen,
    dateiSpeichern,
    ki: erstelleDemoKiTransport(),
    indexSpeicher: {
      async laden() {
        return gespeicherterIndex;
      },
      async speichern(index) {
        gespeicherterIndex = index;
      },
      async leeren() {
        gespeicherterIndex = null;
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
  };
}

