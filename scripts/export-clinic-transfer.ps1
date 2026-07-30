param(
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$requiredContainers = @("clinic-crm-postgres", "clinic-crm-redis", "clinic-crm-minio")

function Get-EnvValue($Key, $Fallback) {
  if (!(Test-Path $EnvFile)) { return $Fallback }
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
  if (!$line) { return $Fallback }
  $value = $line.Substring($Key.Length + 1)
  if ([string]::IsNullOrWhiteSpace($value)) { return $Fallback }
  return $value
}

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker не найден. Комплект переноса создаётся только на серверном компьютере клиники."
}
if (!(Test-Path $Destination -PathType Container)) {
  throw "Папка назначения не найдена: $Destination"
}
$Destination = (Resolve-Path $Destination).Path
if ($Destination -eq $RootDir.Path) {
  throw "Для комплекта переноса выберите отдельный диск или отдельную папку, а не папку CRM."
}

Write-Host "Цель действия: создать полную копию текущего серверного компьютера TemichevVet."
Write-Host "Куда записывается: $Destination"
Write-Host "Контейнеры и Docker volumes не удаляются. Клинические данные не изменяются."

foreach ($container in $requiredContainers) {
  docker container inspect $container *> $null
  if ($LASTEXITCODE -ne 0) { throw "Не найден контейнер $container. Запустите эту кнопку на серверном компьютере клиники." }
}

$dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
$dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleName = "TemichevVet-transfer-$timestamp"
$staging = Join-Path $Destination ".$bundleName"
$archive = Join-Path $Destination "$bundleName.tar.gz"
$checksumFile = "$archive.sha256"

if (Test-Path $staging) { throw "Временная папка уже существует: $staging" }
New-Item -ItemType Directory -Path $staging | Out-Null

