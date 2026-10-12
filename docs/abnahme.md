# Plotwerk – Abnahme gegen Anforderungen v1.0

Stand 9. Oktober 2026. Grundlage: `docs/anforderungen-v1.0.md`, Entscheidungen E1–E14 aus `docs/architektur.md`
(fortgeschrieben in `docs/anforderungen-v1.1.md`).

**Vorgehen**

- Jede Anforderung im Code nachvollzogen und, wo die Oberfläche beteiligt ist, im Browser-Demo (1440 × 900) bedient.
- Je Akzeptanzkriterium ein automatischer Test in `abnahme/akzeptanz.test.tsx` (AK-1 … AK-10), dazu Rust-Tests für
  atomares Schreiben und die KI-Kommandos.
- Der Produktions-Build lief zusätzlich mit genau der Sicherheitsrichtlinie (CSP) aus `src-tauri/tauri.conf.json`:
  Export .docx und PDF sowie die Import-Vorschau funktionieren ohne `unsafe-eval`, ohne CSP-Verstoß.
- Die echte Manuskriptdatei wurde einmalig lokal importiert (Ergebnis unten, nichts davon im Repository).

**Zusammenfassung:** 90 Punkte geprüft – 88 erfüllt, 1 teilweise (AK-10), 1 offen (S-14). Nachgetragen 2026-10-12: G-4 (Bogen auf der Figurenkarte), G-5 (Leser-Simulation abbrechen), G-6 (Fokus beim Seitenwechsel). F-05 nachträglich erfüllt (Plan-Felder freigegeben am 2026-10-09).

**Nachtrag 10. Oktober 2026 (Werkzeuge G1–G8):** 31 weitere Punkte (Abschnitt „Werkzeuge“) – 29 erfüllt, 2 teilweise (EW-03 in der Mac-App nicht per Klick gehört, MAC-01 nur ad-hoc signiert). Gesamt: `npm test` 861 Tests in 74 Dateien grün, `cargo test --workspace` grün, `npx tauri build --debug --bundles app` gebaut und 10 s ohne Fehler gestartet.

Legende Nachweis: Testdatei (automatisch) · „Browser“ = im Browser-Demo bedient · „Code“ = im Quelltext geprüft.

