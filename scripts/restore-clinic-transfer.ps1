param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [Parameter(Mandatory = $true)]
  [string]$Confirmation
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$ApplicationSettingKeys = @(
  "CLIENT_PORTAL_ONLINE_REQUESTS_ENABLED",
  "CLIENT_PORTAL_CODE_TTL_MINUTES",
  "CLIENT_PORTAL_CODE_MAX_ATTEMPTS",
  "CLIENT_PORTAL_PHONE_TOKEN_DAYS",
  "CLIENT_PORTAL_PUBLIC_URL",
  "OWNER_GATEWAY_URL",
  "OWNER_GATEWAY_SYNC_SECRET",
  "OWNER_GATEWAY_REQUEST_TIMEOUT_MS",
  "NOTIFICATION_DISPATCH_INTERVAL_MS",
  "MAX_BOT_NAME",
  "MAX_BOT_TOKEN",
  "MAX_API_BASE_URL",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_API_BASE_URL",
  "SESSION_COOKIE_NAME",
  "SESSION_SECRET",
  "SESSION_COOKIE_SECURE",
  "SESSION_TTL_HOURS",
  "SESSION_IDLE_TIMEOUT_MINUTES"
)

function Get-EnvValue($Key, $Fallback) {
  if (!(Test-Path $EnvFile)) { return $Fallback }
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if (!$line) { return $Fallback }
  $value = $line.Substring($Key.Length + 1)
  if ([string]::IsNullOrWhiteSpace($value)) { return $Fallback }
  return $value
}

function Get-BackupDirectory {
  $configured = Get-EnvValue "BACKUP_DIR_HOST" "./backups"
  if ([IO.Path]::IsPathRooted($configured)) { return $configured }
  return Join-Path $RootDir.Path ($configured -replace '^\.[/\\]', '')
}

function Set-EnvValue($Key, $Value) {
  if (!(Test-Path $EnvFile)) { throw "Файл настроек нового компьютера не найден: $EnvFile" }
  $content = Get-Content $EnvFile -Raw
  $line = "$Key=$Value"
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
}

function Import-SourceApplicationSettings($SourceEnv) {
  if (!(Test-Path $SourceEnv -PathType Leaf)) { return 0 }
  $imported = 0
  foreach ($rawLine in Get-Content $SourceEnv) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) { continue }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1)
    if (($ApplicationSettingKeys -contains $key) -and ![string]::IsNullOrWhiteSpace($value)) {
      Set-EnvValue $key $value
      $imported++
    }
  }
  return $imported
}

if ($Confirmation -cne "RESTORE_TO_NEW_COMPUTER") {
  throw "Восстановление не начато. Требуется точное подтверждение RESTORE_TO_NEW_COMPUTER."
}
if (!(Test-Path $Archive -PathType Leaf)) { throw "Архив не найден: $Archive" }
$Archive = (Resolve-Path $Archive).Path
$checksumFile = "$Archive.sha256"
if (!(Test-Path $checksumFile)) { throw "Рядом с архивом нет файла контрольной суммы: $checksumFile" }
$expectedHash = ((Get-Content $checksumFile -First 1) -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) { throw "Контрольная сумма архива не совпала. Восстановление остановлено." }

Write-Host "Цель действия: восстановить TemichevVet на НОВОМ серверном компьютере."
Write-Host "Архив: $Archive"
Write-Host "Точная папка целевой установки: $($RootDir.Path)"
Write-Host "Docker volumes не удаляются. Существующая непустая клиническая база будет отклонена."

foreach ($container in @("clinic-crm-postgres", "clinic-crm-redis", "clinic-crm-minio")) {
  docker container inspect $container *> $null
  if ($LASTEXITCODE -ne 0) { throw "Не найден контейнер $container. Сначала установите и один раз запустите TemichevVet на новом компьютере." }
}

$dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
$dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
$BusinessCountFields = @(
  "owners", "animals", "visits", "vaccinations", "appointments", "queueEntries",
  "bills", "payments", "sales", "products", "stockBatches", "stockMovements", "files", "notifications"
)
$countsQuery = 'SELECT json_build_object(''owners'',(SELECT count(*) FROM "Owner"),''animals'',(SELECT count(*) FROM "Animal"),''visits'',(SELECT count(*) FROM "Visit"),''vaccinations'',(SELECT count(*) FROM "Vaccination"),''appointments'',(SELECT count(*) FROM "Appointment"),''queueEntries'',(SELECT count(*) FROM "QueueEntry"),''bills'',(SELECT count(*) FROM "Bill"),''payments'',(SELECT count(*) FROM "Payment"),''sales'',(SELECT count(*) FROM "Sale"),''products'',(SELECT count(*) FROM "Product"),''stockBatches'',(SELECT count(*) FROM "StockBatch"),''stockMovements'',(SELECT count(*) FROM "StockMovement"),''files'',(SELECT count(*) FROM "FileObject"),''notifications'',(SELECT count(*) FROM "NotificationOutbox"));'
$targetCountsJson = (docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c $countsQuery | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($targetCountsJson)) { throw "Не удалось проверить целевую базу." }
$targetCountsBefore = $targetCountsJson | ConvertFrom-Json
$nonEmptyTargetFields = @($BusinessCountFields | Where-Object { [long]$targetCountsBefore.$_ -gt 0 })
if ($nonEmptyTargetFields.Count -gt 0) {
  throw "На целевом компьютере уже есть рабочие данные ($($nonEmptyTargetFields -join ', ')). Восстановление разрешено только в новую пустую базу."
}

