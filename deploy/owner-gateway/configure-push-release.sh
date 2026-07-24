#!/bin/sh

set -eu

image="${1:-}"
base_dir="${2:-/opt/temichevvet-owner-gateway}"

case "$image" in
  ''|*[!A-Za-z0-9._:/-]*)
    echo "Укажите безопасный Docker-тег owner-gateway" >&2
    exit 2
    ;;
esac

cd "$base_dir"

if [ ! -f .env ] || [ ! -f docker-compose.yml ] || [ ! -f docker-compose.yml.push-ui ]; then
  echo "Не найдены файлы конфигурации owner-gateway" >&2
  exit 3
fi

if docker compose version >/dev/null 2>&1; then
  compose() { docker compose "$@"; }
elif command -v docker-compose >/dev/null 2>&1; then
  compose() { docker-compose "$@"; }
else
  echo "Docker Compose не найден" >&2
  exit 4
fi

umask 077
next_env=".env.push-next.$$"
trap 'rm -f "$next_env"' EXIT INT TERM

grep -v -E '^(OWNER_GATEWAY_IMAGE|OWNER_GATEWAY_VAPID_SUBJECT|OWNER_GATEWAY_VAPID_PUBLIC_KEY|OWNER_GATEWAY_VAPID_PRIVATE_KEY)=' .env > "$next_env"

if grep -q '^OWNER_GATEWAY_VAPID_PUBLIC_KEY=.' .env && grep -q '^OWNER_GATEWAY_VAPID_PRIVATE_KEY=.' .env; then
  vapid_lines="$(grep -E '^OWNER_GATEWAY_VAPID_(PUBLIC|PRIVATE)_KEY=' .env)"
else
  vapid_lines="$(docker run --rm --entrypoint node "$image" -e 'const webPush = require("web-push"); const keys = webPush.generateVAPIDKeys(); process.stdout.write("OWNER_GATEWAY_VAPID_PUBLIC_KEY=" + keys.publicKey + "\nOWNER_GATEWAY_VAPID_PRIVATE_KEY=" + keys.privateKey)')"
fi

{
  printf 'OWNER_GATEWAY_IMAGE=%s\n' "$image"
  printf '%s\n' 'OWNER_GATEWAY_VAPID_SUBJECT=mailto:info@temichevvet.ru'
  printf '%s\n' "$vapid_lines"
} >> "$next_env"

compose --env-file "$next_env" -f docker-compose.yml.push-ui config --quiet

stamp="$(date +%Y%m%d-%H%M%S)"
cp -p .env ".env.pre-push-$stamp"
cp -p docker-compose.yml "docker-compose.yml.pre-push-$stamp"
install -m 600 "$next_env" .env
install -m 644 docker-compose.yml.push-ui docker-compose.yml

echo "Конфигурация owner-gateway подготовлена: $image"
