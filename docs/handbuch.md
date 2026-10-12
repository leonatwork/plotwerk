# Plotwerk – Handbuch

Plotwerk ist eine lokale Mac-App zum Schreiben und Planen von Romanen. Der Text liegt als Markdown in
einem Projektordner (z. B. in OneDrive oder iCloud), Planung, Figuren, Zeitleiste und Recherche liegen daneben als
Markdown oder JSON. Eine KI liest auf Wunsch mit und liefert Beobachtungen mit wörtlichem Zitat – den Text schreibst nur
du.

Weitere Dokumente: Anforderungen `docs/anforderungen-v1.1.md` · Architektur und Entscheidungen `docs/architektur.md` ·
Abnahmestand `docs/abnahme.md` · Release `docs/release.md` · Mac-Verteilung `docs/mac-verteilung.md` · Design-Vorlagen `docs/design/screens/`

## Grundsätze

- **Lokal.** Alles liegt im Projektordner und lässt sich ohne die App lesen (Obsidian, VS Code). Der SQLite-Index ist
  nur ein Cache und kann gelöscht werden. Ohne Netz funktioniert alles außer der KI.
- **Die KI schreibt nie.** Sie macht keine Formulierungsvorschläge und hat keinen Schreibzugriff. Jede Beobachtung
  braucht ein Zitat, das wörtlich im Buch steht; sonst wird sie verworfen. Antworten mit Ersatztext („besser:“,
  „stattdessen“ …) fallen weg. Du entscheidest jeden Hinweis und Vorschlag einzeln.
- **Plan und Text sind getrennt.** Figurenkarten trennen „Aus dem Text“ (nur lesen, mit Beleg) von „Deine Planung“.
  Abweichungen vom Plan werden festgehalten, nicht korrigiert. Was die KI sehen darf, regelt eine Allowlist (E12):
  Kapiteltext, Titel, Namen, Plan-Felder. Die „Wahrheit hinter den Kulissen“, private Notizen und Anmerkungen gehen nie
  an das Modell.
- **Mehrdeutigkeit ist ein Stilmittel.** Für Figuren und Textstellen legst du die **Gewissheit** fest: „gesichert“,
  „noch offen“ oder „bewusst vage“. Bewusst Vages wird nie als Widerspruch gemeldet.

## Einrichtung und Funktionsumfang

Beim ersten Start fragt ein Assistent, was für ein Schreiber du bist – Anfänger, Mittel, Profi oder Schriftsteller –
und blendet passend dazu Funktionen ein. Jede Funktion hat eine kurze Erklärung und ein Beispiel aus „Hafenlichter“;
du kannst einzelne Funktionen dazu- oder abwählen, die Auswahl als eigenes Preset speichern und festlegen, ob du mit
oder ohne KI arbeitest. „Überspringen“ zeigt alles.

- **Ausgeblendet heißt nicht gelöscht.** Die Daten bleiben im Projekt. Rufst du eine ausgeblendete Funktion über
  Menü oder Tastenkürzel auf, fragt Plotwerk, ob sie eingeblendet werden soll.
- **Einstellungen (⌘,) → Funktionen**: Umfang anpassen, Preset wechseln, Einrichtung erneut starten.
- **KI-Umfang**: Ausgeblendete KI-Funktionen laufen nie. Ohne „Plan-Abgleich“ gehen keine Plan-Felder an die KI,
  jede Prüfung wird kleiner.
- **No-AI-Modus**: Alle KI-Funktionen sind aus, kein Text verlässt den Mac. Vorher zeigt Plotwerk, welche Funktionen
  wegfallen; Hinweise ohne KI (Struktur, Zeit, Schreibweisen) bleiben.

## Funktionen nach Bereichen

Bereiche stehen in der Seitenleiste; die Werkzeuge in der einklappbaren Gruppe „Werkzeuge“ (eingeklappt bleibt das
aktive Werkzeug sichtbar). Alle Befehle finden sich auch in der Schnellsuche (⌘K) und im Mac-Menü.

### Schreiben (⌘1)

