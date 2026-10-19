[CmdletBinding()]
param([ValidateSet('Inspect','Apply','Rollback')][string]$Mode='Inspect')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong clinic host'}
$root='C:\Users\TemichevVet\TemichevVet'
$backup=Join-Path $root 'backups\manual-releases\crm-redesign-20261019-r3'
$checks=Get-Content (Join-Path $PSScriptRoot 'checksums.json') -Raw|ConvertFrom-Json
foreach($item in $checks.files){
  if($item.name -notmatch '^[a-zA-Z0-9._-]+$'){throw 'Unexpected package path'}
  if((Get-FileHash (Join-Path $PSScriptRoot $item.name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw "Package hash mismatch: $($item.name)"}
}
if($Mode -eq 'Apply'){& (Join-Path $PSScriptRoot 'verify-backup-files.ps1') -BackupPath $backup}
& (Join-Path $PSScriptRoot 'release-web.ps1') -Mode $Mode -Root $root -PackageRoot $PSScriptRoot -BackupPath $backup -Execute:($Mode -ne 'Inspect')
if($Mode -eq 'Apply'){
  $names=@('clinic-crm-web','clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')
  $containers=docker inspect @names|ConvertFrom-Json
  if($LASTEXITCODE -ne 0){throw 'Post-release container verification failed'}
  $identities=@($containers|ForEach-Object{[PSCustomObject]@{name=$_.Name;id=$_.Id;image=$_.Image;reference=$_.Config.Image;revision=$_.Config.Labels.'org.opencontainers.image.revision';started=$_.State.StartedAt;restarts=$_.RestartCount;status=$_.State.Status}})
  $health=Invoke-RestMethod http://127.0.0.1:3000/api/health -TimeoutSec 10
  $release=Invoke-RestMethod http://127.0.0.1:3000/release.json -TimeoutSec 10
  $result=[PSCustomObject]@{at=[DateTime]::UtcNow.ToString('o');host=$env:COMPUTERNAME;release=$release;health=$health;containers=$identities;backupPath=$backup;mode='Web only; no migrations or API/data service restart'}
  $result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $backup 'deployment-receipt.json') -Encoding UTF8
  Write-Output 'RECEIPT_SAVED: verified Web-only deployment.'
}
