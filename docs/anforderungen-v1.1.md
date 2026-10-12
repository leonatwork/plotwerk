# Plotwerk – Anforderungen Story-App (Mac) · v1.1

Oct 9, 2026 · @Leon Machnik · fortgeschrieben aus v1.0

**Was sich gegenüber v1.0 geändert hat**

- Die Entscheidungen E1–E14 (bisher nur in `docs/architektur.md`) sind in die Abschnitte eingearbeitet und unten als Tabelle zusammengefasst.
- Datenmodell und Projektordner entsprechen dem umgesetzten Stand: stabile IDs, Dateinamen ohne Nummer, KI-Ergebnisse und Entscheidungen im Projektordner, SQLite nur noch Cache, neu `plan/motive.md`.
- Datenschutz: Hosting und Region des Foundry-Deployments sind egal (Leons Vorgabe), die EU-Vorgabe entfällt.
- KI-Anbieter wählbar: Microsoft Foundry oder die Claude API von Anthropic direkt (E14).
- Phasenplan ausgeschrieben, mit Abnahme je Phase.
- Präzisiert: Speichern spätestens 1,8 s nach der ersten ungespeicherten Eingabe (damit liegt jede Eingabe nach höchstens 2 s auf der Platte), Motive im Tab „Erkannt“ (S-10), Realitätsebene für Textstellen direkt im Editor (K-04).
- Offene Punkte aktualisiert. Nicht-Ziele unverändert.

**Nachtrag 10. Oktober 2026 – Werkzeuge G1–G8**

- Neuer Abschnitt „Funktionen: Werkzeuge“ mit den IDs Z-, PS-, FB-, EW-, VS-, KL-, AB-, RC- und MAC-.
- Datenmodell und Projektordner um die Werkzeug-Dateien erweitert (nur additiv, siehe `docs/architektur.md`).
- Hinweis-Typ „Zeitleiste“ entsteht jetzt auch lokal (Zeitprüfung), „Sprache“ auch aus der Figurenstimme.
- Tastenkürzel ergänzt (⌘8, ⌘9, ⌘0, ⌘⇧T, ⌘⇧S). Nicht-Ziele präzisiert (Abgabeformate statt Buchsatz, kein iPhone-Begleiter).

**Nachtrag 13. Oktober 2026 – Funktionsumfang und Einrichtung**

- Neuer Abschnitt „Funktionsumfang und Einrichtung“ mit den IDs FU-01 … FU-08: Einrichtungs-Assistent beim ersten Start,
  Presets je Schreibertyp, eigene Presets, Funktionen ein- und ausblenden, KI-Umfang, No-AI-Modus.
- Neue Entscheidungen E15 (Funktionsumfang als App-Einstellung, ausgeblendet ≠ gelöscht) und E16 (No-AI-Modus).

## Ziel und Leitprinzipien

Plotwerk (Arbeitstitel) ist eine lokale Mac-App, in der Leon seinen Roman schreibt, plant und auf Stimmigkeit prüfen lässt. Die KI liest dabei nur mit und verändert nie den Text.

Nutzer ist eine Person. Zum Start verwaltet die App ein Projekt; die Ordnerstruktur ist so angelegt, dass weitere Projekte ohne Umbau möglich sind.

**Leitprinzipien**

- **Lokal zuerst:** Alle Daten liegen in einem Projektordner auf dem Mac. Kein Server, kein Login. Die einzige Netzverbindung ist die KI-Analyse über Microsoft Foundry oder die Claude API.
- **Die KI schreibt nie:** Sie hat keinen Schreibzugriff auf das Manuskript und liefert weder Ersatztexte noch Formulierungsvorschläge. Sie erzeugt ausschließlich Hinweise mit wörtlichem Zitat und Kapitelangabe.
- **Zwei Ebenen:** Plan (was Leon vorhat) und Text (was geschrieben ist) werden getrennt gespeichert. Die App zeigt, wo sie auseinanderlaufen; Leon entscheidet.
- **Mehrdeutigkeit ist Stilmittel:** Ereignisse, Textstellen und Figuren können „gesichert“, „noch offen“ oder „bewusst vage“ sein. Bewusst Vages meldet die Prüfung nie als Fehler.
- **Nichts geht verloren:** automatisches Speichern, Versionsverlauf, offene Dateiformate (Markdown, JSON).
- **Der Editor muss sich gut anfühlen:** Wenn Schreiben in der App schlechter ist als in Word, wird sie nicht benutzt. Der Editor hat deshalb Vorrang vor allen Extras.

## Plattform und Technik

| Bereich | Entscheidung | Begründung |
| --- | --- | --- |
| Plattform | nur macOS (ab 12) | einziger Rechner, auf dem geschrieben wird |
| App-Hülle | Tauri 2 (Rust-Kern, Web-Oberfläche) | klein und sparsam; direkter Dateizugriff, native Menüs |
| Oberfläche | React 18 + TypeScript, Vite | gute Unterstützung durch Claude Code |
| Editor | TipTap (ProseMirror) | Anmerkungen als Hinterlegung, `[[`-Verweise in Notizen, Markdown laden und speichern |
| Daten | Markdown mit YAML-Frontmatter und JSON im Projektordner (OneDrive) | lesbar ohne App, in Obsidian oder VS Code zu öffnen, gesichert durch OneDrive |
| Index | SQLite im App-Support-Ordner, **nur Cache** (E2) | schnelle Abfragen; jederzeit ohne Verlust neu aufbaubar; kein Sync-Konflikt |
| KI | Messages-API wahlweise über **Microsoft Foundry** oder die **Claude API** von Anthropic (Wahl in den Einstellungen, E14); Aufruf nur im Rust-Kern (E11), Modell pro Aufgabe einstellbar | Foundry: Leons Azure-Stack und Guthaben; Claude API: direkter Zugang ohne Azure, serverseitiger Fallback bei Ablehnungen |
| Schlüssel | macOS-Schlüsselbund, je Anbieter ein Eintrag (`azure-foundry`, `anthropic-api`), nie in der Web-Oberfläche | API-Schlüssel nie im Klartext auf der Platte |
| Rechtschreibung | macOS-Systemprüfung, Deutsch | keine eigene Wortliste nötig |
| Import / Export | .docx einlesen; Export als .docx und PDF | bestehendes Manuskript übernehmen; Lektorat und Verlage wollen Word |

