#!/bin/bash
# Triggered by cron at 2 AM UTC daily
# Cron entry: 0 2 * * * /home/ubuntu/clutch-social/scripts/daily-sync.sh

LOG_FILE="/var/log/clutch-social/cron.log"
APP_URL="${APP_URL:-https://localhost:3000}"
CRON_SECRET="${CRON_SECRET_TOKEN:-}"

echo "$(date '+%Y-%m-%d %H:%M:%S') [Cron] Triggering daily sync..." >> "$LOG_FILE"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/sync/trigger" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 30)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Cron] Sync triggered successfully: $BODY" >> "$LOG_FILE"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Cron] ERROR: HTTP $HTTP_CODE - $BODY" >> "$LOG_FILE"
fi
