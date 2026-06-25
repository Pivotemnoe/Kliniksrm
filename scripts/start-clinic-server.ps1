param(
  [switch]$Build,
  [switch]$UpdateImages,
  [switch]$NoImageUpdate,
  [switch]$ForceRecreate,
  [switch]$Open,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function Show-Usage {
  Write-Host "Start local TemichevVet server."
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\start-clinic-server.ps1"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\start-clinic-server.ps1 -Build"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\start-clinic-server.ps1 -UpdateImages"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\start-clinic-server.ps1 -ForceRecreate"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\start-clinic-server.ps1 -Open"
  Write-Host ""
  Write-Host "Options:"
  Write-Host "  -Build          rebuild api and web before start"
  Write-Host "  -UpdateImages   pull fresh api/web images from configured registry"
  Write-Host "  -NoImageUpdate  skip image pull"
  Write-Host "  -ForceRecreate  recreate containers from current images"
  Write-Host "  -Open           open CRM in browser on this computer"
  Write-Host "  -Help           show help"
}

if ($Help) {
  Show-Usage
  exit 0
}

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-VirtualInterfaceName {
  param([string]$Name)

  if ([string]::IsNullOrWhiteSpace($Name)) {
    return $false
  }

  return ($Name -match "Docker|vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Teredo|Npcap|Bluetooth|ZeroTier")
}

function Get-LocalIp {
  try {
    $configs = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object {
        $_.IPv4Address -and
        $_.IPv4DefaultGateway -and
        !(Test-VirtualInterfaceName $_.InterfaceAlias)
      } |
      Sort-Object InterfaceMetric

    foreach ($config in $configs) {
      foreach ($address in @($config.IPv4Address)) {
        $ip = $address.IPAddress
        if (
          $ip -notlike "127.*" -and
          $ip -notlike "169.254.*" -and
          (
            $ip -like "192.168.*" -or
            $ip -like "10.*" -or
            $ip -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
          )
        ) {
          return $ip
        }
      }
    }

    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown" -and
        !(Test-VirtualInterfaceName $_.InterfaceAlias)
      } |
      Sort-Object InterfaceMetric |
      Select-Object -ExpandProperty IPAddress

    foreach ($ip in $addresses) {
      if (
        $ip -like "192.168.*" -or
        $ip -like "10.*" -or
        $ip -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
      ) {
        return $ip
      }
    }

    if ($addresses) {
      return ($addresses | Select-Object -First 1)
    }
  } catch {
    return "THIS_COMPUTER_IP"
  }

  return "THIS_COMPUTER_IP"
}

function New-RandomSecret {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    if ($rng -is [System.IDisposable]) {
      $rng.Dispose()
    }
  }

  return [Convert]::ToBase64String($bytes)
}

function Set-EnvValue($Key, $Value) {
  $content = Get-Content $EnvFile -Raw
  $line = "$Key=$Value"

  if ($content -match "(?m)^$([Regex]::Escape($Key))=") {
    $content = [Regex]::Replace($content, "(?m)^$([Regex]::Escape($Key))=.*$", $line)
    Set-Content -Path $EnvFile -Value $content -NoNewline -Encoding UTF8
  } else {
    Add-Content -Path $EnvFile -Value $line -Encoding UTF8
  }
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

function Test-Truthy($Value) {
  if ($null -eq $Value) {
    return $false
  }

  return @("1", "true", "yes", "y", "on") -contains $Value.ToString().Trim().ToLowerInvariant()
}

function Backup-CurrentDatabase {
  docker container inspect clinic-crm-postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Контейнер PostgreSQL не найден. Пропускаю backup перед обновлением."
    return
  }

  $dbUser = Get-EnvValue "POSTGRES_USER" "clinic_crm"
  $dbName = Get-EnvValue "POSTGRES_DB" "clinic_crm"
  $backupDir = Join-Path $RootDir "backups"
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupFile = Join-Path $backupDir "pre-startup-update-$timestamp.sql"

  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

  Write-Host "Создаю backup базы перед обновлением программы..."
  Write-Host "  $backupFile"
  & docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName > $backupFile
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $backupFile
    throw "Не удалось создать backup базы. Обновление при запуске остановлено, чтобы не рисковать данными клиники."
  }
}

function Invoke-DockerPullWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Image,
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [int]$Attempts = 2
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

