[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$PostgresContainer='clinic-crm-postgres',
  [string]$FilesContainer='clinic-crm-minio',
  [string]$FilesPath='/data',
  [string[]]$ProtectedContainers=@('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup'),
  [switch]$Execute
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
function Invoke-Docker([string[]]$Arguments) {
  $savedPreference=$ErrorActionPreference
  try {
    $ErrorActionPreference='Continue'
    $result=& docker @Arguments 2>&1 | Out-String
    $exitCode=$LASTEXITCODE
  } finally { $ErrorActionPreference=$savedPreference }
  if ($exitCode -ne 0) { throw "Docker $($Arguments[0]) failed: $result" }
  return $result
}
function Read-Container([string]$Name) { return @(ConvertFrom-Json (Invoke-Docker -Arguments @('inspect',$Name)))[0] }
function Get-Hash([string]$Name) { return (Get-FileHash -LiteralPath $Name -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-Identities { return @($ProtectedContainers | ForEach-Object { $c=Read-Container $_; [PSCustomObject]@{name=$_;id=$c.Id;image=$c.Image;started=$c.State.StartedAt} }) }
function File-Tree([string]$Directory) {
  return @(Get-ChildItem -LiteralPath $Directory -Force -File -Recurse | ForEach-Object { $_.FullName.Substring($Directory.Length).Replace('\','/')+' '+(Get-Hash $_.FullName) } | Sort-Object)
}
$postgres=Read-Container $PostgresContainer
$null=Read-Container $FilesContainer
$identities=Read-Identities
$dbUser=@($postgres.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' })[0].Substring(14)
$dbName=@($postgres.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' })[0].Substring(12)
if (-not $dbUser -or -not $dbName) { throw 'Explicit POSTGRES_USER and POSTGRES_DB are required' }
if (-not $Execute) { Write-Output 'READ_ONLY: backup sources inspected; no files or containers created. Add -Execute only for the authorized backup rehearsal.'; return }
if (Test-Path -LiteralPath $BackupPath) { throw 'Backup directory must be new; previous evidence is never overwritten' }
$null=New-Item -ItemType Directory -Path $BackupPath
$BackupPath=(Resolve-Path -LiteralPath $BackupPath).Path
$suffix=[Guid]::NewGuid().ToString('N')
$dumpPath='/tmp/crm-redesign-'+$suffix+'.dump'
$temporary='crm-redesign-restore-'+$suffix.Substring(0,12)
$started=$false
try {
  $null=Invoke-Docker -Arguments @('exec',$PostgresContainer,'pg_dump','-U',$dbUser,'-d',$dbName,'-Fc','--file',$dumpPath)
  $null=Invoke-Docker -Arguments @('cp',($PostgresContainer+':'+$dumpPath),(Join-Path $BackupPath 'database.dump'))
  $null=Invoke-Docker -Arguments @('cp',($FilesContainer+':'+$FilesPath),(Join-Path $BackupPath 'files'))
  $tar=if ($env:OS -eq 'Windows_NT') { 'tar.exe' } else { 'tar' }
  & $tar -czf (Join-Path $BackupPath 'files.tar.gz') -C (Join-Path $BackupPath 'files') .
  if ($LASTEXITCODE -ne 0) { throw 'File archive creation failed' }
  $restored=Join-Path $BackupPath 'files-restored'
  $null=New-Item -ItemType Directory -Path $restored
  & $tar -xzf (Join-Path $BackupPath 'files.tar.gz') -C $restored
  if ($LASTEXITCODE -ne 0) { throw 'File archive restoration failed' }
  $beforeFiles=[string]::Join("`n",@(File-Tree (Join-Path $BackupPath 'files')))
  $afterFiles=[string]::Join("`n",@(File-Tree $restored))
  if ($beforeFiles -ne $afterFiles) { throw 'Restored file bytes differ' }
  $null=Invoke-Docker -Arguments @('run','-d','--pull','never','--network','none','--name',$temporary,'--label','io.temichevvet.redesign-restore=true','-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',$postgres.Image)
  $started=$true
  $ready=$false
  for($i=0;$i -lt 60;$i++) {
    & docker exec $temporary pg_isready -h 127.0.0.1 -U restore_test -d restore_test *> $null
    if($LASTEXITCODE -eq 0) { $ready=$true; break }
    Start-Sleep -Milliseconds 500
  }
  if(-not $ready) { throw 'Isolated restoration database did not become ready' }
  $null=Invoke-Docker -Arguments @('cp',(Join-Path $BackupPath 'database.dump'),($temporary+':/tmp/database.dump'))
  $null=Invoke-Docker -Arguments @('exec',$temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump')
  $query='SELECT (SELECT count(*) FROM "Owner"), (SELECT count(*) FROM "Animal"), (SELECT count(*) FROM "Visit"), (SELECT count(*) FROM "Bill"), (SELECT count(*) FROM "Payment");'
  # stdin also preserves SQL identifier quotes with Windows PowerShell 5.1.
  $counts=($query | & docker exec -i $temporary psql -U restore_test -d restore_test -v ON_ERROR_STOP=1 -tA 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Restored database verification query failed' }
  foreach($item in $identities) { $current=Read-Container $item.name; if($current.Id -ne $item.id -or $current.Image -ne $item.image -or $current.State.StartedAt -ne $item.started) { throw "Protected service changed: $($item.name)" } }
  $receipt=[PSCustomObject]@{
    capturedAt=[DateTime]::UtcNow.ToString('o');verified=$true;restoreTested=$true;recordCounts=$counts;protected=$identities
    database=[PSCustomObject]@{name='database.dump';sha256=Get-Hash (Join-Path $BackupPath 'database.dump')}
    files=[PSCustomObject]@{name='files.tar.gz';sha256=Get-Hash (Join-Path $BackupPath 'files.tar.gz')}
    consistency='PostgreSQL transaction snapshot; separate object-storage copy, not an atomic cross-service snapshot'
  }
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $BackupPath 'verified-backup.json') -Encoding UTF8
  Write-Output 'BACKUP_OK: database restored in a disposable network-isolated container; restored file hashes matched; protected services unchanged.'
} finally {
  if($started) { $null=Invoke-Docker -Arguments @('rm','-f','-v',$temporary) }
  $null=Invoke-Docker -Arguments @('exec',$PostgresContainer,'rm','-f',$dumpPath)
}
