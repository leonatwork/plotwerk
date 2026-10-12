# Plotwerk – Anforderungen Story-App (Mac)

Oct 9, 2026 · @Leon Machnik

## Ziel und Leitprinzipien

Plotwerk (Arbeitstitel) ist eine lokale Mac-App, in der Leon seinen Roman schreibt, plant und auf Stimmigkeit prüfen lässt. Die KI liest dabei nur mit und verändert nie den Text.

Nutzer ist eine Person. Zum Start verwaltet die App ein Projekt; die Ordnerstruktur ist so angelegt, dass weitere Projekte ohne Umbau möglich sind.

**Leitprinzipien**

- **Lokal zuerst:** Alle Daten liegen in einem Projektordner auf dem Mac. Kein Server, kein Login. Die einzige Netzverbindung ist die KI-Analyse über Azure Foundry.
- **Die KI schreibt nie:** Sie hat keinen Schreibzugriff auf das Manuskript und liefert weder Ersatztexte noch Formulierungsvorschläge. Sie erzeugt ausschließlich Hinweise mit wörtlichem Zitat und Kapitelangabe.
- **Zwei Ebenen:** Plan (was Leon vorhat) und Text (was geschrieben ist) werden getrennt gespeichert. Die App zeigt, wo sie auseinanderlaufen; Leon entscheidet.
- **Mehrdeutigkeit ist Stilmittel:** Ereignisse und Figuren können „gesichert“, „noch offen“ oder „bewusst vage“ sein. Bewusst Vages meldet die Prüfung nie als Fehler.
- **Nichts geht verloren:** automatisches Speichern, Versionsverlauf, offene Dateiformate (Markdown).
- **Der Editor muss sich gut anfühlen:** Wenn Schreiben in der App schlechter ist als in Word, wird sie nicht benutzt. Der Editor hat deshalb Vorrang vor allen Extras.

## Plattform und Technik

Die App ist eine native Mac-Desktop-App auf Basis von Tauri mit Web-Oberfläche. Daten liegen als Markdown im Projektordner, Analysen in einem lokalen SQLite-Index.

| Bereich | Entscheidung | Begründung |
| --- | --- | --- |
| Plattform | nur macOS | einziger Rechner, auf dem geschrieben wird |
| App-Hülle | Tauri 2 (Rust-Kern, Web-Oberfläche) | klein und sparsam; direkter Dateizugriff, native Menüs, mehrere Fenster |
| Oberfläche | React + TypeScript | gute Unterstützung durch Claude Code |
| Editor | ProseMirror-basiert, z. B. TipTap | Anmerkungen als Markierungen, `[[`-Verweise, Markdown speichern und laden |
| Daten | Markdown mit YAML-Frontmatter im Projektordner (OneDrive) | lesbar ohne App, in Obsidian oder VS Code zu öffnen, gesichert durch OneDrive |
| Index | SQLite, lokal im App-Support-Ordner, nicht in OneDrive | schnelle Abfragen; jederzeit neu aufbaubar; kein Sync-Konflikt |
| KI | Azure Foundry, Modell pro Aufgabe konfigurierbar | Leons Azure-Stack und Guthaben |
| Schlüssel | macOS-Schlüsselbund | Azure-Key nie im Klartext auf der Platte |
| Rechtschreibung | macOS-Systemprüfung, Deutsch | keine eigene Wortliste nötig |
| Import / Export | .docx einlesen; Export als .docx und PDF | bestehendes Manuskript übernehmen; Lektorat und Verlage wollen Word |

**Modellwahl (Standard, in den Einstellungen änderbar):** Claude Haiku für die Erkennung von Figuren und Orten pro Szene, Claude Sonnet für die Konsistenzprüfung, Claude Opus optional für einen gelegentlichen Tiefencheck des ganzen Buchs. Eingetragen werden Endpoint und Deployment-Name aus Foundry.

**Datenschutz:** Nur beim Start einer Analyse gehen Kapiteltexte an Azure Foundry. Das Deployment soll in einer EU-Region liegen. Ohne Netz funktioniert alles außer der KI-Prüfung.

## Datenmodell und Projektordner

