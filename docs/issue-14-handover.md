# Issue #14 – Ordnerimport

## Grundlage und verbindliche Kriterien

Umsetzung auf `origin/main`, Commit `88315548c66a196b53d000c60ff63cf804baeead`.
Der Arbeitsbaum war vor Beginn sauber. Keine fremden PR-Stände verwendet.
Grundlage ist der im Auftrag vollständig bereitgestellte Issue-Text einschließlich der
triagierten Entscheidungen. `CLAUDE.md`, `CONTRIBUTING.md`, Architektur und Design-Vorgaben
wurden gelesen. GitHub-Abfragen mit `gh` sind durch Harness-Berechtigungen gesperrt:
zusätzliche Kommentare und vorhandene offene PRs konnten nicht geprüft werden.
Eine Abhängigkeit von einem offenen PR ist im vorliegenden Code nicht erforderlich;
die Prüfung auf Überschneidungen mit offenen PRs bleibt offen.

| Kriterium | Umsetzung / Nachweis |
| --- | --- |
| AC-1 | Natürliche Dateinamensortierung, feste Sortiersprache unabhängig von DE/EN; Parser- und UI-Tests. |
| AC-2 | Nur `# ` am Anfang nach abgeschlossenem Frontmatter und optionalen Leerzeilen zählt; Titelzeile entfernt, Parser-Tests mit BOM/CRLF. |
| AC-3 | Titel aus Dateiname ohne Endung und führende Ziffern samt Trennzeichen (Leerraum, Punkt, Unterstrich, Bindestrich), sonstiger Text unverändert; lokalisierter Hinweis. |
| AC-4 | BOM, Frontmatter und Titelzeile entfernt, übrige Zeichen einschließlich äußerem Leerraum, CRLF, Anführungszeichen und `--` erhalten; UI-Test bis Speichern und Neuladen. |
| AC-5 | `.txt`-Leerzeilen bleiben als Markdown-Absatzgrenzen erhalten; einfache Zeilenumbrüche bleiben unverändert. |
| AC-6 | Leere Dateien/Dateien ohne Body, Lese- und UTF-8-Fehler übersprungen; eigene Hinweise, übrige Kapitel importiert. |
| AC-7 | Lokalisierter leerer Zustand ohne Kapitelvorschau/Übernahme; auch ausschließlich übersprungene Dateien zeigen ihre Hinweise. |
| AC-8 | Word-/Ordner-Quellenwahl, Menü „Importieren …“ / „Import…“; Rust liest eine Ebene, nur erlaubte Endungen, keine versteckten Dateien oder Symlinks. Rust-Tests ergänzt, nativer Nachweis offen. |

Die triagierte Einschränkung „nur Überschrift am Anfang“ hat Vorrang vor der ursprünglichen
Formulierung „erste Überschrift der Datei“. AC-4/E7 und die Annahme unveränderter Zeilenenden
haben Vorrang vor einer Normalisierung von `.txt`-Absätzen: Leerzeilen werden nicht neu geschrieben.
Unabgeschlossenes Frontmatter wird aus Gründen des Texterhalts nicht entfernt.

## Technische Einbindung

- `core/importieren/`: reiner Parser, Dateinamensfilter, DE/EN-Hinweise als `ImportErgebnis`.
- `Backend.ordnerWaehlen()`: Ordnername und Liste aus Dateiname/Inhalt oder typisiertem
  Dateifehler; Tauri-Aufruf `import_ordner_waehlen`, Browser-Demo mit `webkitdirectory`
  und strenger UTF-8-Dekodierung.
- Rust liest ausschließlich den unmittelbar im nativen Dialog gewählten Ordner. Kein
  frei angegebener externer Ordnerpfad aus der Webview; keine Änderung am geöffneten Projekt
  durch die Quellenwahl. Endungen werden ohne Beachtung der Groß-/Kleinschreibung geprüft.
- Vorschau und Übernahme verwenden den vorhandenen Importpfad einschließlich `neueId`,
  Anhängen und neuem Projekt. Vorhandener Word-Import bleibt getestet.
