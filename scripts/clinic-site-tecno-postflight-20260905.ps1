$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
$version='b0e182fe3e2a1fe0461e920a27d5f2d50311bdc0'
$containers=docker inspect clinic-crm-api clinic-crm-web clinic-crm-postgres clinic-crm-redis clinic-crm-minio clinic-crm-backup | ConvertFrom-Json
foreach($part in @('api','web')) {
  $c=$containers | Where-Object Name -eq "/clinic-crm-$part"
  if($c.Config.Image -ne "ghcr.io/pivotemnoe/kliniksrm-${part}:$version") {throw 'Unexpected deployed image'}
  Write-Output "$($c.Name) $($c.Config.Image) $($c.State.Status)"
}
$api=$containers | Where-Object Name -eq '/clinic-crm-api'
if($api.Config.Env -notcontains 'CLINIC_SITE_CATALOG_SYNC_ENABLED=true') {throw 'Catalog export disabled'}
$old=Get-Content 'C:\Users\TemichevVet\TemichevVet\backups\manual-releases\clinic-site-20260905-b0e182f\containers-before.json' -Raw | ConvertFrom-Json
foreach($name in @('/clinic-crm-postgres','/clinic-crm-redis','/clinic-crm-minio','/clinic-crm-backup')) {
  $before=$old | Where-Object name -eq $name
  $after=$containers | Where-Object Name -eq $name
  if($before.id -ne $after.Id -or $before.started -ne $after.State.StartedAt) {throw "Stateful service changed: $name"}
}
$health=Invoke-WebRequest 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 10
Write-Output $health.Content
Write-Output 'Catalog export enabled; all stateful services unchanged.'
