#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
CHECK_INTERVAL="${BACKUP_CHECK_INTERVAL_SECONDS:-300}"
DATABASE_INTERVAL="${BACKUP_DATABASE_INTERVAL_SECONDS:-86400}"
FILES_INTERVAL="${BACKUP_FILES_INTERVAL_SECONDS:-604800}"
INTEGRITY_INTERVAL="${BACKUP_INTEGRITY_INTERVAL_SECONDS:-86400}"
DAILY_RETENTION_DAYS="${BACKUP_DAILY_RETENTION_DAYS:-14}"
WEEKLY_RETENTION_DAYS="${BACKUP_WEEKLY_RETENTION_DAYS:-56}"
MONTHLY_RETENTION_DAYS="${BACKUP_MONTHLY_RETENTION_DAYS:-365}"
HARD_STOP_GB="${BACKUP_HARD_STOP_GB:-5}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-clinic_crm}"
POSTGRES_USER="${POSTGRES_USER:-clinic_crm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-clinic_crm}"

STATUS_FILE="$BACKUP_DIR/status.json"
DATABASE_MARKER="$BACKUP_DIR/.last-database-backup"
FILES_MARKER="$BACKUP_DIR/.last-files-backup"
RESTORE_TEST_FILE="$BACKUP_DIR/restore-test.status"
INTEGRITY_MARKER="$BACKUP_DIR/.last-integrity-check"
LAST_DATABASE_ARCHIVE=""
LAST_FILES_ARCHIVE=""
LAST_DATABASE_AT=""
LAST_FILES_AT=""
LAST_INTEGRITY_AT=""
DATABASE_BYTES=0
FILES_BYTES=0
LAST_FAILURE=""

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

file_size() {
  if [ -f "$1" ]; then
    wc -c < "$1" | tr -d ' '
  else
    printf '0'
  fi
}

latest_archive() {
  latest_path=""
  latest_modified=0
  for candidate in "$@"; do
    [ -f "$candidate" ] || continue
    candidate_modified="$(stat -c %Y "$candidate" 2>/dev/null || printf '0')"
    if [ "$candidate_modified" -gt "$latest_modified" ]; then
      latest_path="$candidate"
      latest_modified="$candidate_modified"
    fi
  done
  printf '%s' "$latest_path"
}

write_archive_checksum() {
  archive="$1"
  checksum_line="$(sha256sum "$archive")" || return 1
  checksum="$(printf '%s' "$checksum_line" | awk '{print $1}')"
  [ -n "$checksum" ] || return 1
  printf '%s  %s\n' "$checksum" "$(basename "$archive")" > "$archive.sha256"
}

ensure_monthly_copy() {
  archive="$1"
  family="$2"
  timestamp="$3"
  month="$(date -u +%Y%m)"
  for existing in "$BACKUP_DIR"/temichevvet-"$family"-monthly-"$month"*.tar.gz; do
    [ -f "$existing" ] && return 0
  done
  monthly="$BACKUP_DIR/temichevvet-$family-monthly-$timestamp.tar.gz"
  (ln "$archive" "$monthly" 2>/dev/null || cp "$archive" "$monthly") || return 1
  write_archive_checksum "$monthly" || return 1
}

is_due() {
  marker="$1"
  interval="$2"
  [ ! -f "$marker" ] && return 0
  now="$(date +%s)"
  modified="$(stat -c %Y "$marker" 2>/dev/null || printf '0')"
  [ $((now - modified)) -ge "$interval" ]
}

has_minimum_free_space() {
  available_kb="$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print $4 }')"
  case "$available_kb" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$available_kb" -ge $((HARD_STOP_GB * 1024 * 1024)) ]
}