- **Kapitelliste** mit Status (geschrieben, Entwurf, geplant) und Wortzahl; Ziehen ändert die Reihenfolge,
  „+ Kapitel planen“ legt ein Kapitel an.
- **Editor**: Text markieren → Blase mit **F** fett, **K** kursiv, **Ü** Überschrift/Absatz, **Notiz** (an Figur, Ort,
  Kapitel oder Plan-Karte heften) und **Gewissheit** (gesichert, noch offen oder bewusst vage). Kürzel ⌘B, ⌘I, ⌘⌥2, ⌘⌥0; ⌘⇧↩ setzt einen
  Szenentrenner `* * *`.
- **Deutsche Typografie** beim Tippen („ “ ‚ ‘ – …); ⌘Z nimmt die Ersetzung zurück.
- **Automatisches Speichern**: Jede Eingabe liegt nach höchstens 2 s auf der Platte; Schnappschüsse in `.versionen/`.
- **Inspektor rechts**: Tab „Plan“ (geplante Szene, „Ich weiche hier ab“, Szenen des Kapitels, Recherche zum Kapitel),
  „Erkannt“ (Figuren, Orte, Motive, KI-Vorschläge), „Hinweise“, „Stil“ (Wiederholungen, Satzanfänge, häufigste Wörter,
  Marken im Kapitel).
- **Typewriter-Modus** (⌘⇧T): Die Zeile mit dem Cursor bleibt in der Mitte, andere Absätze treten zurück.
- **Wiederholungen** (Statusleiste): gleiche Wörter in kurzer Distanz und gleiche Satzanfänge werden markiert, nie
  korrigiert.
- **Vorlesen** (Statusleiste „Vorlesen …“): Satz für Satz mit Markierung, ab Cursor, Auswahl oder Kapitelanfang; Stimme
  und Tempo wählbar, Esc beendet. In der Mac-App spricht macOS `say`, im Browser die Web Speech API.
- **Markennamen** (Prüfen → Markennamen …): Vorkommen je Kapitel, uneinheitliche Schreibweisen, Vorschläge, Liste fürs
  Lektorat als Markdown oder CSV (`plan/marken.md`).
- **Offene Lektorats-Änderungen** aus einem Word-Rückimport sind im Text gepunktet unterstrichen.
- **Tagesziel** als kleiner Ring in der Statusleiste (Klick öffnet die Statistik). Fokus-Modus ⌘⇧F.

### Planen

- **Kapitel-Überblick** (⌘2): Zusammenfassung, Wendung, Antagonisten, „Bis hierhin passiert“, Szenen als Kacheln, lose
  Enden bis hier, „Leserin nach Kap. n“, „Was ist sicher?“ (Gewissheit der Stellen), Recherche zum Kapitel.
- **Akte planen** (⌘3): Akt-Board mit Kopfkarten (Quintessenz, Wendepunkt) und Ideen-Ablage; Umschalter „Nur Plan“,
  „Plan + Text“ und **„Stränge“** – das Strang-Raster zeigt, in welchen Kapiteln ein Strang fehlt oder verschwindet;
  Klick oder Leertaste nimmt ihn in den Kapitelplan auf.
- **Fäden** (⌘9): Board mit Offen, Auflösung geplant, Erledigt, Bewusst offen. Warnung bei Fäden, die zu lange ruhen,
  oder deren geplante Auflösung schon geschrieben ist. „+ Faden“ bzw. „Neuer Faden …“ legt eigene Fäden an.
  Pfeiltasten wandern, ⌥←/⌥→ verschiebt in die Nachbarspalte.
- **Szenen**: Kapitel werden über `* * *` in Szenen geteilt. Pro Szene Titel, Ort, Figuren, Zeit und Notiz – im
  Schreiben-Inspektor und im Kapitel-Überblick. Der Kapiteltext wird dabei nie verändert.
- In Notizen und Plan-Feldern verlinkt `[[` auf Figuren, Orte, Kapitel, Plan-Karten und Ideen.

### Figuren & Beziehungen

