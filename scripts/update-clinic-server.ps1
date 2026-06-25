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
$EnvExample = Join-Path $RootDir ".env.example"
$StarterScript = Join-Path $RootDir "scripts\start-clinic-server.ps1"

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-EnvValue($Key, $Fallback) {
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

  if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
    $content = [Regex]::Replace($content, "(?m)^$([Regex]::Escape($Key))=.*$", $line)
    Set-Content -Path $EnvFile -Value $content -NoNewline -Encoding UTF8
  } else {
    Add-Content -Path $EnvFile -Value $line -Encoding UTF8
  }
}

function Backup-CurrentDatabase {
  if ($NoBackup) {
    Write-Host "Database backup skipped by option."
    return
  }

  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Existing PostgreSQL container was not found. Skipping pre-update backup."
    return
  }

  $dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
  $backupDir = Join-Path $RootDir "backups"
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "pre-internet-update-$timestamp.sql"

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  Write-Host "Creating database backup before internet update..."
  Write-Host "  $backupFile"
  & docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName > $backupFile
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $backupFile
    throw "Could not create database backup. Update stopped so clinic data is not put at risk."
  }
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

Write-Host "Скачиваю обновлённые Docker-образы..."
if (!(Invoke-DockerPullWithRetry -Image $remoteApi -Label "API")) {
  Show-DockerPullHelp "API"
  exit 1
}

if (!(Invoke-DockerPullWithRetry -Image $remoteWeb -Label "web")) {
  Show-DockerPullHelp "web"
  exit 1
}

Set-EnvValue "TEMICHEVVET_API_IMAGE" $remoteApi
Set-EnvValue "TEMICHEVVET_WEB_IMAGE" $remoteWeb
Set-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "true"

$arguments = @("-ForceRecreate", "-NoImageUpdate")
if (!$NoOpen) {
  $arguments += "-Open"
}

Write-Host "Starting updated TemichevVet..."
& $StarterScript @arguments
