#!/bin/bash
# Nightly Postgres backup for the Clutch Social droplet.
#
# - Reads DATABASE_URL from the app .env (single source of truth — the
#   old version of this script hardcoded a DB name and /home/ubuntu
#   paths from a previous server and never ran on this droplet).
# - Writes gzipped custom-format dumps to /root/backups, keeps 14.
# - The scraper Mac pulls the newest dump daily (scripts/pull-backup.sh)
#   so a droplet disk failure can't take the history with it.
#
# Installed as root cron:
#   20 3 * * * /root/clutch-social/scripts/backup-db.sh >> /var/log/clutch-backup.log 2>&1
set -euo pipefail

APP_DIR="/root/clutch-social"
BACKUP_DIR="/root/backups"
KEEP=14
TIMESTAMP=$(date '+%Y-%m-%d-%H%M%S')

mkdir -p "$BACKUP_DIR"

# shellcheck disable=SC1091
set -a; source "$APP_DIR/.env"; set +a
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] DATABASE_URL missing in $APP_DIR/.env" >&2
  exit 1
fi

FILE="$BACKUP_DIR/clutch-social-$TIMESTAMP.dump.gz"
echo "[backup] $(date '+%F %T') starting → $FILE"

# Custom format (-Fc) → single-table restores possible via pg_restore.
pg_dump --format=custom --no-owner "$DATABASE_URL" | gzip > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] done ($SIZE)"

# Rotate
cd "$BACKUP_DIR"
ls -1t clutch-social-*.dump.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "[backup] $(ls -1 clutch-social-*.dump.gz | wc -l) backups retained"
