# Issue #12 – Externe ZIP-Sicherungen

## Ausgangspunkt und Prüflücken

- Ausgangsstand und `origin/main`: `c05aec5d2185657a555b7225345846997e87eea0`; Arbeitsbaum anfangs sauber.
- Gelesen: mitgelieferte vollständige Issue-Beschreibung, `CLAUDE.md`, `CONTRIBUTING.md`, Architektur,
  relevante Anforderungen/E8/E9, Abnahmestand, Design-Verzeichnis und bestehende Backend-/UI-/Persistenzwege.
  Kein `AGENTS.md` im Workspace. Die Wissensbasis lieferte zu diesem Thema keine zusätzliche Notiz.
- **Live-Prüfung offen:** `gh` ist vom Harness gesperrt. Zusätzliche Issue-Kommentare und offene PRs konnten
  nicht abgefragt werden. Verbindliche Arbeitsgrundlage ist die hier mitgelieferte strukturierte Issue-Fassung;
  insbesondere täglich beim ersten Öffnen, keine ZIP-Sicherung beim Beenden.
- Keine fremden PR-Branches, Cherry-Picks, Branch-Erstellung, Commits, Pushes, PR-Erstellung oder Deployments.
  Eine Abhängigkeit von einem offenen PR ergibt sich aus dem ausgecheckten Code nicht; Live-PR-Abgleich bleibt offen.
- Rust/Tauri und `rustfmt` sind hier nicht verfügbar. Native Tests, Formatierung, Clippy und Mac-Bedienprüfung
  wurden **nicht** ausgeführt. Die Lösung ist ein Reviewstand, keine bestätigte native Abnahme.

## Akzeptanzkriterien und Nachweise

| AC | Verbindliches Verhalten | Umsetzung / Nachweis |
| --- | --- | --- |
| 1 | Erste Öffnung pro lokalem Kalendertag erzeugt externe ZIP; Sicherung schreibt nicht ins Projekt | `projektLaden` startet die eigene Sicherungswarteschlange; vorhandene Tages-ZIPs verhindern Doppelläufe. UI-/Store-Test mit ausstehendem ZIP-Schreiben, MemoryFs-Unverändertheitstest. Native Tages-Sicherung noch auf Mac prüfen. Wörtliche Unverändertheit des gesamten Projektordners: siehe E8-Konflikt unten. |
| 2 | Alle Projektdateien, `.plotwerk/`, Recherche-Bilder; keine Temp-Dateien/`.DS_Store`; `.versionen/` optional | Bytegetreuer ZIP-Roundtrip gegen MemoryFs inklusive leerer Datei und Binärbild. Native, strikte Projektauflistung überspringt keine I/O-Fehler; eigener ausschließlich lesender Byte-Command. Größen-/Symlink-Grenze unten. |
| 3 | 7 neueste Tagesstände und 4 ältere Wochenstände, fremde Dateien unberührt | Reine Rotation mit festen Zeitpunkten, konkreten verbleibenden Daten und ISO-Jahreswechsel; Kalender-/Zählerprüfung. Rust listet nur vollständige ZIPs mit gültigem Muster; Rotation erst nach erfolgreichem Schreiben. |
| 4 | Manueller Menübefehl sichert sofort auch nach heutiger Sicherung | Nativer Menüpunkt DE/EN → `projekt-sichern`; Editor und Schreibwarteschlange zuerst sichern. Eigene Kollisionsnamen, `create_new` ohne Überschreiben/Hardlinks. UI-Menübefehl und täglicher/manueller Auslöser getestet. |
| 5 | Startbildschirm: Sicherung in neuen leeren Ordner entpacken und öffnen; leerer Zustand | Wiederherstellungsdialog mit Backend-Mocks, Hinweis bei leerer Liste, beschädigte ZIP ohne Zielwahl. ZIP-Pfade, Symlinks, Größen und CRCs vor Zieldialog prüfen. Native Wiederherstellung baut in eigenem Geschwisterordner auf und veröffentlicht per `rename`; Nichtleerheit und Fehlerpfad als Rust-Tests angelegt. Native Bytegleichheit noch auf Mac prüfen; E8 nach Öffnen siehe unten. |
| 6 | Externe Pfade, `..`, andere Endungen ablehnen | Schreib-/Lösch-Commands akzeptieren nur vorbereitete native Ziel-Capability und strikte `.zip`-Namen, keine frei übergebenen Zielpfade. Native Ordnerwahl mit persistierter, geschützter Freigabe. Symlink-/Pfad-/Namens-Tests in Rust angelegt, auf diesem Server nicht ausgeführt. `pfad.rs` und fs_*-Freigaben bleiben unverändert. |
| 7 | Fehlergrund DE/EN, Schreiben und Autosave weiter möglich | Separater Hinweisstatus statt `speichern.fehler`; DE-/EN-UI-Tests, fehlgeschlagenes Schreiben ohne Rotation, echter Autosave/Store-Persistenzpfad während ausstehender ZIP. Nicht beschreibbares Ziel noch auf Mac prüfen. |
| 8 | Kein Sicherungslauf beim Beenden, bestehende 3-s-Frist unverändert | Keine ZIP in Beenden-Callbacks und keine Einbindung in `alleSpeichernAbwarten`; eigener Hintergrundlauf. `beenden.rs` unverändert. Bestehende Tauri-Beenden-Tests und Autosave-Tests mitgeprüft; tatsächliche Frist mit großem Projekt auf Mac prüfen. |

