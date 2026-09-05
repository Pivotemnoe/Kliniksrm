$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$root = 'C:\Users\TemichevVet\TemichevVet'
$backup = Join-Path $root 'backups\manual-releases\clinic-site-20260905-b0e182f'
if (Test-Path $backup) { throw 'Backup already exists; inspect before retrying' }
New-Item -ItemType Directory -Path $backup | Out-Null
$before = docker inspect clinic-crm-api clinic-crm-web clinic-crm-postgres clinic-crm-redis clinic-crm-minio clinic-crm-backup | ConvertFrom-Json
$before | ForEach-Object { [PSCustomObject]@{name=$_.Name;id=$_.Id;image=$_.Config.Image;started=$_.State.StartedAt} } | ConvertTo-Json | Set-Content (Join-Path $backup 'containers-before.json') -Encoding UTF8
Copy-Item (Join-Path $root '.env') (Join-Path $backup 'previous.env')
Copy-Item (Join-Path $root 'docker-compose.yml') (Join-Path $backup 'previous-compose.yml')
$pg = $before | Where-Object Name -eq '/clinic-crm-postgres'
$dbUser = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''
$dbName = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''
docker exec clinic-crm-postgres pg_dump -U $dbUser -d $dbName -Fc -f /tmp/clinic-site-20260905-b0e182f.dump
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed' }
docker exec clinic-crm-postgres pg_restore -l /tmp/clinic-site-20260905-b0e182f.dump | Set-Content (Join-Path $backup 'database-toc.txt') -Encoding UTF8
if ($LASTEXITCODE -ne 0) { throw 'Database backup TOC failed' }
docker cp clinic-crm-postgres:/tmp/clinic-site-20260905-b0e182f.dump (Join-Path $backup 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed' }
$dump = Get-Item (Join-Path $backup 'database.dump')
if ($dump.Length -lt 1000000) { throw 'Unexpected backup size' }
Get-FileHash $dump.FullName -Algorithm SHA256 | Select-Object Path,Hash | ConvertTo-Json
Write-Output "Backup bytes: $($dump.Length)"
$compose = [IO.File]::ReadAllText((Join-Path $root 'docker-compose.yml'))
Write-Output "Gateway sync anchor count: $([regex]::Matches($compose, '(?m)^\s+OWNER_GATEWAY_BOOKING_SYNC_INTERVAL_MS:').Count)"
Write-Output "Existing public catalog flag: $($compose.Contains('CLINIC_SITE_CATALOG_SYNC_ENABLED'))"