Alles, was Leon schreibt oder entscheidet, liegt als Datei im Projektordner. Alles, was die App berechnet, liegt im SQLite-Index und lässt sich jederzeit neu aufbauen.

**Projektordner**

```
Hafenlichter/
├── projekt.md              Titel, Einstellungen, Kapitelreihenfolge
├── manuskript/             der Text, eine Datei pro Kapitel
│   ├── 01-grundriss.md
│   └── 04-regatta.md     darf leer sein
├── plan/
│   ├── akte.md             Akte, Quintessenz, Wendepunkte
│   ├── straenge.md         Handlungsstränge mit Farbe
│   ├── ideen.md            Ideen-Ablage
│   └── kapitel/            Plan pro Kapitel, auch für ungeschriebene
├── figuren/                eine Datei pro Figur
├── gruppen/                Antagonisten und andere Gruppen
├── orte/                   eine Datei pro Ort
├── anmerkungen.json        Notizen, die an Textstellen hängen
├── entscheidungen.json     Schreibweisen, »Ist Absicht«, Zuordnungen, Realitätsebene
└── .versionen/             Schnappschüsse geänderter Dateien
```

**Beispiel Figur** (`figuren/die-fremde.md`)

```markdown
---
name: Die Fremde
aliase: []
existenz: bewusst_vage        # gesichert | offen | bewusst_vage
gruppe: null
beziehungen:
  - zu: paul
    art: eine Nacht im Fährhaus
    ab_kapitel: 8
plan:
  aussehen: ""
---
## Wahrheit hinter den Kulissen
Nur für Leon, erscheint nie im Text und nie in einer Analyse an Azure.

## Notizen
```

**Beispiel Kapitelplan** (`plan/kapitel/04-regatta.md`)

```markdown
---
titel: Regatta
akt: 1
status: geplant               # geplant | entwurf | geschrieben
straenge: []
figuren: [paul]
orte: []
abweichungen: []              # id, kapitel, notiz, entscheidung, datum
---
Was soll hier passieren?
```

**Beispiel Akt** (Eintrag in `plan/akte.md`): Nummer, Titel, Kapitelbereich, Quintessenz, Wendepunkt zum nächsten Akt, aktive Antagonisten.

**Gruppen** (`gruppen/nordhaven.md`, `gruppen/konsortium.md`): Typ (Antagonist, Firma, Familie), Status (im Text oder geplant), Mitglieder, mögliche Spuren im Text, die Leon bestätigt oder verwirft.

**SQLite-Index** (nicht im Projektordner)

- `erwaehnungen`: Figur oder Ort, Kapitel, Absatz, Position, Art (auftritt oder erwähnt), Quelle (exakt oder KI-Vorschlag), bestätigt ja/nein
- `hinweise`: Typ, Titel, Zitate mit Kapitel, Erklärung, Status
- `zusammenfassungen`: Kapitel, Text-Hash, Zusammenfassung, Wendung, lose Enden
- `faeden`: lose Enden mit eröffnet in, zuletzt aufgegriffen in

Ändert sich der Hash eines Kapitels, werden nur dessen Einträge neu berechnet.

## Funktionen: Schreiben

Geschrieben wird direkt in der App. Die Word-Datei wird einmal importiert, danach ist der Projektordner die Quelle. Referenz-Screen: *Mac · Schreiben mit Plan*.

