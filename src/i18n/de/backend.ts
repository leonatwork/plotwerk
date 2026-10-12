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
    openai: 'Keine Basis-URL eingetragen. Bitte in den KI-Einstellungen die Adresse des Dienstes angeben (z. B. http://localhost:11434/v1).',
  },
  /** OpenAI-kompatibel: kein Modellname eingetragen */
  keinModell: 'Kein Modell eingetragen. Bitte in den KI-Einstellungen den Modellnamen des Dienstes angeben (z. B. qwen3:32b).',
  /** OpenAI-kompatibel: Anfrage größer als die eingestellte Kontextlänge */
  kontextZuGross:
    'Die Anfrage ist mit geschätzt {tokens} Tokens zu groß für die eingestellte Kontextlänge von {grenze} Tokens. Bitte die Kontextlänge im Server erhöhen und in den KI-Einstellungen eintragen, ein Modell mit größerem Kontext wählen oder einen kleineren Umfang prüfen.',
  /** OpenAI-kompatibel: count_tokens gibt es nicht (die App schätzt dann) */
  keinZaehlen: 'Dieser Dienst kann keine Tokens zählen.',
  /** Demo-KI: Anfrage abgebrochen */
  anfrageAbgebrochen: 'Die Anfrage wurde abgebrochen.',
};
