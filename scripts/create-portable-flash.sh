#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INCLUDE_IMAGES="false"
SKIP_IMAGE_BUILD="false"
PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
DESTINATION=""

usage() {
  cat <<'USAGE'
Создание флешки-установщика TemichevVet.

Использование:
  scripts/create-portable-flash.sh /Volumes/FLASH
  scripts/create-portable-flash.sh --include-images /Volumes/FLASH
  scripts/create-portable-flash.sh --include-images --skip-image-build /Volumes/FLASH
  scripts/create-portable-flash.sh --include-images --platform linux/amd64 /Volumes/FLASH

Опции:
  --include-images  собрать и положить Docker-образы на флешку для установки почти без интернета
  --skip-image-build  не пересобирать api/web, а сохранить уже готовые локальные образы
  --platform VALUE  платформа Docker-образов, по умолчанию linux/amd64 для Windows/Linux ПК
  --help            показать справку

На macOS флешки обычно находятся в /Volumes/НАЗВАНИЕ_ФЛЕШКИ.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-images)
      INCLUDE_IMAGES="true"
      shift
      ;;
    --skip-image-build)
      SKIP_IMAGE_BUILD="true"
      shift
      ;;
    --platform)
      if [[ $# -lt 2 ]]; then
        echo "После --platform нужно указать значение, например linux/amd64." >&2
        exit 1
      fi
      PLATFORM="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      if [[ -n "$DESTINATION" ]]; then
        echo "Указано больше одного пути к флешке." >&2
        usage >&2
        exit 1
      fi
      DESTINATION="$1"
      shift
      ;;
  esac
done

if [[ -z "$DESTINATION" ]]; then
  echo "Укажите путь к флешке." >&2
  usage >&2
  exit 1
fi

if [[ ! -d "$DESTINATION" ]]; then
  echo "Путь не найден: $DESTINATION" >&2
  exit 1
fi

DESTINATION="$(cd "$DESTINATION" && pwd)"

if [[ "$DESTINATION" == "/" || "$DESTINATION" == "$ROOT_DIR" ]]; then
  echo "Нельзя собирать переносной комплект в этот путь: $DESTINATION" >&2
  exit 1
fi

PORTABLE_DIR="$DESTINATION/TemichevVet-Portable"
TMP_DIR="$DESTINATION/TemichevVet-Portable.tmp"
BACKUP_DIR="$DESTINATION/TemichevVet-Portable.old-$(date +%Y%m%d-%H%M%S)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_COMMIT="local"
if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || echo local)"
fi

CONNECTIVITY_ENV_SOURCE="$ROOT_DIR/.env"
CONNECTIVITY_ENV_TARGET="$TMP_DIR/portable/clinic-connectivity.env"
CONNECTIVITY_KEYS=(
  OWNER_GATEWAY_URL
  OWNER_GATEWAY_SYNC_SECRET
  OWNER_GATEWAY_REQUEST_TIMEOUT_MS
  NOTIFICATION_DISPATCH_INTERVAL_MS
  CLIENT_PORTAL_PUBLIC_URL
  MAX_BOT_NAME
  MAX_BOT_TOKEN
  MAX_API_BASE_URL
  TELEGRAM_BOT_USERNAME
  TELEGRAM_BOT_TOKEN
  TELEGRAM_WEBHOOK_SECRET
  TELEGRAM_API_BASE_URL
)

if ! command -v rsync >/dev/null 2>&1; then
  echo "Не найдена команда rsync." >&2
  exit 1
fi

export COPYFILE_DISABLE=1

RSYNC_MACOS_EXCLUDES=(
  --exclude '.DS_Store'
  --exclude '._*'
  --exclude '.AppleDouble/'
  --exclude '.Spotlight-V100/'
  --exclude '.Trashes/'
  --exclude '.fseventsd/'
)

cleanup_macos_metadata() {
  local target="$1"

  if [[ -e "$target" ]]; then
    find "$target" \( -name '._*' -o -name '.DS_Store' \) -type f -exec rm -f {} +
  fi
}

write_windows_text() {
  local source="$1"
  local target="$2"

  LC_ALL=C awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$source" > "$target"
}

write_windows_powershell() {
  local source="$1"
  local target="$2"

  printf '\xef\xbb\xbf' > "$target"
  LC_ALL=C awk '{ sub(/\r$/, ""); printf "%s\r\n", $0 }' "$source" >> "$target"
}

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/CRM" "$TMP_DIR/portable"

echo "Копирую чистую CRM..."
rsync -a \
  "${RSYNC_MACOS_EXCLUDES[@]}" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'backups/' \
  --exclude 'dist/' \
  --exclude '.cache/' \
  --exclude '.tmp/' \
  --exclude 'coverage/' \
  --exclude 'installers/' \
  --exclude 'docker-images/' \
  --exclude 'TemichevVet-Portable/' \
  --exclude 'TemichevVet-Portable.tmp/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.development' \
  --exclude '.env.production' \
  --exclude '.env.test' \
  --exclude '*.tsbuildinfo' \
  --exclude '*.log' \
  "$ROOT_DIR/" "$TMP_DIR/CRM/"

cp "$ROOT_DIR/scripts/portable/README.txt" "$TMP_DIR/README-mac-linux.txt"

if command -v iconv >/dev/null 2>&1; then
  # Windows Notepad opens UTF-16LE with BOM reliably on old and new systems.
  printf '\xff\xfe' > "$TMP_DIR/README.txt"
  iconv -f UTF-8 -t UTF-16LE "$ROOT_DIR/scripts/portable/README.txt" >> "$TMP_DIR/README.txt"
  cp "$TMP_DIR/README.txt" "$TMP_DIR/README-Windows.txt"
else
  cp "$ROOT_DIR/scripts/portable/README.txt" "$TMP_DIR/README.txt"
  cp "$ROOT_DIR/scripts/portable/README.txt" "$TMP_DIR/README-Windows.txt"
fi

write_windows_powershell "$ROOT_DIR/scripts/portable/install-windows.ps1" "$TMP_DIR/portable/install-windows.ps1"
write_windows_powershell "$ROOT_DIR/scripts/portable/install-workstation-windows.ps1" "$TMP_DIR/portable/install-workstation-windows.ps1"
cp "$ROOT_DIR/scripts/portable/install-mac.sh" "$TMP_DIR/portable/install-mac.sh"
cp "$ROOT_DIR/scripts/portable/install-linux.sh" "$TMP_DIR/portable/install-linux.sh"
write_windows_text "$ROOT_DIR/scripts/portable/start-windows.bat" "$TMP_DIR/Установить TemichevVet - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/update-windows.bat" "$TMP_DIR/Обновить TemichevVet - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/update-online-windows.bat" "$TMP_DIR/Обновить TemichevVet через интернет - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/configure-github-updates-windows.bat" "$TMP_DIR/Настроить обновления GitHub - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/check-version-windows.bat" "$TMP_DIR/Проверить версию TemichevVet - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/start-workstation-windows.bat" "$TMP_DIR/Подключить рабочее место - Windows.bat"
cp "$ROOT_DIR/scripts/portable/start-mac.command" "$TMP_DIR/Установить TemichevVet - Mac.command"
cp "$ROOT_DIR/scripts/portable/update-mac.command" "$TMP_DIR/Обновить TemichevVet - Mac.command"
cp "$ROOT_DIR/scripts/portable/start-linux.sh" "$TMP_DIR/Установить TemichevVet - Linux.sh"
cp "$ROOT_DIR/scripts/portable/update-linux.sh" "$TMP_DIR/Обновить TemichevVet - Linux.sh"

while IFS= read -r -d '' powershell_file; do
  normalized_file="${powershell_file}.windows"
  write_windows_powershell "$powershell_file" "$normalized_file"
  mv "$normalized_file" "$powershell_file"
done < <(find "$TMP_DIR/CRM" -type f -name '*.ps1' -print0)

while IFS= read -r -d '' batch_file; do
  normalized_file="${batch_file}.windows"
  write_windows_text "$batch_file" "$normalized_file"
  mv "$normalized_file" "$batch_file"
done < <(find "$TMP_DIR/CRM" -type f \( -name '*.bat' -o -name '*.cmd' \) -print0)

if [[ -f "$CONNECTIVITY_ENV_SOURCE" ]]; then
  connectivity_count=0
  {
    echo "# TemichevVet clinic connectivity settings. Keep this flash drive protected."
    for key in "${CONNECTIVITY_KEYS[@]}"; do
      line="$(grep -E "^${key}=" "$CONNECTIVITY_ENV_SOURCE" | tail -1 || true)"
      value="${line#*=}"
      if [[ -n "$line" && -n "$value" ]]; then
        printf '%s=%s\n' "$key" "$value"
        connectivity_count=$((connectivity_count + 1))
      fi
    done
  } > "$CONNECTIVITY_ENV_TARGET"

  if [[ "$connectivity_count" -gt 0 ]]; then
    chmod 600 "$CONNECTIVITY_ENV_TARGET" 2>/dev/null || true
    echo "Добавлены настройки связи личного кабинета: $connectivity_count параметров (значения не выводятся)."
  else
    rm -f "$CONNECTIVITY_ENV_TARGET"
    echo "Предупреждение: в локальном .env нет настроек связи личного кабинета."
  fi
else
  echo "Предупреждение: локальный .env не найден; настройки связи личного кабинета не добавлены."
fi

{
  echo "TemichevVet Portable"
  echo "created_at=$BUILD_DATE"
  echo "platform=$PLATFORM"
  echo "git_commit=$GIT_COMMIT"
} > "$TMP_DIR/VERSION.txt"

if [[ -d "$ROOT_DIR/installers" ]]; then
  mkdir -p "$TMP_DIR/installers"
  rsync -a "${RSYNC_MACOS_EXCLUDES[@]}" "$ROOT_DIR/installers/" "$TMP_DIR/installers/"
fi

chmod +x \
  "$TMP_DIR/portable/install-mac.sh" \
  "$TMP_DIR/portable/install-linux.sh" \
  "$TMP_DIR/Установить TemichevVet - Mac.command" \
  "$TMP_DIR/Обновить TemichevVet - Mac.command" \
  "$TMP_DIR/Установить TemichevVet - Linux.sh" \
  "$TMP_DIR/Обновить TemichevVet - Linux.sh"

if [[ ! -f "$TMP_DIR/installers/Docker Desktop Installer.exe" ]]; then
  echo "Предупреждение: установщик Docker Desktop для Windows не найден в installers/."
  echo "Можно скачать его командой: npm run clinic:download-docker-windows"
fi

if [[ "$INCLUDE_IMAGES" == "true" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker не найден, поэтому нельзя добавить Docker-образы." >&2
    exit 1
  fi

  cd "$ROOT_DIR"
  mkdir -p "$TMP_DIR/docker-images"

  if [[ "$SKIP_IMAGE_BUILD" == "true" ]]; then
    echo "Использую уже готовые локальные Docker-образы api и web для платформы $PLATFORM..."
  else
    echo "Собираю Docker-образы api и web для платформы $PLATFORM..."
    DOCKER_DEFAULT_PLATFORM="$PLATFORM" docker buildx build --platform "$PLATFORM" --load --pull=false \
      --build-arg "TEMICHEVVET_GIT_COMMIT=$GIT_COMMIT" \
      --build-arg "TEMICHEVVET_BUILD_DATE=$BUILD_DATE" \
      --build-arg "TEMICHEVVET_IMAGE_SOURCE=portable-flash" \
      -t temichevvet-api:local -f apps/api/Dockerfile .
    DOCKER_DEFAULT_PLATFORM="$PLATFORM" docker buildx build --platform "$PLATFORM" --load --pull=false \
      --build-arg "TEMICHEVVET_GIT_COMMIT=$GIT_COMMIT" \
      --build-arg "TEMICHEVVET_BUILD_DATE=$BUILD_DATE" \
      --build-arg "TEMICHEVVET_IMAGE_SOURCE=portable-flash" \
      -t temichevvet-web:local -f apps/web/Dockerfile .
  fi

  IMAGES="$(
    TEMICHEVVET_API_IMAGE=temichevvet-api:local \
    TEMICHEVVET_WEB_IMAGE=temichevvet-web:local \
      docker compose config --images | tr '\n' ' '
  )"
  if [[ -z "$IMAGES" ]]; then
    echo "Не удалось получить список Docker-образов." >&2
    exit 1
  fi

  echo "Скачиваю базовые образы postgres, redis и minio..."
  if ! DOCKER_DEFAULT_PLATFORM="$PLATFORM" docker compose pull postgres redis minio; then
    echo "Не удалось скачать один из базовых образов. Проверяю локальные Docker-образы..."
    for image in $IMAGES; do
      if ! docker image inspect "$image" >/dev/null 2>&1; then
        echo "Локально не найден образ: $image" >&2
        echo "Повторите сборку при стабильном интернете или заранее скачайте этот образ." >&2
        exit 1
      fi
    done
    echo "Все нужные образы есть локально, продолжаю сборку флешки."
  fi

  echo "Проверяю, что Docker-образы доступны для платформы $PLATFORM..."
  for image in $IMAGES; do
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      echo "Локально не найден образ: $image" >&2
      echo "Повторите сборку при стабильном интернете или заранее скачайте этот образ." >&2
      exit 1
    fi
  done

  echo "Сохраняю Docker-образы на флешку строго для платформы $PLATFORM..."
  docker save --platform "$PLATFORM" -o "$TMP_DIR/docker-images/temichevvet-images.tar" $IMAGES
fi

cleanup_macos_metadata "$TMP_DIR"

if [[ -e "$PORTABLE_DIR" ]]; then
  mv "$PORTABLE_DIR" "$BACKUP_DIR"
  cleanup_macos_metadata "$BACKUP_DIR"
  echo "Предыдущий комплект сохранён как: $BACKUP_DIR"
fi

mv "$TMP_DIR" "$PORTABLE_DIR"
cleanup_macos_metadata "$PORTABLE_DIR"
find "$DESTINATION" -maxdepth 1 -name '._TemichevVet-Portable*' -type f -exec rm -f {} +

echo
echo "Готово. Комплект создан:"
echo "  $PORTABLE_DIR"
echo
echo "На флешке будут кнопки:"
echo "  Установить TemichevVet - Windows.bat"
echo "  Обновить TemichevVet - Windows.bat"
echo "  Обновить TemichevVet через интернет - Windows.bat"
echo "  Настроить обновления GitHub - Windows.bat"
echo "  Проверить версию TemichevVet - Windows.bat"
echo "  Подключить рабочее место - Windows.bat"
echo "  Установить TemichevVet - Mac.command"
echo "  Обновить TemichevVet - Mac.command"
echo "  Установить TemichevVet - Linux.sh"
echo "  Обновить TemichevVet - Linux.sh"
echo
