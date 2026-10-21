# Issue #11 – Handover: Manuskript-Konflikte (Paket 1)

## Ausgangsstand und Umfang

- Grundlage: sauberer Arbeitsbaum, `HEAD` und lokales `origin/main` beide
  `f20de68326a41a8c862ab88f08d4ab7a815f3059`. Keine fremden PR-Branches verwendet.
- Gelesen: mitgelieferte Issue-Fassung einschließlich ursprünglicher Beschreibung,
  `CLAUDE.md`, `CONTRIBUTING.md`, relevante Anforderungen und Architektur (E1/E8/E9,
  reine Core-Logik, additive Modelländerung, DE/EN). Keine `AGENTS.md` im Repository gefunden.
- **Prüflücke:** Die Sandbox verweigert `gh`. Der vollständige aktuelle Kommentar-Thread
  und offene PRs konnten deshalb nicht geprüft werden; auch die Aktualität des lokalen
  `origin/main` gegenüber GitHub ist nicht verifiziert. Vor Einreichung nachholen.
- Die strukturierte Paket-1-Fassung hat Vorrang vor dem darunter archivierten Original:
  keine Schreibsperre, Kapitelmarkierung, Konfliktdialog oder Wort-Diff in diesem Paket.
  Bei doppelten IDs wird **keine** Fassung geladen (die ältere Annahme, die kanonische
  Datei anzuzeigen, ist damit überholt). Keine Abhängigkeit von einem offenen PR verwendet;
  mangels GitHub-Zugriff ist die PR-Lage nicht abschließend geprüft.

## API und Verhalten

- `LadeBericht.konflikte` steht neben `warnungen`. `ProjektDaten.manuskriptKonflikte`
  transportiert dieselben Diagnosen auch über `ladeProjekt` und externe Änderungen.
  Optionales Laufzeitfeld, kein neues Dateiformat und keine Persistierung der Diagnosen.
- `ManuskriptKonflikt`: `art`, betroffene `kapitelIds`, relative `pfade`, lokalisierter
  `grund` (DE/EN). Arten: `doppelte_id`, `name_id_abweichung`, `datei_fehlt`,
  `icloud_platzhalter`, `konfliktname`.
- Doppelte IDs werden vor Aufbau des Kapitel-Records gruppiert; das Ergebnis nennt
  alle beteiligten Pfade. Namensabweichungen werden ebenfalls verworfen und gemeldet.
- Nicht geladene Kapitel bleiben in der Reihenfolge und behalten ihren Plan, haben aber
  **keinen Eintrag in `daten.kapitel`**. Folgepakete müssen diesen Zustand berücksichtigen.
- Reine Konfliktnamen-Hinweise verwerfen nur die Kopie und erhalten den Originaltext,
  auch ungespeicherte lokale Änderungen. Externe Diagnoseänderungen betreffen stabile
  IDs statt ausschließlich den Kopie-Dateinamen; Entfernen der Kopie aktualisiert den Zustand.
- Namensheuristik: Finder-Nummer ab `2`, geklammerter Konfliktmarker (DE/EN), oder
  `<bekannte-id>-<suffix>` als OneDrive-Gerätename (auch kleingeschrieben).
  Von der OneDrive-Heuristik ausgenommen sind Kapitel, deren Dateiname zur ID passt
  und deren eigene ID in `projekt.md` oder einem Kapitelplan registriert ist. Damit
  bleiben reguläre Slugs und Plotwerks nummerierte IDs (`…-2`, `…-3`) ladbar.
  Doppelte IDs und Namensabweichungen werden weiterhin unabhängig davon gemeldet.
  Nicht registrierte Dateien mit diesem Präfix können als Kopie gelten; der Name allein
  ist kein Beweis. Slugs ohne bekannte Basis bleiben unverändert.
- Sichtbare `.<id>.md.icloud`-Dateien werden nur anhand des Namens geprüft, nie gelesen
  oder heruntergeladen. Rust lässt sie in der Dateiliste sichtbar und liefert beim
  Textlesen `None`; die vorhandene Überwachung filtert sie nicht als Hilfsdateien aus.
- Erkennung nur für unmittelbare Dateien in `manuskript/`; andere Kapitel-/Objektordner
  behalten ihre bisherige Ladezuordnung.

## Akzeptanzkriterien und Abgrenzung

