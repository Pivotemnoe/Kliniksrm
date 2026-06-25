#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
FORCE_BUILD="false"
UPDATE_IMAGES="false"
SKIP_IMAGE_UPDATE="false"
OPEN_BROWSER="false"
DOCKER_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-}"

usage() {
  cat <<'USAGE'
Запуск локального сервера TemichevVet.

Использование:
  scripts/start-clinic-server.sh
  scripts/start-clinic-server.sh --build
  scripts/start-clinic-server.sh --update-images
  scripts/start-clinic-server.sh --open

Опции:
  --build            пересобрать api и web перед запуском
  --update-images    подтянуть свежие api/web образы из настроенного реестра
  --no-image-update  не подтягивать образы
  --open             открыть CRM в браузере на этом компьютере
  --help             показать справку
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      FORCE_BUILD="true"
      shift
      ;;
    --update-images)
      UPDATE_IMAGES="true"
      shift
      ;;
    --no-image-update)
      SKIP_IMAGE_UPDATE="true"
      shift
      ;;
    --open)
      OPEN_BROWSER="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Неизвестная опция: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Не найдена команда: $command_name" >&2
    echo "Установите Docker Desktop и повторите запуск." >&2
    exit 1
  fi
}

ensure_docker_running() {
  if docker version >/dev/null 2>&1; then
    return
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    echo "Docker установлен, но сейчас не запущен. Пробую открыть Docker Desktop..."
    open -a Docker >/dev/null 2>&1 || true

    for _ in $(seq 1 60); do
      if docker version >/dev/null 2>&1; then
        return
      fi
      sleep 2
    done
  fi

  echo "Docker Desktop не отвечает." >&2
  echo "Откройте Docker Desktop, дождитесь статуса Running и повторите запуск." >&2
  exit 1
}

detect_docker_platform() {
  if [[ -n "$DOCKER_PLATFORM" ]]; then
    return
  fi

  if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    DOCKER_PLATFORM="linux/amd64"
  fi
}

docker_pull_image() {
  local image="$1"

  if [[ -n "$DOCKER_PLATFORM" ]]; then
    docker pull --platform "$DOCKER_PLATFORM" "$image"
  else
    docker pull "$image"
  fi
}

docker_compose() {
  if [[ -n "$DOCKER_PLATFORM" ]]; then
    DOCKER_DEFAULT_PLATFORM="$DOCKER_PLATFORM" docker compose "$@"
  else
    docker compose "$@"
  fi
}

detect_local_ip() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -z "$ip" ]]; then
      ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  if [[ -z "$ip" ]]; then
    ip="IP_ЭТОГО_КОМПЬЮТЕРА"
  fi

  echo "$ip"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
    return
  fi

  date +%s | shasum -a 256 | awk '{print $1}'
}

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

load_env_value() {
  local key="$1"
  local fallback="$2"
  local value=""

  if [[ -f "$ENV_FILE" ]]; then
    value="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d '=' -f2- || true)"
  fi

  echo "${value:-$fallback}"
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts=40

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "$label не ответил за ${attempts} секунд: $url" >&2
  exit 1
}

has_docker_image() {
  local image="$1"
  docker image inspect "$image" >/dev/null 2>&1
}

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|y|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

backup_current_database() {
  if ! docker container inspect clinic-crm-postgres >/dev/null 2>&1; then
    echo "Existing PostgreSQL container was not found. Skipping pre-update backup."
    return
  fi

  local db_user
  local db_name
  local backup_dir
  local backup_file

  db_user="$(load_env_value POSTGRES_USER clinic_crm)"
  db_name="$(load_env_value POSTGRES_DB clinic_crm)"
  backup_dir="$ROOT_DIR/backups"
  backup_file="$backup_dir/pre-startup-update-$(date +%Y%m%d-%H%M%S).sql"

  mkdir -p "$backup_dir"

  echo "Creating database backup before program update..."
  echo "  $backup_file"
  if ! docker exec clinic-crm-postgres pg_dump -U "$db_user" -d "$db_name" > "$backup_file"; then
    rm -f "$backup_file"
    echo "Could not create database backup. Startup update stopped so clinic data is not put at risk." >&2
    exit 1
  fi
}

