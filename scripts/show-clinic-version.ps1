param()

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$VersionFile = Join-Path $RootDir "VERSION.txt"

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

function Write-Section($Title) {
  Write-Host ""
  Write-Host "=== $Title ==="
}

function Get-LabelValue($Labels, $Key) {
  if ($null -eq $Labels) {
    return $null
  }

  $property = $Labels.PSObject.Properties[$Key]
  if ($property) {
    return $property.Value
  }

  return $null
}

function Show-ContainerVersion($ContainerName) {
  $containerJson = docker container inspect $ContainerName 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($containerJson)) {
    Write-Host "$ContainerName: не найден"
    return
  }

  $container = ($containerJson | ConvertFrom-Json)[0]
  $imageRef = $container.Config.Image
  $imageId = $container.Image
  $imageJson = docker image inspect $imageId 2>$null
  $image = $null
  if ($LASTEXITCODE -eq 0 -and ![string]::IsNullOrWhiteSpace($imageJson)) {
    $image = ($imageJson | ConvertFrom-Json)[0]
  }

  $revision = Get-LabelValue $image.Config.Labels "org.opencontainers.image.revision"
  $created = Get-LabelValue $image.Config.Labels "org.opencontainers.image.created"
  $source = Get-LabelValue $image.Config.Labels "org.opencontainers.image.source"
  if ([string]::IsNullOrWhiteSpace($created)) {
    $created = $image.Created
  }

  Write-Host "$ContainerName"
  Write-Host "  status:  $($container.State.Status)"
  Write-Host "  image:   $imageRef"
  Write-Host "  imageId: $($imageId.Substring(0, [Math]::Min(19, $imageId.Length)))"
  Write-Host "  created: $created"
  if (![string]::IsNullOrWhiteSpace($revision)) {
    Write-Host "  commit:  $revision"
  }
  if (![string]::IsNullOrWhiteSpace($source)) {
    Write-Host "  source:  $source"
  }
}

Write-Host "TemichevVet CRM - проверка установленной версии"
Write-Host "Папка установки: $RootDir"

Write-Section "Комплект установки"
if (Test-Path $VersionFile) {
  Get-Content $VersionFile | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "VERSION.txt не найден. Установка могла быть сделана старой флешкой."
}

Write-Section ".env"
Write-Host "TEMICHEVVET_API_IMAGE=$(Get-EnvValue "TEMICHEVVET_API_IMAGE" "")"
Write-Host "TEMICHEVVET_WEB_IMAGE=$(Get-EnvValue "TEMICHEVVET_WEB_IMAGE" "")"
Write-Host "TEMICHEVVET_REMOTE_API_IMAGE=$(Get-EnvValue "TEMICHEVVET_REMOTE_API_IMAGE" "")"
Write-Host "TEMICHEVVET_REMOTE_WEB_IMAGE=$(Get-EnvValue "TEMICHEVVET_REMOTE_WEB_IMAGE" "")"
Write-Host "TEMICHEVVET_AUTO_PULL_IMAGES=$(Get-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "")"

Write-Section "Docker"
docker version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker не запущен или недоступен."
} else {
  Show-ContainerVersion "clinic-crm-web"
  Show-ContainerVersion "clinic-crm-api"
  Show-ContainerVersion "clinic-crm-postgres"
  Show-ContainerVersion "clinic-crm-backup"
}

Write-Section "API meta"
try {
  $meta = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/v1/meta" -TimeoutSec 5
  Write-Host "name:      $($meta.name)"
  Write-Host "version:   $($meta.version)"
  Write-Host "commit:    $($meta.revision)"
  Write-Host "buildDate: $($meta.buildDate)"
  Write-Host "source:    $($meta.imageSource)"
} catch {
  Write-Host "CRM API через http://127.0.0.1:3000/api/v1/meta пока недоступен."
}

Write-Host ""
