#!/bin/bash
set -e

DB_NAME="clutch_social_tracker"
DB_USER="clutch_user"

echo "=== Clutch Social Tracker - Database Initialization ==="
echo ""

# Prompt for password
read -sp "Enter password for database user '$DB_USER': " DB_PASS
echo ""

# Create PostgreSQL user and database
echo "Creating database user..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"

echo "Creating database..."
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

echo "Granting privileges..."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo ""
echo "Database created successfully!"
echo ""
echo "Add this to your .env file:"
echo "DATABASE_URL=\"postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME\""
echo ""

# Run Prisma migrations
read -p "Run Prisma migrations now? (y/n): " RUN_MIGRATE
if [ "$RUN_MIGRATE" = "y" ]; then
    echo "Running migrations..."
    npx prisma migrate deploy
    echo "Migrations complete!"
fi
