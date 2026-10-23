import type { ProjektDateisystem } from '@core/projekt';
import type { ArchivDatei } from '@core/sicherungen';
import type { SicherungsBackend, SicherungsEinstellungen, SicherungsEintrag } from '../types';
import { aufruf } from './aufruf';
import { TauriFs, type ProjektInfo } from './tauriFs';

const info = (fs: ProjektDateisystem): TauriFs => {
  if (!(fs instanceof TauriFs)) throw new Error('TauriFs expected');
  return fs;
};
const bytes = (daten: ArrayBuffer | number[]) => daten instanceof ArrayBuffer ? new Uint8Array(daten) : Uint8Array.from(daten);

/** PWR1: je Datei u32-LE Pfad-/Datenlänge, UTF-8-Pfad, rohe Bytes. Kein JSON für Projektbytes. */
function wiederherstellungsBody(dateien: ArchivDatei[]): Uint8Array {
  const encoder = new TextEncoder();
  const pfade = dateien.map(d => encoder.encode(d.pfad));
  const laenge = dateien.reduce((n, d, i) => n + 8 + pfade[i].byteLength + d.daten.byteLength, 4);
  const body = new Uint8Array(laenge);
  body.set([80, 87, 82, 49]); // PWR1, identisch zum nativen Empfänger
  const view = new DataView(body.buffer);
  let pos = 4;
  dateien.forEach((d, i) => {
    view.setUint32(pos, pfade[i].byteLength, true);
    view.setUint32(pos + 4, d.daten.byteLength, true);
    pos += 8;
    body.set(pfade[i], pos);
    pos += pfade[i].byteLength;
    body.set(d.daten, pos);
    pos += d.daten.byteLength;
  });
  return body;
}

export function erstelleSicherungsBackend(uebernehmen: (info: ProjektInfo | null) => TauriFs | null): SicherungsBackend {
  const ziele = new WeakMap<ProjektDateisystem, number>();
  const ziel = (fs: ProjektDateisystem) => {
    const id = ziele.get(fs);
    if (id === undefined) throw new Error('Backup destination has not been prepared');
    return id;
  };
  return {
    einstellungenLesen: () => aufruf<SicherungsEinstellungen>('sicherung_einstellungen'),
    einstellungenSchreiben: wert => aufruf<void>('sicherung_einstellen', wert),
    ordnerWaehlen: () => aufruf<string | null>('sicherung_ordner_waehlen'),
    standardOrdner: () => aufruf<void>('sicherung_standard'),
    projekt(fs, mitVersionen) {
      const f = info(fs);
      // Eigener, ausschließlich lesender Archivzugriff für sämtliche Projektbytes.
      return { name: f.name, leser: {
        lesen: pfad => f.lesen(pfad), existiert: pfad => f.existiert(pfad),
        auflisten: () => aufruf<string[]>('sicherung_projekt_auflisten', { kennung: f.kennung, mitVersionen }),
        lesenBinaer: async pfad => bytes(await aufruf<ArrayBuffer | number[]>('sicherung_projekt_lesen', { kennung: f.kennung, pfad })),
      } };
    },
    async auflisten(fs) {
      const vorbereitet = await aufruf<{ ziel: number; namen: string[] }>('sicherung_auflisten', { kennung: info(fs).kennung });
      ziele.set(fs, vorbereitet.ziel);
      return vorbereitet.namen;
    },
    schreiben: (fs, name, daten) => aufruf<string>('sicherung_schreiben', daten, { headers: { 'plotwerk-ziel': String(ziel(fs)), 'plotwerk-name': name } }),
    entfernen: (fs, name) => aufruf<void>('sicherung_entfernen', { ziel: ziel(fs), name }),
    alleAuflisten: () => aufruf<SicherungsEintrag[]>('sicherung_alle'),
    lesen: async eintrag => bytes(await aufruf<ArrayBuffer | number[]>('sicherung_lesen', { ...eintrag })),
    async wiederherstellen(dateien) {
      const projekt = await aufruf<ProjektInfo | null>('sicherung_wiederherstellen', wiederherstellungsBody(dateien));
      return uebernehmen(projekt);
    },
  };
}
