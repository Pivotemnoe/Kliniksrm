#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_FILE="${1:-}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinic-crm-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-clinic-crm-redis}"
MINIO_CONTAINER="${MINIO_CONTAINER:-clinic-crm-minio}"
POSTGRES_USER="${POSTGRES_USER:-clinic_crm}"
POSTGRES_DB="${POSTGRES_DB:-clinic_crm}"
RESTORE_REDIS="${RESTORE_REDIS:-false}"
RESTORE_MINIO="${RESTORE_MINIO:-true}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-}"

if [[ -z "$ARCHIVE_FILE" ]]; then
  echo "Usage: CONFIRM_RESTORE=YES scripts/restore-local.sh backups/temichevvet-local-YYYYMMDD-HHMMSS.tar.gz" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE_FILE" ]]; then
  echo "Backup archive is not found: $ARCHIVE_FILE" >&2
  exit 1
fi

require_container() {
  local container_name="$1"

  if ! docker inspect "$container_name" >/dev/null 2>&1; then
    echo "Container is not found: $container_name" >&2
    exit 1
  fi
}

extract_backup() {
  local archive_file="$1"
  local target_dir="$2"

  tar -xzf "$archive_file" -C "$target_dir"
  find "$target_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1
}

validate_backup() {
  local backup_root="$1"

  if [[ ! -f "$backup_root/postgres.dump" ]]; then
    echo "Backup does not contain postgres.dump" >&2
    exit 1
  fi

  if [[ "$RESTORE_REDIS" == "true" && ! -f "$backup_root/redis-dump.rdb" ]]; then
    echo "RESTORE_REDIS=true, but backup does not contain redis-dump.rdb" >&2
    exit 1
  fi

  if [[ "$RESTORE_MINIO" == "true" && ! -d "$backup_root/minio-data" ]]; then
    echo "RESTORE_MINIO=true, but backup does not contain minio-data/" >&2
    exit 1
  fi
}

restore_postgres() {
  local backup_root="$1"

  docker exec -i "$POSTGRES_CONTAINER" pg_restore \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges < "$backup_root/postgres.dump"
}

restore_redis() {
  local backup_root="$1"

  docker compose stop redis >/dev/null
  docker cp "$backup_root/redis-dump.rdb" "$REDIS_CONTAINER:/data/dump.rdb"
  docker compose up -d redis >/dev/null
}

restore_minio() {
  local backup_root="$1"

  docker exec "$MINIO_CONTAINER" sh -lc 'rm -rf /data/* /data/.[!.]* /data/..?*'
  docker cp "$backup_root/minio-data/." "$MINIO_CONTAINER:/data/"
  docker compose restart minio >/dev/null
}

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/temichevvet-restore.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

BACKUP_ROOT="$(extract_backup "$ARCHIVE_FILE" "$TMP_DIR")"
validate_backup "$BACKUP_ROOT"

require_container "$POSTGRES_CONTAINER"
require_container "$REDIS_CONTAINER"
require_container "$MINIO_CONTAINER"

echo "Backup archive: $ARCHIVE_FILE"
echo "Backup root: $BACKUP_ROOT"
echo "PostgreSQL: $POSTGRES_CONTAINER / $POSTGRES_DB"
echo "MinIO restore: $RESTORE_MINIO"
echo "Redis restore: $RESTORE_REDIS"

if [[ "$CONFIRM_RESTORE" != "YES" ]]; then
  echo
  echo "Dry run only. Set CONFIRM_RESTORE=YES to overwrite local CRM data." >&2
  exit 0
fi

docker compose stop api web >/dev/null || true

restore_postgres "$BACKUP_ROOT"

if [[ "$RESTORE_MINIO" == "true" ]]; then
  restore_minio "$BACKUP_ROOT"
fi

if [[ "$RESTORE_REDIS" == "true" ]]; then
  restore_redis "$BACKUP_ROOT"
fi

docker compose up -d postgres redis minio api web >/dev/null

echo "Restore completed."