**Modellwahl (Standard, in den Einstellungen änderbar, E14):** `claude-haiku-5-5` für die Erkennung von Figuren und Orten pro Kapitel, `claude-sonnet-5-5` für die Konsistenzprüfung und die Zusammenfassungen, `claude-opus-5-5` optional für einen gelegentlichen Tiefencheck des ganzen Buchs. Bei Foundry werden Endpoint und Deployment-Namen eingetragen, bei der Claude API Modell-IDs (Basis-URL `https://api.anthropic.com`, überschreibbar). Die Einstellungen des nicht gewählten Anbieters bleiben erhalten. Bei der Claude API springt für Sonnet und Opus 5.5 ein serverseitiger Fallback ein, wenn die Sicherheitsfilter eine Anfrage ablehnen (`fallbacks: "default"`); Foundry bietet das nicht.

**Datenschutz:** Nur beim Start einer Analyse gehen Daten an den gewählten KI-Anbieter (Microsoft Foundry oder Claude API), und nur, was auf der Allowlist steht (E12): Kapiteltext, Kapiteltitel, Namen und Aliase von Figuren und Orten, Existenz und Realitätsebene, Gruppennamen, Plan-Felder von Figuren und Kapitelplänen (Szene, „Was soll hier passieren?“). Nie: „Wahrheit hinter den Kulissen“, Notizen, Anmerkungen, Ideen, Abweichungen. Hosting und Region des Deployments sind egal; Leon akzeptiert die Verarbeitung in den USA. Ohne Netz funktioniert alles außer der KI-Prüfung.

## Grundsatzentscheidungen (E1–E16)

| # | Entscheidung | Grund |
| --- | --- | --- |
| E1 | Stabile IDs im Frontmatter (`id`), einmal aus dem Titel als Slug erzeugt, nie geändert. Dateiname = `<id>.md` ohne Nummer. Reihenfolge nur in `projekt.md`. Alle Verweise per ID. | Drag & Drop ohne Umbenennen, keine kaputten Links |
| E2 | SQLite ist nur Cache. Alles, was Leon entscheidet (`entscheidungen.json`), und alle bezahlten KI-Ergebnisse (`.plotwerk/`) liegen im Projektordner. | Index löschen ohne Verlust |
| E3 | Das Kapitel ist die Einheit. Optionaler Szenentrenner `* * *` auf eigener Zeile. | lesbar in Obsidian, später ausbaubar |
| E4 | Textanker = Zitat + bis zu 32 Zeichen davor/danach auf normalisiertem Klartext. Findet sich die Stelle nicht mehr eindeutig, gilt sie als „verwaist“, nie still falsch. Gilt für Anmerkungen, Hinweis-Zitate, Realitätsebene, Spuren. | übersteht Bearbeitung außerhalb der App |
| E5 | Namenserkennung mit Unicode-Wortgrenzen, automatisch Genitiv, dazu `formen` der Figur. „Ole“ trifft nicht „Oleander“. | deutsche Flexion |
| E6 | Normalisierung vor jedem Zitatvergleich: Anführungszeichen, Striche, Auslassungspunkte, Leerraum, Markdown-Auszeichnung, Unicode NFC. | sonst verwirft die Prüfung gültige Hinweise |
| E7 | Typografie nur beim Tippen; Import und Laden ändern keinen Text. | „identischer Text“ beim Import |
| E8 | Schnappschüsse beim Kapitelwechsel, spätestens alle 10 min bei Änderungen, beim Beenden, vor Wiederherstellen/Löschen, bei der ersten Eingabe in ein Kapitel pro Sitzung (falls der Stand noch nicht gesichert ist) und bevor eine von außen geänderte Fassung überschrieben wird. Ablage `.versionen/<pfad>/<YYYY-MM-DDTHH-mm-ss>.md`, in derselben Sekunde `…-2.md`. Aufbewahrung: 90 Tage alle, danach einer pro Woche (beim Öffnen des Projekts). | OneDrive-Last |
| E9 | Speichern atomar (temp + fsync + rename), 1,5 s nach der letzten Eingabe, bei Dauertippen spätestens 1,8 s nach der ersten ungespeicherten Eingabe; mit Schreibzeit liegt jede Eingabe nach höchstens 2 s auf der Platte. | Absturzsicherheit |
| E10 | Struktur-Hinweise lokal ohne KI (leeres Kapitel, Satzabbruch am Kapitelende, leere Überschrift beim Import, doppelte Leerzeichen). | schon in Phase 1 |
| E11 | KI-Aufruf im Rust-Kern, Schlüssel nur im Schlüsselbund. Prompt-Aufbau und Antwortprüfung in TypeScript (`core/ki`), das nur lesen kann. | Schlüssel und Schreibschutz |
| E12 | Allowlist für alles, was an das Modell geht (siehe Datenschutz). Plan-Felder freigegeben am 2026-10-09 (F-05). | private Felder können nicht durchrutschen |
| E13 | Ganzes Buch als gecachter Prefix (Prompt Caching) plus Aufgaben pro Kapitel; Ergebnis-Cache pro Kapitel-Text-Hash; Token-Schätzung über `count_tokens`. | findet kapitelübergreifende Widersprüche |
| E14 | Zwei Anbieter zur Wahl: Microsoft Foundry (Deployment-Namen) oder Claude API (Modell-IDs, serverseitiger Fallback bei Sonnet/Opus 5.5). Hosting/Region egal. Modelle Haiku/Sonnet/Opus 5.5. | Leons Vorgabe |
| E15 | Funktionsumfang als App-Einstellung (nie im Projektordner): Presets je Schreibertyp, eigene Presets, freie Auswahl. Ausgeblendet heißt nicht gelöscht – Daten bleiben im Projekt und im Export. Ohne Plan-Abgleich gehen keine Plan-Felder an die KI. | Einstieg für neue Nutzer, weniger Tokens |
| E16 | No-AI-Modus: alle KI-Funktionen ausgeblendet, der KI-Transport ist gesperrt (auch `count_tokens`). | Datenschutz, Arbeiten ohne Zugang |

## Datenmodell und Projektordner

Alles, was Leon schreibt oder entscheidet, und alle bezahlten KI-Ergebnisse liegen als Datei im Projektordner. Alles andere berechnet die App und kann es jederzeit neu aufbauen. Das Datenmodell steht in `core/model/types.ts` und wird nur additiv erweitert.

**Projektordner**

