@echo off
chcp 65001 >nul
setlocal
set "INSTALLED_SCRIPT=%USERPROFILE%\TemichevVet\scripts\restore-clinic-transfer.ps1"

echo Восстановление TemichevVet разрешено только на НОВОМ серверном компьютере.
if not exist "%INSTALLED_SCRIPT%" (
  echo.
  echo Не найден скрипт установленной CRM:
  echo %INSTALLED_SCRIPT%
  echo Сначала запустите с флешки "Установить TemichevVet - Windows.bat"
  echo и дождитесь первого успешного запуска пустой CRM.
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)

set /p "ARCHIVE=Полный путь к архиву TemichevVet-transfer-....tar.gz: "
set /p "CONFIRM=Введите RESTORE_TO_NEW_COMPUTER: "
if "%ARCHIVE%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLED_SCRIPT%" -Archive "%ARCHIVE%" -Confirmation "%CONFIRM%"
pause
