/**
 * Tauri-Backend: TauriFs, Dialoge, Schlüsselbund, KI-Transport, SQLite-Index, Beenden,
 * Dateiüberwachung und natives Menü. Besitzer: Tauri-Agent.
 *
 * Rust-Kommandos: src-tauri/src/lib.rs. Ereignisse aus Rust:
 *   "datei-geaendert" {pfad}  – externe Änderung im Projektordner
 *   "app-beenden"             – vor dem Beenden; danach app_beenden aufrufen (spätestens 3 s)
 *   "menue-befehl" "<befehl>" – Klick im nativen Menü
 */
import { listen } from '@tauri-apps/api/event';
import Database from '@tauri-apps/plugin-sql';
import { kiAnbieter, kiEndpoint, kiMitStandards } from '@core/ki/index';
import type { KiEinstellungen } from '@core/model/types';
import { parseProjekt } from '@core/projekt';
import type { Backend, GewaehlteDatei } from '../types';
import { aufruf } from './aufruf';
import { legeGrundgeruestAn } from './grundgeruest';
import { DATENBANK, erstelleSqlIndexSpeicher } from './indexSpeicher';
import { erstelleTauriKiTransport, type KiZiel } from './kiTransport';
import { TauriFs, type ProjektInfo } from './tauriFs';
import { erstelleSicherungsBackend } from './sicherungen';

export { TauriFs, type ProjektInfo } from './tauriFs';
export { TauriFehler } from './aufruf';

/** Wie BEFEHL_EREIGNIS in src/app/befehle.ts */
const BEFEHL_EREIGNIS = 'plotwerk:befehl';
/** Etwas unter der Frist im Rust-Kern (3 s), damit app_beenden sicher noch ankommt. */
const BEENDEN_FRIST_MS = 2800;

export async function erstelleTauriBackend(): Promise<Backend> {
  let aktuell: TauriFs | null = null;
  const beimBeendenListe: (() => Promise<void>)[] = [];
  const aenderungsListe: ((pfad: string) => void)[] = [];

  function uebernehmen(info: ProjektInfo | null): TauriFs | null {
    if (!info) return null;
    aktuell = new TauriFs(info);
    return aktuell;
  }

  /** KI-Einstellungen aus dem Store (aktueller Stand), sonst aus projekt.md. */
  async function kiEinstellungen(): Promise<KiEinstellungen | undefined> {
    if (!aktuell) return undefined;
    try {
      const { useStore } = await import('../../state/store');
      const daten = useStore.getState().daten;
      if (daten) return daten.projekt.ki;
    } catch (e) {
      console.warn('Store für KI-Einstellungen nicht verfügbar:', e);
    }
    const text = await aktuell.lesen('projekt.md');
    if (text === null) return undefined;
    try {
      return parseProjekt(text).ki;
    } catch {
      return undefined;
    }
  }

  /** Gewählter Anbieter und dessen Basis-URL (Foundry ohne Endpoint: ''); OpenAI-kompatibel mit Vorlage und Kontextlänge. */
  async function kiZiel(): Promise<KiZiel> {
    if (!aktuell) return { anbieter: 'foundry', endpoint: '' };
    const ki = await kiEinstellungen();
    const anbieter = kiAnbieter(ki);
    if (anbieter !== 'openai') return { anbieter, endpoint: kiEndpoint(ki) };
    const { vorlage, kontextTokens } = kiMitStandards(ki).openai;
    return { anbieter, endpoint: kiEndpoint(ki), openai: { vorlage, ...(kontextTokens ? { kontextTokens } : {}) } };
  }

  const indexSpeicher = erstelleSqlIndexSpeicher(
    () => Database.load(DATENBANK),
    () => aktuell?.pfad ?? null,
  );

  await listen<{ pfad: string }>('datei-geaendert', (e) => {
    for (const cb of aenderungsListe) cb(e.payload.pfad);
  });

  await listen('app-beenden', async () => {
    const frist = new Promise<void>((ok) => setTimeout(ok, BEENDEN_FRIST_MS));
    const alle = Promise.allSettled(beimBeendenListe.map((cb) => cb())).then((ergebnisse) => {
      for (const r of ergebnisse) if (r.status === 'rejected') console.error('Beenden:', r.reason);
    });
    await Promise.race([Promise.all([alle, indexSpeicher.warten()]), frist]);
    await aufruf('app_beenden').catch((e) => console.error(e));
  });

  await listen<string>('menue-befehl', (e) => {
    window.dispatchEvent(new CustomEvent(BEFEHL_EREIGNIS, { detail: e.payload }));
  });

  return {
    art: 'tauri',
    sicherungen: erstelleSicherungsBackend(uebernehmen),

    async projektOeffnen() {
      return uebernehmen(await aufruf<ProjektInfo | null>('projekt_waehlen'));
    },

    async neuesProjekt(titel) {
      const info = await aufruf<ProjektInfo | null>('projekt_neu', { titel });
      if (!info) return null;
      const fs = new TauriFs(info);
      await legeGrundgeruestAn(fs, titel);
      return uebernehmen(info);
    },

    async letztesProjekt() {
      try {
        return uebernehmen(await aufruf<ProjektInfo | null>('projekt_letztes'));
      } catch (e) {
        console.warn('Letztes Projekt nicht geöffnet:', e);
        return null;
      }
    },

    async dateiWaehlen(endungen): Promise<GewaehlteDatei | null> {
      const gewaehlt = await aufruf<{ name: string; pfad: string } | null>('datei_waehlen', { endungen });
      if (!gewaehlt) return null;
      const daten = await aufruf<ArrayBuffer>('datei_lesen_extern', { pfad: gewaehlt.pfad });
      return { name: gewaehlt.name, daten: new Uint8Array(daten) };
    },

    async dateiSpeichern(vorschlag, daten) {
      const pfad = await aufruf<string | null>('datei_speichern', { vorschlag });
      if (!pfad) return false;
      await aufruf<void>('datei_schreiben_extern', daten, { headers: { 'x-pfad': encodeURIComponent(pfad) } });
      return true;
    },

    ki: erstelleTauriKiTransport(kiZiel),
    indexSpeicher,

    schluessel: {
      async setzen(wert, anbieter = 'foundry') {
        await aufruf<void>('schluessel_setzen', { wert, anbieter });
      },
      vorhanden(anbieter = 'foundry') {
        return aufruf<boolean>('schluessel_vorhanden', { anbieter });
      },
      async loeschen(anbieter = 'foundry') {
        await aufruf<void>('schluessel_loeschen', { anbieter });
      },
    },

    beimBeenden(cb) {
      beimBeendenListe.push(cb);
    },

    aufExterneAenderung(cb) {
      aenderungsListe.push(cb);
    },
  };
}
