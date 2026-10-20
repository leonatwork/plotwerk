import { archivName, baueArchiv, entpackeArchiv, rotation } from '@core/sicherungen';
import type { ProjektDateisystem } from '@core/projekt';
import type { ArchivBackend, SicherungsEinstellungen } from '../types';
import { aufruf } from './aufruf';
import type { ProjektInfo, TauriFs } from './tauriFs';

interface ArchivInfo extends Omit<SicherungsEinstellungen, 'ort'> {
  ort: string;
  name: string; namen: string[]; heuteGesichert: boolean;
}

export function erstelleArchivBackend(aktuell: () => TauriFs | null, uebernehmen: (info: ProjektInfo | null) => TauriFs | null): ArchivBackend {
  const laeufe = new Map<number, Promise<void>>();
  return {
    einstellungen: () => aufruf('archiv_einstellungen'),
    einstellen: (wert) => aufruf('archiv_einstellen', { wert }),
    ortWaehlen: () => aufruf('archiv_ort_waehlen'),
    auflisten: () => aufruf('archiv_liste'),
    async sichern(fs: ProjektDateisystem, automatisch: boolean) {
      const kennung = (fs as TauriFs).kennung ?? aktuell()?.kennung;
      if (kennung === undefined) return;
      async function lauf() {
        if (automatisch && !(await aufruf<SicherungsEinstellungen>('archiv_einstellungen')).aktiv) return;
        const info = await aufruf<ArchivInfo>('archiv_info', { kennung });
        if (automatisch && (!info.aktiv || info.heuteGesichert)) return;
        const leser = {
          lesen: (pfad: string) => fs.lesen(pfad),
          existiert: (pfad: string) => fs.existiert(pfad),
          auflisten: (ordner: string) => fs.auflisten(ordner),
          async lesenBinaer(pfad: string) {
            const bytes = await aufruf<ArrayBuffer | number[]>('archiv_projekt_lesen', { kennung, pfad });
            return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
          },
        };
        const daten = await baueArchiv(leser, info.mitVersionen);
        const name = archivName(info.name, new Date(), info.namen);
        await aufruf('archiv_schreiben', daten, { headers: { 'plotwerk-kennung': String(kennung), 'plotwerk-name': encodeURIComponent(name), 'plotwerk-ort': encodeURIComponent(info.ort) } });
        for (const alt of rotation([...info.namen, name], info.name)) await aufruf('archiv_entfernen', { kennung, name: alt, ort: info.ort });
      }
      const vorher = laeufe.get(kennung) ?? Promise.resolve();
      const promise = vorher.catch(() => {}).then(lauf);
      laeufe.set(kennung, promise);
      try { await promise; } finally { if (laeufe.get(kennung) === promise) laeufe.delete(kennung); }
    },
    async wiederherstellen(eintrag) {
      const gewaehlt = await aufruf<{ name: string; pfad: string } | null>('archiv_waehlen', { eintrag: eintrag ?? null });
      if (!gewaehlt) return null;
      const daten = await aufruf<ArrayBuffer | number[]>('archiv_lesen', { pfad: gewaehlt.pfad });
      const dateien = await entpackeArchiv(daten instanceof ArrayBuffer ? new Uint8Array(daten) : Uint8Array.from(daten));
      return uebernehmen(await aufruf<ProjektInfo | null>('archiv_wiederherstellen', { dateien, titel: gewaehlt.name.replace(/\.zip$/, '') }));
    },
  };
}
