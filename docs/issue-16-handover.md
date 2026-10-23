# Issue #16 – Darstellung und Lesbarkeit

## Grundlage und Liefergrenzen

- Implementiert auf dem sauberen ausgecheckten Stand `88315548c66a196b53d000c60ff63cf804baeead`, identisch mit dem lokalen `origin/main`.
- Verbindliche Grundlage ist der mitgelieferte strukturierte Issue-Text einschließlich AC-1 bis AC-8. `CLAUDE.md`, `CONTRIBUTING.md`, Architektur E16, Anforderungen und Design-Screen wurden geprüft; im Workspace gibt es keine `AGENTS.md`.
- **Nicht verifizierbar:** Vollständiger GitHub-Kommentarverlauf und offene PRs: Die Umgebung sperrt `gh`. Deshalb kann eine zusätzliche Entscheidung oder offene PR-Abhängigkeit außerhalb des mitgelieferten Texts nicht ausgeschlossen werden. Keine fremden PR-Stände wurden verwendet.
- Der Issue fordert einen Draft-PR; die abschließende Arbeitsanweisung verbietet Commit, Push und Branch-Erstellung. Geliefert wird daher der uncommittete Diff mit diesem Handover. Draft-PR und DCO-signierter Commit sind dem anschließenden Lieferprozess vorbehalten.

## Umsetzung und Entscheidungen

- App-Einstellung `darstellung`: `{schriftgroesse, zeilenbreite, zeilenhoehe, skalierung}`. Tauri nutzt die bestehenden App-Kommandos `einstellung_lesen`/`einstellung_schreiben`; die Demo nutzt `plotwerk:darstellung`. Kein Schreibzugriff auf Projektdateien.
- Validierung liegt in reinem TypeScript unter `core/darstellung`. Jedes ungültige Feld fällt unabhängig auf seinen Standard zurück; beschädigtes Browser-JSON verhindert den Start nicht.
- Standardwerte: **17,5 px / 530 px / 1,65 / 100 %**. Bereiche: **14–26 px / 420–800 px / 1,4–2,0**.
- Darstellung im Einstellungsdialog wirkt sofort und ist auch ohne Projekt verfügbar. Numerische Felder lassen unvollständige Zwischenstände beim Tippen zu; ungültige Eingaben fallen beim Verlassen auf den Standard zurück.
- „Zurücksetzen“ setzt alle vier Werte zurück. „Darstellung → Originalgröße“ setzt ausschließlich die UI-Skalierung auf 100 %, ohne Tastenkürzel; ⌘0 bleibt Recherche.
- Eigene CSS-Skalierung (`zoom`) statt `zoomHotkeysEnabled`: diskrete, testbare und persistente Stufen **80–150 % in 10-%-Schritten**, keine zusätzliche native Zoom-Stufe. Skalierung am `body` erfasst auch Dialog-Portale. Die verfügbare Layoutfläche wird entsprechend angepasst; die bestehende Mindestgröße 1100 × 700 bleibt, der Root kann scrollen.
- ⌘+, ⌘− sowie ⌘= auf US-Tastaturen nutzen die zentrale Befehlsverarbeitung, auch bei offenem Dialog. Native Zoom-Menüeinträge haben keine Accelerators, damit native und DOM-Ereignisse keinen doppelten Zoom auslösen.
- Editor, h4–h6 und Szenentrenner nutzen CSS-Variablen. Fokus erbt die Maße. Typewriter misst die tatsächliche Cursorzeile und zentriert nach Darstellungsänderungen erneut. Scrollsprünge, Auswahlleiste und Randnotizen rechnen skalierte DOM-Koordinaten in lokale CSS-Pixel um.
- Keine neuen Farben, keine Projektformatänderung, keine neuen Abhängigkeiten.

## Akzeptanznachweis