## Akzeptanzkriterien

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| AK-1 | Import ergibt 10 Kapitel mit identischem Text; leere Schlussüberschrift wird gemeldet | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-1), `core/docx/docx.test.ts`; echte Datei | Text wird mit einem unabhängigen Leser (mammoth) verglichen, auch nach der Übernahme in den Projektordner. Der Hinweis „Leere Überschrift am Ende“ trägt jetzt ein Zitat (letzte Wörter davor). |
| AK-2 | Export .docx unterscheidet sich nur in der Formatierung | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-2), `core/docx/docx.test.ts` (Roundtrip) | Ganzes Demo-Buch: Klartext der .docx (mammoth) = Titel + Kapiteltitel + Kapiteltext; „“ – … bleiben Zeichen für Zeichen; keine Anmerkungen; je Kapitel eine Überschrift 1. Echte Datei ebenso. |
| AK-3 | Nach Absturz/Stromausfall höchstens 2 s Verlust | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-3), `src/features/schreiben/autosave.test.ts`, `src-tauri/src/dateien.rs` (`absturz_*`) | Simulation: 20 s Tippen mit zufälligen Pausen, Schreibdauer 150 ms je Datei, über 300 „Absturzzeitpunkte“ – nie fehlt eine Eingabe, die älter als 2 s ist. Dafür jetzt: Speichern spätestens 1,8 s nach der ersten ungespeicherten Eingabe, Sitzungs-Schnappschuss schon bei der ersten Eingabe (nicht mehr im Speicherpfad). Rust: temp + `sync_all` (auf macOS `F_FULLFSYNC`) + rename; Leser sieht nie eine halbe Datei. Echter Stromausfall nicht physisch getestet. |
| AK-4 | Projektordner ohne App lesbar | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-4) | Nach einer Sitzung mit allen Dateiarten: nur `.md`/`.json` (ausgenommen Recherche-Mediendateien unter `recherche/dateien/`, G8), gültiges YAML-Frontmatter (strikt), gültiges JSON, keine Steuerzeichen; Manuskript = Frontmatter `id`/`titel` + reines Markdown; kein SQLite im Ordner. |
| AK-5 | Index löschen → Neustart baut alles ohne Verlust auf | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-5), `core/index/index.test.ts`, `src/backend/tauri/indexSpeicher.test.ts` | Mit Entscheidungen („Ist Absicht“, Schreibweise, Faden erledigt, eigene Zusammenfassung) und KI-Ergebnissen: Daten und Index nach Neustart identisch. |
| AK-6 | Automatischer Test: KI kann keine Manuskriptdatei schreiben | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-6), `core/ki/importe.test.ts`, `core/ki/ki.test.ts`, `src-tauri/crates/plotwerk-ki/tests/kein_dateizugriff.rs`, `src-tauri/src/ki.rs` (Test) | Voller Prüf-, Tiefencheck- und Vorschlagslauf über die App schreibt nur unter `.plotwerk/`. Neu: Test, dass die Tauri-Kommandos der KI keinen Dateizugriff haben. |
| AK-7 | Jeder Hinweis hat mindestens ein wörtliches Zitat | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-7), `core/index/index.test.ts`, `core/ki/ki.test.ts` | Dokumentierte Ausnahme: Struktur-Hinweis „Kap. n ohne Text“ (es gibt nichts zu zitieren). Import-Vorschau: datei-bezogene Meldungen (Kommentare, Fußnoten) ebenfalls ohne Zitat. |
| AK-8 | Bewusst vage Stelle erzeugt keinen Widerspruchs-Hinweis | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-8), `core/index/index.test.ts`, `core/ki/ki.test.ts`, `src/features/schreiben/Editor.test.tsx` | Neu: Stellen lassen sich im Editor markieren (Blase → „Gewissheit“, früher „Ebene“). Vorher gab es dafür keine Bedienung. Der vorhandene „prüfen“-Hinweis verschwindet sofort, eine erneute Prüfung meldet ihn nicht wieder. |
| AK-9 | Zeitregler Akt I ohne Vera und die Fremde | erfüllt | `abnahme/akzeptanz.test.tsx` (AK-9), `src/features/beziehungen/beziehungen.test.tsx` | Auch per Klick auf „Akt I“ in der Oberfläche. |
| AK-10 | Prüfung findet Lindenhof-Schreibweisen, »Fiete«, Satzende Kap. 9, zweite Postkarte | teilweise | `abnahme/akzeptanz.test.tsx` (AK-10) | Lauf ohne gespeicherte Ergebnisse findet alle vier. Schreibweisen und Satzende entstehen lokal und sind sicher; »Fiete« und die zweite Postkarte kommen von der KI und sind nur mit der Demo-KI belegt. Live-Test gegen Foundry steht aus. |

