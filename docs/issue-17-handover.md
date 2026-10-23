# Issue #17 – Buchsprache am Editor-Eingabefeld

## Ausgangsstand und Prüflücken

- Basis: HEAD und `origin/main` waren identisch bei
  `88315548c66a196b53d000c60ff63cf804baeead`; der Arbeitsbaum war sauber.
- `CLAUDE.md`, `CONTRIBUTING.md`, die Spracharchitektur und der vorhandene Code wurden gelesen.
  Im Workspace wurde keine `AGENTS.md` gefunden.
- Die Sandbox verweigert `gh`: Der aktuelle vollständige Issue-Thread einschließlich Kommentaren
  und die Liste offener PRs konnten nicht abgerufen werden. Grundlage ist der vollständig im
  Auftrag mitgelieferte Issue-Text. Diese GitHub-Prüfung muss vor Einreichung nachgeholt werden;
  mögliche ergänzende Entscheidungen oder PR-Abhängigkeiten sind deshalb nicht verifiziert.
- Die Lösung basiert ausschließlich auf dem ausgecheckten Main-Stand und vorhandenen Abhängigkeiten.
  Es wurden keine Branches erstellt oder gewechselt, keine fremden PRs übernommen und keine
  Commits, Pushes oder PRs erstellt.

## Verbindliche Akzeptanzkriterien und Nachweis

Aus den strukturierten AC-1 bis AC-5 und dem Umfang des mitgelieferten Issues:

| Kriterium | Nachweis in `src/features/schreiben/schreiben.en.test.tsx` |
| --- | --- |
| AC-1: Englisches Buch → Eingabefeld `lang="en"` | „Harbour Lights“ aus `demoFsEn()`, ausdrücklich bei deutscher Oberfläche |
| AC-2: `de` oder fehlende Sprachangabe → `lang="de"` | Parametrisierter Test, ausdrücklich bei englischer Oberfläche |
| AC-3: Sprachwechsel ohne neue Instanz, Textverlust oder Auswahlsprung | Echter Persistenzweg `abgabe.angabenSpeichern`, Wechsel `de → en → de → fehlend`; gleiche Instanz und DOM, identisches Dokument, gleiche Auswahl, Fokus und funktionsfähiges Undo |
| AC-4: Titel, Artikel und Eingabefeld mit gleichem `lang` | Gemeinsame Assertions für alle drei Elemente beim Laden und nach jedem Wechsel |
| Umfang: Projektwechsel aktualisiert `lang` ohne Neuerzeugung | Wechsel deutsches → englisches → deutsches Demo-Projekt im gemounteten Editor, gemeinsames Kapitel `lotte` |
| AC-5: Regression rot auf Main, grün mit Fix; Qualitätsprüfungen grün | Rot-/Grün-Nachweise unten |

Die Buchsprache folgt `useBuchSprache()`, unabhängig von der Oberflächensprache. BCP-47-Erweiterungen,
weitere Sprachen, Typografie, Stil-Werkzeuge und KI sind nicht Bestandteil der Änderung.

## Umsetzung

In `src/features/schreiben/Editor.tsx` wurde nur `lang: 'de'` durch `lang: buchLang` ersetzt.
Das bestehende TipTap-`useEditor` aktualisiert geänderte Optionen über `editor.setOptions`, wenn
keine Neuerzeugungs-Abhängigkeiten übergeben werden. Ein zusätzlicher Effekt oder eine neue
Editor-Instanz ist daher nicht erforderlich. Die Integrationstests prüfen dieses Verhalten.

## TDD und Qualitätsprüfungen (22.10.2026)

- **Rot:** `npm test -- src/features/schreiben/schreiben.en.test.tsx` mit unverändertem
  Produktionscode auf der Main-Basis: **3 fehlgeschlagen, 5 bestanden**. Alle drei Fehler:
  erwartetes `lang="en"`, tatsächlich `lang="de"` am Eingabefeld. Nach Anpassung des
  jsdom-Koordinatenstubs wurde dieser Rot-Nachweis erneut ohne unbehandelte Fehler geführt.
- **Grün:** `npm test -- src/features/schreiben/schreiben.en.test.tsx src/features/schreiben/Editor.test.tsx`:
  **28 Tests bestanden**. Der abschließende Gesamtlauf enthält auch die finale Stub-Fassung.
- `npm test`: **1258 Tests in 122 Dateien bestanden**, keine unbehandelten Fehler.
- `npm run typecheck`: erfolgreich.
- `npm run build`: erfolgreich; Chunkgrößenwarnung für große Bundles.
- `git diff --check`: erfolgreich.
- `npm run sperrliste`: Exit 0, aber **keine inhaltliche Prüfung**, weil
  `/home/hermes/.config/plotwerk/sperrliste.txt` auf dem Server fehlt.
- Testausgaben enthalten jsdom-Hinweise zu `scrollBy` und Node-Hinweise zu `localStorage`;
  die Tests bestehen. Rust/Tauri wurde gemäß Auftrag auf diesem Linux-Server nicht gebaut.

## Offene manuelle QS / Widerspruch im Issue

Der Issue-Umfang schließt einen VoiceOver-Durchgang aus, während „QS und Nachweis“ eine manuelle
Mac-Prüfung mit VoiceOver verlangt. Diese ist als nachgelagerte manuelle Abnahme dokumentiert;
der Linux-Server kann weder macOS-Rechtschreibprüfung noch VoiceOver verifizieren.

Auf dem Mac „Harbour Lights“ öffnen, `lang="en"` am Eingabefeld prüfen, Rechtschreibprüfung mit
korrektem englischem Text kontrollieren und einen Absatz mit VoiceOver vorlesen lassen.
Automatisierte AC-1 bis AC-5 sind erfüllt; diese manuelle QS und die GitHub-Prüflücke bleiben offen.
