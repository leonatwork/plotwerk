# Issue #14 – Handover: Markdown-/Text-Ordnerimport

## Grundlage und Reviewstatus

- Basis: `c05aec5d2185657a555b7225345846997e87eea0`, identisch mit der lokalen Referenz
  `origin/main`; Arbeitsbaum vor Beginn sauber. Auf dem vorgegebenen Checkout gearbeitet.
- Verbindliche Grundlage: vollständiger im Auftrag bereitgestellter strukturierter Issue-Text,
  einschließlich der Entscheidungen zur Quellenwahl und zur ausschließlich anfänglichen Titelüberschrift.
- `CLAUDE.md`, `CONTRIBUTING.md`, Architektur, S-11-Anforderungen, Abnahmestand und
  Designreferenz geprüft. Im Workspace existiert kein `AGENTS.md`. Für den Importdialog existiert
  kein eigener Designscreen; vorhandene Dialog-/Radio-Bausteine und Import-CSS wiederverwendet.
- **Nachweislücke:** GitHub-Zugriff per `gh` wurde vom Harness verweigert. Live-Kommentare und
  offene PRs konnten vor den Änderungen nicht geprüft werden. Vor Review mit dem Live-Thread und
  offenen PRs abgleichen. Es wurde kein fremder PR-Code verwendet; keine bekannte Code-Abhängigkeit.
- Keine Commits, Branch-Erstellung, Checkout-Wechsel, Cherry-Picks, Pushes oder PR-Erstellung.
  Keine Produktionsdaten-, Deployment-, Release- oder Merge-Aktionen.

## Verbindliche Akzeptanzkriterien

| AC | Kriterium und Umsetzung | Automatischer Nachweis |
| --- | --- | --- |
| 1 | Eine Datei pro Kapitel; natürliche Reihenfolge `01-ankunft`, `02-ebbe`, `10-flut` | `core/importieren/markdown.test.ts`; DE/EN-Vorschau in `ordnerimport.test.tsx` |
| 2 | Nur `# ` am Anfang nach optionalem Frontmatter/Leerzeilen liefert den Titel; Titelzeile nicht doppelt | Parsertests einschließlich BOM, CRLF, Titel ohne Endumbruch und Raute im Titel |
| 3 | Sonst Dateiname ohne Endung/führende Nummer als Titel und Hinweis; spätere Überschrift unverändert | Parsertests und DE/EN-Hinweise in der Vorschau |
| 4 | Zeichengleicher Body ohne BOM, Frontmatter und Titelzeile; keine Typografieumwandlung | Parsertests für Anführungszeichen, Backslash, `--`, kombinierte Formatierung, Leerraum/CRLF; `core/projekt/importtext.test.ts`; UI-Speichern/Wiederladen |
| 5 | `.txt`-Absätze an Leerzeilen | Zeichengleicher Text und unabhängig mit bestehendem Markdown-Leser geprüfte zwei Absätze |
| 6 | Leere/nicht lesbare/anders kodierte Dateien als Hinweis; Rest importieren | Parser DE/EN; Browser-Lesefehler/UTF-8-Tests; Rust-Tests vorhanden |
| 7 | Ordner ohne passende Dateien: leerer Zustand DE/EN, keine Kapitelliste oder Übernahme | Beide UI-Sprachen und Browser-Filtertest |
| 8 | Rust liest eine Ebene, nur `.md/.markdown/.txt`, ignoriert versteckte Dateien/`.DS_Store`; Menü „Importieren …“/„Import …“; Quellenwahl Word/Ordner | Rust-Unit-Tests vorhanden, noch nicht ausgeführt; Tauri-Brücke und Quellenwahl in Vitest geprüft; Menüänderung im Diff |

Ziel aktuelles/neues Projekt ist unverändert über `importUebernehmen` angebunden. Die DE/EN-UI-Tests
prüfen beide Ziele, Anhängen nach vorhandenen Kapiteln, neue eindeutige IDs und gespeicherte Bodies.
Beispiele stammen aus dem Demo-Roman in `fixtures/`; technische Parser-Randfälle sind synthetisch.

## Technische Entscheidungen

- Öffentliche reine API: `core/importieren/index.ts`, Implementierung `markdown.ts`.
  Eingabe: Dateiname und UTF-8-Inhalt oder einzelner Fehlercode `lesen`/`kodierung`.
  Ergebnis: vorhandenes `ImportErgebnis`; kein neues Modell und keine neuen Abhängigkeiten.
- Sortierung mit festem `Intl.Collator('de', { numeric: true })`, bei Gleichstand nach exaktem Namen.
  Reihenfolge hängt nicht von der UI-Sprache ab. Dateiendungen sind case-insensitive.
- Dateinamen-Titel: führende ASCII-Ziffern und anschließende Leerzeichen, Punkte, Unterstriche oder
  Bindestriche entfernen. Bei rein numerischem Namen bleibt der Stamm als nichtleerer Titel.
- E7: übriger Leerraum bleibt erhalten, einschließlich Leerzeilen vor und nach dem Titel.
  Nur die Titelzeile samt eigenem Zeilenumbruch wird entfernt. Geschlossenes Frontmatter nur am
  Dateianfang entfernen; ungeschlossenes Frontmatter bleibt Text. Keine YAML-Metadatenübernahme.
