#!/bin/bash
# One-time setup script for MongoDB Borg backup system
# Installs dependencies, configures environment, and sets up cron jobs

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/mnt/backups/borg/mongodb"
LOG_DIR="/var/log"
CONFIG_FILE="$SCRIPT_DIR/.borgbackup/config"
CRON_ID="mongodb-borg-backup"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Error handling function
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Check if running as root or with sudo privileges
check_privileges() {
    if [[ $EUID -ne 0 ]]; then
        log "WARNING: Not running as root. Some operations may require sudo."
        SUDO="sudo"
    else
        SUDO=""
    fi
}

# Install required packages
install_dependencies() {
    log "Installing dependencies..."
    
    # Detect OS
    if [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        $SUDO apt-get update
        $SUDO apt-get install -y borgbackup docker.io
    elif [[ -f /etc/redhat-release ]]; then
        # RHEL/CentOS/Fedora
        $SUDO dnf install -y borgbackup docker
    elif [[ -f /etc/arch-release ]]; then
        # Arch Linux
        $SUDO pacman -Sy --noconfirm borg docker
    else
        log "WARNING: Unknown OS. Please install borgbackup and docker manually."
    fi
    
    log "Dependencies installed successfully"
}

# Create required directories
create_directories() {
    log "Creating backup directories..."
    
    $SUDO mkdir -p "$BACKUP_DIR"
    $SUDO mkdir -p "$LOG_DIR"
    $SUDO mkdir -p "$(dirname "$CONFIG_FILE")"
    
    # Set permissions
    $SUDO chmod 755 "$BACKUP_DIR"
    $SUDO chmod 644 "$LOG_DIR"
    
    log "Directories created:"
    log "  Backup: $BACKUP_DIR"
    log "  Log: $LOG_DIR"
}

# Generate configuration file
generate_config() {
    log "Generating backup configuration..."
    
    cat > "$CONFIG_FILE" << 'EOF'
# MongoDB Borg Backup Configuration
# This file is sourced by backup scripts

# MongoDB Connection Settings
export MONGODB_HOST="dw4cwkk0kkcgwgsck8co88ss"
export MONGODB_PORT="27017"
export MONGODB_USER="audnexus"
export MONGODB_PASSWORD="fNO7QokATLr5I7ah482IH9SJKxywzVwy1SFKQVqnYg9zErVlBPP67QJk8JdZsaJM"
export MONGODB_DATABASE="audnexus"
export MONGODB_AUTH_SOURCE="admin"
export CONTAINER_NAME="dw4cwkk0kkcgwgsck8co88ss"

# Backup Settings
export BACKUP_DIR="/mnt/backups/borg/mongodb"
export RETENTION_DAYS="30"

# Borg Settings
export BORG_REPO="/mnt/backups/borg/mongodb"
export BORG_ARCHIVE_PREFIX="mongodb"
export BORG_RETENTION_DAILY="7"
export BORG_RETENTION_WEEKLY="4"
export BORG_RETENTION_MONTHLY="12"

# Borg Encryption (optional - set your own passphrase)
# export BORG_PASSPHRASE="your-secure-passphrase-here"

# Logging
export LOG_FILE="/var/log/borg-backup.log"
EOF
    
    # Set restrictive permissions on config file
    chmod 600 "$CONFIG_FILE"
    
    log "Configuration file created: $CONFIG_FILE"
    log "WARNING: Review and update the password in the configuration file"
}

# Create systemd service file
create_systemd_service() {
    log "Creating systemd service file..."
    
    local service_file="/etc/systemd/system/mongodb-borg-backup.service"
    local timer_file="/etc/systemd/system/mongodb-borg-backup.timer"
    
    $SUDO cat > "$service_file" << 'EOF'
[Unit]
Description=MongoDB Borg Backup Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash /home/djdembeck/projects/github/audnexus/scripts/backup-mongodb.sh
ExecStartPost=/bin/bash /home/djdembeck/projects/github/audnexus/scripts/borg-backup.sh backup /mnt/backups/borg/mongodb
User=root
StandardOutput=append:/var/log/borg-backup.log
StandardError=inherit

[Install]
WantedBy=multi-user.target
EOF
    
    $SUDO cat > "$timer_file" << 'EOF'
[Unit]
Description=Run MongoDB Borg Backup Daily
Requires=mongodb-borg-backup.service

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
    
    $SUDO chmod 644 "$service_file" "$timer_file"
    
    log "Systemd files created:"
    log "  Service: $service_file"
    log "  Timer: $timer_file"
}

# Create cron job (fallback if systemd not available)
create_cron_job() {
    log "Setting up cron job for daily backups..."
    
    local cron_entry="0 2 * * * /bin/bash $SCRIPT_DIR/backup-mongodb.sh >> /var/log/borg-backup.log 2>&1"
    
    # Add cron job
    (crontab -l 2>/dev/null | grep -v "$CRON_ID"; echo "# $CRON_ID"; echo "$cron_entry") | crontab -
    
    log "Cron job added for daily backup at 2:00 AM"
}

# Make scripts executable
make_scripts_executable() {
    log "Making backup scripts executable..."
    
    chmod +x "$SCRIPT_DIR/backup-mongodb.sh"
    chmod +x "$SCRIPT_DIR/borg-backup.sh"
    chmod +x "$SCRIPT_DIR/setup-backup.sh"
    
    log "Scripts are now executable"
}

# Verify installation
verify_installation() {
    log "Verifying installation..."
    
    local errors=0
    
    # Check borg
    if command -v borg &> /dev/null; then
        log "✓ Borg backup installed: $(borg --version)"
    else
        log "✗ Borg backup not found"
        ((errors++))
    fi
    
    # Check docker
    if command -v docker &> /dev/null; then
        log "✓ Docker installed"
    else
        log "✗ Docker not found"
        ((errors++))
    fi
    
    # Check scripts
    if [[ -x "$SCRIPT_DIR/backup-mongodb.sh" ]]; then
        log "✓ backup-mongodb.sh is executable"
    else
        log "✗ backup-mongodb.sh is not executable"
        ((errors++))
    fi
    
    if [[ -x "$SCRIPT_DIR/borg-backup.sh" ]]; then
        log "✓ borg-backup.sh is executable"
    else
        log "✗ borg-backup.sh is not executable"
        ((errors++))
    fi
    
    # Check directories
    if [[ -d "$BACKUP_DIR" ]]; then
        log "✓ Backup directory exists: $BACKUP_DIR"
    else
        log "✗ Backup directory not found: $BACKUP_DIR"
        ((errors++))
    fi
    
    if [[ $errors -gt 0 ]]; then
        error_exit "Installation verification failed with $errors errors"
    fi
    
    log "Installation verification completed successfully"
}

# Display setup summary
display_summary() {
    echo ""
    echo "=========================================="
    echo "MongoDB Borg Backup Setup Complete"
    echo "=========================================="
    echo ""
    echo "Files created:"
    echo "  $SCRIPT_DIR/backup-mongodb.sh"
    echo "  $SCRIPT_DIR/borg-backup.sh"
    echo "  $SCRIPT_DIR/setup-backup.sh"
    echo "  $CONFIG_FILE"
    echo ""
    echo "Usage:"
    echo "  Manual backup: $SCRIPT_DIR/backup-mongodb.sh"
    echo "  Borg commands: $SCRIPT_DIR/borg-backup.sh [init|backup|prune|verify|list]"
    echo ""
    echo "Next steps:"
    echo "  1. Review and update $CONFIG_FILE"
    echo "  2. Set BORG_PASSPHRASE environment variable for encryption"
    echo "  3. Enable and start the timer: systemctl enable --now mongodb-borg-backup.timer"
    echo ""
}

# Main function
main() {
    log "=== MongoDB Borg Backup Setup Started ==="
    
    check_privileges
    install_dependencies
    create_directories
    generate_config
    create_systemd_service
    create_cron_job
    make_scripts_executable
    verify_installation
    display_summary
    
    log "=== MongoDB Borg Backup Setup Completed ==="
}

# Run main function
main "$@"