## Schreiben

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| S-01 | Kapitelliste mit Status und Wortzahl, Klick öffnet, Drag & Drop | erfüllt | `src/state/slices/schreiben.test.ts`; Browser | Ziehen mit der Maus geprüft (und zurück). Tastatur: Leertaste, Pfeile, Leertaste. |
| S-02 | Editor mit Fett, Kursiv, Überschrift, Absatz; Fokus-Modus | erfüllt | `src/features/schreiben/Editor.test.tsx` (Blase); Browser | Neu: Knopf „Ü“ in der Blase (Überschrift ↔ Absatz). Kürzel ⌘B, ⌘I, ⌘⌥2, ⌘⌥0, `## ` am Zeilenanfang. ⌘⇧F blendet beide Seitenleisten aus. |
| S-03 | Deutsche Typografie, Rechtschreibprüfung macOS | erfüllt | `core/typografie/typografie.test.ts`, `src/features/schreiben/typografie.test.ts`; Browser | Zeichen einzeln getippt: „Ja“ – x… ‚o‘. Rechtschreibung über `spellcheck` + `lang="de"` (Systemprüfung des WebViews), im Mac-Fenster nicht per Klick geprüft. |
| S-04 | Autosave ≤ 2 s, Schnappschüsse, Versionsverlauf mit Vergleich/Wiederherstellen | erfüllt | `autosave.test.ts`, `Editor.test.tsx`, `core/versionen/versionen.test.ts`, `schreiben.test.ts`, AK-3 | Versionsverlauf zeigt jetzt „Versionen werden geladen …“ statt einer leeren Fläche. |
| S-05 | Wortzahl Kapitel und Buch in der Statusleiste | erfüllt | `core/text/text.test.ts`; Browser | |
| S-06 | Anmerkungen: an Figur/Ort/Kapitel/Plan-Karte heften, Rand, Figurenkarte, Sprung, wandern mit | erfüllt | `Editor.test.tsx`, `schreiben.test.ts`, `src/features/akte/ansichten.test.tsx` | Neu: Notizen an einem Ort erscheinen auf der Ortskarte, Notizen an Kapitel/Plan-Karte im Inspektor des Akt-Boards (bisher nur Figurenkarte). |
| S-07 | `[[`-Verweise in Notizen und Plan-Feldern | erfüllt | `src/features/schreiben/verweise.test.ts`; Browser | Klick öffnet das Ziel in seinem Bereich. |
| S-08 | Plan-Panel zur geplanten Szene | erfüllt | Browser | |
| S-09 | „Ich weiche hier ab“ mit Entscheidung; Abweichung am Kapitel und im Akt-Board; alter Plan bleibt | erfüllt | `schreiben.test.ts`, `src/features/akte/planung.test.ts`, `ansichten.test.tsx` | |
| S-10 | Tab „Erkannt“: Figuren, Orte, Motive live; Figuren unterstrichen, Klick öffnet Karte | erfüllt | `core/erkennung/erkennung.test.ts` (Motive), `core/projekt/projekt.test.ts`; Browser | Neu: Motive (`plan/motive.md`), im Tab „Erkannt“ gezählt, anlegbar, Klick zeigt die erste Stelle. Im Text öffnet ⌘-Klick die Figurenkarte (einfacher Klick setzt den Cursor); im Tab öffnet ein Klick. |
| S-11 | Import .docx mit Vorschau | erfüllt | `core/docx/docx.test.ts`, `src/features/importexport/importexport.test.tsx`, AK-1; Browser (Prod-Build + CSP) | |
| S-12 | Export .docx/PDF, Buch oder Auswahl, ohne Anmerkungen, Kapitel als Überschrift 1 | erfüllt | AK-2, `core/pdf/pdf.test.ts`, `importexport.test.tsx`; Browser (Prod-Build + CSP) | .docx 14 KB, PDF 27 KB im Produktions-Build erzeugt (Download abgefangen). |
| S-13 | Tab „Hinweise“ im Editor, Klick markiert die Stelle | erfüllt | `src/features/hinweise/hinweise.test.tsx` | |
| S-14 | Figur oder Ort im eigenen Fenster (Kann) | offen | – | Nicht umgesetzt; zwei Fenster mit getrenntem Zustand bräuchten eine Abstimmung beim Speichern. |