| ID | Anforderung | Priorität |
| --- | --- | --- |
| S-01 | Kapitelliste links mit Status (geschrieben, Entwurf, geplant) und Wortzahl; Klick öffnet das Kapitel; Reihenfolge per Drag & Drop | Muss |
| S-02 | Ablenkungsfreier Editor mit Fett, Kursiv, Überschrift, Absatz; Fokus-Modus blendet beide Seitenleisten aus | Muss |
| S-03 | Deutsche Typografie automatisch: „ “ und ‚ ‘, Gedankenstrich, Auslassungspunkte; Rechtschreibprüfung von macOS | Muss |
| S-04 | Automatisches Speichern spätestens 2 Sekunden nach der letzten Eingabe; Schnappschüsse in `.versionen/`; Versionsverlauf mit Vergleich und Wiederherstellen | Muss |
| S-05 | Wortzahl für Kapitel und gesamtes Buch in der Statusleiste | Muss |
| S-06 | Anmerkungen: Textstelle markieren, Notiz anlegen und an Figur, Ort, Kapitel oder Plan-Karte heften. Die Notiz steht am Rand, erscheint auch auf der Figurenkarte, springt per Klick zur Stelle und wandert mit, wenn der Text sich ändert | Muss |
| S-07 | Verweise mit `[[`: Vorschläge aus Figuren, Orten, Kapiteln, Plan-Karten und Ideen; Klick öffnet das Ziel in der Seitenleiste. Gilt für Notizen und Plan-Felder, nicht für den Manuskripttext selbst | Muss |
| S-08 | Plan-Panel rechts zeigt die geplante Szene zum offenen Kapitel: Strang, Figuren, Ort, Plan-Notiz | Muss |
| S-09 | Knopf „Ich weiche hier ab“: kurze Notiz plus Entscheidung (Plan anpassen, als Alternative merken, später entscheiden). Die Abweichung erscheint am Kapitel und im Akt-Board; der alte Plan bleibt in der Historie | Muss |
| S-10 | Tab „Erkannt“: Figuren, Orte und Motive des Kapitels, live aktualisiert. Figuren sind im Text dezent unterstrichen; Klick öffnet ihre Karte | Soll |
| S-11 | Import .docx: Kapitel anhand von Überschrift 1 trennen, Fett und Kursiv übernehmen, leere Kapitel behalten, Vorschau vor der Übernahme | Muss |
| S-12 | Export als .docx und PDF für das ganze Buch oder eine Auswahl, ohne Anmerkungen und Markierungen; Kapitel als Überschrift 1 | Muss |
| S-13 | Tab „Hinweise“ im Editor: Hinweise zu diesem Kapitel; Klick markiert die betroffene Stelle | Soll |
| S-14 | Figur oder Ort in einem eigenen Fenster öffnen | Kann |

## Funktionen: Planung

Die Planung ist die zweite Ebene neben dem Text: Akte, Kapitel, Figuren, Orte, Beziehungen und Antagonisten lassen sich anlegen, bevor sie geschrieben sind. Referenz-Screens: *Mac · Akte planen*, *Mac · Kapitel-Überblick*, *Mac · Figurenkarte*, *Mac · Beziehungsnetz*.

