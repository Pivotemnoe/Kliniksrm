param(
  [switch]$NoBackup,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$RuntimeEnvFile = Join-Path $RootDir ".env.runtime"
$EnvExample = Join-Path $RootDir ".env.example"
$StarterScript = Join-Path $RootDir "scripts\start-clinic-server.ps1"
$UpdateLogDir = Join-Path $RootDir "logs"
$UpdateLogFile = Join-Path $UpdateLogDir "update-history.jsonl"
$UpdateTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Import-RuntimeEnvOverrides {
  if (!(Test-Path $RuntimeEnvFile -PathType Leaf)) { return }
  foreach ($rawLine in Get-Content $RuntimeEnvFile) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) { continue }
    $key = $line.Substring(0, $separator).Trim()
    if ($key -notmatch '^[A-Z][A-Z0-9_]*$') { continue }
    [Environment]::SetEnvironmentVariable($key, $line.Substring($separator + 1), "Process")
  }
}

function Set-RuntimeEnvValue($Key, $Value) {
  $content = if (Test-Path $RuntimeEnvFile) { Get-Content $RuntimeEnvFile -Raw } else { "" }
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
  [IO.File]::WriteAllText($RuntimeEnvFile, $content, $Utf8NoBom)
  [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
}

function Remove-RuntimeEnvValue($Key) {
  if (!(Test-Path $RuntimeEnvFile -PathType Leaf)) { return }
  $remaining = @(Get-Content $RuntimeEnvFile | Where-Object { $_ -notmatch "^$([Regex]::Escape($Key))=" })
  if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $RuntimeEnvFile -Force
    return
  }
  [IO.File]::WriteAllLines($RuntimeEnvFile, [string[]]$remaining, $Utf8NoBom)
}

function Get-EnvValue($Key, $Fallback) {
  $processValue = [Environment]::GetEnvironmentVariable($Key, "Process")
  if (![string]::IsNullOrWhiteSpace($processValue)) { return $processValue }

  if (!(Test-Path $EnvFile)) {
    return $Fallback
  }

  $match = Get-Content $EnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if (!$match) {
    return $Fallback
  }

  $value = $match.Substring($Key.Length + 1)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Fallback
  }

  return $value
}

function Set-EnvValue($Key, $Value) {
  if (!(Test-Path $EnvFile)) {
    if (!(Test-Path $EnvExample)) {
      throw "Env example was not found: $EnvExample"
    }

    Copy-Item $EnvExample $EnvFile
  }

  $content = Get-Content $EnvFile -Raw
  $line = "$Key=$Value"

  $existing = Get-Content $EnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if ($existing -eq $line) {
    [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
    Remove-RuntimeEnvValue $Key
    return
  }

  try {
    $envItem = Get-Item -LiteralPath $EnvFile -Force
    if ($envItem.IsReadOnly) { $envItem.IsReadOnly = $false }
    if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
      $content = [Regex]::Replace(
        $content,
        "(?m)^$([Regex]::Escape($Key))=.*$",
        [Text.RegularExpressions.MatchEvaluator]{ param($match) $line }
      )
      [IO.File]::WriteAllText($EnvFile, $content, $Utf8NoBom)
    } else {
      [IO.File]::AppendAllText($EnvFile, [Environment]::NewLine + $line, $Utf8NoBom)
    }
    [Environment]::SetEnvironmentVariable($Key, [string]$Value, "Process")
    Remove-RuntimeEnvValue $Key
  } catch [System.UnauthorizedAccessException] {
    Set-RuntimeEnvValue $Key $Value
    Write-Host "Файл .env защищён Windows. Параметр $Key безопасно сохранён в .env.runtime; существующий .env не изменён."
  }
}

function Assert-FreeSpace {
  $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($RootDir.Path).Substring(0, 1))
  $minimum = 10GB
  if ($drive.Free -lt $minimum) {
    throw "На диске программы свободно меньше 10 ГБ. Обновление остановлено до освобождения места."
  }
  Write-Host "Свободное место: $([Math]::Round($drive.Free / 1GB, 1)) ГБ."
}

function Get-BackupDirectory {
  $configured = Get-EnvValue "BACKUP_DIR_HOST" "./backups"
  if ([IO.Path]::IsPathRooted($configured)) { return $configured }
  return Join-Path $RootDir.Path ($configured -replace '^\.[/\\]', '')
}

function Get-CurrentContainerImage($Container) {
  docker container inspect $Container *> $null
  if ($LASTEXITCODE -ne 0) { return $null }
  return (docker inspect --format '{{.Image}}' $Container | Select-Object -Last 1)
}

