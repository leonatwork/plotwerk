# Issue #15 – Scrivener 3, Pakete 1–3

## Grundlage und Liefergrenze

- Basis: ausgechecktes `origin/main`, Commit `88315548c66a196b53d000c60ff63cf804baeead`.
- Verbindlicher Umfang ist die vom Auftrag bereitgestellte strukturierte Issue-Beschreibung:
  Scrivener 3 auf Mac **und Windows**, oberste Draft-Ordner als Akte, untergeordnete Ordner
  ohne eigenes Kapitel, jedes Textdokument separat. Damit sind die abweichenden Annahmen
  der ursprünglichen Beschreibung (Windows ausgeschlossen, Ordnertext als Kapitel) überholt.
- GitHub-Thread/Kommentare und offene PRs konnten nicht gelesen werden: `gh` ist durch
  die Laufzeitberechtigungen gesperrt. Ein aktueller Live-Status von #14 ist nicht verifiziert.
  Laut bereitgestelltem Issue ist #14 offen; auf diesem Main fehlen Ordnerauswahl und Ordnerimport.
- Deshalb ist Paket 4 (Rust/Backend-Ordnerauswahl, UI-Einstieg und Vorschau-Test) weiterhin
  von #14 abhängig. Diese Lösung implementiert den eigenen Anteil, Pakete 1–3, ohne Code
  fremder PRs zu übernehmen. Issue #15 kann mit dieser Lieferung **noch nicht geschlossen** werden.

## Implementierung und Integration für Paket 4

`core/scrivener/index.ts` exportiert reine Funktionen ohne DOM, Tauri oder Dateisystem:

- `rtfUmwandeln(string | Uint8Array)` → `{ text, markdown }`: gruppenlokales fett/kursiv,
  Absatz-/Zeilenumbrüche, Unicode einschließlich UTF-16-Surrogaten, Unicode-Fallback,
  ANSI-Codepages, MacRoman und UTF-8. Metadaten, Bilder, Fußnoten und Annotationen entfallen.
  Ungültige Syntax wirft `RtfFehler`.
- `parseBinder(xml, sprache?)` → `{ dokumente, akte }`: ausschließlich der eindeutige
  `DraftFolder`, Binder-Tiefensuche, oberste Ordner als nummerierte Akte (auch leere Akte),
  Unterordner nur als Struktur. Recherche/Papierkorb werden nicht besucht. Ungültiges XML,
  DTDs, unsichere oder doppelte Dokumentkennungen werden abgelehnt.
- `importiereScrivener(dateien, sprache?)` → `ImportErgebnis`: `dateien` enthält Dateien
  **relativ zur Wurzel des `.scriv`-Pakets**, als String oder rohe Bytes. Windows-Backslashes
  werden normalisiert. Die eine `.scrivx` muss direkt in der Wurzel liegen. Für RTF rohe Bytes
  übergeben, damit Codepages erhalten bleiben; `.scrivx`/Synopsis sind UTF-8.

Paket 4 soll nach #14 diese Dateisammlung lesend bereitstellen, `sprache()` übergeben und
das Ergebnis in der vorhandenen Import-Vorschau anzeigen. Kein zweiter Ordnerdialog in diesem Anteil.
`Files/Docs` erzeugt eine DE/EN-Ablehnung. Fehlendes `content.rtf` ist bei geplanten Kapiteln
regulär und erzeugt leeren Text ohne Hinweis. Vorhandenes beschädigtes `content.rtf` erzeugt
ein leeres Kapitel und einen Hinweis; beschädigte `notes.rtf` nur eine leere Notiz
und einen Hinweis. Fehlende Synopsis/Notizen sind regulär leer. Hinweise sind über
`importHinweisKapitel` dem Kapitel zugeordnet, ohne erfundene Textzitate.

`ImportKapitel` ist additiv um `szene`, `notiz`, `akt`, `notizPrivat` erweitert;
`ImportErgebnis.akte` enthält import-interne Nummern und Titel. Der Store erstellt neue,
kollisionsfreie Kapitel-IDs über `neueId`, hängt Akte hinter vorhandenen Aktnummern an
und persistiert Manuskript, Kapitelplan und Akte über die bestehenden Speicherwege.
Gleichnamige Akte bleiben getrennt. Leere Texte werden weiterhin als geplant übernommen.

## Entscheidungen/Widersprüche

