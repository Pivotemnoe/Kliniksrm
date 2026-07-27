param(
  [switch]$NoStart,
  [switch]$SkipCopy,
  [switch]$Update,
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$Utf8Bom = New-Object System.Text.UTF8Encoding -ArgumentList $true

$PortableRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SourceDir = Join-Path $PortableRoot "CRM"
$InstallDir = Join-Path $Env:USERPROFILE "TemichevVet"
$ImagesTar = Join-Path $PortableRoot "docker-images\temichevvet-images.tar"
$ImagesChecksum = "$ImagesTar.sha256"
$InstalledEnvFile = Join-Path $InstallDir ".env"
$InstalledRuntimeEnvFile = Join-Path $InstallDir ".env.runtime"
$PortableVersionFile = Join-Path $PortableRoot "VERSION.txt"
$PortableConnectivityFile = Join-Path $PortableRoot "portable\clinic-connectivity.env"
$UpdateTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$PreviousApiId = $null
$PreviousWebId = $null
$RollbackApi = "temichevvet-api:rollback-$UpdateTimestamp"
$RollbackWeb = "temichevvet-web:rollback-$UpdateTimestamp"
$PortableConnectivityKeys = @(
  "OWNER_GATEWAY_URL",
  "OWNER_GATEWAY_SYNC_SECRET",
  "OWNER_GATEWAY_REQUEST_TIMEOUT_MS",
  "NOTIFICATION_DISPATCH_INTERVAL_MS",
  "CLIENT_PORTAL_PUBLIC_URL",
  "MAX_BOT_NAME",
  "MAX_BOT_TOKEN",
  "MAX_API_BASE_URL",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_API_BASE_URL",
  "TEMICHEVVET_LICENSE_MODE",
  "TEMICHEVVET_LICENSE_PUBLIC_KEY_B64",
  "TEMICHEVVET_SUPPORT_URL",
  "TEMICHEVVET_SUPPORT_EMAIL"
)

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

function Assert-FreeSpace {
  $driveName = [IO.Path]::GetPathRoot($InstallDir).Substring(0, 1)
  $drive = Get-PSDrive -Name $driveName
  if ($drive.Free -lt 10GB) {
    throw "На диске установки свободно меньше 10 ГБ. Установка или обновление остановлено."
  }
  Write-Host "Свободное место: $([Math]::Round($drive.Free / 1GB, 1)) ГБ."
}

function Save-CurrentApplicationImages {
  docker container inspect clinic-crm-api *> $null
  if ($LASTEXITCODE -eq 0) {
    $script:PreviousApiId = (docker inspect --format '{{.Image}}' clinic-crm-api | Select-Object -Last 1)
    docker tag $script:PreviousApiId $RollbackApi
  }
  docker container inspect clinic-crm-web *> $null
  if ($LASTEXITCODE -eq 0) {
    $script:PreviousWebId = (docker inspect --format '{{.Image}}' clinic-crm-web | Select-Object -Last 1)
    docker tag $script:PreviousWebId $RollbackWeb
  }
}

function Assert-WindowsImageArchitecture($Image) {
  $architecture = (docker image inspect --format '{{.Architecture}}' $Image | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or $architecture -ne "amd64") {
    throw "Образ $Image не подходит серверу Windows: требуется linux/amd64, найдено $architecture."
  }
}

function Show-PendingInstalledMigrations {
  $migrationsDir = Join-Path $InstallDir "prisma\migrations"
  if (!(Test-Path $migrationsDir -PathType Container)) {
    throw "В комплекте не найден каталог миграций: $migrationsDir"
  }
  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Это первая установка: база будет создана штатными миграциями из комплекта."
    return
  }
  $dbUser = Get-ExistingEnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-ExistingEnvValue "POSTGRES_DB" "clinic_crm"
  $available = @(Get-ChildItem $migrationsDir -Directory | Where-Object { $_.Name -match '^\d' } | Sort-Object Name)
  $failedMigrations = @(docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить журнал миграций существующей базы." }
  if ($failedMigrations.Count -gt 0) {
    throw "В базе есть незавершённая миграция ($($failedMigrations -join ', ')). Автоматическое обновление остановлено для ручной проверки."
  }
  $applied = @(docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Не удалось прочитать журнал миграций существующей базы." }
  $pending = @($available | Where-Object { $applied -notcontains $_.Name })
  if ($pending.Count -eq 0) {
    Write-Host "Новых миграций базы нет."
    return
  }
  Write-Host "Штатные миграции, которые будут применены при запуске:"
  foreach ($migration in $pending) {
    Write-Host "  $($migration.Name)"
    $sqlFile = Join-Path $migration.FullName "migration.sql"
    if (!(Test-Path $sqlFile -PathType Leaf)) { throw "В миграции $($migration.Name) отсутствует migration.sql." }
    $sql = Get-Content $sqlFile -Raw
    if ($sql -match '(?is)\b(?:DROP\s+(?:TABLE|COLUMN|TYPE)|TRUNCATE\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE\b.*?ALTER\s+COLUMN\b.*?TYPE\b)') {
      throw "Миграция $($migration.Name) содержит потенциально разрушительную операцию. Автоматическое обновление остановлено для ручной проверки."
    }
  }
  Write-Host "Проверка миграций пройдена: потенциально разрушительных операций не найдено."
}

function Write-InstalledUpdateLog($State, $ErrorMessage) {
  $logDir = Join-Path $InstallDir "logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $entry = [ordered]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    state = $State
    previousApi = $PreviousApiId
    previousWeb = $PreviousWebId
    configuredApi = Get-DockerImageDescriptor (Get-ExistingEnvValue "TEMICHEVVET_API_IMAGE" "")
    configuredWeb = Get-DockerImageDescriptor (Get-ExistingEnvValue "TEMICHEVVET_WEB_IMAGE" "")
    portableVersion = $(if (Test-Path $PortableVersionFile) { (Get-Content $PortableVersionFile -Raw).Trim() } else { $null })
    error = $ErrorMessage
  } | ConvertTo-Json -Compress
  [IO.File]::AppendAllText((Join-Path $logDir "update-history.jsonl"), $entry + [Environment]::NewLine, $Utf8NoBom)
}

function Get-DockerImageDescriptor($Image) {
  if ([string]::IsNullOrWhiteSpace($Image)) { return $null }
  $raw = docker image inspect $Image 2>$null
  if ($LASTEXITCODE -ne 0 -or !$raw) { return [ordered]@{ reference = $Image; available = $false } }
  $item = @($raw | ConvertFrom-Json)[0]
  $revision = $null
  if ($item.Config -and $item.Config.Labels) { $revision = $item.Config.Labels.'org.opencontainers.image.revision' }
  return [ordered]@{ reference = $Image; available = $true; id = $item.Id; revision = $revision }
}

function Assert-DockerImage($Image) {
  if (!(Test-DockerImage $Image)) {
    throw "Docker image was not loaded: $Image. Recreate the flash drive with --include-images or check that docker-images\temichevvet-images.tar is not corrupted."
  }
}

function Assert-ImagesArchiveChecksum {
  if (!(Test-Path $ImagesChecksum -PathType Leaf)) {
    throw "Рядом с архивом Docker-образов нет файла SHA-256: $ImagesChecksum"
  }
  $expected = ((Get-Content $ImagesChecksum -First 1) -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash $ImagesTar -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) {
    throw "SHA-256 архива Docker-образов не совпал. Обновление остановлено до загрузки образов."
  }
  Write-Host "SHA-256 архива Docker-образов проверен."
}

function Get-ExistingEnvValue($Key, $Fallback) {
  $processValue = [Environment]::GetEnvironmentVariable($Key, "Process")
  if (![string]::IsNullOrWhiteSpace($processValue)) {
    return $processValue
  }

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

function Import-InstalledRuntimeEnvOverrides {
  if (!(Test-Path $InstalledRuntimeEnvFile -PathType Leaf)) { return }
  foreach ($rawLine in Get-Content $InstalledRuntimeEnvFile) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) { continue }
    $key = $line.Substring(0, $separator).Trim()
    if ($key -notmatch '^[A-Z][A-Z0-9_]*$') { continue }
    [Environment]::SetEnvironmentVariable($key, $line.Substring($separator + 1), "Process")
  }
}

