param(
  [switch]$NoBackup,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

Write-Host "Pulling updated Docker images..."
Write-Host "  $remoteApi"
docker pull $remoteApi
if ($LASTEXITCODE -ne 0) {
  throw "Could not pull API image. If the GitHub package is private, run: docker login ghcr.io"
}

Write-Host "  $remoteWeb"
docker pull $remoteWeb
if ($LASTEXITCODE -ne 0) {
  throw "Could not pull web image. If the GitHub package is private, run: docker login ghcr.io"
}

Set-EnvValue "TEMICHEVVET_API_IMAGE" $remoteApi
Set-EnvValue "TEMICHEVVET_WEB_IMAGE" $remoteWeb
Set-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "false"

$arguments = @("-ForceRecreate", "-NoImageUpdate")
if (!$NoOpen) {
  $arguments += "-Open"
}

Write-Host "Starting updated TemichevVet..."
& $StarterScript @arguments