- Leere/Whitespace-/nur-Frontmatter-Dateien überspringen; eine Titelüberschrift ohne Body ergibt
  ein geplantes Kapitel mit Hinweis. Dateibezogene Hinweise ohne zitierbaren Text haben kein Zitat;
  Hinweise auf importierte Kapitel nutzen den bestehenden `#<Nummer>`-Verweis.
- `.txt` verwendet unveränderte Leerzeilen im vorhandenen Markdown-Body als Absatzgrenzen;
  kein Escaping oder Platzhalter, der Zeichen/Syntax verändert.
- **Für AC-4 notwendiger Persistenzfix:** Der bisherige Kapitel-Leser normalisierte CRLF und
  entfernte Rand-Leerraum. `serializeKapitel` setzt jetzt nur bei sonst bereinigten Texten oder
  vorhandener Kennzeichnung additiv `textUnveraendert: true`. Ein Separator-Umbruch nach dem
  Frontmatter gehört zum Dateiformat; der folgende Body wird exakt geschrieben/gelesen, ohne
  angehängten Endumbruch. Bisherige kanonische Kapiteldateien behalten ihr Format, alte unmarkierte
  Dateien werden wie zuvor gelesen, fremde Metadaten bleiben erhalten. In der Architektur dokumentiert.
- Rust liest ausschließlich den nativ gewählten Ordner, ohne frei übergebbaren Webview-Pfad.
  Dateilesen im Blocking-Worker, strenges UTF-8, Größenlimit 200 MB pro Datei. Größen-/I/O-Fehler
  werden als einzelner Lesefehler gemeldet. Unterordner und Symlinks werden nicht gelesen.
  Transport sind Textstrings, keine JSON-Zahlenarrays für Binärdaten.
- Browser-Demo: `webkitdirectory`, genau eine Ebene filtern, nacheinander lesen, strenger
  `TextDecoder`, Abbruch/DOM-Aufräumen geprüft. Nicht passende Dateien werden nicht gelesen.

## TDD und Qualitätsprüfungen

1. Vor Implementierung: Parser mit minimaler leerer API, UI ohne Quellenwahl und Tauri ohne
   Ordnerschnittstelle: **20 rote Tests**, 19 vorhandene Backendtests grün.
   Kommando: `npm test -- core/importieren/markdown.test.ts src/features/importexport/ordnerimport.test.tsx src/backend/tauri/backend.test.ts`.
2. Browser-Regressionen vor Implementierung: beide Tests rot wegen fehlendem `ordnerWaehlen`.
3. Zusätzlicher UI-Wiederlade-Test machte die bestehende E7-Bereinigung sichtbar.
   Vor Persistenzfix: `npm test -- core/projekt/importtext.test.ts`: **4 rot, 3 grün**.
4. Startbildschirm-Test vor generischer Beschriftung: **1 rot, 4 grün**.
5. Final: `npm test`: **1.388 Tests in 130 Dateien grün**. Die 31 neuen Vitest-Fälle decken Parser,
   Dialog, Browser, Tauri-Brücke und exakte Persistenz ab. Vorhandene Core/UI/Abnahmechecks sind grün.
6. `npm run typecheck`, `npm run build`: grün; bestehende Build-Chunkgrößenwarnung.
7. `git diff --check`: grün.
8. `npm run sperrliste`: Exit 0, aber **keine inhaltliche Prüfung**, weil
   `/home/hermes/.config/plotwerk/sperrliste.txt` fehlt. „Ohne Treffer“ ist hier nicht nachgewiesen.

## Noch offene Nachweise vor Abnahme

- Live-Issue-Kommentare und offene PRs abgleichen (Harness sperrt GitHub).
- Auf macOS: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` in `src-tauri` ausführen. Rust/Tauri wurde entsprechend dem Auftrag hier
  **nicht gebaut**. `rustfmt` ist ebenfalls nicht verfügbar; Rust-Formatierung ist nicht toolgeprüft.
- Die drei neuen Rust-Tests prüfen Ordner-/Endungsfilter, leeren Ordner, fehlende Datei/Ordner,
  leere gültige Datei, CRLF, ungültiges UTF-8 und Symlink-Ausschluss. Ein roter Rust-Testlauf
  vor Implementierung ist auf diesem Server nicht möglich und wird nicht behauptet.
- Manuell auf dem Mac: Obsidian-Ordner und `.txt`-Ordner jeweils in neues und bestehendes Projekt
  importieren; DE/EN-Menü und Dialog prüfen; Leerzustand/Abbruch prüfen; nach Wiederöffnen CRLF,
  Leerraum, Anführungszeichen und Striche vergleichen. Screenshot/Video für den späteren PR ergänzen.
- Sperrlistenprüfung auf einem Rechner mit der tatsächlichen lokalen Sperrliste wiederholen.

Die fachlichen AC aus dem bereitgestellten Text widersprechen einander nicht. AC-8/Rust und die
manuelle Mac-Abnahme sind implementiert, aber plattformbedingt noch nicht vollständig nachgewiesen.
