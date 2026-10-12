# Testdaten

`demo-projekt/` ist ein vollständiger Projektordner „Hafenlichter“ im echten Format
(siehe `docs/architektur.md`). Er wird in der Browser-Demo (`npm run dev`) geladen und in Tests
über `fixtures/demoProjekt.ts` (`demoDateien()`, `demoFs()`, `ladeDemoProjekt()`).

**„Hafenlichter“ ist ein frei erfundener Demo-Roman**, eigens für Tests und Screenshots geschrieben: Paul,
Architekt in einer Hafenstadt, soll einen alten Kornspeicher für den Investor Nordhaven umbauen, verabredet sich
mit Lotte, die ihm einen Zeichentisch verkauft hat, und findet nach einer Nacht im Fährhaus Postkarten in seiner
Manteltasche, die er nicht selbst hineingesteckt hat. `manuskript/flut.md` entspricht wörtlich den vier Absätzen
aus `docs/design/screens/Schreiben.dc.html` und endet absichtlich mitten im Satz („… während ich nach einem freien Tisch suche“).

Inhalte (Kapitel, Akte, Stränge, Ideen, Figuren, Beziehungen, Netzpositionen, Gruppen, Orte, Analysen,
Realitätsebenen) passen zu den Screens. Private Felder (`wahrheit`, `notizen`) beginnen mit
„Privat (Testtext)“, damit Tests prüfen können, dass sie nie an die KI gehen.

## Kapitel

| Nr. | ID | Akt | Status | Manuskript |
| --- | --- | --- | --- | --- |
| 1 | grundriss | I | geschrieben | ja |
| 2 | fassade | I | geschrieben | ja |
| 3 | lotte | I | geschrieben | ja |
| 4 | regatta | I | geplant | **nein** (nur Plan) |
| 5 | staub | II | geschrieben | ja |
| 6 | weissraum | II | entwurf | ja, genau zwei Sätze |
| 7 | ebbe | II | geschrieben | ja |
| 8 | bis-bald | II | geschrieben | ja |
| 9 | flut | III | geschrieben | ja, Text aus dem Screen |
| 10 | funkstille | III | geschrieben | ja |

## Testfälle im Text

- Schreibweisen eines Orts: „Lindenhof“ (lotte), „Linden Hof“ (ebbe), „Linden-Hof“ (funkstille); der Ort `lindenhof` hat `aliase: []`.
- Schreibweisen ohne Figur: „Karl Hansen“ (fassade) und „Carl Hansen“ (weissraum).
- Unbekannter Name: „Fiete“ (funkstille), keiner Figur zugeordnet.
- Wortgrenzen: „Oleander“ (grundriss) darf nicht als Ole zählen; Ole kommt in grundriss, fassade und ebbe vor.
- Genitive: „Pauls“ (lotte, staub, weissraum, funkstille), „Lottes“ (lotte); „Herrn Kessler“ steht als `formen` an der Figur.
- Lotte und die Ankunft: In lotte fährt Paul mit seinem alten Saab 900 zum Lindenhof und kommt zu spät (Klappbrücke);
  in flut steigt er aus einem fremden Volvo und ist eine halbe Stunde zu früh (KI-Hinweis „pruefen“, Realität offen).
- Vera erst ab ebbe (Akt II); die Fremde erst ab bis-bald (erste Postkarte „Bis bald“ in der Manteltasche).
  Der Beziehungs-Zeitregler auf Akt I zeigt also weder Vera noch die Fremde.
- funkstille: zweite Postkarte in der Manteltasche („Warum bist du nicht gekommen?“), Anruf von „Nummer unterdrückt“,
  Spuren des Konsortiums „Kranich“ und „Meldung über leerstehende Speicher, die über Nacht den Besitzer wechseln“
  (wörtlich im Text); weitere Spur „Werfthalle am Nordkai verkauft“ in fassade.
- Zeitleiste im Text: nur „Montag“ (weissraum) und „Donnerstag“ (funkstille).
- Struktur: regatta ohne Text; nur flut endet mitten im Satz; „Sie“ großgeschrieben in flut.
- Motive (`plan/motive.md`): „Bleistifte“ (Alias „Bleistift“: fassade „den Bleistift“, flut „Bleistifte“) und „Postkarten“ (bis-bald, funkstille).
- Ein alter Mann (ebbe) ist als Figur mit Existenz „offen“ angelegt (Alias „alter Mann“).
- Eine Abweichung vom Plan an ebbe (`alternative`, alter Plan erhalten).
- Plan-Widerspruch (F-05): Paul hat das Plan-Feld „Alkohol: nein, trinkt keinen“, in flut bestellt er einen Aperol Spritz.
  Die Demo-KI meldet das als „pruefen“ mit Plan-Bezug.
- Anmerkungen: „Bleistifte“ (Notiz an Paul) und „nach einem freien Tisch suche“ (Notiz an Lotte), beide in flut.
- `.plotwerk/hinweise.json`: vier KI-Hinweise (pruefen, offener_faden, unbekannt, zeitleiste); jedes Zitat steht wörtlich im Text.
- `.plotwerk/analysen/`: Zusammenfassungen passend zu `Kapitel.dc.html` (`textHash` = `textHash(kapitel.text)` des aktuellen
  Texts, ein Test prüft das; `modell: demo`), keine für regatta.
