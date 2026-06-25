#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${1:-$HOME/Desktop/TemichevVet CRM.app}"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
EXECUTABLE="$MACOS_DIR/TemichevVetLauncher"
TERMINAL_COMMAND="cd $(printf '%q' "$ROOT_DIR") && scripts/start-clinic-server.sh --update-images --open; echo; read -r -p \"TemichevVet обновлён и запущен. Нажмите Enter, чтобы закрыть это окно...\" _"
APPLESCRIPT_COMMAND="${TERMINAL_COMMAND//\\/\\\\}"
APPLESCRIPT_COMMAND="${APPLESCRIPT_COMMAND//\"/\\\"}"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>ru</string>
  <key>CFBundleDisplayName</key>
  <string>TemichevVet CRM</string>
  <key>CFBundleExecutable</key>
  <string>TemichevVetLauncher</string>
  <key>CFBundleIconFile</key>
  <string>TemichevVet</string>
  <key>CFBundleIdentifier</key>
  <string>ru.temichevvet.crm.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>TemichevVet CRM</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1</string>
  <key>CFBundleVersion</key>
  <string>2</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.13</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

cat > "$EXECUTABLE" <<LAUNCHER
#!/usr/bin/env bash
set -euo pipefail

osascript \\
  -e 'tell application "Terminal"' \\
  -e 'activate' \\
  -e 'do script "$APPLESCRIPT_COMMAND"' \\
  -e 'end tell'
LAUNCHER

chmod +x "$EXECUTABLE"

if [[ ! -f "$RESOURCES_DIR/TemichevVet.icns" ]]; then
  echo "Иконка TemichevVet.icns не найдена в $RESOURCES_DIR."
  echo "Если ярлык уже был создан раньше, macOS может продолжить показывать старую иконку из кэша."
fi

echo "Mac-ярлык обновлён:"
echo "  $APP_DIR"
echo "Команда запуска:"
echo "  scripts/start-clinic-server.sh --update-images --open"