function Assert-WindowsImageArchitecture($Image, $Label) {
  $architecture = (docker image inspect --format '{{.Architecture}}' $Image | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить архитектуру образа $Label." }
  if ($architecture -ne "amd64") {
    throw "Образ $Label имеет архитектуру $architecture, а сервер Windows требует linux/amd64. Обновление остановлено."
  }
}

function Show-PendingMigrations($ApiImage) {
  $imageMigrations = @(docker run --rm --entrypoint sh $ApiImage -c "ls -1 /app/prisma/migrations 2>/dev/null" | Where-Object { $_ -match '^\d' })
  if ($LASTEXITCODE -ne 0) { throw "Не удалось прочитать список миграций из нового API-образа." }
  $dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
  $failedMigrations = @(docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить журнал миграций существующей базы." }
  if ($failedMigrations.Count -gt 0) {
    throw "В базе есть незавершённая миграция ($($failedMigrations -join ', ')). Автоматическое обновление остановлено для ручной проверки."
  }
  $applied = @(docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Не удалось прочитать список применённых миграций." }
  $pending = @($imageMigrations | Where-Object { $applied -notcontains $_ })
  if ($pending.Count -eq 0) {
    Write-Host "Новых миграций базы нет."
  } else {
    Write-Host "Штатные миграции, которые будут применены при запуске:"
    foreach ($migration in $pending) {
      Write-Host "  $migration"
      $sql = docker run --rm --entrypoint sh $ApiImage -c "cat /app/prisma/migrations/$migration/migration.sql 2>/dev/null"
      if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить migration.sql для $migration." }
      if (($sql -join [Environment]::NewLine) -match '(?is)\b(?:DROP\s+(?:TABLE|COLUMN|TYPE)|TRUNCATE\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE\b.*?ALTER\s+COLUMN\b.*?TYPE\b)') {
        throw "Миграция $migration содержит потенциально разрушительную операцию. Автоматическое обновление остановлено для ручной проверки."
      }
    }
    Write-Host "Проверка миграций пройдена: потенциально разрушительных операций не найдено."
  }
}

function Write-UpdateLog($State, $PreviousApi, $PreviousWeb, $NextApi, $NextWeb, $ErrorMessage) {
  New-Item -ItemType Directory -Force -Path $UpdateLogDir | Out-Null
  $entry = [ordered]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    state = $State
    previousApi = Get-ImageDescriptor $PreviousApi
    previousWeb = Get-ImageDescriptor $PreviousWeb
    nextApi = Get-ImageDescriptor $NextApi
    nextWeb = Get-ImageDescriptor $NextWeb
    error = $ErrorMessage
  } | ConvertTo-Json -Compress
  [IO.File]::AppendAllText($UpdateLogFile, $entry + [Environment]::NewLine, $Utf8NoBom)
}

function Get-ImageDescriptor($Image) {
  if ([string]::IsNullOrWhiteSpace($Image)) { return $null }
  $raw = docker image inspect $Image 2>$null
  if ($LASTEXITCODE -ne 0 -or !$raw) { return [ordered]@{ reference = $Image; available = $false } }
  $item = @($raw | ConvertFrom-Json)[0]
  $revision = $null
  if ($item.Config -and $item.Config.Labels) { $revision = $item.Config.Labels.'org.opencontainers.image.revision' }
  return [ordered]@{ reference = $Image; available = $true; id = $item.Id; revision = $revision }
}

function Backup-CurrentDatabase {
  if ($NoBackup) {
    Write-Host "Database backup skipped by option."
    return
  }

  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Контейнер PostgreSQL не найден. Без проверяемой копии базы обновление остановлено; для осознанного обхода существует только параметр -NoBackup."
  }

  $dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
  $backupDir = Get-BackupDirectory
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "pre-internet-update-$timestamp.dump"

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  Write-Host "Creating database backup before internet update..."
  Write-Host "  $backupFile"
  docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName --format=custom --no-owner --no-privileges -f /tmp/pre-internet-update.dump
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create database backup. Update stopped so clinic data is not put at risk."
  }
  docker exec clinic-crm-postgres pg_restore --list /tmp/pre-internet-update.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw "Созданная копия базы не прошла проверку структуры. Обновление остановлено." }
  docker cp "clinic-crm-postgres:/tmp/pre-internet-update.dump" $backupFile
  docker exec clinic-crm-postgres rm -f /tmp/pre-internet-update.dump *> $null
  if ($LASTEXITCODE -ne 0 -or !(Test-Path $backupFile)) { throw "Копия базы не перенесена на диск. Обновление остановлено." }
  $hash = (Get-FileHash $backupFile -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$backupFile.sha256", "$hash  $([IO.Path]::GetFileName($backupFile))`r`n", $Utf8NoBom)
  if (Test-Path $EnvFile) { Copy-Item $EnvFile (Join-Path $backupDir "pre-internet-update-$timestamp.env") }
  if (Test-Path $RuntimeEnvFile) { Copy-Item $RuntimeEnvFile (Join-Path $backupDir "pre-internet-update-$timestamp.env.runtime") }
}

