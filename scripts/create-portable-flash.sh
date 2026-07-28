#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INCLUDE_IMAGES="false"
SKIP_IMAGE_BUILD="false"
SKIP_CONNECTIVITY="false"
PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
DESTINATION=""
TRANSFER_DATA_SOURCE=""

usage() {
  cat <<'USAGE'
Создание флешки-установщика TemichevVet.

Использование:
  scripts/create-portable-flash.sh /Volumes/FLASH
  scripts/create-portable-flash.sh --include-images /Volumes/FLASH
  scripts/create-portable-flash.sh --include-images --skip-image-build /Volumes/FLASH
  scripts/create-portable-flash.sh --skip-connectivity /path/to/empty-test-folder
  scripts/create-portable-flash.sh --include-images --platform linux/amd64 /Volumes/FLASH
  scripts/create-portable-flash.sh --include-transfer-data /path/to/checked-import /Volumes/FLASH

Опции:
  --include-images  собрать и положить Docker-образы на флешку для установки почти без интернета
  --skip-image-build  не пересобирать api/web, а сохранить уже готовые локальные образы
  --skip-connectivity  не добавлять секреты личного кабинета и мессенджеров
  --include-transfer-data PATH  добавить отдельно проверенные файлы владельцев и пациентов без автоматического импорта
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
    --skip-connectivity)
      SKIP_CONNECTIVITY="true"
      shift
      ;;
    --include-transfer-data)
      if [[ $# -lt 2 ]]; then
        echo "После --include-transfer-data нужно указать папку с проверенными файлами импорта." >&2
        exit 1
      fi
      TRANSFER_DATA_SOURCE="$2"
      shift 2
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

if [[ -n "$TRANSFER_DATA_SOURCE" ]]; then
  if [[ ! -d "$TRANSFER_DATA_SOURCE" ]]; then
    echo "Папка с файлами импорта не найдена: $TRANSFER_DATA_SOURCE" >&2
    exit 1
  fi
  TRANSFER_DATA_SOURCE="$(cd "$TRANSFER_DATA_SOURCE" && pwd)"
  if [[ ! -f "$TRANSFER_DATA_SOURCE/clients-import.csv" || ! -f "$TRANSFER_DATA_SOURCE/manifest.json" ]]; then
    echo "В папке импорта нужны проверенные файлы clients-import.csv и manifest.json." >&2
    exit 1
  fi
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

echo "Цель действия: создать переносной комплект TemichevVet для Windows/Linux в указанной папке."
echo "Точная папка назначения: $PORTABLE_DIR"
echo "Рабочая база клиники и Docker volumes не изменяются и не удаляются."
if [[ -e "$PORTABLE_DIR" ]]; then
  echo "Существующий комплект будет сохранён отдельно: $BACKUP_DIR"
fi

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
  TEMICHEVVET_LICENSE_MODE
  TEMICHEVVET_LICENSE_PUBLIC_KEY_B64
  TEMICHEVVET_SUPPORT_URL
  TEMICHEVVET_SUPPORT_EMAIL
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
    # exFAT may expose decomposed Unicode AppleDouble names that cannot be
    # unlinked through the exact path returned by find. A directory glob
    # removes only macOS metadata files and works for those names as well.
    while IFS= read -r -d '' directory; do
      rm -f "$directory"/._* "$directory"/.DS_Store 2>/dev/null || true
    done < <(find "$target" -type d -print0)
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

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/CRM" "$TMP_DIR/portable"

echo "Копирую чистую CRM..."
if [[ "$GIT_COMMIT" != "local" ]] && command -v tar >/dev/null 2>&1; then
  echo "Источник кода: зафиксированный Git-коммит $GIT_COMMIT"
  git -C "$ROOT_DIR" archive --format=tar HEAD | tar -xf - -C "$TMP_DIR/CRM"
else
  echo "Предупреждение: Git-коммит недоступен; использую очищенную копию рабочей папки."
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
    --exclude '.env.runtime' \
    --exclude '.env.local' \
    --exclude '.env.development' \
    --exclude '.env.production' \
    --exclude '.env.test' \
    --exclude '*.tsbuildinfo' \
    --exclude '*.log' \
    "$ROOT_DIR/" "$TMP_DIR/CRM/"
fi

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

if [[ -n "$TRANSFER_DATA_SOURCE" ]]; then
  transfer_target="$TMP_DIR/Импорт владельцев и животных"
  mkdir -p "$transfer_target"
  rsync -a "${RSYNC_MACOS_EXCLUDES[@]}" "$TRANSFER_DATA_SOURCE/" "$transfer_target/"

  transfer_instructions="$TMP_DIR/transfer-import-instructions.txt"
  cat > "$transfer_instructions" <<'INSTRUCTIONS'
ИМПОРТ ВЛАДЕЛЬЦЕВ И ЖИВОТНЫХ В TEMICHEVVET

Обновление программы не заменяет базу клиники и не переносит клиентов автоматически.

1. Запустите TemichevVet и войдите как директор или администратор.
2. Откройте «Настройки» -> «Перенос данных».
3. Выберите файл «clients-import.csv» из этой папки.
4. Сначала нажмите «Проверить файл без записи».
5. Проверьте количество новых записей, совпадений и ошибок.
6. Только после проверки отдельно подтвердите перенос в базу.

Файлы owners.csv и animals.csv оставлены для контроля. Файл visits-summary-reference-only.csv является только справочным и не должен загружаться как история лечения.
INSTRUCTIONS
  if command -v iconv >/dev/null 2>&1; then
    printf '\xff\xfe' > "$transfer_target/КАК ИМПОРТИРОВАТЬ.txt"
    iconv -f UTF-8 -t UTF-16LE "$transfer_instructions" >> "$transfer_target/КАК ИМПОРТИРОВАТЬ.txt"
  else
    cp "$transfer_instructions" "$transfer_target/КАК ИМПОРТИРОВАТЬ.txt"
  fi
  rm -f "$transfer_instructions"
  echo "Добавлены отдельные файлы импорта владельцев и животных. Автоматическая запись в БД отключена."
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
write_windows_text "$ROOT_DIR/scripts/portable/export-transfer-windows.bat" "$TMP_DIR/Создать комплект переноса TemichevVet - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/restore-transfer-windows.bat" "$TMP_DIR/Восстановить TemichevVet на новом компьютере - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/verify-backup-windows.bat" "$TMP_DIR/Проверить резервную копию TemichevVet - Windows.bat"
write_windows_text "$ROOT_DIR/scripts/portable/configure-backup-storage-windows.bat" "$TMP_DIR/Настроить отдельный диск резервных копий - Windows.bat"
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

if [[ "$SKIP_CONNECTIVITY" == "true" ]]; then
  echo "Настройки связи личного кабинета пропущены по параметру --skip-connectivity."
elif [[ -f "$CONNECTIVITY_ENV_SOURCE" ]]; then
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
    TEMICHEVVET_INFRA_PLATFORM="$PLATFORM" \
      docker compose config --images | sort -u | tr '\n' ' '
  )"
  if [[ -z "$IMAGES" ]]; then
    echo "Не удалось получить список Docker-образов." >&2
    exit 1
  fi

  echo "Скачиваю базовые образы postgres, redis и minio..."
  if ! DOCKER_DEFAULT_PLATFORM="$PLATFORM" TEMICHEVVET_INFRA_PLATFORM="$PLATFORM" docker compose pull postgres redis minio; then
    echo "Не удалось скачать один из базовых образов. Проверяю локальные Docker-образы..."
    for image in $IMAGES; do
      if ! docker image inspect --platform "$PLATFORM" "$image" >/dev/null 2>&1; then
        echo "Локально не найден образ $image для платформы $PLATFORM." >&2
        echo "Повторите сборку при стабильном интернете или заранее скачайте этот образ." >&2
        exit 1
      fi
    done
    echo "Все нужные образы есть локально, продолжаю сборку флешки."
  fi

  echo "Проверяю, что Docker-образы доступны для платформы $PLATFORM..."
  for image in $IMAGES; do
    if ! docker image inspect --platform "$PLATFORM" "$image" >/dev/null 2>&1; then
      echo "Локально не найден образ $image для платформы $PLATFORM." >&2
      echo "Повторите сборку при стабильном интернете или заранее скачайте этот образ." >&2
      exit 1
    fi
  done

  echo "Сохраняю Docker-образы на флешку строго для платформы $PLATFORM..."
  docker save --platform "$PLATFORM" -o "$TMP_DIR/docker-images/temichevvet-images.tar" $IMAGES
  IMAGES_ARCHIVE_SHA256="$(sha256_file "$TMP_DIR/docker-images/temichevvet-images.tar")"
  printf '%s  %s\n' "$IMAGES_ARCHIVE_SHA256" "temichevvet-images.tar" > "$TMP_DIR/docker-images/temichevvet-images.tar.sha256"
  {
    echo "format=temichevvet-portable-release-v1"
    echo "created_at=$BUILD_DATE"
    echo "git_commit=$GIT_COMMIT"
    echo "platform=$PLATFORM"
    echo "images_archive_sha256=$IMAGES_ARCHIVE_SHA256"
    for image in $IMAGES; do
      image_id="$(docker image inspect --platform "$PLATFORM" --format '{{.Id}}' "$image")"
      repo_digests="$(docker image inspect --platform "$PLATFORM" --format '{{join .RepoDigests ","}}' "$image")"
      echo "image=$image|id=$image_id|repo_digests=$repo_digests"
    done
  } > "$TMP_DIR/RELEASE-MANIFEST.txt"
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
echo "  Создать комплект переноса TemichevVet - Windows.bat"
echo "  Восстановить TemichevVet на новом компьютере - Windows.bat"
echo "  Проверить резервную копию TemichevVet - Windows.bat"
echo "  Настроить отдельный диск резервных копий - Windows.bat"
echo "  Подключить рабочее место - Windows.bat"
echo "  Установить TemichevVet - Mac.command"
echo "  Обновить TemichevVet - Mac.command"
echo "  Установить TemichevVet - Linux.sh"
echo "  Обновить TemichevVet - Linux.sh"
echo
