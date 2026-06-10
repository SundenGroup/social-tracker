#!/bin/bash
# Daily scrape runner for the dedicated scraper host.
#
# Runs the three remote scrapers sequentially (TikTok → Instagram → VK),
# appending everything to a date-stamped log. A scraper failing does NOT
# stop the others — each is independent and the API ingests per account.
#
# Invoked by launchd (com.clutch.daily-scrape) at 07:00 local, but safe
# to run by hand any time:
#   ./run-daily-scrape.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/scrape-$(date +%Y-%m-%d).log"

# brew (Intel + ARM) and default paths — launchd's PATH is minimal
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "===== daily scrape starting ====="
FAILED=()

for scraper in tiktok-remote-scraper instagram-remote-scraper vk-remote-scraper; do
  log "--- $scraper ---"
  if (cd "$REPO/scripts/$scraper" && npm run --silent scrape) >> "$LOG" 2>&1; then
    log "--- $scraper OK ---"
  else
    log "!!! $scraper FAILED (exit $?)"
    FAILED+=("$scraper")
  fi
done

# Keep a month of logs
find "$LOG_DIR" -name "scrape-*.log" -mtime +30 -delete 2>/dev/null

if [ ${#FAILED[@]} -gt 0 ]; then
  log "===== done WITH FAILURES: ${FAILED[*]} ====="
  exit 1
fi
log "===== done, all scrapers OK ====="
exit 0
