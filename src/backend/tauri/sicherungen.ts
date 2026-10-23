import { archivLesen } from '@core/sicherungen';
import type { ProjektDateisystem } from '@core/projekt/fs';
import type { SicherungsBackend, SicherungsEinstellung } from '../types';
import { aufruf } from './aufruf';
import { TauriFs, type ProjektInfo } from './tauriFs';

function kennung(fs: ProjektDateisystem): number {
  if (!(fs instanceof TauriFs)) throw new Error('TauriFs erwartet');
  return fs.kennung;
}
export function erstelleSicherungsBackend(uebernehmen: (info: ProjektInfo | null) => TauriFs | null): SicherungsBackend {
  return {
    einstellungen: () => aufruf<SicherungsEinstellung>('sicherung_einstellungen'),
    einstellen: (wert) => aufruf('sicherung_einstellen', { wert }),
    ordnerWaehlen: () => aufruf('sicherung_ordner_waehlen'),
    auflisten: (fs) => aufruf('sicherung_auflisten', { kennung: fs ? kennung(fs) : null }),
    schreiben: (fs, name, daten) => aufruf('sicherung_schreiben', daten, { headers: { 'plotwerk-kennung': String(kennung(fs)), 'plotwerk-name': name } }),
    entfernen: (fs, name) => aufruf('sicherung_entfernen', { kennung: kennung(fs), name }),
    leser: (fs) => ({
      lesen: (p) => fs.lesen(p), existiert: (p) => fs.existiert(p), auflisten: (p) => fs.auflisten(p),
      async lesenBinaer(pfad) { return new Uint8Array(await aufruf<ArrayBuffer>('sicherung_projekt_lesen', { kennung: kennung(fs), pfad })); },
    }),
    async wiederherstellen(archiv) {
      // Native Freigabe zum Lesen: Listenpfad erneut prüfen oder ZIP aus Dateidialog wählen.
      const pfad = archiv?.pfad ?? await aufruf<string | null>('sicherung_zip_waehlen');
      if (!pfad) return null;
      const daten = new Uint8Array(await aufruf<ArrayBuffer>('sicherung_lesen', { pfad }));
      const dateien = await archivLesen(daten);
      return uebernehmen(await aufruf<ProjektInfo | null>('sicherung_wiederherstellen', {
        dateien: dateien.map((d) => ({ pfad: d.pfad, daten: Array.from(d.daten) })),
      }));
    },
  };
}
