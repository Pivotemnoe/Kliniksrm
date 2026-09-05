$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$root = 'C:\Users\TemichevVet\TemichevVet'
$backup = Join-Path $root 'backups\manual-releases\clinic-site-20260905-b0e182f'
$version = 'b0e182fe3e2a1fe0461e920a27d5f2d50311bdc0'
$envFile = Join-Path $root '.env'
$composeFile = Join-Path $root 'docker-compose.yml'
$selection = 'C:\Users\TemichevVet\publish-services.sql'
if ((Get-FileHash $selection -Algorithm SHA256).Hash -ne 'AD3E041BEDDFB605D9AA4C28625E31D56632D1CA794EADEA1A3598F63A1A301F') { throw 'Publication list hash mismatch' }
if (-not (Test-Path (Join-Path $backup 'database.dump'))) { throw 'Backup missing' }
$before = Get-Content (Join-Path $backup 'containers-before.json') -Raw | ConvertFrom-Json
foreach ($component in @('api','web')) {
  $info = docker image inspect "ghcr.io/pivotemnoe/kliniksrm-${component}:$version" | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $info.Architecture -ne 'amd64' -or $info.Config.Labels.'org.opencontainers.image.revision' -ne $version) { throw "Image not verified: $component" }
}
function Put-EnvValue([string]$key,[string]$value) {
  $text=[IO.File]::ReadAllText($envFile)
  $pattern='(?m)^'+[regex]::Escape($key)+'=.*$'
  if ([regex]::IsMatch($text,$pattern)) { $text=[regex]::Replace($text,$pattern,"$key=$value") } else { $text=$text.TrimEnd()+"`r`n$key=$value`r`n" }
  [IO.File]::WriteAllText($envFile,$text,(New-Object System.Text.UTF8Encoding($false)))
}
$compose = [IO.File]::ReadAllText($composeFile)
if (-not $compose.Contains('CLINIC_SITE_CATALOG_SYNC_ENABLED')) {
  $anchor='(?m)^(\s+)OWNER_GATEWAY_BOOKING_SYNC_INTERVAL_MS:[^\r\n]*'
  if ([regex]::Matches($compose,$anchor).Count -ne 1) { throw 'Compose anchor ambiguous' }
  $compose=[regex]::Replace($compose,$anchor,{param($m) $m.Value+"`r`n"+$m.Groups[1].Value+'CLINIC_SITE_CATALOG_SYNC_ENABLED: ${CLINIC_SITE_CATALOG_SYNC_ENABLED:-false}'})
  [IO.File]::WriteAllText($composeFile,$compose,(New-Object System.Text.UTF8Encoding($false)))
}
Set-Location $root
try {
  Put-EnvValue 'TEMICHEVVET_API_IMAGE' "ghcr.io/pivotemnoe/kliniksrm-api:$version"
  Put-EnvValue 'TEMICHEVVET_WEB_IMAGE' "ghcr.io/pivotemnoe/kliniksrm-web:$version"
  Put-EnvValue 'CRM_SOURCE_VERSION' $version
  Put-EnvValue 'CLINIC_SITE_CATALOG_SYNC_ENABLED' 'false'
  docker compose config --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Compose validation failed' }
  docker compose run --rm --no-deps --entrypoint sh api -c 'npm --workspace @clinic-crm/api run db:deploy'
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
  $pg=docker inspect clinic-crm-postgres | ConvertFrom-Json
  $dbUser=($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=',''
  $dbName=($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=',''
  Get-Content $selection -Raw -Encoding UTF8 | docker exec -i clinic-crm-postgres psql -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
  if ($LASTEXITCODE -ne 0) { throw 'Approved catalog publication failed' }
  Put-EnvValue 'CLINIC_SITE_CATALOG_SYNC_ENABLED' 'true'
  docker compose up -d --no-deps api web
  if ($LASTEXITCODE -ne 0) { throw 'Application update failed' }
  $healthy=$false
  for ($i=0;$i -lt 30;$i++) {
    try { $health=Invoke-WebRequest 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 5; if ($health.StatusCode -eq 200) { $healthy=$true;break } } catch {}
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) { throw 'API health did not recover' }
  $after=docker inspect clinic-crm-api clinic-crm-web clinic-crm-postgres clinic-crm-redis clinic-crm-minio clinic-crm-backup | ConvertFrom-Json
  foreach ($name in @('/clinic-crm-postgres','/clinic-crm-redis','/clinic-crm-minio','/clinic-crm-backup')) {
    $old=$before | Where-Object name -eq $name
    $new=$after | Where-Object Name -eq $name
    if ($old.id -ne $new.Id -or $old.started -ne $new.State.StartedAt) { throw "Stateful container changed: $name" }
  }
  $after | ForEach-Object { [PSCustomObject]@{ name=$_.Name;id=$_.Id;image=$_.Config.Image;started=$_.State.StartedAt } } | ConvertTo-Json | Set-Content (Join-Path $backup 'containers-after.json') -Encoding UTF8
  Write-Output 'API health 200; PostgreSQL, Redis, MinIO and backup container IDs/start times preserved.'
  Write-Output $health.Content
} catch {
  Copy-Item (Join-Path $backup 'previous.env') $envFile -Force
  Copy-Item (Join-Path $backup 'previous-compose.yml') $composeFile -Force
  docker compose up -d --no-deps api web
  throw
}
