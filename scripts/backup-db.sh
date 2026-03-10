#!/bin/bash
set -e

BACKUP_DIR="/home/ubuntu/backups"
DB_NAME="clutch_social_tracker"
TIMESTAMP=$(date '+%Y-%m-%d-%H%M%S')
BACKUP_FILE="$BACKUP_DIR/clutch-social-backup-$TIMESTAMP.sql.gz"
MAX_LOCAL_BACKUPS=3
LOG_FILE="/var/log/clutch-social/backup.log"

mkdir -p "$BACKUP_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') [Backup] Starting database backup..." | tee -a "$LOG_FILE"

# Create compressed backup
sudo -u postgres pg_dump "$DB_NAME" | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$(date '+%Y-%m-%d %H:%M:%S') [Backup] Backup created: $BACKUP_FILE ($BACKUP_SIZE)" | tee -a "$LOG_FILE"

# Rotate local backups - keep only the most recent
cd "$BACKUP_DIR"
BACKUP_COUNT=$(ls -1 clutch-social-backup-*.sql.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_LOCAL_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_LOCAL_BACKUPS))
    ls -1t clutch-social-backup-*.sql.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
    echo "$(date '+%Y-%m-%d %H:%M:%S') [Backup] Cleaned up $REMOVE_COUNT old backups" | tee -a "$LOG_FILE"
fi

# Optional: Upload to DigitalOcean Spaces (uncomment and configure)
# SPACES_BUCKET="your-bucket-name"
# SPACES_REGION="nyc3"
# s3cmd put "$BACKUP_FILE" "s3://$SPACES_BUCKET/backups/$(basename $BACKUP_FILE)"
# echo "$(date '+%Y-%m-%d %H:%M:%S') [Backup] Uploaded to Spaces" | tee -a "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') [Backup] Backup complete!" | tee -a "$LOG_FILE"
