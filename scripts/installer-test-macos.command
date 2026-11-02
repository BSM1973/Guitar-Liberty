#!/bin/zsh
# Local development-only installer. Run only with an archive from your own trusted GitHub build.
set -euo pipefail
APP_NAME="Guitar Liberty.app"
DEST="/Applications/$APP_NAME"
echo "Sélectionne le dossier Guitar Liberty.app extrait du ZIP GitHub."
SOURCE_APP=$(osascript -e 'POSIX path of (choose file with prompt "Choisir Guitar Liberty.app" of type {"app"})' 2>/dev/null) || exit 0
if [[ "${SOURCE_APP:t}" != "$APP_NAME" || ! -d "$SOURCE_APP/Contents" ]]; then
  echo "Application incorrecte : $SOURCE_APP"
  exit 1
fi
if [[ -e "$DEST" ]]; then
  echo "Ferme Guitar Liberty avant installation."
  osascript -e 'tell application "Guitar Liberty" to quit' 2>/dev/null || true
fi
sudo ditto "$SOURCE_APP" "$DEST"
# Development testing only: removes Gatekeeper quarantine from this known local app.
sudo xattr -dr com.apple.quarantine "$DEST"
echo "Version de test installée dans Applications."
open "$DEST"