| Kriterium aus Paket 1 | Umsetzung / Nachweis |
| --- | --- |
| AC-1 | Doppelte ID als strukturiertes Ergebnis mit allen Pfaden, Vitest mit drei Fassungen |
| AC-3 | Name ungleich Frontmatter-ID gemeldet; keine Übernahme unter falscher ID |
| AC-4 | Sichtbarer Platzhalter: Erklärung „nicht geladen“ in DE/EN, kein Leertext und kein Lesen des Platzhalters |
| AC-5 | Kopie während der Sitzung gemeldet, nicht angehängt; auch Kopien ohne ID und Platzhalterereignisse getestet |
| AC-6 | Keine Fassung bei doppelter ID übernommen; Entfernen der Kopie stellt konfliktfreies Laden wieder her |
| AC-7 | Rust-Namenserkennung sowie Dateiliste/Textlesen als Unit-Test ergänzt; Ausführung in macOS-CI noch erforderlich |
| AC-8 | Bestehende Projekt-/Abnahmetests, Gesamtlauf, Typecheck und Build grün; siehe QS |

**Konflikt mit bestehender Plan-Semantik:** Anforderungen und bestehender Regressionstest
erlauben ungeschriebene Kapitel mit Planstatus `geplant` ohne Manuskriptdatei. Diese bleiben
konfliktfrei leer. Für Kapitel aus `projekt.md` ohne Datei und ohne ausdrücklich geplanten
Status wird `datei_fehlt` gemeldet und kein Leertext geladen. Ein sichtbarer Platzhalter
wird unabhängig vom Status gemeldet. Eine pauschale Fehlermeldung für *jede* fehlende
Manuskriptdatei wäre mit dieser bestehenden Semantik und AC-8 unvereinbar.

Die ursprünglichen Kriterien zur Schreibsperre/Autosave und zu UI/Word-Diff gehören nach
der Paketaufteilung zu Paket 2/3. Dieses Paket garantiert allein Erkennung und Nichtladen,
keine Schreibsperre in allen Speicherpfaden. Manuelle Cloud-Abnahme auf dem Mac folgt
laut Issue nach Paket 3.

## QS

- Testgetrieben: zunächst 11 neue Vitest-Fälle, **11 erwartete Fehlschläge** vor dem Fix
  (u. a. geladene doppelte Fassung, Leertext beim Platzhalter, angehängte Kopie).
- Nachprüfung der Namensheuristik: zwei weitere Regressionen (`… 10.md`, kleingeschriebener
  Gerätename) zunächst **2 erwartete Fehlschläge**, danach korrigiert.
- `npm test -- core/projekt`: erster grüner Fixstand mit 40 Tests.
- Review-Korrektur der OneDrive-Heuristik: fünf Regressionen zunächst **5 erwartete
  Fehlschläge** (registrierte IDs `grundriss-2`, `grundriss-3`, `grundriss-lotte`, externe
  Textänderung und Planregistrierung). Nach dem Fix grün; zusätzlicher Kontrolltest
  bestätigt weiterhin doppelte IDs, Namensabweichungen und echte Konfliktkopien.
- `npm test -- core/projekt`: nach Review-Korrektur **48 Tests grün**.
- `npm test`: final **1237 Tests in 120 Dateien grün**, einschließlich `abnahme/` und
  statischer KI-Schreibfreiheitsprüfung (neues reines Diagnosemodul transitiv geprüft).
- `npm run typecheck`, `npm run build`, `git diff --check`: erfolgreich.
- `npm run sperrliste`: erfolgreich ausgeführt, aber **keine Sperrliste auf dem Server
  vorhanden**, daher keine Inhaltsprüfung durch dieses Skript.
- Rust-Test wurde vor dem Rust-Fix angelegt. Rust/Tauri wurde auf diesem Server gemäß
  Auftrag nicht gebaut oder ausgeführt; Red/Green-Nachweis, fmt und Clippy stehen in
  macOS-CI aus.
- Keine Commits, Pushes oder Branch-Erstellung; kein PR eröffnet, kein Merge/Release/Deployment.

### Nachbesserung des blockierten Test-Gates

- Befund: `funktionen.test.tsx` suchte „Kapitel prüfen“, sobald die Navigation bereit
  war. Das Schreibmodul wird separat lazy geladen; die Elementsuche konnte nach
  ihrem Standardtimeout abbrechen, während die Ansicht noch lud.
- Red/Green-Nachweis: temporär das echte Laden des Schreibmoduls um 1,1 s verzögert.
  Vor der Korrektur derselbe Fehler mit „Kapitel prüfen“ und `aria-busy="true"`;
  mit der Korrektur alle sechs Tests grün. Die künstliche Verzögerung danach entfernt.
- Korrektur nur im betroffenen Test: in `act` auf `ladeBereich('schreiben')` warten,
  dann die vorhandenen Sichtbarkeitsprüfungen ausführen. Keine Assertions entfernt,
  keine Timeouts oder Qualitätsregeln gelockert.
- Abschließend `npm run build && npm test`: **1237 Tests in 120 Dateien grün**.
  `npm run typecheck` und `git diff --check` ebenfalls erfolgreich.
- `npm run sperrliste` erneut ausgeführt; weiterhin keine Sperrliste vorhanden.
  Rust/Tauri gemäß Server-Vorgabe nicht gebaut. Keine Commits oder Pushes.
