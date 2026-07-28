#!/usr/bin/env bash
set -euo pipefail

READY_DIR="${READY_DIR:-/private/tmp/TemichevVet-Portable}"
DESTINATION="${1:-}"

usage() {
  cat <<'USAGE'
Быстрая запись уже подготовленного TemichevVet-Portable на флешку.

Использование:
  scripts/write-ready-portable-to-flash.sh /Volumes/FLASH_NAME

Перед запуском должен существовать готовый комплект:
  /private/tmp/TemichevVet-Portable
USAGE
}

if [[ -z "$DESTINATION" ]]; then
  echo "Укажите путь к флешке." >&2
  usage >&2
  exit 1
fi

if [[ ! -d "$READY_DIR" ]]; then
  echo "Готовый комплект не найден: $READY_DIR" >&2
  echo "Сначала соберите его: scripts/create-portable-flash.sh --include-images --platform linux/amd64 /private/tmp" >&2
  exit 1
fi

if [[ ! -d "$DESTINATION" ]]; then
  echo "Флешка не найдена: $DESTINATION" >&2
  exit 1
fi

DESTINATION="$(cd "$DESTINATION" && pwd)"

if [[ "$DESTINATION" == "/" || "$DESTINATION" == "/private/tmp" || "$DESTINATION" == "$READY_DIR" ]]; then
  echo "Нельзя записывать комплект в этот путь: $DESTINATION" >&2
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
    if command -v xattr >/dev/null 2>&1; then
      xattr -cr "$target" 2>/dev/null || true
    fi
    find "$target" \( -name '._*' -o -name '.DS_Store' \) -type f -exec rm -f {} +
    while IFS= read -r -d '' directory; do
      rm -f "$directory"/._* "$directory"/.DS_Store 2>/dev/null || true
    done < <(find "$target" -type d -print0)
  fi
}

TARGET="$DESTINATION/TemichevVet-Portable"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$DESTINATION/TemichevVet-Portable.old-$TIMESTAMP"
TMP_TARGET="$DESTINATION/TemichevVet-Portable.tmp"
FAILED_TARGET="$DESTINATION/TemichevVet-Portable.failed-$TIMESTAMP"

if [[ -e "$TMP_TARGET" ]]; then
  echo "Сохраняю незавершённую предыдущую запись как:"
  echo "  $FAILED_TARGET"
  mv "$TMP_TARGET" "$FAILED_TARGET"
fi

echo "Копирую новый комплект во временную папку; действующий комплект пока не изменяется..."
cleanup_macos_metadata "$READY_DIR"
if rsync --help 2>/dev/null | grep -q -- '--info='; then
  rsync -rlt --info=progress2 "${RSYNC_MACOS_EXCLUDES[@]}" "$READY_DIR/" "$TMP_TARGET/"
else
  rsync -rlt --progress "${RSYNC_MACOS_EXCLUDES[@]}" "$READY_DIR/" "$TMP_TARGET/"
fi
cleanup_macos_metadata "$TMP_TARGET"

for required_file in \
  "VERSION.txt" \
  "docker-images/temichevvet-images.tar" \
  "docker-images/temichevvet-images.tar.sha256" \
  "portable/install-windows.ps1" \
  "portable/install-mac.sh" \
  "Обновить TemichevVet - Windows.bat" \
  "Обновить TemichevVet - Mac.command"; do
  if [[ ! -f "$TMP_TARGET/$required_file" ]]; then
    echo "Новый комплект неполный, отсутствует: $required_file" >&2
    echo "Предыдущий комплект на флешке оставлен без изменений." >&2
    exit 1
  fi
done

SOURCE_FILE_COUNT="$(find "$READY_DIR" -type f ! -name '._*' ! -name '.DS_Store' | wc -l | tr -d ' ')"
TARGET_FILE_COUNT="$(find "$TMP_TARGET" -type f ! -name '._*' ! -name '.DS_Store' | wc -l | tr -d ' ')"
if [[ "$SOURCE_FILE_COUNT" != "$TARGET_FILE_COUNT" ]]; then
  echo "Проверка копирования не пройдена: источник $SOURCE_FILE_COUNT файлов, копия $TARGET_FILE_COUNT." >&2
  echo "Предыдущий комплект на флешке оставлен без изменений." >&2
  exit 1
fi

(cd "$TMP_TARGET/docker-images" && shasum -a 256 -c temichevvet-images.tar.sha256)

if [[ -e "$TARGET" ]]; then
  echo "Новый комплект проверен. Сохраняю предыдущую папку как:"
  echo "  $BACKUP"
  mv "$TARGET" "$BACKUP"
  cleanup_macos_metadata "$BACKUP"
fi

mv "$TMP_TARGET" "$TARGET"
cleanup_macos_metadata "$TARGET"
find "$DESTINATION" -maxdepth 1 -name '._TemichevVet-Portable*' -type f -exec rm -f {} +
sync

echo
echo "Готово. На флешке записан комплект:"
echo "  $TARGET"
echo
du -sh "$TARGET"