## Präzisierungen und nicht vollständig erfüllbare Lesarten

1. **Namenskollisionen:** Das angenommene Muster wird um einen optionalen Zähler `-2`, `-3`, … ergänzt.
   Ohne diese Ergänzung wären mehrere manuelle Sicherungen derselben Minute bei gleichzeitigem Verbot des
   Überschreibens nicht möglich. Kalender und Zähler (2 bis `u32::MAX`) werden in Rust/TS gleich geprüft.
2. **Projektname und Ort:** Portable ASCII-Slugs stammen vom Projektordnernamen, nicht vom veränderlichen
   Buchtitel. Normalfall: Standardbasis `/Sicherungen/<projekt>/`. Gleichnamige Projekte an anderen Orten
   erhalten einen disambiguierten Unterordner; Zuordnung im App-Einstellungsschlüssel `sicherungsProjekte`.
   Bei einem gewählten Basisordner werden ebenfalls Projekt-Unterordner angelegt. Frühere gewählte Basisordner
   bleiben für Wiederherstellen bekannt. Ein Lauf hält sein vorbereitetes Ziel über Ortsänderungen hinweg fest.
3. **Rotation:** Ein jüngster Stand pro Tag; sieben verschiedene Tage. Danach je der jüngste Stand der vier
   neuesten älteren ISO-Wochen. Zusätzliche manuelle Stände desselben Tages können dadurch wieder entfallen.
4. **E8-Konflikt mit AC-1/AC-5:** Die bestehenden Anforderungen schreiben beim Projektöffnen die Aufbewahrung
   der `.versionen/` vor. Sie kann alte Schnappschüsse entfernen – auch nach Öffnen eines wiederhergestellten
   Projekts. Die ZIP-Erstellung verändert keine Quelldatei und die native Entpackung erhält alle Archivbytes;
   ein insgesamt unveränderter Projektordner *nach allen Öffnungsaktionen* ist bei fälliger E8-Bereinigung
   jedoch nicht garantiert. E8 zu unterdrücken wäre eine ausdrücklich ausgeschlossene Policy-Änderung.
   Archivbytes werden vor der E8-Bereinigung erfasst; diese wörtlichen Lesarten der beiden AC bleiben offen.
5. **Technische Grenze:** Maximal 2 GB Projektbytes entpackt bzw. ZIP-Dateigröße, kein ZIP64, keine
   Symlink-Ordner oder sonstigen Sonderdateien. Unlesbare/verschwundene/nicht unterstützte Dateien brechen
   den Lauf ab; es entsteht keine still unvollständige Sicherung. AC-2 ist für darüber hinausgehende Projekte
   nicht vollständig erfüllt. Symlink-Dateien mit Zielen innerhalb des Projekts werden als Dateibytes gesichert.