## Planung

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| P-01 | Akt-Board mit Spalten und Ideen-Ablage, Karten verschieben | erfüllt | `planung.test.ts`; Browser | |
| P-02 | Kopfkarte je Akt (Quintessenz, Wendepunkt, Antagonisten) | erfüllt | `planung.test.ts`; Browser | |
| P-03 | Kartenstatus inkl. „weicht ab“ (Akzentkante + Anzahl) | erfüllt | `ansichten.test.tsx`; Browser | |
| P-04 | Kapitel vorab planen, Kontext, „Mit dem Schreiben beginnen“ | erfüllt | `planung.test.ts`, `ansichten.test.tsx` | |
| P-05 | Umschalter „Nur Plan“ / „Plan + Text“ | erfüllt | Browser | |
| P-06 | Ideen-Ablage, in einen Akt ziehbar | erfüllt | `planung.test.ts` | |
| K-01 | Kapitelwahl, Zusammenfassung, Wendung, Antagonisten, „Bis hierhin passiert“ | erfüllt | `ansichten.test.tsx`; Browser | |
| K-02 | Lose Enden, ruhend ab 3 Kapiteln, erledigt/bewusst offen | erfüllt | `planung.test.ts` | |
| K-03 | KI-Zusammenfassungen, bearbeitete nie überschrieben, nur „veraltet“ | erfüllt | `planung.test.ts`, AK-5 | |
| K-04 | Realitätsebene pro Kapitel | erfüllt | `planung.test.ts`, `Editor.test.tsx`, AK-8 | Neu: Textstellen im Editor markierbar; sie erscheinen im Kapitel-Überblick und sind im Text gestrichelt unterstrichen. |
| F-01 | Figurenliste in Bereichen | erfüllt | `planung.test.ts`, `ansichten.test.tsx` | |
| F-02 | „Aus dem Text“ (mit Beleg) und „Deine Planung“ (eigene Felder) | erfüllt | `ansichten.test.tsx`, `planung.test.ts` | |
| F-03 | Existenz und „Wahrheit hinter den Kulissen“ | erfüllt | `ansichten.test.tsx`, `core/ki/ki.test.ts` (Allowlist) | |
| F-04 | Notizen, Auftritte als Kapitelstreifen, Beziehungen | erfüllt | Browser | |
| F-05 | Hinweis, wenn ein Plan-Feld dem Text widerspricht (Soll) | erfüllt | `core/ki/ki.test.ts` (F-05), `Figurenkarte.tsx` (`hinweiseFuerFigur`) | Plan-Felder von Figuren und Kapitelplänen gehen an das Modell (Leon, 2026-10-09). Hinweise mit Plan-Bezug (Figur/Kapitel, Feld) werden geprüft; bei bewusst vagen Figuren verworfen. Demo: Paul „Alkohol: nein, trinkt keinen“ ↔ Aperol Spritz in Kap. 9. Live nur mit Demo-KI belegt. |
| F-06 | Figur vorab anlegen | erfüllt | `planung.test.ts` | |
| O-01 | Ortsliste mit Kapiteln, Text-Belegen, Notizen, Unterorten | erfüllt | `ansichten.test.tsx`; Browser | |
| O-02 | Schreibweisen zusammenführen, gültige festlegen | erfüllt | `planung.test.ts`, `hinweise.test.tsx` | |
| O-03 | Weg einer Figur (Soll) | erfüllt | `core/index/index.test.ts`, `ansichten.test.tsx` | |
| B-01 | Netz: Karten, beschriftete Linien, Gruppen als Flächen | erfüllt | `beziehungen.test.tsx` | Unter 1440 px Breite scrollt das Netz statt zu skalieren. |
| B-02 | Zeitregler nach Akt/Kapitel | erfüllt | `beziehungen.test.tsx`, AK-9 | |
| B-03 | Gestrichelt bei unsicher; Filter Arbeit/Dates/Sonstige | erfüllt | `beziehungen.test.tsx` | |
| B-04 | Beziehung per Drag, Inspektor mit Belegen (Soll) | erfüllt | `beziehungen.test.tsx` | |
| A-01 | Zwei Antagonisten-Gruppen (Demo: Nordhaven und Konsortium) | erfüllt | `src/features/gruppen/gruppen.test.tsx` | |
| A-02 | Mitglieder, Präsenz, Spuren als Vorschlag | erfüllt | `gruppen.test.tsx` | |
| A-03 | Antagonisten als Stränge in Board und Überblick | erfüllt | Browser | |

