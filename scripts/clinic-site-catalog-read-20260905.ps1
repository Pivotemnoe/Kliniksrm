$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
$pg = docker inspect clinic-crm-postgres | ConvertFrom-Json
$dbUser = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' }) -replace '^POSTGRES_USER=', ''
$dbName = ($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' }) -replace '^POSTGRES_DB=', ''
$sql = @'
SELECT json_agg(row_to_json(p)) FROM (SELECT s.id,s.title,coalesce(c.title,'') AS category,s.price,s."priceType",s."minimumPrice",s."maximumPrice" FROM "Service" s LEFT JOIN "ServiceCategory" c ON c.id=s."categoryId" WHERE s."isActive" ORDER BY c.title NULLS LAST,s.title) p;
'@
$sql | docker exec -i clinic-crm-postgres psql -X -At -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
if ($LASTEXITCODE -ne 0) { throw 'Catalog read failed' }
