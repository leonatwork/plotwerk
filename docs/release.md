# Release auf GitHub

Plotwerk wird über GitHub Releases verteilt. Ein Tag `v*` startet `.github/workflows/release.yml`
und baut eine universelle Mac-App (Apple Silicon und Intel). Ergebnis ist ein **Release-Entwurf** mit

- `Plotwerk.dmg` (fester Name für `install.sh` und den README-Link) und `Plotwerk_<version>_universal.dmg`
- `Plotwerk.app.tar.gz` und `.sig` (für den Updater, signiert mit dem Update-Schlüssel)
- `latest.json` (Update-Feed, den installierte Apps abfragen)

Erst nach dem Veröffentlichen des Entwurfs sehen `install.sh` und der Updater die neue Version.

## Neue Version veröffentlichen

```sh
node scripts/version.mjs 0.2.0    # package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock
git commit -am "Version 0.2.0"
git tag v0.2.0
git push --follow-tags
```

Danach auf GitHub unter *Releases* den Entwurf prüfen, die Notizen ergänzen (Neuerungen auf Deutsch und
Englisch, dazu der Installationsbefehl aus der README) und **Publish release** klicken. Der Update-Dialog der
App zeigt nicht diese Notizen, sondern den kurzen Link aus `latest.json`. Wer dort mehr Text möchte, ersetzt vor
dem Veröffentlichen `latest.json` mit geändertem `notes`-Feld (`gh release upload <tag> latest.json --clobber`).
Die Signatur gilt nur für das App-Archiv, das Feld darf also geändert werden. Ein Tag mit Bindestrich (`v0.2.0-beta.1`) wird als Vorabversion markiert. Updater und
`install.sh` ignorieren Vorabversionen, weil GitHub sie nicht als *latest* führt.

## Secrets (Repository → Settings → Secrets and variables → Actions)

| Secret | Pflicht | Inhalt |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | ja | Inhalt von `~/.tauri/plotwerk.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | nein | Passwort des Schlüssels (aktuell leer) |
| `APPLE_CERTIFICATE` | später | „Developer ID Application“-Zertifikat als .p12, Base64 (`base64 -i zertifikat.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | später | Passwort der .p12-Datei |
| `APPLE_SIGNING_IDENTITY` | später | z. B. `Developer ID Application: Leon Machnik (TEAMID1234)` |
| `APPLE_ID` · `APPLE_PASSWORD` · `APPLE_TEAM_ID` | später | Apple-ID, app-spezifisches Passwort, Team-ID (Notarisierung) |

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/plotwerk.key
```

**Update-Schlüssel sichern!** Der öffentliche Teil steht in `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`). Geht `~/.tauri/plotwerk.key` verloren, können bereits installierte
Versionen keine Updates mehr annehmen. Dann bleibt nur, mit `install.sh` neu zu installieren.
Den Schlüssel also zusätzlich im Passwortmanager ablegen.

## Ohne und mit Apple Developer ID

**Ohne Developer ID (Stand jetzt):** Die App ist ad-hoc signiert.

- `install.sh` (`curl … | bash`) installiert ohne Warnung, weil `curl` kein Quarantäne-Attribut setzt.
- Wer `Plotwerk.dmg` im Browser lädt, sieht beim ersten Start „Apple konnte nicht überprüfen …“.
  Lösung: *Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“*. Das steht so auch in
  der README.
- Updates über den eingebauten Updater funktionieren, denn sie sind mit dem Update-Schlüssel
  signiert, nicht von Apple.

**Mit Developer ID** (99 €/Jahr, developer.apple.com): Die Apple-Secrets oben eintragen. Der
Workflow signiert und notarisiert dann automatisch, und die DMG öffnet sich per Doppelklick ohne
Warnung. Lokal geht das weiterhin mit `scripts/notarisieren.sh` (siehe `docs/mac-verteilung.md`).

## Updater in der App

- Menü **Plotwerk → Nach Updates suchen …** meldet „aktuell“, ein verfügbares Update oder einen Fehler.
- Release-Builds prüfen 10 s nach dem Start einmal still und melden sich nur, wenn es ein Update gibt.
- Installiert wird nur nach Bestätigung. Danach beendet sich Plotwerk geordnet (alle Schreibvorgänge
  fertig, Schnappschüsse angelegt) und startet neu (`src-tauri/src/aktualisierung.rs`).
- Abgefragt wird nur `https://github.com/leonatwork/plotwerk/releases/latest/download/latest.json`,
  Projektdaten gehen nicht mit.

## Einmalig: Repository öffentlich machen

Die frühe Git-History enthält Inhalte aus dem privaten Romanprojekt. Vor dem Umschalten auf
„public“ wird deshalb die History ersetzt:

1. Alte History als privates Archiv sichern, z. B. als eigenes privates Repo `plotwerk-archiv`.
2. Aus dem bereinigten Stand einen einzelnen neuen Anfangs-Commit bauen (`git checkout --orphan`),
   als `main` force-pushen und alle anderen Branches und Tags auf GitHub löschen.
3. Lokale Worktrees und Branches mit alter History nicht mehr nach GitHub pushen.
4. Secrets setzen, Discussions einschalten, Repository-Beschreibung anpassen.
5. Sichtbarkeit auf **Public** stellen, dann `v0.1.0` taggen.

GitHub kann alte Commits noch eine Weile über ihre SHA ausliefern. Wer sicher gehen will, lässt
sie nach dem Force-Push vom GitHub-Support entfernen („remove cached views / dangling commits“).
