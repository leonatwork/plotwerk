# core/ki – KI-Prüfung

`core/ki` baut die Messages-API-Bodys (Allowlist, Prompt Caching, Structured Outputs) und prüft
die Antworten. Den HTTP-Aufruf macht der Rust-Kern über `KiTransport` (E11). Dieses Dokument
beschreibt, was der Tauri-Teil dafür tun muss. Geprüft gegen Microsoft Learn
(„Deploy and use Claude models in Microsoft Foundry“, „Claude models in Microsoft Foundry“,
Stand Oktober 2026) und die Claude-API-Doku.

## Anbieter

Leon wählt in den Einstellungen **Microsoft Foundry** oder die **Claude API** (Anthropic direkt).
Beide sprechen dieselbe Messages-API; Prompt-Aufbau und Antwortprüfung sind identisch.

| | Microsoft Foundry | Claude API |
| --- | --- | --- |
| `projekt.ki` | `endpoint`, `deployments` | `claude.endpoint`, `claude.modelle` |
| Basis-URL | `https://<resource>.services.ai.azure.com/anthropic` (Pflicht) | `https://api.anthropic.com` (leer = dieser Standard, überschreibbar) |
| `model` im Body | Deployment-Name | Modell-ID |
| Schlüsselbund | Dienst `app.plotwerk.mac`, Konto `azure-foundry` | Dienst `app.plotwerk.mac`, Konto `anthropic-api` |
| Serverseitiger Fallback | nicht verfügbar | `fallbacks: "default"` bei `claude-sonnet-5-5` und `claude-opus-5-5` |

`projekt.ki.anbieter` (`foundry` | `claude`) bestimmt den Anbieter; fehlt das Feld (ältere
`projekt.md`), gilt Foundry. Die Einstellungen des jeweils anderen Anbieters bleiben beim
Umschalten erhalten. Helfer: `kiAnbieter`, `kiModell`, `kiEndpoint`, `kiMitStandards`
(`core/ki/anbieter.ts`).

## Endpoint und Pfade

- Basis-URL ohne `/v1/messages`. Vor der Nutzung: Leerraum und `/` am Ende entfernen; falls doch
  `/v1/messages` angehängt ist, abschneiden (Rust: `basis_url`).
- `ki_anfrage(endpoint, body, anbieter)` → `POST {endpoint}/v1/messages`
- `ki_tokens(endpoint, body, anbieter)` → `POST {endpoint}/v1/messages/count_tokens`, Antwort
  `{ "input_tokens": n }` → `n` zurückgeben.
- `anbieter` ist `"foundry"` oder `"claude"`; fehlt es, gilt Foundry (wie vor der Claude API).
- `KiTransport.senden(body)` bekommt keinen Endpoint. Der Tauri-Transport liest Anbieter und
  Basis-URL bei jedem Aufruf aus dem Store (`useStore.getState().daten?.projekt.ki`).
- `bereit()` = Basis-URL des gewählten Anbieters nicht leer **und**
  `schluessel_vorhanden(anbieter)`.

## Header

```
content-type: application/json
x-api-key: <Schlüssel des Anbieters aus dem macOS-Schlüsselbund>
anthropic-version: 2023-06-01
anthropic-beta: server-side-fallback-2026-07-01   (nur Claude API, nur wenn der Body fallbacks: "default" enthält)
```

- Foundry: kein `anthropic-beta`-Header. Alternative ohne Schlüssel wäre Entra ID
  (`Authorization: Bearer <token>`, Scope `https://ai.azure.com/.default`); für Plotwerk nicht
  vorgesehen.
- Der Schlüssel verlässt den Rust-Kern nie (nicht ins WebView, nicht in Logs).

## Serverseitiger Fallback (nur Claude API)

Opus und Sonnet 5.5 haben Sicherheitsfilter, die auch harmlose Anfragen ablehnen können
(`stop_reason: "refusal"`). Der Tauri-Transport (`src/backend/tauri/kiTransport.ts`,
`mitServerFallback`) ergänzt deshalb bei der Claude API für `claude-sonnet-5-5` und
`claude-opus-5-5` den Body um `"fallbacks": "default"`; der Rust-Kern setzt dann den Header
`anthropic-beta: server-side-fallback-2026-07-01`. Bei einer Ablehnung beantwortet die API die
Anfrage im selben Aufruf mit dem von Anthropic für die Kategorie empfohlenen Ersatzmodell
(Antwort-`model` nennt es; `content` kann einen Block `{"type": "fallback"}` enthalten, den
`core/ki` wie alle Nicht-Text-Blöcke ignoriert). Lehnt auch das Ersatzmodell ab, kommt
`stop_reason: "refusal"` zurück und das Kapitel wird wie bisher mit Grund verworfen.