| AC | Nachweis |
| --- | --- |
| AC-1 | `src/features/schreiben/darstellung.test.tsx`: Einstellungsfeld auf 20 px, CSS-Variable sofort aktualisiert, Editor-Dokument identisch; echte Tastatureingabe von 17,5 auf 20 getestet. |
| AC-2 | Derselbe UI-Test für 700 px und 1,8. |
| AC-3 | Browser- und gemockter Tauri-Roundtrip in `src/state/darstellung.test.ts`; Projektwechsel und kein Projekt-Schreibaufruf beim Ändern im Editor-Test. |
| AC-4 | `core/darstellung/darstellung.test.ts` prüft exakte Standards; Editor-Test prüft Standardvariable sowie CSS-Verwendung für Text und h4–h6. Visueller Vergleich auf Mac offen. |
| AC-5 | `src/app/app.test.tsx`: deutsche/US-Kürzel, Modifier-Kollisionen, Zoom bei offenem Einstellungsdialog, Neustart-Laden, Menübefehl Originalgröße und ⌘0-Recherche. Nativer Menüeintrag implementiert, Mac-Nachweis offen. |
| AC-6 | Editor-UI-Test setzt alle vier Werte zurück; Store-Test prüft Zoom-Grenzen und Reset. |
| AC-7 | Core-Test: Grenzen, außerhalb liegende Werte, falsche Typen, NaN/Infinity; Store-Test: beschädigtes localStorage und ungültige gemockte Tauri-App-Werte. Rust behandelt beschädigte `einstellungen.json` bereits als leere Einstellung. |
| AC-8 | Editor-Test mit gleichzeitigem Fokus-/Typewriter-Modus und geänderter Zeilenhöhe; Geometrietest für reale Cursorzeilenhöhe bei 120 % Zoom. |

## Testgetriebenes Vorgehen und QS

- Regressionstests vor der Umsetzung angelegt. Nach minimalen API-Stubs **10 fachlich fehlschlagende Tests** verifiziert (Validierung, Persistenz, CSS-Variablen, Kürzel). CSS-Test separat gegen die tatsächliche Datei rot geprüft.
- Zusätzliche rote Regressionen: Typing „20“ ergab 17,52; Typewriter-Zentrierung bei 120 % ergab 284 statt 220 CSS-Pixel. Beide vor ihrer Korrektur nachgewiesen.
- Review-Korrektur Beziehungsnetz: `Netz.tsx` rechnet Drag-Distanzen und den Endpunkt der Verbindungslinie über die bestehende UI-Skalierung in lokale CSS-Pixel um. `elementFromPoint()` und die Klick-/Drag-Schwelle behalten Bildschirmkoordinaten. `netz-skalierung.test.tsx` prüft Kartenverschiebung, Gruppenverschiebung einschließlich enthaltener Karten, Gruppengröße und Verbindungslinie samt Trefferprüfung bei 100 %, 120 % und 150 %, jeweils auch die gespeicherten Werte. Vor dem Fix: alle acht Fälle bei 120/150 % rot, vier Standardfälle grün; danach alle zwölf grün. Relevante Netz-/Darstellungstests: 5 Dateien, 38 Tests grün.
- Relevante Tests (Darstellung, Editor, Werkzeuge, App, i18n): grün.
- `npm test`: **126 Dateien, 1.282 Tests grün** (nach der Netz-Korrektur).
- `npm run typecheck`: grün.
- `npm run build`: grün; Vite meldet große bestehende Bundles, kein Buildfehler.
- `git diff --check`: grün.
- `npm run sperrliste`: erfolgreich ausgeführt, aber **keine Prüfung**, weil `/home/hermes/.config/plotwerk/sperrliste.txt` fehlt.
- Kein Rust-/Tauri-Build auf diesem Server. `rustfmt` ist nicht verfügbar; der Menü-Diff folgt dem vorhandenen Format, automatische Rust-Formatierung ist nicht nachgewiesen.

## Verbleibende Abnahme auf dem Mac

1. Schriftgröße 14 und 26 px, Zeilenbreite 420 und 800 px, Zeilenhöhe 1,4 und 2,0 ausprobieren; Fokus und Typewriter einschalten.
2. ⌘+/⌘− und native Menüeinträge prüfen, danach Neustart und Projektwechsel; ⌘0 öffnet Recherche.
3. Bei Fenstergröße 1100 × 700 bis 150 % vergrößern: alle Bereiche und Dialoge erreichbar, Scrollen möglich, Auswahlleiste/Randnotizen korrekt positioniert.
   Im Beziehungsnetz bei 120/150 % Karten und Gruppen ziehen, Gruppen vergrößern und Beziehungen verbinden: Vorschau und gespeicherte Position folgen dem Zeiger, auch bei gescrolltem Netz.
4. Mit Standardwerten gegen `docs/design/screens/Schreiben.dc.html` vergleichen; Screenshot für den späteren PR aufnehmen.
5. macOS-CI/Rust-QS einschließlich `cargo fmt --check` für den nativen Menü-Diff ausführen.
6. Vor Lieferung GitHub-Thread/offene PRs nachprüfen und echte Sperrliste ausführen; DCO-Sign-off beim späteren Commit.
