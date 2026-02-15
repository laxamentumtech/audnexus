#!/bin/bash
# MongoDB Migration Script
# Backs up data from old Docker Compose MongoDB

set -euo pipefail

BACKUP_DIR="./backups/mongodb"
OLD_CONTAINER="${1:-${OLD_CONTAINER:-audnexus-mongo-1}}"

# Validate container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${OLD_CONTAINER}$"; then
    echo "Error: Container '$OLD_CONTAINER' is not running" >&2
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump data from old container
echo "Creating MongoDB backup from $OLD_CONTAINER..."
docker exec "$OLD_CONTAINER" mongodump --out /tmp/backup

# Copy backup to host
docker cp "$OLD_CONTAINER:/tmp/backup" "$BACKUP_DIR"

# Cleanup: remove backup from container
docker exec "$OLD_CONTAINER" rm -rf /tmp/backup

echo "Backup complete: $BACKUP_DIR/backup"
echo ""
echo "To restore to new MongoDB:"
echo "1. Get connection string from Coolify MongoDB service"
echo "2. Run: mongorestore --uri='YOUR_CONNECTION_STRING' --drop $BACKUP_DIR/backup"