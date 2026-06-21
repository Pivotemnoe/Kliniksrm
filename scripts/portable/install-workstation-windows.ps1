param(
  [string]$ServerUrl = "",
  [switch]$NoPrompt
)

$ErrorActionPreference = "Stop"

$PortableRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$InstallDir = Join-Path $Env:USERPROFILE "TemichevVet-Workstation"
$ServerUrlFile = Join-Path $InstallDir "server-url.txt"
$LauncherScript = Join-Path $InstallDir "open-temichevvet.ps1"
$CommandLauncher = Join-Path $InstallDir "TemichevVet.cmd"
$IconPath = Join-Path $InstallDir "temichevvet.ico"
$Ports = @(3000, 3001, 3002, 3003, 3004, 3005)
$QuickPorts = @(3000)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-ServerUrl {
  param([string]$Value)

  if ($null -eq $Value) {
    $url = ""
  } else {
    $url = $Value.Trim()
  }
  if ($url.Length -eq 0) {
    return ""
  }

  if ($url -notmatch "^https?://") {
    $url = "http://$url"
  }

  try {
    $builder = [System.UriBuilder]::new($url)
    if ($builder.Port -lt 1) {
      $builder.Port = 3000
    }
    $builder.Path = ""
    $builder.Query = ""
    $builder.Fragment = ""
    return $builder.Uri.AbsoluteUri.TrimEnd("/")
  } catch {
    return $url.TrimEnd("/")
  }
}

function Test-LoopbackServerUrl {
  param([string]$Url)

  try {
    $uri = [System.Uri]::new((Normalize-ServerUrl $Url))
    $host = $uri.Host.ToLowerInvariant()
    return ($host -eq "localhost" -or $host -eq "::1" -or $host -match "^127\.")
  } catch {
    return $false
  }
}

function Test-ServerUrl {
  param([string]$Url)

  $normalized = Normalize-ServerUrl $Url
  if ($normalized.Length -eq 0) {
    return $false
  }
  if (Test-LoopbackServerUrl $normalized) {
    return $false
  }

  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$normalized/api/health" -TimeoutSec 2
    if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 300) {
      return $true
    }
  } catch {
  }

  try {
    $login = Invoke-WebRequest -UseBasicParsing -Uri "$normalized/login" -TimeoutSec 2
    return ($login.StatusCode -ge 200 -and $login.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 120
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (!$async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }

    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-VirtualInterfaceName {
  param([string]$Name)

  if ([string]::IsNullOrWhiteSpace($Name)) {
    return $false
  }

  return ($Name -match "Docker|vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Teredo|Npcap|Bluetooth|ZeroTier")
}

function Get-NetworkScopes {
  $scopes = @()

  try {
    $configs = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4Address -and !(Test-VirtualInterfaceName $_.InterfaceAlias) } |
      Sort-Object @{ Expression = { if ($_.IPv4DefaultGateway) { 0 } else { 1 } } }, InterfaceMetric

    foreach ($config in $configs) {
      foreach ($address in @($config.IPv4Address)) {
        $ip = $address.IPAddress
        if ($ip -like "127.*" -or $ip -like "169.254.*") {
          continue
        }

        $parts = $ip.Split(".")
        if ($parts.Count -ne 4) {
          continue
        }

        $gateway = ""
        if ($config.IPv4DefaultGateway) {
          $gateway = ($config.IPv4DefaultGateway | Select-Object -First 1).NextHop
        }

        $scopes += [PSCustomObject]@{
          Prefix = "$($parts[0]).$($parts[1]).$($parts[2])"
          Source = $config.InterfaceAlias
          Gateway = $gateway
          HasGateway = [bool]$config.IPv4DefaultGateway
        }
      }
    }
  } catch {
    try {
      $configs = Get-WmiObject Win32_NetworkAdapterConfiguration |
        Where-Object { $_.IPEnabled -eq $true -and $_.IPAddress }

      foreach ($config in $configs) {
        foreach ($ip in @($config.IPAddress)) {
          if ($ip -notmatch "^\d+\.\d+\.\d+\.\d+$" -or $ip -like "127.*" -or $ip -like "169.254.*") {
            continue
          }
          $parts = $ip.Split(".")
          $scopes += [PSCustomObject]@{
            Prefix = "$($parts[0]).$($parts[1]).$($parts[2])"
            Source = $config.Description
            Gateway = (@($config.DefaultIPGateway) | Select-Object -First 1)
            HasGateway = [bool]$config.DefaultIPGateway
          }
        }
      }
    } catch {
    }
  }

  return @($scopes | Sort-Object HasGateway -Descending | Select-Object -Property Prefix, Source, Gateway, HasGateway -Unique)
}

function Get-NeighborHosts {
  $hosts = @()

  try {
    $hosts = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -match "^\d+\.\d+\.\d+\.\d+$" -and
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.State -in @("Reachable", "Stale", "Delay", "Probe", "Permanent")
      } |
      Select-Object -ExpandProperty IPAddress
  } catch {
  }

  return @($hosts | Select-Object -Unique)
}

