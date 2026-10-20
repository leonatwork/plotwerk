# Issue #10 – Suchen und Ersetzen

## Grundlage und Lieferstand

Basis: `f20de68326a41a8c862ab88f08d4ab7a815f3059`, identisch mit dem lokalen
`origin/main`. Der abgebrochene Versuch wurde anhand von `git status` und `git diff`
fortgesetzt. Keine fremden PR-Stände verwendet. Änderungen liegen uncommittet im Workspace.

GitHub-Issue-Thread und offene PRs konnten nicht abgerufen werden: Die Umgebung sperrt
`gh`. Verbindliche Grundlage ist deshalb die vollständige strukturierte Issue-Beschreibung
im Auftrag. Kommentare und mögliche zusätzliche Entscheidungen müssen vor der endgültigen
Abnahme geprüft werden; eine Abhängigkeit von offenen PRs ist nicht nachgewiesen.
Die ältere Beschreibung schließt Plan/Notizen aus; die neuere strukturierte Fassung und
AC-9 nehmen sie ausdrücklich auf und haben für diese Umsetzung Vorrang.

## Abnahmekriterien und Nachweise

| Kriterium | Umsetzung / automatischer Nachweis |
| --- | --- |
| AC-1 | ⌘F im Schreiben, alle Treffer dekoriert, Zähler, Enter/Shift+Enter und Navigation; `src/features/suche/suche.test.tsx` |
| AC-2 | ⌥⌘F, getrennte Bereiche, Manuskript in Buchreihenfolge mit Nummer/Titel/Kontext, Klick springt über Textanker zum Editor; Core-, UI- und `src/app/app.test.tsx`-Tests |
| AC-3 | Unicode-Wortgrenzen und Case-Option; `core/suche/suche.test.ts` |
| AC-4 | Neuer Schnappschuss je betroffenem Kapitel vor Persistenz, immer auch bei identischem bisherigen Stand; unbetroffene Kapitel bleiben ungeschrieben; `src/state/slices/suche.test.ts` |
| AC-5 | Nur `stand`, vorhandenes `geschrieben` unverändert und erster Tag mit `geschrieben: 0`; Persistenztest gegen `statistik.json`, Zählregel in Architektur ergänzt |
| AC-6 | Wörtlicher Ersatz ohne Typografie, einschließlich Anführungszeichen, Dollarzeichen, Backslash und Markdown-Sonderzeichen; Core-/Editor-Tests |
| AC-7 | DE-/EN-Leerzustände, Ersetzen bei leerer Suche/ohne Treffer deaktiviert; UI-Tests |
| AC-8 | Fehlgeschlagener Schnappschuss lässt das betreffende Kapitel unverändert, Meldung nennt den Titel, übrige Kapitel werden bearbeitet; Store-Tests |
| AC-9 | Planfelder und alle lokalen Notizen einschließlich Figur/Ort/Wahrheit/Zeitnotizen/Recherche-Notizen; nach Bereichen gruppiert, Rückfrage und App-Undo als ganze Aktion getestet |

Zusätzlich: Editor-Undo, neu gesuchte/verwaiste Anker, ungespeicherter Editor,
gleichzeitig gestartete Aktionen, frei benannte Planfelder und lokale Importgrenzen getestet.
App-Undo hält die letzte Plan-/Notizaktion nur im Speicher; Projektwechsel/Neuladen
verwerfen sie. Bei späteren Änderungen an betroffenen Feldern verweigert Undo die
gesamte Rücknahme, damit nichts überschrieben wird. Manuskript wird über Editor-Undo
oder Versionsverlauf zurückgenommen.

## Testgetrieben ergänzter Rest

Vor den Korrekturen nachweislich rot:

- Markdown-Ersatz mit mehrzeiligem `===` und maskierten Satzzeichen;
- fehlende Kapitelpläne außerhalb der Buchliste / bearbeitete Zusammenfassungswendung;
- gleichzeitige Ersetzen-Aktionen verlieren das App-Undo;
- frei benanntes Figur-Planfeld `anker` wird irrtümlich ausgelassen.

### Nachbesserung der zwei Review-Befunde

Verbindlich für diesen Nachlauf: AC-6 (wörtlicher Ersatz), AC-9 (private Notizen
unbeschädigt, gesamte Aktion rücknehmbar) und der dokumentierte Ausschluss von Verweisen.
Plan- und Notizfelder einschließlich Recherche-Notizen sind Klartext, wie ihre Darstellung
durch `VerweisText`; nur Manuskriptfelder werden als Markdown behandelt.
Die Klartextsuche überspringt vollständige gültige `[[typ:id|Anzeige]]`-Spannen nach
dem Muster von `verweiseZerlegen`, auch Treffer, die eine solche Spanne überlappen.
IDs und gespeicherte Anzeigen bleiben unverändert; Treffer außerhalb behalten ihre Quelloffsets.

Vor dem Fix: gezielter Lauf von `core/suche/suche.test.ts` und
`src/state/slices/suche.test.ts` mit **5 fehlgeschlagenen, 13 bestandenen Tests**.
Die vier neuen Regressionstests reproduzierten zusätzliche Backslashes in Notizen
und beschädigte Verweisziele nach Persistenz/Neuladen; die fünfte rote Prüfung war
die korrigierte bisherige Markdown-Erwartung für Recherche-Notizen.
Nach dem Fix: **32 Tests in 5 Dateien bestanden** (Core-Suche, Store-Suche,
Such-UI und Verweisparser), einschließlich Persistenz/Neuladen und App-Undo.

Nach den Fixes grün. Die bereits vorhandenen Tests des abgebrochenen Versuchs wurden
übernommen; ihr ursprünglicher Rotlauf ist in dieser Sitzung nicht nachweisbar.
App-Tests warten jetzt explizit auf die asynchrone Initialisierung bzw. den
lazy geladenen Editor; der mehrstufige App-Integrationstest hat ein Zeitbudget von
15 Sekunden, damit er auch bei parallelem Build nicht nach fünf Sekunden abbricht.

## Qualitätsprüfungen

- `npm test`: **1.247 Tests in 123 Dateien bestanden** (nach der Review-Nachbesserung).
- `npm run typecheck` und `npm run build`: bestanden (lokaler Frontend-Build).
- `git diff --check`: bestanden.
- `npm run sperrliste`: Exit 0, **keine Inhaltsprüfung**, weil die lokale
  `~/.config/plotwerk/sperrliste.txt` auf dem Server fehlt.
- Rust/Tauri gemäß Auftrag auf Linux nicht gebaut. Die vorhandene macOS-CI führt
  `cargo fmt --check`, Clippy und `cargo test --workspace` aus; noch ausstehend.

## Noch extern abzunehmen

1. Vollständige Issue-Kommentare und offene PRs auf zusätzliche Kriterien prüfen.
2. macOS-CI für die DE-/EN-Menüänderungen prüfen.
3. Auf dem Mac: ⌘F, ⌥⌘F, ⌘⇧F und Recherche-⌘F; native Menüs in DE/EN;
   Alle ersetzen im Demo-Projekt Hafenlichter und Rückkehr über Versionsverlauf;
   Plan-/Privatnotizen per App-Undo zurückholen.
4. Sichtbare UI mit den Design-Screens vergleichen und Screenshot für den Review
   erstellen. Für die neue Suchleiste gibt es keinen eigenen Design-Screen;
   sie nutzt die vorhandenen UI-Bausteine, Abstände und Farb-Tokens.
