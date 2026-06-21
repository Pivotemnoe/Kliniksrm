#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/portable/install-mac.sh" "$@"

echo
read -r -p "TemichevVet готов. Нажмите Enter, чтобы закрыть это окно..." _