function Set-InstalledRuntimeEnvValue($Key, $Value) {
  $content = if (Test-Path $InstalledRuntimeEnvFile) { Get-Content $InstalledRuntimeEnvFile -Raw } else { "" }
  $line = "$Key=$Value"
  if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
    $content = [Regex]::Replace(
      $content,
      "(?m)^$([Regex]::Escape($Key))=.*$",
      [Text.RegularExpressions.MatchEvaluator]{ param($match) $line }
    )
  } else {
    if (![string]::IsNullOrEmpty($content) -and !$content.EndsWith([Environment]::NewLine)) {
      $content += [Environment]::NewLine
    }
    $content += $line + [Environment]::NewLine
  }
  [IO.File]::WriteAllText($InstalledRuntimeEnvFile, $content, $Utf8NoBom)
  [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
}

function Remove-InstalledRuntimeEnvValue($Key) {
  if (!(Test-Path $InstalledRuntimeEnvFile -PathType Leaf)) { return }
  $remaining = @(Get-Content $InstalledRuntimeEnvFile | Where-Object { $_ -notmatch "^$([Regex]::Escape($Key))=" })
  if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $InstalledRuntimeEnvFile -Force
    return
  }
  [IO.File]::WriteAllLines($InstalledRuntimeEnvFile, [string[]]$remaining, $Utf8NoBom)
}

