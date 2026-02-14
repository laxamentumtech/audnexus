#!/bin/bash
# MongoDB backup script using mongodump
# Creates compressed dumps for Borg backup

set -euo pipefail

# Configuration - these should be set by environment or config file
MONGODB_HOST="${MONGODB_HOST:-dw4cwkk0kkcgwgsck8co88ss}"
MONGODB_PORT="${MONGODB_PORT:-27017}"
MONGODB_USER="${MONGODB_USER:-audnexus}"
MONGODB_PASSWORD="${MONGODB_PASSWORD:-}"
MONGODB_DATABASE="${MONGODB_DATABASE:-audnexus}"
MONGODB_AUTH_SOURCE="${MONGODB_AUTH_SOURCE:-admin}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/backups/borg/mongodb}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ARCHIVE_NAME="mongodb_${MONGODB_DATABASE}_${TIMESTAMP}"
CONTAINER_NAME="${CONTAINER_NAME:-dw4cwkk0kkcgwgsck8co88ss}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >&2
}

# Error handling function
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check if required environment variables are set
check_credentials() {
    if [[ -z "$MONGODB_PASSWORD" ]]; then
        error_exit "MONGODB_PASSWORD environment variable is not set"
    fi
}

# Create backup directory if it doesn't exist
setup_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    log "Backup directory: $BACKUP_DIR"
}

# Perform mongodump
create_mongodb_dump() {
    local dump_path="${BACKUP_DIR}/${ARCHIVE_NAME}"
    local archive_file="${BACKUP_DIR}/${ARCHIVE_NAME}.archive.gz"
    
    log "Starting MongoDB dump for database: $MONGODB_DATABASE"
    
    # Use mongodump from the MongoDB container
    if docker exec "$CONTAINER_NAME" /bin/sh -lc 'mongodump \
        --host "$MONGODB_HOST" \
        --port "$MONGODB_PORT" \
        --username "$MONGODB_USER" \
        --password "$MONGODB_PASSWORD" \
        --db "$MONGODB_DATABASE" \
        --authenticationDatabase "$MONGODB_AUTH_SOURCE" \
        --out "$dump_path"'; then
        
        log "MongoDB dump completed successfully"
    else
        error_exit "MongoDB dump failed"
    fi
    
    # Create compressed archive
    log "Creating compressed archive..."
    tar -czf "$archive_file" -C "$BACKUP_DIR" "$ARCHIVE_NAME"
    
    # Remove uncompressed dump directory
    rm -rf "$dump_path"
    
    log "Archive created: $archive_file"
    
    # Return the archive path
    echo "$archive_file"
}

# Cleanup old archives (older than specified days)
cleanup_old_archives() {
    local retention_days="${RETENTION_DAYS:-30}"
    
    log "Cleaning up archives older than $retention_days days..."
    
    find "$BACKUP_DIR" -name "*.archive.gz" -type f -mtime +"$retention_days" -delete
    
    log "Cleanup completed"
}

# Main function
main() {
    log "=== MongoDB Backup Started ==="
    
    check_credentials
    setup_backup_dir
    
    local archive_path
    archive_path=$(create_mongodb_dump)
    
    cleanup_old_archives
    
    log "=== MongoDB Backup Completed ==="
    log "Archive: $archive_path"
    
    # Output archive path for Borg backup script
    echo "$archive_path"
}

# Run main function
main "$@"