| ID | Bereich | Anforderung | Priorität |
| --- | --- | --- | --- |
| P-01 | Akte | Board mit einer Spalte pro Akt und einer Ideen-Ablage; Kapitelkarten per Drag & Drop zwischen Akten und in der Reihenfolge verschieben | Muss |
| P-02 | Akte | Kopfkarte pro Akt mit Quintessenz, Wendepunkt zum nächsten Akt und aktiven Antagonisten, frei bearbeitbar | Muss |
| P-03 | Akte | Kartenstatus sichtbar: geschrieben, Entwurf, geplant (gestrichelt), weicht vom Plan ab (Akzentkante und Anzahl) | Muss |
| P-04 | Akte | Kapitel vorab planen: Titel, Strang, Figuren, Ort, „Was soll hier passieren?“, Kontext aus den Nachbarkapiteln, Knopf „Mit dem Schreiben beginnen“ | Muss |
| P-05 | Akte | Umschalter „Nur Plan“ und „Plan + Text“ | Soll |
| P-06 | Akte | Ideen-Ablage: lose Karten ohne festen Platz, später in einen Akt ziehbar | Muss |
| K-01 | Kapitel-Überblick | Kapitelwahl; pro Kapitel Zusammenfassung, Wendung, Antagonisten-Bezug und „Bis hierhin passiert“ (Kurzfassung jedes vorigen Kapitels) | Muss |
| K-02 | Kapitel-Überblick | Lose Enden bis zu diesem Kapitel mit „eröffnet in“ und „zuletzt aufgegriffen in“; Fäden, die seit 3 oder mehr Kapiteln ruhen, hervorgehoben; als erledigt oder bewusst offen markierbar | Muss |
| K-03 | Kapitel-Überblick | Zusammenfassungen erzeugt die KI aus dem Kapiteltext. Leon kann sie bearbeiten; bearbeitete Fassungen werden nie überschrieben, nur als veraltet markiert, wenn sich der Text ändert | Muss |
| K-04 | Kapitel-Überblick | Realitätsebene pro Kapitel (siehe Erkennung und KI-Prüfung) | Muss |
| F-01 | Figuren | Liste in Bereichen: Hauptfiguren, Nebenfiguren, Realität offen, geplant (noch nicht im Text) | Muss |
| F-02 | Figuren | Figurenkarte trennt „Aus dem Text“ (nur lesen, jede Angabe mit Kapitelbeleg) und „Deine Planung“ (freie Felder, eigene Felder hinzufügbar) | Muss |
| F-03 | Figuren | Existenz pro Figur: gesichert, noch offen, bewusst vage; dazu das Feld „Wahrheit hinter den Kulissen“, nur für Leon | Muss |
| F-04 | Figuren | Notizen, Auftritte als Kapitelstreifen (tritt auf, nur erwähnt oder per Nachricht), Beziehungen | Muss |
| F-05 | Figuren | Hinweis, wenn ein Plan-Feld dem Text widerspricht, außer die Figur oder Stelle ist bewusst vage | Soll |
| F-06 | Figuren | Figur vorab anlegen, bevor sie im Text vorkommt | Muss |
| O-01 | Orte | Liste mit Kapiteln, Beschreibung aus dem Text, Notizen; Unterorte (Zeichensaal im Büro) | Muss |
| O-02 | Orte | Schreibweisen zusammenführen und die gültige festlegen | Muss |
| O-03 | Orte | Weg einer Figur (z. B. „Pauls Weg“): Ortsfolge über alle Kapitel | Soll |
| B-01 | Beziehungen | Netz mit Figuren als Karten, Beziehungen als beschriftete Linien, Gruppen als Flächen | Muss |
| B-02 | Beziehungen | Zeitregler nach Akt oder Kapitel: zeigt nur, was der Leser bis dahin weiß. Figuren erscheinen ab ihrem ersten Auftritt, Beziehungsbezeichnungen gelten ab einem Kapitel (`ab_kapitel`) | Muss |
| B-03 | Beziehungen | Gestrichelt: nur erwähnt oder Existenz unsicher; Filter Arbeit, Dates, Sonstige | Muss |
| B-04 | Beziehungen | Beziehung per Drag von Karte zu Karte anlegen; Inspektor mit Art, Strang, Belegen aus dem Text und Notiz | Soll |
| A-01 | Antagonisten | Zwei Antagonisten als Gruppen: Nordhaven (im Text über Herrn Kessler und den Aufsichtsrat) und das Konsortium (geplant) | Muss |
| A-02 | Antagonisten | Pro Gruppe Mitglieder, Präsenz pro Akt und Kapitel und mögliche Spuren im Text als Vorschlag (z. B. »Kranich«), die Leon bestätigt oder verwirft | Muss |
| A-03 | Antagonisten | Antagonisten erscheinen als eigene Stränge im Akt-Board und im Kapitel-Überblick | Muss |

## Erkennung und KI-Prüfung

Die exakte Erkennung läuft lokal bei jedem Speichern. Die KI-Prüfung startet Leon bewusst per Knopf, für ein Kapitel oder das ganze Buch. Referenz-Screens: *Hinweise (KI-Prüfung)*, *Mac · Kapitel-Überblick*.

**Ablauf**

1. Beim Speichern: exakte Suche nach Namen und Aliasen aus Figuren und Orten, mit Wortgrenzen („Ole“ trifft nicht „Oleander“).
2. Nach einem Kapitel oder per Knopf: die KI (Haiku) schlägt indirekte Erwähnungen und unbekannte Namen vor, etwa „der Hafenmeister“ oder »Fiete«. Leon bestätigt oder verwirft per Klick.
3. Prüfung per Knopf (Sonnet): Fakten pro Kapitel herausziehen, über das Buch vergleichen, Hinweise erzeugen.
4. Im selben Lauf entstehen Zusammenfassung, Wendung und lose Enden pro Kapitel.
5. Leon entscheidet pro Hinweis: Stelle öffnen, „Ist Absicht“ oder „Erledigt“. Entscheidungen werden gespeichert und nicht erneut gemeldet.

