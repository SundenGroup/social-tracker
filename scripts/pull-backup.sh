#!/bin/bash
# Offsite backup pull — runs on the scraper Mac after the morning scrape.
# Copies the droplet's newest DB dump to ~/clutch-backups and keeps 14,
# so a droplet disk failure can never take the only copy of the data.
set -euo pipefail

DEST="$HOME/clutch-backups"
KEEP=14
mkdir -p "$DEST"

LATEST=$(ssh root@164.92.195.12 'ls -1t /root/backups/clutch-social-*.dump.gz 2>/dev/null | head -1')
if [ -z "$LATEST" ]; then
  echo "[pull-backup] no backups found on droplet" >&2
  exit 1
fi

BASE=$(basename "$LATEST")
if [ -f "$DEST/$BASE" ]; then
  echo "[pull-backup] already have $BASE"
else
  scp -q "root@164.92.195.12:$LATEST" "$DEST/$BASE"
  echo "[pull-backup] pulled $BASE ($(du -h "$DEST/$BASE" | cut -f1))"
fi

cd "$DEST"
ls -1t clutch-social-*.dump.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs rm -f 2>/dev/null || true
echo "[pull-backup] $(ls -1 clutch-social-*.dump.gz | wc -l | tr -d ' ') local copies retained"
