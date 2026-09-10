param([string]$ConfigPath = (Join-Path $PSScriptRoot 'system-diagnostics-config.json'), [switch]$LibraryOnly, [switch]$NoNotify)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

function Invoke-DiagnosticTool([string]$File, [string]$Arguments, [string]$Directory, [string]$InputText = '', [int]$TimeoutSeconds = 30) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$File; $start.Arguments=$Arguments; $start.WorkingDirectory=$Directory
  $start.UseShellExecute=$false; $start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true; $start.RedirectStandardInput=$true
  $start.StandardOutputEncoding=[Text.Encoding]::UTF8; $start.StandardErrorEncoding=[Text.Encoding]::UTF8
  $process=New-Object Diagnostics.Process
  $process.StartInfo=$start
  try {
    [void]$process.Start()
    $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
    if ($InputText) { $process.StandardInput.WriteLine($InputText) }
    $process.StandardInput.Close()
    if (!$process.WaitForExit($TimeoutSeconds * 1000)) { $process.Kill(); throw 'Command timed out' }
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'Command failed' }
    return $stdout.Result
  } finally { $process.Dispose() }
}

function Read-DiagnosticJson([string]$Path) {
  if ((Get-Item $Path).Length -gt 1048576) { throw 'Report too large' }
  return [IO.File]::ReadAllText($Path) | ConvertFrom-Json
}

