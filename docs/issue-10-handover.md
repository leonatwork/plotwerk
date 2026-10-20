# Issue #10 – Handover: Suchen und Ersetzen

## Grundlage und verbindlicher Umfang

- Der abgebrochene Versuch hinterließ bereits Code und Tests. Zuerst wurden `git status`
  und `git diff` geprüft; die vorhandene Arbeit wurde fortgeführt.
- `HEAD` und lokales `origin/main`: `8eee912c8e00e702d2a2b6e5554fa30ea1819849`.
  Keine fremden PR-Branches verwendet; keine Branches erstellt, Commits oder Pushes ausgeführt.
- Gelesen: übermittelte vollständige Issue-Beschreibung samt archiviertem Original,
  `CLAUDE.md`, `CONTRIBUTING.md`, relevante Anforderungen, Architektur, Design-Referenzen
  und bestehender Code. Keine `AGENTS.md` im Repository gefunden.
- `kb ask` zu Architektur/Arbeitsstand lieferte keine passende Notiz.
- **Prüflücke:** `gh` ist durch die Sandbox gesperrt. Der aktuelle Kommentar-Thread,
  offene PRs und die Aktualität der lokalen Remote-Referenz konnten nicht geprüft werden.
  Vor Einreichung nachholen. Keine Abhängigkeit von fremder offener PR-Arbeit verwendet.

Die strukturierte Issue-Fassung ist maßgeblich: Planfelder und private Notizen sind enthalten,
Projektsuche nutzt ⌥⌘F, Fokus bleibt ⌘⇧F. Die anderslautenden Out-of-Scope-Punkte des
archivierten Originals sind durch diese Entscheidungen überholt. Reguläre Ausdrücke,
Schnellsuche-Änderungen, Fassungen/Schnappschüsse als Suchquellen und KI-Ersetzung bleiben ausgeschlossen.

## Umsetzung und Nachweise

| AC | Verhalten / automatischer Nachweis |
| --- | --- |
| 1 | Kapitel-Suchleiste über ⌘F, Dekorationen aller Treffer, Zähler, Enter/⇧Enter sowie Vor/Zurück; `Suche.test.tsx`, `app.test.tsx` |
| 2 | Manuskript in `projekt.kapitel`-Reihenfolge mit Nummer, Titel, Kontext; Klick setzt Textanker und öffnet Kapitel; Core-/UI-Tests |
| 3 | Wörtliche Suche, Unicode-Buchstaben/Markierungen/Zahlen als Wortzeichen, Case optional; `core/suche/suche.test.ts` |
| 4 | Erzwungener neuer Schnappschuss vor jedem betroffenen Kapitelschreiben, Originalinhalt in `.versionen/`, keine unbetroffenen Kapitelschreibvorgänge; `slices/suche.test.ts` |
| 5 | Nur `stand`, unverändertes `geschrieben`; auch ohne bestehenden Tageseintrag gegen gespeicherte `statistik.json` getestet; Zählregel dokumentiert |
| 6 | Ersatztext wörtlich, keine Typografie-Regel; Markdown-Sonderzeichen werden für die sichtbare Darstellung maskiert; Core-/UI-Tests |
| 7 | Leere Eingabe / keine Treffer mit deaktivierter Einzel-/Alle-Ersetzung und DE/EN-Hinweisen in Kapitel und Projekt; UI-Tests |
| 8 | Fehlgeschlagener Schnappschuss lässt das betroffene Kapitel unverändert, Meldung nennt dessen Titel; Store-Test |
| 9 | Freitextfelder des vorhandenen Modells einschließlich Figuren-/Orts-/Gruppen-Notizen, Wahrheit, Plan, Szenen, Abweichungen, Anmerkungen, Zeit-/Zustandsnotizen, Bögen, Marken, Recherche-Notizen und bearbeiteten Zusammenfassungen; gruppierte Treffer, bestätigtes Projekt-Alle-Ersetzen und gemeinsame Plan-/Notiz-Rücknahme getestet |

`core/suche` ist reine TypeScript-Logik ohne Dateisystem/DOM/KI. Eine explizite Freitext-Allowlist
erhält IDs, Anker, Referenzen, Enumwerte, Farben und KI-Ablagen. Zusätzlich zur statischen
Importprüfung bestätigt ein Lauf mit Backend-Spies, dass Ersetzen weder KI-Anfrage noch
Tokenzählung auslöst. Suche in Recherche-Notizen ist Teil der Projektsuche; die bestehende
Recherche-Oberfläche und deren ⌘F bleiben eigenständig.

Projekt-Alle-Ersetzen bestätigt die angezeigte Treffermenge; spätere neue Treffer werden nicht
ungefragt einbezogen. Änderungen an bestätigten Feldern lösen einen Konflikt aus. Die letzte
Plan-/Notizaktion wird in Memory gespeichert und beim Projektwechsel verworfen. Undo erhält
andere Felder und verweigert das Überschreiben inzwischen bearbeiteter Felder, auch während
eines vorherigen Undo-Schreibvorgangs. Bei einem solchen Konflikt können vorherige Gruppen
bereits zurückgenommen sein; die Undo-Information bleibt für einen erneuten Versuch erhalten.
Kapitel werden über den bestehenden Versionsverlauf zurückgenommen. Anker bleiben erhalten
und werden nach E4 neu gesucht statt auf den Ersatz umgedeutet.

## Grenzen und noch offene Abnahme

