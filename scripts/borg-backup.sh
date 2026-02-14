#!/bin/bash
# Borg backup wrapper for MongoDB archives
# Handles compression, encryption, and retention policies

set -euo pipefail

# Configuration
BORG_REPO="${BORG_REPO:-/mnt/backups/borg/mongodb}"
BORG_ARCHIVE_PREFIX="${BORG_ARCHIVE_PREFIX:-mongodb}"
BORG_ENCRYPTION_REPO_KEY="${BORG_ENCRYPTION_REPO_KEY:-}"
BORG_RETENTION_DAILY="${BORG_RETENTION_DAILY:-7}"
BORG_RETENTION_WEEKLY="${BORG_RETENTION_WEEKLY:-4}"
BORG_RETENTION_MONTHLY="${BORG_RETENTION_MONTHLY:-12}"
LOG_FILE="${LOG_FILE:-/var/log/borg-backup.log}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handling function
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check if Borg is installed
check_borg_installation() {
    if ! command -v borg &> /dev/null; then
        error_exit "Borg backup is not installed. Please install borgbackup."
    fi
    log "Borg backup version: $(borg --version)"
}

# Initialize Borg repository if needed
init_borg_repo() {
    if [[ ! -d "$BORG_REPO" ]]; then
        log "Initializing Borg repository at $BORG_REPO"
        
        if [[ -n "$BORG_ENCRYPTION_REPO_KEY" ]]; then
            # Use key file for encryption with secure temp file
            local borg_keyfile
            borg_keyfile=$(mktemp)
            chmod 600 "$borg_keyfile"
            trap 'rm -f "$borg_keyfile"' EXIT
            echo "$BORG_ENCRYPTION_REPO_KEY" > "$borg_keyfile"
            borg init --encryption=repokey-blake2 --key-file "$borg_keyfile" "$BORG_REPO"
        else
            # No encryption (not recommended for production)
            log "WARNING: No encryption configured for Borg repository"
            borg init --encryption=none "$BORG_REPO"
        fi
    else
        log "Borg repository already exists at $BORG_REPO"
    fi
}

# Create Borg backup archive
create_borg_archive() {
    local source_dir="${1:-}"
    local archive_name="${BORG_ARCHIVE_PREFIX}_$(date +%Y%m%d_%H%M%S)"
    
    if [[ -z "$source_dir" ]]; then
        error_exit "No source directory provided for backup"
    fi
    
    if [[ ! -d "$source_dir" ]]; then
        error_exit "Source directory does not exist: $source_dir"
    fi
    
    log "Creating Borg archive: $archive_name"
    log "Source directory: $source_dir"
    
    # Set BORG_PASSPHRASE if using encryption
    if [[ -n "${BORG_PASSPHRASE:-}" ]]; then
        export BORG_PASSPHRASE
    fi
    
    # Create backup with compression
    if borg create \
        --compression lz4 \
        --stats \
        --progress \
        "$BORG_REPO::$archive_name" \
        "$source_dir" 2>&1 | tee -a "$LOG_FILE"; then
        
        log "Borg archive created successfully: $archive_name"
    else
        error_exit "Borg backup creation failed"
    fi
}

# Prune old backups according to retention policy
prune_backups() {
    log "Pruning old backups with retention policy:"
    log "  Daily: $BORG_RETENTION_DAILY"
    log "  Weekly: $BORG_RETENTION_WEEKLY"
    log "  Monthly: $BORG_RETENTION_MONTHLY"
    
    # Set BORG_PASSPHRASE if using encryption
    if [[ -n "${BORG_PASSPHRASE:-}" ]]; then
        export BORG_PASSPHRASE
    fi
    
    borg prune \
        --prefix "$BORG_ARCHIVE_PREFIX" \
        --daily "$BORG_RETENTION_DAILY" \
        --weekly "$BORG_RETENTION_WEEKLY" \
        --monthly "$BORG_RETENTION_MONTHLY" \
        --stats \
        "$BORG_REPO" 2>&1 | tee -a "$LOG_FILE"
    
    log "Pruning completed"
}

# Verify backup integrity
verify_backup() {
    local archive_name="${1:-}"
    
    if [[ -z "$archive_name" ]]; then
        # Verify latest archive
        archive_name=$(borg list --short "$BORG_REPO" | tail -1)
    fi

    if [[ -z "$archive_name" ]]; then
        error_exit "No backup archives found in repository"
    fi
    
    log "Verifying backup: $archive_name"
    
    # Set BORG_PASSPHRASE if using encryption
    if [[ -n "${BORG_PASSPHRASE:-}" ]]; then
        export BORG_PASSPHRASE
    fi
    
    borg check "$BORG_REPO::$archive_name" 2>&1 | tee -a "$LOG_FILE"
    
    log "Backup verification completed"
}

# List available archives
list_archives() {
    log "Available backup archives:"
    borg list "$BORG_REPO"
}

# Main function
main() {
    local action="${1:-backup}"
    local source_dir="${2:-}"
    
    log "=== Borg Backup Started ==="
    log "Action: $action"
    
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    
    check_borg_installation
    
    case "$action" in
        init)
            init_borg_repo
            ;;
        backup)
            init_borg_repo
            create_borg_archive "$source_dir"
            prune_backups
            ;;
        prune)
            prune_backups
            ;;
        verify)
            verify_backup "$source_dir"
            ;;
        list)
            list_archives
            ;;
        *)
            echo "Usage: $0 {init|backup|prune|verify|list} [source_dir]"
            echo ""
            echo "Actions:"
            echo "  init    - Initialize Borg repository"
            echo "  backup  - Create backup and prune old archives"
            echo "  prune   - Prune old archives only"
            echo "  verify  - Verify backup integrity"
            echo "  list    - List available archives"
            exit 1
            ;;
    esac
    
    log "=== Borg Backup Completed ==="
}

# Run main function
main "$@"