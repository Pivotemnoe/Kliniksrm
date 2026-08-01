@echo off
chcp 65001 >nul
setlocal

fltmc >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0portable\repair-clinic-lan-windows.ps1\"' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable\repair-clinic-lan-windows.ps1"

exit /b %errorlevel%