## Erkennung, KI-Prüfung, Hinweis-Typen

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| KI-1 | Exakte Erkennung beim Speichern mit Wortgrenzen | erfüllt | `core/erkennung/erkennung.test.ts` | „Ole“ ≠ „Oleander“, Genitive. |
| KI-2 | Vorschläge indirekter Erwähnungen (Haiku), bestätigen/verwerfen | erfüllt | `core/ki/ki.test.ts`, `src/features/ki/ki.test.tsx` | Live gegen Foundry nicht getestet. |
| KI-3 | Prüfung per Knopf (Sonnet): Fakten vergleichen, Hinweise | erfüllt | `core/ki/ki.test.ts`, `src-tauri/crates/plotwerk-ki/tests/http.rs` | Request-Format und HTTP mit Testserver geprüft; Live-Aufruf steht aus. |
| KI-4 | Zusammenfassung, Wendung, lose Enden im selben Lauf | erfüllt | `core/ki/ki.test.ts` | |
| KI-5 | Entscheidung pro Hinweis gespeichert, nie erneut gemeldet | erfüllt | `hinweise.test.tsx`, `core/ki/ki.test.ts` | |
| HT-1 | Typ „Prüfen“ | erfüllt | `core/ki/ki.test.ts`, AK-8 | Etikett „offen“ bei noch offener Realität. |
| HT-2 | Typ „Schreibweise“ | erfüllt | `erkennung.test.ts`, AK-10 | Lindenhof-Varianten, Karl/Carl Hansen. |
| HT-3 | Typ „Offener Faden“ | erfüllt | `core/ki/ki.test.ts`, AK-10 | |
| HT-4 | Typ „Unbekannt“ | erfüllt | `core/ki/ki.test.ts`, AK-10 | |
| HT-5 | Typ „Struktur“ | erfüllt | `core/struktur/struktur.test.ts`, AK-1, AK-10 | Lokal, ohne KI (E10). |
| HT-6 | Typ „Zeitleiste“ | erfüllt | `core/ki/ki.test.ts` | |
| HT-7 | Typ „Sprache“ (Kann) | erfüllt | `core/ki/ki.test.ts` | Nur markieren, nie korrigieren. |
| RE-1 | Realität „gesichert“: normal geprüft | erfüllt | `core/index/index.test.ts` | |
| RE-2 | Realität „noch offen“: Etikett „offen“, Erinnerung im Überblick | erfüllt | `index.test.ts`, `ki.test.ts`; Browser | |
| RE-3 | Realität „bewusst vage“: nie Widerspruch, neutrale Zusammenfassung | erfüllt | AK-8, `core/ki/ki.test.ts` | Neutral formulieren steht im Systemprompt. |
| HR-1 | KI nur mit lesender Schnittstelle | erfüllt | AK-6 | |
| HR-2 | Festes JSON-Schema, kein Ersatztext | erfüllt | `core/ki/ki.test.ts` (Ersatztext-Filter, Structured Outputs) | |
| HR-3 | Jedes Zitat gegen den Text geprüft | erfüllt | `core/ki/ki.test.ts` (Zitatprüfung), `core/index/index.test.ts` | |
| HR-4 | Wahrheit und private Notizen nie an das Modell | erfüllt | `core/ki/ki.test.ts` (Allowlist E12) | |
| HR-5 | Bewusst Vages wird als absichtlich mehrdeutig mitgegeben | erfüllt | `core/ki/ki.test.ts` | |
| HR-6 | Cache pro Kapitel-Hash, Token-Schätzung vor dem Buch-Lauf | erfüllt | `core/ki/ki.test.ts`, `src/features/ki/ki.test.tsx` | |