```
Hafenlichter/
├── projekt.md                 version, titel, kapitel[] (Reihenfolge), ki {endpoint, deployments, anbieter, claude {endpoint, modelle}}
├── manuskript/<id>.md         Frontmatter id, titel · Body: Markdown (Absätze, **fett**, *kursiv*, ## Überschrift, * * *)
├── plan/
│   ├── akte.md                akte[]: nummer, titel, quintessenz, wendepunkt, antagonisten[]
│   ├── straenge.md            straenge[]: id, name, farbe, gruppe
│   ├── ideen.md               ideen[]: id, titel, notiz, straenge[]
│   ├── motive.md              motive[]: id, name, aliase[]
│   └── kapitel/<id>.md        Kapitelplan (auch für ungeschriebene Kapitel) · Body: „Was soll hier passieren?“
├── figuren/<id>.md            Figur · Body: „## Wahrheit hinter den Kulissen“, „## Notizen“ (privat)
├── gruppen/<id>.md            Gruppe (Antagonisten u. a.) · Body: „## Notizen“ (privat)
├── orte/<id>.md               Ort · Body: Beschreibung, „## Notizen“ (privat)
├── anmerkungen.json           Notizen an Textstellen (Anker, Notiz, Ziel)
├── entscheidungen.json        Schreibweisen, Hinweis-Entscheidungen, KI-Zuordnungen, Fäden, eigene Zusammenfassungen, Realitätsebene von Textstellen
├── .plotwerk/
│   ├── analysen/<id>.json     KI: Zusammenfassung, Kurzfassung, Wendung, Antagonisten-Bezug, lose Enden, Text-Hash
│   └── hinweise.json          KI-Hinweise
└── .versionen/<pfad>/<zeit>.md  Schnappschüsse
```

YAML-Frontmatter mit zwei Leerzeichen Einrückung, Schlüssel in fester Reihenfolge. Unbekannte Felder bleiben beim Speichern erhalten (Obsidian). Im Ordner liegen nur `.md`- und `.json`-Dateien.

**Beispiel Figur** (`figuren/die-fremde.md`)

```markdown
---
id: die-fremde
name: Die Fremde
aliase: []
rolle: neben                  # haupt | neben
existenz: bewusst_vage        # gesichert | offen | bewusst_vage
gruppe: null
beziehungen:
  - zu: paul
    art: eine Nacht im Fährhaus
    abKapitel: bis-bald       # Bezeichnung gilt ab diesem Kapitel (Zeitregler)
    kategorie: dates          # arbeit | dates | sonstige
    strang: postkarten
    unsicher: true            # gestrichelt
plan:
  Aussehen: ""                # freie Felder „Deine Planung“
---

## Wahrheit hinter den Kulissen
Nur für Leon, erscheint nie im Text und nie in einer Analyse.

## Notizen
```

**Beispiel Kapitelplan** (`plan/kapitel/ebbe.md`)

```markdown
---
id: ebbe
titel: Ebbe
akt: 2
status: geschrieben           # geplant | entwurf | geschrieben
szene: Der Abend mit Vera endet
straenge: [begegnungen, schlaflos]
figuren: [paul, vera]
orte: []
abweichungen:                 # id, notiz, entscheidung, datum, alterPlan
  - id: wahrheit-an-vera
    notiz: Paul schreibt Vera am Ende doch die Wahrheit.
    entscheidung: alternative # plan_anpassen | alternative | spaeter
    datum: 2026-10-05
    alterPlan: Paul beendet den Abend mit einer Ausrede …
realitaet:                    # Ereignisse/Stellen mit Realitätsebene, optional mit Textanker
  - id: alter-mann
    text: Der alte Mann am Kai
    stufe: offen
---
Was soll hier passieren?
```

**Gruppen** (`gruppen/nordhaven.md`, `gruppen/konsortium.md`): Typ (Antagonist, Firma, Familie, Sonstige), Status (im Text oder geplant), Mitglieder, Strang, Präsenz pro Akt, mögliche Spuren im Text (Vorschlag, bestätigt, verworfen).

**SQLite-Index** (`~/Library/Application Support/app.plotwerk.mac/plotwerk-index.db`, nur Cache)

- `erwaehnungen`: Figur oder Ort, Kapitel, Absatz, Position, Art (Auftritt, erwähnt, per Nachricht), Quelle (exakt oder KI), bestätigt
- `hinweise`: lokale und KI-Hinweise mit angewendeten Entscheidungen
- `faeden`: lose Enden mit „eröffnet in“ und „zuletzt aufgegriffen in“
- `index_cache`: Wortzahlen, Text-Hashes, erste Vorkommen

Ändert sich der Hash eines Kapitels, wird nur dieses Kapitel neu erkannt. Wird der Index gelöscht, baut ihn der nächste Start aus dem Projektordner identisch wieder auf.

## Funktionen: Schreiben

Geschrieben wird direkt in der App. Die Word-Datei wird einmal importiert, danach ist der Projektordner die Quelle. Referenz-Screen: `docs/design/screens/Schreiben.dc.html`.

