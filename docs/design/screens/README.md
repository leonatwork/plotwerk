# Plotwerk – Design-Referenz (Mac-App)

Diese Dateien sind der Quelltext der Mac-Screens aus dem Mockup der Story-App. Die Beispielinhalte stammen aus dem
frei erfundenen Demo-Roman „Hafenlichter“ (`fixtures/demo-projekt`).
Sie sind die verbindliche Design-Vorlage für die Umsetzung (siehe Anforderung, Abschnitt „Design“).

| Datei | Screen |
| --- | --- |
| `Schreiben.dc.html` | Editor mit Kapitelliste, Anmerkungen am Rand, Plan-Panel, „Ich weiche hier ab“ |
| `Kapitel.dc.html` | Kapitel-Überblick: Zusammenfassung, Wendung, lose Enden, Realitätsebene |
| `Akte.dc.html` | Akt-Board mit Quintessenz pro Akt, Ideen-Ablage, Kapitel-Inspektor |
| `Figur.dc.html` | Figurenkarte: „Aus dem Text“ vs. „Deine Planung“, Existenz, Notizen |
| `Beziehungen.dc.html` | Beziehungsnetz mit Zeitregler und Antagonisten-Gruppen |

## So lesen

- Jede Datei ist ein HTML-Dokument im Mockup-Format. Das Layout steckt im Markup zwischen `<x-dc>` und `</x-dc>`, alle Styles inline.
- `<sc-for>` und `<sc-if>` sind Schleifen und Bedingungen des Mockup-Werkzeugs; die Daten dazu stehen unten im `<script>`-Block (`renderVals()`).
- Die Dateien sind Referenz, kein Code zum Übernehmen. In der App werden daraus React-Komponenten mit den Design-Tokens aus der Anforderung.

## Für Claude Code

- Ordner ins Repository unter `docs/design/screens/` legen.
- Zusätzlich die Screens als PNG aus dem Canvas exportieren und unter `docs/design/png/` ablegen; Claude Code kann Bilder lesen und vergleichen.
- In `CLAUDE.md` des Projekts festhalten: „UI folgt `docs/design/`. Farben, Abstände und Schriften exakt aus den Screens übernehmen.“

## Im Browser ansehen

`support.js` ist ein kleiner Betrachter für das Mockup-Format (`<x-dc>`, `{{…}}`, `<sc-for>`, `<sc-if>`). Mit `npm run dev`
öffnet `http://localhost:5173/docs/design/screens/Kapitel.dc.html` die Vorlage wie im Mockup-Werkzeug. PNG-Exporte
(1440 × 900): `docs/design/png/`.