function Write-DiagnosticJson([string]$Path, $Value) {
  $temporary="$Path.tmp"
  [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Get-DiagnosticIssues($Snapshot, $Config, [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow) {
  $issues = New-Object Collections.Generic.List[object]
  function Add-Issue($Code, $Message) { $issues.Add([PSCustomObject]@{code=$Code;message=$Message}) }
  if (!$Snapshot.docker) { Add-Issue 'docker' 'Docker недоступен: состояние контейнеров не проверено.' }
  foreach ($name in @('api','web','postgres','redis','minio','backup')) {
    $container=$Snapshot.containers.$name
    if (!$container -or !$container.running -or ($container.health -and $container.health -ne 'healthy')) {
      Add-Issue "container.$name" "Контейнер $name не работает или не прошёл проверку здоровья."
    }
  }
  foreach ($name in @('api','web')) {
    $container=$Snapshot.containers.$name
    if (!$container -or $container.revision -ne $Config.expectedRevision -or $container.image -ne "ghcr.io/pivotemnoe/kliniksrm-${name}:$($Config.expectedRevision)") {
      Add-Issue "version.$name" "Версия $name отличается от подтверждённой версии $($Config.expectedRevision.Substring(0,7))."
    }
    if ($Snapshot.resolved.$name -ne "ghcr.io/pivotemnoe/kliniksrm-${name}:$($Config.expectedRevision)") {
      Add-Issue "launch.$name" "Настройки запуска $name указывают не на подтверждённую версию."
    }
    if ($Snapshot.remote.$name -ne "ghcr.io/pivotemnoe/kliniksrm-${name}:$($Config.expectedRevision)") {
      Add-Issue "update.$name" "Автообновление $name указывает не на подтверждённую версию."
    }
  }
  if (!$Snapshot.apiHealth) { Add-Issue 'api' 'API или проверка соединения с базой данных недоступны.' }
  if (!$Snapshot.webHealth) { Add-Issue 'web' 'Главная страница CRM недоступна.' }
  if ($null -eq $Snapshot.freeBytes -or $Snapshot.freeBytes -lt 20GB) { Add-Issue 'disk' 'На системном диске меньше 20 ГБ либо свободное место не удалось проверить.' }
  $backup=$Snapshot.backup
  if (!$backup) { Add-Issue 'backup.status' 'Не удалось прочитать отчёт резервного копирования.' }
  else {
    if ($backup.state -eq 'failed') { Add-Issue 'backup.failed' 'Последнее резервное копирование завершилось ошибкой.' }
    foreach ($rule in @(@('lastDatabaseBackupAt',36,'базы'),@('lastFilesBackupAt',192,'файлов'),@('lastIntegrityCheckAt',48,'проверки целостности'))) {
      $date=[DateTimeOffset]::MinValue
      if (![DateTimeOffset]::TryParse([string]$backup.($rule[0]),[ref]$date) -or ($Now-$date).TotalHours -gt $rule[1] -or ($Now-$date).TotalMinutes -lt -15) {
        Add-Issue "backup.$($rule[0])" "Нет актуальной отметки резервного копирования/проверки: $($rule[2])."
      }
    }
    if (!$Snapshot.databaseArchivePresent) { Add-Issue 'backup.databaseArchive' 'Файл последней резервной копии базы отсутствует или пуст.' }
    if (!$Snapshot.filesArchivePresent) { Add-Issue 'backup.filesArchive' 'Файл последней резервной копии документов отсутствует или пуст.' }
    if ($null -eq $backup.freeBytes -or $backup.freeBytes -lt 20GB) { Add-Issue 'backup.disk' 'Мало свободного места на диске резервных копий либо его не удалось проверить.' }
    if ($backup.lastRestoreTestState -eq 'failed') { Add-Issue 'backup.restore' 'Последняя проверка восстановления резервной копии не пройдена.' }
  }
  return @($issues.ToArray() | Sort-Object code)
}

function Test-DiagnosticArchive($Directory, $Name) {
  if (!$Name -or [IO.Path]::GetFileName($Name) -ne $Name -or $Name -match '\.\.') { return $false }
  $file=Join-Path $Directory $Name
  return (Test-Path -LiteralPath $file -PathType Leaf) -and (Get-Item -LiteralPath $file).Length -gt 0
}

if ($LibraryOnly) { return }
$config=Read-DiagnosticJson $ConfigPath
if ($env:COMPUTERNAME -ne $config.expectedHost -or $config.expectedRevision -notmatch '^[a-f0-9]{40}$') { throw 'Wrong host or invalid baseline' }
$directory=Join-Path $config.root 'diagnostics'
[void][IO.Directory]::CreateDirectory($directory)
$lock=$null
try {
  try { $lock=[IO.File]::Open((Join-Path $directory 'run.lock'),'OpenOrCreate','ReadWrite','None') } catch { exit 0 }
  $snapshot=[ordered]@{docker=$false;containers=@{};resolved=@{};remote=@{};apiHealth=$false;webHealth=$false;freeBytes=$null;backup=$null;databaseArchivePresent=$false;filesArchivePresent=$false}
  $docker=(Get-Command docker.exe -ErrorAction SilentlyContinue).Source
  if (!$docker -and (Test-Path -LiteralPath $config.dockerPath)) { $docker=$config.dockerPath }
  if ($docker) {
    try {
      $containers=Invoke-DiagnosticTool $docker 'inspect clinic-crm-api clinic-crm-web clinic-crm-postgres clinic-crm-redis clinic-crm-minio clinic-crm-backup' $config.root | ConvertFrom-Json
      $snapshot.docker=$true
      foreach ($container in $containers) {
        $name=$container.Name -replace '^/clinic-crm-',''
        $snapshot.containers[$name]=@{running=$container.State.Running;health=$container.State.Health.Status;image=$container.Config.Image;revision=$container.Config.Labels.'org.opencontainers.image.revision'}
      }
    } catch {}
    try {
      $compose=Invoke-DiagnosticTool $docker 'compose config --format json' $config.root | ConvertFrom-Json
      $snapshot.resolved=@{api=$compose.services.api.image;web=$compose.services.web.image}
    } catch {}
  }
  try {
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $config.root '.env'))) {
      if ($line -match '^TEMICHEVVET_REMOTE_(API|WEB)_IMAGE=(.*)$') { $snapshot.remote[$Matches[1].ToLowerInvariant()]=$Matches[2].Trim() }
    }
  } catch {}
  try { $reply=Invoke-WebRequest "$($config.baseUrl)/api/health" -UseBasicParsing -TimeoutSec 8; $health=$reply.Content | ConvertFrom-Json; $snapshot.apiHealth=($reply.StatusCode -eq 200 -and $health.database -eq 'ok') } catch {}
  try { $reply=Invoke-WebRequest "$($config.baseUrl)/" -UseBasicParsing -TimeoutSec 8; $snapshot.webHealth=($reply.StatusCode -eq 200 -and $reply.Content -match '<div id="root">') } catch {}
  try { $snapshot.freeBytes=(New-Object IO.DriveInfo([IO.Path]::GetPathRoot($config.root))).AvailableFreeSpace } catch {}
  try {
    $snapshot.backup=Read-DiagnosticJson (Join-Path $config.backupDirectory 'status.json')
    $snapshot.databaseArchivePresent=Test-DiagnosticArchive $config.backupDirectory $snapshot.backup.databaseArchive
    $snapshot.filesArchivePresent=Test-DiagnosticArchive $config.backupDirectory $snapshot.backup.filesArchive
  } catch {}
  $issues=@(Get-DiagnosticIssues ([PSCustomObject]$snapshot) $config)
  $fingerprint=($issues.code -join '|')
  $previous=$null
  try { $previous=Read-DiagnosticJson (Join-Path $directory 'latest.json') } catch {}
  $event=$previous.event
  if (!$previous -or $previous.fingerprint -ne $fingerprint) {
    $event=$null
    if ($issues.Count -gt 0 -or ($previous -and $previous.issues.Count -gt 0)) {
      $event=[PSCustomObject]@{id=[Guid]::NewGuid().ToString();published=$false;recovery=($issues.Count -eq 0);previousIssues=@($previous.issues);at=[DateTimeOffset]::UtcNow.ToString('o')}
    }
  }
  $report=[PSCustomObject]@{checkedAt=[DateTimeOffset]::UtcNow.ToString('o');expectedRevision=$config.expectedRevision;state=$(if($issues.Count){'warning'}else{'ok'});fingerprint=$fingerprint;issues=$issues;snapshot=$snapshot;event=$event}
  # Persist first, so API/Docker outages never discard the pending director notification.
  Write-DiagnosticJson (Join-Path $directory 'latest.json') $report
  if ($event -and !$event.published -and !$NoNotify -and $docker) {
    try {
      $publisher=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'system-diagnostics-notify.cjs'))
      $publisherEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($publisher))
      $payload=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($report | ConvertTo-Json -Depth 12 -Compress)))
      $code="const diagnosticPayload = JSON.parse(Buffer.from('$payload','base64').toString('utf8')); eval(Buffer.from('$publisherEncoded','base64').toString('utf8'));"
      $null=Invoke-DiagnosticTool $docker 'exec -i -w /app clinic-crm-api node' $config.root $code 45
      $report.event.published=$true
      Write-DiagnosticJson (Join-Path $directory 'latest.json') $report
    } catch { $report | Add-Member -NotePropertyName deliveryPending -NotePropertyValue $true; Write-DiagnosticJson (Join-Path $directory 'latest.json') $report }
  }
  [void][IO.Directory]::CreateDirectory((Join-Path $directory 'checks'))
  Write-DiagnosticJson (Join-Path $directory "checks\$([DateTime]::Now.ToString('yyyy-MM-dd')).json") $report
  $summary="CRM diagnostics: $($report.state); issues=$($issues.Count); checked=$($report.checkedAt); notificationPending=$([bool]($event -and !$event.published))"
  try { Write-EventLog -LogName Application -Source 'TemichevVet Diagnostics' -EventId $(if($issues.Count){1001}else{1000}) -EntryType $(if($issues.Count){'Warning'}else{'Information'}) -Message $summary } catch {}
  Write-Output $summary
  if ($issues.Count -or ($event -and !$event.published)) { exit 1 }
} finally { if ($lock) { $lock.Dispose() } }
