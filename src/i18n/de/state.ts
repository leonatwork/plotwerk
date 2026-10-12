/** Texte für den Bereich „state“ (deutsch, Quellsprache). Schlüssel: kurze deutsche Bezeichner. */
export const state = {
  /** Fehlermeldungen, die mehrere Slices teilen */
  fehler: {
    keinProjekt: 'Kein Projekt geöffnet.',
    keinBackend: 'Kein Backend verfügbar.',
    nichtBereit: 'Die App ist noch nicht bereit.',
    planFehlt: 'Kein Plan für Kapitel „{id}“.',
    figurFehlt: 'Figur „{id}“ nicht gefunden.',
    ortFehlt: 'Ort „{id}“ nicht gefunden.',
    gruppeFehlt: 'Gruppe „{id}“ nicht gefunden.',
    ideeFehlt: 'Idee nicht gefunden.',
    nameFehlt: 'Name fehlt.',
    versionFehlt: 'Diese Version gibt es nicht mehr.',
    eintragFehlt: 'Diesen Eintrag gibt es nicht mehr.',
    abweichungOhneNotiz: 'Die Abweichung braucht eine Notiz.',
    kapitelMitText: 'Kapitel mit Text werden hier nicht gelöscht.',
    aktNichtLeer: 'Der Akt enthält noch Kapitel.',
  },
  /** Startwerte neuer Einträge (der Nutzer überschreibt sie) */
  standard: {
    kapitel: 'Neues Kapitel',
    idee: 'Neue Idee',
    stufe: 'Neue Stufe',
    feld: 'Neues Feld',
    projekt: 'Neues Projekt',
    akt: 'Akt {nr}',
    vorspann: 'Vorspann',
    manuskript: 'Manuskript',
    /** Planungsfelder einer neuen Figur */
    figurPlan: { alter: 'Alter', beruf: 'Beruf', aussehen: 'Aussehen' },
  },
  planung: {
    nochLeer: 'Noch leer.',
    nichtGeprueft: 'Noch nicht geprüft.',
  },
  /** Anzeige von KI-Fehlern (kiFehlerAnzeige) */
  ki: {
    schluesselAbgelehnt: 'Der API-Schlüssel wurde abgelehnt (401). Bitte in den Einstellungen prüfen oder ersetzen.',
    keinZugriff: 'Kein Zugriff auf das Deployment (403). {text}',
    nichtGefunden: 'Modell oder Endpoint nicht gefunden (404). Bitte in den Einstellungen prüfen. {text}',
    zuVieleAnfragen: 'Zu viele Anfragen an den KI-Dienst (429). Bitte einen Moment warten und später erneut prüfen.',
    ueberlastet: 'Der KI-Dienst ist gerade überlastet. Bitte später erneut prüfen.',
    keineVerbindung: 'Keine Verbindung zum KI-Dienst. Ohne Netz funktioniert alles außer der KI-Prüfung. ({text})',
    schluesselEingeben: 'Bitte einen Schlüssel eingeben.',
    pruefungAbgebrochen: 'Die Prüfung wurde abgebrochen.',
    abgebrochen: 'Abgebrochen.',
    figurWaehlen: 'Wähle zuerst eine Figur.',
  },
  kileser: {
    schreibAuftrag: 'Die KI schreibt keinen Text für das Buch. Frag nach Stellen, Figuren oder Ereignissen im Text.',
    antwortVerworfen: 'Die Antwort wurde verworfen ({grund}). Es wurde nichts gespeichert.',
    belegeVerworfen: {
      one: '{n} Beleg verworfen – nicht wörtlich im Buch.',
      other: '{n} Belege verworfen – nicht wörtlich im Buch.',
    },
  },
  statistik: {
    fassungOhneName: 'Bitte gib der Fassung einen Namen.',
    keinKapitelMitText: 'Es gibt noch kein Kapitel mit Text, das gesichert werden könnte.',
    fassungFehlt: 'Diese Fassung gibt es nicht mehr.',
    nichtInFassung: 'gehört nicht zur Fassung',
    nichtImBuch: 'Kapitel ist nicht mehr im Buch',
    schnappschussFehlt: 'Schnappschuss fehlt',
  },
  abgabe: {
    aenderungFehlt: 'Diese Änderung gibt es nicht mehr.',
    schonImText: 'Die Änderung steht schon im Text. Den Stand davor findest du unter „Versionen“ des Kapitels.',
    kapitelFehlt: 'Das Kapitel gibt es nicht mehr.',
    /** Zusatz im vorgeschlagenen Dateinamen, z. B. „Hafenlichter (Normseiten).docx“ */
    zusatz: { normseite: ' (Normseiten)', expose: ' – Exposé', mappe: ' – Lektoratsmappe', personen: ' – Personen' },
  },
  importexport: {
    keinNeuesProjekt: 'Kein neues Projekt angelegt.',
  },
  recherche: {
    keinBild: '„{name}“ ist kein Bild (erlaubt: JPG, PNG, GIF, WebP, HEIC, TIFF, SVG …).',
    zuGross: '„{name}“ ist {groesse} groß – höchstens {max}.',
  },
};
