param(
  [string]$Owner = "Pivotemnoe",
  [string]$Repository = "Kliniksrm",
  [string]$ApiImage = "",
  [string]$WebImage = ""
)

$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"

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

function Normalize-ImagePart($Value) {
  return $Value.Trim().ToLowerInvariant()
}

if ([string]::IsNullOrWhiteSpace($ApiImage) -or [string]::IsNullOrWhiteSpace($WebImage)) {
  if ([string]::IsNullOrWhiteSpace($Owner)) {
    $Owner = Read-Host "GitHub owner/user"
  }

  if ([string]::IsNullOrWhiteSpace($Repository)) {
    $Repository = Read-Host "GitHub repository"
  }

  $ownerPart = Normalize-ImagePart $Owner
  $repoPart = Normalize-ImagePart $Repository
  $ApiImage = "ghcr.io/$ownerPart/$repoPart-api:stable"
  $WebImage = "ghcr.io/$ownerPart/$repoPart-web:stable"
}

Set-EnvValue "TEMICHEVVET_REMOTE_API_IMAGE" $ApiImage
Set-EnvValue "TEMICHEVVET_REMOTE_WEB_IMAGE" $WebImage
Set-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "true"

Write-Host ""
Write-Host "Обновления через GitHub настроены."
Write-Host "API-образ:"
Write-Host "  $ApiImage"
Write-Host "Web-образ:"
Write-Host "  $WebImage"
Write-Host ""
Write-Host "Обычный запуск будет проверять эти образы и обновлять программу при доступном интернете."
Write-Host "Кнопку интернет-обновления можно использовать для ручной проверки новой версии."
Write-Host ""
Write-Host "Если пакеты GitHub Container Registry приватные, один раз выполните на этом компьютере:"
Write-Host "  docker login ghcr.io"
