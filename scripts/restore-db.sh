#!/bin/bash
# Restore a backup produced by backup-db.sh (custom-format pg_dump).
# Run ON THE DROPLET as root:  ./scripts/restore-db.sh /root/backups/clutch-social-<ts>.dump.gz
set -euo pipefail

APP_DIR="/root/clutch-social"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <clutch-social-*.dump.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /root/backups/clutch-social-*.dump.gz 2>/dev/null || echo "  none"
  exit 1
fi

BACKUP_FILE="$1"
[ -f "$BACKUP_FILE" ] || { echo "Not found: $BACKUP_FILE"; exit 1; }

# shellcheck disable=SC1091
set -a; source "$APP_DIR/.env"; set +a

echo "=== WARNING ==="
echo "This will WIPE the current database and restore: $BACKUP_FILE"
read -r -p "Type 'yes' to continue: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }

echo "Stopping application..."
pm2 stop clutch-social 2>/dev/null || true

echo "Restoring (drop + recreate objects from dump)..."
gunzip -c "$BACKUP_FILE" | pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL"

echo "Starting application..."
pm2 restart clutch-social

echo "Restore complete."
