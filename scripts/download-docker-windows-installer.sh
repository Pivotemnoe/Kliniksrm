#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER_DIR="$ROOT_DIR/installers"
INSTALLER_FILE="$INSTALLER_DIR/Docker Desktop Installer.exe"
INSTALLER_URL="https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"

mkdir -p "$INSTALLER_DIR"

echo "Скачиваю Docker Desktop для Windows..."
echo "$INSTALLER_URL"
echo

curl -L --fail --progress-bar "$INSTALLER_URL" -o "$INSTALLER_FILE"

echo
echo "Готово:"
echo "$INSTALLER_FILE"
