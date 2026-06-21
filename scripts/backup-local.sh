#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-clinic-crm-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-clinic-crm-redis}"
MINIO_CONTAINER="${MINIO_CONTAINER:-clinic-crm-minio}"
POSTGRES_USER="${POSTGRES_USER:-clinic_crm}"
POSTGRES_DB="${POSTGRES_DB:-clinic_crm}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="temichevvet-local-$TIMESTAMP"
RUN_DIR="$BACKUP_DIR/$BACKUP_NAME"
ARCHIVE_FILE="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
MANIFEST_FILE="$RUN_DIR/MANIFEST.txt"

mkdir -p "$RUN_DIR"

require_container() {
  local container_name="$1"

  if ! docker inspect "$container_name" >/dev/null 2>&1; then
    echo "Container is not found: $container_name" >&2
    exit 1
  fi
}

write_manifest_header() {
  {
    echo "TemichevVet local backup"
    echo "Created at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "PostgreSQL container: $POSTGRES_CONTAINER"
    echo "Redis container: $REDIS_CONTAINER"
    echo "MinIO container: $MINIO_CONTAINER"
    echo
    echo "Files:"
  } > "$MANIFEST_FILE"
}

append_manifest_file() {
  local path="$1"
  echo "- $path" >> "$MANIFEST_FILE"
}

require_container "$POSTGRES_CONTAINER"
require_container "$REDIS_CONTAINER"
require_container "$MINIO_CONTAINER"
write_manifest_header

docker exec "$POSTGRES_CONTAINER" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges > "$RUN_DIR/postgres.dump"
append_manifest_file "postgres.dump"

docker exec "$REDIS_CONTAINER" redis-cli SAVE >/dev/null
docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$RUN_DIR/redis-dump.rdb"
append_manifest_file "redis-dump.rdb"

docker cp "$MINIO_CONTAINER:/data" "$RUN_DIR/minio-data"
append_manifest_file "minio-data/"

tar -czf "$ARCHIVE_FILE" -C "$BACKUP_DIR" "$BACKUP_NAME"

echo "$ARCHIVE_FILE"
