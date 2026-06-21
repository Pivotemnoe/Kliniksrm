#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-18000}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-clinic_crm}"
POSTGRES_USER="${POSTGRES_USER:-clinic_crm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-clinic_crm}"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

backup_volume() {
  volume_path="$1"
  target_file="$2"

  if [ ! -d "$volume_path" ]; then
    log "volume is not mounted, skip: $volume_path"
    return 0
  fi

  tar -czf "$target_file" -C "$volume_path" .
}

write_manifest() {
  manifest_file="$1"
  {
    echo "TemichevVet automatic backup"
    echo "Created at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Interval seconds: $BACKUP_INTERVAL_SECONDS"
    echo "Retention days: $BACKUP_RETENTION_DAYS"
    echo "PostgreSQL host: $POSTGRES_HOST"
    echo "PostgreSQL database: $POSTGRES_DB"
    echo
    echo "Files:"
    echo "- postgres.dump"
    [ -f "$(dirname "$manifest_file")/redis-data.tar.gz" ] && echo "- redis-data.tar.gz"
    [ -f "$(dirname "$manifest_file")/minio-data.tar.gz" ] && echo "- minio-data.tar.gz"
  } > "$manifest_file"
}

backup_once() {
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  run_name="temichevvet-auto-$timestamp"
  run_dir="$BACKUP_DIR/.$run_name"
  archive_file="$BACKUP_DIR/$run_name.tar.gz"

  mkdir -p "$run_dir"
  log "backup started: $archive_file"

  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -p "$POSTGRES_PORT" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-privileges \
    -f "$run_dir/postgres.dump"

  backup_volume /redis-data "$run_dir/redis-data.tar.gz"
  backup_volume /minio-data "$run_dir/minio-data.tar.gz"
  write_manifest "$run_dir/MANIFEST.txt"

  tar -czf "$archive_file" -C "$BACKUP_DIR" ".$run_name"
  rm -rf "$run_dir"
  find "$BACKUP_DIR" -type f -name 'temichevvet-auto-*.tar.gz' -mtime "+$BACKUP_RETENTION_DAYS" -delete

  log "backup finished: $archive_file"
}

mkdir -p "$BACKUP_DIR"
log "automatic backup service started, interval: ${BACKUP_INTERVAL_SECONDS}s"

while true; do
  if ! backup_once; then
    log "backup failed, next try after ${BACKUP_INTERVAL_SECONDS}s"
  fi

  sleep "$BACKUP_INTERVAL_SECONDS"
done
