@echo off
chcp 65001 >nul
setlocal
echo Создание полного комплекта переноса TemichevVet.
echo Укажите папку на отдельном диске, например E:\TemichevVet-Transfer
set /p "DESTINATION=Папка назначения: "
if "%DESTINATION%"=="" exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRM\scripts\export-clinic-transfer.ps1" -Destination "%DESTINATION%"
pause
