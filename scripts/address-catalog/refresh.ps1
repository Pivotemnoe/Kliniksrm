param([switch]$UsePreparedData)
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\TemichevVet\TemichevVet'
if ($env:COMPUTERNAME -ne 'WIN-I123AM83GR4') { throw 'Wrong clinic host' }
$mutex = New-Object System.Threading.Mutex($false, 'Global\TemichevVetAddressCatalogRefresh')
if (-not $mutex.WaitOne(0)) { throw 'Address refresh already running' }
$data = Join-Path $root 'address-catalog'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$log = Join-Path $data ('refresh-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $log | Out-Null
try {
  if (-not $UsePreparedData) {
    if ((Get-PSDrive C).Free -lt 12GB) { throw 'Insufficient space for GAR refresh' }
    docker run --rm --name clinic-address-refresh --memory 2g --cpus 1 -v "${data}:/data" temichevvet-address-updater:20260929
    if ($LASTEXITCODE -ne 0) { throw 'GAR preparation failed; active catalog preserved' }
  }
  $manifest = Get-Content "$data\ready\manifest.json" -Raw | ConvertFrom-Json
  if ((Get-FileHash "$data\ready\addresses.tsv.gz" -Algorithm SHA256).Hash -ne $manifest.sha256) { throw 'GAR checksum mismatch' }
  $pg = docker inspect clinic-crm-postgres | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Postgres unavailable' }
  $dbUser = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''
  $dbName = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''
  docker cp "$data\ready\addresses.tsv.gz" clinic-crm-postgres:/tmp/crm-addresses.tsv.gz
  if ($LASTEXITCODE -ne 0) { throw 'Data copy failed' }
  docker exec clinic-crm-postgres sh -c 'gzip -dc /tmp/crm-addresses.tsv.gz > /tmp/crm-addresses.tsv'
  if ($LASTEXITCODE -ne 0) { throw 'Data unpack failed' }
  docker cp "$root\scripts\address-catalog\import.sql" clinic-crm-postgres:/tmp/crm-address-import.sql
  if ($LASTEXITCODE -ne 0) { throw 'Importer copy failed' }
  docker exec clinic-crm-postgres psql -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName -f /tmp/crm-address-import.sql
  if ($LASTEXITCODE -ne 0) { throw 'Catalog import failed; inspect staging table and log' }
  Copy-Item "$data\ready\manifest.json" "$data\installed.json" -Force
  # Only reconstructable public GAR staging files; keep installed manifest and previous DB snapshot.
  docker exec clinic-crm-postgres rm -f /tmp/crm-addresses.tsv /tmp/crm-addresses.tsv.gz /tmp/crm-address-import.sql
  if (Test-Path "$data\raw") { Remove-Item "$data\raw" -Recurse -Force }
} finally { Stop-Transcript | Out-Null; $mutex.ReleaseMutex(); $mutex.Dispose() }
