/** Texte für den Bereich „app“ (deutsch, Quellsprache). Schlüssel: kurze deutsche Bezeichner. */
export const app = {
  darstellung: {
    abschnitt: 'Darstellung',
    schriftgroesse: 'Schriftgröße (px)',
    zeilenbreite: 'Zeilenbreite (px)',
    zeilenhoehe: 'Zeilenhöhe',
    skalierung: 'UI-Skalierung',
    zuruecksetzen: 'Zurücksetzen',
    erklaerung: 'Gilt sofort für alle Projekte. ⌘+ und ⌘− skalieren die ganze Oberfläche. Zurücksetzen stellt Editor und Oberfläche auf die Standardwerte.',
  },
  /** App.tsx: Laden und Ladefehler */
  laden: {
    laedt: 'Lädt',
    fehler: 'Das Projekt konnte nicht geladen werden.',
    neuLaden: 'Neu laden',
  },
  /** Fehlergrenze und Namen der abgesicherten Teile */
  fehlergrenze: {
    titel: '„{bereich}“ konnte nicht angezeigt werden.',
    erneut: 'Erneut versuchen',
    fenster: 'Fenster',
    seitenleiste: 'Seitenleiste',
    dialog: 'Dialog {id}',
  },
  /** dialoge.tsx: Dialog ließ sich nicht laden */
  dialogFehler: {
    titel: 'Der Dialog konnte nicht geöffnet werden',
    neuLaden: 'App neu laden',
  },
  /** Namen der Bereiche (Seitenleiste, Schnellsuche, Mac-Menü) */
  bereiche: {
    schreiben: 'Schreiben',
    kapitel: 'Kapitel-Überblick',
    akte: 'Akte planen',
    figuren: 'Figuren',
    beziehungen: 'Beziehungen',
    orte: 'Orte',
    hinweise: 'Hinweise',
    zeitleiste: 'Zeitleiste',
    faeden: 'Lose Enden',
    recherche: 'Recherche',
    statistik: 'Statistik',
    fragen: 'Fragen',
  },
  /** weitere Suchwörter der Werkzeug-Bereiche für die Schnellsuche (durch Komma getrennt) */
  bereichSuchwoerter: {
    zeitleiste: 'Zeit, Tag, Uhrzeit, Zustand, Zustand einer Figur',
    faeden: 'Lose Enden, Faden, Fäden, Auflösung',
    recherche: 'Bilder, Links, Notizen, Ablage',
    statistik: 'Schreibziel, Tagesziel, Wörter pro Tag, Fortschritt',
    fragen: 'Fragen an das Buch, Chat, Belegstellen',
  },
  seitenleiste: {
    label: 'Seitenleiste',
    bereiche: 'Bereiche',
    werkzeuge: 'Werkzeuge',
    neueHinweise: 'neue Hinweise',
    mitTaste: '{titel} (⌘{taste})',
  },
  start: {
    text: 'Schreiben und planen im eigenen Projektordner.',
    oeffnen: 'Projektordner öffnen',
    neu: 'Neues Projekt',
    titelLabel: 'Titel des neuen Projekts',
    titelPlatzhalter: 'Titel des Buchs',
    anlegen: 'Anlegen',
    importieren: 'Word-Datei importieren',
    demoZuruecksetzen: 'Demo zurücksetzen',
  },
  schnellsuche: {
    titel: 'Schnellsuche',
    feld: 'Figuren, Orte und Kapitel suchen',
    platzhalter: 'Figuren, Orte, Kapitel …',
    treffer: 'Treffer',
    nichts: 'Nichts gefunden.',
    demo: 'Browser-Demo · Änderungen bleiben in diesem Browser gespeichert.',
    demoFrage: 'Alle Änderungen an der Demo verwerfen und neu laden?',
    zuruecksetzen: 'Zurücksetzen',
    demoZuruecksetzen: 'Demo zurücksetzen',
  },
  /** Art des Treffers (rechts in der Schnellsuche) */
  trefferArt: {
    figur: 'Figur',
    ort: 'Ort',
    werkzeug: 'Werkzeug',
  },
  /** Befehle in der Schnellsuche: Titel, Zusatz rechts, Suchwörter (durch Komma getrennt) */
  befehle: {
    vorschau: { titel: 'Buch-Vorschau', zusatz: '⌘⇧B', woerter: 'Vorschau, Lesevorschau, E-Book, Buch' },
    zeitVorschlaege: { titel: 'Zeitpunkte vorschlagen …', zusatz: 'KI', woerter: 'Zeitleiste, Zeit, Zustand, Wann' },
    stimmePruefen: { titel: 'Figurenstimme prüfen …', zusatz: 'KI', woerter: 'Stimme, Ton, Figur, Rede' },
    straengeVorschlagen: { titel: 'Stränge vorschlagen …', zusatz: 'KI', woerter: 'Strang, Stränge, Handlung, Haupthandlung, Nebenhandlung, Plot' },
    marken: { titel: 'Markennamen …', zusatz: 'Lektorat', woerter: 'Marken, Markenliste, Lektorat' },
    typewriter: { titel: 'Typewriter-Modus', zusatz: '⌘⇧T', woerter: 'Schreibmaschine, Zeile mittig, Fokus' },
    wiederholungen: { titel: 'Wiederholungen markieren', zusatz: 'Editor', woerter: 'Wortwiederholung, Satzanfänge, häufige Wörter' },
    vorlesen: { titel: 'Vorlesen', zusatz: 'Editor', woerter: 'Stimme, vorlesen, Sprachausgabe' },
    fassung: { titel: 'Fassung sichern …', zusatz: '⌘⇧S', woerter: 'Schnappschuss, Version, benennen, Lektorat' },
    versionsvergleich: { titel: 'Fassungen vergleichen …', zusatz: 'Versionen', woerter: 'Vergleich, Diff, nebeneinander' },
    leserSimulation: { titel: 'Leser-Simulation …', zusatz: 'KI', woerter: 'Leser, Was weiß der Leser, offene Fragen' },
    abgabe: { titel: 'Für die Abgabe exportieren …', zusatz: 'Export', woerter: 'Normseite, Exposé, EPUB, Lektoratsmappe, Abgabe' },
    rueckimport: { titel: 'Lektorat aus Word übernehmen …', zusatz: 'Import', woerter: 'Rückimport, Änderungen, Kommentare, Word' },
    fadenNeu: { titel: 'Neues loses Ende …', zusatz: 'Lose Enden', woerter: 'Faden, Lose Enden, Handlungsfaden, anlegen' },
    rechercheNeu: { titel: 'Recherche-Eintrag anlegen …', zusatz: 'Recherche', woerter: 'Bild, Link, Notiz, Recherche' },
  },
};
