#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/portable/install-mac.sh" --update "$@"

echo
read -r -p "TemichevVet обновлён. Нажмите Enter, чтобы закрыть это окно..." _
