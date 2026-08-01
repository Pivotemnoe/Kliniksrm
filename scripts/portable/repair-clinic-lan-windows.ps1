$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$InstallDir = Join-Path $Env:USERPROFILE "TemichevVet"
$EnvFile = Join-Path $InstallDir ".env"
$RuntimeEnvFile = Join-Path $InstallDir ".env.runtime"
$ComposeFile = Join-Path $InstallDir "docker-compose.yml"
$BackupDir = Join-Path $InstallDir "backups"

function Get-EnvValue {
  param([string]$Key, [string]$DefaultValue = "")

  foreach ($path in @($RuntimeEnvFile, $EnvFile)) {
    if (!(Test-Path $path -PathType Leaf)) { continue }
    $match = Get-Content $path | Where-Object { $_ -match "^$([Regex]::Escape($Key))=" } | Select-Object -Last 1
    if ($match) { return ($match -replace "^[^=]+=", "") }
  }
  return $DefaultValue
}

function Set-EnvFileValue {
  param([string]$Path, [string]$Key, [string]$Value)

  $content = if (Test-Path $Path) { Get-Content $Path -Raw } else { "" }
  $line = "$Key=$Value"
  if ($content -match "(?m)^$([Regex]::Escape($Key))=.*$") {
    $content = [Regex]::Replace($content, "(?m)^$([Regex]::Escape($Key))=.*$", $line)
  } elseif ([string]::IsNullOrWhiteSpace($content)) {
    $content = $line + [Environment]::NewLine
  } else {
    $content = $content.TrimEnd("`r", "`n") + [Environment]::NewLine + $line + [Environment]::NewLine
  }
  [IO.File]::WriteAllText($Path, $content, $Utf8NoBom)
}

function Set-InstalledEnvValue {
  param([string]$Key, [string]$Value)

  try {
    Set-EnvFileValue -Path $EnvFile -Key $Key -Value $Value
    if (Test-Path $RuntimeEnvFile) {
      $remaining = @(Get-Content $RuntimeEnvFile | Where-Object { $_ -notmatch "^$([Regex]::Escape($Key))=" })
      [IO.File]::WriteAllLines($RuntimeEnvFile, [string[]]$remaining, $Utf8NoBom)
    }
  } catch {
    Set-EnvFileValue -Path $RuntimeEnvFile -Key $Key -Value $Value
  }
  Set-Item -Path "Env:$Key" -Value $Value
}

function Import-RuntimeEnv {
  if (!(Test-Path $RuntimeEnvFile -PathType Leaf)) { return }
  foreach ($rawLine in Get-Content $RuntimeEnvFile) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#") -or $line -notmatch "=") { continue }
    $parts = $line.Split("=", 2)
    Set-Item -Path "Env:$($parts[0].Trim())" -Value $parts[1]
  }
}

function Get-ClinicNetwork {
  $virtualPattern = "Docker|vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Teredo|Npcap|Bluetooth|ZeroTier"
  $config = Get-NetIPConfiguration -ErrorAction Stop |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address -and $_.InterfaceAlias -notmatch $virtualPattern } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1

  if (!$config) {
    throw "Не удалось определить активную локальную сеть сервера. Подключите сервер к сети клиники и повторите."
  }
  $address = @($config.IPv4Address | Where-Object { $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
  if ([string]::IsNullOrWhiteSpace($address)) {
    throw "Не удалось определить IPv4-адрес сервера в локальной сети."
  }
  return [PSCustomObject]@{
    Address = $address
    InterfaceAlias = $config.InterfaceAlias
    InterfaceIndex = $config.InterfaceIndex
  }
}

function Ensure-PrivateNetworkProfile {
  param($Network)

  $profile = Get-NetConnectionProfile -InterfaceIndex $Network.InterfaceIndex -ErrorAction Stop
  if ($profile.NetworkCategory -eq "Public") {
    Set-NetConnectionProfile -InterfaceIndex $Network.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
    Write-Host "Сеть '$($Network.InterfaceAlias)' переведена в доверенный частный профиль."
  } else {
    Write-Host "Профиль сети '$($Network.InterfaceAlias)': $($profile.NetworkCategory)."
  }
}

function Ensure-ClinicFirewallRule {
  param([int]$WebPort)

  $ruleName = "TemichevVet CRM (Private network)"
  $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($rule) {
    Set-NetFirewallRule -Name $rule.Name -Enabled True -Profile Private -Direction Inbound -Action Allow | Out-Null
    $rule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet | Out-Null
    $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $WebPort | Out-Null
  } else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $WebPort -RemoteAddress LocalSubnet -Profile Private | Out-Null
  }

  $dockerBlocks = Get-NetFirewallRule -DisplayName "Docker Desktop Backend" -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq "True" -and $_.Action -eq "Block" -and $_.Direction -eq "Inbound" }
  foreach ($dockerBlock in $dockerBlocks) {
    Set-NetFirewallRule -Name $dockerBlock.Name -Profile Public | Out-Null
  }
  Write-Host "Разрешён только вход из локальной частной сети по TCP $WebPort."
}