function Set-InstalledEnvValue($Key, $Value) {
  if (!(Test-Path $InstalledEnvFile)) {
    return
  }

  $content = Get-Content $InstalledEnvFile -Raw
  $line = "$Key=$Value"

  $existing = Get-Content $InstalledEnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if ($existing -eq $line) {
    [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
    Remove-InstalledRuntimeEnvValue $Key
    return
  }

  try {
    $envItem = Get-Item -LiteralPath $InstalledEnvFile -Force
    if ($envItem.IsReadOnly) { $envItem.IsReadOnly = $false }
    if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
      $content = [Regex]::Replace(
        $content,
        "(?m)^$([Regex]::Escape($Key))=.*$",
        [Text.RegularExpressions.MatchEvaluator]{ param($match) $line }
      )
      [IO.File]::WriteAllText($InstalledEnvFile, $content, $Utf8NoBom)
    } else {
      [IO.File]::AppendAllText($InstalledEnvFile, [Environment]::NewLine + $line, $Utf8NoBom)
    }
    [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
    Remove-InstalledRuntimeEnvValue $Key
  } catch [System.UnauthorizedAccessException] {
    Set-InstalledRuntimeEnvValue $Key $Value
    Write-Host "Файл .env защищён Windows. Параметр $Key безопасно сохранён в .env.runtime; существующий .env не изменён."
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

function New-InstalledRandomSecret {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    if ($rng -is [System.IDisposable]) {
      $rng.Dispose()
    }
  }

  return [Convert]::ToBase64String($bytes)
}

function New-InstalledRandomPassword {
  $bytes = New-Object byte[] 12
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    if ($rng -is [System.IDisposable]) {
      $rng.Dispose()
    }
  }

  return "Tv!$(([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant())"
}

function Get-InstalledBackupDirectory {
  $configured = Get-ExistingEnvValue "BACKUP_DIR_HOST" "./backups"
  if ([IO.Path]::IsPathRooted($configured)) { return $configured }
  return Join-Path $InstallDir ($configured -replace '^\.[/\\]', '')
}

function Initialize-InstalledEnvFile {
  if (Test-Path $InstalledEnvFile) {
    return
  }

  $envExample = Join-Path $InstallDir ".env.example"
  if (!(Test-Path $envExample)) {
    throw "Environment template was not found: $envExample"
  }

  Copy-Item -Force -Path $envExample -Destination $InstalledEnvFile
}

function Import-PortableConnectivity {
  if (!(Test-Path $PortableConnectivityFile)) {
    Write-Host "Настройки связи личного кабинета на флешке не найдены."
    return
  }

  Initialize-InstalledEnvFile
  $imported = 0

  foreach ($rawLine in Get-Content $PortableConnectivityFile) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
      continue
    }

    $separator = $line.IndexOf("=")
    if ($separator -le 0) {
      continue
    }

    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1)
    if (($PortableConnectivityKeys -notcontains $key) -or [string]::IsNullOrWhiteSpace($value)) {
      continue
    }

    Set-InstalledEnvValue $key $value
    $imported++
  }

  Write-Host "Настройки связи личного кабинета обновлены: $imported параметров (значения скрыты)."
}