- Nicht bei Haiku 5.5 (kein serverseitiger Fallback; eine Modell-Liste würde mit 400 abgelehnt).
- Nicht bei Foundry (dort nicht verfügbar).
- Nicht bei `count_tokens` (der Rust-Kern filtert den Body auf die erlaubten Felder).
- Ein schon gesetztes `fallbacks` bleibt unverändert; die Listenform bekäme den Header
  `server-side-fallback-2026-06-01`.

## Body

Unverändert durchreichen (`serde_json::Value`), nichts ergänzen oder umsortieren. Aufbau:

```json
{
  "model": "<Deployment-Name aus projekt.ki.deployments>",
  "max_tokens": 16000,
  "system": [{ "type": "text", "text": "<fester System-Prompt>" }],
  "messages": [{ "role": "user", "content": [
    { "type": "text", "text": "<ganzes Buch>", "cache_control": { "type": "ephemeral" } },
    { "type": "text", "text": "<Aufgabe für ein Kapitel>" }
  ]}],
  "output_config": { "effort": "low|medium|high", "format": { "type": "json_schema", "schema": { … } } }
}
```

- `model` ist bei Foundry der **Deployment-Name** (kann vom Modellnamen abweichen), bei der
  Claude API die **Modell-ID**. Standard: `claude-haiku-5-5` (Erkennung, effort `low`),
  `claude-sonnet-5-5` (Prüfung, `medium`), `claude-opus-5-5` (Tiefencheck, `high`).
- `thinking` wird weggelassen: Haiku, Sonnet und Opus 5.5 laufen dann adaptiv (Opus 5.5 lässt
  sich gar nicht abschalten). Laut Foundry-Doku sind Structured Outputs bei Haiku/Sonnet 5.5 „nur
  mit adaptive“ erlaubt – weggelassen ist adaptiv. Falls ein Deployment trotzdem mit 400 wegen
  `output_config.format` antwortet: `"thinking": {"type": "adaptive"}` ergänzen (gleichwertig)
  und bitte melden.
- Kein `temperature`/`top_k` (auf Foundry für diese Modelle nicht unterstützt), kein Prefill,
  kein `tool_choice`, keine Tools.
- count_tokens-Bodys enthalten nur `model`, `system`, `messages`.

## Antwort und Fehler

- HTTP 200: Antwort-JSON unverändert zurückgeben. `core/ki` wertet `stop_reason` aus:
  `end_turn` → JSON aus den `text`-Blöcken; `refusal` (mit `stop_details.category`) und
  `max_tokens` → Kapitel wird mit Grund verworfen, der Lauf geht weiter. Serverseitige
  `fallbacks` gibt es nur bei der Claude API (siehe oben), auf Foundry nicht.
- HTTP ≠ 200: mit lesbarem Text ablehnen, z. B. `HTTP 401: <error.message>`. Alternativ das
  Fehler-JSON (`{"type":"error","error":{…}}`) zurückgeben – beides wird verständlich angezeigt.
  Häufig: 401 (Schlüssel falsch), 404 (Endpoint oder Modell-/Deployment-Name falsch),
  429 (Rate-Limit), 529 (überlastet). Die deutschen Meldungen erzeugt der Rust-Kern
  (`KiFehler`), `kiFehlerAnzeige` im Slice „ki“ fasst sie für die Oberfläche zusammen.
- 429/529/5xx: höchstens 2 Wiederholungen mit Backoff (`retry-after` beachten).
- Timeout großzügig (≥ 10 min): nicht gestreamt, bis 16 000 Ausgabe-Tokens mit adaptivem Denken.

## Prompt Caching

- Das ganze Buch ist der stabile Prefix (`system` + erster Content-Block mit `cache_control`);
  pro Kapitel ändert sich nur der zweite Block. Die Prüfung läuft Kapitel für Kapitel
  nacheinander, die erste Anfrage schreibt den Cache, alle weiteren lesen ihn (5 min TTL).
- Mindestlänge 512 Tokens (5.5-Modelle). Kontrolle über `usage.cache_read_input_tokens`.
  Caches gelten je Foundry-Ressource bzw. Anthropic-Organisation und je Modell (springt der
  Fallback auf ein anderes Modell, wird dessen Cache neu geschrieben).

## Harte Regeln

- Der Rust-Teil der KI hat keinen Dateizugriff. `core/ki` bekommt nur `ProjektLeser`
  (Tests: `core/ki/importe.test.ts`, Laufzeit-Test mit Wachhund-Dateisystem in `ki.test.ts`).