function Invoke-DockerPullWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Image,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [int]$Attempts = 3
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    Write-Host "Скачиваю Docker-образ $Label ($attempt/$Attempts)..."
    Write-Host "  $Image"
    docker pull $Image
    if ($LASTEXITCODE -eq 0) {
      return $true
    }

    if ($attempt -lt $Attempts) {
      Write-Host "Скачивание не удалось. Жду перед повторной попыткой..."
      Start-Sleep -Seconds (5 * $attempt)
    }
  }

  return $false
}

function Show-DockerPullHelp($Label) {
  Write-Host ""
  Write-Host "Не удалось скачать образ $Label через интернет."
  Write-Host "Если в ошибке написано TLS handshake timeout, проверьте доступ к ghcr.io и pkg-containers.githubusercontent.com, потом запустите обновление ещё раз."
  Write-Host "Если в ошибке написано denied или unauthorized, выполните: docker login ghcr.io"
  Write-Host "Backup базы клиники уже создан перед этой попыткой обновления."
}

if (!(Test-Path $StarterScript)) {
  throw "CRM starter was not found: $StarterScript"
}

if (!(Test-Command "docker")) {
  throw "Docker was not found. Install Docker Desktop and try again."
}

Write-Host "Цель действия: обновить только приложение TemichevVet на этом серверном компьютере Windows."
Write-Host "Точная папка приложения: $($RootDir.Path)"
Write-Host "База данных, документы и Docker volumes не удаляются."
Import-RuntimeEnvOverrides
Assert-FreeSpace

$remoteApi = Get-EnvValue "TEMICHEVVET_REMOTE_API_IMAGE" ""
$remoteWeb = Get-EnvValue "TEMICHEVVET_REMOTE_WEB_IMAGE" ""

if ([string]::IsNullOrWhiteSpace($remoteApi) -or [string]::IsNullOrWhiteSpace($remoteWeb)) {
  Write-Host "Internet updates are not configured."
  Write-Host "Run the GitHub updates setup button first."
  Write-Host "Expected default images:"
  Write-Host "  ghcr.io/pivotemnoe/kliniksrm-api:stable"
  Write-Host "  ghcr.io/pivotemnoe/kliniksrm-web:stable"
  exit 1
}

Backup-CurrentDatabase

$previousApiId = Get-CurrentContainerImage "clinic-crm-api"
$previousWebId = Get-CurrentContainerImage "clinic-crm-web"
$rollbackApi = "temichevvet-api:rollback-$UpdateTimestamp"
$rollbackWeb = "temichevvet-web:rollback-$UpdateTimestamp"
if ($previousApiId) { docker tag $previousApiId $rollbackApi }
if ($previousWebId) { docker tag $previousWebId $rollbackWeb }

Write-Host "Скачиваю обновлённые Docker-образы..."
try {
  if (!(Invoke-DockerPullWithRetry -Image $remoteApi -Label "API")) {
    Show-DockerPullHelp "API"
    throw "Не удалось скачать Docker-образ API."
  }

  if (!(Invoke-DockerPullWithRetry -Image $remoteWeb -Label "web")) {
    Show-DockerPullHelp "web"
    throw "Не удалось скачать Docker-образ web."
  }

  Assert-WindowsImageArchitecture $remoteApi "API"
  Assert-WindowsImageArchitecture $remoteWeb "web"
  Show-PendingMigrations $remoteApi
} catch {
  Write-UpdateLog "preflight_failed" $previousApiId $previousWebId $remoteApi $remoteWeb $_.Exception.Message
  throw
}

Set-EnvValue "TEMICHEVVET_API_IMAGE" $remoteApi
Set-EnvValue "TEMICHEVVET_WEB_IMAGE" $remoteWeb
Set-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "true"

$arguments = @("-AppOnly", "-NoImageUpdate")
if (!$NoOpen) {
  $arguments += "-Open"
}

Write-Host "Starting updated TemichevVet..."
try {
  & $StarterScript @arguments
  if ($LASTEXITCODE -ne 0) { throw "Запуск новой версии завершился ошибкой." }
  Write-UpdateLog "success" $previousApiId $previousWebId $remoteApi $remoteWeb $null
  Write-Host "Обновление завершено. Версия записана в журнал: $UpdateLogFile"
} catch {
  $startError = $_.Exception.Message
  Write-Host "Новая версия не запустилась. Возвращаю только предыдущие образы приложения."
  if ($previousApiId -and $previousWebId) {
    Set-EnvValue "TEMICHEVVET_API_IMAGE" $rollbackApi
    Set-EnvValue "TEMICHEVVET_WEB_IMAGE" $rollbackWeb
    try {
      & $StarterScript -AppOnly -NoImageUpdate
    } catch {
      Write-Host "Автоматический возврат приложения тоже не запустился. Резервная копия и журнал сохранены."
    }
  }
  Write-UpdateLog "rolled_back_app" $previousApiId $previousWebId $remoteApi $remoteWeb $startError
  throw "Обновление отменено: $startError. База данных автоматически назад не откатывалась."
}
