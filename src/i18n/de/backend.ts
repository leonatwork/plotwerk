/** Texte für den Bereich „backend“ (deutsch, Quellsprache). Schlüssel: kurze deutsche Bezeichner. */
export const backend = {
  /** Rust-Kommando ohne verständliche Meldung */
  aufrufFehlgeschlagen: '{kommando} fehlgeschlagen: {fehler}',
  leererPfad: 'Leerer Pfad.',
  binaerNurRecherche: 'Binärdateien nur unter recherche/: {pfad}',
  /** KI-Einstellungen ohne Endpoint, je Anbieter */
  keinEndpoint: {
    foundry:
      'Kein KI-Endpoint eingetragen. Bitte in den KI-Einstellungen die Foundry-URL angeben (https://<ressource>.services.ai.azure.com/anthropic).',
    claude: 'Keine Basis-URL für die Claude API eingetragen. Bitte in den KI-Einstellungen prüfen (Standard: https://api.anthropic.com).',
  },
  /** Demo-KI: Anfrage abgebrochen */
  anfrageAbgebrochen: 'Die Anfrage wurde abgebrochen.',
};
