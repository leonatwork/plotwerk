#!/usr/bin/env bash
# =============================================================================
# Plotwerk – Mac-App mit Developer-ID signieren, notarisieren und „stapeln“.
#
# Anleitung: docs/mac-verteilung.md. Ohne Zertifikat baut `npm run tauri build`
# die App ad-hoc signiert (tauri.conf.json → bundle.macOS.signingIdentity "-");
# dieses Skript ist nur für die Weitergabe an andere Macs nötig.
#
# Ablauf
#   1. App und DMG bauen, App mit „Developer ID Application“ und Hardened Runtime signieren
#      (Tauri übernimmt das, wenn APPLE_SIGNING_IDENTITY gesetzt ist)
#   2. Signaturen prüfen (keine Ad-hoc-Signatur, Zeitstempel, Hardened Runtime)
#   3. DMG signieren
#   4. DMG bei Apple einreichen: xcrun notarytool submit --wait
#   5. Notarisierungs-Ticket anheften: xcrun stapler staple (DMG und App)
#   6. Gatekeeper-Prüfung mit spctl, Ergebnis nach dist-app/
#
# Aufruf (aus dem Projektordner):
#   scripts/notarisieren.sh             # bauen, signieren, notarisieren
#   scripts/notarisieren.sh --trocken   # nur zeigen, was passieren würde
#   scripts/notarisieren.sh --ohne-bau  # vorhandenen Build aus src-tauri/target verwenden
#
# Zugangsdaten: entweder als Umgebungsvariablen setzen oder die Platzhalter unten ersetzen.
# Nie Passwörter in diese Datei schreiben – für die Notarisierung ein Schlüsselbund-Profil
# anlegen (einmalig, fragt das App-spezifische Passwort ab):
#   xcrun notarytool store-credentials "plotwerk-notar" \
#     --apple-id "APPLE_ID@BEISPIEL.DE" --team-id "TEAMID1234"
# =============================================================================
set -euo pipefail

# --- Platzhalter: durch Leons Daten ersetzen oder per Umgebung setzen ---------
# Name des Zertifikats, wie `security find-identity -v -p codesigning` ihn zeigt
DEVELOPER_ID="${DEVELOPER_ID:-Developer ID Application: VORNAME NACHNAME (TEAMID1234)}"
# Team-ID (10 Zeichen, developer.apple.com → Membership)
APPLE_TEAM_ID="${APPLE_TEAM_ID:-TEAMID1234}"
# Schlüsselbund-Profil aus `xcrun notarytool store-credentials`
NOTAR_PROFIL="${NOTAR_PROFIL:-plotwerk-notar}"
# ------------------------------------------------------------------------------

TROCKEN=0
BAUEN=1
for arg in "$@"; do
  case "$arg" in
    --trocken) TROCKEN=1 ;;
    --ohne-bau) BAUEN=0 ;;
    -h | --hilfe | --help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unbekannte Option: $arg (--trocken, --ohne-bau, --hilfe)" >&2
      exit 2
      ;;
  esac
done

WURZEL="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WURZEL"

schritt() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fehler() {
  printf '\033[31mFehler:\033[0m %s\n' "$*" >&2
  exit 1
}
fuehre_aus() {
  printf '    $'
  printf ' %q' "$@"
  printf '\n'
  if [ "$TROCKEN" -eq 0 ]; then "$@"; fi
}

# --- Voraussetzungen ----------------------------------------------------------
[ "$(uname -s)" = "Darwin" ] || fehler "Nur auf macOS möglich."
case "$DEVELOPER_ID$APPLE_TEAM_ID" in
  *VORNAME* | *NACHNAME* | *TEAMID1234*)
    [ "$TROCKEN" -eq 1 ] || fehler "Platzhalter noch nicht ersetzt: DEVELOPER_ID und APPLE_TEAM_ID setzen (siehe docs/mac-verteilung.md)."
    ;;
esac
for werkzeug in xcrun codesign spctl ditto hdiutil; do
  command -v "$werkzeug" >/dev/null || fehler "$werkzeug fehlt (Xcode bzw. Command Line Tools installieren)."
done
if [ "$TROCKEN" -eq 0 ]; then
  security find-identity -v -p codesigning | grep -qF "$DEVELOPER_ID" ||
    fehler "Zertifikat „$DEVELOPER_ID“ nicht im Schlüsselbund (security find-identity -v -p codesigning)."
  xcrun notarytool history --keychain-profile "$NOTAR_PROFIL" >/dev/null 2>&1 ||
    fehler "Schlüsselbund-Profil „$NOTAR_PROFIL“ fehlt oder ist ungültig (xcrun notarytool store-credentials …)."
