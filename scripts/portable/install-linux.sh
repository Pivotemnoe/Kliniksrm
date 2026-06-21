#!/usr/bin/env bash
set -euo pipefail

PORTABLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$PORTABLE_ROOT/CRM"
INSTALL_DIR="$HOME/TemichevVet"
IMAGES_TAR="$PORTABLE_ROOT/docker-images/temichevvet-images.tar"
NO_START="false"
SKIP_COPY="false"
UPDATE="false"
NO_BACKUP="false"

for arg in "$@"; do
  case "$arg" in
    --no-start)
      NO_START="true"
      ;;
    --skip-copy)
      SKIP_COPY="true"
      ;;
    --update)
      UPDATE="true"
      ;;
    --no-backup)
      NO_BACKUP="true"
      ;;
    *)
      echo "Неизвестная опция: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Не найдена папка CRM на флешке: $SOURCE_DIR" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не найден."
  echo "Установите Docker Engine и Docker Compose Plugin, затем повторите запуск."
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "Docker установлен, но сервис сейчас не отвечает."
  echo "Запустите Docker и повторите установку."
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Не найдена команда rsync. Установите rsync и повторите запуск." >&2
  exit 1
fi

load_existing_env_value() {
  local key="$1"
  local fallback="$2"
  local env_file="$INSTALL_DIR/.env"

  if [[ ! -f "$env_file" ]]; then
    printf '%s\n' "$fallback"
    return
  fi

  local line
  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    printf '%s\n' "$fallback"
    return
  fi

  local value="${line#*=}"
  if [[ -z "$value" ]]; then
    printf '%s\n' "$fallback"
  else
    printf '%s\n' "$value"
  fi
}

backup_current_database() {
  if [[ "$NO_BACKUP" == "true" || ! -d "$INSTALL_DIR" ]]; then
    return
  fi

  if ! docker container inspect clinic-crm-postgres >/dev/null 2>&1; then
    echo "Контейнер PostgreSQL не найден. Docker volumes с данными не будут тронуты."
    return
  fi

  local db_user db_name backup_dir backup_file
  db_user="$(load_existing_env_value POSTGRES_USER clinic_crm)"
  db_name="$(load_existing_env_value POSTGRES_DB clinic_crm)"
  backup_dir="$INSTALL_DIR/backups"
  backup_file="$backup_dir/pre-update-$(date +%Y%m%d-%H%M%S).sql"

  mkdir -p "$backup_dir"
  echo "Создаю резервную копию базы перед обновлением:"
  echo "  $backup_file"
  if ! docker exec clinic-crm-postgres pg_dump -U "$db_user" -d "$db_name" > "$backup_file"; then
    rm -f "$backup_file"
    echo "Не удалось создать backup базы. Обновление остановлено, чтобы не рисковать данными." >&2
    exit 1
  fi
}

if [[ "$UPDATE" == "true" || -d "$INSTALL_DIR" ]]; then
  backup_current_database
fi

if [[ "$SKIP_COPY" != "true" ]]; then
  mkdir -p "$INSTALL_DIR"

  if [[ "$UPDATE" == "true" || -d "$INSTALL_DIR" ]]; then
    echo "Обновляю TemichevVet в $INSTALL_DIR ..."
  else
    echo "Копирую TemichevVet в $INSTALL_DIR ..."
  fi

  rsync -a \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'backups/' \
    --exclude 'dist/' \
    --exclude '.cache/' \
    --exclude '.tmp/' \
    --exclude 'coverage/' \
    --exclude '.env' \
    --exclude '.env.local' \
    --exclude '.env.development' \
    --exclude '.env.production' \
    --exclude '.env.test' \
    --exclude '*.tsbuildinfo' \
    --exclude '*.log' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"
fi

chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR"/start-temichevvet.command 2>/dev/null || true

if [[ -f "$IMAGES_TAR" ]]; then
  echo "Загружаю Docker-образы из комплекта..."
  docker load --input "$IMAGES_TAR"
fi

if [[ "$NO_START" != "true" ]]; then
  "$INSTALL_DIR/scripts/start-clinic-server.sh" --open --no-image-update
fi
