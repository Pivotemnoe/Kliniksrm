[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [Parameter(Mandatory=$true)][string]$MigrationsPath,
  [string]$Root='C:\Users\TemichevVet\TemichevVet'
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4') { throw 'Wrong clinic host' }
function Invoke-PetHotelDocker([string[]]$Arguments) {
  $savedPreference=$ErrorActionPreference
  try { $ErrorActionPreference='Continue'; $result=& docker @Arguments 2>&1 | Out-String; $code=$LASTEXITCODE } finally { $ErrorActionPreference=$savedPreference }
  if($code -ne 0) { throw "Docker $($Arguments[0]) failed: $result" }
  return $result
}
function Container([string]$Name) { return @(ConvertFrom-Json (Invoke-PetHotelDocker -Arguments @('inspect',$Name)))[0] }
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
$names=@('clinic-crm-api','clinic-crm-web','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')
$postgresName='clinic-crm-postgres'
$before=@($names | ForEach-Object { $c=Container $_; [PSCustomObject]@{name=$_;id=$c.Id;image=$c.Image;reference=$c.Config.Image;started=$c.State.StartedAt} })
$pg=Container $postgresName
$dbUser=@($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_USER=*' })[0].Substring(14)
$dbName=@($pg.Config.Env | Where-Object { $_ -like 'POSTGRES_DB=*' })[0].Substring(12)
if(-not $dbUser -or -not $dbName) { throw 'Database identity missing' }
if(Test-Path -LiteralPath $BackupPath) { throw 'Backup must be new; previous evidence is preserved' }
$null=New-Item -ItemType Directory -Path $BackupPath
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $BackupPath /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'Cannot protect backup directory'}
foreach($name in @('.env','.env.runtime','docker-compose.yml','diagnostics/bin/system-diagnostics-config.json','diagnostics/bin/system-diagnostics.ps1')) {
  $path=Join-Path $Root $name
  if(Test-Path -LiteralPath $path) { [IO.File]::WriteAllBytes((Join-Path $BackupPath ('before-'+$name.Replace('/','-'))),[IO.File]::ReadAllBytes($path)) }
}
$suffix=[Guid]::NewGuid().ToString('N')
$temporary='pet-hotel-integrated-restore-'+$suffix.Substring(0,12)
$dump='/tmp/pet-hotel-integrated-'+$suffix+'.dump'
$started=$false
try {
  $null=Invoke-PetHotelDocker -Arguments @('exec',$postgresName,'pg_dump','-U',$dbUser,'-d',$dbName,'-Fc','--file',$dump)
  $null=Invoke-PetHotelDocker -Arguments @('cp',($postgresName+':'+$dump),(Join-Path $BackupPath 'database.dump'))
  $null=Invoke-PetHotelDocker -Arguments @('run','-d','--pull','never','--network','none','--name',$temporary,'--label','io.temichevvet.pet-hotel-integrated-restore=true','-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',$pg.Image)
  $started=$true
  $ready=$false
  for($i=0;$i -lt 60;$i++) { & docker exec $temporary pg_isready -h 127.0.0.1 -U restore_test -d restore_test *> $null; if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 500 }
  if(-not $ready) { throw 'Isolated restoration database did not start' }
  $null=Invoke-PetHotelDocker -Arguments @('cp',(Join-Path $BackupPath 'database.dump'),($temporary+':/tmp/database.dump'))
  $null=Invoke-PetHotelDocker -Arguments @('exec',$temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump')
  $query=Get-Content (Join-Path $MigrationsPath '../../protected-rows.sql') -Raw
  $countsBefore=($query | & docker exec -i $temporary psql -U restore_test -d restore_test -v ON_ERROR_STOP=1 -tA | Out-String).Trim()
  if($LASTEXITCODE -ne 0) { throw 'Restored database check failed' }
  $migrations=@((Get-Content (Join-Path $MigrationsPath '../../release.json') -Raw|ConvertFrom-Json).pendingMigrations)
  foreach($migration in $migrations) {
    $source=Join-Path (Join-Path $MigrationsPath $migration) 'migration.sql'
    if(-not (Test-Path -LiteralPath $source)) { throw "Missing migration: $migration" }
    $target='/tmp/'+$migration+'.sql'
    $null=Invoke-PetHotelDocker -Arguments @('cp',$source,($temporary+':'+$target))
    $null=Invoke-PetHotelDocker -Arguments @('exec',$temporary,'psql','-U','restore_test','-d','restore_test','-v','ON_ERROR_STOP=1','-f',$target)
  }
  $countsAfter=($query | & docker exec -i $temporary psql -U restore_test -d restore_test -v ON_ERROR_STOP=1 -tA | Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $countsBefore -ne $countsAfter) { throw 'Clinical counts changed in migration rehearsal' }
  foreach($item in $before) { $current=Container $item.name; if($current.Id -ne $item.id -or $current.State.StartedAt -ne $item.started) { throw "Service changed during backup: $($item.name)" } }
  # Qualify the candidate against this restored database, without external networking.
  $manifest=Get-Content (Join-Path $MigrationsPath '../../release.json') -Raw | ConvertFrom-Json
  $package=Split-Path (Split-Path $MigrationsPath -Parent) -Parent
  $qaName='pet-hotel-integrated-candidate-'+$suffix.Substring(0,12)
  try {
    $null=Invoke-PetHotelDocker -Arguments @('create','--name',$qaName,'--network',('container:'+$temporary),'-e','DATABASE_URL=postgresql://restore_test:isolated-restore-only@127.0.0.1:5432/restore_test','-e','NODE_ENV=test','-e','TEMICHEVVET_LICENSE_MODE=compatibility','-e',('PET_HOTEL_MODULE_ACTOR_ID='+$manifest.actorId),'--entrypoint','node',$manifest.images.api.reference,'/tmp/qualify.cjs')
    $null=Invoke-PetHotelDocker -Arguments @('cp',(Join-Path $package 'qualify.cjs'),($qaName+':/tmp/qualify.cjs'))
    $null=Invoke-PetHotelDocker -Arguments @('cp',(Join-Path $package 'initialize.cjs'),($qaName+':/tmp/initialize.cjs'))
    $qualified=Invoke-PetHotelDocker -Arguments @('start','-a',$qaName)
    $qa=Container $qaName;if($qa.State.ExitCode -ne 0){throw 'Candidate qualification failed'}
    [IO.File]::WriteAllText((Join-Path $BackupPath 'candidate-qualification.json'),$qualified,(New-Object Text.UTF8Encoding($false)))
  } finally {& docker rm -f -v $qaName *> $null}
  $receipt=[PSCustomObject]@{capturedAt=[DateTime]::UtcNow.ToString('o');verified=$true;restoreTested=$true;hotelMigrationsRehearsed=$true;candidateQualified=$true;clinicalCountsBefore=$countsBefore;clinicalCountsAfter=$countsAfter;protected=$before;database=[PSCustomObject]@{name='database.dump';sha256=Hash (Join-Path $BackupPath 'database.dump')};scope='Database and configuration. Object storage is not modified by this release.'}
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $BackupPath 'verified-backup.json') -Encoding UTF8
  Write-Output 'BACKUP_OK: fresh clinic database restored without network; pet-hotel-integrated migrations rehearsed; clinical counts and production containers preserved.'
} finally {
  if($started) { $null=Invoke-PetHotelDocker -Arguments @('rm','-f','-v',$temporary) }
  $null=Invoke-PetHotelDocker -Arguments @('exec',$postgresName,'rm','-f',$dump)
}