restore_test_value() {
  key="$1"
  [ -f "$RESTORE_TEST_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$RESTORE_TEST_FILE" | tail -n 1
}

json_string_or_null() {
  value="${1:-}"
  if [ -z "$value" ]; then
    printf 'null'
    return
  fi
  escaped="$(printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '"%s"' "$escaped"
}

write_status() {
  state="$1"
  error_message="${2:-}"
  restore_at="$(restore_test_value checked_at)"
  restore_state="$(restore_test_value state)"
  temp_file="$STATUS_FILE.tmp"
  state_json="$(json_string_or_null "$state")"
  database_at_json="$(json_string_or_null "$LAST_DATABASE_AT")"
  files_at_json="$(json_string_or_null "$LAST_FILES_AT")"
  integrity_at_json="$(json_string_or_null "$LAST_INTEGRITY_AT")"
  restore_at_json="$(json_string_or_null "$restore_at")"
  restore_state_json="$(json_string_or_null "$restore_state")"
  error_json="$(json_string_or_null "$error_message")"
  database_archive_json="$(json_string_or_null "$LAST_DATABASE_ARCHIVE")"
  files_archive_json="$(json_string_or_null "$LAST_FILES_ARCHIVE")"
  cat > "$temp_file" <<EOF
{
  "state": $state_json,
  "lastDatabaseBackupAt": $database_at_json,
  "lastFilesBackupAt": $files_at_json,
  "lastIntegrityCheckAt": $integrity_at_json,
  "lastRestoreTestAt": $restore_at_json,
  "lastRestoreTestState": $restore_state_json,
  "lastError": $error_json,
  "databaseArchive": $database_archive_json,
  "filesArchive": $files_archive_json,
  "databaseBytes": $DATABASE_BYTES,
  "filesBytes": $FILES_BYTES
}
EOF
  mv "$temp_file" "$STATUS_FILE"
}

create_database_backup() {
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run_dir="$BACKUP_DIR/.database-$timestamp"
  archive="$BACKUP_DIR/temichevvet-db-daily-$timestamp.tar.gz"
  mkdir -p "$run_dir"

  log "database backup started"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom --no-owner --no-privileges -f "$run_dir/postgres.dump" || return 1
  pg_restore --list "$run_dir/postgres.dump" >/dev/null || return 1

  if [ -d /redis-data ]; then
    tar -czf "$run_dir/redis-data.tar.gz" -C /redis-data . || return 1
  fi
  cat > "$run_dir/MANIFEST.txt" <<EOF
TemichevVet database backup
Created at: $created_at
Database: $POSTGRES_DB
Files are stored in separate weekly archives.
EOF
  (cd "$run_dir" && sha256sum postgres.dump redis-data.tar.gz 2>/dev/null || sha256sum postgres.dump) > "$run_dir/SHA256SUMS" || return 1
  tar -czf "$archive" -C "$BACKUP_DIR" ".database-$timestamp" || return 1
  tar -tzf "$archive" >/dev/null || return 1
  write_archive_checksum "$archive" || return 1
  rm -rf "$run_dir"

  ensure_monthly_copy "$archive" db "$timestamp" || return 1

  touch "$DATABASE_MARKER"
  LAST_DATABASE_ARCHIVE="$(basename "$archive")"
  LAST_DATABASE_AT="$created_at"
  LAST_INTEGRITY_AT="$created_at"
  DATABASE_BYTES="$(file_size "$archive")"
  log "database backup finished: $LAST_DATABASE_ARCHIVE"
}

create_files_backup() {
  timestamp="$(date -u +%Y%m%d-%H%M%S)"
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  archive="$BACKUP_DIR/temichevvet-files-weekly-$timestamp.tar.gz"
  log "files backup started"
  if [ -d /minio-data ]; then
    tar -czf "$archive" -C /minio-data . || return 1
  else
    tar -czf "$archive" --files-from /dev/null || return 1
  fi
  tar -tzf "$archive" >/dev/null || return 1
  write_archive_checksum "$archive" || return 1

  ensure_monthly_copy "$archive" files "$timestamp" || return 1

  touch "$FILES_MARKER"
  LAST_FILES_ARCHIVE="$(basename "$archive")"
  LAST_FILES_AT="$created_at"
  LAST_INTEGRITY_AT="$created_at"
  FILES_BYTES="$(file_size "$archive")"
  log "files backup finished: $LAST_FILES_ARCHIVE"
}

verify_archive() {
  archive="$1"
  [ -f "$archive" ] || return 0
  [ -f "$archive.sha256" ] || return 1
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive.sha256")" >/dev/null) || return 1
  tar -tzf "$archive" >/dev/null || return 1
}

