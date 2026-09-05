$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$containers = docker inspect clinic-crm-api clinic-crm-web clinic-crm-postgres clinic-crm-redis clinic-crm-minio clinic-crm-backup | ConvertFrom-Json
$containers | ForEach-Object { [PSCustomObject]@{ name=$_.Name; id=$_.Id; image=$_.Config.Image; started=$_.State.StartedAt; directory=$_.Config.Labels.'com.docker.compose.project.working_dir'; compose=$_.Config.Labels.'com.docker.compose.project.config_files' } } | ConvertTo-Json -Depth 4
$api = $containers | Where-Object Name -eq '/clinic-crm-api'
$api.Config.Env | Where-Object { $_ -match '^(OWNER_GATEWAY_URL|OWNER_GATEWAY_BOOKING_SYNC_ENABLED|CLINIC_SITE_CATALOG_SYNC_ENABLED|CRM_SOURCE_VERSION|SEED_ON_START|CLINIC_RUNTIME_MODE)=' }
$pg = $containers | Where-Object Name -eq '/clinic-crm-postgres'
$dbUser = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''
$dbName = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''
$sql = @'
SELECT c.title AS category, count(*) AS active_services FROM "Service" s LEFT JOIN "ServiceCategory" c ON c.id=s."categoryId" WHERE s."isActive" GROUP BY c.title ORDER BY c.title;
SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 5;
'@
$sql | docker exec -i clinic-crm-postgres psql -X -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
if ($LASTEXITCODE -ne 0) { throw 'Read-only SQL failed' }
Get-PSDrive C | Select-Object Name,Used,Free | ConvertTo-Json
