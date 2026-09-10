param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$ExpectedHost,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedRevision
)
$ErrorActionPreference='Stop'
if ($env:COMPUTERNAME -ne $ExpectedHost) { throw 'Wrong target host' }
$Root=(Resolve-Path -LiteralPath $Root).Path
if (!(Test-Path (Join-Path $Root 'docker-compose.yml'))) { throw 'CRM directory required' }
Set-Location $Root
$docker=(Get-Command docker.exe -ErrorAction Stop).Source
$dockerHost=(docker context inspect --format '{{.Endpoints.docker.Host}}').Trim()
if ($LASTEXITCODE -ne 0 -or $dockerHost -notmatch '^npipe://') { throw 'A local Docker named pipe is required' }
foreach ($name in @('api','web')) {
  $info=docker inspect "clinic-crm-$name" | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or !$info.State.Running -or $info.Config.Labels.'org.opencontainers.image.revision' -ne $ExpectedRevision) { throw "Unverified running revision: $name" }
}
$compose=docker compose config --format json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Compose inspection failed' }
$backupDirectory=($compose.services.api.volumes | Where-Object target -eq '/backups').source
if (!$backupDirectory -or !(Test-Path -LiteralPath $backupDirectory)) { throw 'Backup directory not available on host' }
$directory=Join-Path $Root 'diagnostics'
$bin=Join-Path $directory 'bin'
[void][IO.Directory]::CreateDirectory($bin)
# Elevated scheduler code/config may only be changed by SYSTEM or administrators.
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach ($sid in @('S-1-5-18','S-1-5-32-544')) {
  $identity=New-Object Security.Principal.SecurityIdentifier($sid)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
}
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $bin -AclObject $acl
foreach ($name in @('system-diagnostics.ps1','system-diagnostics-notify.cjs')) {
  $source=Join-Path $PSScriptRoot $name
  if (!(Test-Path -LiteralPath $source)) { throw "Missing source: $name" }
  $encoding=New-Object Text.UTF8Encoding($name.EndsWith('.ps1'))
  [IO.File]::WriteAllText((Join-Path $bin $name),[IO.File]::ReadAllText($source),$encoding)
}
$configPath=Join-Path $bin 'system-diagnostics-config.json'
if (Test-Path $configPath) { Copy-Item -LiteralPath $configPath -Destination (Join-Path $directory "baseline-before-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss')).json") }
$config=@{schemaVersion=1;root=$Root;expectedHost=$ExpectedHost;expectedRevision=$ExpectedRevision;backupDirectory=$backupDirectory;dockerPath=$docker;dockerHost=$dockerHost;baseUrl='http://127.0.0.1:3000'}
[IO.File]::WriteAllText($configPath,($config | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
if (![Diagnostics.EventLog]::SourceExists('TemichevVet Diagnostics')) { New-EventLog -LogName Application -Source 'TemichevVet Diagnostics' }
$name='TemichevVet Daily Diagnostics'
$existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Description -ne 'TemichevVet daily read-only diagnostics v1') { throw 'Refusing to replace an unrelated scheduled task' }
  Export-ScheduledTask -TaskName $name | Set-Content (Join-Path $directory "task-before-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss')).xml")
}
$script=Join-Path $bin 'system-diagnostics.ps1'
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`" -ConfigPath `"$configPath`"" -WorkingDirectory $Root
$trigger=New-ScheduledTaskTrigger -Daily -At '08:00'
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'TemichevVet daily read-only diagnostics v1' -Force | Out-Null
Write-Output "INSTALLED: $name; daily 08:00; timezone=$((Get-TimeZone).Id); baseline=$ExpectedRevision"