| ID | Anforderung | Priorität |
| --- | --- | --- |
| S-01 | Kapitelliste links mit Status (geschrieben, Entwurf, geplant) und Wortzahl; Klick öffnet das Kapitel; Reihenfolge per Drag & Drop (Maus und Tastatur) | Muss |
| S-02 | Ablenkungsfreier Editor mit Fett, Kursiv, Überschrift, Absatz (Blase über markiertem Text: F, K, Ü; ⌘B, ⌘I, ⌘⌥2, ⌘⌥0); Fokus-Modus blendet beide Seitenleisten aus | Muss |
| S-03 | Deutsche Typografie beim Tippen: „ “ und ‚ ‘, Gedankenstrich (auch aus „ - “), Auslassungspunkte; ⌘Z nimmt die Ersetzung zurück; Rechtschreibprüfung von macOS | Muss |
| S-04 | Automatisches Speichern (E9); Schnappschüsse in `.versionen/` (E8); Versionsverlauf mit Wortvergleich und Wiederherstellen | Muss |
| S-05 | Wortzahl für Kapitel und gesamtes Buch in der Statusleiste | Muss |
| S-06 | Anmerkungen: Textstelle markieren, Notiz anlegen und an Figur, Ort, Kapitel oder Plan-Karte heften. Die Notiz steht am Rand, erscheint auch beim Ziel (Figurenkarte, Ortskarte, Kapitel-Inspektor im Akt-Board), springt per Klick zur Stelle und wandert mit, wenn der Text sich ändert (E4) | Muss |
| S-07 | Verweise mit `[[`: Vorschläge aus Figuren, Orten, Kapiteln, Plan-Karten und Ideen; Klick öffnet das Ziel. Gilt für Notizen und Plan-Felder, nicht für den Manuskripttext selbst | Muss |
| S-08 | Plan-Panel rechts zeigt die geplante Szene zum offenen Kapitel: Strang, Figuren, Ort, Plan-Notiz | Muss |
| S-09 | Knopf „Ich weiche hier ab“: kurze Notiz plus Entscheidung (Plan anpassen, als Alternative merken, später entscheiden). Die Abweichung erscheint am Kapitel und im Akt-Board; der alte Plan bleibt erhalten | Muss |
| S-10 | Tab „Erkannt“: Figuren, Orte und Motive des Kapitels, live aktualisiert. Motive legt Leon im Tab an (`plan/motive.md`); Klick zeigt die erste Stelle. Figuren sind im Text dezent unterstrichen; ⌘-Klick oder Klick auf den Chip öffnet ihre Karte | Soll |
| S-11 | Import .docx: Kapitel anhand von Überschrift 1 trennen, Fett und Kursiv übernehmen, Text unverändert (E7), leere Kapitel behalten, Vorschau mit Struktur-Hinweisen vor der Übernahme | Muss |
| S-12 | Export als .docx und PDF für das ganze Buch oder eine Auswahl, ohne Anmerkungen und Markierungen; Kapitel als Überschrift 1 | Muss |
| S-13 | Tab „Hinweise“ im Editor: Hinweise zu diesem Kapitel; Klick markiert die betroffene Stelle; „Ist Absicht“ und „Erledigt“ direkt im Tab | Soll |
| S-14 | Figur oder Ort in einem eigenen Fenster öffnen | Kann |

## Funktionen: Planung

Die Planung ist die zweite Ebene neben dem Text. Referenz-Screens: `Akte.dc.html`, `Kapitel.dc.html`, `Figur.dc.html`, `Beziehungen.dc.html`.

| ID | Bereich | Anforderung | Priorität |
| --- | --- | --- | --- |
| P-01 | Akte | Board mit einer Spalte pro Akt und einer Ideen-Ablage; Kapitelkarten per Drag & Drop zwischen Akten und in der Reihenfolge verschieben | Muss |
| P-02 | Akte | Kopfkarte pro Akt mit Quintessenz, Wendepunkt zum nächsten Akt und aktiven Antagonisten, frei bearbeitbar | Muss |
| P-03 | Akte | Kartenstatus sichtbar: geschrieben, Entwurf, geplant (gestrichelt), weicht vom Plan ab (Akzentkante und Anzahl) | Muss |
| P-04 | Akte | Kapitel vorab planen: Titel, Strang, Figuren, Ort, „Was soll hier passieren?“, Kontext aus den Nachbarkapiteln, Knopf „Mit dem Schreiben beginnen“ | Muss |
| P-05 | Akte | Umschalter „Nur Plan“ und „Plan + Text“ | Soll |
| P-06 | Akte | Ideen-Ablage: lose Karten ohne festen Platz, später in einen Akt ziehbar | Muss |
| K-01 | Kapitel-Überblick | Kapitelwahl; pro Kapitel Zusammenfassung, Wendung, Antagonisten-Bezug und „Bis hierhin passiert“ | Muss |
| K-02 | Kapitel-Überblick | Lose Enden bis zu diesem Kapitel mit „eröffnet in“ und „zuletzt aufgegriffen in“; Fäden, die seit 3 oder mehr Kapiteln ruhen, hervorgehoben; als erledigt oder bewusst offen markierbar | Muss |
| K-03 | Kapitel-Überblick | Zusammenfassungen erzeugt die KI aus dem Kapiteltext. Leon kann sie bearbeiten; bearbeitete Fassungen werden nie überschrieben, nur als veraltet markiert, wenn sich der Text ändert | Muss |
| K-04 | Kapitel-Überblick | Realitätsebene pro Kapitel: Ereignisse (Freitext) und Textstellen (im Editor markiert, Blase → „Ebene“), Stufe umschaltbar | Muss |
| F-01 | Figuren | Liste in Bereichen: Hauptfiguren, Nebenfiguren, Realität offen, geplant (noch nicht im Text) | Muss |
| F-02 | Figuren | Figurenkarte trennt „Aus dem Text“ (nur lesen, jede Angabe mit Kapitelbeleg) und „Deine Planung“ (freie Felder, eigene Felder hinzufügbar) | Muss |
| F-03 | Figuren | Existenz pro Figur: gesichert, noch offen, bewusst vage; dazu das Feld „Wahrheit hinter den Kulissen“, nur für Leon | Muss |
| F-04 | Figuren | Notizen, Auftritte als Kapitelstreifen (tritt auf, nur erwähnt oder per Nachricht), Beziehungen | Muss |
| F-05 | Figuren | Hinweis, wenn ein Plan-Feld dem Text widerspricht, außer die Figur oder Stelle ist bewusst vage. Umgesetzt: Die Prüfung vergleicht Plan-Felder von Figuren und Kapitelplänen mit dem Text und meldet Widersprüche als „Prüfen“ mit Plan-Bezug (Figur/Kapitel, Feld); die Figurenkarte zeigt sie mit Etikett „Plan“ | Soll |
| F-06 | Figuren | Figur vorab anlegen, bevor sie im Text vorkommt | Muss |
| O-01 | Orte | Liste mit Kapiteln, Belegen aus dem Text, Beschreibung, Notizen; Unterorte (Zeichensaal im Büro) | Muss |
| O-02 | Orte | Schreibweisen zusammenführen und die gültige festlegen | Muss |
| O-03 | Orte | Weg einer Figur (z. B. „Pauls Weg“): Ortsfolge über alle Kapitel | Soll |
| B-01 | Beziehungen | Netz mit Figuren als Karten, Beziehungen als beschriftete Linien, Gruppen als Flächen | Muss |
| B-02 | Beziehungen | Zeitregler nach Akt oder Kapitel: zeigt nur, was der Leser bis dahin weiß. Figuren erscheinen ab ihrem ersten Vorkommen, Bezeichnungen gelten ab `abKapitel` | Muss |
| B-03 | Beziehungen | Gestrichelt: nur erwähnt oder Existenz unsicher; Filter Arbeit, Dates, Sonstige | Muss |
| B-04 | Beziehungen | Beziehung per Drag von Karte zu Karte anlegen; Inspektor mit Art, Strang, Belegen aus dem Text und Notiz | Soll |
| A-01 | Antagonisten | Zwei Antagonisten als Gruppen: Nordhaven (im Text über Herrn Kessler und den Aufsichtsrat) und das Konsortium (geplant) | Muss |
| A-02 | Antagonisten | Pro Gruppe Mitglieder, Präsenz pro Akt und Kapitel und mögliche Spuren im Text als Vorschlag (z. B. »Kranich«), die Leon bestätigt oder verwirft | Muss |
| A-03 | Antagonisten | Antagonisten erscheinen als eigene Stränge im Akt-Board und im Kapitel-Überblick | Muss |

