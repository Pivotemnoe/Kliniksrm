param(
  [switch]$NoStart,
  [switch]$SkipCopy,
  [switch]$Update,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$PortableRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceDir = Join-Path $PortableRoot "CRM"
$InstallDir = Join-Path $Env:USERPROFILE "TemichevVet"
$ImagesTar = Join-Path $PortableRoot "docker-images\temichevvet-images.tar"
$InstalledEnvFile = Join-Path $InstallDir ".env"
$PortableVersionFile = Join-Path $PortableRoot "VERSION.txt"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-Docker {
  for ($i = 1; $i -le 60; $i++) {
    docker version *> $null
    if ($LASTEXITCODE -eq 0) {
      return $true
    }

    Start-Sleep -Seconds 2
  }

  return $false
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
}

function Test-DockerImage($Image) {
  docker image inspect $Image *> $null
  return $LASTEXITCODE -eq 0
}

function Assert-DockerImage($Image) {
  if (!(Test-DockerImage $Image)) {
    throw "Docker image was not loaded: $Image. Recreate the flash drive with --include-images or check that docker-images\temichevvet-images.tar is not corrupted."
  }
}

function Get-ExistingEnvValue($Key, $Fallback) {
  if (!(Test-Path $InstalledEnvFile)) {
    return $Fallback
  }

  $match = Get-Content $InstalledEnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if (!$match) {
    return $Fallback
  }

  $value = $match.Substring($Key.Length + 1)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Fallback
  }

  return $value
}

function Set-InstalledEnvValue($Key, $Value) {
  if (!(Test-Path $InstalledEnvFile)) {
    return
  }

  $content = Get-Content $InstalledEnvFile -Raw
  $line = "$Key=$Value"

  if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
    $content = [Regex]::Replace($content, "(?m)^$([Regex]::Escape($Key))=.*$", $line)
    Set-Content -Path $InstalledEnvFile -Value $content -NoNewline -Encoding UTF8
  } else {
    Add-Content -Path $InstalledEnvFile -Value $line -Encoding UTF8
  }
}

function Set-InstalledEnvDefault($Key, $Value) {
  if (!(Test-Path $InstalledEnvFile)) {
    return
  }

  $current = Get-ExistingEnvValue $Key ""
  if ([string]::IsNullOrWhiteSpace($current)) {
    Set-InstalledEnvValue $Key $Value
  }
}

function Backup-CurrentDatabase {
  if ($NoBackup) {
    Write-Host "Pre-update database backup skipped by option."
    return
  }

  if (!(Test-Path $InstallDir)) {
    return
  }

  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Existing PostgreSQL container was not found. Data volumes will not be touched."
    return
  }

  $dbUser = Get-ExistingEnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-ExistingEnvValue "POSTGRES_DB" "clinic_crm"
  $backupDir = Join-Path $InstallDir "backups"
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "pre-update-$timestamp.sql"

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  Write-Host "Creating database backup before update..."
  Write-Host "  $backupFile"
  & docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName > $backupFile
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $backupFile
    throw "Could not create database backup. Update stopped so clinic data is not put at risk."
  }
}

function New-LauncherShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ShortcutPath,
    [Parameter(Mandatory = $true)]
    [string]$LauncherPath,
    [string]$Description = "Запустить локальную CRM TemichevVet"
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $LauncherPath
  $shortcut.WorkingDirectory = Split-Path $LauncherPath
  $shortcut.Description = $Description
  $icon = Join-Path (Split-Path $LauncherPath) "installers\temichevvet.ico"
  if (Test-Path $icon) {
    $shortcut.IconLocation = $icon
  } else {
    $shortcut.IconLocation = "$Env:SystemRoot\System32\shell32.dll,220"
  }
  $shortcut.Save()
}

function New-LauncherCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath
  )

  $content = @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "cd /d ""%USERPROFILE%\TemichevVet""",
    "call ""%USERPROFILE%\TemichevVet\start-temichevvet-windows.bat"" %*"
  )
  Set-Content -Path $CommandPath -Value $content -Encoding ASCII
}