function Set-InstalledSourceVersion {
  if (!(Test-Path $PortableVersionFile)) {
    return
  }

  $match = Get-Content $PortableVersionFile | Where-Object { $_ -match "^git_commit=" } | Select-Object -Last 1
  if (!$match) {
    return
  }

  $commit = $match.Substring("git_commit=".Length).Trim()
  if (![string]::IsNullOrWhiteSpace($commit)) {
    Set-InstalledEnvValue "CRM_SOURCE_VERSION" $commit
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
    throw "Существующая установка найдена, но контейнер PostgreSQL недоступен. Без проверяемой копии базы обновление остановлено; для осознанного обхода существует только параметр -NoBackup."
  }

  $dbUser = Get-ExistingEnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-ExistingEnvValue "POSTGRES_DB" "clinic_crm"
  $backupDir = Get-InstalledBackupDirectory
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "pre-update-$timestamp.dump"

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  Write-Host "Creating database backup before update..."
  Write-Host "  $backupFile"
  docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName --format=custom --no-owner --no-privileges -f /tmp/pre-update.dump
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create database backup. Update stopped so clinic data is not put at risk."
  }
  docker exec clinic-crm-postgres pg_restore --list /tmp/pre-update.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw "Созданная копия базы не прошла проверку структуры. Обновление остановлено." }
  docker cp "clinic-crm-postgres:/tmp/pre-update.dump" $backupFile
  docker exec clinic-crm-postgres rm -f /tmp/pre-update.dump *> $null
  if (!(Test-Path $backupFile)) { throw "Копия базы не записана на диск. Обновление остановлено." }
  $hash = (Get-FileHash $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$backupFile.sha256", "$hash  $([IO.Path]::GetFileName($backupFile))`r`n", $Utf8NoBom)
  if (Test-Path $InstalledEnvFile) { Copy-Item $InstalledEnvFile (Join-Path $backupDir "pre-update-$timestamp.env") }
  if (Test-Path $InstalledRuntimeEnvFile) { Copy-Item $InstalledRuntimeEnvFile (Join-Path $backupDir "pre-update-$timestamp.env.runtime") }
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

function Write-Utf8BatchFile($CommandPath, $Lines) {
  [IO.File]::WriteAllLines($CommandPath, [string[]]$Lines, $Utf8Bom)
}

function New-ExportTransferCommand($CommandPath) {
  Write-Utf8BatchFile $CommandPath @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "echo Создание проверяемого комплекта переноса TemichevVet.",
    "set /p TARGET=Введите полный путь к отдельному диску или папке: ",
    "if not defined TARGET exit /b 1",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%USERPROFILE%\TemichevVet\scripts\export-clinic-transfer.ps1"" -Destination ""%TARGET%""",
    "echo.",
    "pause"
  )
}

function New-ConfigureBackupCommand($CommandPath) {
  Write-Utf8BatchFile $CommandPath @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "echo Настройка отдельного диска резервных копий TemichevVet.",
    "set /p TARGET=Введите полный путь к папке на отдельном диске: ",
    "if not defined TARGET exit /b 1",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%USERPROFILE%\TemichevVet\scripts\configure-backup-storage.ps1"" -Destination ""%TARGET%""",
    "echo.",
    "pause"
  )
}