function Test-CandidateHost {
  param(
    [string]$HostName,
    [int[]]$CandidatePorts = $Ports
  )

  foreach ($port in $CandidatePorts) {
    if (Test-TcpPort -HostName $HostName -Port $port) {
      $url = "http://${HostName}:$port"
      if (Test-ServerUrl $url) {
        return $url
      }
    }
  }

  return ""
}

function Read-ServerUrlFromFiles {
  $candidateFiles = @(
    (Join-Path $PortableRoot "server-url.txt"),
    (Join-Path $PortableRoot "TemichevVet-server-url.txt"),
    $ServerUrlFile
  )

  foreach ($file in $candidateFiles) {
    if (!(Test-Path $file)) {
      continue
    }

    $values = Get-Content -Path $file | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($value in $values) {
      $saved = Normalize-ServerUrl $value
      Write-Host "Проверяю сохранённый адрес сервера: $saved"
      if (Test-ServerUrl $saved) {
        return $saved
      }
    }
  }

  return ""
}

function Find-ServerUrl {
  if (![string]::IsNullOrWhiteSpace($ServerUrl)) {
    $explicit = Normalize-ServerUrl $ServerUrl
    Write-Host "Проверяю указанный адрес сервера: $explicit"
    if (Test-ServerUrl $explicit) {
      return $explicit
    }
  }

  $fromFile = Read-ServerUrlFromFiles
  if ($fromFile.Length -gt 0) {
    return $fromFile
  }

  $knownNames = @(
    "temichevvet.local",
    "temichevvet",
    "temichevvet-server.local",
    "temichevvet-server"
  )

  foreach ($name in $knownNames) {
    Write-Host "Проверяю имя сервера: $name"
    $url = Test-CandidateHost $name
    if ($url.Length -gt 0) {
      return $url
    }
  }

  $neighborHosts = Get-NeighborHosts
  if ($neighborHosts.Count -gt 0) {
    Write-Host "Проверяю уже видимые компьютеры в сети..."
    foreach ($hostAddress in $neighborHosts) {
      $url = Test-CandidateHost -HostName $hostAddress -CandidatePorts $QuickPorts
      if ($url.Length -gt 0) {
        return $url
      }
    }
  }

  foreach ($scope in (Get-NetworkScopes)) {
    Write-Host "Ищу сервер TemichevVet в сети $($scope.Prefix).0/24 через $($scope.Source) ..."

    if (![string]::IsNullOrWhiteSpace($scope.Gateway)) {
      $gatewayUrl = Test-CandidateHost $scope.Gateway
      if ($gatewayUrl.Length -gt 0) {
        return $gatewayUrl
      }
    }

    foreach ($last in 1..254) {
      $hostAddress = "$($scope.Prefix).$last"
      $url = Test-CandidateHost $hostAddress
      if ($url.Length -gt 0) {
        return $url
      }
    }
  }

  return ""
}

function Read-ServerUrlFromUser {
  if ($NoPrompt) {
    return ""
  }

  Write-Host ""
  Write-Host "Автоматический поиск не нашёл сервер TemichevVet."
  Write-Host "На серверном компьютере откройте TemichevVet и посмотрите адрес для других компьютеров."
  Write-Host "Нужен адрес вида: http://192.168.1.15:3000"
  Write-Host "Важно: 127.0.0.1 подходит только самому серверу, для второго компьютера он не подходит."
  Write-Host ""

  while ($true) {
    $entered = Read-Host "Введите адрес сервера или нажмите Enter для отмены"
    $normalized = Normalize-ServerUrl $entered
    if ($normalized.Length -eq 0) {
      return ""
    }

    Write-Host "Проверяю адрес: $normalized"
    if (Test-LoopbackServerUrl $normalized) {
      Write-Host "Адрес 127.0.0.1, localhost или ::1 подходит только серверному компьютеру. Введите сетевой адрес вида http://192.168.x.x:3000."
      continue
    }

    if (Test-ServerUrl $normalized) {
      return $normalized
    }

    Write-Host "По этому адресу CRM не отвечает. Проверьте IP, порт 3000, Wi-Fi и брандмауэр Windows."
  }
}

function Save-ServerUrl {
  param([string]$Url)

  Set-Content -Path $ServerUrlFile -Value $Url -Encoding UTF8

  foreach ($file in @((Join-Path $PortableRoot "server-url.txt"), (Join-Path $PortableRoot "TemichevVet-server-url.txt"))) {
    try {
      Set-Content -Path $file -Value $Url -Encoding UTF8
    } catch {
    }
  }
}

