# Plan: Figuren, Namen und Gruppen (Paket nach v0.2.0)

Stand: 12. Oktober 2026. Grundlage: Rückmeldungen aus dem Schreiben mit dem eigenen Manuskript (Spitznamen werden als
eigene Figuren angelegt, doppelte Figuren lassen sich nicht zusammenführen, Gruppen nur über Dateien). Bereits
umgesetzt auf diesem Branch: F-07 Figuren zusammenführen, F-08 Spitznamen-Feld, A-04 Gruppen in der App,
KI-Vorschläge nehmen den Eigennamen.

Leitlinien für alle Phasen:

- Datenmodell nur additiv (`core/model/types.ts`); alte Projekte bleiben ohne Migration gültig.
- Lokale Prüfungen (ohne KI) zuerst, KI-Werkzeuge mit wörtlichen Zitaten (E6) und ohne Ersatztext.
- Neue Hinweise laufen über `core/index` (`hinweiseBerechnen`) und den bestehenden Hinweis-Mechanismus:
  „Ist Absicht“ und „Erledigt“ gelten dauerhaft (`entscheidungen.hinweise`).
- Beispiele in Code, Tests und Doku nur aus dem Demo-Roman (`fixtures/`), nie aus dem privaten Manuskript.
- Jede Phase endet mit Tests (Vitest), Browser-Durchlauf hell/dunkel, deutsch/englisch, und einem eigenen PR.

## Übersicht

| Phase | Inhalt | Anforderungen | Aufwand | KI |
|---|---|---|---|---|
| 0 | PR mit dem bisherigen Stand | F-07, F-08, A-04 | erledigt, offen: PR | – |
| 1 | Hover-Blase im Editor stabil machen | S-02 (Qualität) | mittel | – |
| 2 | Namen zuordnen: Blase „Figur / Spitzname“, KI-Vorschläge als Spitzname übernehmen | F-09, F-10 | mittel | nutzt vorhandene |
| 3 | Lokale Namens-Hinweise: Spitzname vor Einführung, verwechselbare Namen, verschwundene Figuren | F-11, F-12, F-13 | klein–mittel | – |
| 4 | Statisten als dritte Rolle | F-14 | mittel | Prompt-Anpassung |
| 5 | Gruppen: mehrere pro Figur, Rollen in der Gruppe | A-05, A-06 | mittel | – |
| 6 | Besetzungsübersicht (Figuren × Kapitel) | F-15 | mittel | – |
| 7 | Spitznamen mit Kontext (wer nennt wen so, ab wann) | F-16 | klein–mittel | – |
| 8 | Personenverzeichnis exportieren | AB-xx | klein–mittel | – |
| 9 | Figurenfakten aus dem Text, Widersprüche je Figur | F-17 | groß | ja |
| – | Erzählperspektive pro Kapitel | – | – | zurückgestellt |

Reihenfolge: 1 vor 2 (die neue Blasen-Aktion setzt eine verlässliche Blase voraus). 3 profitiert von 2 (mehr
Spitznamen gepflegt → bessere Hinweise). 4 und 5 sind unabhängig. 9 zuletzt, weil am teuersten und am besten
mit dem echten Manuskript zu erproben.

---

## Phase 1 – Hover-Blase im Editor

Die Blase (`src/features/schreiben/Blase.tsx`, eigene Komponente über TipTap/ProseMirror, kein BubbleMenu)
hat mehrere Schwachstellen, die beim Schreiben als „hakelig“ auffallen. Befund und Abhilfe:

| # | Problem | Ursache | Abhilfe |
|---|---|---|---|
| 1 | Blase am linken/rechten Rand abgeschnitten, Ebenen-Untermenü erst recht | Klemmung nur 70 px, Blase ~220–260 px breit; `.pw-s-papier` hat `overflow-x: hidden` | Breite messen, Mitte auf `[breite/2, papierbreite − breite/2]` klemmen; Untermenü an der Blase ausrichten statt zentriert |
| 2 | Blase verschwindet oben, wenn die markierte Zeile am oberen Rand steht | kein Umklappen | unter die Auswahl klappen, wenn oben kein Platz ist (`data-seite="unten"`, Pfeil spiegeln) |
| 3 | Blase bleibt an alter Stelle nach Fokus-Modus, Fenstergröße, Seitenleisten ein/aus, Kapitelwechsel | kein Resize-/Layout-Listener; `view.updateState` beim Laden löst kein Ereignis aus | `ResizeObserver` auf Papier und Editor, `resize`-Listener; beim Laden eines Kapitels Blase schließen |
| 4 | „Notiz“ im Fokus-Modus legt einen unsichtbaren Entwurf an (rosa Markierung, kein Eingabefeld) | Randnotizen sind im Fokus-Modus nicht gerendert | Notiz-Knopf im Fokus-Modus: Fokus-Modus verlassen und Entwurf öffnen (oder Knopf ausblenden) |
| 5 | Escape schließt weder Blase noch Untermenü; im Fokus-Modus beendet Escape stattdessen den Modus | kein Escape-Handler | Escape schließt zuerst das Untermenü, dann die Blase (Auswahl bleibt); erst danach greift der Fokus-Modus |
| 6 | Untermenü „Ebene“ ist nach Weg- und Zurückklicken noch offen | Zustand nur bei Auswahländerung zurückgesetzt | beim Verbergen zurücksetzen |
| 7 | Blase erscheint nach einem Klick gar nicht mehr, bis man erneut klickt | `maus`-Flag bleibt hängen, wenn die Maustaste außerhalb des Fensters losgelassen wird | Flag auch bei `pointerup`/`pointercancel`/`blur` am Fenster zurücksetzen; Pointer-Events statt Maus-Events |
| 8 | Blase kann mitten im Ziehen aufblitzen, wenn das Ziehen außerhalb des Textes beginnt | Mausmerker nur auf `view.dom` | `pointerdown` auf dem ganzen Papier beobachten |
| 9 | ⌘A zeigt keine Blase | Prüfung auf Inline-Elternknoten schließt `AllSelection` aus | `AllSelection` zulassen (Fett/Kursiv), Ebene/Notiz/Figur dann ausblenden |
| 10 | Tastatur: kein Weg in die Blase; ist der Fokus drin, verschwindet sie bei der nächsten Transaktion (z. B. Analyse-Dekorationen) | `messen` prüft `editor.isFocused` | Tastenkürzel (⌥⌘B o. Ä.) fokussiert die Blase, Pfeiltasten wandern (`role="toolbar"`), `messen` berücksichtigt Fokus in der Blase; Timer beim Verbergen löschen |
| 11 | „Ü“-Knopf mit `aria-pressed` und wechselndem Label | doppelte Semantik | nur `aria-pressed`, festes Label |

Tests: bisher nur Verzögerung, Ebene, Ziehen, Ü/Absatz (`Editor.test.tsx`, `schreiben.en.test.tsx`). Neu je
Problem ein Test (Klemmung und Umklappen mit gestubbtem `coordsAtPos`, Escape, Fokus-Modus-Notiz, hängender
Mausmerker, Resize schließt bzw. misst neu, Tastatur). Zusätzlich Browser-Durchlauf: Markieren am linken Rand,
in der ersten Zeile, im Fokus-Modus, mit ⌘A, per Tastatur, hell und dunkel, deutsch und englisch (englische
Labels sind breiter). Damit Phase 2 eine weitere Aktion mit Eingabefeld/Auswahlliste in die Blase setzen kann,
bekommt die Blase einen „Panel“-Mechanismus (Untermenü mit eigenem Fokus, der die Blase nicht schließt) – die
Ebenen-Auswahl wird das erste Panel.

---

## Phase 2 – Namen dort zuordnen, wo man sie bemerkt

**F-09 Blase „Figur / Spitzname“.** Neue Aktion in der Blase über markiertem Text (nach Phase 1):

- „Neue Figur“: legt eine Figur mit dem markierten Text als Namen an (Rolle Neben bzw. Statist nach Phase 4),
  öffnet sie nicht, zeigt eine kurze Bestätigung mit Link zur Karte.
- „Spitzname von …“: Suchliste der Figuren als Panel der Blase (Name, Spitznamen, Kurzbeschreibung; Tastatur
  ↑↓/Enter/Escape; Grundlage `recherche/ZielWahl.tsx`, auf Figuren gefiltert; vorausgewählt die Figur, die an der
  Stelle schon erkannt ist), fügt den markierten Text als Alias hinzu und hält die Stelle wie
  `unbekanntZuordnen` als bestätigte Zuordnung fest. Führender Artikel wird entfernt („der Alte“ → „Alte“), weil die
  Erkennung Artikelformen selbst findet; der Originaltext steht als Vorschau daneben.
- Gilt nur für eine Markierung innerhalb eines Absatzes, 2–60 Zeichen.
- Danach sofort neue Erkennung (Signatur ändert sich über die Aliase, kein Zusatzaufwand).

**F-10 KI-Vorschläge als Spitzname übernehmen.**

