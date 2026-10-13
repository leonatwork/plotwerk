# Mitmachen bei Plotwerk

Schön, dass du helfen willst! Fehlerberichte, Ideen, Übersetzungen und Code sind willkommen.

*English speakers: issues and pull requests in English are just as welcome. The codebase uses German
identifiers and comments; please keep that style when changing existing code.*

## Bevor du loslegst

- **Fehler oder Idee?** Lege ein [Issue](../../issues/new/choose) an. Für Fragen und lose Ideen
  gibt es die Discussions.
- **Größere Änderungen** (neue Bereiche, neue Abhängigkeiten, Änderungen am Projektformat) bitte
  zuerst in einem Issue besprechen. So arbeitest du nicht an etwas, das nicht übernommen werden kann.
- **Kleine Korrekturen** (Tippfehler, offensichtliche Fehler, Tests) direkt als Pull Request.
- **Sicherheitslücken** bitte nicht öffentlich melden, sondern wie in [SECURITY.md](SECURITY.md)
  beschrieben.

## Grundsätze, die jeder Beitrag einhalten muss

Plotwerk hat ein paar feste Regeln (ausführlich in [docs/architektur.md](docs/architektur.md)):

1. **Die KI schreibt nie.** Keine Formulierungsvorschläge, kein Umschreiben, kein Schreibzugriff.
   `core/ki` darf nur `ProjektLeser` nutzen, nie `ProjektDateisystem`. Jede KI-Beobachtung braucht
   ein wörtliches Zitat aus dem Buch.
2. **Lokal zuerst.** Alles liegt als Markdown/JSON im Projektordner und bleibt ohne Plotwerk
   lesbar. Ohne Netz funktioniert alles außer der KI.
3. **Datenmodell nur additiv ändern** (`core/model/types.ts`). Unbekannte Felder in Projektdateien
   bleiben beim Speichern erhalten.
4. **`core/` ist reines TypeScript** ohne DOM und ohne Tauri, mit Tests in Vitest.
5. **Design:** Farben nur über die Tokens in `src/theme/tokens.css`; die Vorlagen liegen in
   `docs/design/screens/`.

## Entwickeln

```sh
npm install
npm run dev          # Browser-Demo mit Demo-Projekt: http://localhost:5173
npm run tauri dev    # Mac-App (braucht Rust)
npm test             # Vitest
npm run typecheck
cd src-tauri && cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

Die Browser-Demo braucht weder Rust noch KI-Schlüssel; eine eingebaute Demo-KI antwortet.
Akzeptanzkriterien stehen in `abnahme/akzeptanz.test.tsx`, der Abnahmestand in `docs/abnahme.md`.

## Pull Requests

- Ein Thema pro Pull Request, mit Tests für neue Logik.
- CI muss grün sein (Typecheck, Vitest, Build, Rust fmt/Clippy/Tests).
- Bei sichtbaren Änderungen: Screenshot oder kurzes Video in die Beschreibung.
- Commit-Nachrichten gern auf Deutsch, kurz und im Präsens („Zeitleiste zeigt Wochentage“).

## Lizenz deiner Beiträge und Sign-off

Plotwerk steht unter der [Functional Source License](LICENSE.md); jede Version wird nach zwei Jahren
automatisch Apache-2.0. **Deine Beiträge stehen sofort unter der
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).** Mit dem Einreichen eines Pull
Requests erklärst du dich damit einverstanden.

Bestätige außerdem jeden Commit mit einem Sign-off:

```sh
git commit -s -m "Zeitleiste zeigt Wochentage"
```

Damit hängt Git die Zeile `Signed-off-by: Dein Name <deine@mail>` an. Sie bestätigt das
[Developer Certificate of Origin](https://developercertificate.org/): Du hast den Beitrag selbst
geschrieben oder darfst ihn einreichen. Vergessene Sign-offs ergänzt
`git rebase --signoff main` und danach `git push --force-with-lease`. Die CI prüft das.

**Warum Apache-2.0 und nicht FSL?** Ab Version 1.0 finanziert sich Plotwerk über Lizenzen für die
fertige Mac-App und später über das optionale Abo Plotwerk+ mit eingebauter KI. Unter Apache-2.0 darf der
Maintainer Beiträge dafür verwenden. Dein Urheberrecht bleibt bei dir, und du darfst deinen Code
weiterhin beliebig nutzen.

**Name und Icon** gehören nicht zur Lizenz. Forks und eigene Builds brauchen einen anderen Namen und
ein anderes Icon.

## Verhalten

Sei freundlich und konstruktiv, auch in der Kritik. Beiträge werden nach Inhalt beurteilt, nicht
nach der Person. Belästigung oder herabwürdigende Kommentare führen zum Ausschluss.