function New-WorkstationLauncherScript {
  $content = @'
$ErrorActionPreference = "Stop"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerUrlFile = Join-Path $InstallDir "server-url.txt"
$Ports = @(3000, 3001, 3002, 3003, 3004, 3005)
$QuickPorts = @(3000)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-ServerUrl {
  param([string]$Value)
  if ($null -eq $Value) { $url = "" } else { $url = $Value.Trim() }
  if ($url.Length -eq 0) { return "" }
  if ($url -notmatch "^https?://") { $url = "http://$url" }
  try {
    $builder = [System.UriBuilder]::new($url)
    if ($builder.Port -lt 1) { $builder.Port = 3000 }
    $builder.Path = ""
    $builder.Query = ""
    $builder.Fragment = ""
    return $builder.Uri.AbsoluteUri.TrimEnd("/")
  } catch {
    return $url.TrimEnd("/")
  }
}

function Test-LoopbackServerUrl {
  param([string]$Url)
  try {
    $uri = [System.Uri]::new((Normalize-ServerUrl $Url))
    $host = $uri.Host.ToLowerInvariant()
    return ($host -eq "localhost" -or $host -eq "::1" -or $host -match "^127\.")
  } catch {
    return $false
  }
}

function Test-ServerUrl {
  param([string]$Url)
  $normalized = Normalize-ServerUrl $Url
  if ($normalized.Length -eq 0) { return $false }
  if (Test-LoopbackServerUrl $normalized) { return $false }
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$normalized/api/health" -TimeoutSec 2
    if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 300) { return $true }
  } catch {
  }
  try {
    $login = Invoke-WebRequest -UseBasicParsing -Uri "$normalized/login" -TimeoutSec 2
    return ($login.StatusCode -ge 200 -and $login.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-TcpPort {
  param([string]$HostName, [int]$Port, [int]$TimeoutMs = 120)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    if (!$async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-VirtualInterfaceName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return $false }
  return ($Name -match "Docker|vEthernet|Hyper-V|VirtualBox|VMware|WSL|Loopback|Teredo|Npcap|Bluetooth|ZeroTier")
}

function Get-NetworkScopes {
  $scopes = @()
  try {
    $configs = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4Address -and !(Test-VirtualInterfaceName $_.InterfaceAlias) } |
      Sort-Object @{ Expression = { if ($_.IPv4DefaultGateway) { 0 } else { 1 } } }, InterfaceMetric
    foreach ($config in $configs) {
      foreach ($address in @($config.IPv4Address)) {
        $ip = $address.IPAddress
        if ($ip -like "127.*" -or $ip -like "169.254.*") { continue }
        $parts = $ip.Split(".")
        if ($parts.Count -ne 4) { continue }
        $gateway = ""
        if ($config.IPv4DefaultGateway) { $gateway = ($config.IPv4DefaultGateway | Select-Object -First 1).NextHop }
        $scopes += [PSCustomObject]@{ Prefix = "$($parts[0]).$($parts[1]).$($parts[2])"; Source = $config.InterfaceAlias; Gateway = $gateway; HasGateway = [bool]$config.IPv4DefaultGateway }
      }
    }
  } catch {
  }
  return @($scopes | Sort-Object HasGateway -Descending | Select-Object -Property Prefix, Source, Gateway, HasGateway -Unique)
}

function Get-NeighborHosts {
  try {
    return @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -match "^\d+\.\d+\.\d+\.\d+$" -and $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.State -in @("Reachable", "Stale", "Delay", "Probe", "Permanent") } |
      Select-Object -ExpandProperty IPAddress |
      Select-Object -Unique)
  } catch {
    return @()
  }
}

function Test-CandidateHost {
  param([string]$HostName, [int[]]$CandidatePorts = $Ports)
  foreach ($port in $CandidatePorts) {
    if (Test-TcpPort -HostName $HostName -Port $port) {
      $url = "http://${HostName}:$port"
      if (Test-ServerUrl $url) { return $url }
    }
  }
  return ""
}

function Find-ServerUrl {
  foreach ($name in @("temichevvet.local", "temichevvet", "temichevvet-server.local", "temichevvet-server")) {
    $url = Test-CandidateHost $name
    if ($url.Length -gt 0) { return $url }
  }

  foreach ($hostAddress in (Get-NeighborHosts)) {
    $url = Test-CandidateHost $hostAddress
    if ($url.Length -gt 0) { return $url }
  }

  foreach ($scope in (Get-NetworkScopes)) {
    Write-Host "Ищу сервер TemichevVet в сети $($scope.Prefix).0/24 ..."
    if (![string]::IsNullOrWhiteSpace($scope.Gateway)) {
      $gatewayUrl = Test-CandidateHost $scope.Gateway
      if ($gatewayUrl.Length -gt 0) { return $gatewayUrl }
    }
    foreach ($last in 1..254) {
      $url = Test-CandidateHost -HostName "$($scope.Prefix).$last" -CandidatePorts $QuickPorts
      if ($url.Length -gt 0) { return $url }
    }
  }
  return ""
}

