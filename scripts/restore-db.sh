#!/bin/bash
set -e

DB_NAME="clutch_social_tracker"

if [ -z "$1" ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /home/ubuntu/backups/clutch-social-backup-*.sql.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "=== WARNING ==="
echo "This will DROP and RECREATE the database: $DB_NAME"
echo "Restoring from: $BACKUP_FILE"
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo "Stopping application..."
pm2 stop clutch-social 2>/dev/null || true

echo "Dropping and recreating database..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER clutch_user;"

echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | sudo -u postgres psql "$DB_NAME"

echo "Starting application..."
pm2 start clutch-social

echo "Restore complete!"
