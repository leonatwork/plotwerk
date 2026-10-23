/** Schnittstelle zwischen Oberfläche und Plattform (Browser-Demo oder Tauri). Besitzer: Fundament. */
import type { IndexSpeicher } from '@core/index/index';
import type { KiTransport } from '@core/ki/index';
import type { KiAnbieter } from '@core/model/types';
import type { ProjektDateisystem } from '@core/projekt/fs';

export interface SicherungsEinstellung {
  aktiv: boolean;
  mitVersionen: boolean;
  /** null = App-Standard, eigener Ort wird ausschließlich vom Rust-Dialog freigegeben */
  ordner: string | null;
}
export interface SicherungsArchiv { name: string; pfad: string }
export interface SicherungsBackend {
  einstellungen(): Promise<SicherungsEinstellung>;
  einstellen(wert: SicherungsEinstellung): Promise<void>;
  ordnerWaehlen(): Promise<string | null>;
  auflisten(fs: ProjektDateisystem | null): Promise<SicherungsArchiv[]>;
  schreiben(fs: ProjektDateisystem, name: string, daten: Uint8Array): Promise<void>;
  entfernen(fs: ProjektDateisystem, name: string): Promise<void>;
  /** null = ZIP-Dateidialog; Ziel immer ein neuer/leerer Ordner, nie das offene Projekt. */
  wiederherstellen(archiv: SicherungsArchiv | null): Promise<ProjektDateisystem | null>;
  leser?(fs: ProjektDateisystem): import('@core/sicherungen').ArchivLeser;
}

export interface GewaehlteDatei {
  name: string;
  daten: Uint8Array;
}

export interface Backend {
  art: 'demo' | 'tauri';
  sicherungen?: SicherungsBackend;
  /** Ordnerauswahl; null = abgebrochen */
  projektOeffnen(): Promise<ProjektDateisystem | null>;
  /** Neuen Projektordner anlegen (mit projekt.md); null = abgebrochen */
  neuesProjekt(titel: string): Promise<ProjektDateisystem | null>;
  /** Zuletzt geöffnetes Projekt (Browser-Demo: das Demo-Projekt); null = keins */
  letztesProjekt(): Promise<ProjektDateisystem | null>;
  /** Datei wählen, z. B. endungen ['docx']; null = abgebrochen */
  dateiWaehlen(endungen: string[]): Promise<GewaehlteDatei | null>;
  /** Speichern-Dialog bzw. Download; false = abgebrochen */
  dateiSpeichern(vorschlag: string, daten: Uint8Array): Promise<boolean>;
  ki: KiTransport;
  indexSpeicher: IndexSpeicher;
  /**
   * API-Schlüssel (Tauri: macOS-Schlüsselbund, je Anbieter ein Eintrag). Der Wert wird nie
   * zurückgelesen. Ohne `anbieter` ist Foundry gemeint (Stand vor der Claude API).
   */
  schluessel: {
    setzen(wert: string, anbieter?: KiAnbieter): Promise<void>;
    vorhanden(anbieter?: KiAnbieter): Promise<boolean>;
    loeschen(anbieter?: KiAnbieter): Promise<void>;
  };
  /** Wird vor dem Beenden aufgerufen (Schnappschüsse, ausstehende Schreibvorgänge). */
  beimBeenden(cb: () => Promise<void>): void;
  /** Datei im Projektordner wurde außerhalb der App geändert (Pfad relativ zum Projekt). */
  aufExterneAenderung(cb: (pfad: string) => void): void;
  /**
   * Nur Browser-Demo: Ist `offen` ein Demo-Projekt in einer anderen Sprache als der aktuellen
   * Oberflächensprache, das Demo-Projekt in der aktuellen Sprache; sonst null.
   */
  demoFuerSprache?(offen: ProjektDateisystem | null): ProjektDateisystem | null;
}
