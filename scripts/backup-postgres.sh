#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
CONTAINER_NAME="${POSTGRES_CONTAINER:-clinic-crm-postgres}"
POSTGRES_USER="${POSTGRES_USER:-clinic_crm}"
POSTGRES_DB="${POSTGRES_DB:-clinic_crm}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/clinic-crm-$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

docker exec "$CONTAINER_NAME" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-privileges > "$BACKUP_FILE"

echo "$BACKUP_FILE"