## Funktionen: Werkzeuge (G1–G8)

Seit 10. Oktober 2026. Alles, was Leon festlegt, liegt als Markdown oder JSON im Projektordner; bezahlte KI-Ergebnisse unter `.plotwerk/`. Für alle KI-Werkzeuge gelten die harten Regeln unten: wörtliches Zitat (E6), kein Ersatztext, Allowlist E12, Leon entscheidet jeden Vorschlag einzeln.

| ID | Bereich | Anforderung | Prio |
| --- | --- | --- | --- |
| Z-01 | Zeitleiste | Kapitel und geplante Szenen auf einer Tagesachse (Tag, Wochentag, Datum, Tageszeit, Uhrzeit, Dauer, Sicherheit gesichert/vage/offen, wörtlicher Beleg); Lücken als „+n Tage“, Karten ohne Tag in „Abstand unbekannt“ | Soll |
| Z-02 | Zeitleiste | Zustandsspur je Figur (frei benannte Zustände mit Farbe, z. B. ausgeruht, betrunken) und Ortsspur | Soll |
| Z-03 | Zeitleiste | Lokale Zeitprüfung ohne KI: Wochentag/Datum/Tag passen nicht zusammen, Zeitsprung zurück, Überschneidung, Szene vor ihrem Kapitel; Rückblenden (Tag ≤ 0) und offene Platzhalter werden nicht gemeldet | Soll |
| Z-04 | Zeitleiste | KI schlägt Zeitpunkte und Zustände mit Beleg vor; nichts wird automatisch übernommen | Kann |
| PS-01 | Fäden | Board mit Spalten Offen, Auflösung geplant, Erledigt, Bewusst offen; Warnung bei ruhenden Fäden und überschrittenem Auflösungskapitel; eigene Fäden anlegen | Soll |
| PS-02 | Akte planen | Strang-Raster (Stränge × Kapitel) mit Lücken; Klick nimmt einen Strang in den Kapitelplan auf | Soll |
| PS-03 | Szenen | Szenen über die Trenner `* * *`: Plan je Szene (Titel, Ort, Figuren, Zeit, Notiz) im Schreiben-Inspektor und im Kapitel-Überblick; der Kapiteltext wird nie verändert | Soll |
| FB-01 | Figuren | Figuren-Bögen: frei benannte Stufen je Kapitel oder Akt mit wörtlichen Belegen, Auftritte als Linie, Vergleich mehrerer Figuren | Soll |
| FB-02 | Figuren | Figurenstimme: KI vergleicht die Rede einer Figur mit ihren typischen Stellen; Ergebnis mit auffälliger und typischer Stelle, beide wörtlich; erscheint auch als Hinweis „Sprache“ | Kann |
| EW-01 | Editor | Typewriter-Modus: Cursorzeile mittig, übrige Absätze abgedunkelt | Kann |
| EW-02 | Editor | Wiederholungen markieren (gleiches Wort in kurzer Distanz, gleiche Satzanfänge, häufigste Wörter); nie korrigieren | Kann |
| EW-03 | Editor | Vorlesen mit der Sprachausgabe des Systems, Satz für Satz mit Markierung, Stimme und Tempo wählbar | Kann |
| EW-04 | Editor | Markennamen-Liste fürs Lektorat (Vorkommen, uneinheitliche Schreibweisen, Vorschläge, Export Markdown/CSV) | Kann |
| VS-01 | Statistik | Tagesstatistik mit Zählregel (Löschen zieht nichts ab, Verschieben zählt nicht doppelt), Tagesziel in der Statusleiste, Serie, Kalender, Zielumfang und Abgabedatum | Soll |
| VS-02 | Versionen | Benannte Fassungen (ganzes Buch, Kapitel oder Auswahl); ihre Schnappschüsse löscht die Aufbewahrung nie; wiederherstellen mit Rückfrage | Soll |
| VS-03 | Versionen | Zwei Fassungen nebeneinander vergleichen (Wortvergleich, synchrones Scrollen, Sprung zur nächsten Änderung) | Soll |
| KL-01 | KI-Leser | Leser-Simulation: Was weiß eine Erstleserin nach Kapitel n (nur Kapitel 1–n gehen an das Modell), offene Fragen, Vermutungen, Spannung, Abgleich mit Leons Kapitelplänen; veraltet, wenn sich Text oder Plan ändert | Kann |
| KL-02 | KI-Leser | Fragen an das Buch: Antworten nur mit Belegstellen; „steht nicht im Buch“ und „Beleg verworfen“ sind unterscheidbar; Schreibaufträge lehnt die App ab | Kann |
| AB-01 | Abgabe | Normseite (.docx, 30 × 60, Courier New 12 pt) mit Seitenzahl vorab | Soll |
| AB-02 | Abgabe | Exposé-Vorlage (.docx/.md) aus Eckdaten, Akten, Figuren; nur von Leon freigegebene Texte | Kann |
| AB-03 | Abgabe | EPUB 3 mit Satz wie die Buch-Vorschau | Kann |
| AB-04 | Abgabe | Lektoratsmappe (PDF) mit offenen Hinweisen | Kann |
| AB-05 | Abgabe | Rückimport aus Word: Kommentare als Anmerkungen, nachverfolgte Änderungen einzeln annehmen/ablehnen (vorher Schnappschuss); offene Änderungen im Editor markiert | Soll |
| RC-01 | Recherche | Bilder, Links und Notizen ablegen (Ziehen, Einfügen, Dialog), Bilder nach `recherche/dateien/`; Links werden nie geladen, nur auf Klick im Browser geöffnet | Soll |
| RC-02 | Recherche | Einträge an Figur, Ort, Kapitel oder Szene heften; Recherche-Leiste auf Figurenkarte, Ortskarte, Kapitel-Überblick, Schreiben-Inspektor und Szenen-Formular | Soll |
| RC-03 | Recherche | Filter nach Art, Ziel, Schlagwort, Suche; Raster oder Liste | Soll |
| MAC-01 | Mac | Ad-hoc-Signatur im Build; Skript für Developer-ID-Signatur und Notarisierung (`scripts/notarisieren.sh`), Anleitung `docs/mac-verteilung.md` | Soll |
| MAC-02 | Mac | Updater-Vorlage (nicht aktiv) | Kann |