- Auf Main erlaubt E12 bislang auch `KapitelPlan.notiz` als „Was soll hier passieren?“ im
  KI-Kontext. Das Issue fordert private Scrivener-Dokumentnotizen. Additiv setzt der Import
  deshalb `notizPrivat: true` im Kapitelplan-Frontmatter. Die Kennzeichnung überlebt Laden
  und Speichern; Buchkontext und KI-Leser-Planvergleich lassen diese Notiz weg. Synopsis
  bleibt freigegeben. Bestehende Pläne ohne Kennzeichnung folgen weiter der bisherigen E12-Regel.
- Die Plan-Oberfläche rendert Notizen als Klartext/strukturierte Verweise, nicht Markdown.
  Deshalb wird `notes.rtf` als Klartext importiert; fett/kursiv gelten für Manuskripttext.
- „Zeichengleich zum RTF-Inhalt“ bedeutet dekodierten Text, nicht RTF-Steuerwörter oder
  Markdown-Syntax: Absätze werden `\n\n`, harte Umbrüche `\n`, abschließendes `\par` ist
  Absatzabschluss. Anführungszeichen, Striche und Auslassungspunkte werden nicht typografisiert.
   Markdown-Syntax im Original wird maskiert; Leerraum wird im Markdown als Originalzeichen
   ausgegeben, nicht als HTML-Entity (Plotwerks Markdown-Vertrag dekodiert keine Entities).
   Wie beim bestehenden DOCX-Writer
  kann nicht eindeutig darstellbare CommonMark-Auszeichnung entfallen, niemals zugunsten
  geänderten Textes. Die absolute Forderung „jede denkbare Fett-/Kursivspanne“ ist daher
  mit dem bestehenden Markdown-Vertrag nicht vollständig erfüllbar.
- Bestehendes Projektformat: `parseFrontmatter` normalisiert CRLF im Body, entfernt führende
  Leerzeilen und abschließenden Leerraum; Markdown/Editor können leere Absätze normalisieren.
   Der RTF-Core erhält diese im Ergebnis. Plotwerks Markdown-Leser entfernt gemäß seinem
   Vertrag führenden Leerraum an Absatz-/Fortsetzungszeilen und abschließenden Absatzleerraum;
   Tabs und NBSP innerhalb von Zeilen bleiben erhalten. Die vollständige Zeichen-/Leerabsatztreue über
  Speichern und erneutes Öffnen ist mit dem aktuellen Projektleser nicht garantiert.
  Der gemeinsame Persistenzvertrag wurde hierfür nicht umgebaut.

## Akzeptanzkriterien

| AC | Stand / Nachweis |
| --- | --- |
| 1 | Core: Mac-/Windows-Pfad-Mini-Pakete, Binder-Reihenfolge grün. Native Auswahl und Vorschau offen, Paket 4/#14. |
| 2 | RTF-Tests: Absätze, fett/kursiv, Gruppen/Reset, Codepages, Unicode, Escape-Zeichen, Leerraum und keine Typografie. Grenzen oben. |
| 3 | Synopsis bis zum erneuten Projektladen unverändert im Feld `szene` getestet. |
| 4 | Klartext-Dokumentnotiz in `plan/kapitel/<id>.md` und nach Laden getestet; privater KI-Schutz getestet. |
| 5 | Recherche/Papierkorb im Binder- und Pakettest ausgeschlossen. |
| 6 | `Files/Docs` mit DE/EN-Meldung im Core getestet; native Darstellung folgt Paket 4. |
| 7 | Vorhandenes kaputtes RTF: Import läuft weiter, betroffenes Feld leer, lokalisierter zugeordneter Hinweis; fehlendes RTF bleibt ohne Hinweis leer. Native Darstellung offen. |
| 8 | Oberste/leere/gleichnamige Akte, Unterordner, Dokument-Unterdokumente und Akt-Kollisionen getestet. |

## Testgetriebener Nachweis und QS

- Erst neue Tests: Core-Suites scheiterten an fehlender API; Store-Test fachlich rot,
  weil importierte Akte nicht gespeichert wurden.
- Zusätzlicher KI-Regressionstest vor Fix: zwei fachlich rote Tests belegten Notiz-Leak
  und fehlende persistierte Privatkennzeichnung.
- Zusätzlicher Leerraum-Regressionstest vor Fix: Unicode-Leerraum an Absatzrändern ging
  beim Markdown-Schreiben verloren; nach Maskierung grün.
- Fixtures ausschließlich selbst erstellt unter `fixtures/scrivener-mini.ts`, Demo-Titel
  und synthetische Inhalte, keine privaten Manuskripte.