6. **Abbruch beim Beenden:** Native ZIP-Schreibvorgänge verwenden `create_new` plus `sync_all`. Ein erzwungenes
   Ende kann eine Teil-ZIP hinterlassen. Fehlendes Endverzeichnis schließt sie aus Tagesprüfung, Wiederherstellung
   und Rotation aus; der nächste Lauf erzeugt eine neue ZIP, ohne die Teil-Datei zu überschreiben.

## Testgetriebenes Vorgehen und Qualitätsprüfungen

- Zuerst Kern-Regressionstests. Nach dem API-Gerüst **12 fachlich fehlschlagende Tests** nachgewiesen;
  danach ZIP-Aufbau, Auswahl, Namen, Rotation und sichere Wiederherstellung implementiert.
- UI-/Auslöser-Tests vor Implementierung: **7 fachlich fehlgeschlagene Tests**, vorhandene Demo-Ausblendung grün.
  Danach Menübefehl, Einstellungen, Dialog und Sicherungswarteschlange implementiert.
- Weitere Regressionen vor Korrektur: übergroßes ZIP-Zentralverzeichnis und Rust-/TS-Zählergrenze
  **2 Tests rot**, danach Größen-Prüfung vor Dekompression und identische Zählergrenze.
- Ergänzte Integrationstests: Projektladen/Autosave bei ausstehender ZIP, DE/EN-Fehler, beschädigtes Archiv,
  native Ziel-Capability und Byte-/Kennungsübergabe, konkrete Wochenstände über den Jahreswechsel.
- Rust-Tests sind angelegt; weder rotes noch grünes Laufzeitergebnis auf diesem Server nachweisbar.
- Fortsetzung nach Abbruch: zuerst `git status` und `git diff` geprüft; vorhandene Implementierung erhalten.
  `HEAD` und `origin/main` weiterhin identisch zum oben genannten Ausgangspunkt. `kb ask` erneut ohne passende
  Notiz; Live-Abfrage über `gh` weiterhin gesperrt.
- Weitere Wiederherstellungsregressionen: rohe Verzeichnispfade mit `..` und doppelte ZIP-Einträge wurden von
  JSZip bislang still normalisiert bzw. überschrieben. **2 Tests korrekt rot**, danach Rohpfad-/Duplikatprüfung
  direkt im Zentralverzeichnis vor JSZip ergänzt; beide grün.
- Abschlussprüfungen am 23. Oktober 2026:
  - Relevante Tests: **48 Tests in 3 Dateien grün** (`core/sicherungen`, `src/features/sicherungen`,
    `src/backend/tauri/backend.test.ts`).
  - `npm test`: **1.386 Tests in 128 Dateien grün**, einschließlich Autosave, Beenden und Abnahmetests.
  - `npm run typecheck`, `npm run build`, `git diff --check`: erfolgreich.
  - `npm run sperrliste`: Exit 0, aber **keine Inhaltsprüfung**, da auf dem Server keine Sperrliste
    unter `~/.config/plotwerk/sperrliste.txt` konfiguriert ist.
  - Testlauf meldet Node-/JSDOM-Hinweise zu localStorage und scrollBy; Build meldet große Chunks.
    Keine fehlgeschlagenen Prüfungen.

## Native Restprüfungen vor Freigabe

- Auf Mac: `cargo fmt`, Ergebnis im Diff prüfen, anschließend `cargo fmt --check`,
  `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`.
- Mit dem Demo-Roman aus `fixtures/`: erster Tagesstart, erneuter Start am selben Tag, manuelle Sicherung
  mehrfach in derselben Minute, eigener Ort und Änderung des Orts während eines Sicherungslaufs.
