# Plotwerk

Lokale Mac-App (Tauri 2 + React/TypeScript) zum Schreiben und Planen von Romanen. Öffentlich auf GitHub unter FSL-1.1-ALv2 (`LICENSE.md`); Beiträge unter Apache-2.0 mit DCO-Sign-off (`CONTRIBUTING.md`).

- Anforderungen: `docs/anforderungen-v1.1.md` (v1.0 ist der Ausgangsstand); Entscheidungen, Phasen und Zuständigkeiten: `docs/architektur.md` (hat Vorrang). Abnahmestand: `docs/abnahme.md`.
- UI folgt `docs/design/screens/*.dc.html`. Farben, Abstände und Schriften exakt aus den Screens übernehmen; Farben nur über die Tokens in `src/theme/tokens.css`.
- Datenmodell: `core/model/types.ts` – nur additiv ändern.
- `core/` ist reines TypeScript ohne DOM und ohne Tauri; dort liegt die testbare Logik (Vitest).
- Die KI schreibt nie Text: `core/ki` darf nur `ProjektLeser` nutzen, nie `ProjektDateisystem`.
- Releases: Tag `v*` → `.github/workflows/release.yml`, Ablauf in `docs/release.md`; Version mit `node scripts/version.mjs <x.y.z>` setzen.
- Keine Inhalte aus privaten Manuskripten ins Repo; Beispiele nur aus dem Demo-Roman in `fixtures/`.
- Rust liegt unter `/opt/homebrew/opt/rustup/bin` (vor Cargo-Befehlen `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`).

## Befehle

- `npm run dev` – Browser-Demo mit Demo-Projekt (Vite, Port 5173)
- `npm test` – Vitest (Projekte core, ui, abnahme; Akzeptanzkriterien in `abnahme/akzeptanz.test.tsx`)
- `npm run typecheck` – TypeScript
- `npm run tauri dev` – Mac-App
