# Issue #12 – externe ZIP-Sicherungen

## Grundlage und Grenzen der Prüfung

- Ausgangsstand: `f20de68326a41a8c862ab88f08d4ab7a815f3059`, identisch mit lokalem `origin/main`; sauberer Arbeitsbaum zu Beginn. Kein Branchwechsel, keine fremden PR-Änderungen übernommen.
- Verbindliche Grundlage ist der im Auftrag vollständig bereitgestellte strukturierte Issue-Text. **GitHub-Thread und offene PRs konnten nicht unabhängig geprüft werden:** `gh` ist durch die Tool-Berechtigungen gesperrt. Vor Freigabe bitte Kommentare und offene PRs auf nachträgliche Entscheidungen/Überschneidungen prüfen. Es ist keine bekannte offene-PR-Abhängigkeit eingebaut.
- Gelesen: `CLAUDE.md`, `CONTRIBUTING.md`, `docs/architektur.md`, Design-Screen-Verzeichnis und dessen README; Wissensbasis zu Architektur/Konventionen abgefragt. Kein `AGENTS.md` im Repository gefunden.
- Die geklärte Entscheidung „täglich beim ersten Öffnen, keine Sicherung beim Beenden“ hat Vorrang vor der ursprünglichen Beschreibung und ihrem manuellen Beenden-Test.
- Kein Commit, Push, Branch oder PR angelegt. Keine Releases/Deployments oder Produktionsdatenzugriffe.

## Umsetzung und Akzeptanzkriterien

| AC | Umsetzung / automatischer Nachweis |
| --- | --- |
| 1 | Projektladen startet eine unabhängige Tagesprüfung. Rust speichert den letzten erfolgreichen lokalen Kalendertag je kanonischem Projektpfad in App-Einstellungen. Archivkern liest ausschließlich; Fehler oder lange Archivläufe blockieren das Öffnen nicht. |
| 2 | ZIP mit allen gelisteten Dateien, `.plotwerk`, unbekannten Zusatzdateien und binären Recherche-Bildern. Ausschlüsse: `.DS_Store`, AppleDouble `._*`, `.tmp`, `.temp`, `*~`; `.versionen` optional. MemoryFs-/ZIP-Roundtrip-Test mit binären Bytes. |
| 3 | Neuester Stand der sieben verschiedenen jüngsten Tage, danach der jeweils neueste Stand in vier älteren ISO-Wochen. Nur gültige projektspezifische Datums-ZIP-Namen werden rotiert; andere Dateien bleiben unberührt. Feste Kalender-Testdaten. |
| 4 | Natives Menü „Ablage → Projekt als Archiv sichern …“ / „Back Up Project as Archive…“; Editoränderungen zuerst speichern, dann unabhängig vom Tagesmarker sichern. Wiederholter Menüaufruf getestet. |
| 5 | Startbildschirm → Wiederherstellungsdialog mit Liste und leerem Zustand; alternativ native ZIP-Auswahl. ZIP-Prüfung/CRC in TypeScript; Rust prüft alle relativen Pfade, Duplikate und Datei-/Ordnerkonflikte vor Schreiben und fordert einen neuen/leeren Zielordner. Danach öffnen/laden. Binäre Inhalte bleiben Bytes. |
| 6 | Neue, separat registrierte Archiv-Commands: Schreib-/Löschpfade werden vom Backend aus Projektkennung und freigegebenem Ort abgeleitet, keine beliebigen Zielpfade. Genaues Namensmuster, echte Kalendertage, `.zip`, Symlink-/Traversal-Prüfungen. Rust-Unit-Tests vorhanden, hier nicht ausführbar. `pfad.rs` unverändert. |
| 7 | DE/EN-Fehlerhinweis mit Ursache, im geöffneten Editor schließbar; Archivlauf außerhalb der Autosave-/Beenden-Warteschlange. Tests für beide Sprachen und weiterhin möglichen Schreibzugriff. |
| 8 | Kein ZIP-Beenden-Callback. Bestehende 2800-ms-Oberflächen-/3-s-Rust-Frist unverändert. Backend-Test beendet trotz hängender Tagesprüfung und prüft, dass keine Archiv-Commands beim Beenden gestartet werden. |

Die Sicherung selbst verändert keine Projektdatei. Die bereits vorhandene E8-Schnappschussrotation beim Öffnen bleibt aktiv; die absolute Formulierung „Projektordner bleibt unverändert“ kann deshalb für den gesamten bestehenden Öffnungsvorgang nicht garantiert werden, ohne die ausdrücklich ausgeschlossene E8-Politik zu ändern.

## Festgelegte Implementierungsdetails

