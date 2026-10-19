[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root='C:\Users\TemichevVet\TemichevVet'
$backup=Join-Path $root 'backups\manual-releases\crm-redesign-20261019-r3'
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$statePath=Join-Path $backup 'redesign-state.json'
$state=Get-Content $statePath -Raw|ConvertFrom-Json
$web=docker inspect clinic-crm-web|ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or $web.Image -ne $state.previousId -or $web.Config.Image -ne $state.previousImage){throw 'Previous Web must already be restored'}
foreach($p in $state.protected){
  $c=docker inspect $p.name|ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or $c.Id -ne $p.id -or $c.Image -ne $p.image -or $c.State.StartedAt -ne $p.started){throw 'Protected service identity changed'}
}
foreach($f in $state.envFiles){
  $live=(Get-FileHash (Join-Path $root $f.name) -Algorithm SHA256).Hash
  $saved=(Get-FileHash (Join-Path $backup $f.savedName) -Algorithm SHA256).Hash
  if($live -ne $saved){throw 'Original configuration must already be restored exactly'}
}
$health=Invoke-RestMethod http://127.0.0.1:3000/api/health -TimeoutSec 10
if($health.status -ne 'ok' -or $health.database -ne 'ok'){throw 'Restored service is not healthy'}
$attempt=Join-Path $backup 'attempt-1'
if(Test-Path $attempt){throw 'Previous attempt evidence must not be overwritten'}
$null=New-Item -ItemType Directory -Path $attempt
foreach($f in $state.envFiles){Copy-Item -LiteralPath (Join-Path $backup $f.savedName) -Destination (Join-Path $attempt $f.savedName)}
Move-Item -LiteralPath $statePath -Destination (Join-Path $attempt 'redesign-state.json')
Write-Output 'RETRY_READY: restored Web and exact original configuration verified; failed attempt evidence retained.'
