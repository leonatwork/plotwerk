/**
 * ProjektDateisystem über die Rust-Kommandos fs_*. Jede Instanz gehört zu genau einem
 * geöffneten Projektordner (Kennung): Schreibvorgänge eines alten Projekts landen nach
 * einem Wechsel nie im neuen.
 */
import { binaerPfadErlaubt, pruefePfad, type ProjektDateisystem } from '@core/projekt';
import { aufruf } from './aufruf';

/** Antwort von projekt_oeffnen/projekt_waehlen/projekt_neu/projekt_letztes */
export interface ProjektInfo {
  kennung: number;
  /** absoluter Pfad des Projektordners */
  pfad: string;
  /** Ordnername */
  name: string;
}

export class TauriFs implements ProjektDateisystem {
  readonly kennung: number;
  readonly pfad: string;
  readonly name: string;

  constructor(info: ProjektInfo) {
    this.kennung = info.kennung;
    this.pfad = info.pfad;
    this.name = info.name;
  }

  async lesen(pfad: string): Promise<string | null> {
    return aufruf<string | null>('fs_lesen', { kennung: this.kennung, pfad: pruefePfad(pfad) });
  }

  async auflisten(ordner: string): Promise<string[]> {
    return aufruf<string[]>('fs_auflisten', { kennung: this.kennung, ordner: pruefePfad(ordner) });
  }

  async existiert(pfad: string): Promise<boolean> {
    return aufruf<boolean>('fs_existiert', { kennung: this.kennung, pfad: pruefePfad(pfad) });
  }

  async schreiben(pfad: string, inhalt: string): Promise<void> {
    const p = pruefePfad(pfad);
    if (!p) throw new Error('Leerer Pfad');
    await aufruf<void>('fs_schreiben', { kennung: this.kennung, pfad: p, inhalt });
  }

  async entfernen(pfad: string): Promise<void> {
    await aufruf<void>('fs_entfernen', { kennung: this.kennung, pfad: pruefePfad(pfad) });
  }

  /** Binärdatei (nur unter recherche/): Rust liefert die Bytes roh (ipc::Response → ArrayBuffer). */
  async lesenBinaer(pfad: string): Promise<Uint8Array | null> {
    const p = pruefePfad(pfad);
    if (!binaerPfadErlaubt(p)) throw new Error(`Binärdateien nur unter recherche/: ${pfad}`);
    if (!(await this.existiert(p))) return null;
    const puffer = await aufruf<ArrayBuffer | number[]>('fs_lesen_binaer', { kennung: this.kennung, pfad: p });
    return puffer instanceof ArrayBuffer ? new Uint8Array(puffer) : Uint8Array.from(puffer);
  }

  /** Binärdatei atomar schreiben: Bytes als roher Request-Body, Pfad und Kennung in Kopfzeilen. */
  async schreibenBinaer(pfad: string, daten: Uint8Array): Promise<void> {
    const p = pruefePfad(pfad);
    if (!binaerPfadErlaubt(p)) throw new Error(`Binärdateien nur unter recherche/: ${pfad}`);
    await aufruf<void>('fs_schreiben_binaer', daten, {
      headers: { 'plotwerk-kennung': String(this.kennung), 'plotwerk-pfad': encodeURIComponent(p) },
    });
  }
}