## Plattform, Fenster, Tastenkürzel

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| PT-1 | Mac-App mit Tauri 2, React/TS, TipTap | erfüllt | Code; `npx tauri build --debug --bundles app` | Ad-hoc signiert (`signingIdentity: "-"`); Developer ID und Notarisierung siehe MAC-01. |
| PT-2 | Daten als Markdown + YAML im Projektordner | erfüllt | AK-4, `core/projekt/projekt.test.ts` | |
| PT-3 | SQLite-Index lokal, nicht im Projektordner | erfüllt | `indexSpeicher.test.ts`, AK-4 | `~/Library/Application Support/app.plotwerk.mac/plotwerk-index.db`. |
| PT-4 | Foundry, Modell pro Aufgabe einstellbar | erfüllt | `src/features/ki/ki.test.tsx`, `src/backend/tauri/backend.test.ts` | |
| PT-5 | Schlüssel nur im macOS-Schlüsselbund | erfüllt | `backend.test.ts`, `src-tauri/src/schluessel.rs` | Schlüsselbund-Rundlauf-Test ist `#[ignore]` (braucht Freigabe am Mac). |
| PT-6 | Ohne Netz alles außer der KI | erfüllt | Code | Einzige Netzverbindung: `ki_anfrage`/`ki_tokens`. |
| FE-1 | 1440 × 900, Mindestgröße 1100 × 700 | erfüllt | `src-tauri/tauri.conf.json`; Browser | |
| FE-2 | Titelleiste 52 px mit Ampel, Projekt, Kontext, Aktionen | erfüllt | `src/app/app.css`; Browser | |
| FE-3 | Seitenleiste 230 px, Bereiche mit Zähler, Kapitelliste | erfüllt | `app.css`, `src/app/app.test.tsx` | |
| FE-4 | Inspektor 300–350 px | erfüllt | Code (300/330/350) | |
| FE-5 | Farben nur über Tokens, Schriften, Radien | erfüllt | `src/theme/tokens.css` | 1-px-Fensterrand des Mockups zeichnet in der App macOS. |
| FE-6 | Dunkelmodus (Soll) | erfüllt | `tokens.css`; Browser | |
| TK-1 | ⌘1–⌘7 Bereiche | erfüllt | `src/app/app.test.tsx`; Browser | |
| TK-2 | ⌘K Schnellsuche | erfüllt | `app.test.tsx` | |
| TK-3 | ⌘⇧F Fokus-Modus | erfüllt | `app.test.tsx`; Browser | |
| TK-4 | ⌘E Export | erfüllt | `app.test.tsx`; Browser | |
| TK-5 | ⌘8 Zeitleiste, ⌘9 Fäden, ⌘0 Recherche | erfüllt | `src/app/befehle.ts`, `src-tauri/src/menue.rs`; Browser | Statistik und Fragen ohne eigene Taste. Solange ein Dialog offen ist, wechseln Bereichstasten nicht den Bereich. |
| TK-6 | ⌘⇧T Typewriter, ⌘⇧S Fassung sichern, ⌘⇧B Buch-Vorschau | erfüllt | `werkzeuge.test.tsx`; Browser | Keine Überschneidung mit Editor-Kürzeln (Durchstreichen ist abgeschaltet). |

## Werkzeuge G1–G8 (Stand 10. Oktober 2026)

Browser-Durchlauf mit dem Demo-Projekt bei 1440 × 900 und 1100 × 700, hell und dunkel: jede Funktion einmal bedient, keine Konsolenfehler.

