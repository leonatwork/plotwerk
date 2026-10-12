/**
 * Dateizugriff auf den Projektordner. Alle Pfade sind relativ zum Projektordner
 * und verwenden "/" als Trenner. Implementierungen: MemoryFs (Tests, Browser-Demo),
 * TauriFs (echte App, src/backend/tauri).
 */

/** Nur lesen. Die KI-Komponente bekommt ausschließlich diese Schnittstelle. */
export interface ProjektLeser {
  /** Inhalt als UTF-8 oder null, wenn die Datei fehlt */
  lesen(pfad: string): Promise<string | null>;
  /**
   * Dateien (keine Ordner) unterhalb von `ordner`, rekursiv, sortiert. Die Pfade sind relativ
   * zum Projektordner (nicht zu `ordner`), z. B. auflisten('manuskript') → ['manuskript/lotte.md', …].
   * Fehlender Ordner → []. `ordner` = '' listet das ganze Projekt.
   */
  auflisten(ordner: string): Promise<string[]>;
  existiert(pfad: string): Promise<boolean>;
}

/** Lesen und schreiben. Nur die Persistenzschicht (core/projekt) und der Editor-Speicherpfad nutzen sie. */
export interface ProjektDateisystem extends ProjektLeser {
  /** Atomar schreiben (temp + rename). Legt fehlende Ordner an. */
  schreiben(pfad: string, inhalt: string): Promise<void>;
  /** Datei entfernen. Persistenzschicht legt vorher einen Schnappschuss in .versionen/ an. */
  entfernen(pfad: string): Promise<void>;
  /**
   * Binärdatei lesen (Recherche-Bilder, G8); null = fehlt. Optional: nur Backends mit Binärzugriff
   * (MemoryFs, TauriFs). Aufrufer nutzen leseBinaer() aus core/projekt.
   */
  lesenBinaer?(pfad: string): Promise<Uint8Array | null>;
  /** Binärdatei atomar schreiben; nur unter recherche/ (binaerPfadErlaubt). Aufrufer nutzen schreibeBinaer(). */
  schreibenBinaer?(pfad: string, daten: Uint8Array): Promise<void>;
}
