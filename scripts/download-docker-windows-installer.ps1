$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$InstallerDir = Join-Path $RootDir "installers"
$InstallerFile = Join-Path $InstallerDir "Docker Desktop Installer.exe"
$InstallerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"

New-Item -ItemType Directory -Force -Path $InstallerDir | Out-Null

Write-Host "Downloading Docker Desktop for Windows..."
Write-Host $InstallerUrl
Write-Host ""

Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerFile

Write-Host ""
Write-Host "Done:"
Write-Host $InstallerFile