| ID | Anforderung kurz | Status | Nachweis | Bemerkung |
| --- | --- | --- | --- | --- |
| Z-01 | Zeitleiste mit Tagesachse, Lücken, „Abstand unbekannt“ | erfüllt | `core/zeit/zeit.test.ts`, `src/features/zeitleiste/zeitleiste.test.tsx`; Browser | Kapitel- oder Szenenansicht; Szenen-Zeitpunkte aus dem Szenenplan. |
| Z-02 | Zustands- und Ortsspur | erfüllt | `zeitleiste.test.tsx`; Browser | Zustandsarten frei benannt, Farbe als Token. |
| Z-03 | Lokale Zeitprüfung | erfüllt | `core/zeit/zeit.test.ts`, `core/index/index.test.ts`, `hinweise.test.tsx` | Demo: Kap. 10 Donnerstag ≠ Tag 9 (Dienstag). „In der Zeitleiste zeigen“ aus der Hinweise-Ansicht. |
| Z-04 | KI-Vorschläge für Zeitpunkte und Zustände | erfüllt | `core/ki/zeit.test.ts` | Nur Demo-KI; Zustandsnamen an die KI von Leon am 2026-10-11 freigegeben. |
| PS-01 | Fäden-Board | erfüllt | `src/features/faeden/faeden.test.tsx`, `core/struktur/faeden.test.ts`; Browser | Befehl „Neuer Faden …“ in Menü und Schnellsuche. |
| PS-02 | Strang-Raster | erfüllt | `faeden.test.tsx`; Browser | |
| PS-03 | Szenen | erfüllt | `core/struktur/szenen.test.ts`, `faeden.test.tsx`; Browser | Szenenkarte auch für Kapitel ohne Plan; Link springt zur Szene in der Zeitleiste. |
| PS-04 | Haupt-/Nebenhandlung, Zweck, Kurzbeschreibung, Funktion | erfüllt | `core/ki/straenge.test.ts`, `src/features/faeden/straenge.test.tsx`; Browser | „Geplante Szene“ heißt jetzt „Kurzbeschreibung“ (Feld `szene` unverändert). |
| PS-05 | KI-Vorschläge zu Strängen | erfüllt | `core/ki/straenge.test.ts`, `src/features/faeden/straenge.test.tsx`; Browser | Nur Demo-KI; Strang-Angaben an die KI von Leon am 2026-10-12 freigegeben (E12). |
| PS-06 | Lose Enden: Tabelle, als Strang übernehmen | erfüllt | `src/features/faeden/straenge.test.tsx`; Browser | Interne Namen (`faeden`, `plan/faeden.md`, Befehl `faden-neu`) bleiben. |
| FB-01 | Figuren-Bögen | erfüllt | `core/figuren/boegen.test.ts`, `src/features/figuren/Boegen.test.tsx`; Browser | |
| FB-02 | Figurenstimme | erfüllt | `core/figuren/stimme.test.ts`, `core/ki/stimme.test.ts`, `Stimme.test.tsx`, `core/index/index.test.ts` | Erscheint als Hinweis „Sprache“ und auf der Figurenkarte. |
| EW-01 | Typewriter | erfüllt | `src/features/schreiben/werkzeuge/werkzeuge.test.tsx`; Browser | |
| EW-02 | Wiederholungen | erfüllt | `core/stil/stil.test.ts`, `werkzeuge.test.tsx`; Browser | |
| EW-03 | Vorlesen | teilweise | `vorlesen.test.ts`, `werkzeuge.test.tsx`, `src/backend/tauri/vorlesen.test.ts`, `src-tauri/src/vorlesen.rs` (Tests) | Browser: Web Speech API. Mac-App: macOS `say` über Rust-Kommandos; im Fenster nicht per Klick angehört. |
| EW-04 | Markennamen | erfüllt | `core/stil/marken.test.ts`, `werkzeuge.test.tsx`; Browser | |
| VS-01 | Tagesstatistik, Ziel in der Statusleiste | erfüllt | `core/statistik/statistik.test.ts`, `src/features/statistik/statistik.test.tsx`; Browser | Zeitzonen und Zeitumstellung getestet. |
| VS-02 | Benannte Fassungen | erfüllt | `statistik.test.tsx`, `core/versionen/versionen.test.ts` | ⌘⇧S. |
| VS-03 | Fassungen vergleichen | erfüllt | `statistik.test.tsx`; Browser | |
| KL-01 | Leser-Simulation | erfüllt | `core/ki/leser.test.ts`, `src/features/fragen/fragen.test.tsx`, `core/projekt/werkzeuge.test.ts`; Browser | Vermutungen, Spannung und Plan-Abgleich jetzt als eigene Felder in `.plotwerk/leser.json`; ältere Stände werden weiter gelesen. |
| KL-02 | Fragen an das Buch | erfüllt | `core/ki/fragen.test.ts`, `fragen.test.tsx`; Browser | „nicht im Buch“ (imBuch = false) getrennt von „ohne Beleg“. |
| AB-01 | Normseite | erfüllt | `core/abgabe/abgabe.test.ts`, `src/features/abgabe/abgabe.test.tsx` | Zeilenzählung kann wenige Zeilen von Word abweichen (Umbruch nach Gedankenstrich). |
| AB-02 | Exposé-Vorlage | erfüllt | `abgabe.test.ts` | |
| AB-03 | EPUB 3 | erfüllt | `core/epub/epub.test.ts` | Satz gemeinsam mit der Vorschau (`core/satz`). Nicht mit epubcheck geprüft. |
| AB-04 | Lektoratsmappe | erfüllt | `abgabe.test.ts` | |
| AB-05 | Rückimport aus Word | erfüllt | `core/docx/rueckimport.test.ts`, `abgabe.test.tsx`; Browser | Offene Änderungen im Editor gepunktet unterstrichen. |
| RC-01 | Recherche ablegen | erfüllt | `core/recherche/recherche.test.ts`, `src/features/recherche/recherche.test.tsx`, `src-tauri/src/recherche.rs`; Browser | AK-4 erlaubt Mediendateien unter `recherche/dateien/`. |
| RC-02 | Heften und Recherche-Leiste | erfüllt | `recherche.test.tsx`; Browser | Figurenkarte, Ortskarte, Kapitel-Überblick, Schreiben-Inspektor, Szenen-Formular. |
| RC-03 | Filter, Raster/Liste | erfüllt | `recherche.test.tsx`; Browser | |
| MAC-01 | Signatur und Notarisierung | teilweise | `src-tauri/tauri.conf.json`, `scripts/notarisieren.sh` (`bash -n`) | Debug-Build ad-hoc signiert; Notarisierung braucht Leons Zugangsdaten. |
| MAC-02 | Updater-Vorlage | erfüllt | `src-tauri/tauri.updater.conf.json` | Nicht aktiv. |
| G-1 | Gemeinsame Hinweis-Typnamen | erfüllt | `core/index/hinweisTypen.ts` | Hinweise-Ansicht und Lektoratsmappe nutzen dieselbe Liste. |
| G-2 | Zitate behalten mitzitierte Anführungszeichen am Rand | erfüllt | `core/ki/aufgabe.test.ts`, `core/ki/ki.test.ts` | Schlüssel unverändert (zitatKern). |
| G-3 | Escape schließt den obersten Dialog auch ohne Fokus darin | erfüllt | Browser | Fiel bei der Leser-Simulation auf (Fokus ging beim Seitenwechsel verloren). |
| G-4 | Figurenkarte zeigt den Bogen: Stufen in Buchreihenfolge mit Kap./Akt, aktuelle Stufe hervorgehoben, Klick öffnet den Tab „Bögen“ mit der Stufe | erfüllt | `src/features/figuren/Figurenkarte.test.tsx`; Browser | Abschnitt „Bogen“ (linke Spalte unter „Auftritte“). „Aktuell“ = die Stufe, die im gewählten Kapitel gilt (`stufeImKapitel`), ohne Kapitelwahl die letzte geplante. Leer: Link „Bogen anlegen“. |
| G-5 | Leser-Simulation abbrechen | erfüllt | `core/ki/aufgabe.test.ts`, `fragen.test.tsx`; Browser | Knopf „Abbrechen“ im laufenden Dialog; `AbortSignal` über `fuehreAufgabeAus` an `KiTransport.senden(body, {signal})` (additiv). Demo-Transport bricht ab; der Tauri-Transport ignoriert das Signal, die Antwort wird dann verworfen. Nach Abbruch: `simLauf` null, kein Fehler, nichts gespeichert. |
| G-6 | Leser-Simulation: Fokus beim Seitenwechsel (Start → läuft → Ergebnis) | erfüllt | `fragen.test.tsx`; Browser | `Dialog` bekommt `seite`; bei Wechsel liegt der Fokus auf dem Dialog (bzw. `[data-autofocus]`), Tab beginnt im Dialog, Escape schließt weiter. Verhindert auch, dass ein wiederverwendeter Knopf („Simulation starten“ → „Abbrechen“) den Fokus behält. |