- Bestehender Projektleser normalisierte CRLF und entfernte äußeren Leerraum. Für E7 wurde
  additiv `ImportErgebnis.textUnveraendert` / `Kapitel.textUnveraendert` ergänzt. Markierte
  Kapitel speichern den Body direkt nach der Frontmatter-Endzeile ohne zusätzliche
  Leerzeichen und laden ihn zeichengleich. Das YAML-Feld bleibt bei erneutem Speichern erhalten.
  Unmarkierte Kapitel verwenden weiter das bisherige Dateiformat.
- UI verwendet bestehende Dialog-, Radio-, Button- und Importvorschau-Stile mit Theme-Tokens.

## Testgetriebener Nachweis

1. Parser- und DE/EN-UI-Regressionstests vor Implementierung ergänzt; Rust-Tests ebenfalls vor
   dem nativen Code ergänzt (hier nicht ausführbar).
2. Erster gezielter Lauf: Parsermodul noch nicht vorhanden, acht UI-Tests schlagen wegen
   fehlender Quellenwahl fehl. Nach Ergänzung des Parservertrags mit leerem Ergebnis:
   zwölf fachliche Parserfälle rot, zwei Leer-/Filterfälle grün.
3. Nach Implementierung: 37 gezielte Parser-/UI-/bestehende Import/Export-Tests grün.
4. Erweiterter Übernahmetest mit Neuladen: vier DE/EN-Fälle rot wegen CRLF-/Leerraumverlust
   im bisherigen Projektleser. Nach additiver E7-Persistenzkorrektur grün.
5. Erster vollständiger vorgeschriebener Lauf `npm test`: 125 Dateien, 1278 Tests grün.
6. Zusätzlicher Persistenz-Randfalltest zeigt den Verlust des additiven Feldes beim erneuten
   Speichern durch Aufrufer ohne dieses Feld (rot). Serializer erhält die vorhandene
   Kennzeichnung nun ausdrücklich. Abschließender vollständiger Lauf: **125 Dateien,
   1279 Tests grün**.

## Abschlussnachweis

- `npm test`: 1279 Tests in 125 Dateien bestanden.
- `npm run typecheck`: bestanden.
- `npm run build`: bestanden (Vite meldet große Bundles als Warnung).
- `git diff --check`: bestanden.
- `npm run sperrliste`: Exit 0, aber mangels lokaler Liste nichts geprüft.

## Offene Nachweise / Handover

- `npm run sperrliste` endet erfolgreich, meldet aber eine fehlende lokale Sperrliste:
  **keine Inhalte geprüft**, kein Nachweis „ohne Treffer“. Testtexte stammen ausschließlich
  aus Namen/Inhalten des Demo-Romans bzw. synthetischen Format-/Kodierungsfällen.
- Rust/Tauri wird gemäß Auftrag auf diesem Server nicht gebaut. `rustfmt` ist ebenfalls
  nicht installiert. Rust-Code manuell an den Stil angepasst; Formatierung ist **nicht
  durch rustfmt bestätigt**. Auf dem Mac ausführen:
  `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`,
  `cargo test --workspace` (bestehender macOS-CI-Job).
- Manueller Mac-Test offen: Obsidian-/Markdown-Ordner und `.txt`-Ordner, jeweils neues
  und bestehendes Projekt, DE/EN; nativer Menüeintrag, Abbruch, Vorschau und Text nach
  erneutem Öffnen prüfen. Screenshot/Video für den späteren PR ergänzen.
- Browser-Ordnerdialog liefert bei einem physisch vollkommen leeren Ordner browserabhängig
  keine Dateiliste und keinen Ordnernamen; dieser Fall kann wie Abbruch erscheinen.
  Ordner mit ausschließlich ungeeigneten Dateien zeigen den getesteten leeren Zustand;
  die native Mac-Auswahl liefert auch vollständig leere Ordner ausdrücklich.

Keine Commits, Branches, Pushes oder PR-Erstellung in diesem Lauf.