function New-InternetUpdateCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath
  )

  $content = @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "cd /d ""%USERPROFILE%\TemichevVet""",
    "call ""%USERPROFILE%\TemichevVet\update-temichevvet-online-windows.bat"" %*"
  )
  Set-Content -Path $CommandPath -Value $content -Encoding ASCII
}

function New-GithubUpdatesCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath
  )

  $content = @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "cd /d ""%USERPROFILE%\TemichevVet""",
    "call ""%USERPROFILE%\TemichevVet\configure-temichevvet-github-updates-windows.bat"" %*"
  )
  Set-Content -Path $CommandPath -Value $content -Encoding ASCII
}

function New-VersionCheckCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandPath
  )

  $content = @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%USERPROFILE%\TemichevVet\scripts\show-clinic-version.ps1"" %*",
    "echo.",
    "pause"
  )
  Set-Content -Path $CommandPath -Value $content -Encoding ASCII
}

function Install-PortableAssets {
  $sourceIcon = Join-Path $PortableRoot "installers\temichevvet.ico"
  if (!(Test-Path $sourceIcon)) {
    return
  }

  $targetDir = Join-Path $InstallDir "installers"
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -Force -Path $sourceIcon -Destination (Join-Path $targetDir "temichevvet.ico")
}

function Install-LauncherShortcuts {
  $launcher = Join-Path $InstallDir "start-temichevvet-windows.bat"
  if (!(Test-Path $launcher)) {
    throw "CRM launcher was not found: $launcher"
  }

  $internetUpdater = Join-Path $InstallDir "Обновить TemichevVet через интернет.cmd"
  $githubConfigurator = Join-Path $InstallDir "Настроить обновления GitHub.cmd"
  $versionChecker = Join-Path $InstallDir "Проверить версию TemichevVet.cmd"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $startMenu = [Environment]::GetFolderPath("Programs")
  $startMenuDir = Join-Path $startMenu "TemichevVet"
  New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

  New-InternetUpdateCommand $internetUpdater
  New-GithubUpdatesCommand $githubConfigurator
  New-VersionCheckCommand $versionChecker

  try {
    New-LauncherShortcut (Join-Path $desktop "TemichevVet.lnk") $launcher
    New-LauncherShortcut (Join-Path $startMenuDir "TemichevVet.lnk") $launcher
    New-LauncherShortcut `
      (Join-Path $desktop "Обновить TemichevVet через интернет.lnk") `
      $internetUpdater `
      "Обновить TemichevVet из GitHub Container Registry"
    New-LauncherShortcut `
      (Join-Path $startMenuDir "Обновить TemichevVet через интернет.lnk") `
      $internetUpdater `
      "Обновить TemichevVet из GitHub Container Registry"
    New-LauncherShortcut `
      (Join-Path $desktop "Настроить обновления GitHub.lnk") `
      $githubConfigurator `
      "Настроить адреса Docker-образов TemichevVet"
    New-LauncherShortcut `
      (Join-Path $startMenuDir "Настроить обновления GitHub.lnk") `
      $githubConfigurator `
      "Настроить адреса Docker-образов TemichevVet"
    New-LauncherShortcut `
      (Join-Path $desktop "Проверить версию TemichevVet.lnk") `
      $versionChecker `
      "Показать установленную сборку TemichevVet"
    New-LauncherShortcut `
      (Join-Path $startMenuDir "Проверить версию TemichevVet.lnk") `
      $versionChecker `
      "Показать установленную сборку TemichevVet"
  } catch {
    Write-Host "Could not create Windows .lnk shortcut. Creating .cmd launcher instead."
  }

  New-LauncherCommand (Join-Path $desktop "TemichevVet.cmd")
  New-LauncherCommand (Join-Path $startMenuDir "TemichevVet.cmd")
  Copy-Item -Force -Path $internetUpdater -Destination (Join-Path $desktop "Обновить TemichevVet через интернет.cmd")
  Copy-Item -Force -Path $internetUpdater -Destination (Join-Path $startMenuDir "Обновить TemichevVet через интернет.cmd")
  Copy-Item -Force -Path $githubConfigurator -Destination (Join-Path $desktop "Настроить обновления GitHub.cmd")
  Copy-Item -Force -Path $githubConfigurator -Destination (Join-Path $startMenuDir "Настроить обновления GitHub.cmd")
  Copy-Item -Force -Path $versionChecker -Destination (Join-Path $desktop "Проверить версию TemichevVet.cmd")
  Copy-Item -Force -Path $versionChecker -Destination (Join-Path $startMenuDir "Проверить версию TemichevVet.cmd")
  Write-Host "Created launchers: Desktop and Start menu."
}

