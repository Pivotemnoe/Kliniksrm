@echo off
chcp 65001 >nul
setlocal

if exist "%USERPROFILE%\TemichevVet\scripts\show-clinic-version.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\TemichevVet\scripts\show-clinic-version.ps1" %*
) else (
  if exist "%~dp0CRM\scripts\show-clinic-version.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CRM\scripts\show-clinic-version.ps1" %*
  ) else (
    echo TemichevVet version checker was not found.
  )
)

echo.
pause