- Wiederherstellen mit Recherche-Bildern und `.plotwerk/`, optional `.versionen/`; byteweiser Vergleich direkt
  nach Entpackung, neuer/leerer Ordner, Nichtleerheit/Abbrechen, beschädigte ZIP, leere Sicherungsliste.
- Nicht beschreibbarer Sicherungsordner in DE und EN; währenddessen tippen und Autosave kontrollieren.
- Laufende große Sicherung + Beenden: Frist ≤ 3 s, kein neuer ZIP-Lauf beim Beenden; erneuter Start nach
  absichtlichem Abbruch muss Teil-ZIP ignorieren. Externes Medium ohne Hardlinks für Schreiben/Wiederherstellen.
- Live-Issue-Kommentare/offene PRs abgleichen und die offenen E8-/Größen-Lesarten bestätigen. Sichtbare native
  UI mit Screenshot für das Review festhalten. Erst nach diesen Prüfungen native Abnahme erklären.

## Review-Korrektur: Wiederherstellung ohne JSON-Projektbytes

- Scope: ausschließlich der gemeldete große JSON-Transfer in `src/backend/tauri/sicherungen.ts`
  und sein nativer Empfänger. Ausgangspunkt dieses Korrekturlaufs: bestehender uncommitteter Issue-Arbeitsstand;
  `HEAD` und `origin/main` weiterhin `c05aec5d2185657a555b7225345846997e87eea0`.
- `sicherung_wiederherstellen` erhält jetzt einen rohen `Uint8Array`-Body. Wire-Format **PWR1**:
  vier Magic-Bytes `50 57 52 31` (hex), anschließend je Datei zwei `u32`-Little-Endian-Längen
  (UTF-8-Pfadbytes, Dateibytes), dann UTF-8-Pfad und rohe Dateibytes. Overhead: vier Bytes insgesamt
  plus acht Bytes und der UTF-8-Pfad pro Datei. Keine Zahlenarrays, JSON-Strings oder Base64-Projektbytes.
- Rust prüft Framing, UTF-8, Pfade, Duplikate, Pflichtdatei und die bestehende 2-GB-Dateibytegrenze vor
  der Zielwahl. Der Hintergrundlauf besitzt den binären Body; Pfade und Dateibytes sind geliehene Ansichten
  darauf. Dadurch keine zusätzliche Dateikopie pro entpackter Datei. Die bestehende Veröffentlichung per
  Staging/`rename` und die engen Dateisystemfreigaben bleiben erhalten.
- Regression vor dem Fix: **2 Tests korrekt rot** (JSON statt Rohbody und verbotene Byte-Iteration).
  Nach dem Fix **50 relevante Tests grün**. Der Transporttest prüft ein 16-MiB-Bild ohne Byte-Iterator,
  exakte kompakte Bodygröße, UTF-8-Pfade, Teilansichten, leere Dateien sowie Bytegleichheit; zusätzlich
  Abbruch und Fehler. Native Vertragstests nutzen denselben festen ersten Datensatz und prüfen
  bytegleiches Entpacken, geliehene Bytes sowie beschädigte Längen, UTF-8, Traversal und Duplikate.
- Abschluss dieses Korrekturlaufs: `npm test` **1.388 Tests in 128 Dateien grün**;
  `npm run typecheck`, `npm run build` und `git diff --check` erfolgreich.
  `npm run sperrliste` Exit 0, jedoch weiterhin keine konfigurierte Sperrliste und damit keine Inhaltsprüfung.
- **Offen:** Native Tests und `rustfmt` sind hier mangels Rust/Tauri nicht ausführbar. Auf Mac insbesondere
  Wiederherstellung mit >150 MB Recherche-Bildern und nahe der dokumentierten 2-GB-Grenze prüfen.
  Der Transfer ist binär, aber kein Streaming: JSZip und IPC halten weiterhin vollständige Binärpuffer;
  der tatsächliche Speicherbedarf bei 2 GB ist hier nicht nativ verifiziert. Live-Issue-/PR-Abfrage weiterhin
  durch die Harness-Regeln gesperrt. Keine Commits oder Pushes in diesem Korrekturlauf.
