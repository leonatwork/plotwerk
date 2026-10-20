# Issue #12 – Externe ZIP-Sicherung

## Grundlage und Prüflücke

Arbeitsbasis ist unverändert Commit `8eee912c8e00e702d2a2b6e5554fa30ea1819849`, identisch mit dem lokalen
`origin/main`. Keine fremden PR-Stände verwendet. Keine Branches, Commits, Pushes oder PRs angelegt.
Gelesen: gelieferte vollständige Issue-Beschreibung, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/architektur.md`,
Design-Referenz und relevante Persistenz-/Backend-/UI-Dateien. Die Wissensbasis hatte keine passende Notiz.

**Der vollständige GitHub-Thread einschließlich zusätzlicher Kommentare sowie offene PRs konnten nicht
abgerufen werden:** Die Umgebung verweigert `gh`. Daher gelten hier die im Auftrag gelieferten Entscheidungen;
zusätzliche Entscheidungen oder Abhängigkeiten aus GitHub sind nicht verifiziert.

## Verbindliche Akzeptanzkriterien und Umsetzung

| Kriterium | Umsetzung / Nachweis |
| --- | --- |
| AC-1 | Erster erfolgreicher Projektladevorgang pro lokalem Kalendertag startet automatisch eine externe ZIP. Vorhandene Tagesarchive verhindern Wiederholung; nach Fehler wird beim nächsten Öffnen erneut versucht. Eigene Sicherungslogik schreibt nie ins Projekt. Store-Test mit MemoryFs, täglicher Wiederholung und manuellem Menü. Native Ablage auf Mac noch prüfen. |
| AC-2 | Alle Dateien inklusive `.plotwerk/`, Recherche-Bildern und unbekannten Binärdateien; bytegetreu einschließlich BOM. Ausschluss `.DS_Store`, `.tmp`, `.temp`, `.swp`, `.swo` (auch `-<Zahl>`) und `~`; `.versionen/` optional. Core- und Tauri-Adapter-Tests. |
| AC-3 | Neuester Stand je der sieben jüngsten vertretenen Tage; danach jeweils neuester Stand aus vier älteren vertretenen ISO-Wochen. Nur gültige Namen dieses Projekts werden rotiert; fremde Dateien und unmögliche Kalenderdaten bleiben. Test mit 60 festen Tagen und mehreren Sicherungen am selben Tag. |
| AC-4 | Natives DE/EN-Menü „Ablage → Projekt als Archiv sichern …“; Eingaben vorher speichern, anschließend unabhängig von Automatik und vorhandenem Tagesstand sichern. UI-Test. |
| AC-5 | Startbildschirm: Liste im aktuellen Sicherungsort, Leerhinweis und zusätzlicher ZIP-Dateidialog. Ziel ausschließlich aus nativem Dialog, neu oder vollständig leer. ZIP-Pfade/Links werden vor Übergabe geprüft, Rust prüft relative Pfade erneut und schreibt zunächst in eine neue Staging-Ablage. Projekt erst nach erfolgreichem Abschluss öffnen. Tests für leere UI, Abbruch, unsichere ZIP und bytegetreue Wiederherstellung einschließlich Bildern über gemocktes Rust. Nativen Abschluss auf Mac noch prüfen. |
| AC-6 | Neue Commands akzeptieren für Schreiben/Löschen nur einen Dateinamen im festen ZIP-Muster unter einem freigegebenen Sicherungsordner. Keine absoluten Namen, `..`, anderen Endungen oder ZIP-/Projekt-Unterordner-Symlinks. Eigener Ort nur über nativen Dialog; direkte Änderung der Freigabe via `einstellung_schreiben` gesperrt. Rust-Tests ergänzt, hier nicht ausgeführt. `pfad.rs` bleibt unverändert. |
| AC-7 | DE/EN-Hinweis mit Fehlergrund, eigener Hinweiszustand; `ladeStatus` und Autosave-Fehler bleiben unberührt. Tests in beiden Sprachen mit EACCES und anschließendem Speichern. Native Dateirechte auf Mac noch prüfen. |
| AC-8 | Keine Sicherung beim Beenden, kein Beenden-Callback und kein Warten auf Archivläufe in der Autosave-Warteschlange. Rohdatei-I/O und ZIP-Schreiben im Rust-Blocking-Pool. Hängender Sicherungslauf blockiert Laden/Speicher-Warten im Test nicht. Vorhandene 3-s-Rust-Frist unverändert; reale Zeitmessung auf Mac offen. |

## Präzisierungen und Grenzen

- Standard aktiviert, ohne `.versionen/`. Standardort über Tauri `app_data_dir()`:
  macOS `~/Library/Application Support/app.plotwerk.mac/Sicherungen/<Projektordnername>/`.
  Auch ein selbst gewählter Basisordner erhält einen Projekt-Unterordner. Einstellungen liegen nur im App-Ordner.
- **Minutengenauer Name versus mehrfache manuelle Sicherung:** Das feste Muster bleibt
  `<Projekt>-YYYY-MM-DD-HHmm.zip`. Bei Kollision wird die nächste freie Minute im Namen verwendet, niemals
  ein vorhandenes Archiv überschrieben. Der Namenszeitpunkt kann dadurch wenige Minuten vorausliegen.
- Gemeinsame Rust/TS-Namensregel: ASCII-Buchstaben, Ziffern, `_`, `-`, maximal 80 Zeichen;
  ungültige Zeichengruppen → `-`, äußere Bindestriche entfernt, leer → `Projekt`.
  Identisch benannte Projektordner teilen einen Sicherungs-Unterordner. Die bestehende Vorgabe ohne Projekt-ID
  erlaubt keine eindeutige Trennung solcher Projekte; bei Bedarf verschiedene Basisorte wählen.
- **AC-1 „Projektordner unverändert“ und E8:** Die Sicherung selbst verändert nichts. Die bereits vorhandene
  E8-Schnappschuss-Aufbewahrung beim Öffnen kann unabhängig davon alte `.versionen/`-Dateien löschen.
  Sie wurde gemäß Out-of-Scope nicht geändert; eine absolut unveränderte Projektablage bei jedem Öffnen
  wäre mit dieser bestehenden Politik nicht vereinbar.
- Große ZIPs werden im Speicher gebaut/gelesen. Wiederherstellung ist auf 2 GiB entpackte Daten und
  100.000 Dateien begrenzt. Keine Verschlüsselung/Cloud. Browser-Demo zeigt die neue Funktion nicht.
- Es gibt keine spezielle Sicherungs-Designvorlage; die UI verwendet vorhandene Dialog-, Button-,
  Abschnitts- und Fehlerbausteine mit bestehenden Token-basierten Styles.

## Testgetriebener Nachweis

1. Neue Core-/UI-Tests vor Implementierung ausgeführt: zunächst fehlende Module, anschließend
   explizite Platzhalter und rote Assertions für Archivinhalt, Namen, Rotation, Einstellungen und Wiederherstellung.
2. Der erste UI-Lauf enthielt zusätzlich einen falschen Fixture-Import; dieser wurde vor Implementierung
   korrigiert. Fehlende Einstellungs-/Wiederherstellungs-UI wurde durch rote Assertions nachgewiesen;
   die Tages-/Fehlerfälle wurden erst mit der Implementierung erfolgreich ausgeführt.
   ISO-Wochen-Erwartung auf den korrekten Sonntag als jüngsten Wochenstand korrigiert.
3. Nach Implementierung zielgerichtete Suite zuletzt: **40 Tests in fünf Dateien grün**, einschließlich BOM-Test.
4. `npm test`: **1.251 Tests in 123 Dateien grün** (vor zusätzlichem BOM-Test).
5. `npm run typecheck`: grün. `npm run build`: grün; bestehender Chunkgrößen-Hinweis.
6. `npm run sperrliste`: erfolgreich beendet, aber **keine lokale Sperrliste vorhanden; nichts geprüft**.
7. Abschließender zielgerichteter Testlauf, `npm run typecheck` und `git diff --check`: grün.

Rust wurde entsprechend Servervorgabe weder gebaut noch ausgeführt. **Vor Freigabe auf macOS erforderlich:**
`cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`;
gegebenenfalls Formatierung mit `cargo fmt` übernehmen. Keine grüne Rust-CI behauptet.

### Nachprüfung der drei Review-Befunde

- Rust-Formatierung: `sicherungen.rs` manuell in mehrzeilige Rust-Formatierung überführt,
  Imports geordnet sowie Menüeintrag und `projekt::oeffnen`-Signatur umgebrochen.
  **`cargo fmt --check` bleibt unbestätigt:** Weder `cargo` noch `rustfmt` sind auf diesem Server
  verfügbar. Auf macOS `cargo fmt` und anschließend die oben genannten Rust-Prüfungen ausführen.
- ZIP-Schreiben: Hardlink bleibt der erste, atomare Versuch. Bei `Unsupported` oder `PermissionDenied`
  wird das Ziel mit `create_new(true)` exklusiv angelegt, aus der bereits synchronisierten Temp-Datei
  kopiert und synchronisiert. Bestehende Dateien werden auch im Fallback nie überschrieben;
  bei Kopier-/Sync-Fehler wird die neu angelegte ZIP entfernt. Vier Rust-Regressionstests ergänzen
  beide Fehlerarten, Kollisionen, Fehlerbereinigung und den normalen Hardlink-Pfad; hier nicht ausgeführt.
  Der Fallback macht die ZIP während des Kopierens sichtbar; ein Prozessabsturz kann dabei eine
  unvollständige ZIP hinterlassen. Ein Rename mit vorherigem Existenzcheck wurde wegen der
  Überschreib-Race vermieden.
- Reihenfolge: Tages-Sicherung beginnt erst nach Abschluss der E8-Aufbewahrung, auch nach einem
  protokollierten Aufräumfehler. Laden, Autosave-Warten und Beenden warten weiterhin nicht darauf.
  Zwei neue UI-Regressionstests mit angehaltener realer MemoryFs-Löschung schlugen vor dem Fix
  an der vorzeitig gestarteten Sicherung fehl. Danach prüfen sie ZIP-Inhalt und Fehlerhinweis.
- Nach Korrektur: zielgerichtet **29 Tests in vier Dateien grün**; vollständig `npm test`:
  **1.254 Tests in 123 Dateien grün**. `npm run typecheck`, `npm run build` und
  `git diff --check` grün. Build mit bekanntem Chunkgrößen-Hinweis.
  `npm run sperrliste` erfolgreich beendet, weiterhin ohne lokale Sperrliste und daher ohne Inhaltsprüfung.
- Keine Commits oder Pushes. Arbeitsbasis weiterhin identisch mit lokalem `origin/main`.
  GitHub-Thread-/PR-Prüfung weiterhin durch gesperrten `gh`-Zugriff nicht möglich.

### Manuelle Mac-Abnahme (offen)

- Demo-Projekt aus `fixtures/` kopieren, öffnen: externe Tages-ZIP, am selben Tag erneut öffnen: keine zweite
  automatische ZIP; am nächsten Tag neue ZIP. Menü zweimal direkt hintereinander: beide Stände erhalten.
- Eigener Sicherungsort, App-Neustart, gesicherte Freigabe; Ort innerhalb des Projekts muss abgewiesen werden.
- Eigener Ort auf exFAT/FAT bzw. NAS ohne Hardlinks: ZIP vollständig lesbar; Namenskollision überschreibt nichts.
- `.versionen/` umschalten; ZIP mit `.plotwerk/`, Bildern und unbekannten Dateien prüfen.
- Startbildschirm: Liste/Leerhinweis, externe ZIP, Abbruch, Wiederherstellung in neuen/leeren Ordner,
  byteweiser Vergleich; belegten Ordner ablehnen.
- Nicht beschreibbarer Ort in DE/EN: Hinweis mit Grund, Schreiben/Autosave weiter nutzbar.
- Großes Projekt während laufender Sicherung schließen: 3-s-Frist messen; kein neuer Sicherungslauf beim Beenden.
- Screenshot der nativen Einstellungen und Wiederherstellung für Review ergänzen.