- **Figuren** (⌘4): Liste nach Haupt-, Nebenfiguren, „Ungewiss“ und „geplant“; Karte mit „Aus dem Text“ (Belege),
  „Deine Planung“ (mit Umschalter „Gewissheit“), Notizen, Wahrheit hinter den Kulissen (nur für dich), Beziehungen, Hinweisen und Recherche.
- **Bögen** (Umschalter in der Titelleiste): Stufen je Kapitel oder Akt (z. B. „Alles im Lot“ → „Erste Risse“)
  mit wörtlichen Belegen; Auftritte als Linie darunter; „+ Figur vergleichen“ legt Bögen untereinander. Auf einer
  Stufe: ←/→ wechseln, ⌥←/⌥→ verschieben, Entf löschen.
- **Figurenstimme** (Knopf „Stimme“ auf der Karte, Prüfen → Figurenstimme prüfen …): Die KI zeigt Stellen, an denen
  eine Figur anders klingt als sonst – mit auffälliger und typischer Stelle, beide wörtlich. Erscheint auch unter
  Hinweise („Sprache“).
- **Beziehungen** (⌘5): Netz mit Gruppen als Flächen und Zeitregler (zeigt nur, was der Leser bis dahin weiß).
- **Orte** (⌘6): Kapitel, Belege, Unterorte, Schreibweisen zusammenführen, Pauls Weg; Recherche zum Ort.

### Zeit & Struktur

- **Zeitleiste** (⌘8): Kapitel oder Szenen auf einer Tagesachse mit Wochentag, Datum, Tageszeit und Uhrzeit;
  Sicherheit gesichert/vage/offen und wörtlicher Beleg. Lücken als „+n Tage“, Karten ohne Tag unter
  „Abstand unbekannt“. Spuren für Ort und Zustand einer Figur (frei benannte Zustände wie nüchtern, betrunken).
  ←/→ wandert, Pos1/Ende springt.
- **Zeitprüfung ohne KI**: meldet z. B. „Kap. 10 ist Donnerstag, Tag 9 wäre Dienstag“, Zeitsprünge zurück und
  Überschneidungen. Rückblenden und offene Platzhalter werden nicht gemeldet. Aus der Hinweise-Ansicht führt
  „In der Zeitleiste zeigen“ zur Karte.
- **Zeitpunkte vorschlagen …** (Titelleiste der Zeitleiste): Die KI schlägt Zeitpunkte und Zustände mit Beleg vor;
  übernommen wird nur, was du bestätigst.
- **Struktur-Hinweise** (lokal): leeres Kapitel, Satzabbruch am Kapitelende, leere Überschrift beim Import.

### KI-Prüfung & KI-Leser

- **Kapitel prüfen / Buch prüfen** (Titelleiste, Menü „Prüfen“): Widersprüche („Prüfen“), offene Fäden, unbekannte
  Namen, Zeitleiste, Sprache; dazu Zusammenfassungen und lose Enden je Kapitel. Vorher zeigt die App die geschätzten
  Tokens und Kosten. Optional Tiefencheck mit Opus.
- **Hinweise** (⌘7): Filter nach Typ, Kapitel und Status; „Stelle öffnen“, „Ist Absicht“, „Erledigt“. Entschiedene
  Hinweise kommen nicht wieder. Schreibweisen lassen sich festlegen, unbekannte Namen einer Figur zuordnen.
- **Leser-Simulation** (Kapitel-Überblick „Leserin simulieren …“, Fragen → „Leser-Simulation …“): Die KI liest nur
  Kapitel 1 bis n und beschreibt, was eine Erstleserin weiß, fragt, vermutet und wo Spannung entsteht – plus Abgleich
  mit deinen Kapitelplänen („belegt / nur angedeutet / nicht belegt“). Wird veraltet, sobald sich Text oder Plan ändert.
- **Fragen an das Buch** (Werkzeuge → Fragen): „Wo erwähne ich Pauls Bleistifte?“ – Antworten nur mit Belegstellen; Klick
  öffnet die Stelle. „nicht im Buch“ und „ohne Beleg“ sind unterschieden. ↩ fragt, ⇧↩ neue Zeile, ↑ holt die letzte
  Frage zurück. Schreibaufträge lehnt die App ab, ohne das Modell zu fragen.