function Wait-ForUrl {
  param([string]$Url)

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
    }
    Start-Sleep -Seconds 2
  }
  throw "CRM не ответила после исправления по адресу $Url"
}

try {
  Write-Host "Исправление доступа к TemichevVet с рабочих мест."
  Write-Host "Клиническая база, PostgreSQL, Redis, MinIO и Docker volumes не изменяются."
  Write-Host ""

  if (!(Test-Path $InstallDir -PathType Container) -or !(Test-Path $ComposeFile -PathType Leaf) -or !(Test-Path $EnvFile -PathType Leaf)) {
    throw "TemichevVet не найдена в $InstallDir. Запустите этот файл на серверном компьютере клиники."
  }
  if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker не найден. Запустите Docker Desktop и повторите."
  }

  docker version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop не отвечает. Запустите Docker Desktop, дождитесь состояния Running и повторите."
  }

  $network = Get-ClinicNetwork
  $webPortText = Get-EnvValue -Key "WEB_PORT" -DefaultValue "3000"
  $webPort = 0
  if (![int]::TryParse($webPortText, [ref]$webPort) -or $webPort -lt 1 -or $webPort -gt 65535) {
    throw "В настройках указан некорректный WEB_PORT: $webPortText"
  }

  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -Force -Path $EnvFile -Destination (Join-Path $BackupDir "before-lan-repair-$timestamp.env")
  if (Test-Path $RuntimeEnvFile) {
    Copy-Item -Force -Path $RuntimeEnvFile -Destination (Join-Path $BackupDir "before-lan-repair-$timestamp.env.runtime")
  }

  Ensure-PrivateNetworkProfile -Network $network
  Ensure-ClinicFirewallRule -WebPort $webPort
  Set-InstalledEnvValue -Key "WEB_BIND_ADDR" -Value "0.0.0.0"
  Set-InstalledEnvValue -Key "APP_URL" -Value "http://$($network.Address):$webPort"
  Import-RuntimeEnv

  Set-Location $InstallDir
  Write-Host "Перезапускается только веб-контейнер CRM. База данных и остальные контейнеры не затрагиваются."
  docker compose up -d --no-deps --force-recreate web
  if ($LASTEXITCODE -ne 0) { throw "Не удалось пересоздать веб-контейнер CRM." }

  Wait-ForUrl -Url "http://127.0.0.1:$webPort/api/health"
  $portBinding = docker port clinic-crm-web 80/tcp 2>$null | Select-Object -Last 1

  Write-Host ""
  Write-Host "ГОТОВО. Доступ с рабочих мест исправлен."
  Write-Host "Адрес для рабочих компьютеров:"
  Write-Host "  http://$($network.Address):$webPort/login"
  Write-Host "Привязка Docker: $portBinding"
  Write-Host ""
  Write-Host "На рабочих компьютерах снова запустите 'Подключить рабочее место - Windows.bat' с этой флешки."
} catch {
  Write-Host ""
  Write-Host "ОШИБКА: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Сфотографируйте это окно целиком и пришлите фотографию."
  exit 1
} finally {
  Write-Host ""
  Read-Host "Нажмите Enter, чтобы закрыть окно"
}