function Try-UseRemoteImages {
  if ($Build -or $NoImageUpdate) {
    return $false
  }

  $autoPull = Test-Truthy (Get-EnvValue "TEMICHEVVET_AUTO_PULL_IMAGES" "true")
  if (!$autoPull -and !$UpdateImages) {
    return $false
  }

  $remoteApi = Get-EnvValue "TEMICHEVVET_REMOTE_API_IMAGE" ""
  $remoteWeb = Get-EnvValue "TEMICHEVVET_REMOTE_WEB_IMAGE" ""

  if ([string]::IsNullOrWhiteSpace($remoteApi) -or [string]::IsNullOrWhiteSpace($remoteWeb)) {
    return $false
  }

  Write-Host "Checking updated TemichevVet Docker images..."
  Backup-CurrentDatabase

  $apiPullOk = Invoke-DockerPullWithRetry -Image $remoteApi -Label "API"
  $webPullOk = Invoke-DockerPullWithRetry -Image $remoteWeb -Label "web"

  if ($apiPullOk -and $webPullOk) {
    Set-EnvValue "TEMICHEVVET_API_IMAGE" $remoteApi
    Set-EnvValue "TEMICHEVVET_WEB_IMAGE" $remoteWeb
    Write-Host "Using updated Docker images from registry."
    return $true
  }

  Write-Host "Не удалось обновить Docker-образы из интернета."
  Write-Host "Если в ошибке написано TLS handshake timeout, проверьте доступ к ghcr.io и pkg-containers.githubusercontent.com."
  Write-Host "Запускаю уже загруженную локальную версию."
  return $false
}

function Wait-ForUrl($Url, $Label) {
  for ($i = 1; $i -le 40; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
      return
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  throw "$Label did not respond in 40 seconds: $Url"
}

function Test-DockerRunning {
  docker version *> $null
  return $LASTEXITCODE -eq 0
}

function Test-DockerImage($Image) {
  docker image inspect $Image *> $null
  return $LASTEXITCODE -eq 0
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$Arguments = @()
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
  }
}

function Test-PortAvailable($Port) {
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, [int]$Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Test-PortUsedByContainer($ContainerName, $ContainerPort, $HostPort) {
  $output = docker port $ContainerName $ContainerPort 2>$null
  if ($LASTEXITCODE -ne 0 -or !$output) {
    return $false
  }

  foreach ($line in $output) {
    if ($line.Trim() -match "[:\]]$HostPort$") {
      return $true
    }
  }

  return $false
}

function Find-FreePort($StartPort) {
  for ($port = [int]$StartPort; $port -lt ([int]$StartPort + 100); $port++) {
    if (Test-PortAvailable $port) {
      return $port
    }
  }

  throw "No free TCP port found near $StartPort"
}

function Ensure-PortSetting($Key, $DefaultPort, $FallbackStartPort, $ContainerName, $ContainerPort) {
  $current = [int](Get-EnvValue $Key $DefaultPort)

  if ((Test-PortAvailable $current) -or (Test-PortUsedByContainer $ContainerName $ContainerPort $current)) {
    return $current
  }

  $next = Find-FreePort $FallbackStartPort
  Set-EnvValue $Key $next
  Write-Host "Port $current for $Key is busy. Using $next."
  return $next
}

function Remove-AppContainers {
  $containerNames = @(
    "clinic-crm-web",
    "clinic-crm-api",
    "clinic-crm-postgres",
    "clinic-crm-redis",
    "clinic-crm-minio"
  )

  foreach ($containerName in $containerNames) {
    docker container inspect $containerName *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Removing old TemichevVet container: $containerName"
      docker rm -f $containerName *> $null
    }
  }
}

function Start-ComposeServices {
  param(
    [bool]$NoBuild
  )

  $arguments = @("compose", "up", "-d")
  if ($NoBuild) {
    $arguments += "--no-build"
  }
  if ($ForceRecreate) {
    $arguments += "--force-recreate"
  }
  $arguments += @("postgres", "redis", "minio", "api", "web")

  try {
    Invoke-Native -Command "docker" -Arguments $arguments
  } catch {
    Write-Host "Docker Compose start failed. Removing old TemichevVet containers and retrying..."
    Remove-AppContainers
    Invoke-Native -Command "docker" -Arguments $arguments
  }
}

if (!(Test-Command "docker")) {
  $installer = Join-Path $RootDir "installers\Docker Desktop Installer.exe"
  Write-Host "Docker was not found."
  if (Test-Path $installer) {
    Write-Host "Docker installer found: $installer"
    Write-Host "Run it, reboot if required, then start TemichevVet again."
  } else {
    Write-Host "Install Docker Desktop, then start TemichevVet again."
  }
  exit 1
}

if (!(Test-DockerRunning)) {
  Write-Host "Docker is installed but is not responding. Trying to open Docker Desktop..."
  $dockerDesktopPath = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktopPath) {
    Start-Process $dockerDesktopPath
  }

  for ($i = 1; $i -le 60; $i++) {
    if (Test-DockerRunning) {
      break
    }
    Start-Sleep -Seconds 2
  }

  if (!(Test-DockerRunning)) {
    Write-Host "Docker Desktop did not start automatically."
    Write-Host "Open Docker Desktop manually, wait for Running status, then start again."
    exit 1
  }
}