### Recherche (⌘0)

- Bilder, Links und Notizen ablegen: per Ziehen, ⌘V oder „+ Neuer Eintrag“ (⌘N). Bilder werden nach
  `recherche/dateien/` kopiert. Links lädt die App nie selbst; ⌘↩ öffnet sie im Standardbrowser.
- Einträge an Figuren, Orte, Kapitel oder Szenen heften; Schlagworte, `[[`-Verweise in Notizen.
- Filter nach Art, Ziel und Schlagwort, Suche (⌘F), Raster oder Liste; Leertaste zeigt ein Bild groß.
- Die **Recherche-Leiste** erscheint auf Figurenkarte, Ortskarte, im Kapitel-Überblick, im Schreiben-Inspektor und im
  Szenen-Formular; Dateien lassen sich direkt darauf ziehen.

### Statistik & Versionen

- **Statistik** (Werkzeuge → Statistik): Heute mit Ring, Serie, Durchschnitt der letzten 7 Tage, Fortschritt zum
  Zielumfang mit Abgabedatum, Kalender über 53 Wochen, Wörter je Akt und Kapitel. Zählregel: Löschen zieht nichts ab,
  verschobene Absätze zählen nicht doppelt, Import und Wiederherstellen zählen nicht als geschrieben.
- **Versionsverlauf** (Statusleiste, Ablage → Versionsverlauf …): Schnappschüsse je Kapitel mit Wortvergleich und
  Wiederherstellen (vorher wird der aktuelle Stand gesichert).
- **Fassung sichern …** (⌘⇧S): benannter Stand des ganzen Buchs, eines Kapitels oder einer Auswahl; diese
  Schnappschüsse löscht die Aufbewahrung nie.
- **Fassungen vergleichen …**: zwei Stände nebeneinander, synchrones Scrollen, ⌥↓/⌥↑ nächste/vorige Änderung, ⌥⇧T
  tauscht die Seiten.

### Vorschau & Abgabe

- **Buch-Vorschau** (⌘⇧B): das Manuskript als gesetztes Buch mit Seiten.
- **Exportieren …** (⌘E): .docx oder PDF, ganzes Buch oder Auswahl, ohne Anmerkungen.
- **Für die Abgabe exportieren …** (Ablage): Normseite (.docx, 30 Zeilen à 60 Anschläge, Seitenzahl vorab),
  Exposé-Vorlage (.docx/.md mit Platzhaltern), EPUB 3 (Satz wie die Vorschau), Lektoratsmappe (PDF mit offenen
  Hinweisen). „Angaben zum Buch“ (Autor, Untertitel, Genre, Sprache) stehen in `projekt.md`.
- **Lektorat aus Word übernehmen …** (Ablage): Kommentare werden Anmerkungen, nachverfolgte Änderungen erscheinen als
  Liste. A nimmt an, L lehnt ab, J/K oder ↑/↓ wählen, ↩ springt zur Stelle. Vor jedem Annehmen entsteht ein
  Schnappschuss; geänderte Stellen werden nicht angefasst.

### Import

- **Word-Datei importieren …** (Startbildschirm, Ablage): Kapitel nach Überschrift 1, Fett und Kursiv bleiben, Text
  unverändert, Vorschau mit Struktur-Hinweisen vor der Übernahme.

## Tastenkürzel

| Kürzel | Wirkung |
| --- | --- |
| ⌘1 … ⌘7 | Schreiben, Kapitel-Überblick, Akte planen, Figuren, Beziehungen, Orte, Hinweise |
| ⌘8 · ⌘9 · ⌘0 | Zeitleiste · Fäden · Recherche |
| ⌘K | Schnellsuche (Figuren, Orte, Kapitel, Befehle) |
| ⌘O | Projekt öffnen |
| ⌘E | Exportieren |
| ⌘, | Einstellungen |
| ⌘⇧F | Fokus-Modus |
| ⌘⇧T | Typewriter-Modus |
| ⌘⇧B | Buch-Vorschau |
| ⌘⇧S | Fassung sichern |
| ⌘B · ⌘I | fett · kursiv (Editor) |
| ⌘⌥2 · ⌘⌥0 | Überschrift · Absatz (Editor) |
| ⌘⇧↩ | Szenentrenner `* * *` (Editor) |
| ⌘N · ⌘F · ⌘↩ | neuer Eintrag · Suche · Link öffnen (Recherche) |
| ⌥← · ⌥→ | Karte in die Nachbarspalte (Fäden), Stufe verschieben (Bögen) |
| ⌥↓ · ⌥↑ · ⌥⇧T | nächste/vorige Änderung · Seiten tauschen (Fassungen vergleichen) |
| A · L · J/K | annehmen · ablehnen · wählen (Lektorat aus Word) |
| Esc | Dialog schließen, Vorlesen beenden, Auswahl aufheben |

