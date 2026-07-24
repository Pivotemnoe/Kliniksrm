#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-/backups}"
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$backup_dir"

while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$backup_dir/owner-gateway-$stamp.sql.gz"
  temporary="$target.tmp"

  if pg_dump \
    --host="${POSTGRES_HOST:-postgres}" \
    --port="${POSTGRES_PORT:-5432}" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --no-owner \
    --no-privileges | gzip -9 > "$temporary"; then
    mv "$temporary" "$target"
    find "$backup_dir" -type f -name 'owner-gateway-*.sql.gz' -mtime "+$retention_days" -delete
  else
    rm -f "$temporary"
  fi

  sleep "$interval"
done
