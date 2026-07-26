param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [switch]$AllowSamePhysicalDrive
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
if (!(Test-Path $EnvFile)) { throw "Файл настроек .env не найден. Сначала установите TemichevVet." }

Write-Host "Цель действия: настроить папку резервных копий TemichevVet."
Write-Host "Запрошенная папка: $Destination"
Write-Host "Клинические данные и существующие Docker volumes не переносятся и не удаляются."

if (!(Test-Path $Destination)) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}
$resolved = (Resolve-Path $Destination).Path
$appDrive = [IO.Path]::GetPathRoot($RootDir.Path)
$backupDrive = [IO.Path]::GetPathRoot($resolved)

function Get-PhysicalDiskNumber($Root) {
  if ($Root -notmatch '^[A-Za-z]:\\$') { return $null }
  try {
    return (Get-Partition -DriveLetter $Root.Substring(0, 1) -ErrorAction Stop | Select-Object -First 1).DiskNumber
  } catch {
    return $null
  }
}

Write-Host "Проверенный полный путь: $resolved"
$appDiskNumber = Get-PhysicalDiskNumber $appDrive
$backupDiskNumber = Get-PhysicalDiskNumber $backupDrive
$sameKnownDisk = $null -ne $appDiskNumber -and $null -ne $backupDiskNumber -and $appDiskNumber -eq $backupDiskNumber
if (($appDrive -eq $backupDrive -or $sameKnownDisk) -and !$AllowSamePhysicalDrive) {
  throw "Выбран тот же физический диск, где установлена CRM ($appDrive). Для защиты от поломки компьютера выберите другой диск."
}

$testFile = Join-Path $resolved ".temichevvet-write-test"
[IO.File]::WriteAllText($testFile, "ok", $Utf8NoBom)
Remove-Item -LiteralPath $testFile -Force

function Set-EnvValue($Key, $Value) {
  $content = Get-Content $EnvFile -Raw
  $line = "$Key=$Value"
  if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
    $content = [Regex]::Replace(
      $content,
      "(?m)^$([Regex]::Escape($Key))=.*$",
      [Text.RegularExpressions.MatchEvaluator]{ param($match) $line }
    )
  } else {
    $content += [Environment]::NewLine + $line
  }
  [IO.File]::WriteAllText($EnvFile, $content, $Utf8NoBom)
}

Set-EnvValue "BACKUP_DIR_HOST" ($resolved.Replace('\', '/'))
$storageLabel = if ($null -ne $backupDiskNumber) { "Отдельный диск $backupDrive (диск $backupDiskNumber)" } else { "Отдельное хранилище $backupDrive" }
Set-EnvValue "BACKUP_STORAGE_LABEL" $storageLabel
Write-Host "Настройка сохранена. Она применится при следующем согласованном запуске сервера."
Write-Host "Сейчас ничего не перезапускалось и данные никуда не переносились."