Statistik und Fragen haben keine eigene ⌘-Taste. Solange ein Dialog offen ist, wechseln die Bereichstasten nicht den
Bereich dahinter.

## Projektordner

```
<Projekt>/
├── projekt.md                 Titel, Kapitelreihenfolge, KI-Einstellungen (ohne Schlüssel), Angaben zum Buch
├── manuskript/<id>.md         ein Kapitel: Frontmatter id, titel + Markdown (Szenen getrennt durch * * *)
├── plan/akte.md · straenge.md · ideen.md · motive.md
├── plan/kapitel/<id>.md       Kapitelplan, auch Zeitpunkt und Szenen
├── plan/zeitleiste.md         Beginn (Tag 1), Zustandsarten, Zustände
├── plan/faeden.md             eigene Fäden, geplante Auflösungen
├── plan/boegen.md             Figuren-Bögen
├── plan/marken.md             Markenliste
├── figuren/<id>.md · gruppen/<id>.md · orte/<id>.md
├── anmerkungen.json           Notizen an Textstellen
├── entscheidungen.json        deine Entscheidungen (Hinweise, Schreibweisen, Fäden, Zusammenfassungen …)
├── statistik.json             Tagesstatistik und Ziele
├── fassungen.json             benannte Fassungen
├── lektorat/aenderungen.json  Änderungen aus Word (offen, angenommen, abgelehnt)
├── recherche/recherche.json   Recherche-Einträge; Bilder unter recherche/dateien/
├── .plotwerk/                 bezahlte KI-Ergebnisse (Analysen, Hinweise, Vorschläge, Stimmen, Leser, Fragen)
└── .versionen/                Schnappschüsse (90 Tage alle, danach einer pro Woche; benannte Fassungen immer)
```

Alles außer den Recherche-Bildern ist Markdown mit YAML-Frontmatter oder JSON. Unbekannte Felder bleiben beim Speichern
erhalten, Änderungen von außen (z. B. aus Obsidian) übernimmt die App. Der Index liegt unter
`~/Library/Application Support/app.plotwerk.mac/` und ist nur ein Cache. Das genaue Format: `docs/architektur.md`.

## KI-Anbieter einrichten

Einstellungen (⌘,) → Anbieter **Microsoft Foundry** oder **Claude API**. Die Einstellungen des anderen Anbieters
bleiben beim Umschalten erhalten.

- **Microsoft Foundry**: Endpoint `https://<resource>.services.ai.azure.com/anthropic`, dazu die Deployment-Namen für
  Erkennung (Haiku), Prüfung (Sonnet) und Tiefencheck (Opus).
- **Claude API**: Basis-URL `https://api.anthropic.com` (überschreibbar) und Modell-IDs (`claude-haiku-5-5`,
  `claude-sonnet-5-5`, `claude-opus-5-5`).
- Der **API-Schlüssel** landet im macOS-Schlüsselbund (je Anbieter ein Eintrag: `azure-foundry` bzw. `anthropic-api`),
  nie im Projektordner und nie in der Weboberfläche. Die Anfrage läuft über den Rust-Kern.

