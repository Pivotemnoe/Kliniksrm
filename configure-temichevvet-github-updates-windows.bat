@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-github-updates.ps1" %*

echo.
pause