## Funktionsumfang und Einrichtung (E15/E16)

Seit 13. Oktober 2026. Plotwerk hat alle Funktionen an Bord, zeigt aber nur, was zum Schreibertyp passt. Die Auswahl
gilt für die App (alle Projekte), nicht für ein Projekt. Logik: `core/funktionen`.

| ID | Anforderung | Prio |
| --- | --- | --- |
| FU-01 | Beim ersten Start führt ein Assistent durch die Einrichtung: Schreibertyp → Funktionen → mit oder ohne KI → Fertig. Überspringen zeigt alles. Bestehende Nutzer (schon ein Projekt geöffnet) sehen ihn nicht und behalten alles. | Soll |
| FU-02 | Schreibertypen als Presets: Anfänger („Ich schreibe meine erste Geschichte“), Mittel („ein paar Geschichten geschrieben“), Profi („viele Geschichten veröffentlicht, z. B. auf Wattpad“), Schriftsteller („verkaufe bereits Bücher“) sowie „Alles selbst einstellen“. Jede Stufe enthält die vorige. | Soll |
| FU-03 | Die Funktionsauswahl zeigt jede Funktion mit Kurzbeschreibung, Abhängigkeiten („braucht Figuren“), KI-Kennzeichen mit Modellgröße und einem Beispiel aus dem Demo-Roman; Abhängigkeiten werden beim Ein- und Ausschalten aufgelöst. | Soll |
| FU-04 | Die aktuelle Auswahl lässt sich unter einem Namen als eigenes Preset speichern, später wählen und löschen. | Soll |
| FU-05 | Ausgeblendete Funktionen fehlen in Seitenleiste, Schnellsuche, Titelleisten und Inspektoren. Ruft man sie über Menü, Tastenkürzel oder Verweis auf, fragt die App, ob sie sie einblenden soll. Daten bleiben erhalten. | Soll |
| FU-06 | Einstellungen (⌘,) → Funktionen: aktueller Umfang, „Funktionen anpassen …“ (Ausgangspunkt, Auswahl, KI) und „Einrichtung erneut starten“. | Soll |
| FU-07 | KI-Umfang: Ausgeblendete KI-Funktionen laufen nie; ohne Plan-Abgleich enthält der Buchkontext der Prüfung keine Plan-Felder (weniger Tokens). Anzeige der KI-Nutzung als gering/mittel/hoch. | Soll |
| FU-08 | No-AI-Modus: blendet alle KI-Funktionen aus und sperrt den Transport. Vor dem Einschalten nennt die App konkret, welche gewählten Funktionen wegfallen; lokale Hinweise (Struktur, Zeit, Schreibweisen) bleiben. | Soll |

## Erkennung und KI-Prüfung

Die exakte Erkennung läuft lokal bei jeder Änderung. Die KI-Prüfung startet Leon bewusst per Knopf, für ein Kapitel oder das ganze Buch.

**Ablauf**

1. Beim Tippen und Speichern: exakte Suche nach Namen und Aliasen aus Figuren und Orten (E5) sowie nach Motiven, mit Wortgrenzen („Ole“ trifft nicht „Oleander“).
2. Per Knopf im Tab „Erkannt“: die KI (Haiku) schlägt indirekte Erwähnungen und unbekannte Namen vor, etwa „der Hafenmeister“ oder »Fiete«. Leon bestätigt, ordnet zu oder verwirft per Klick.
3. Prüfung per Knopf (Sonnet, optional Opus als Tiefencheck): Das Buch geht als gecachter Prefix mit, je Kapitel eine Aufgabe (E13). Vorher zeigt die App die geschätzten Tokens.
4. Im selben Lauf entstehen Zusammenfassung, Kurzfassung, Wendung, Antagonisten-Bezug und lose Enden pro Kapitel (`.plotwerk/analysen/`).
5. Leon entscheidet pro Hinweis: Stelle öffnen, „Ist Absicht“ oder „Erledigt“. Entscheidungen stehen in `entscheidungen.json` und werden nicht erneut gemeldet.

**Hinweis-Typen** (Beispiele aus dem aktuellen Manuskript)

| Typ | Quelle | Beispiel |
| --- | --- | --- |
| Prüfen | KI | Lotte am Lindenhof: in Kap. 3 mit dem Saab und zu spät, in Kap. 9 im Volvo und zu früh |
| Schreibweise | lokal | »Lindenhof«, »Linden Hof«, »Linden-Hof«; »Karl Hansen« und »Carl Hansen« |
| Offener Faden | KI | Wer steckt die zweite Postkarte in Pauls Mantel (Kap. 8 und 10)? |
| Unbekannt | KI | »Fiete« in Kap. 10 ist keiner Figur zugeordnet |
| Struktur | lokal (E10) | Kap. 4 ohne Text, Kap. 9 endet mitten im Satz, leere Überschrift am Ende (Import) |
| Zeitleiste | KI und lokal (Z-03) | Nur Montag (Kap. 6) und Donnerstag (Kap. 10) sind verankert; lokal: Kap. 10 ist als Donnerstag eingetragen, Tag 9 wäre aber ein Dienstag |
| Sprache (Kann) | KI | Wechsel zwischen Präsens und Präteritum, großgeschriebenes „Sie“ für die dritte Person; Figurenstimme (FB-02); nur markieren, nie korrigieren |

Jeder Hinweis hat mindestens ein Zitat, das wörtlich im Text steht. Einzige Ausnahme: „Kap. n ohne Text“.

**Realitätsebene**

Jedes Ereignis, jede Textstelle und jede Figur kann eine von drei Stufen tragen. Textstellen markiert Leon im Editor (Blase → „Ebene“); sie sind im Text gestrichelt unterstrichen und stehen im Kapitel-Überblick.

| Stufe | Bedeutung | Verhalten der Prüfung |
| --- | --- | --- |
| gesichert | ist in der Geschichte wirklich so | normal geprüft |
| noch offen | Leon hat sich noch nicht entschieden | geprüft; Hinweise tragen das Etikett „offen“; Erinnerung im Kapitel-Überblick |
| bewusst vage | Mehrdeutigkeit ist gewollt | nie als Widerspruch gemeldet; Zusammenfassungen formulieren neutral („Paul glaubt …“) |

