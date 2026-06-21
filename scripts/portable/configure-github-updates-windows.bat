@echo off
chcp 65001 >nul
setlocal

if not exist "%USERPROFILE%\TemichevVet\scripts\configure-github-updates.ps1" (
  echo TemichevVet is not installed for this Windows user yet.
  echo First run "Установить TemichevVet - Windows.bat" or "Обновить TemichevVet - Windows.bat".
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\TemichevVet\scripts\configure-github-updates.ps1" %*

echo.
pause