fi
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -n 1)"
ARCH="$(uname -m)"
[ "$ARCH" = "arm64" ] && DMG_ARCH="aarch64" || DMG_ARCH="$ARCH"
BUNDLE="src-tauri/target/release/bundle"
APP="$BUNDLE/macos/Plotwerk.app"
DMG="$BUNDLE/dmg/Plotwerk_${VERSION}_${DMG_ARCH}.dmg"
ZIEL="dist-app"

# --- 1. Bauen und signieren -----------------------------------------------------
if [ "$BAUEN" -eq 1 ]; then
  schritt "1/6 App bauen und mit Developer ID signieren (Plotwerk $VERSION, $ARCH)"
  # Tauri soll nur signieren, nicht selbst notarisieren: Apple-Zugangsdaten aus der Umgebung entfernen.
  fuehre_aus env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
    APPLE_SIGNING_IDENTITY="$DEVELOPER_ID" npm run tauri build -- --bundles app,dmg
else
  schritt "1/6 Vorhandenen Build verwenden"
fi
if [ "$TROCKEN" -eq 0 ]; then
  [ -d "$APP" ] || fehler "$APP nicht gefunden."
  [ -f "$DMG" ] || fehler "$DMG nicht gefunden."
fi

# --- 2. Signatur prüfen -----------------------------------------------------------
schritt "2/6 Signatur der App prüfen"
fuehre_aus codesign --verify --deep --strict --verbose=2 "$APP"
if [ "$TROCKEN" -eq 0 ]; then
  INFO="$(codesign -dvv "$APP" 2>&1)"
  echo "$INFO" | grep -q "Signature=adhoc" && fehler "Die App ist nur ad-hoc signiert – APPLE_SIGNING_IDENTITY wurde nicht übernommen."
  echo "$INFO" | grep -qF "Authority=Developer ID Application" || fehler "Keine Developer-ID-Signatur gefunden."
  echo "$INFO" | grep -q "TeamIdentifier=$APPLE_TEAM_ID" || fehler "Team-ID der Signatur passt nicht zu $APPLE_TEAM_ID."
  echo "$INFO" | grep -q "Timestamp=" || fehler "Signatur ohne sicheren Zeitstempel."
  codesign -d --verbose=4 "$APP" 2>&1 | grep -q "flags=.*runtime" || fehler "Hardened Runtime ist nicht aktiv."
  echo "    Developer ID, Zeitstempel und Hardened Runtime in Ordnung."
fi

# --- 3. DMG signieren -----------------------------------------------------------------
schritt "3/6 DMG signieren"
fuehre_aus codesign --force --sign "$DEVELOPER_ID" --timestamp "$DMG"
fuehre_aus codesign --verify --verbose=2 "$DMG"

# --- 4. Notarisieren --------------------------------------------------------------------
schritt "4/6 Bei Apple notarisieren (kann einige Minuten dauern)"
if [ "$TROCKEN" -eq 0 ]; then
  ERGEBNIS="$(xcrun notarytool submit "$DMG" --keychain-profile "$NOTAR_PROFIL" --wait --output-format json)" || true
  echo "$ERGEBNIS"
  KENNUNG="$(printf '%s' "$ERGEBNIS" | sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -n 1)"
  STATUS="$(printf '%s' "$ERGEBNIS" | sed -n 's/.*"status" *: *"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ "$STATUS" != "Accepted" ]; then
    [ -n "$KENNUNG" ] && xcrun notarytool log "$KENNUNG" --keychain-profile "$NOTAR_PROFIL" || true
    fehler "Notarisierung nicht angenommen (Status: ${STATUS:-unbekannt}). Protokoll siehe oben."
  fi
else
  fuehre_aus xcrun notarytool submit "$DMG" --keychain-profile "$NOTAR_PROFIL" --wait
fi

# --- 5. Ticket anheften -------------------------------------------------------------------
schritt "5/6 Ticket anheften (stapler)"
fuehre_aus xcrun stapler staple "$DMG"
fuehre_aus xcrun stapler staple "$APP"
fuehre_aus xcrun stapler validate "$DMG"

# --- 6. Gatekeeper und Ablage ---------------------------------------------------------------
schritt "6/6 Gatekeeper prüfen und nach $ZIEL/ kopieren"
fuehre_aus spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
fuehre_aus spctl --assess --type execute --verbose=2 "$APP"
fuehre_aus mkdir -p "$ZIEL"
fuehre_aus rm -rf "$ZIEL/Plotwerk.app"
fuehre_aus ditto "$APP" "$ZIEL/Plotwerk.app"
fuehre_aus cp "$DMG" "$ZIEL/"

schritt "Fertig"
echo "    $ZIEL/$(basename "$DMG") ist signiert, notarisiert und gestapelt."