- Gezielter Lauf: 173 Tests in 13 Dateien grün (Scrivener, DOCX, Import/UI, Persistenz, KI).
- Abschließend `npm test`: **1.281 Tests in 125 Dateien grün**.
- `npm run typecheck` und `npm run build`: grün. Build meldet lediglich große bestehende
  Chunks; Tests melden Node-localStorage-/jsdom-scrollBy-Hinweise ohne Fehlschlag.
- `npm run sperrliste`: Exit 0, aber **keine Inhaltsprüfung**, weil
  `/home/hermes/.config/plotwerk/sperrliste.txt` fehlt. Vor Einreichung mit der tatsächlichen
  lokalen Sperrliste erneut ausführen.
- `git diff --check`: grün.
- Rust/Tauri wird auf diesem Server gemäß Auftrag nicht gebaut. Manueller Import eines
  echten Scrivener-3-Projekts auf Mac sowie Kontrolle in App/Obsidian bleiben Paket 4 vorbehalten.
- Keine Commits, Branches, Pushes, PR-Erstellung oder Deployments in diesem Lauf.

## Review-Korrektur: Entity-Ausgabe und geplante Kapitel

- Umfang ausschließlich die zwei gemeldeten Befunde: Original-Leerraum statt Entity-Ausgabe
  sowie fehlendes `content.rtf` als regulärer leerer Text; DE/EN-Schadensmeldung angepasst.
- Vor dem Fix: gezielter Lauf der beiden Scrivener-Suites mit **10 fachlich fehlgeschlagenen
  Tests**, 23 grün. Nach dem Fix: **33 Tests grün**. Nachweise umfassen Tabs/NBSP durch
  Plotwerks eigenen `core/text`-Markdown-Leser, Leerraum an Zeilenrändern, maskierten
  Szenentrenner und synopsis-only Kapitel mit Mac-/Windows-Pfaden ohne Schadenshinweis.
- Abschließend `npm test`: **1.288 Tests in 125 Dateien grün**; `npm run typecheck`,
  `npm run build` und `git diff --check` grün. Bestehende Build-/jsdom-Hinweise wie oben.
- `npm run sperrliste`: Exit 0, weiterhin keine Inhaltsprüfung wegen fehlender Sperrliste.
- GitHub-Thread/PR-Liveprüfung bleibt wegen gesperrtem `gh` unmöglich. Kein Commit oder Push.

## Review-Korrektur: Auszeichnung bei geschütztem Leerraum

- Befund AC-2: Platzhalter für Leerraum behielten die ursprüngliche Auszeichnung und
  verdeckten die Leerraumerkennung des DOCX-Writers. Nach Rückersetzen entstanden etwa
  `** Lotte **` oder `**Lotte\t**Hafen`, deren Marker CommonMark nicht als Fett erkennt.
- `markdownAbsatz` normalisiert Fett/Kursiv auf dem Originaltext vor der Maskierung:
  Leerraum am Zeilenrand bleibt ohne Auszeichnung; innerer Leerraum erhält ausschließlich
  die gemeinsame Auszeichnung der nächsten Nicht-Leerzeichen derselben Zeile.
  Originalzeichen, Entity-Vermeidung und Szenentrenner-Maskierung bleiben erhalten.
- Testgetrieben: `npm test -- core/scrivener/rtf.test.ts` vor dem Fix **24 fachlich rote
  Regressionstests**, 18 grün. Abgedeckt sind Fett, Kursiv und ihre Kombination mit
  Leerzeichen/Tabs/NBSP/Unicode-Leerraum an Zeilenrändern sowie Tabs/NBSP zwischen Läufen.
  Führende Tabs sind CommonMark-Codeblock-Einrückung; dort werden unveränderte Ausgabe
  und Inline-Auszeichnung ohne Block-Einrückung getrennt geprüft (bestehende Formatgrenze).
- Nach Fix: `npm test -- core/scrivener core/docx src/state/slices/scrivener.test.ts`:
  **88 Tests in 6 Dateien grün**. `npm test`: **1.312 Tests in 125 Dateien grün**.
- `npm run typecheck`, `npm run build` und `git diff --check` grün; bestehende
  Build-/jsdom-Hinweise. `npm run sperrliste`: Exit 0, keine Inhaltsprüfung wegen fehlender Liste.
- In dieser Korrektur nur `core/scrivener/rtf.ts`, dessen Regressionstests und dieser
  Nachweis geändert. GitHub-Zugriff weiterhin gesperrt; HEAD entspricht obigem `origin/main`.
  Kein Commit, Push oder Rust-/Tauri-Build.
