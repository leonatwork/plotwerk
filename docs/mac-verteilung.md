# Plotwerk auf dem Mac verteilen

Stand: G8. Drei Stufen, jede baut auf der vorigen auf:

| Stufe | Wofür | Was nötig ist | Status |
|---|---|---|---|
| 1. Ad-hoc-Signatur | Plotwerk auf Leons eigenem Mac | nichts | **aktiv** (Standard bei jedem Build) |
| 2. Developer ID + Notarisierung | Weitergabe an andere Macs ohne Gatekeeper-Warnung | Apple Developer Program, Zertifikat | vorbereitet: `scripts/notarisieren.sh` |
| 3. Auto-Update | Plotwerk aktualisiert sich selbst | Stufe 2, Signierschlüssel, Speicherort für `latest.json` | vorbereitet, **deaktiviert** |

---

## 1. Ad-hoc-Signatur (Standard)

`src-tauri/tauri.conf.json`:

```json
"macOS": { "minimumSystemVersion": "12.0", "signingIdentity": "-", "hardenedRuntime": true }
```

`"-"` bedeutet: Tauri signiert die App beim Bauen ad-hoc (ohne Zertifikat). Das reicht, damit macOS
(besonders auf Apple Silicon) die App startet und der Schlüsselbund-Zugriff für den Claude-API-Schlüssel
stabil bleibt.

```sh
npm run tauri build                     # App + DMG unter src-tauri/target/release/bundle/
codesign -dv src-tauri/target/release/bundle/macos/Plotwerk.app   # zeigt „Signature=adhoc“
```

Ist die Umgebungsvariable `APPLE_SIGNING_IDENTITY` gesetzt, hat sie Vorrang vor `"-"` – so nutzt das
Skript aus Stufe 2 dieselbe Konfiguration.

Grenzen: Eine ad-hoc signierte App läuft auf dem Mac, auf dem sie gebaut wurde. Auf anderen Macs
blockiert Gatekeeper sie („kann nicht geöffnet werden, da der Entwickler nicht verifiziert werden kann“);
dort hilft nur Rechtsklick → Öffnen oder Stufe 2.

## 2. Developer ID und Notarisierung

### Einmalig einrichten

1. **Apple Developer Program** (99 €/Jahr) unter developer.apple.com abschließen. Team-ID notieren
   (Account → Membership, 10 Zeichen).
2. **Zertifikat „Developer ID Application“** anlegen: Xcode → Settings → Accounts → Team → Manage
   Certificates → „+“ → *Developer ID Application*. Prüfen:
   ```sh
   security find-identity -v -p codesigning
   # 1) ABC… "Developer ID Application: Leon Nachname (TEAMID1234)"
   ```
   Das Zertifikat samt privatem Schlüssel als .p12 sichern (Schlüsselbundverwaltung → Exportieren).
3. **App-spezifisches Passwort** unter account.apple.com → Anmeldung und Sicherheit erzeugen.
4. **Schlüsselbund-Profil** für die Notarisierung anlegen (fragt das Passwort ab, speichert es im
   Schlüsselbund – nie in eine Datei schreiben):
   ```sh
   xcrun notarytool store-credentials "plotwerk-notar" --apple-id "leon@…" --team-id "TEAMID1234"
   ```

### Bauen, signieren, notarisieren

In `scripts/notarisieren.sh` die Platzhalter oben ersetzen oder per Umgebung setzen:

| Variable | Beispiel |
|---|---|
| `DEVELOPER_ID` | `Developer ID Application: Leon Nachname (TEAMID1234)` |
| `APPLE_TEAM_ID` | `TEAMID1234` |
| `NOTAR_PROFIL` | `plotwerk-notar` (Standard) |

```sh
scripts/notarisieren.sh --trocken    # zeigt nur die Schritte
scripts/notarisieren.sh              # baut, signiert, notarisiert, heftet das Ticket an
scripts/notarisieren.sh --ohne-bau   # nimmt den vorhandenen Build
```

