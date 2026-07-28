#!/usr/bin/env bash
set -euo pipefail

PORTABLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$PORTABLE_ROOT/CRM"
DEFAULT_INSTALL_DIR="$HOME/TemichevVet"
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
IMAGES_TAR="$PORTABLE_ROOT/docker-images/temichevvet-images.tar"
IMAGES_SHA256="$IMAGES_TAR.sha256"
NO_START="false"
SKIP_COPY="false"
UPDATE="false"
NO_BACKUP="false"
EXISTING_INFRASTRUCTURE="false"
POSTGRES_IMAGE_ID=""
REDIS_IMAGE_ID=""
MINIO_IMAGE_ID=""
EXISTING_COMPOSE_PROJECT=""

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
  echo "Docker Desktop не найден."
  echo "Установите Docker Desktop для macOS, откройте его и повторите запуск."
  exit 1
fi

if ! docker version >/dev/null 2>&1; then
  echo "Docker установлен, но сейчас не запущен. Пробую открыть Docker Desktop..."
  open -a Docker >/dev/null 2>&1 || true

  for _ in $(seq 1 60); do
    if docker version >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  if ! docker version >/dev/null 2>&1; then
    echo "Docker Desktop не запустился автоматически."
    echo "Откройте Docker Desktop вручную, дождитесь запуска и повторите установку."
    exit 1
  fi
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

capture_existing_infrastructure() {
  if ! docker container inspect clinic-crm-postgres clinic-crm-redis clinic-crm-minio >/dev/null 2>&1; then
    return
  fi

  POSTGRES_IMAGE_ID="$(docker container inspect --format '{{.Image}}' clinic-crm-postgres)"
  REDIS_IMAGE_ID="$(docker container inspect --format '{{.Image}}' clinic-crm-redis)"
  MINIO_IMAGE_ID="$(docker container inspect --format '{{.Image}}' clinic-crm-minio)"
  EXISTING_INFRASTRUCTURE="true"

  local existing_working_dir
  existing_working_dir="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' clinic-crm-postgres 2>/dev/null || true)"
  EXISTING_COMPOSE_PROJECT="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' clinic-crm-postgres 2>/dev/null || true)"
  if [[ -n "$existing_working_dir" && -f "$existing_working_dir/docker-compose.yml" ]]; then
    INSTALL_DIR="$existing_working_dir"
  fi

  echo "Найдена действующая локальная база. Обновятся только api и web."
  echo "Рабочая папка: $INSTALL_DIR"
  echo "PostgreSQL, Redis, MinIO и Docker volumes перезапускаться или удаляться не будут."
}

restore_existing_infrastructure_tags() {
  if [[ "$EXISTING_INFRASTRUCTURE" != "true" ]]; then
    return
  fi

  # Windows-архив содержит одноимённые amd64-образы инфраструктуры. После
  # docker load возвращаем стандартные теги образам, которые уже обслуживают
  # этот Apple Silicon Mac, не пересоздавая сами контейнеры.
  docker tag "$POSTGRES_IMAGE_ID" postgres:16-alpine
  docker tag "$REDIS_IMAGE_ID" redis:7-alpine
  docker tag "$MINIO_IMAGE_ID" minio/minio:latest
}

select_portable_application_images() {
  local env_file="$INSTALL_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    return
  fi

  for setting in \
    "TEMICHEVVET_API_IMAGE=temichevvet-api:local" \
    "TEMICHEVVET_WEB_IMAGE=temichevvet-web:local"; do
    local key="${setting%%=*}"
    if grep -q "^${key}=" "$env_file"; then
      sed -i.bak "s|^${key}=.*|${setting}|" "$env_file"
      rm -f "$env_file.bak"
    else
      printf '\n%s\n' "$setting" >> "$env_file"
    fi
  done
}

capture_existing_infrastructure

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
  [[ -f "$IMAGES_SHA256" ]] || { echo "Не найден SHA-256 архива Docker-образов." >&2; exit 1; }
  (cd "$(dirname "$IMAGES_TAR")" && shasum -a 256 -c "$(basename "$IMAGES_SHA256")")
  echo "Загружаю Docker-образы из комплекта..."
  if ! docker load --input "$IMAGES_TAR"; then
    restore_existing_infrastructure_tags
    echo "Не удалось загрузить Docker-образы. Теги действующей базы восстановлены; контейнеры не перезапускались." >&2
    exit 1
  fi
  restore_existing_infrastructure_tags
  select_portable_application_images
fi

if [[ "$NO_START" != "true" ]]; then
  if [[ "$EXISTING_INFRASTRUCTURE" == "true" ]]; then
    if [[ -n "$EXISTING_COMPOSE_PROJECT" ]]; then
      COMPOSE_PROJECT_NAME="$EXISTING_COMPOSE_PROJECT" \
        "$INSTALL_DIR/scripts/start-clinic-server.sh" --app-only --open --no-image-update
    else
      "$INSTALL_DIR/scripts/start-clinic-server.sh" --app-only --open --no-image-update
    fi
  else
    "$INSTALL_DIR/scripts/start-clinic-server.sh" --open --no-image-update
  fi
fi
