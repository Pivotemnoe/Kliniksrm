#!/bin/sh
set -eu

target="${1:-.env}"
token_file="${2:-.max-bot-token}"

if [ -e "$target" ]; then
  echo "Файл $target уже существует; существующие секреты не изменены." >&2
  exit 1
fi

if [ ! -s "$token_file" ]; then
  echo "Не найден непустой файл токена MAX: $token_file" >&2
  exit 1
fi

umask 077
postgres_password="$(openssl rand -hex 32)"
sync_secret="$(openssl rand -hex 32)"
webhook_secret="$(openssl rand -hex 32)"
max_token="$(tr -d '\r\n' < "$token_file")"

install -m 600 /dev/null "$target"
{
  printf 'OWNER_GATEWAY_IMAGE=%s\n' 'temichevvet-owner-gateway:20260723-amd64'
  printf 'OWNER_GATEWAY_POSTGRES_DB=%s\n' 'owner_gateway'
  printf 'OWNER_GATEWAY_POSTGRES_USER=%s\n' 'owner_gateway'
  printf 'OWNER_GATEWAY_POSTGRES_PASSWORD=%s\n' "$postgres_password"
  printf 'OWNER_GATEWAY_SYNC_SECRET=%s\n' "$sync_secret"
  printf 'OWNER_GATEWAY_SESSION_DAYS=%s\n' '30'
  printf 'OWNER_GATEWAY_HOST_PORT=%s\n' '4100'
  printf 'OWNER_GATEWAY_BACKUP_INTERVAL_SECONDS=%s\n' '86400'
  printf 'OWNER_GATEWAY_BACKUP_RETENTION_DAYS=%s\n' '14'
  printf 'MAX_BOT_NAME=%s\n' 'id230210303969_2_bot'
  printf 'MAX_BOT_TOKEN=%s\n' "$max_token"
  printf 'MAX_WEBHOOK_SECRET=%s\n' "$webhook_secret"
} > "$target"

unset postgres_password sync_secret webhook_secret max_token
