@echo off
chcp 65001 >nul
setlocal
set "INSTALLED_SCRIPT=%USERPROFILE%\TemichevVet\scripts\export-clinic-transfer.ps1"

echo Создание полного комплекта переноса TemichevVet.
echo Источник данных: установленная CRM на этом серверном компьютере.
if not exist "%INSTALLED_SCRIPT%" (
  echo.
  echo Не найден скрипт установленной CRM:
  echo %INSTALLED_SCRIPT%
  echo Сначала запустите с флешки "Обновить TemichevVet - Windows.bat",
  echo затем снова запустите эту кнопку.
  echo Никакие данные и Docker volumes не изменены.
  pause
  exit /b 1
)

echo Укажите папку на отдельном диске, например E:\TemichevVet-Transfer
set /p "DESTINATION=Папка назначения: "
if "%DESTINATION%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLED_SCRIPT%" -Destination "%DESTINATION%"
pause