function Read-ServerUrlFromUser {
  Write-Host ""
  Write-Host "Не удалось найти сервер TemichevVet автоматически."
  Write-Host "Введите адрес сервера вида http://192.168.1.15:3000"
  Write-Host "Адрес 127.0.0.1 подходит только серверному компьютеру."
  Write-Host ""
  while ($true) {
    $entered = Read-Host "Адрес сервера или Enter для отмены"
    $normalized = Normalize-ServerUrl $entered
    if ($normalized.Length -eq 0) { return "" }
    if (Test-LoopbackServerUrl $normalized) {
      Write-Host "Адрес 127.0.0.1, localhost или ::1 подходит только серверному компьютеру. Введите сетевой адрес вида http://192.168.x.x:3000."
      continue
    }
    if (Test-ServerUrl $normalized) { return $normalized }
    Write-Host "CRM не отвечает по адресу $normalized"
  }
}

$serverUrl = ""
if (Test-Path $ServerUrlFile) {
  $serverUrl = Normalize-ServerUrl (Get-Content -Path $ServerUrlFile -Raw)
}

if (!(Test-ServerUrl $serverUrl)) {
  $serverUrl = Find-ServerUrl
}

if ($serverUrl.Length -eq 0) {
  $serverUrl = Read-ServerUrlFromUser
}

if ($serverUrl.Length -eq 0) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Не удалось найти сервер TemichevVet. Проверьте, что серверный компьютер включён, не спит, TemichevVet запущен, а оба компьютера находятся в одной Wi-Fi/локальной сети.", "TemichevVet")
  exit 1
}

Set-Content -Path $ServerUrlFile -Value $serverUrl -Encoding UTF8
Start-Process "$serverUrl/login"
'@

  Set-Content -Path $LauncherScript -Value $content -Encoding UTF8
}

function New-WorkstationCommand {
  $content = @(
    "@echo off",
    "chcp 65001 >nul",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\TemichevVet-Workstation\open-temichevvet.ps1"'
  )
  Set-Content -Path $CommandLauncher -Value $content -Encoding ASCII
}

function New-Shortcut {
  param([string]$ShortcutPath)

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $CommandLauncher
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = "Открыть TemichevVet с серверного компьютера клиники"
  if (Test-Path $IconPath) {
    $shortcut.IconLocation = $IconPath
  } else {
    $shortcut.IconLocation = "$Env:SystemRoot\System32\shell32.dll,220"
  }
  $shortcut.Save()
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$sourceIcon = Join-Path $PortableRoot "installers\temichevvet.ico"
if (Test-Path $sourceIcon) {
  Copy-Item -Force -Path $sourceIcon -Destination $IconPath
}

$serverUrl = Find-ServerUrl
if ($serverUrl.Length -eq 0) {
  $serverUrl = Read-ServerUrlFromUser
}

if ($serverUrl.Length -eq 0) {
  Write-Host "Не удалось подключить рабочее место."
  Write-Host "Проверьте, что серверный компьютер включён, TemichevVet запущен, и оба компьютера в одной Wi-Fi/локальной сети."
  Write-Host "Если сервер открыт на своём компьютере как http://127.0.0.1:3000, на другом компьютере нужен его сетевой IP, например http://192.168.1.15:3000."
  exit 1
}

Save-ServerUrl $serverUrl
New-WorkstationLauncherScript
New-WorkstationCommand

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = [Environment]::GetFolderPath("Programs")
$startMenuDir = Join-Path $startMenu "TemichevVet"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

try {
  New-Shortcut (Join-Path $desktop "TemichevVet.lnk")
  New-Shortcut (Join-Path $startMenuDir "TemichevVet.lnk")
} catch {
  Write-Host "Не удалось создать обычный .lnk ярлык. Создан .cmd запускатель."
}

Copy-Item -Force -Path $CommandLauncher -Destination (Join-Path $desktop "TemichevVet.cmd")
Copy-Item -Force -Path $CommandLauncher -Destination (Join-Path $startMenuDir "TemichevVet.cmd")

Write-Host "Рабочее место TemichevVet подключено."
Write-Host "Адрес сервера: $serverUrl"
Write-Host "Ярлык создан на рабочем столе и в меню Пуск."

Start-Process "$serverUrl/login"