- `entscheidungen.json`: leer, gültige Struktur.

## Werkzeug-Dateien (G1–G8)

- Szenen: `manuskript/ebbe.md` hat zwei Szenentrenner „* * *“ (drei Szenen: Fischrestaurant, Kai, Zu Hause);
  `plan/kapitel/ebbe.md` plant sie als `ebbe-s1` … `ebbe-s3`.
- Zeitpunkte (`zeit` in den Kapitelplänen): grundriss/fassade Tag 1, lotte Tag 3 abends, weissraum Tag 8 Montag (fest,
  Beleg „Am Montag“), ebbe Tag 8 23:00 (Beleg „Gegen elf“), funkstille Tag 9 Donnerstag (fest, Beleg „Heute ist Donnerstag“).
  `plan/zeitleiste.md` setzt Tag 1 = Montag – **Tag 9 als Donnerstag widerspricht dem absichtlich** (Testfall für die
  Zeitprüfung). Zustände von Paul: ausgeruht (lotte), erschöpft (ebbe, Szene Kai), Gedächtnislücke (bis-bald),
  schlaflos (funkstille).
- `plan/faeden.md`: geplante Auflösung für „Die Fremde und die Postkarten“ (funkstille), Ruhe-Schwelle 2 für den
  Messingschlüssel, ein von Leon angelegter Faden „Pauls Bleistifte“.
- `plan/boegen.md`: Bogen von Paul (drei Stufen mit Belegen) und Lotte. `plan/marken.md`: Saab, Schwip Schwap, Aperol,
  Kleinanzeigen, Volvo, Carl Hansen (Alias „Karl Hansen“).
- `statistik.json`: Tagesziel 500 Wörter, fünf Tage. `fassungen.json`: eine Fassung (die Schnappschuss-Datei fehlt absichtlich).
- `lektorat/aenderungen.json`: drei Änderungen (ersetzen, löschen, einfügen) einer Lektorin.
- `recherche/`: drei Einträge (Bild, Link, Notiz); das Bild ist eine SVG-Skizze (Text, damit Tests es lesen können).
- `.plotwerk/zeit-vorschlaege.json`, `zustand-vorschlaege.json`, `stimmen.json`, `leser.json`, `fragen.json`: je ein
  KI-Ergebnis (`modell: demo`); jedes Zitat steht wörtlich im Text.

`fixtures/demo-projekt.test.ts` prüft diese Fälle automatisch. `test-manuskript.docx` (Import-Tests) erzeugt
`core/docx/testdaten/erzeugen.mjs` aus `core/docx/testdaten/testManuskript.ts`.

## Englische Fassung „Harbour Lights“

`demo-projekt-en/` ist dasselbe Projekt auf Englisch (`angaben.sprache: en`, englische Typografie “ ” ‘ ’). Die
Browser-Demo lädt es, wenn die Oberfläche auf Englisch steht; Tests nutzen `demoDateienEn()`, `demoFsEn()`,
`ladeDemoProjektEn()`. Struktur, Akte, Status, Zeitpunkte, Szenen, Beziehungen, Netzpositionen und alle Testfälle
entsprechen dem deutschen Projekt; Eigennamen bleiben (Paul, Lotte, Vera, Ole, Konrad, Malte, Fiete, Lindenhof,
Nordhaven, Kranich, Saab, Schwip Schwap, Kleinanzeigen …), übersetzt sind Texte und IDs:

| Hafenlichter | Harbour Lights |
| --- | --- |
| grundriss, fassade, lotte, regatta, staub, weissraum, ebbe, bis-bald, flut, funkstille | floor-plan, facade, lotte, regatta, dust, white-space, low-tide, see-you-soon, high-tide, radio-silence |
| Herr Kessler, Die Fremde, Alter Mann am Kai | Mr Kessler, The Stranger, Old Man on the Quay |
| Büro, Teeküche, Zeichensaal, Pauls Wohnung, Fährhaus, Kornspeicher, Fischstand, Bootsverleih | Office, Kitchenette, Drawing Studio, Paul’s Flat, Ferry House, Granary, Fish Stall, Boat Hire (je mit kleingeschriebenem Alias) |
| Konsortium; Stränge Begegnungen, Die Postkarten, Schlaflose Nächte | Consortium; Encounters, The Postcards, Sleepless Nights |
| Motive Bleistifte, Postkarte | Pencils, Postcard |

Englische Entsprechungen der Testfälle: „Lotte’s“ statt „Lottes“, „bascule bridge“ statt „Klappbrücke“, „oleander“
(grundriss), „See you soon“ und „Why didn’t you come?“ auf den Postkarten, „Number withheld“, Spur „report about empty
granaries changing hands overnight“, Wochentage „Monday“ (white-space) und „Thursday“ (radio-silence), Belege
„On Monday“, „Around eleven“, „Today is Thursday“. Statt des großgeschriebenen „Sie“ steht in high-tide „I take Her in my
arms“. Anker (`davor`/`danach`) und `textHash` sind aus dem englischen Text berechnet; Zitate stehen wörtlich darin.
`fixtures/demo-projekt-en.test.ts` prüft Laden, Hashes, Zitate, Anker und die Struktur gegen das deutsche Projekt.