$temp = Join-Path ([IO.Path]::GetTempPath()) "TemichevVet-restore-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  & tar.exe -xzf $Archive -C $temp
  if ($LASTEXITCODE -ne 0) { throw "Не удалось распаковать архив." }
  foreach ($required in @("postgres.dump", "manifest.json", "SHA256SUMS")) {
    if (!(Test-Path (Join-Path $temp $required))) { throw "В архиве отсутствует $required." }
  }
  $manifest = Get-Content (Join-Path $temp "manifest.json") -Raw | ConvertFrom-Json
  if ($manifest.format -ne "temichevvet-computer-transfer-v2") {
    throw "Формат комплекта переноса не поддерживается: $($manifest.format)"
  }
  foreach ($line in Get-Content (Join-Path $temp "SHA256SUMS")) {
    $parts = $line -split '\s+', 2
    if ($parts.Count -ne 2) { continue }
    $file = Join-Path $temp $parts[1].Trim().Replace('/', '\')
    if (!(Test-Path $file -PathType Leaf) -or (Get-FileHash $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $parts[0].ToLowerInvariant()) {
      throw "Повреждён файл комплекта: $($parts[1])"
    }
  }

  docker cp (Join-Path $temp "postgres.dump") "clinic-crm-postgres:/tmp/temichevvet-transfer.dump"
  if ($LASTEXITCODE -ne 0) { throw "Копия PostgreSQL не передана для предварительной проверки." }
  docker exec clinic-crm-postgres pg_restore --list /tmp/temichevvet-transfer.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL dump повреждён или имеет неподдерживаемый формат." }

  if (Test-Path (Join-Path $temp "minio-data")) {
    $targetObjects = (docker exec clinic-crm-minio sh -c 'find /data -mindepth 1 -maxdepth 1 ! -name .minio.sys | head -n 1' | Select-Object -First 1)
    if (![string]::IsNullOrWhiteSpace($targetObjects)) { throw "Хранилище файлов на новом компьютере не пустое. Автоматическая очистка запрещена." }
  }

  $preflightTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $targetBackupDir = Get-BackupDirectory
  $targetEnvSnapshot = Join-Path $targetBackupDir "target-before-transfer-$preflightTimestamp.env"
  $targetDatabaseSnapshot = Join-Path $targetBackupDir "target-before-transfer-$preflightTimestamp.dump"
  New-Item -ItemType Directory -Force -Path $targetBackupDir | Out-Null
  if (Test-Path $EnvFile) { Copy-Item $EnvFile $targetEnvSnapshot -Force }
  if (Test-Path (Join-Path $temp "source-clinic.env")) {
    Copy-Item (Join-Path $temp "source-clinic.env") (Join-Path $targetBackupDir "source-clinic-settings-for-review-$preflightTimestamp.env") -Force
  }
  docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName --format=custom --no-owner --no-privileges -f /tmp/target-before-transfer.dump
  if ($LASTEXITCODE -ne 0) { throw "Не удалось создать страховочную копию новой целевой базы." }
  docker cp "clinic-crm-postgres:/tmp/target-before-transfer.dump" $targetDatabaseSnapshot
  docker exec clinic-crm-postgres rm -f /tmp/target-before-transfer.dump *> $null
  if (!(Test-Path $targetDatabaseSnapshot)) { throw "Страховочная копия новой целевой базы не записана на диск." }
  $targetSnapshotHash = (Get-FileHash $targetDatabaseSnapshot -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$targetDatabaseSnapshot.sha256", "$targetSnapshotHash  $([IO.Path]::GetFileName($targetDatabaseSnapshot))`r`n", $Utf8NoBom)

  Write-Host "Останавливаю API, web, службу backup и MinIO только на новом целевом компьютере, чтобы восстановление было согласованным..."
  docker compose stop api web backup minio *> $null

  docker exec clinic-crm-postgres pg_restore -U $dbUser -d $dbName --clean --if-exists --no-owner --no-privileges /tmp/temichevvet-transfer.dump
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL не восстановлен." }
  docker exec clinic-crm-postgres rm -f /tmp/temichevvet-transfer.dump *> $null

  if (Test-Path (Join-Path $temp "minio-data")) {
    docker cp "$(Join-Path $temp 'minio-data')\." "clinic-crm-minio:/data/"
    if ($LASTEXITCODE -ne 0) { throw "Документы MinIO не восстановлены." }
  }

  $settingsImported = Import-SourceApplicationSettings (Join-Path $temp "source-clinic.env")
  Write-Host "Перенесены настройки личного кабинета и каналов связи: $settingsImported параметров (значения скрыты)."
  Write-Host "Сетевые порты, адрес компьютера, Docker-образы, реквизиты PostgreSQL/MinIO и путь резервных копий сохранены от нового компьютера."
  Write-Host "Redis не восстанавливается: в текущей версии он не хранит клинические записи; сохранённый dump остаётся в архиве для проверки."

  Write-Host "Запускаю приложение на восстановленной базе и применяю только штатные миграции..."
  & (Join-Path $PSScriptRoot "start-clinic-server.ps1") -NoImageUpdate -ForceRecreate
  if ($LASTEXITCODE -ne 0) { throw "Приложение не запустилось после восстановления." }

  $actualCounts = (docker exec clinic-crm-postgres psql -U $dbUser -d $dbName -At -c $countsQuery | Select-Object -Last 1) | ConvertFrom-Json
  $countMismatches = @()
  foreach ($field in $BusinessCountFields) {
    if ([long]$manifest.counts.$field -ne [long]$actualCounts.$field) { $countMismatches += $field }
  }
  $targetMinioFiles = [long]((docker exec clinic-crm-minio sh -c 'find /data -type f ! -path "/data/.minio.sys/*" | wc -l' | Select-Object -Last 1).Trim())
  if ($LASTEXITCODE -ne 0) { throw "Не удалось проверить количество восстановленных документов MinIO." }
  $minioCountMatches = [long]$manifest.minioUserFiles -eq $targetMinioFiles
  $report = [ordered]@{
    restoredAt = (Get-Date).ToUniversalTime().ToString('o')
    source = $manifest.counts
    target = $actualCounts
    countMismatches = $countMismatches
    sourceMinioUserFiles = [long]$manifest.minioUserFiles
    targetMinioUserFiles = $targetMinioFiles
    minioCountMatches = $minioCountMatches
    settingsImported = $settingsImported
    redisRestored = $false
    archive = $Archive
    targetDatabaseSnapshot = $targetDatabaseSnapshot
    targetEnvSnapshot = $targetEnvSnapshot
  }
  $reportPath = Join-Path $RootDir "transfer-restore-report.json"
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 6), $Utf8NoBom)
  if ($countMismatches.Count -gt 0 -or !$minioCountMatches) {
    throw "Контрольные количества не совпали. Отчёт: $reportPath. Старый сервер остаётся основной копией."
  }
  Write-Host "Восстановление завершено. Контрольные количества совпали."
  Write-Host "Отчёт: $reportPath"
  Write-Host "Откройте несколько реальных карточек. Старый сервер пока не очищайте."
} finally {
  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -eq 0) { docker exec clinic-crm-postgres rm -f /tmp/temichevvet-transfer.dump *> $null }
  if (Test-Path $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
