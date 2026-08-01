@echo off
chcp 65001 >nul
setlocal
set "INSTALLED_SCRIPT=%USERPROFILE%\TemichevVet\scripts\restore-clinic-transfer.ps1"
set "PORTABLE_SCRIPT=%~dp0CRM\scripts\restore-clinic-transfer.ps1"
set "INSTALLED_START_SCRIPT=%USERPROFILE%\TemichevVet\scripts\start-clinic-server.ps1"
set "PORTABLE_START_SCRIPT=%~dp0CRM\scripts\start-clinic-server.ps1"

echo Восстановление TemichevVet разрешено только на НОВОМ серверном компьютере.
if not exist "%PORTABLE_SCRIPT%" (
  echo.
  echo На флешке не найден актуальный скрипт восстановления:
  echo %PORTABLE_SCRIPT%
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)
if not exist "%PORTABLE_START_SCRIPT%" (
  echo.
  echo На флешке не найден актуальный скрипт запуска:
  echo %PORTABLE_START_SCRIPT%
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)
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

copy /Y "%PORTABLE_SCRIPT%" "%INSTALLED_SCRIPT%" >nul
if errorlevel 1 (
  echo.
  echo Не удалось обновить скрипт восстановления в установленной CRM.
  echo Запустите этот файл от имени администратора.
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)
copy /Y "%PORTABLE_START_SCRIPT%" "%INSTALLED_START_SCRIPT%" >nul
if errorlevel 1 (
  echo.
  echo Не удалось обновить скрипт запуска в установленной CRM.
  echo Запустите этот файл от имени администратора.
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)
echo Используется актуальный скрипт восстановления с флешки.

set /p "ARCHIVE=Полный путь к архиву TemichevVet-transfer-....tar.gz: "
set /p "CONFIRM=Введите RESTORE_TO_NEW_COMPUTER: "
if "%ARCHIVE%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLED_SCRIPT%" -Archive "%ARCHIVE%" -Confirmation "%CONFIRM%"
pause