**Kosten grob** (Listenpreise je Million Tokens: Haiku 0,10/0,50 $, Sonnet 2/10 $, Opus 4/20 $ für Eingabe/Ausgabe):
Das Buch geht als gecachter Prefix mit; ein Buch mit 80.000 Wörtern sind rund 120.000 Tokens. Eine Buchprüfung mit
Sonnet liegt damit grob bei 0,50 bis 2 $, eine Leser-Simulation bei rund 0,30 $, eine Frage an das Buch beim ersten Mal
bei rund 0,25 $ und danach aus dem Cache bei wenigen Cent. Die App zeigt vor jedem Lauf die eigene Schätzung; die
Ergebnisse liegen unter `.plotwerk/` und kosten beim erneuten Öffnen nichts.

In der Browser-Demo antwortet eine eingebaute Demo-KI; es gehen keine Daten ins Netz.

## Starten, entwickeln, testen

Voraussetzungen: aktuelles Node (getestet mit 26), für die Mac-App Rust (`export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`).

```sh
npm install
npm run dev            # Browser-Demo mit dem Demo-Projekt: http://localhost:5173
npm run tauri dev      # Mac-App im Entwicklungsmodus
npx tauri build --debug --bundles app   # Mac-App → src-tauri/target/debug/bundle/macos/Plotwerk.app

npm test               # Vitest: core (Logik), ui (Oberfläche, jsdom), abnahme (Akzeptanzkriterien)
npm run typecheck      # TypeScript
npm run build          # Typecheck + Produktions-Build

cd src-tauri
cargo test --workspace # Rust: Pfadwächter, atomares Schreiben, Binärdateien, Vorlesen, KI ohne Dateizugriff
cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check
```

Die Browser-Demo lädt `fixtures/demo-projekt` („Hafenlichter“, Testdaten, siehe `fixtures/README.md`), bei englischer
Oberfläche die englische Fassung `fixtures/demo-projekt-en` („Harbour Lights“), und merkt sich Änderungen je Sprache im
Browser; „Demo zurücksetzen“ (Startbildschirm oder ⌘K) stellt den Ausgangszustand her. Deep-Link für Screenshots:
`http://localhost:5173/#bereich=schreiben&kapitel=9` (weitere Schlüssel in `src/app/deeplink.ts`).

Aufbau: `core/` ist reines TypeScript ohne DOM und Tauri (testbare Logik, `core/ki` nur mit lesendem Zugriff),
`src/` die React-Oberfläche, `src-tauri/` der Rust-Kern (Dateien, Schlüsselbund, KI-Aufruf, Menü).
`abnahme/akzeptanz.test.tsx` enthält je einen Test pro Akzeptanzkriterium. Der Schlüsselbund-Test in Rust ist
`#[ignore]`, weil macOS dafür eine Freigabe verlangt.

## Mac-Verteilung

Releases baut GitHub Actions aus einem Tag `v*` (universelle App, DMG, Update-Feed); Ablauf und Secrets stehen in
`docs/release.md`. Installierte Apps aktualisieren sich über „Plotwerk → Nach Updates suchen …“. Ohne Apple Developer
ID ist der Build ad-hoc signiert (`signingIdentity: "-"`); Signatur und Notarisierung von Hand beschreibt
`docs/mac-verteilung.md` (`scripts/notarisieren.sh`).

## Nicht-Ziele und was bewusst fehlt

- Keine Web-, iPad- oder Windows-Version; geräteübergreifend nur über den synchronisierten Projektordner.
- **Kein iPhone-Begleiter**: Er bräuchte ein vollständiges Xcode-Projekt und ist laut Anforderungen ein Nicht-Ziel.
- Keine KI-Textgenerierung, kein Umschreiben, keine Stilvorschläge. Auch Wiederholungen, Marken und Figurenstimme
  werden nur markiert.
- Kein Buchsatz für den Druck: Normseite, Exposé-Vorlage, EPUB und Lektoratsmappe sind Abgabeformate.
- Keine Mehrbenutzer-Funktionen; Kommentare Dritter kommen nur über den Word-Rückimport.
- Figur oder Ort im eigenen Fenster (S-14, Kann) ist nicht umgesetzt.
- Offen: Live-Test der KI-Funktionen gegen die echten APIs, Notarisierung mit Developer ID, EPUB-Prüfung mit `epubcheck`.
