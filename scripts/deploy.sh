#!/bin/bash
set -e

APP_DIR="/home/ubuntu/clutch-social"
LOG_FILE="/var/log/clutch-social/deploy.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Starting deployment..." | tee -a "$LOG_FILE"

cd "$APP_DIR"

# Pull latest code
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Pulling latest code..." | tee -a "$LOG_FILE"
git pull origin main

# Install dependencies
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Installing dependencies..." | tee -a "$LOG_FILE"
npm ci --production=false

# Run database migrations
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Running migrations..." | tee -a "$LOG_FILE"
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Build the application
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Building application..." | tee -a "$LOG_FILE"
npm run build

# Restart PM2 process
echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Restarting application..." | tee -a "$LOG_FILE"
pm2 restart clutch-social

echo "$(date '+%Y-%m-%d %H:%M:%S') [Deploy] Deployment complete!" | tee -a "$LOG_FILE"
