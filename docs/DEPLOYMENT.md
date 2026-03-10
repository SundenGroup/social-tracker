# Clutch Social Tracker - Deployment Guide

## Prerequisites

- DigitalOcean Droplet: Ubuntu 24.04 LTS, 4GB RAM / 2vCPU recommended (2GB sufficient if not using Playwright scrapers for Twitter/TikTok)
- Domain name pointed to the Droplet's IP address
- Git repository accessible from the server

## 1. Initial Server Setup

```bash
# SSH into the droplet
ssh root@your_droplet_ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Install Nginx
sudo apt install nginx -y

# Install PM2 globally
npm install -g pm2

# Create log directory
sudo mkdir -p /var/log/clutch-social
sudo chown ubuntu:ubuntu /var/log/clutch-social
```

## 2. Database Setup

```bash
# Run the init script (or manually):
./scripts/init-database.sh

# OR manually:
sudo -u postgres createdb clutch_social_tracker
sudo -u postgres createuser clutch_user
sudo -u postgres psql -c "ALTER USER clutch_user WITH PASSWORD 'your_secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE clutch_social_tracker TO clutch_user;"
```

## 3. Application Setup

```bash
# Clone the repository
cd /home/ubuntu
git clone <your-repo-url> clutch-social
cd clutch-social

# Copy and configure environment
cp .env.example .env
# Edit .env with production values (see Environment Variables below)

# Install dependencies
npm ci

# Run database migrations
npx prisma migrate deploy
npx prisma generate

# Build the application
npm run build
```

## 4. Environment Variables

Create `.env` on the server with these values:

```
DATABASE_URL="postgresql://clutch_user:your_password@localhost:5432/clutch_social_tracker"
NEXTAUTH_SECRET="<run: openssl rand -base64 32>"
NEXTAUTH_URL="https://yourdomain.com"
CRON_SECRET_TOKEN="<run: openssl rand -hex 32>"
YOUTUBE_API_KEY="<from Google Cloud Console>"

# Optional platform credentials
INSTAGRAM_ACCESS_TOKEN=""

# SMTP (for email alerts)
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT=587
SMTP_USER="apikey"
SMTP_PASS="<your sendgrid api key>"
SMTP_FROM="noreply@yourdomain.com"
```

## 5. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 startup   # Follow the output command to enable auto-start
pm2 save
```

## 6. Nginx Configuration

```bash
# Copy nginx config
sudo cp nginx/clutch-social.conf /etc/nginx/sites-available/clutch-social

# Edit the config: replace "yourdomain.com" with your actual domain
sudo nano /etc/nginx/sites-available/clutch-social

# Enable the site
sudo ln -s /etc/nginx/sites-available/clutch-social /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

## 7. SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
# Follow the prompts; Certbot auto-configures nginx
```

## 8. Cron Jobs

```bash
# Edit crontab
crontab -e

# Add these lines:
# Daily sync at 2 AM UTC
0 2 * * * CRON_SECRET_TOKEN="your_token" APP_URL="https://yourdomain.com" /home/ubuntu/clutch-social/scripts/daily-sync.sh

# Daily database backup at 3 AM UTC
0 3 * * * /home/ubuntu/clutch-social/scripts/backup-db.sh
```

## 9. Verify Deployment

```bash
# Check app is running
pm2 status

# Check health endpoint
curl https://yourdomain.com/api/health

# Check nginx is proxying correctly
curl -I https://yourdomain.com

# Test sync trigger
curl -X POST https://yourdomain.com/api/sync/trigger \
  -H "Authorization: Bearer your_cron_token" \
  -H "Content-Type: application/json"
```

## Ongoing Operations

### Deploy Updates
```bash
cd /home/ubuntu/clutch-social
./scripts/deploy.sh
```

### View Logs
```bash
pm2 logs clutch-social
tail -f /var/log/clutch-social/app.log
```

### Manual Database Backup
```bash
./scripts/backup-db.sh
```

### Restore from Backup
```bash
./scripts/restore-db.sh /home/ubuntu/backups/clutch-social-backup-YYYY-MM-DD-HHmmss.sql.gz
```

### Monitoring
- Health check: `GET /api/health`
- Settings dashboard: `/settings` (in-app, admin only)
- External monitoring: Point UptimeRobot/Pingdom at `/api/health`
