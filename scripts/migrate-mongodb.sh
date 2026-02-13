#!/bin/bash
# MongoDB Migration Script
# Backs up data from old Docker Compose MongoDB

BACKUP_DIR="./backups/mongodb"
OLD_CONTAINER="audnexus-mongo-1"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump data from old container
echo "Creating MongoDB backup from $OLD_CONTAINER..."
docker exec "$OLD_CONTAINER" mongodump --out /tmp/backup

# Copy backup to host
docker cp "$OLD_CONTAINER:/tmp/backup" "$BACKUP_DIR"

echo "Backup complete: $BACKUP_DIR/backup"
echo ""
echo "To restore to new MongoDB:"
echo "1. Get connection string from Coolify MongoDB service"
echo "2. Run: mongorestore --uri='YOUR_CONNECTION_STRING' --drop $BACKUP_DIR/backup"