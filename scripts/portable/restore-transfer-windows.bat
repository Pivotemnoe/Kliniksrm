@echo off
chcp 65001 >nul
setlocal
echo Восстановление TemichevVet разрешено только на НОВОМ серверном компьютере.
set /p "ARCHIVE=Полный путь к архиву TemichevVet-transfer-....tar.gz: "
set /p "CONFIRM=Введите RESTORE_TO_NEW_COMPUTER: "
if "%ARCHIVE%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRM\scripts\restore-clinic-transfer.ps1" -Archive "%ARCHIVE%" -Confirmation "%CONFIRM%"
pause
