# Plotwerk – Architektur

Grundlage: `docs/anforderungen-v1.1.md` (v1.0 mit den Entscheidungen unten fortgeschrieben). Abnahme: `docs/abnahme.md`.
Mac-Verteilung (Signatur, Notarisierung, Update-Feed): `docs/mac-verteilung.md`. Überblick für Leser: `README.md`.
Design: `docs/design/screens/*.dc.html` (verbindlich, Pixelwerte und Farben exakt übernehmen).

## Entscheidungen (v1.1)

| # | Entscheidung | Grund |
| --- | --- | --- |
| E1 | **Stabile IDs** im Frontmatter (`id`), einmal aus dem Titel als Slug erzeugt, nie geändert. Dateiname = `<id>.md`, ohne Nummer. Reihenfolge nur in `projekt.md` (`kapitel: [...]`). Alle Verweise per ID. | Drag & Drop ohne Umbenennen, keine kaputten Links |
| E2 | **SQLite ist nur Cache.** Alles, was Leon entscheidet (`entscheidungen.json`), und alle bezahlten KI-Ergebnisse (`.plotwerk/analysen/<id>.json`, `.plotwerk/hinweise.json`) liegen im Projektordner. | Index löschen ohne Verlust |
| E3 | **Kapitel ist die Einheit.** Optionale Szenentrenner `* * *` (eigene Zeile) im Markdown. | lesbar in Obsidian, später ausbaubar |
| E4 | **Textanker** = Zitat + 32 Zeichen davor/danach auf normalisiertem Klartext (`TextAnker`). Positionen werden daraus abgeleitet; findet sich die Stelle nicht mehr eindeutig → „verwaist“, nie still falsch. Gilt für Anmerkungen, Hinweis-Zitate, Gewissheit von Stellen (Datenmodell `realitaet`), Spuren. | übersteht Bearbeitung außerhalb der App |
| E5 | **Namenserkennung** mit Wortgrenzen (Unicode-Buchstaben), plus automatisch Genitiv (`Pauls`, `Lottes`, `Paul'`), plus `formen` aus der Figur. „Ole“ trifft nicht „Oleander“, „Lotte“ nicht „Lotterie“. | deutsche Flexion |
| E6 | **Normalisierung** vor jedem Zitatvergleich: Anführungszeichen („“”"‚‘’'»«›‹ → einheitlich), Gedanken-/Bindestriche, Auslassungspunkte (… = ...), Leerraum zusammenfassen, Markdown-Auszeichnung (`*`, `_`) entfernen, Unicode NFC. | sonst verwirft die Prüfung gültige Hinweise |
| E7 | **Typografie nur beim Tippen** (Input-Rules im Editor). Import und Laden ändern keinen Text. | „identischer Text“ beim Import |
| E8 | **Schnappschüsse** nicht pro Speichern: beim Kapitelwechsel, spätestens alle 10 min bei Änderungen, beim Beenden, vor Wiederherstellen/Löschen, vor der ersten Änderung eines Kapitels pro Sitzung (nur wenn der Stand noch nicht gesichert ist) und bevor eine von außen geänderte Fassung überschrieben wird. Ablage `.versionen/<pfad>/<YYYY-MM-DDTHH-mm-ss>.md`, in derselben Sekunde `…-2.md`. Aufbewahrung: 90 Tage alle, danach einer pro Woche. | OneDrive-Last |
| E9 | **Speichern** atomar (temp + fsync + rename), Debounce 1,5 s, bei Dauertippen spätestens 1,8 s nach der ersten ungespeicherten Eingabe (0,2 s Reserve fürs Schreiben): jede Eingabe liegt nach höchstens 2 s auf der Platte. | Absturzsicherheit |
| E10 | **Struktur-Hinweise lokal** (leeres Kapitel, Satzabbruch am Kapitelende, leere Überschrift beim Import, doppelte Leerzeilen …), ohne KI. | schon in Phase 1 |
| E11 | **KI-Aufruf im Rust-Kern** (`ki_anfrage`), Schlüssel nur im macOS-Schlüsselbund (je Anbieter ein Eintrag), nie in der Web-Oberfläche. Prompt-Aufbau und Antwortprüfung in TypeScript (`core/ki`), die nur `ProjektLeser` und `KiTransport` kennt. | Schlüssel und Schreibschutz |
| E12 | **Allowlist** für alles, was an das Modell geht: Kapiteltext, Kapiteltitel, Figuren-/Ortsnamen + Aliase, Gewissheit von Figuren und Stellen (`existenz`/`realitaet`), Gruppen-Namen, **Plan-Felder von Figuren (`plan`) und Kapitelplänen (Szene, „Was soll hier passieren?“)** – freigegeben von Leon am 2026-10-09 für F-05. Nie: `wahrheit`, `notizen`, `kurz`, Ortsbeschreibungen, Abweichungen, Akte, Stränge, Anmerkungen, Ideen. Werkzeuge (2026-10-10): Die **Namen der Zustandsarten** (`plan/zeitleiste.md`, z. B. „nüchtern“, „betrunken“) gehen als Antwortvokabular der Zustands-Aufgabe (G1) mit – nur die Namen, keine eingetragenen Zustände, Zeitpunkte oder Notizen; von Leon am 2026-10-11 bestätigt. **Stränge (2026-10-12):** Für die Aufgabe „Stränge vorschlagen“ (G2) gehen Name, Haupt-/Nebenhandlung (`rolle`), „Wofür steht der Strang?“ (`beschreibung`) und die Plan-Kapitel jedes Strangs sowie Leons Antworten auf frühere Rückfragen mit – nur im Aufgabentext, nicht im gecachten Prefix; von Leon am 2026-10-12 freigegeben. Die `funktion` eines Kapitels geht nicht an die KI. | private Felder können nicht durchrutschen; Plan ↔ Text-Abgleich (F-05) |
| E13 | **Ganzes Buch als gecachter Prefix** (Prompt Caching) + Aufgaben pro Kapitel; Ergebnis-Cache pro Kapitel-Text-Hash. Token-Schätzung über `count_tokens`. | einfacher, findet kapitelübergreifende Widersprüche |
| E14 | **Zwei KI-Anbieter, Wahl in den Einstellungen** (`projekt.ki.anbieter`, fehlt = Foundry): **Microsoft Foundry** (Endpoint `https://<resource>.services.ai.azure.com/anthropic`, eingetragen werden Deployment-Namen; Schlüsselbund-Konto `azure-foundry`) oder **Claude API** von Anthropic (Basis-URL `https://api.anthropic.com`, überschreibbar; Modell-IDs; Konto `anthropic-api`). Die Einstellungen des anderen Anbieters bleiben beim Umschalten erhalten. Modelle: `claude-haiku-5-5` (Erkennung), `claude-sonnet-5-5` (Prüfung), `claude-opus-5-5` (Tiefencheck). Nur Claude API: bei Sonnet/Opus 5.5 serverseitiger Fallback `fallbacks: "default"` (Beta `server-side-fallback-2026-07-01`), gesetzt in der Transportschicht. Hosting/Region egal (Leon akzeptiert Verarbeitung in den USA). | Leons Vorgabe |
| E15 | **Dritter Anbieter: OpenAI-kompatibel** (`projekt.ki.anbieter: openai`, Block `ki.openai{vorlage, endpoint, modelle, kontextTokens?}`). Vorlagen Ollama (Standard, `http://localhost:11434/v1`), LM Studio (`:1234/v1`), OpenAI, OpenRouter, Qwen (Alibaba Cloud), eigene URL (`core/ki/anbieter.ts`, `VORLAGEN`). `core/ki` baut weiter Messages-API-Bodys; der Transport übersetzt nach Chat Completions und zurück (`core/ki/openai.ts`: `nachOpenAi`/`vonOpenAi`, Schema als `response_format` json_schema strict, bei Qwen json_object mit Schema im System-Prompt), der Rust-Kern schickt an `{endpoint}/chat/completions` mit `Authorization: Bearer` (Schlüssel optional, Konto `openai-kompatibel`, http nur für localhost, Zeitlimit 30 min). Modelle ohne Claude-Standard (leere Rolle = Prüfmodell). Kein `count_tokens` (Schätzung Zeichen/3), keine Listenpreise (Kosten „keine Angabe“, Ablagen ohne `kostenUsd`). Ist `kontextTokens` gesetzt, lehnt der Transport Anfragen ab, die samt 4 000 Tokens Reserve nicht hineinpassen – lokale Server kürzen sonst still. Andere Modelle als Claude sind nicht abgestimmt; die Zitatprüfung (E6) verwirft, was nicht wörtlich zitiert. | Leons Vorgabe: lokale und andere Modelle |
| E16 | **Funktionsumfang als App-Einstellung** `funktionen` in `einstellungen.json` (Browser-Demo: `localStorage` `plotwerk:funktionen`), nie im Projektordner. Katalog, Presets (Anfänger/Mittel/Profi/Schriftsteller), Abhängigkeiten und eigene Presets in `core/funktionen`. Ausgeblendet ≠ gelöscht: Daten ausgeblendeter Funktionen bleiben im Projekt und im Export. Was ein gespeichertes Profil noch nicht kannte (`bekannt`), wird nach seiner Basis entschieden. Ohne „Plan-Abgleich“ setzt die Prüfung `PruefAuftrag.ohnePlan` (keine Plan-Felder im Kontext). | Einstieg für neue Nutzer, weniger Tokens (2026-10-13) |
| E17 | **No-AI-Modus** (`profil.kiAus`): alle KI-Funktionen ausgeblendet; `mitKiSperre` (src/state/funktionen.ts) umhüllt den KI-Transport des Backends und lehnt `senden` und `tokenZaehlen` ab. | Datenschutz, Arbeiten ohne Zugang (2026-10-13) |
| E18 | **Vertrieb: Testphase, dann einmal bezahlen** (entschieden 2026-10-13). Bis 1.0 ist die App kostenlos (Beta). Ab 1.0 läuft sie eine Testphase lang voll (Länge noch offen, eher 14–30 Tage, gern als Nutzungstage) und wird danach mit einem **Lizenzschlüssel** freigeschaltet, der einmal online aktiviert wird (Merchant of Record Paddle oder Lemon Squeezy mit deren License-API). Einmalzahlung ohne Abo; „unbegrenzt“ wird nicht versprochen, damit eine große neue Version später ein bezahltes Upgrade sein kann. Die DMG bleibt frei herunterladbar. Die Prüfung muss ohne Internet weiter funktionieren (Kulanzzeit) und soll ehrliche Nutzer führen, nicht gängeln; unter FSL darf sie für den Eigengebrauch ausgebaut werden. Quellcode bleibt offen, selbst bauen ist kostenlos. KI mit eigenem Zugang (Cloud-API oder lokal über Ollama/LM Studio, E15) bleibt kostenlos. **Plotwerk+** (geplant): optionales Abo mit eingebauter KI ohne eigenen Schlüssel, serverseitig über einen eigenen Proxy durchgesetzt. Der Update-Feed zieht auf `updates.plotwerk.app` um (Domain vorhanden, Weiterleitung folgt). Name und Icon fallen nicht unter die Lizenz (FSL „Trademarks“). | Nebeneinkommen mit wenig Betrieb und Support |

## Phasen

| Phase | Inhalt | Anforderungen |
| --- | --- | --- |
| 1 Schreiben | Projektordner, Editor, Typografie, Autosave, Versionen, Kapitelliste, Wortzahl, Import/Export, Struktur-Hinweise | S-01–S-05, S-11, S-12, E1–E10 |
| 2 Planen | Akt-Board, Ideen, Kapitelplan, Plan-Panel, Abweichungen, Figuren, Orte, Anmerkungen, `[[`-Verweise | P-*, F-01–F-04, F-06, O-01, O-02, S-06–S-09 |
| 3 Erkennen | exakte Erkennung, Tab „Erkannt“, Beziehungsnetz mit Zeitregler, Antagonisten, Kapitel-Überblick ohne KI, Weg einer Figur | S-10, B-*, A-*, K-01/K-02/K-04, O-03 |
| 4 Prüfen | KI-Vorschläge (Haiku), Prüfung + Zusammenfassungen (Sonnet), Hinweise-Ansicht, Tab „Hinweise“, Tiefencheck | K-03, F-05, S-13, Hinweis-Typen |

## Projektordner-Format

```
<Projekt>/
├── projekt.md                 Frontmatter: version, titel, kapitel[], ki{endpoint, deployments, anbieter, claude{endpoint, modelle}, openai{vorlage, endpoint, modelle, kontextTokens}}
├── manuskript/<id>.md         Frontmatter: id, titel · Body: Markdown
├── plan/akte.md               Frontmatter: akte[]
├── plan/straenge.md           Frontmatter: straenge[] (id, name, farbe, gruppe?, rolle? haupt|neben, beschreibung?)
├── plan/ideen.md              Frontmatter: ideen[]
├── plan/motive.md             Frontmatter: motive[] (id, name, aliase) – Motive im Tab „Erkannt“ (S-10)
├── plan/kapitel/<id>.md       Frontmatter: KapitelPlan ohne notiz (szene = „Kurzbeschreibung“, funktion? = „Funktion im Buch“) · Body: notiz
├── archiv/index.json          {version: 1, kapitel: [archivierte IDs], reihenfolge: [aktive + archivierte IDs]}
├── archiv/manuskript/<id>.md  Archivierter Manuskriptstand, unveränderte Originaldatei
├── archiv/plan/kapitel/<id>.md Archivierter Kapitelplan einschließlich Notizen, unveränderte Originaldatei
├── figuren/<id>.md            Frontmatter: Figur ohne wahrheit/notizen · Body: "## Wahrheit hinter den Kulissen" + "## Notizen"
├── gruppen/<id>.md            Frontmatter: Gruppe ohne notizen · Body: "## Notizen"
├── orte/<id>.md               Frontmatter: Ort ohne beschreibung/notizen · Body: Beschreibung + "## Notizen"
├── anmerkungen.json           Anmerkung[]
├── entscheidungen.json        Entscheidungen
├── .plotwerk/analysen/<id>.json   KapitelAnalyse (KI)
├── .plotwerk/hinweise.json        Hinweis[] (KI)
├── .plotwerk/vorschlaege.json     KiVorschlaege (KI)
│
│   Werkzeuge G1–G8 (Typen: core/model/types.ts, Abschnitt „Werkzeuge“; Pfade: PFADE in core/projekt/lesen.ts)
├── plan/kapitel/<id>.md       zusätzlich `zeit` (Zeitpunkt, G1) und `szenen` (Szene[] ohne `kapitel`, G2)
├── plan/zeitleiste.md         G1 Frontmatter: beginn{wochentag, datum}, zustandsarten[], zustaende[] · Body: Notiz
├── plan/faeden.md             G2 Frontmatter: ruheSchwelle, faeden[] (FadenPlan) – Status bleibt in entscheidungen.faeden
├── plan/boegen.md             G3 Frontmatter: boegen[] (Figurenbogen: figur, stufen[])
├── plan/marken.md             G4 Frontmatter: marken[], ignoriert[]
├── statistik.json             G5 Schreibstatistik {version, ziel{tagWoerter, buchWoerter, abgabe}, tage{YYYY-MM-DD: {geschrieben, stand}}} – Zählregel unten
├── fassungen.json             G5 BenannteFassung[] (Schnappschüsse dieser Fassungen löscht die Aufbewahrung nie)
├── lektorat/aenderungen.json  G7 LektoratsAenderung[] (Rückimport aus Word)
├── recherche/recherche.json   G8 Recherche {version, eintraege[]}
├── recherche/dateien/…        G8 Bilder (binär, nur hier – fs_*_binaer)
├── .plotwerk/zeit-vorschlaege.json     G1 KiAblage<ZeitVorschlag>
├── .plotwerk/zustand-vorschlaege.json  G1 KiAblage<ZustandVorschlag>
├── .plotwerk/stimmen.json              G3 KiAblage<StimmenBeobachtung>
├── .plotwerk/leser.json                G6 KiAblage<LeserStand> (mehrere je Kapitel: id, erledigt; Frage → faden/anmerkung)
├── .plotwerk/fragen.json               G6 KiAblage<BuchFrage> (imBuch: false = „steht nicht im Buch“)
├── .plotwerk/strang-vorschlaege.json   G2 KiAblage<StrangVorschlag> (zuordnung, neu, frage; Antworten auf Rückfragen)
└── .versionen/…               Schnappschüsse (Binärdateien: .versionen/recherche/…/<Zeitstempel>.<endung>)
```

`projekt.md` hat zusätzlich das optionale Feld `angaben` (autor, untertitel, genre, sprache, anfuehrung; G7, nicht an die KI).
`angaben.anfuehrung` ist optional: `de` = „…“ / ‚…‘ (auch ohne Angabe), `verlag` = »…« / ›…‹,
`schweiz` = «…» / ‹…›. Nur bei deutscher Buchsprache wirkt der Stil beim Tippen (E7); Apostroph bleibt ’.
Bei anderen Buchsprachen ist die Auswahl ausgeblendet, der gespeicherte Wert bleibt erhalten.
`de-CH` wählt keinen Stil automatisch. Unbekannte Stilwerte werden beim Lesen verworfen.

**Kapitelarchiv (Issue #13, Paket 1):** Archivierte Kapitel stehen nicht in `projekt.md → kapitel` und werden
separat als `ProjektDaten.archiv` geladen, nie als aktiver Text/Plan, Export oder KI-Kontext. Die IDs bleiben
reserviert. `archiv/index.json` erhält die alte Position anhand der Nachbarn; aktive Umordnungen haben Vorrang.
Vor Archivieren und Wiederherstellen entsteht immer ein **neuer** Schnappschuss von Manuskript und vorhandenem
Plan im ursprünglichen `.versionen/<pfad>/`-Verlauf (auch bei unverändertem Inhalt in derselben Sekunde).
Bei einem I/O-Fehler setzt ein Änderungsjournal bereits ausgeführte Schreibvorgänge zurück. Ist auch das
Rücksetzen nicht möglich, meldet die App den Fehler ausdrücklich; eine Mehrdatei-Crash-Transaktion bietet die
Dateisystem-Schnittstelle nicht. Anmerkungen und sonstige ID-Verweise bleiben unverändert im Projekt;
Verweisbeschriftungen zeigen „archiviert“. `.plotwerk/analysen/<id>.json` und betroffene Einträge in
`.plotwerk/hinweise.json` bleiben erhalten, einschließlich unbekannter JSON-Felder, und erhalten additiv
`veraltet: true`. Die Markierung bleibt auch nach Wiederherstellen bestehen; der Analyse-Cache verwendet
solche Ergebnisse nicht, und veraltete Hinweise werden nicht als aktuelle Hinweise angezeigt. Keine automatische
KI-Neuberechnung. Archivieren/Wiederherstellen verändert nur den Wortzahlstand, zählt nicht als Schreiben.

KI-Ablagen haben alle die Form `{version: 1, eintraege: [], lauf?: {datum, modell, kostenUsd?}}`. Fehlende
Werkzeug-Dateien füllt `ladeProjekt` mit Standardwerten (`leereZeitleiste()` mit `STANDARD_ZUSTANDSARTEN` usw.);
KI-Ablagen fehlen in `ProjektDaten`, solange es die Datei nicht gibt. Farben in Daten (`ZustandsArt.farbe`) sind
Token-Namen aus `src/theme/tokens.css` ohne `--`.

**Zählregel `statistik.json`** (G5, `core/statistik/index.ts`): Nach jedem Speichern eines Kapitels wird die
Gesamtwortzahl des Buchs verglichen; der Tag ist das lokale Kalenderdatum des Macs. Zunahme zählt als
„geschrieben“, Abnahme zieht nichts ab. Ein in einem Speichervorgang eingefügter Block ab 25 Wörtern wird zuerst mit
den in den 10 Minuten davor gelöschten Wörtern verrechnet (Verschieben zählt nicht doppelt). Laden, Änderungen von
außen, Import, Wiederherstellen und Rückimport führen nur den `stand` nach. Geschrieben wird spätestens alle 15 s,
beim Beenden und beim Projektwechsel.

**LeserStand** (G6): Ältere Stände legten Vermutungen, Spannung und Plan-Abgleich als `LeserFrage` mit Präfix in der
`id` ab (`vermutung|…`, `spannung|…`, `plan|status|kapitel|…`); `ausLeserStand` liest beides, eigene Felder haben
Vorrang, neu gespeichert wird nur die Form mit eigenen Feldern. Jede Simulation bleibt erhalten (mehrere Stände je
Kapitel, sortiert nach Kapitel und Datum); neue bekommen eine `id`, ältere ohne `id` heißen `kapitel@datum`
(`standId`). `erledigt` (ISO-Datum) blendet eine Simulation aus der Kapitelkarte aus (`aktuellerStand`). Übernimmt Leon eine offene Frage als Faden oder
Notiz, merkt sich die `LeserFrage` die ID (`faden`, `anmerkung`); eine erneute Simulation nimmt diese Zuordnungen für
Fragen mit gleicher `id` (gleicher Wortlaut) aus der vorigen Simulation des Kapitels mit (`uebernahmenMitnehmen`).

YAML-Frontmatter mit `yaml` (Paket), Schlüssel in der Reihenfolge der Typdefinition, 2 Leerzeichen Einrückung. Unbekannte Frontmatter-Felder beim Speichern erhalten (Obsidian-Kompatibilität).

## Verzeichnisse und Zuständigkeit

Jedes Verzeichnis hat genau einen Besitzer. Fremde Dateien nur lesen. Braucht ein Modul etwas aus einem fremden Bereich, importiert es die öffentliche API (`index.ts`) und meldet fehlende Funktionen im Ergebnis, statt fremde Dateien zu ändern.

| Pfad | Inhalt | Besitzer |
| --- | --- | --- |
| `core/model/` | Datenmodell (Vertrag) | fest, nur additiv |
| `core/projekt/` | Parse/Serialize, laden/speichern, MemoryFs, Schnappschuss-Ablage | Fundament |
| `core/text/` | Normalisierung, Klartext aus Markdown, Absätze, Hash, Wortzahl, Textanker (finden/erzeugen) | Kernlogik |
| `core/typografie/` | reine Funktionen für deutsche Typografie (vom Editor als Input-Rules genutzt) | Kernlogik |
| `core/erkennung/` | exakte Erkennung von Figuren/Orten (E5), Schreibweisen-Varianten | Kernlogik |
| `core/struktur/` | lokale Struktur-Hinweise (E10) | Kernlogik |
| `core/versionen/` | Schnappschuss-Politik, Aufbewahrung, Zeilen-Diff | Kernlogik |
| `core/index/` | abgeleitete Daten: Erwähnungen, Fäden, erster Auftritt, Weg einer Figur, Hinweise zusammenführen + Entscheidungen anwenden; `IndexSpeicher`-Schnittstelle | Kernlogik |
| `core/docx/`, `core/pdf/` | Import .docx, Export .docx/PDF | Import/Export |
| `core/ki/` | Prompt-Aufbau (Allowlist), Schemas, Antwortprüfung, Zitatprüfung, Cache-Schlüssel, Token-Schätzung, `KiTransport` | KI |
| `src/app/`, `src/ui/`, `src/theme/` | Fenster-Rahmen, Navigation, gemeinsame UI-Bausteine, Tokens | Fundament |
| `src/state/store.ts` | Zustand-Store, setzt Slices zusammen | Fundament |
| `src/state/slices/<bereich>.ts` | Slice je Bereich | Besitzer des Bereichs |
| `src/backend/` | Backend-Auswahl, MemoryFs-Demo | Fundament |
| `src/backend/tauri/` | TauriFs, Schlüsselbund, KI-Transport, SQLite-Index | Tauri |
| `src/features/schreiben/` | Editor, Kapitelliste, Plan-Panel, Anmerkungen, Versionsverlauf, Fokus | Editor |
| `src/features/akte/`, `kapitel/`, `figuren/`, `orte/` | Planungs-Ansichten | Planung |
| `src/features/beziehungen/`, `hinweise/`, `gruppen/` | Netz, Hinweise, Antagonisten | Netz & Hinweise |
| `src/features/importexport/` | Import-Vorschau, Export-Dialog | Import/Export |
| `src/features/ki/` | Einstellungen, Prüf-Dialog, Vorschläge bestätigen | KI |
| `src-tauri/` | Rust-Kern, Tauri-Konfiguration | Tauri |
| `fixtures/` | Demo-Projekt „Hafenlichter“ (frei erfundener Roman, Testdaten) | Fundament |
| `abnahme/` | Akzeptanztests AK-1 … AK-10 über alle Module (`docs/abnahme.md`) | Abnahme |
| `core/funktionen/` | Funktionskatalog, Presets, Abhängigkeiten, KI-Last, Profil laden (E16/E17) | Fundament |
| `src/state/funktionen.ts`, `src/app/funktionen.ts`, `src/app/NurMit.tsx`, `src/features/funktionen/` | Profil-Zustand und Speicherung, KI-Sperre, Zuordnung Bereich/Befehl → Funktion, Assistent, Funktionsauswahl, Dialog „Funktionen“ | Fundament |

### Werkzeuge G1–G8 (ab 2026-10-10)

Gemeinsame Grundlage (Fundament, nur additiv ändern): Typen in `core/model/types.ts`, Parse/Serialize und
`speichereX` in `core/projekt`, Store-Aktionen in `src/state/store.ts`, Bereiche/Befehle/Dialoge in `src/app`,
`core/ki/aufgabe.ts`, Demo-Registry `src/backend/ki/demoAntworten/index.ts`, Binär-Kommandos im Rust-Kern.

| Gruppe | Eigene Pfade | Einhängepunkte in fremden Bereichen |
| --- | --- | --- |
| G1 Zeit & Zustand | `src/features/zeitleiste/`, `src/state/slices/zeit.ts`, `core/zeit/`, `core/ki/zeit.ts`, `src/backend/ki/demoAntworten/zeit.ts` | `zeitHinweise()` (core/zeit) fließt in core/index-Hinweise |
| G2 Plot-Struktur | `src/features/faeden/`, `src/state/slices/struktur.ts`, `core/struktur/faeden.ts`, `core/struktur/szenen.ts`, `core/struktur/straenge.ts`, `core/ki/straenge.ts`, `src/backend/ki/demoAntworten/struktur.ts` | `StrangRaster` und `StrangInspektor` (Akte planen, Segment „Stränge“), `KapitelStrangVorschlaege` (Kapitel-Inspektor), `SzenenUebersicht` (Kapitel-Überblick), `SzenenKarte` (Schreiben-Inspektor, Tab Plan) |
| G3 Figuren | `src/features/figuren/Boegen*.tsx`, `Stimme*.tsx`, `src/state/slices/figurenbogen.ts`, `core/figuren/`, `core/ki/stimme.ts`, `core/ki/stimmeRede.ts`, `src/backend/ki/demoAntworten/figuren.ts` | `FigurenBoegen` (Figuren, Segment „Bögen“), Spalte „Stimme“ an der Figurenkarte; `stimmenHinweise()` fließt in core/index-Hinweise (Typ `sprache`) |
| G4 Editor | `src/features/schreiben/werkzeuge/`, `src/state/slices/editorwerkzeuge.ts`, `core/stil/`, `src/backend/tauri/vorlesen.ts`, `src-tauri/src/vorlesen.rs` | `editorErweiterungen()`, `<EditorWerkzeuge>` (Editor), `<EditorWerkzeugleiste>` (Statusleiste), Tab „Stil“ (Schreiben-Inspektor) |
| G5 Versionen & Statistik | `src/features/statistik/`, `src/state/slices/statistik.ts`, `core/statistik/` | `<SchreibzielAnzeige>` (Statusleiste); Schnappschüsse über `schnappschuss(pfad, 'benannt')` |
| G6 KI-Leser | `src/features/fragen/`, `src/state/slices/kileser.ts`, `core/ki/leser.ts`, `core/ki/fragen.ts`, `src/backend/ki/demoAntworten/leser.ts` | `LeserSimulationKarte` (Kapitel-Überblick) |
| G7 Abgabe | `src/features/abgabe/`, `src/state/slices/abgabe.ts`, `core/abgabe/`, `core/epub/`, `core/docx/rueckimport.ts` | offene Lektorats-Änderungen als Markierung im Editor (`dekorationen.ts`); Buchsatz gemeinsam mit der Vorschau in `core/satz/` |
| G8 Recherche & Mac | `src/features/recherche/`, `src/state/slices/recherche.ts`, `core/recherche/`, `scripts/`, Tauri-Konfiguration für Signatur/Updater (`docs/mac-verteilung.md`) | `RechercheLeiste` an Figurenkarte, Ortskarte, Kapitel-Überblick, Schreiben-Inspektor (Plan) und Szenen-Formular |

Neue Bereiche (Seitenleisten-Gruppe „Werkzeuge“, einklappbar): `zeitleiste` (⌘8), `faeden` (⌘9), `recherche` (⌘0),
`statistik`, `fragen`. Neue Dialoge: `zeit-vorschlaege`, `stimme-pruefen`, `straenge-vorschlagen`, `marken`, `fassung`, `versionsvergleich`,
`leser-simulation`, `abgabe-export`, `rueckimport`, `recherche-eintrag`. Befehle (Menü, Schnellsuche):
`zeit-vorschlaege`, `stimme-pruefen`, `straenge-vorschlagen`, `marken`, `typewriter` (⌘⇧T), `wiederholungen`, `vorlesen`, `fassung`,
`versionsvergleich`, `leser-simulation`, `abgabe`, `rueckimport`, `recherche-neu`, `faden-neu`. Fassung sichern: ⌘⇧S.
Solange ein Dialog offen ist, wechseln ⌘-Bereichstasten nicht den Bereich dahinter. Anzeigenamen der Hinweis-Typen:
`core/index/hinweisTypen.ts` (Hinweise-Ansicht und Lektoratsmappe).

KI-Aufgaben der Werkzeuge nutzen `fuehreAufgabeAus(leser, transport, einstellungen, definition)` aus
`core/ki/aufgabe.ts`: Buchkontext nach Allowlist E12 (optional nur bis `kapitelBis`), eigenes Schema, Zitatprüfung
(E6) und Ersatztext-Filter über die `AufgabenPruefung`. Neue Felder gehen nur an die KI, wenn E12 sie erlaubt –
Zeitpunkte, Zustände, Bögen, Marken, Recherche und Lektorat gehören nicht dazu.

## Schnittstellen (Kurzform)

- `ProjektLeser` / `ProjektDateisystem`: `core/projekt/fs.ts`
- `core/projekt`: `ladeProjekt(leser): Promise<ProjektDaten>`, `speichereKapitel(fs, kapitel)`, `speicherePlan(fs, plan)`, … je Dateityp ein Paar `parseX(text)` / `serializeX(obj)`; `schnappschuss(fs, pfad, zeit)`.
- `KiTransport` (`core/ki`): `senden(body: object): Promise<object>` (Messages-API-Body → Antwort-JSON; OpenAI-kompatibel übersetzt der Transport, E15), `tokenZaehlen(body): Promise<number>`, `bereit(): Promise<boolean>`.
- Store: `useStore` (zustand). Slices bekommen `(set, get)` und lesen `get().daten` (ProjektDaten) und `get().fs`.
- Rust-Kommandos (camelCase-Argumente via Tauri): `projekt_oeffnen(pfad)`, `fs_lesen(pfad)`, `fs_schreiben(pfad, inhalt)`, `fs_auflisten(ordner)`, `fs_existiert(pfad)`, `fs_entfernen(pfad)`, `vorlesen_stimmen()`, `vorlesen_sagen(text, stimme?, tempo?)` → `"fertig"`/`"abgebrochen"`, `vorlesen_stopp()` (macOS `say`, Text über stdin; in der Mac-App immer statt der Web Speech API), `link_oeffnen(url)` (nur http/https), `schluessel_setzen(wert, anbieter?)`, `schluessel_vorhanden(anbieter?)`, `schluessel_loeschen(anbieter?)`, `ki_anfrage(endpoint, body, anbieter?)`, `ki_tokens(endpoint, body, anbieter?)` (`anbieter`: `"foundry"` (Standard), `"claude"` oder `"openai"`; bei `"openai"` geht `ki_anfrage` an `/chat/completions`, `ki_tokens` gibt es nicht). Alle `fs_*` arbeiten relativ zum geöffneten Projekt und lehnen `..`/absolute Pfade ab.
- Binärdateien (G8): `fs_lesen_binaer(kennung?, pfad)` → rohe Bytes (`ipc::Response`, in TS `ArrayBuffer`), `fs_schreiben_binaer` mit rohem Body und Kopfzeilen `plotwerk-pfad` (URI-kodiert) und `plotwerk-kennung`. Nur unter `recherche/` und `.versionen/recherche/` (`dateien::binaer_erlaubt` = `binaerPfadErlaubt` in TS), atomar, gleicher Pfadwächter. TS: optionale Methoden `lesenBinaer`/`schreibenBinaer` an `ProjektDateisystem` (TauriFs, MemoryFs), Aufruf über `leseBinaer`/`schreibeBinaer`/`entferneBinaerMitSchnappschuss` (core/projekt) bzw. Store `leseBinaerDatei`/`speichereBinaerDatei`/`entferneBinaerDatei`.

## Funktionsumfang (E16/E17, ab 2026-10-13)

- **Katalog** (`core/funktionen`): 22 Funktionen in vier Gruppen (Schreiben, Planen, Figuren & Welt, Prüfen & KI),
  `editor` ist Pflicht. KI-Funktionen haben eine Last (1–3) und eine Modellrolle; die Summe ergibt die Anzeige
  „KI-Nutzung: gering (≤ 3) / mittel (≤ 8) / hoch“. Abhängigkeiten (`braucht`) löst `einschalten`/`ausschalten` auf.
- **Zuordnung** (`src/app/funktionen.ts`): `BEREICH_FUNKTION` (jeder Bereich), `funktionFuerBefehl` (Befehle aus Menü,
  Tastenkürzeln, Schnellsuche). `befehlAusfuehren` und der Rahmen fragen bei ausgeblendeten Funktionen nach
  (`funktionSicherstellen`); wird der aktive Bereich in den Einstellungen ausgeblendet, geht es still zum Schreiben.
  Das native Menü bleibt vollständig.
- **Einhängen in Ansichten**: `<NurMit funktion="…">` bzw. `useFunktion(id)`. Unterfunktionen: Typewriter und
  Statusleisten-Werkzeuge, Tab „Stil“ (`editorWerkzeuge`), Schreibziel (`statistik`), Szenen-Karte/-Übersicht
  (`faeden`), Recherche-Leiste (`recherche`), Bögen (`boegen`), Stimme (`kiStimme`), Leser-Karte (`kiLeser`),
  KI-Vorschläge (`kiErkennung`, über `useOffeneVorschlaege`), Prüfen-Knöpfe (`kiPruefung`), Tiefencheck im
  Prüf-Dialog (`kiTiefencheck`), Zeitvorschläge (`kiZeit`), Fassungen in Statistik und Versionsverlauf (`fassungen`),
  Abgabe- und Rückimport-Verweise (`abgabe`), Tab „Hinweise“ im Schreiben-Inspektor (`hinweise`).
- **Laden** vor dem ersten Rendern (`initialisiereFunktionen` in `main.tsx`): gespeichertes Profil → so; keins, aber
  `letztesProjekt` gesetzt → Bestandsprofil (alles, ohne Assistent); sonst Assistent. Tests laufen mit allen
  Funktionen und ohne Assistent (`src/test/setup.ts`).

## Sprachen (i18n, ab 2026-10-12)

Oberfläche Deutsch (Standard und Quellsprache) und Englisch, ohne i18n-Bibliothek.

- **Wörterbuch** je Bereich: `src/i18n/de/<bereich>.ts` (Quelle) und `src/i18n/en/<bereich>.ts`. Die englische
  Datei hat den Typ `Form<typeof de>` – TypeScript meldet jeden fehlenden oder überzähligen Schlüssel.
  Texte sind Zeichenketten mit Platzhaltern `{name}` oder Pluralformen `{ one, other, zero? }` (gewählt über `n`).
  `src/i18n/i18n.test.ts` prüft de ↔ en: gleiche Schlüssel, gleiche Platzhalter, keine Umlaute im Englischen.
- **Nutzung**: in Komponenten `const t = useTexte()` (rendert beim Umschalten neu) und `f(t.x.y, { n })`; außerhalb
  von React `texte()`, `sprache()`, `f()`. Zahlen/Daten über `zahl`, `datum`, `datumZeit`, `uhrzeit`, `liste`,
  `relativ` (Intl mit `de-DE` bzw. `en-US`). Beschriftungen nie in Modul-Konstanten auswerten.
- **Text ergänzen**: Schlüssel in `de/<bereich>.ts` anlegen, dieselbe Stelle in `en/<bereich>.ts` füllen
  (`npm run typecheck` zeigt, was fehlt). Neuer Bereich: Dateipaar anlegen und in `de/index.ts` und `en/index.ts`
  eintragen. Gemeinsame Wörter (Abbrechen, Schließen, „Kap. {nr}“, Wortzahlen …) stehen in `gemeinsam`.
- **core/** bleibt ohne DOM: `core/i18n` liefert `Sprache`, `fmt`, `texteJe(de, en)` und `buchSprache()`.
  Funktionen mit nutzersichtbaren Texten (lokale Hinweise, Lade-/Import-Warnungen …) haben einen optionalen
  Parameter `sprache` (Standard `'de'`); die Oberfläche übergibt `sprache()`. Die lokalen Hinweise entstehen in
  `berechneIndex(daten, vorher, sprache)`; der Store rechnet sie beim Sprachwechsel neu. Hinweis-Schlüssel
  hängen nicht von der Sprache ab (Entscheidungen bleiben gültig).
- **Sprachwahl**: Einstellungen (⌘,) → System / Deutsch / English. „System“ folgt der ersten bevorzugten
  macOS-Sprache (Deutsch → de, sonst en). Gespeichert als App-Einstellung `sprache` in `einstellungen.json` im
  App-Ordner (Rust: `sprache_info`, `sprache_setzen`; fehlt = System), in der Browser-Demo in `localStorage`
  (`plotwerk:sprache`), nie im Projektordner. Das native Menü und die Dateidialoge (`src-tauri/src/sprache.rs`,
  `menue.rs`) folgen der Sprache beim Start und beim Umschalten. Tests laufen fest auf Deutsch
  (`src/test/setup.ts`).
- **Buchsprache ≠ Oberflächensprache**: `projekt.md → angaben.sprache` (BCP-47, leer = de) steuert Typografie
  beim Tippen, `lang` von Editor und Buch-Vorschau (Silbentrennung, Rechtschreibung), Stil-Werkzeuge,
  Namenserkennung (Genitiv/Possessiv), Vorlesestimme, die Sprache der KI-Beobachtungen und die Beschriftungen
  der Export-Dokumente (`buchSprache()`, in src `useBuchSprache()` aus `src/i18n/buch`).
- **Rust-Meldungen**: Fehlertexte, die die Oberfläche anzeigt, entstehen im Rust-Kern bereits in der
  Oberflächensprache: `sprache::t(de, en)` für feste Texte, `tf!("…{x}", "…{x}")` für Texte mit Werten,
  `KiFehler::meldung(englisch)` im Crate `plotwerk-ki` (dort `Text { de, en }` für Einstellungsfehler, `Display`
  bleibt deutsch). Die Update-Dialoge (`aktualisierung.rs`) und das Menü nutzen dieselbe Sprache. Rust-Tests
  laufen mit der Standardsprache Deutsch.
- **Demo-Projekte**: `fixtures/demo-projekt` („Hafenlichter“, deutsch) und `fixtures/demo-projekt-en` („Harbour
  Lights“, vollständige englische Fassung mit `angaben.sprache: en`, englischen IDs, eigenen Ankern und
  `textHash`; Struktur und Testfälle wie im deutschen, geprüft von `fixtures/demo-projekt-en.test.ts`). Die
  Browser-Demo (`src/backend/demo.ts`) lädt bei englischer Oberfläche „Harbour Lights“, sonst „Hafenlichter“;
  beim Umschalten der Sprache wechselt sie das offene Demo-Projekt (`Backend.demoFuerSprache`, nur Demo).
  Änderungen liegen je Sprache in `localStorage` (`plotwerk:demo:aenderungen`, `…:en`), „Demo zurücksetzen“ gilt
  für das angezeigte Projekt. Die Demo-KI (`src/backend/ki/demo*`) wählt Regeln, Texte und Belegtabellen nach der
  Buchsprache des Prompts (`GelesenerKontext.sprache`, aus englischen Beschriftungen erkannt) und antwortet beim
  englischen Projekt auf Englisch mit wörtlichen Zitaten. Tests der deutschen Oberfläche laufen weiter mit dem
  deutschen Demo-Projekt.
- **Gewissheit**: Die Realitäts-Funktion heißt in der Oberfläche „Gewissheit“ / „Certainty“ (Stufen gesichert /
  noch offen / bewusst vage bzw. confirmed / open / deliberately vague). Datenmodell und Dateiformat bleiben
  (`existenz`, `realitaet`, Werte `gesichert|offen|bewusst_vage`); die Namen stehen nur im Wörterbuch
  (`gemeinsam.realitaet`, `ui.realitaet`, `figuren`, `kapitel.realitaet`, `schreiben`, `beziehungen`).
- Nicht übersetzt: Nutzerdaten, feste Abschnittsüberschriften im Projektformat („## Wahrheit hinter den
  Kulissen“, „## Notizen“), `console`-Ausgaben und das Handbuch (`docs/handbuch.md`, bleibt deutsch).
- **Folgeschritte**: englisches „standard manuscript format“ statt Normseite 30×60 (bisher nur Beschriftungen
  englisch); `KapitelAnalyse` merkt sich die Sprache nicht – nach Wechsel der Buchsprache bei unverändertem Text
  greift der Cache nicht, „Prüfung erzwingen“ rechnet neu (additives Feld `sprache?` nötig); britische Dialoge in
  ‘…’ erkennt `stimmeRede` noch nicht; englische Prompts an echten Modellantworten feinjustieren; Word-Kommentare
  (`kommentarNotiz`) bleiben deutsch, weil der Rückimport Doppelte über den Text erkennt; das native Datumsfeld
  (`<input type="date">`) folgt der Systemsprache, nicht der Oberflächensprache.

## Harte Regeln

1. Die KI schreibt nie: `core/ki` importiert nichts, was schreiben kann (nur `ProjektLeser`, `KiTransport`, `core/text`, `core/model`, `core/i18n`). Ein Test prüft die Importe und einen vollen Lauf gegen ein Dateisystem, das bei jedem Schreibversuch fehlschlägt. Der Rust-Teil der KI hat keinen Dateizugriff.
2. Kein Ersatztext: Das Antwortschema hat kein Feld dafür; Erklärungen mit Formulierungsvorschlägen („stattdessen“, „besser:“, „ersetze“, „formuliere“ …) werden verworfen.
3. Jedes Zitat wird nach E6 gegen den Text geprüft, sonst wird der Hinweis verworfen.
4. Bewusst vage markierte Figuren/Stellen erzeugen nie Hinweise vom Typ `pruefen`.
5. UI-Texte nur über das Wörterbuch (`src/i18n`, Deutsch als Quelle), Code-Bezeichner Deutsch wie im Datenmodell.