**Harte Regeln für die Umsetzung**

- Das KI-Modul (`core/ki`) bekommt nur eine lesende Schnittstelle auf Manuskript und Plan; der Rust-Teil der KI hat keinen Dateizugriff. Schreiben in Manuskriptdateien ist ausschließlich dem Editor erlaubt. Automatische Tests prüfen Importe, einen vollen Lauf gegen ein Dateisystem, das jeden Schreibversuch ablehnt, und die Rust-Quellen.
- Das Modell antwortet in einem festen JSON-Schema: Typ, Titel, Zitate (Kapitel plus wörtlicher Text), Erklärung. Es gibt kein Feld für Ersatztext; Antworten mit Formulierungsvorschlägen („stattdessen“, „besser:“ …) werden verworfen.
- Jedes Zitat wird nach der Normalisierung (E6) gegen den Text geprüft. Ist es dort nicht wörtlich zu finden, wird der Hinweis verworfen.
- „Wahrheit hinter den Kulissen“ und private Notizen gehen nie an das Modell (E12). Die Prüfung liest das Buch so, wie ein Leser es liest, und bekommt zusätzlich die Plan-Felder von Figuren und Kapiteln, ausdrücklich als Planung gekennzeichnet.
- Als bewusst vage markierte Figuren und Stellen werden dem Modell als absichtlich mehrdeutig mitgegeben; „prüfen“-Hinweise dazu werden verworfen.
- Ergebnisse werden pro Kapitel-Text-Hash zwischengespeichert (`.plotwerk/`). Vor einer Prüfung des ganzen Buchs zeigt die App die geschätzten Tokens.

## Design

Verbindliche Vorlage sind die Mac-Screens in `docs/design/screens/*.dc.html` (Schreiben, Figurenkarte, Akte planen, Beziehungsnetz, Kapitel-Überblick). Maße, Farben, Schriftgrößen und Radien werden exakt übernommen, Farben nur über die Tokens in `src/theme/tokens.css`.

**Fensteraufbau**

- Referenzgröße 1440 × 900 px, Mindestgröße 1100 × 700 px
- Titelleiste 52 px: Ampel-Knöpfe, Projektname, aktueller Kontext, Aktionen rechts
- Seitenleiste links 230 px: Schreiben, Kapitel-Überblick, Akte planen, Figuren, Beziehungen, Orte, Hinweise (mit Zähler); im Bereich Schreiben darunter die Kapitelliste
- Inhalt in der Mitte; Inspektor rechts 300 bis 350 px für das ausgewählte Element
- macOS-Konventionen: Werkzeuge in der Titelleiste, Segment-Umschalter, natives Menü, dichte Abstände für Maus und Tastatur

**Farben**

| Token | Wert | Verwendung |
| --- | --- | --- |
| ink | #24262B | Text, primäre Knöpfe |
| ink-quiet | #6E6A63 | Labels, Nebentext |
| surface | #FFFFFF | Fenster, Karten, Editor |
| sidebar | #F4F2EF | Seitenleiste |
| titlebar | #EFEDEA | Titelleiste |
| canvas | #F6F4F1 | Hintergrund von Boards und Netz |
| line | #DAD6CF / #E2DED7 | Trennlinien, Kartenränder |
| selected | #E3DFD9 | aktiver Eintrag in der Seitenleiste |
| accent | #C2405C | Auswahl, Abweichung, Zähler, Anmerkung an Figur |
| strang-arbeit | #3D5A75 | Arbeit und Antagonisten |
| strang-dates | #C2405C | Dates und Begegnungen |
| strang-warm | #A86A12 | Strang in Ocker |
| strang-violett | #6A4C9C | Strang in Violett |
| strang-organisation | #4A4A4F | Antagonist Konsortium |
| real-gesichert | #2F6B45 | Realitätsebene gesichert |
| real-offen | #A86A12 | Realitätsebene noch offen |
| real-vage | #6A4C9C | Realitätsebene bewusst vage |

Weitere abgeleitete Tokens (Flächen, Linien, Dunkelmodus) stehen mit Herkunft in `src/theme/tokens.css`.

**Schrift**

- Oberfläche: Systemschrift (SF Pro), 13 px Standard, 11 bis 12 px für Labels
- Überschriften: Instrument Serif, 24 bis 40 px
- Manuskript: Newsreader, 17 bis 18 px, Zeilenhöhe 1,65, Textspalte rund 530 px breit

**Formen und Muster**

- Radien: 6 px Knöpfe, 8 bis 10 px Karten, 12 px Fenster und große Panels; Chips voll gerundet
- Gestrichelte Ränder bedeuten geplant, nur erwähnt oder Existenz unsicher
- Eine Akzentkante links an einer Karte bedeutet: weicht vom Plan ab
- Anmerkungen im Text als farbige Hinterlegung, Figuren dezent unterstrichen, Stellen mit Realitätsebene gestrichelt in der Farbe der Stufe
- Dunkelmodus (Soll): alle Farben als Tokens, Dunkelwerte in `tokens.css`

**Tastenkürzel (Soll):** ⌘1 bis ⌘7 für die Bereiche, ⌘8 Zeitleiste, ⌘9 Fäden, ⌘0 Recherche, ⌘K Schnellsuche über Figuren, Orte, Kapitel und Befehle, ⌘⇧F Fokus-Modus, ⌘⇧T Typewriter, ⌘⇧B Buch-Vorschau, ⌘⇧S Fassung sichern, ⌘E Export, ⌘O Projekt öffnen, ⌘, Einstellungen; im Editor ⌘B, ⌘I, ⌘⌥2 (Überschrift), ⌘⌥0 (Absatz). Statistik und Fragen haben keine eigene Taste (Seitenleiste, Menü, Schnellsuche).

## Umsetzung in Phasen

Jede Phase liefert eine benutzbare App und endet mit einer Abnahme am echten Manuskript. Die KI kommt bewusst zuletzt, weil Erkennung und Datenmodell vorher stimmen müssen. Stand der Abnahme: `docs/abnahme.md`.