Set-Location $RootDir
$localIp = Get-LocalIp

if (!(Test-Path $EnvFile)) {
  if (!(Test-Path $EnvExample)) {
    throw "Env example was not found: $EnvExample"
  }

  Copy-Item $EnvExample $EnvFile
  Set-EnvValue "WEB_BIND_ADDR" "0.0.0.0"
  Set-EnvValue "APP_URL" "http://$localIp`:3000"
  Set-EnvValue "SESSION_SECRET" (New-RandomSecret)
  Write-Host "Settings file created: $EnvFile"
}

$webPort = Ensure-PortSetting "WEB_PORT" "3000" "3001" "clinic-crm-web" "80/tcp"
$apiPort = Ensure-PortSetting "API_HOST_PORT" "4000" "4001" "clinic-crm-api" "4000/tcp"
$postgresPort = Ensure-PortSetting "POSTGRES_PORT" "5433" "15433" "clinic-crm-postgres" "5432/tcp"
$redisPort = Ensure-PortSetting "REDIS_PORT" "6379" "16379" "clinic-crm-redis" "6379/tcp"
$minioApiPort = Ensure-PortSetting "MINIO_API_PORT" "9000" "9100" "clinic-crm-minio" "9000/tcp"
$minioConsolePort = Ensure-PortSetting "MINIO_CONSOLE_PORT" "9001" "9101" "clinic-crm-minio" "9001/tcp"
Set-EnvValue "APP_URL" "http://$localIp`:$webPort"
Set-EnvValue "S3_ENDPOINT" "http://localhost:$minioApiPort"
$directorPhone = Get-EnvValue "BOOTSTRAP_DIRECTOR_PHONE" "+70000000001"

if ($Build) {
  Invoke-Native -Command "docker" -Arguments @("compose", "build", "api", "web")
} else {
  Try-UseRemoteImages | Out-Null
}

$apiImage = Get-EnvValue "TEMICHEVVET_API_IMAGE" "temichevvet-api:local"
$webImage = Get-EnvValue "TEMICHEVVET_WEB_IMAGE" "temichevvet-web:local"
$hasConfiguredApi = Test-DockerImage $apiImage
$hasConfiguredWeb = Test-DockerImage $webImage
$hasLocalApi = Test-DockerImage "temichevvet-api:local"
$hasLocalWeb = Test-DockerImage "temichevvet-web:local"

if (!$Build -and $hasConfiguredApi -and $hasConfiguredWeb) {
  Write-Host "Found ready Docker images. Starting without rebuild:"
  Write-Host "  api: $apiImage"
  Write-Host "  web: $webImage"
  Start-ComposeServices -NoBuild $true
} elseif (!$Build -and $hasLocalApi -and $hasLocalWeb) {
  Set-EnvValue "TEMICHEVVET_API_IMAGE" "temichevvet-api:local"
  Set-EnvValue "TEMICHEVVET_WEB_IMAGE" "temichevvet-web:local"
  Write-Host "Registry images are unavailable. Starting from local offline images..."
  Start-ComposeServices -NoBuild $true
} else {
  Start-ComposeServices -NoBuild $false
}

Wait-ForUrl "http://127.0.0.1:$apiPort/api/health" "Backend"
Wait-ForUrl "http://127.0.0.1:$webPort" "Frontend"

$localUrl = "http://127.0.0.1:$webPort/login"
$networkUrl = "http://$localIp`:$webPort/login"
$networkBaseUrl = "http://$localIp`:$webPort"

if ($localIp -ne "THIS_COMPUTER_IP") {
  Set-Content -Path (Join-Path $RootDir "server-url.txt") -Value $networkBaseUrl -Encoding UTF8
  Set-Content -Path (Join-Path $RootDir "TemichevVet-server-url.txt") -Value $networkBaseUrl -Encoding UTF8
}

Write-Host ""
Write-Host "TemichevVet is running."
Write-Host ""
Write-Host "Open on this computer:"
Write-Host "  $localUrl"
Write-Host ""
Write-Host "Open from other clinic computers:"
Write-Host "  $networkUrl"
Write-Host ""
Write-Host "Director:"
Write-Host "  login: $directorPhone"
Write-Host "  password: see BOOTSTRAP_DIRECTOR_PASSWORD in .env file"
Write-Host ""
Write-Host "Stop server:"
Write-Host "  docker compose stop"
Write-Host ""

if ($Open) {
  Start-Process $localUrl
}