function Test-VirtualizationEnabled {
  try {
    $processors = Get-CimInstance Win32_Processor -ErrorAction Stop
    foreach ($processor in $processors) {
      if ($processor.VirtualizationFirmwareEnabled -eq $false) {
        return $false
      }
    }

    return $true
  } catch {
    return $true
  }
}

if (!(Test-Path $SourceDir)) {
  throw "CRM folder was not found on the portable drive: $SourceDir"
}

if (!(Test-VirtualizationEnabled)) {
  Write-Host "Hardware virtualization is disabled or unavailable."
  Write-Host "Docker Desktop cannot start without virtualization."
  Write-Host "Enable Intel Virtualization Technology / VT-x in BIOS, reboot Windows, then run this installer again."
  exit 1
}

if (!(Test-Command "docker")) {
  $installer = Join-Path $PortableRoot "installers\Docker Desktop Installer.exe"
  Write-Host "Docker Desktop was not found."

  if (Test-Path $installer) {
    Write-Host "Opening Docker Desktop installer."
    Start-Process $installer
    Write-Host "After installation and reboot, run this button again."
  } else {
    Write-Host "Install Docker Desktop manually, then run this button again."
  }

  exit 1
}

docker version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker is installed but is not running. Trying to open Docker Desktop..."
  $dockerDesktopPath = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktopPath) {
    Start-Process $dockerDesktopPath
  }

  if (!(Wait-Docker)) {
    Write-Host "Docker Desktop did not start automatically."
    Write-Host "Open Docker Desktop manually, wait until it is running, then repeat setup."
    exit 1
  }
}

$isExistingInstall = Test-Path $InstallDir
if ($Update -or $isExistingInstall) {
  Backup-CurrentDatabase
}

if (!$SkipCopy) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  if ($Update -or $isExistingInstall) {
    Write-Host "Updating TemichevVet in $InstallDir ..."
  } else {
    Write-Host "Copying TemichevVet to $InstallDir ..."
  }

  robocopy $SourceDir $InstallDir /E /XD ".git" "node_modules" "backups" "dist" ".cache" ".tmp" "coverage" /XF ".env" ".env.local" ".env.development" ".env.production" ".env.test" "*.tsbuildinfo" "*.log" /NFL /NDL /NJH /NJS /NP
  $code = $LASTEXITCODE

  if ($code -ge 8) {
    throw "CRM copy failed. Robocopy code: $code"
  }
}

Install-PortableAssets

if (Test-Path $PortableVersionFile) {
  Copy-Item -Force -Path $PortableVersionFile -Destination (Join-Path $InstallDir "VERSION.txt")
}

Set-InstalledEnvDefault "TEMICHEVVET_REMOTE_API_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-api:stable"
Set-InstalledEnvDefault "TEMICHEVVET_REMOTE_WEB_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-web:stable"
Set-InstalledEnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "true"

if (Test-Path $ImagesTar) {
  Write-Host "Загружаю Docker-образы с флешки..."
  Invoke-Native -Command "docker" -Arguments @("load", "--input", $ImagesTar)
  Assert-DockerImage "temichevvet-api:local"
  Assert-DockerImage "temichevvet-web:local"
} else {
  Write-Host "Готовые Docker-образы на этой флешке не найдены."
  Write-Host "Первый запуск попробует скачать образы из Docker Hub и может упасть на медленной или заблокированной сети."
  Write-Host "Для установки почти без интернета пересоздайте флешку с режимом --include-images."
}

Install-LauncherShortcuts

if (!$NoStart) {
  $launcher = Join-Path $InstallDir "start-temichevvet-windows.bat"
  if (!(Test-Path $launcher)) {
    throw "CRM launcher was not found: $launcher"
  }

  Write-Host "Starting TemichevVet..."
  cmd /c "`"$launcher`" -ForceRecreate -NoImageUpdate"
}
