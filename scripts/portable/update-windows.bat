@echo off
chcp 65001 >nul
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable\install-windows.ps1" -Update %*

echo.
pause