- Allowlist (E12) und Antwortprüfung (Zitate, Ersatztext, bewusst Vages, Plan-Bezug) liegen vollständig in
  TypeScript. Seit 2026-10-09 gehen auch Plan-Felder von Figuren und Kapitelplänen an das Modell (F-05);
  Antworten tragen dafür im Schema `plan: {figur, kapitel, feld}` (leer, wenn kein Plan-Bezug).

## Kosten (grob, Listenpreise USD pro Mio. Tokens)

| Modell | Eingabe | Ausgabe |
| --- | --- | --- |
| Haiku 5.5 | 0,10 (über 100 000 Eingabe-Tokens: 0,50) | 0,50 (2,50) |
| Sonnet 5.5 | 2 | 10 |
| Opus 5.5 | 4 | 20 |

Cache-Lesen ≈ 10 %, Cache-Schreiben ≈ 125 % des Eingabepreises. Die Claude API rechnet direkt
zu diesen Listenpreisen ab, Foundry über den Microsoft Marketplace zu denselben Preisen.

## Vorschläge für Figuren, Orte und Beziehungen (`vorschlaege.ts`)

Die KI schlägt aus dem Manuskript Figuren, Orte und Beziehungen vor; Leon übernimmt oder verwirft jeden
Vorschlag. Die KI-Funktion liest nur (`ProjektLeser`), gespeichert wird über den Store in
`.plotwerk/vorschlaege.json` (`KiVorschlaege`, Status je Vorschlag `neu`/`uebernommen`/`verworfen`).

### Request (ein Request für das ganze Buch)

```json
{
  "model": "<deployments.pruefung> (Tiefencheck: <deployments.tiefencheck>)",
  "max_tokens": 32000,
  "system": [{ "type": "text", "text": "<SYSTEM_VORSCHLAEGE>" }],
  "messages": [{ "role": "user", "content": [
    { "type": "text", "text": "<Buchkontext wie bei der Prüfung>", "cache_control": { "type": "ephemeral" } },
    { "type": "text", "text": "<vorschlagsAufgabe()>" }
  ]}],
  "output_config": { "effort": "medium (Tiefencheck: high)", "format": { "type": "json_schema", "schema": "<vorschlagsSchema(kontext)>" } }
}
```

- `system`: `SYSTEM_VORSCHLAEGE` (Wortlaut in `vorschlaege.ts`): Rolle, Regeln für Figuren/Orte/Beziehungen,
  Belege wörtlich, bewusst Vages offenlassen, kein Text für das Buch.
- Buchkontext: `baueBuchKontext` (Allowlist E12) – derselbe Prefix wie bei der Prüfung. Bestehende
  Beziehungen, `kurz`, `wahrheit`, `notizen`, Beschreibungen und gespeicherte Vorschläge gehen **nicht** mit;
  Doppeltes filtert die App nach der Antwort.
- `max_tokens` 32 000 (ganzes Buch in einer Antwort): Der Rust-Timeout sollte ≥ 10 min sein.
- Exakter Body für ein Projekt: `await vorschlagsAnfrage(leser, einstellungen, { tiefencheck })`.

Aufgabe (`vorschlagsAufgabe()`, wörtlich):

```
<aufgabe art="vorschlaege">
Lies das ganze Buch und schlage Figuren, Orte und Beziehungen zwischen Figuren vor.
- figuren und orte: nur, was noch nicht unter <angaben> angelegt ist.
- beziehungen: zwischen angelegten Figuren (von/zu = id) und vorgeschlagenen Figuren (von/zu = name, genau wie unter figuren).
- Jeder Vorschlag mit wörtlichen Belegen aus dem <text> der Kapitel.
</aufgabe>
```

### Antwortschema (`vorschlagsSchema`)

Alle Objekte `additionalProperties: false`, alle Felder Pflicht. `KAPITEL` = enum der Kapitel-IDs mit Text
(Buchreihenfolge).

```
{
  figuren:     [{ name: string, aliase: string[], rolle: "haupt"|"neben", kurz: string,
                  belege: [{ kapitel: KAPITEL, zitat: string }] }],
  orte:        [{ name: string, aliase: string[], in: string,          // Name des übergeordneten Orts oder ""
                  belege: [{ kapitel: KAPITEL, zitat: string }] }],
  beziehungen: [{ von: string, zu: string,                             // id einer angelegten Figur ODER exakter name einer vorgeschlagenen
                  art: string,                                         // höchstens 4 Wörter, Sicht von „von“
                  kategorie: "arbeit"|"dates"|"sonstige",
                  abKapitel: KAPITEL,                                  // Kapitel des ersten Belegs
                  unsicher: boolean,
                  belege: [{ kapitel: KAPITEL, zitat: string }],       // mindestens 1
                  begruendung: string }]
}
```

Beispiel (Demo-Projekt ohne angelegte Figur „Fiete“):