verify_latest_archives() {
  checked_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  database_path=""
  files_path=""
  [ -n "$LAST_DATABASE_ARCHIVE" ] && database_path="$BACKUP_DIR/$LAST_DATABASE_ARCHIVE"
  [ -n "$LAST_FILES_ARCHIVE" ] && files_path="$BACKUP_DIR/$LAST_FILES_ARCHIVE"

  verify_archive "$database_path" || return 1
  verify_archive "$files_path" || return 1

  if [ -n "$database_path" ] && [ -f "$database_path" ]; then
    timestamp="$(date -u +%Y%m%d-%H%M%S)"
    verify_dir="$BACKUP_DIR/.integrity-$timestamp"
    mkdir -p "$verify_dir"
    tar -xzf "$database_path" -C "$verify_dir" || return 1
    dump_path="$(find "$verify_dir" -type f -name postgres.dump -print | head -n 1)"
    [ -n "$dump_path" ] || return 1
    pg_restore --list "$dump_path" >/dev/null || return 1
    rm -rf "$verify_dir"
  fi

  touch "$INTEGRITY_MARKER"
  LAST_INTEGRITY_AT="$checked_at"
  log "integrity check finished"
}

cleanup_old_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'temichevvet-db-daily-*.tar.gz*' -mtime "+$DAILY_RETENTION_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'temichevvet-files-weekly-*.tar.gz*' -mtime "+$WEEKLY_RETENTION_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'temichevvet-*-monthly-*.tar.gz*' -mtime "+$MONTHLY_RETENTION_DAYS" -delete
}

cleanup_incomplete_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '.database-*' -exec rm -rf {} +
  find "$BACKUP_DIR" -maxdepth 1 -type d -name '.integrity-*' -exec rm -rf {} +
  for archive in "$BACKUP_DIR"/temichevvet-*.tar.gz; do
    [ -e "$archive" ] || continue
    [ -f "$archive.sha256" ] || rm -f "$archive"
  done
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.tmp' -delete
}

initialize_state() {
  if [ -f "$DATABASE_MARKER" ]; then
    LAST_DATABASE_AT="$(date -u -r "$DATABASE_MARKER" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  fi
  if [ -f "$FILES_MARKER" ]; then
    LAST_FILES_AT="$(date -u -r "$FILES_MARKER" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  fi
  if [ -f "$INTEGRITY_MARKER" ]; then
    LAST_INTEGRITY_AT="$(date -u -r "$INTEGRITY_MARKER" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  fi
  database_path="$(latest_archive "$BACKUP_DIR"/temichevvet-db-*.tar.gz)"
  files_path="$(latest_archive "$BACKUP_DIR"/temichevvet-files-*.tar.gz)"
  if [ -n "$database_path" ]; then
    LAST_DATABASE_ARCHIVE="$(basename "$database_path")"
    DATABASE_BYTES="$(file_size "$BACKUP_DIR/$LAST_DATABASE_ARCHIVE")"
  fi
  if [ -n "$files_path" ]; then
    LAST_FILES_ARCHIVE="$(basename "$files_path")"
    FILES_BYTES="$(file_size "$BACKUP_DIR/$LAST_FILES_ARCHIVE")"
  fi
  return 0
}

run_cycle() {
  LAST_FAILURE=""
  write_status running || return 1
  if ! has_minimum_free_space; then
    write_status failed "На диске резервных копий свободно меньше ${HARD_STOP_GB} ГБ; новая копия не создавалась"
    return 0
  fi
  if is_due "$DATABASE_MARKER" "$DATABASE_INTERVAL"; then
    if ! create_database_backup; then
      LAST_FAILURE="Не удалось создать или проверить ежедневную копию базы данных"
      return 1
    fi
  fi
  if is_due "$FILES_MARKER" "$FILES_INTERVAL"; then
    if ! create_files_backup; then
      LAST_FAILURE="Не удалось создать или проверить еженедельную копию документов"
      return 1
    fi
  fi
  if is_due "$INTEGRITY_MARKER" "$INTEGRITY_INTERVAL"; then
    if ! verify_latest_archives; then
      LAST_FAILURE="Контрольная сумма, структура архива или PostgreSQL dump не прошли проверку"
      return 1
    fi
  fi
  if ! cleanup_old_backups; then
    LAST_FAILURE="Не удалось применить правила хранения резервных копий"
    return 1
  fi
  write_status ok || return 1
}

mkdir -p "$BACKUP_DIR"
initialize_state
if [ "${BACKUP_STATUS_ONLY:-false}" = "true" ]; then
  write_status ok
  exit 0
fi
log "backup service started: database daily, files weekly"
while true; do
  if ! run_cycle; then
    log "backup cycle failed"
    cleanup_incomplete_backups || true
    write_status failed "${LAST_FAILURE:-Ошибка создания резервной копии}"
  fi
  sleep "$CHECK_INTERVAL"
done