try {
  Write-Host "Создаю копию PostgreSQL..."
  docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName --format=custom --no-owner --no-privileges -f /tmp/temichevvet-transfer.dump
  if ($LASTEXITCODE -ne 0) { throw "Не удалось создать копию PostgreSQL." }
  docker exec clinic-crm-postgres pg_restore --list /tmp/temichevvet-transfer.dump *> $null
  if ($LASTEXITCODE -ne 0) { throw "Созданная копия PostgreSQL не прошла проверку структуры." }
  docker cp "clinic-crm-postgres:/tmp/temichevvet-transfer.dump" (Join-Path $staging "postgres.dump")
  docker exec clinic-crm-postgres rm -f /tmp/temichevvet-transfer.dump *> $null

  Write-Host "Сохраняю очередь задач..."
  docker exec clinic-crm-redis redis-cli SAVE *> $null
  if ($LASTEXITCODE -ne 0) { throw "Не удалось сохранить Redis." }
  docker cp "clinic-crm-redis:/data/dump.rdb" (Join-Path $staging "redis-dump.rdb")

  Write-Host "Копирую документы и фотографии..."
  docker cp "clinic-crm-minio:/data" (Join-Path $staging "minio-data")
  if ($LASTEXITCODE -ne 0) { throw "Не удалось скопировать документы MinIO." }
  $minioFiles = @(Get-ChildItem (Join-Path $staging "minio-data") -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/]\.minio\.sys[\\/]' })
  $minioFileCount = $minioFiles.Count
  $minioMeasure = $minioFiles | Measure-Object -Property Length -Sum
  $minioBytes = if ($null -eq $minioMeasure.Sum) { [long]0 } else { [long]$minioMeasure.Sum }

  if (Test-Path $EnvFile) {
    Copy-Item $EnvFile (Join-Path $staging "source-clinic.env")
  }

  $countsQuery = 'SELECT json_build_object(''owners'',(SELECT count(*) FROM "Owner"),''animals'',(SELECT count(*) FROM "Animal"),''visits'',(SELECT count(*) FROM "Visit"),''vaccinations'',(SELECT count(*) FROM "Vaccination"),''appointments'',(SELECT count(*) FROM "Appointment"),''queueEntries'',(SELECT count(*) FROM "QueueEntry"),''bills'',(SELECT count(*) FROM "Bill"),''payments'',(SELECT count(*) FROM "Payment"),''sales'',(SELECT count(*) FROM "Sale"),''products'',(SELECT count(*) FROM "Product"),''stockBatches'',(SELECT count(*) FROM "StockBatch"),''stockMovements'',(SELECT count(*) FROM "StockMovement"),''files'',(SELECT count(*) FROM "FileObject"),''notifications'',(SELECT count(*) FROM "NotificationOutbox"),''employees'',(SELECT count(*) FROM "Employee"),''tasks'',(SELECT count(*) FROM "Task"),''visitDocuments'',(SELECT count(*) FROM "VisitDocument"),''suppliers'',(SELECT count(*) FROM "Supplier"),''supplyInvoices'',(SELECT count(*) FROM "SupplyInvoice"),''payrollPeriods'',(SELECT count(*) FROM "PayrollPeriod"),''businessEntries'',(SELECT count(*) FROM "BusinessEntry"),''supportRequests'',(SELECT count(*) FROM "SupportRequest"));'
  # PowerShell 5 removes embedded double quotes from a native-command argument
  # on Windows. Send SQL over stdin so Prisma's mixed-case table names remain
  # quoted exactly as written ("Owner", "Animal", and so on).
  $countsJson = ($countsQuery | docker exec -i clinic-crm-postgres psql -U $dbUser -d $dbName -At | Select-Object -Last 1)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($countsJson)) { throw "Не удалось получить контрольные количества записей." }

  $images = @{}
  $imageDetails = @{}
  foreach ($container in @("clinic-crm-api", "clinic-crm-web", "clinic-crm-postgres", "clinic-crm-redis", "clinic-crm-minio")) {
    docker container inspect $container *> $null
    if ($LASTEXITCODE -eq 0) {
      $images[$container] = (docker inspect --format '{{.Config.Image}}' $container | Select-Object -Last 1)
      $details = @(docker image inspect $images[$container] | ConvertFrom-Json)[0]
      $revision = if ($details.Config -and $details.Config.Labels) { $details.Config.Labels.'org.opencontainers.image.revision' } else { $null }
      $imageDetails[$container] = [ordered]@{ reference = $images[$container]; id = $details.Id; repoDigests = @($details.RepoDigests); revision = $revision }
    }
  }

  $manifest = [ordered]@{
    format = "temichevvet-computer-transfer-v2"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceComputer = $env:COMPUTERNAME
    releaseVersion = (Get-EnvValue "CRM_SOURCE_VERSION" "local")
    releaseRevision = $imageDetails["clinic-crm-api"].revision
    database = $dbName
    counts = ($countsJson | ConvertFrom-Json)
    minioUserFiles = $minioFileCount
    minioUserBytes = $minioBytes
    images = $images
    imageDetails = $imageDetails
    files = @("postgres.dump", "redis-dump.rdb", "minio-data", "source-clinic.env")
    warning = "Содержит конфиденциальные данные клиники. Хранить на защищённом диске."
  }
  [IO.File]::WriteAllText((Join-Path $staging "manifest.json"), ($manifest | ConvertTo-Json -Depth 8), $Utf8NoBom)

  $hashes = Get-ChildItem $staging -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($staging.Length + 1).Replace('\', '/')
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $relative"
  }
  [IO.File]::WriteAllLines((Join-Path $staging "SHA256SUMS"), $hashes, $Utf8NoBom)

  Write-Host "Упаковываю комплект. Это может занять время из-за фотографий..."
  & tar.exe -czf $archive -C $staging .
  if ($LASTEXITCODE -ne 0 -or !(Test-Path $archive)) { throw "Не удалось упаковать комплект переноса." }
  $archiveHash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($checksumFile, "$archiveHash  $([IO.Path]::GetFileName($archive))`r`n", $Utf8NoBom)

  Write-Host ""
  Write-Host "Комплект переноса готов:"
  Write-Host "  $archive"
  Write-Host "  $checksumFile"
  Write-Host "Старый сервер не выключайте и не очищайте до полной проверки нового компьютера."
} finally {
  if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