- Figurvorschläge (`core/ki/vorschlaege.ts`): Trägt ein Vorschlag den Namen einer angelegten Figur als Alias,
  wird er heute still als „bereits angelegt“ gezählt. Neu: Hat er Namen, die die angelegte Figur noch nicht
  kennt, wird daraus ein Vorschlag „Spitznamen für X: …“ (`FigurVorschlag.ziel?: Id` additiv) mit Knopf
  „Als Spitznamen übernehmen“.
- Erwähnungsvorschläge (`ErwaehnungsVorschlaege.tsx`, Haiku): Bei einer bestätigten indirekten Erwähnung
  („der Alte“ → Ole) zusätzlich „Immer so erkennen“ → Alias statt nur dieser einen Zuordnung.
- Unbekannte Namen (Hinweistyp `unbekannt`) lassen sich schon heute einer Figur als Spitzname zuordnen
  (`unbekanntZuordnen`); dort nur die neue Figurenauswahl (Suche statt langer Auswahlliste) übernehmen.

Tests: Kernlogik in `core/ki/vorschlaege.test.ts`, Store-Aktionen, UI-Test für die Figurenauswahl (Tastatur).

---

## Phase 3 – Lokale Hinweise rund um Namen

Alle drei lokal in einem neuen Modul `core/figuren/hinweise.ts`, eingehängt in `hinweiseBerechnen`. Neuer
Hinweistyp `figuren` (additiv in `HinweisTyp`, mit Filter im Bereich Hinweise und im Figuren-Abschnitt
„Hinweise“ der Karte).

**F-11 Spitzname, bevor der Leser ihn kennt.** Aus `index.erwaehnungen` (Feld `treffer`): erste Stelle, an der
die Figur über einen Spitznamen erkannt wird, liegt vor der ersten Stelle mit ihrem Namen (inkl. Genitiv- und
Artikelformen). Hinweis mit beiden Zitaten. Nicht für Figuren ohne Namensnennung im Text und nicht für
„bewusst vage“.

**F-12 Verwechselbare Namen.** Paare von Figuren (Name und Spitznamen), die sich leicht verwechseln lassen:
Editierabstand 1 bei Namen ≥ 4 Zeichen (Marion/Marian-Typ), gleicher Anfang und gleiche Länge, gleicher
Anlaut bei Haupt- und Nebenfiguren in denselben Kapiteln. Nur Figuren, die beide im Text vorkommen; Statisten
ausgenommen. Bewusst sparsam: lieber wenige Treffer.

**F-13 Verschwundene Figuren.** Wie ruhende Fäden (K-02): Hauptfigur seit N Kapiteln nicht aufgetreten
(Standard 3, für Nebenfiguren 6, Statisten nie), solange noch Kapitel mit Text folgen. Schwelle pro Figur
einstellbar (`Figur.ruheSchwelle?: number | null`, null = nie melden). Erscheint auch als Markierung im
Auftrittsstreifen der Figurenkarte.

Tests: je Regel positive und negative Fälle mit dem Demo-Roman.

---

## Phase 4 – Statisten

**F-14 Rolle `statist`.** `FigurRolle = 'haupt' | 'neben' | 'statist'` (additiv; jede Stelle, die heute
zweiwertig denkt, wird angepasst – u. a. `vorschlaege.ts` Rollen-Mapping, `figurenBereiche`, Segment in der
Karte, Exposé).

- Figurenliste: eigener Bereich „Statisten“, standardmäßig eingeklappt, kompakte Zeilen (Name, Kurzbeschreibung,
  Kapitel).
- Figurenkarte: Planfelder, Bogen, Zustände und Stimme eingeklappt bzw. ausgeblendet, bis etwas eingetragen ist.
- Beziehungsnetz: Statisten standardmäßig ausgeblendet (Filter „Statisten zeigen“), Beziehungen zu ihnen
  gestrichelt.
- Erkennung, Schreibweisen, Auftritte bleiben voll aktiv.
- KI-Vorschläge: Prompt erlaubt `statist` (benannt, höchstens zwei Szenen, keine eigene Handlung); Sammelaktion
  „Alle Statisten übernehmen“.
- Hinweis „Zur Nebenfigur machen?“, wenn ein Statist in drei oder mehr Kapiteln auftritt (Typ `figuren`,
  Entscheidung dauerhaft).
- Exposé: Statisten nie.

---

## Phase 5 – Gruppen

