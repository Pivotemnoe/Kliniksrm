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
    find "$target" \( -name '._*' -o -name '.DS_Store' \) -type f -exec rm -f {} +
  fi
}

TARGET="$DESTINATION/TemichevVet-Portable"
BACKUP="$DESTINATION/TemichevVet-Portable.old-$(date +%Y%m%d-%H%M%S)"

if [[ -e "$TARGET" ]]; then
  echo "Сохраняю предыдущую папку как:"
  echo "  $BACKUP"
  mv "$TARGET" "$BACKUP"
  cleanup_macos_metadata "$BACKUP"
fi

echo "Копирую готовый TemichevVet-Portable на флешку..."
if rsync --help 2>/dev/null | grep -q -- '--info='; then
  rsync -a --info=progress2 "${RSYNC_MACOS_EXCLUDES[@]}" "$READY_DIR/" "$TARGET/"
else
  rsync -a --progress "${RSYNC_MACOS_EXCLUDES[@]}" "$READY_DIR/" "$TARGET/"
fi
cleanup_macos_metadata "$TARGET"
find "$DESTINATION" -maxdepth 1 -name '._TemichevVet-Portable*' -type f -exec rm -f {} +

echo
echo "Готово. На флешке записан комплект:"
echo "  $TARGET"
echo
du -sh "$TARGET"
