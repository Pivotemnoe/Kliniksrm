@echo off
chcp 65001 >nul
setlocal
echo Проверка копии в одноразовой временной базе. Рабочие данные не изменяются.
set /p "ARCHIVE=Полный путь к архиву резервной копии: "
if "%ARCHIVE%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRM\scripts\verify-backup.ps1" -Archive "%ARCHIVE%"
pause
