#!/bin/bash
# One-time installer for the dedicated Clutch Social scraper host
# (the always-on 2019 MacBook Pro).
#
# What it does:
#   1. Templates the repo path into the three LaunchAgent plists.
#   2. Installs + loads them into the user's launchd session:
#        - browser-server-tiktok    (KeepAlive, RunAtLoad)
#        - browser-server-instagram (KeepAlive, RunAtLoad)
#        - daily-scrape             (07:00 daily)
#   3. Schedules a daily power wake at 06:58 so the machine is awake
#      for the 07:00 run (no-op if the Mac is always plugged in + awake).
#
# Re-runnable: unloads any existing copies first.
#
# Prereqs (see README.md): Node 20+, repo cloned, `npm install` +
# `npx playwright install chromium` run in each scraper dir, and each
# browser profile logged in once via `npm run scrape:setup`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$SCRIPT_DIR/launchagents"
DEST="$HOME/Library/LaunchAgents"
LABELS=(com.clutch.browser-server-tiktok com.clutch.browser-server-instagram com.clutch.daily-scrape)

echo "Repo:    $REPO"
echo "Agents:  $DEST"
mkdir -p "$DEST" "$SCRIPT_DIR/logs"
chmod +x "$SCRIPT_DIR/run-daily-scrape.sh"

UID_NUM="$(id -u)"

for label in "${LABELS[@]}"; do
  echo "Installing $label ..."
  # Unload an existing copy (ignore errors if not loaded yet)
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  # Template the repo path and write into LaunchAgents
  sed "s#__REPO__#$REPO#g" "$SRC/$label.plist" > "$DEST/$label.plist"
  launchctl bootstrap "gui/$UID_NUM" "$DEST/$label.plist"
  echo "  loaded."
done

echo ""
echo "Scheduling daily wake at 06:58 (needs admin password) ..."
sudo pmset repeat wakeorpoweron MTWRFSU 06:58:00 || \
  echo "  (skipped — set a wake schedule manually in System Settings > Battery > Schedule if desired)"

echo ""
echo "Done. Verify with:  launchctl list | grep clutch"
echo "Tail today's run:   tail -f $SCRIPT_DIR/logs/scrape-\$(date +%Y-%m-%d).log"