- Automatik standardmäßig an, `.versionen` standardmäßig aus. App-Einstellungen, niemals Projektmetadaten.
- Standardbasis: Tauri `app_data_dir()/Sicherungen`, auf macOS `~/Library/Application Support/app.plotwerk.mac/Sicherungen`; darunter Projektordnername. Alternativ native Ordnerwahl als Basis, ebenfalls mit Projekt-Unterordner. Wiederherstellungsliste umfasst die aktuell gewählte Basis; Archive früherer Orte bleiben über die ZIP-Auswahl erreichbar.
- Gleiche Projektordnernamen teilen unter derselben Sicherungsbasis einen Unterordner und eine Namensfamilie. Tagesmarker bleiben je Projektpfad getrennt. Bei mehreren gleichnamigen Projekten bitte unterschiedliche Sicherungsbasen verwenden; getrennte dauerhafte Projektidentitäten sind nicht Teil des vorhandenen Modells.
- Namenskollisionen in derselben Minute: nächste freie Namensminute statt Überschreiben; ZIP-Eintragsdatum bleibt die reale Archivzeit. Damit bleibt das vereinbarte Namensmuster erhalten. Bei sehr vielen Sicherungen bis über Mitternacht kann der Name zum nächsten Tag wandern; der Tagesmarker nutzt weiterhin den tatsächlichen Tag.
- Schreib-/Rotationsaufrufe prüfen, dass der Sicherungsort seit Laufbeginn nicht geändert wurde; ein Ortswechsel bricht den alten Lauf mit Hinweis ab.
- Wiederherstellung bis 1 GiB entpacktem Inhalt / 100.000 Dateien; native Archivlesegrenze 1 GiB. ZIP-Aufbau und Wiederherstellung erfolgen im Speicher. Bei abgebrochener Wiederherstellung kann ein teilweise befüllter neuer Zielordner bleiben; bestehende Dateien werden nie überschrieben.

## TDD und Qualitätsnachweise

- Archivkern-Tests vor Implementierung: roter Lauf wegen fehlendem `core/sicherungen/index.ts`.
- UI-Tests vor Implementierung: roter Lauf wegen fehlendem `src/features/sicherungen/ui.tsx`.
- Tauri-Adapter-Tests vor Implementierung: roter Lauf wegen fehlendem `src/backend/tauri/archiv.ts`.
- Zusätzliche Ortswechsel-Regression vor Fix: Assertion scheitert wegen fehlender Ortsbindung im Schreibheader; anschließend Header und Rust-Prüfung ergänzt.
- Rotationstest-Erwartung korrigiert: ISO-Wochen enden am Sonntag, daher 6./13./20. September statt 2./9./16.; keine Änderung der Fachregel.
- `npm test`: 122 Dateien / 1233 Tests grün beim Gesamtlauf. Nach Ergänzung der DE/EN-/Beenden-Tests abschließend die fünf relevanten Testdateien ausgeführt: 42 Tests grün (`core/sicherungen`, Sicherungen-UI, Tauri-Archivadapter, Tauri-Backend, i18n). Typecheck und Build danach erneut grün.
- `npm run typecheck` und `npm run build`: grün. Build meldet bestehende große Chunks; kein Buildfehler.
- `git diff --check`: grün.
- `npm run sperrliste`: beendet erfolgreich, **keine Begriffsprüfung**, weil `/home/hermes/.config/plotwerk/sperrliste.txt` fehlt.
- Rust fmt/Clippy/Unit-Tests und native Mac-Oberfläche konnten gemäß Servervorgabe nicht ausgeführt werden. Rust-Sicherheitstests sind als Quellcode vorhanden; ein tatsächlicher roter/grüner Rust-Lauf ist nicht nachgewiesen.

## Noch erforderliche Mac-Abnahme

1. Rust: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`; gegebenenfalls Formatierung nachziehen.
2. Projekt erstmals öffnen, ZIP am Standardort prüfen; erneut am selben Tag öffnen, keine zweite automatische ZIP. Manuelles Archiv zweimal in derselben Minute erzeugen.
3. Ort über nativen Dialog ändern, App neu starten, gemerkten Ort prüfen; Projektunterordner und Symlink darauf als Ziel ablehnen.
4. ZIP mit Recherche-Bildern und `.plotwerk` wiederherstellen, Dateien byteweise vergleichen; belegten Zielordner ablehnen; leere Liste und abgebrochene Dialoge prüfen.
5. Nicht beschreibbaren Sicherungsordner auf DE/EN prüfen; weiter tippen und Autosave prüfen. Während eines großen ZIP-Laufs beenden, Frist ≤ 3 s.
6. Sichtbare UI auf dem Mac prüfen und Screenshot für Review ergänzen. Für Sicherungsdialog/Einstellungen existiert kein eigener Design-Screen; Umsetzung verwendet die vorhandenen Dialog-/Button-/Einstellungs-Bausteine ohne neue Farben.

## Review-Korrektur: identisches Projektpräfix in TypeScript und Rust

- Ausschließlich den gemeldeten Namensunterschied korrigiert: `projektName` erhält Unicode-Normalform und Leerraum am Rand des von Rust geprüften Ordnernamens. Dadurch verwenden ZIP-Aufbau, Kollisionserkennung und Rotation denselben exakten Präfix wie Rust. Keine Rust-Änderung erforderlich.
- Sechs neue Regressionstests für Rand-Leerzeichen, zerlegten Umlaut (`a` + U+0308) und deren Kombination: drei Kernfälle für Archivnamen/Kollisionen/Datum/Rotation sowie drei Adapterfälle mit gemockter Rust-Präfixprüfung. Alle sechs vor dem Fix mit dem erwarteten Namensfehler rot, danach grün.
- Nachweis: `npm test` mit 122 Dateien / 1241 Tests grün; `npm run typecheck`, `npm run build` und `git diff --check` grün. Nach einer reinen Typkorrektur beim Lesen des Test-Headers beide betroffenen Testdateien erneut ausgeführt: 14 Tests grün.
- GitHub-Thread-/PR-Prüfung weiterhin durch Tool-Berechtigungen gesperrt. Rust/Tauri gemäß Servervorgabe nicht gebaut. Auf dem Mac zusätzlich Tages- und manuelle Sicherung für Ordnernamen mit Rand-Leerzeichen und zerlegtem Umlaut prüfen.
- Kein Commit oder Push.