Das Skript bricht ab, solange Platzhalter drinstehen, das Zertifikat fehlt oder das Profil ungültig ist.
Ablauf: `tauri build` mit `APPLE_SIGNING_IDENTITY` (Developer ID, Hardened Runtime, Zeitstempel) →
`codesign --verify` und Prüfung auf Developer ID/Team/Runtime → DMG signieren →
`xcrun notarytool submit --wait` (bei Ablehnung wird `notarytool log` ausgegeben) →
`xcrun stapler staple` für DMG und App → `spctl --assess` → Kopie nach `dist-app/` (nicht eingecheckt).

Tauri könnte auch selbst notarisieren (`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID`); das Skript entfernt
diese Variablen beim Bauen bewusst, damit nur ein nachvollziehbarer Weg existiert.

Entitlements braucht Plotwerk nicht: WKWebView läuft ohne JIT-Ausnahme, Dateizugriffe gehen über den
Rust-Kern, der Schlüsselbund über `keyring`. Erst wenn Apple bei der Notarisierung etwas bemängelt, eine
`src-tauri/Entitlements.plist` anlegen und in `bundle.macOS.entitlements` eintragen.

## 3. Auto-Update (vorbereitet, deaktiviert)

Bis Leon einen Speicherort hat (eigener Server, GitHub Releases, S3 …), bleibt das Update aus:
`bundle.createUpdaterArtifacts` ist `false`, das Plugin `tauri-plugin-updater` ist **nicht** eingebunden.
Die vorbereitete Konfiguration liegt in `src-tauri/tauri.updater.conf.json` und wird nur benutzt, wenn
man sie beim Bauen ausdrücklich mit `--config` dazunimmt.

### Einschalten

1. **Signierschlüssel für Updates** erzeugen (unabhängig vom Apple-Zertifikat, nur für Plotwerk):
   ```sh
   npx tauri signer generate -w ~/.tauri/plotwerk.key
   ```
   Privaten Schlüssel und Passwort sicher aufbewahren – ohne ihn kann keine bereits installierte
   Version mehr aktualisiert werden. Inhalt von `~/.tauri/plotwerk.key.pub` in
   `src-tauri/tauri.updater.conf.json` bei `pubkey` eintragen, den Speicherort bei `endpoints`.
2. **Plugin einbinden** (Abhängigkeiten, Rust und Rechte):
   ```sh
   cd src-tauri && cargo add tauri-plugin-updater@2 && cd ..
   npm install @tauri-apps/plugin-updater@2
   ```
   In `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())`;
   in `src-tauri/capabilities/default.json`: `"updater:default"`. Die CSP braucht keinen Eintrag, weil
   das Plugin im Rust-Kern lädt.
3. **Oberfläche**: Menü „Plotwerk → Nach Updates suchen …“ mit `check()` und `downloadAndInstall()` aus
   `@tauri-apps/plugin-updater`, danach Neustart anbieten. Nie automatisch im Hintergrund installieren,
   solange ungespeicherte Änderungen offen sind.
4. **Bauen** (nach Stufe 2, damit das Update notarisiert ist):
   ```sh
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/plotwerk.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"
   APPLE_SIGNING_IDENTITY="Developer ID Application: …" \
     npm run tauri build -- --config src-tauri/tauri.updater.conf.json
   ```
   Ergebnis zusätzlich: `bundle/macos/Plotwerk.app.tar.gz` und `Plotwerk.app.tar.gz.sig`.
5. **Update-Feed** `latest.json` neben die Dateien auf den Speicherort legen:
   ```json
   {
     "version": "0.2.0",
     "notes": "Recherche-Ablage, Zeitleiste …",
     "pub_date": "2026-10-10T12:00:00Z",
     "platforms": {
       "darwin-aarch64": { "signature": "<Inhalt von Plotwerk.app.tar.gz.sig>", "url": "https://…/Plotwerk_0.2.0_aarch64.app.tar.gz" },
       "darwin-x86_64": { "signature": "<…>", "url": "https://…/Plotwerk_0.2.0_x64.app.tar.gz" }
     }
   }
   ```
   `version` muss größer sein als die installierte Version (`version` in `tauri.conf.json` und
   `Cargo.toml` vorher hochzählen). Der Speicherort muss per HTTPS erreichbar sein.

### Datenschutz

Das Update fragt nur den eingetragenen Speicherort ab und schickt dabei Version und Architektur mit.
Projektdaten verlassen den Mac dabei nie.