try_use_remote_images() {
  if [[ "$FORCE_BUILD" == "true" || "$SKIP_IMAGE_UPDATE" == "true" ]]; then
    return 1
  fi

  local auto_pull
  auto_pull="$(load_env_value TEMICHEVVET_AUTO_PULL_IMAGES true)"
  if [[ "$UPDATE_IMAGES" != "true" ]] && ! is_truthy "$auto_pull"; then
    return 1
  fi

  local remote_api
  local remote_web
  remote_api="$(load_env_value TEMICHEVVET_REMOTE_API_IMAGE 'ghcr.io/pivotemnoe/kliniksrm-api:stable')"
  remote_web="$(load_env_value TEMICHEVVET_REMOTE_WEB_IMAGE 'ghcr.io/pivotemnoe/kliniksrm-web:stable')"

  if [[ -z "$remote_api" || -z "$remote_web" ]]; then
    return 1
  fi

  echo "Проверяю обновлённые Docker-образы TemichevVet..."
  backup_current_database

  if [[ -n "$DOCKER_PLATFORM" ]]; then
    echo "Docker platform: $DOCKER_PLATFORM"
  fi

  if docker_pull_image "$remote_api" && docker_pull_image "$remote_web"; then
    set_env_value "TEMICHEVVET_API_IMAGE" "$remote_api"
    set_env_value "TEMICHEVVET_WEB_IMAGE" "$remote_web"
    echo "Будут использованы обновлённые Docker-образы из реестра."
    return 0
  fi

  echo "Не удалось обновить Docker-образы из реестра. Продолжаю с уже загруженными локальными образами."
  return 1
}

require_command docker
require_command curl
ensure_docker_running
detect_docker_platform

cd "$ROOT_DIR"

LOCAL_IP="$(detect_local_ip)"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    echo "Не найден $ENV_EXAMPLE" >&2
    exit 1
  fi

  cp "$ENV_EXAMPLE" "$ENV_FILE"
  set_env_value "WEB_BIND_ADDR" "0.0.0.0"
  set_env_value "APP_URL" "http://${LOCAL_IP}:3000"
  set_env_value "SESSION_SECRET" "$(random_secret)"

  echo "Создан файл настроек: $ENV_FILE"
fi

WEB_PORT="$(load_env_value WEB_PORT 3000)"
API_HOST_PORT="$(load_env_value API_HOST_PORT 4000)"
DIRECTOR_PHONE="$(load_env_value BOOTSTRAP_DIRECTOR_PHONE '+70000000001')"

if [[ "$FORCE_BUILD" == "true" ]]; then
  docker_compose build api web
else
  try_use_remote_images || true
fi

API_IMAGE="$(load_env_value TEMICHEVVET_API_IMAGE temichevvet-api:local)"
WEB_IMAGE="$(load_env_value TEMICHEVVET_WEB_IMAGE temichevvet-web:local)"

if [[ "$FORCE_BUILD" != "true" ]] && has_docker_image "$API_IMAGE" && has_docker_image "$WEB_IMAGE"; then
  echo "Найдены готовые Docker-образы. Запускаю без пересборки:"
  echo "  api: $API_IMAGE"
  echo "  web: $WEB_IMAGE"
  docker_compose up -d --no-build postgres redis minio api web
elif [[ "$FORCE_BUILD" != "true" ]] && has_docker_image "temichevvet-api:local" && has_docker_image "temichevvet-web:local"; then
  set_env_value "TEMICHEVVET_API_IMAGE" "temichevvet-api:local"
  set_env_value "TEMICHEVVET_WEB_IMAGE" "temichevvet-web:local"
  echo "Образы из реестра недоступны. Запускаю локальные offline-образы..."
  docker_compose up -d --no-build postgres redis minio api web
else
  docker_compose up -d postgres redis minio api web
fi

wait_for_url "http://127.0.0.1:${API_HOST_PORT}/api/health" "Backend"
wait_for_url "http://127.0.0.1:${WEB_PORT}" "Frontend"

LOCAL_URL="http://127.0.0.1:${WEB_PORT}/login"
NETWORK_URL="http://${LOCAL_IP}:${WEB_PORT}/login"

echo
echo "TemichevVet запущен."
echo
echo "Открыть на этом компьютере:"
echo "  $LOCAL_URL"
echo
echo "Открыть с других компьютеров в клинике:"
echo "  $NETWORK_URL"
echo
echo "Директор:"
echo "  логин: $DIRECTOR_PHONE"
echo "  пароль: смотрите BOOTSTRAP_DIRECTOR_PASSWORD в файле .env"
echo
echo "Остановить сервер:"
echo "  docker compose stop"
echo

if [[ "$OPEN_BROWSER" == "true" ]]; then
  if command -v open >/dev/null 2>&1; then
    open "$LOCAL_URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$LOCAL_URL" >/dev/null 2>&1 || true
  fi
fi
