# Issue #13 – Handover: Kapitelarchiv (Paket 1)

## Grundlage und Umfang

- Basis: ausgecheckter Stand `8eee912c8e00e702d2a2b6e5554fa30ea1819849`, identisch mit der lokalen Referenz
  `origin/main`; Arbeitsbaum vor Beginn sauber. Keine fremden PR-Branches, Cherry-Picks oder Abhängigkeiten
  auf fremden PR-Code. Keine Commits, Branch-Erstellung, Pushes, PR-Erstellung oder Deployments.
- Verbindlich ist die bereitgestellte strukturierte Issue-Fassung: **nur Archivieren/Wiederherstellen**.
  Die ursprüngliche Beschreibung und der Titel nennen außerdem Teilen/Zusammenführen; diese sind durch
  die spätere Umfangsentscheidung ausdrücklich Pakete 2 und 3 und hier nicht implementiert.
- `CLAUDE.md`, `CONTRIBUTING.md`, Architektur und Designreferenzen geprüft; im Workspace kein `AGENTS.md`.
  `kb ask "Kapitel archivieren: Schnappschüsse, Projektformat und Zuständigkeiten Issue 13"` lieferte keine Notiz.
- **Prüflücke:** `gh issue view 13 --repo leonatwork/plotwerk --comments` und die Abfrage offener PRs wurden
  vom Harness verweigert. Vollständiger Live-Thread und aktuelle PR-Abhängigkeiten sind daher nicht
  verifiziert. Vor Review mit dem Live-Thread abgleichen; Grundlage war der vollständig im Auftrag
  mitgelieferte Issue-Text. Keine bekannte Code-Abhängigkeit auf offene PRs.

## Akzeptanzkriterien und Umsetzung

| AC | Verbindliches Kriterium | Nachweis |
| --- | --- | --- |
| 1 | Manuskript/Plan nach `archiv/`, aus aktiver Reihenfolge entfernen; Text/Plan/Notizen erhalten | `core/projekt/archiv.test.ts`: rohe Dateien bytegleich, echte Demo-Anmerkungen unverändert; Abnahmetest mit Flut |
| 2 | Neuer Schnappschuss vor Archivieren und Wiederherstellen | Beide Dateien im ursprünglichen Versionsverlauf, neue Kollisionsnummer auch bei identischem Inhalt in derselben Sekunde |
| 3 | Kein Archivkapitel in Kapitelliste, Export oder KI-Kontext | UI-Test; unabhängiges DOCX-Lesen mit mammoth und `baueBuchKontext` im Abnahmetest |
| 4 | Alte Position/ID wiederherstellen, keine ID doppelt vergeben | Nachbarn im Archivindex; Test mehrerer benachbarter Kapitel, Wiederherstellung, Neuanlage mit gleichem Titel und Zielkollision |
| 5 | Schnappschussfehler ohne Änderung, Meldung DE/EN | MemoryFs-Tests vor erster/zweiter Sicherung und beim Wiederherstellen; UI-Fehleranzeige in beiden Sprachen und erfolgreicher erneuter Versuch |
| 6 | Analysen/Hinweise erhalten und veraltet behandeln | Additives `veraltet: true`; Flut-Test mit realen kapitelübergreifenden Hinweisen; Ausschluss aktueller Hinweise und Regressionstest für KI-Cache |
| 7 | Befehle in Liste/Inspektor, DE/EN, Projektformat dokumentiert | Beide Komponenten, Archiv-Inspektor über Liste/Verweis, Wörterbücher und `docs/architektur.md` |
| 8 | Vitest core/MemoryFs/Demo, Abnahme AC-1–6, Qualitätschecks | Testdateien und Läufe unten |

Archivierte Dateien liegen unter `archiv/manuskript/<id>.md` und `archiv/plan/kapitel/<id>.md`.
`archiv/index.json` hält reservierte IDs und die vollständige Reihenfolge. Aktive Umordnungen haben Vorrang;
archivierte Kapitel bleiben vor ihrem ursprünglichen nächsten verfügbaren Nachbarn, sonst am Ende.
Anmerkungen und weitere ID-Verweise bleiben in ihren bestehenden Ablagen, Beschriftungen zeigen „archiviert“.
Veraltete KI-Ergebnisse bleiben auch nach Wiederherstellung veraltet, bis eine ausdrücklich gestartete neue
Prüfung sie ersetzt. Keine automatische KI-Neuberechnung. Wiederherstellung zählt nicht als Schreiben.

## TDD und Prüfungen

- Zuerst Core-Regressionstests: ohne Modul Importfehler; mit minimaler werfender API vier fachlich rote Tests.
- Vor State/UI-Implementierung: beide UI- und beide Abnahmetests rot (fehlende Befehle/Store-Aktionen).
- Zusätzliche Regressionen vor den jeweiligen Korrekturen: externe Archivübernahme, Öffnen archivierter
  Verweise und erneuter Versuch nach Sicherungsfehler nachweislich rot, danach grün.
- `npm test`: finaler vollständiger Lauf grün, **1.253 Tests in 122 Dateien**.
- `npm run typecheck`, `npm run build`: grün. Build meldet die bestehende Chunkgrößenwarnung.
- `npm run sperrliste`: Exit 0, aber **keine inhaltliche Prüfung**, weil
  `/home/hermes/.config/plotwerk/sperrliste.txt` auf diesem Server fehlt.
- `git diff --check`: grün.

## Offene Abnahme und technische Grenze

- Manuell auf dem Mac noch auszuführen: Demo-Kapitel Flut mit Anmerkungen archivieren, Archiv-Inspektor und
  Wiederherstellung prüfen; Markdown/Plan und Schnappschüsse in Obsidian vergleichen. Dasselbe mit englischer
  Oberfläche. Screenshot/Video für den späteren PR ergänzen. Linux bietet hier keine Mac-/Tauri-Abnahme.
- Ein I/O-Fehler wird über ein Änderungsjournal zurückgesetzt, einschließlich neuer Sicherungen.
  Die absolute Forderung „ohne Änderung bei jedem Fehler“ ist bei gleichzeitigem **Rollback-I/O-Fehler**
  oder Prozessabbruch nicht garantierbar: `ProjektDateisystem` bietet keine Mehrdatei-Transaktion.
  Bei fehlgeschlagenem Rücksetzen erscheint eine explizite Meldung. Diese Grenze ist auch in der Architektur
  festgehalten; Schnappschussfehler im regulären Fehlerpfad sind unverändert/rollback-geprüft.
- Projektformat und Datenmodell sind additiv. `core/ki` bleibt ausschließlich lesend; Import-Schutztests grün.