- In strukturierten `[[typ:id|Anzeige]]`-Verweisen wird nur die Anzeige ersetzt. Ersatz mit
  `]`, `|` oder Zeilenumbruch in einer Anzeige wird vor der Aktion mit DE/EN-Meldung
  abgelehnt, um E1/S-07 zu erhalten. Dies schränkt das allgemeine Wörtlichkeitskriterium
  bei Verweis-Anzeigen ein; normale Texte und Anführungszeichen bleiben wörtlich.
- Das archivierte Original erwähnt zusätzlich ⌘Z im offenen Kapitel. Der bestehende
  Editor-Neuladepfad setzt seine History zurück; dafür ist hier ausschließlich der
  Versionsverlauf verfügbar. Die verbindlichen AC verlangen Kapitel-Schnappschüsse und
  App-Undo für Plan/Notizen, kein Editor-Undo für Kapitelersetzung.
- Es gibt keinen dedizierten Suchen/Ersetzen-Screen in den Design-Referenzen. Verwendet
  werden vorhandene UI-Bausteine, Screen-Abstände und ausschließlich Farb-Tokens.
  Visuelle Mac-Abnahme/Screenshot steht aus.
- Rust-Menüeinträge DE/EN sind ergänzt. Rust/Tauri wurde gemäß Server-Vorgabe nicht
  gebaut; Cargo-Tests, Formatierung und Clippy müssen in macOS-CI geprüft werden.
- Manuell auf dem Mac noch prüfen: Menü DE/EN, ⌘F/⌥⌘F/⌘⇧F einschließlich Recherche,
  bestätigtes Alle-Ersetzen im Demo-Projekt Hafenlichter, private Treffer, App-Undo und
  Rückkehr eines Kapitels über den Versionsverlauf. Kein PR eröffnet oder gemergt.

## Testgetriebene Fortsetzung und QS

- Übernommener Stand: relevante Tests zunächst **21 grün**. Der Red/Green-Nachweis des
  abgebrochenen Versuchs ist in dieser Sitzung nicht rekonstruierbar.
- Neue Core-Regressionen: **3 erwartete Fehlschläge vor dem Fix** für Markdown-Umbrüche,
  wörtliche Trenner-Ersetzung und Feldabgrenzung; danach grün.
- Neue Undo-Regression: **1 erwarteter Fehlschlag vor dem Fix** (zwischenzeitliche
  Feldänderung wurde überschrieben); danach grün.
- Neue Statistik-Regression: nach Korrektur eines Test-API-Fehlers **1 fachlich erwarteter
  Fehlschlag vor dem Fix** (kein `stand`-Eintrag für neuen Tag); danach grün.
- `npm test`: **1262 Tests in 124 Dateien grün**, einschließlich Abnahme und bestehender
  KI-Schreibfreiheitsprüfungen. Danach nur zwei Test-Typfehler korrigiert und die betroffenen
  Tests erneut geprüft: **29 Tests in 5 Dateien grün**.
- `npm run typecheck`, `npm run build`, `git diff --check`: erfolgreich im finalen Codestand.
- `npm run sperrliste`: erfolgreich ausgeführt, **keine Sperrliste auf dem Server vorhanden**,
  daher keine Inhaltsprüfung durch dieses Skript. Testdaten stammen aus dem Demo-Projekt.
- Build meldet große Chunks; Vitest meldet bestehende jsdom/Node-Warnungen. Keine Fehler.

## Review-Korrektur: synchronisierte Kapiteltitel

- Gezielt den Befund zu `plaene/<id>/titel` korrigiert: Ersetzen führt den Manuskripttitel
  nach derselben Regel wie `kapitelPlanAendern` mit (geschriebenes Kapitel bzw. vorhandener
  Text). Der gemeinsame Titel bleibt ein Suchtreffer; IDs und Suchumfang bleiben erhalten.
- Vor der synchronisierten Titeländerung wird das Manuskript gesichert. Bei einem
  fehlgeschlagenen Schnappschuss bleiben beide Titel und Dateien unverändert; die Meldung
  nennt das Kapitel. Plan und Manuskripttitel gehören zur selben App-Undo-Gruppe.
  Spätere Textänderungen bleiben beim Undo erhalten; eine spätere Titeländerung verhindert
  ein stilles Überschreiben. Nur geplante, leere Kapitel erzeugen keine Manuskriptschreibung.
- Neue Regressionen im Demo-Projekt: Einzel-/Alle-Ersetzung, Persistenz beider Titel nach
  erneutem Laden, Schnappschuss-Reihenfolge, Fehlerfall und Undo-Konflikt. **Vier fachlich
  erwartete Fehlschläge vor dem Fix**, danach grün; zusätzlich geplantes leeres Kapitel
  und Erhalt späterer Textänderungen geprüft.
- Aktueller QS-Lauf: `npm test` **1267 Tests in 124 Dateien grün**;
  `npm run typecheck`, `npm run build` und `git diff --check` erfolgreich.
  `npm run sperrliste` erfolgreich ausgeführt, weiterhin ohne vorhandene Sperrliste.
- Änderungen dieser Korrektur: `src/state/slices/suche.ts`, zugehörige Tests und dieser
  Handover-Nachtrag. `HEAD` entspricht weiter dem lokalen `origin/main` (`8eee912`).
  GitHub-Thread/PR-Prüfung bleibt wegen gesperrtem `gh` offen. Keine Commits oder Pushes.