| Phase | Inhalt | Anforderungen | Abnahme | Stand |
| --- | --- | --- | --- | --- |
| 1 Schreiben | Projektordner, Editor, Typografie, Autosave, Versionen, Kapitelliste, Wortzahl, Import/Export, Struktur-Hinweise | S-01–S-05, S-11, S-12, E1–E10 | Import von Leons Manuskript (.docx) → 10 Kapitel mit identischem Text; Export unterscheidet sich nur in der Formatierung; höchstens 2 s Verlust nach Absturz; Ordner ohne App lesbar | umgesetzt, abgenommen |
| 2 Planen | Akt-Board, Ideen, Kapitelplan, Plan-Panel, Abweichungen, Figuren, Orte, Anmerkungen, `[[`-Verweise | P-*, F-01–F-04, F-06, O-01, O-02, S-06–S-09 | echtes Manuskript in Akte einteilen, Figuren anlegen, Notizen anheften; alles bleibt nach Neustart | umgesetzt, abgenommen |
| 3 Erkennen | exakte Erkennung, Tab „Erkannt“ mit Motiven, Beziehungsnetz mit Zeitregler, Antagonisten, Kapitel-Überblick ohne KI, Weg einer Figur | S-10, B-*, A-*, K-01, K-02, K-04, O-03 | Zeitregler Akt I ohne Vera und die Fremde; Index löschen ohne Verlust | umgesetzt, abgenommen |
| 4 Prüfen | KI-Vorschläge (Haiku), Prüfung + Zusammenfassungen (Sonnet), Hinweise-Ansicht, Tab „Hinweise“, Tiefencheck (Opus) | K-03, F-05, S-13, Hinweis-Typen | KI kann nicht schreiben (Test); jeder Hinweis mit wörtlichem Zitat; bewusst vage → kein Widerspruch; Prüfung findet die Mockup-Hinweise | umgesetzt mit Demo-KI; Live-Test gegen Foundry offen |
| 5 Werkzeuge | Zeitleiste, Fäden, Szenen, Bögen, Figurenstimme, Editor-Werkzeuge, Statistik und Fassungen, KI-Leser, Abgabe, Recherche, Mac-Verteilung | Z-*, PS-*, FB-*, EW-*, VS-*, KL-*, AB-*, RC-*, MAC-* | Tests je Werkzeug, Browser-Durchlauf hell/dunkel, Debug-Build | umgesetzt (Demo-KI); Live-Test der KI-Werkzeuge offen |

**Akzeptanzkriterien** (automatisch geprüft in `abnahme/akzeptanz.test.tsx`)

- [x] Import von Leons Manuskript (.docx) ergibt 10 Kapitel mit identischem Text; die leere Schlussüberschrift wird als Hinweis gemeldet
- [x] Ein Export nach .docx unterscheidet sich vom Text in der App nur in der Formatierung
- [x] Nach Absturz oder Stromausfall gehen höchstens die letzten 2 Sekunden verloren
- [x] Der Projektordner ist ohne App lesbar, etwa in Obsidian oder VS Code
- [x] Nach Löschen des SQLite-Index baut ein Neustart alle Auswertungen ohne Verlust wieder auf
- [x] Ein automatischer Test belegt, dass die KI-Komponente keine Manuskriptdatei schreiben kann
- [x] Jeder Hinweis enthält mindestens ein Zitat, das wörtlich im Text steht
- [x] Eine als bewusst vage markierte Stelle erzeugt keinen Widerspruchs-Hinweis
- [x] Der Beziehungs-Zeitregler auf Akt I zeigt weder Vera noch die Fremde
- [ ] Die Prüfung findet die Hinweise aus dem Mockup: Lindenhof-Schreibweisen, »Fiete«, Satzende in Kap. 9, zweite Postkarte – lokal sicher, KI-Anteile bisher nur mit der Demo-KI belegt

## Nicht-Ziele und offene Punkte

**Nicht-Ziele**

- Keine Web-, iPad- oder Windows-Version; Geräteübergreifend nur über den OneDrive-Ordner
- Kein Seitenlayout oder Buchsatz für den Druck; das übernehmen Lektorat und Verlag. Normseite, Exposé-Vorlage, EPUB und Lektoratsmappe sind Abgabeformate, kein Satz
- Kein iPhone-Begleiter: bräuchte ein vollständiges Xcode-Projekt und eine Synchronisation über den Projektordner hinaus
- Keine KI-Textgenerierung, kein Umschreiben, keine Stilvorschläge
- Keine Mehrbenutzer-Funktionen und keine Kommentare von Dritten

**Offene Punkte**

- [ ] Endgültiger Name der App (Plotwerk ist Arbeitstitel)
- [ ] Akt-Grenzen, Quintessenzen und Wendepunkte schreibt Leon selbst; die Werte im Demo-Projekt sind Vorschläge
- [ ] Name, Mitglieder und erste Szene des Konsortiums
- [ ] Azure Foundry: Abo und Deployments für Haiku, Sonnet und Opus 5.5 anlegen, in den Einstellungen eintragen, erste Prüfung live laufen lassen (Region ist entschieden: egal) – alternativ Claude API: Schlüssel in den Einstellungen hinterlegen und erste Prüfung live laufen lassen
- [x] F-05: Plan-Felder von Figuren und Kapitelplänen dürfen an das Modell (Leon, 2026-10-09); Wahrheit und Notizen bleiben gesperrt
- [ ] Sprach-Hinweise (Tempus, „Sie“) sind als Kann umgesetzt; behalten oder abschalten?
- [ ] S-14: Figur oder Ort im eigenen Fenster (Kann) – noch nicht umgesetzt
- [ ] Word-Kommentare beim Import (im echten Manuskript 11 Stück) werden nicht übernommen; als Anmerkungen übernehmen?
- [ ] Mac-App: signieren und notarisieren; Beenden über Dock/Abmelden legt keinen Schnappschuss an (Text ist trotzdem gesichert)
- [x] Aufbewahrung der Schnappschüsse: 90 Tage alle, danach einer pro Woche (E8)
- [x] Kleinste Einheit: das Kapitel, mit optionalem Szenentrenner `* * *` (E3)
- [x] Datenschutz/Region: egal (E14)
- [x] Zustands-Aufgabe (Z-04): Die Namen der Zustandsarten (z. B. „ausgeruht“, „betrunken“) gehen als Antwortvokabular an das Modell; nur die Namen, keine eingetragenen Zustände (Leon, 2026-10-11; E12-Nachtrag in `docs/architektur.md`)
- [ ] Mac-App: Developer-ID-Zertifikat und Notarisierung mit Leons Zugangsdaten (`scripts/notarisieren.sh`); bisher nur ad-hoc signiert
- [ ] EPUB mit `epubcheck` prüfen (Werkzeug lokal nicht installiert)