function New-VerifyBackupCommand($CommandPath) {
  Write-Utf8BatchFile $CommandPath @(
    "@echo off",
    "chcp 65001 >nul",
    "setlocal",
    "echo Изолированная проверка резервной копии TemichevVet.",
    "set /p ARCHIVE=Введите полный путь к архиву базы: ",
    "if not defined ARCHIVE exit /b 1",
    "powershell -NoProfile -ExecutionPolicy Bypass -File ""%USERPROFILE%\TemichevVet\scripts\verify-backup.ps1"" -Archive ""%ARCHIVE%""",
    "echo.",
    "pause"
  )
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
  $transferExporter = Join-Path $InstallDir "Создать комплект переноса TemichevVet.cmd"
  $backupConfigurator = Join-Path $InstallDir "Настроить отдельный диск резервных копий.cmd"
  $backupVerifier = Join-Path $InstallDir "Проверить резервную копию TemichevVet.cmd"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $startMenu = [Environment]::GetFolderPath("Programs")
  $startMenuDir = Join-Path $startMenu "TemichevVet"
  New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

  New-InternetUpdateCommand $internetUpdater
  New-GithubUpdatesCommand $githubConfigurator
  New-VersionCheckCommand $versionChecker
  New-ExportTransferCommand $transferExporter
  New-ConfigureBackupCommand $backupConfigurator
  New-VerifyBackupCommand $backupVerifier

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
  Copy-Item -Force -Path $transferExporter -Destination (Join-Path $desktop "Создать комплект переноса TemichevVet.cmd")
  Copy-Item -Force -Path $transferExporter -Destination (Join-Path $startMenuDir "Создать комплект переноса TemichevVet.cmd")
  Copy-Item -Force -Path $backupConfigurator -Destination (Join-Path $desktop "Настроить отдельный диск резервных копий.cmd")
  Copy-Item -Force -Path $backupConfigurator -Destination (Join-Path $startMenuDir "Настроить отдельный диск резервных копий.cmd")
  Copy-Item -Force -Path $backupVerifier -Destination (Join-Path $desktop "Проверить резервную копию TemichevVet.cmd")
  Copy-Item -Force -Path $backupVerifier -Destination (Join-Path $startMenuDir "Проверить резервную копию TemichevVet.cmd")
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

Write-Host "Цель действия: $(if ($Update -or (Test-Path $InstallDir)) { 'обновить приложение TemichevVet на этом серверном компьютере Windows' } else { 'установить TemichevVet на этот серверный компьютер Windows' })."
Write-Host "Точная папка приложения: $InstallDir"
Write-Host "Docker volumes и клинические данные не удаляются."

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

Assert-FreeSpace

$isExistingInstall = Test-Path $InstallDir
Import-InstalledRuntimeEnvOverrides
if ($Update -or $isExistingInstall) {
  Save-CurrentApplicationImages
  Backup-CurrentDatabase
}

if (!$SkipCopy) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

  if ($Update -or $isExistingInstall) {
    Write-Host "Updating TemichevVet in $InstallDir ..."
  } else {
    Write-Host "Copying TemichevVet to $InstallDir ..."
  }

  robocopy $SourceDir $InstallDir /E /XD ".git" "node_modules" "backups" "dist" ".cache" ".tmp" "coverage" /XF ".env" ".env.runtime" ".env.local" ".env.development" ".env.production" ".env.test" "*.tsbuildinfo" "*.log" /NFL /NDL /NJH /NJS /NP
  $code = $LASTEXITCODE

  if ($code -ge 8) {
    throw "CRM copy failed. Robocopy code: $code"
  }
}

Install-PortableAssets

if (Test-Path $PortableVersionFile) {
  Copy-Item -Force -Path $PortableVersionFile -Destination (Join-Path $InstallDir "VERSION.txt")
}

Initialize-InstalledEnvFile
if ((Get-ExistingEnvValue "SESSION_SECRET" "") -eq "change-me") {
  Set-InstalledEnvValue "SESSION_SECRET" (New-InstalledRandomSecret)
} else {
  Set-InstalledEnvDefault "SESSION_SECRET" (New-InstalledRandomSecret)
}
Set-InstalledEnvDefault "BOOTSTRAP_DIRECTOR_PASSWORD" (New-InstalledRandomPassword)
Import-PortableConnectivity
Set-InstalledSourceVersion

