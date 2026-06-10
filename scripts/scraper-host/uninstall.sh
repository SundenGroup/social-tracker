#!/bin/bash
# Remove the scraper-host LaunchAgents from this machine.
set -uo pipefail
UID_NUM="$(id -u)"
DEST="$HOME/Library/LaunchAgents"
for label in com.clutch.browser-server-tiktok com.clutch.browser-server-instagram com.clutch.daily-scrape; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  rm -f "$DEST/$label.plist"
  echo "removed $label"
done
echo "Cancel the wake schedule with:  sudo pmset repeat cancel"