**Hinweis-Typen** (Beispiele aus dem aktuellen Manuskript)

| Typ | Beispiel |
| --- | --- |
| Prüfen | Lotte am Lindenhof: in Kap. 3 mit dem Saab und zu spät, in Kap. 9 im Volvo und zu früh |
| Schreibweise | »Lindenhof«, »Linden Hof«, »Linden-Hof«; »Karl Hansen« und »Carl Hansen« |
| Offener Faden | Wer steckt die zweite Postkarte in Pauls Mantel (Kap. 8 und 10)? |
| Unbekannt | »Fiete« in Kap. 10 ist keiner Figur zugeordnet |
| Struktur | Kap. 4 ohne Text, Kap. 9 endet mitten im Satz, leere Überschrift am Ende |
| Zeitleiste | Nur Montag (Kap. 6) und Donnerstag (Kap. 10) sind verankert |
| Sprache (Kann) | Wechsel zwischen Präsens und Präteritum, großgeschriebenes „Sie“ für die dritte Person; nur markieren, nie korrigieren |

**Realitätsebene**

Jede Textstelle, jedes Ereignis und jede Figur kann eine von drei Stufen tragen. Sie bestimmt, wie die Prüfung damit umgeht.

| Stufe | Bedeutung | Verhalten der Prüfung |
| --- | --- | --- |
| gesichert | ist in der Geschichte wirklich so | normal geprüft |
| noch offen | Leon hat sich noch nicht entschieden | geprüft; Hinweise tragen das Etikett „offen“; Erinnerung im Kapitel-Überblick |
| bewusst vage | Mehrdeutigkeit ist gewollt | nie als Widerspruch gemeldet; Zusammenfassungen formulieren neutral („Paul glaubt …“) |

**Harte Regeln für die Umsetzung**

- Das KI-Modul bekommt nur eine lesende Schnittstelle auf Manuskript und Plan. Schreiben in Manuskriptdateien ist ausschließlich dem Editor erlaubt.
- Das Modell antwortet in einem festen JSON-Schema: Typ, Titel, Zitate (Kapitel plus wörtlicher Text), Erklärung. Es gibt kein Feld für Ersatztext; Antworten mit Formulierungsvorschlägen werden verworfen.
- Jedes Zitat wird gegen den Text geprüft. Ist es dort nicht wörtlich zu finden, wird der Hinweis verworfen.
- „Wahrheit hinter den Kulissen“ und private Notizen gehen nie an das Modell. Die Prüfung liest das Buch so, wie ein Leser es liest.
- Als bewusst vage markierte Stellen werden dem Modell als absichtlich mehrdeutig mitgegeben.
- Ergebnisse werden pro Kapitel-Hash zwischengespeichert. Vor einer Prüfung des ganzen Buchs zeigt die App die geschätzten Tokens an.

## Design

Verbindliche Vorlage sind die Mac-Screens im Mockup der Story-App, Reihe „Mac-App: Schreiben & Planen“: Schreiben mit Plan, Figurenkarte, Akte planen, Beziehungsnetz, Kapitel-Überblick. Die älteren Web-Screens oben im Canvas gelten nur inhaltlich (Plot-Board, Figuren-Matrix, Orte, Hinweise), nicht im Layout. Das Mockup ist privat; für Claude Code die Screens als Bilder exportieren und ins Repository legen (`docs/design/`).

**Fensteraufbau**

- Referenzgröße 1440 × 900 px, Mindestgröße 1100 × 700 px
- Titelleiste 52 px: Ampel-Knöpfe, Projektname, aktueller Kontext, Aktionen rechts
- Seitenleiste links 230 px: Schreiben, Kapitel-Überblick, Akte planen, Figuren, Beziehungen, Orte, Hinweise (mit Zähler); im Bereich Schreiben darunter die Kapitelliste
- Inhalt in der Mitte; Inspektor rechts 300 bis 350 px für das ausgewählte Element
- macOS-Konventionen: Werkzeuge in der Titelleiste, Segment-Umschalter, dichte Abstände für Maus und Tastatur

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

