#!/bin/bash
# Plotwerk installieren oder aktualisieren.
#
#   curl -fsSL https://raw.githubusercontent.com/leonatwork/plotwerk/main/install.sh | bash
#
# Lädt Plotwerk.dmg aus dem neuesten GitHub-Release, kopiert Plotwerk.app nach /Applications
# (oder ~/Applications, falls /Applications nicht beschreibbar ist) und startet die App.
# Eine bestimmte Version: … | PLOTWERK_VERSION=v0.2.0 bash
# Für Tests: PLOTWERK_URL (eigene DMG-Adresse, auch file://) und PLOTWERK_ZIEL (Zielordner).
#
# Projektordner und Einstellungen bleiben unberührt; ersetzt wird nur Plotwerk.app.
set -euo pipefail

REPO="leonatwork/plotwerk"
APP="Plotwerk.app"

if [ -n "${PLOTWERK_URL:-}" ]; then
  URL="$PLOTWERK_URL"
elif [ -n "${PLOTWERK_VERSION:-}" ]; then
  URL="https://github.com/$REPO/releases/download/$PLOTWERK_VERSION/Plotwerk.dmg"
else
  URL="https://github.com/$REPO/releases/latest/download/Plotwerk.dmg"
fi

fett=$(tput bold 2>/dev/null || true)
normal=$(tput sgr0 2>/dev/null || true)
schritt() { printf '%s==>%s %s\n' "$fett" "$normal" "$1"; }
abbruch() { printf 'Fehler: %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || abbruch "Plotwerk gibt es nur für macOS."
macos_haupt=$(sw_vers -productVersion | cut -d. -f1)
[ "$macos_haupt" -ge 12 ] || abbruch "Plotwerk braucht macOS 12 (Monterey) oder neuer."

tmp=$(mktemp -d -t plotwerk)
mnt="$tmp/volume"
aufraeumen() {
  hdiutil detach "$mnt" -quiet -force >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap aufraeumen EXIT

schritt "Lade Plotwerk …"
curl -fL --progress-bar "$URL" -o "$tmp/Plotwerk.dmg" ||
  abbruch "Download fehlgeschlagen ($URL)."

schritt "Öffne das Disk-Image …"
mkdir -p "$mnt"
hdiutil attach "$tmp/Plotwerk.dmg" -nobrowse -readonly -noautoopen -mountpoint "$mnt" -quiet ||
  abbruch "Das Disk-Image ließ sich nicht öffnen."
[ -d "$mnt/$APP" ] || abbruch "$APP fehlt im Disk-Image."

ziel="${PLOTWERK_ZIEL:-/Applications}"
if [ ! -w "$ziel" ]; then
  ziel="$HOME/Applications"
  mkdir -p "$ziel"
fi

if pgrep -xq Plotwerk; then
  schritt "Beende die laufende Plotwerk-App (sie speichert vorher alles) …"
  osascript -e 'tell application "Plotwerk" to quit' >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pgrep -xq Plotwerk || break; sleep 0.5; done
  pgrep -xq Plotwerk && abbruch "Plotwerk läuft noch. Bitte beenden und erneut versuchen."
fi

schritt "Installiere nach $ziel …"
rm -rf "${ziel:?}/$APP"
ditto "$mnt/$APP" "$ziel/$APP"

# curl setzt kein Quarantäne-Attribut; zur Sicherheit trotzdem entfernen, damit eine
# noch nicht notarisierte Version ohne Gatekeeper-Warnung startet.
xattr -dr com.apple.quarantine "$ziel/$APP" 2>/dev/null || true

version=$(defaults read "$ziel/$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo "?")
schritt "Plotwerk $version ist installiert: $ziel/$APP"
open "$ziel/$APP"