```json
{
  "figuren": [{ "name": "Fiete", "aliase": [], "rolle": "neben", "kurz": "nur erwähnt",
                "belege": [{ "kapitel": "funkstille", "zitat": "ob er die Krabben wieder für Fiete mitnimmt" }] }],
  "orte": [{ "name": "Fischrestaurant", "aliase": [], "in": "", "belege": [{ "kapitel": "ebbe", "zitat": "Das Fischrestaurant liegt zwei Straßen hinter dem Linden Hof." }] }],
  "beziehungen": [{ "von": "paul", "zu": "Fiete", "art": "kauft für ihn ein", "kategorie": "sonstige", "abKapitel": "funkstille",
                    "unsicher": true, "belege": [{ "kapitel": "funkstille", "zitat": "ob er die Krabben wieder für Fiete mitnimmt" }],
                    "begruendung": "Der Mann am Fischstand fragt, ob Paul die Krabben wieder für Fiete mitnimmt." }]
}
```

### Prüfung der Antwort (`pruefeVorschlaege`)

- Jedes Zitat muss nach E6 wörtlich im angegebenen Kapitel stehen (`Pruefer.zitatFinden`), sonst wird der
  ganze Vorschlag verworfen. Gespeichert wird der Originalwortlaut des Klartexts, Belege in Buchreihenfolge.
- Figuren/Orte, die schon angelegt sind (Name, Alias, Form; ohne Artikel, ohne Groß/klein), zählen als
  `bereitsAngelegt`; ebenso Beziehungen, wenn das Paar schon eine Beziehung hat.
- `von`/`zu`: ID einer angelegten Figur, Name/Alias einer angelegten Figur, Name einer in dieser Antwort
  vorgeschlagenen Figur oder eines früher vorgeschlagenen, noch offenen Vorschlags; sonst verworfen. Verweist eine
  Beziehung auf eine verworfene Figur, wird sie mit verworfen.
- Ersatztext-Filter (`ersatztextGrund`, `fremdesZitat`) auf `kurz`, `art` und `begruendung`; `art` höchstens 4 Wörter.
- Beziehungen zu Figuren mit Existenz „bewusst vage“ sind immer `unsicher: true`.
- `abKapitel` muss ein Kapitel sein, sonst Kapitel des ersten Belegs. `in` wird zu einem angelegten oder
  vorgeschlagenen Ort aufgelöst, sonst weggelassen.
- Schlüssel: `figur:<slug>`, `ort:<slug>`, `beziehung:<slug a>|<slug b>@<abKapitel>` (Slugs der Namen, Paar
  sortiert). Von Leon Übernommenes oder Verworfenes (Schlüssel bzw. verworfenes Paar) kommt nicht wieder
  (`bereitsEntschieden`); `mischeVorschlaege` mischt neue Läufe so in die Ablage.

### Lauf mit vorbereiteter Antwort

```ts
import { werteVorschlagsAntwortAus, mischeVorschlaege } from '@core/ki/index';
const ergebnis = await werteVorschlagsAntwortAus(leser, antwort, { einstellungen, tiefencheck: false });
// antwort: Objekt bzw. JSON-Text im Schema oben oder vollständige Messages-API-Antwort
// ergebnis: { figuren, orte, beziehungen, verworfen[{grund, roh}], bereitsAngelegt, bereitsEntschieden, tokens, modell, kostenUsd, datum }
const { ablage } = mischeVorschlaege(daten.kiVorschlaege, ergebnis, { datum: ergebnis.datum, modell: ergebnis.modell });
// speichern: store.speichereKiVorschlaege(ablage) bzw. core/projekt speichereKiVorschlaege(fs, ablage)
```

Die Prüfung ist identisch mit `schlageVorschlaegeVor`; ohne Request gibt es nur keine Token-Nutzung.

## Werkzeug-Aufgaben (G1, G3, G6): `aufgabe.ts`

Eigene KI-Aufgaben beschreiben eine `AufgabenDefinition` (name, `art` für den Aufgabenkopf, Rolle, System-Prompt,
Aufgabentext, Schema, optional `kapitelBis`, `auswerten`). `fuehreAufgabeAus` baut denselben Body wie die Prüfung
(Buch als gecachter Prefix, Aufgabe in `<aufgabe art="…" …>`, Structured Outputs) und ruft `auswerten` mit einer
`AufgabenPruefung`: `zitate()` prüft Zitate wörtlich nach E6, `text()` verwirft Formulierungsvorschläge und fremde
Zitate. `schaetzeAufgabe` liefert die Kostenschätzung, `werteAufgabenAntwortAus` wertet vorbereitete Antworten aus.
Die Browser-Demo beantwortet Aufgaben über `src/backend/ki/demoAntworten/` (je Gruppe eine Datei, Schlüssel = `art`).

