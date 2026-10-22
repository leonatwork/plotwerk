# Issue #18 – Handover: Anführungszeichen-Stil

## Grundlage

- Basis `88315548c66a196b53d000c60ff63cf804baeead`, identisch mit der lokalen Referenz
  `origin/main`; Arbeitsbaum anfangs sauber. Umsetzung auf diesem Stand.
- Verbindliche Kriterien: strukturierte Issue-Beschreibung im Auftrag, AC-1 bis AC-8.
  Sie präzisiert die ursprüngliche Fassung um einfache Verlagszeichen und das Ausblenden bei Nicht-Deutsch.
  Keine widersprüchlichen fachlichen Kriterien in der bereitgestellten Fassung.
- `CLAUDE.md`, `CONTRIBUTING.md`, Architektur (insbesondere E6/E7 und Projektformat), Anforderungen,
  Abnahmestand und Designregeln geprüft. Kein `AGENTS.md` im Workspace.
  Die Design-Screens enthalten keine Abgabe-Dialog-Vorlage; die Auswahl nutzt vorhandene Feld-/Select-Klassen
  und deren Token-Farben.
- **Prüflücke:** Der Harness verweigerte `gh issue view` (inklusive Kommentare) und `gh pr list`.
  Vollständiger Live-Thread und offene PRs konnten nicht geprüft werden. Vor Review mit GitHub abgleichen.
  Aus dem vorhandenen Code ergibt sich keine Abhängigkeit auf einen offenen PR.
- Keine Commits, Pushes, Branch- oder PR-Erstellung; keine Deployments oder Änderungen an Produktionsdaten.

## Akzeptanzkriterien

| AC | Umsetzung und Nachweis |
| --- | --- |
| 1 | `verlag`: »Hallo« und ›…‹; zeichenweises Tippen in Core- und Editor-Tests |
| 2 | `schweiz`: «Hallo» und ‹…›; dieselben Tests |
| 3 | `de` und fehlender Wert erhalten bisherige Typografie; bestehende Tests bleiben grün |
| 4 | Stilwechsel wirkt nur auf weitere Eingaben; geladener Text, Editorinhalt und gespeicherte Demo-Kapitel bleiben unverändert |
| 5 | `angaben.anfuehrung` wird serialisiert und über MemoryFs neu geladen; ungültige Werte verworfen, andere unbekannte Felder erhalten |
| 6 | Doppelte und einfache gerade Zeichen bleiben in URLs, Unix-/Windows-Pfaden, E-Mail und Backtick-Code unverändert, parametrisiert für alle Stile |
| 7 | Editor-Undo stellt nach jeder Stilvariante das gerade getippte Zeichen wieder her; Mac-Tastaturprüfung noch offen |
| 8 | DE-/EN-Beschriftungen samt Zeichenpaaren; sichtbar bei Deutsch (auch de-CH/fehlender Sprache), ausgeblendet bei Nicht-Deutsch; Wert bleibt beim Sprachwechsel und Neuladen erhalten; Englisch ignoriert ihn |

Gespeicherte Werte: `de`, `verlag`, `schweiz`. Apostroph bleibt ’, öffnende Lage verwendet die
öffnenden Zeichen des gewählten Stils sowie dieselben Leerraum-/Klammer-/Strichregeln.
Die Stilwahl speichert direkt bei Auswahl, die Sprache beim Verlassen des Felds über den vorhandenen
Projekt-Speicherweg. Speicherfehler erscheinen im Dialog. Ein Export ist dafür nicht erforderlich.
Andere Buchangaben werden dabei mitgespeichert; der bestehende Export-Speicherweg bleibt nutzbar.

Vorhandenen Text umstellen, Export-Vorlagen und englische Stilwahl gehören nicht zum Umfang.
Die Rede-Erkennung in `core/ki/stimmeRede.ts` bleibt unverändert: Schweizer «…» und einfache
Guillemets werden dort noch nicht als Rede erkannt (Folge-Issue gemäß Auftrag).

## TDD und Qualitätsnachweis

- Vor Produktionsänderungen fünf gezielte Testdateien ausgeführt: **33 fehlgeschlagen, 143 bestanden**.
  Fachliche Fehler: falsche Zeichen, fehlende Auswahl, fehlende Persistenz und nicht verworfene alte Werte.
- Nach Implementierung dieselben Dateien: **176 Tests bestanden**.
- Der erste Gesamtlauf entdeckte die Wörterbuchprüfung, die auch das Zeichen „ in englischen Texten verbietet.
  Für die ausdrücklich gewünschte deutsche Zeichen-Vorschau ist genau dieser neue Textschlüssel ausgenommen;
  die übrige Sprachprüfung bleibt aktiv.
- `npm run typecheck`: grün.
- `npm test`: finaler Gesamtlauf grün, **1.323 Tests in 122 Dateien**.
- `npm run build`: grün (Chunkgrößenwarnung).
- `git diff --check`: grün.
- `npm run sperrliste`: Exit 0, aber keine inhaltliche Prüfung, da die Sperrlistendatei auf dem Server fehlt.

## Offene manuelle Abnahme

Leon: auf dem Mac im Demo-Projekt „Hafenlichter“ alle drei Stile auswählen, `"Hallo"` und `'ja'`
tippen und direkt danach mit ⌘Z das gerade Zeichen wiederherstellen. Stil wechseln und prüfen,
dass vorhandener Text unverändert bleibt. Projekt neu laden und Auswahl prüfen; auf Nicht-Deutsch
wechseln (Auswahl verborgen), zurück zu Deutsch (Wert erhalten). DE-/EN-Oberfläche prüfen und
Screenshot/Video für den späteren PR ergänzen. Linux erlaubt hier keine reale Mac-/Tauri-Abnahme.
