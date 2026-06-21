#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

scripts/start-clinic-server.sh --open

echo
read -r -p "TemichevVet запущен. Нажмите Enter, чтобы закрыть это окно..." _