**Schrift**

- Oberfläche: Systemschrift (SF Pro), 13 px Standard, 11 bis 12 px für Labels
- Überschriften: Instrument Serif, 24 bis 40 px
- Manuskript: Newsreader, 17 bis 18 px, Zeilenhöhe 1,65, Textspalte rund 530 px breit

**Formen und Muster**

- Radien: 6 px Knöpfe, 8 bis 10 px Karten, 12 px Fenster und große Panels; Chips voll gerundet
- Gestrichelte Ränder bedeuten geplant, nur erwähnt oder Existenz unsicher
- Eine Akzentkante links an einer Karte bedeutet: weicht vom Plan ab
- Anmerkungen im Text als farbige Hinterlegung, Figuren dezent unterstrichen
- Dunkelmodus (Soll): alle Farben von Anfang an als Tokens anlegen

**Tastenkürzel (Soll):** ⌘1 bis ⌘7 für die Bereiche, ⌘K Schnellsuche über Figuren, Orte und Kapitel, ⌘⇧F Fokus-Modus, ⌘E Export.

## Umsetzung in Phasen

Phase 1 liefert eine App, in der Leon bereits besser schreibt als in Word; jede weitere Phase baut darauf auf und endet mit einer Abnahme am echten Manuskript.

&#91;embedded content: Umsetzung · 4 Phasen mit Abnahme\]

Die Phasen laufen nacheinander; die KI kommt bewusst zuletzt, weil Erkennung und Datenmodell vorher stimmen müssen.

**Akzeptanzkriterien**

- [ ] Import von Leons Manuskript (.docx) ergibt 10 Kapitel mit identischem Text; die leere Schlussüberschrift wird als Hinweis gemeldet
- [ ] Ein Export nach .docx unterscheidet sich vom Text in der App nur in der Formatierung
- [ ] Nach Absturz oder Stromausfall gehen höchstens die letzten 2 Sekunden verloren
- [ ] Der Projektordner ist ohne App lesbar, etwa in Obsidian oder VS Code
- [ ] Nach Löschen des SQLite-Index baut ein Neustart alle Auswertungen ohne Verlust wieder auf
- [ ] Ein automatischer Test belegt, dass die KI-Komponente keine Manuskriptdatei schreiben kann
- [ ] Jeder Hinweis enthält mindestens ein Zitat, das wörtlich im Text steht
- [ ] Eine als bewusst vage markierte Stelle erzeugt keinen Widerspruchs-Hinweis
- [ ] Der Beziehungs-Zeitregler auf Akt I zeigt weder Vera noch die Fremde
- [ ] Die Prüfung findet die Hinweise aus dem Mockup: Lindenhof-Schreibweisen, »Fiete«, Satzende in Kap. 9, zweite Postkarte

## Nicht-Ziele und offene Punkte

**Nicht-Ziele**

- Keine Web-, iPad- oder Windows-Version; Geräteübergreifend nur über den OneDrive-Ordner
- Kein Seitenlayout oder Buchsatz; das übernehmen Lektorat und Verlag
- Keine KI-Textgenerierung, kein Umschreiben, keine Stilvorschläge
- Keine Mehrbenutzer-Funktionen und keine Kommentare von Dritten

**Offene Punkte**

- [ ] Endgültiger Name der App (Plotwerk ist Arbeitstitel)
- [ ] Akt-Grenzen, Quintessenzen und Wendepunkte schreibt Leon selbst; die Werte im Mockup sind Vorschläge
- [ ] Name, Mitglieder und erste Szene des Konsortiums
- [ ] Azure Foundry: Abo und EU-Region festlegen, Verfügbarkeit von Haiku, Sonnet und Opus im Tenant prüfen
- [ ] Aufbewahrung der Schnappschüsse im Versionsverlauf (Vorschlag: 90 Tage, danach einer pro Woche)
- [ ] Sprach-Hinweise wie Tempuswechsel schon in Phase 4 oder später
- [ ] Reicht das Kapitel als kleinste Einheit, oder braucht es Szenen innerhalb eines Kapitels?