## Echte Datei

Leons Romanmanuskript als .docx (einmalig lokal importiert, nichts davon im Repository):

- 10 Kapitel, davon eines leer (wird als geplant übernommen); Buchtitel aus der Titelzeile übernommen.
- Text identisch: **ja** (unabhängiger Leser, 135 Absätze). Export nach .docx und zurück: **ja**, nur die Formatierung unterscheidet sich.
- Hinweise beim Import: leere Überschrift am Ende (mit Zitat), Kap. 4 ohne Text, Kap. 9 endet mitten im Satz,
  3 Wörter vor der ersten Überschrift, 11 Word-Kommentare nicht übernommen.

## Offen

- S-14 (Kann): Figur/Ort im eigenen Fenster.
- AK-10 und alle KI-Funktionen: Live-Test mit Leons Foundry-Deployments.
- Mac-App per Klick: Speichern-Dialog, Beenden über Dock/Abmelden (dabei fehlt nur der Schnappschuss beim Beenden;
  der Text liegt dank Autosave schon auf der Platte und wird beim nächsten Bearbeiten zuerst gesichert), Rechtschreibung im Fenster.
- App nur ad-hoc signiert; Netz skaliert unter 1440 px nicht.
- Werkzeuge: Vorlesen in der Mac-App anhören, KI-Werkzeuge live, EPUB mit epubcheck.
