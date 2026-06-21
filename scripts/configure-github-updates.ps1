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
Set-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "false"

Write-Host ""
Write-Host "GitHub updates are configured."
Write-Host "API image:"
Write-Host "  $ApiImage"
Write-Host "Web image:"
Write-Host "  $WebImage"
Write-Host ""
Write-Host "Regular launch will not update automatically."
Write-Host "Use the internet update button when you want to install a new version."
Write-Host ""
Write-Host "If GitHub Container Registry packages are private, run once on this computer:"
Write-Host "  docker login ghcr.io"