Set-InstalledEnvDefault "TEMICHEVVET_REMOTE_API_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-api:stable"
Set-InstalledEnvDefault "TEMICHEVVET_REMOTE_WEB_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-web:stable"
Set-InstalledEnvDefault "TEMICHEVVET_AUTO_PULL_IMAGES" "true"

$previousConfiguredApi = Get-ExistingEnvValue "TEMICHEVVET_API_IMAGE" ""
$previousConfiguredWeb = Get-ExistingEnvValue "TEMICHEVVET_WEB_IMAGE" ""

try {
  if (Test-Path $ImagesTar) {
    Assert-ImagesArchiveChecksum
    Write-Host "Загружаю Docker-образы с флешки..."
    Invoke-Native -Command "docker" -Arguments @("load", "--input", $ImagesTar)
    Assert-DockerImage "temichevvet-api:local"
    Assert-DockerImage "temichevvet-web:local"
    Assert-WindowsImageArchitecture "temichevvet-api:local"
    Assert-WindowsImageArchitecture "temichevvet-web:local"
  } else {
    Write-Host "Готовые Docker-образы на этой флешке не найдены."
    Write-Host "Первый запуск попробует скачать образы из GitHub Container Registry и может упасть на медленной или заблокированной сети."
    Write-Host "Для установки почти без интернета пересоздайте флешку с режимом --include-images."
  }

  Show-PendingInstalledMigrations

  if (Test-Path $ImagesTar) {
    Set-InstalledEnvValue "TEMICHEVVET_API_IMAGE" "temichevvet-api:local"
    Set-InstalledEnvValue "TEMICHEVVET_WEB_IMAGE" "temichevvet-web:local"
  } else {
    Set-InstalledEnvValue "TEMICHEVVET_API_IMAGE" (Get-ExistingEnvValue "TEMICHEVVET_REMOTE_API_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-api:stable")
    Set-InstalledEnvValue "TEMICHEVVET_WEB_IMAGE" (Get-ExistingEnvValue "TEMICHEVVET_REMOTE_WEB_IMAGE" "ghcr.io/pivotemnoe/kliniksrm-web:stable")
  }
} catch {
  if ($isExistingInstall) {
    if (![string]::IsNullOrWhiteSpace($previousConfiguredApi)) { Set-InstalledEnvValue "TEMICHEVVET_API_IMAGE" $previousConfiguredApi }
    if (![string]::IsNullOrWhiteSpace($previousConfiguredWeb)) { Set-InstalledEnvValue "TEMICHEVVET_WEB_IMAGE" $previousConfiguredWeb }
    if ((Test-Path $ImagesTar) -and $PreviousApiId -and $PreviousWebId) {
      docker tag $PreviousApiId "temichevvet-api:local" *> $null
      docker tag $PreviousWebId "temichevvet-web:local" *> $null
    }
  }
  Write-InstalledUpdateLog "preflight_failed" $_.Exception.Message
  throw
}

Install-LauncherShortcuts

if (!$NoStart) {
  $launcher = Join-Path $InstallDir "start-temichevvet-windows.bat"
  if (!(Test-Path $launcher)) {
    throw "CRM launcher was not found: $launcher"
  }

  Write-Host "Starting TemichevVet..."
  try {
    if (Test-Path $ImagesTar) {
      cmd /c "`"$launcher`" -ForceRecreate -NoImageUpdate"
    } else {
      cmd /c "`"$launcher`" -ForceRecreate -UpdateImages"
    }
    if ($LASTEXITCODE -ne 0) { throw "Новая версия не запустилась." }
    Write-InstalledUpdateLog "success" $null
  } catch {
    $startError = $_.Exception.Message
    if ($PreviousApiId -and $PreviousWebId) {
      Write-Host "Возвращаю только предыдущие образы приложения; база назад не откатывается."
      Set-InstalledEnvValue "TEMICHEVVET_API_IMAGE" $RollbackApi
      Set-InstalledEnvValue "TEMICHEVVET_WEB_IMAGE" $RollbackWeb
      cmd /c "`"$launcher`" -ForceRecreate -NoImageUpdate"
    }
    Write-InstalledUpdateLog "rolled_back_app" $startError
    throw "Обновление остановлено: $startError"
  }
}