**A-05 Mehrere Gruppen pro Figur.** Maßgeblich wird `Gruppe.mitglieder` (kann eine Figur mehrfach enthalten);
`Figur.gruppe` bleibt als „Hauptgruppe“ für Farbe und Darstellung (additiv, keine Migration). Figurenkarte:
Gruppen als Chips mit „+ Gruppe“ statt einer Auswahl; Hauptgruppe per Stern. `mitgliedHinzufuegen` entfernt die
Figur nicht mehr aus anderen Gruppen. Netz: Karte liegt in der Fläche der Hauptgruppe, andere Gruppen zeigen
die Figur als kleinen Verweis-Chip.

**A-06 Rollen in Gruppen.** `Gruppe.rollen?: Record<Id, string>` (z. B. „Chef“, „Praktikant“). Inspektor:
Rolle je Mitglied; Netz: Rolle als zweite Zeile auf der Karte innerhalb der Fläche; Figurenkarte: „Rolle in
Gruppe“. Optional später: Reihenfolge der Mitglieder als Hierarchie.

---

## Phase 6 – Besetzungsübersicht

**F-15** Neue Ansicht im Bereich Figuren (Umschalter „Karte · Bögen · Besetzung“): Matrix Figuren × Kapitel aus
`index.erwaehnungen` (Art je Kapitel wie im Auftrittsstreifen: tritt auf, Nachricht, nur erwähnt), gruppiert nach
Rolle, Statisten einklappbar. Spaltensummen „Figuren je Kapitel“, Zeilensummen; Klick auf eine Zelle springt zur
ersten Stelle. Ruhende Strecken (Phase 3) hervorgehoben. Reine Ableitung, keine neue Datei.

---

## Phase 7 – Spitznamen mit Kontext

**F-16** Spitznamen werden optional zu Einträgen mit Kontext: `Figur.spitznamen?: { name: string; von?: Id[];
abKapitel?: Id; notiz?: string }[]` (additiv; `aliase` bleibt die Liste für die Erkennung und wird daraus
gespeist). Figurenkarte: Spitznamen als Chips; Klick öffnet „Wer nennt X so? Ab wann?“. Lokaler Hinweis (Typ
`figuren`): Spitzname taucht vor `abKapitel` auf. „Wer nennt“ wird angezeigt und fließt später in die
Figurenstimme (G3) ein; keine automatische Prüfung der Sprecher in dieser Phase (Sprecherzuordnung ist
unzuverlässig).

Ersetzt nebenbei das Komma-Feld durch Chips (Eingabe mit Enter oder Komma, × zum Entfernen).

---

## Phase 8 – Personenverzeichnis

**AB-xx** Neues Abgabe-Format „Personenverzeichnis“ (`core/abgabe/personen.ts`): Figuren nach Gruppen oder
Rolle, je Zeile Name, Spitznamen, Kurzbeschreibung, optional Rolle in der Gruppe. Optionen: Statisten ja/nein,
„geplant“ ausblenden, nur bis Kapitel X (kein Spoiler). Ausgabe als .docx/PDF/Markdown und als optionaler
Vorspann im EPUB- und Normseiten-Export. Private Felder (`wahrheit`, `notizen`) nie.

---

## Phase 9 – Figurenfakten aus dem Text

**F-17** Die KI-Prüfung meldet heute schon Widersprüche allgemein (Typ `pruefen`). Neu ist eine
figurenbezogene Sammlung: KI-Aufgabe „Figurenfakten“ (eigene Ablage `.plotwerk/figurenfakten.json`) liefert je
Figur Angaben aus dem Text (Alter, Aussehen, Beruf, Herkunft, Familie …) mit wörtlichem Beleg. Die Figurenkarte
zeigt sie im Abschnitt „Aus dem Text“ (F-02) mit Kapitelbeleg; widersprüchliche Angaben (gleiches Merkmal,
unterschiedliche Werte) werden lokal erkannt und als Hinweis `pruefen` mit Figur-Bezug gemeldet. Planfelder
werden dagegen wie bei F-05 abgeglichen. Regeln wie bei allen KI-Werkzeugen: Zitat wörtlich, nur Beobachtung,
„bewusst vage“ wird nie als Widerspruch gemeldet, Leon entscheidet jeden Eintrag. Kosten vorab schätzen
(Haiku pro Kapitel, Abgleich lokal).

---

## Zurückgestellt

**Erzählperspektive pro Kapitel/Szene.** Für das eigene Manuskript nicht nötig (ein Ich-Erzähler), für die
öffentliche Version aber eine häufige Planungsfrage. Notiz für später: Feld `perspektive?: Id` an
`KapitelPlan`/`Szene`, Auswertung „wer erzählt wie oft, wer war lange nicht dran“, Ansicht in der
Besetzungsübersicht (Phase 6) als zusätzliche Zeile.
