@echo off
chcp 65001 >nul
setlocal
echo Выберите папку на ОТДЕЛЬНОМ физическом диске, например D:\TemichevVet-Backups
set /p "DESTINATION=Папка резервных копий: "
if "%DESTINATION%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRM\scripts\configure-backup-storage.ps1" -Destination "%DESTINATION%"
pause
