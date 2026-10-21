[CmdletBinding()]
param([ValidateSet('Inspect','Prepare','Apply','Rollback','Verify')][string]$Mode='Inspect',
  [string]$Root='C:/Users/TemichevVet/TemichevVet', [string]$PackageRoot=$PSScriptRoot, [switch]$Execute)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $OutputEncoding=[Console]::OutputEncoding
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong clinic host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker'
$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
function Invoke-ReleaseDocker([string[]]$Arguments){$saved=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$text=& docker @Arguments 2>&1|Out-String;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$saved};if($code -ne 0){throw "Docker $($Arguments[0]) failed: $text"};return $text}
function Json([string]$Name){return ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Name))}
function Hash([string]$Name){return (Get-FileHash -LiteralPath $Name -Algorithm SHA256).Hash.ToLowerInvariant()}
function Atomic([string]$Name,[byte[]]$Bytes){$temp=$Name+'.hotel-sync.tmp';$replaced=$Name+'.hotel-sync-replaced.tmp';if((Test-Path -LiteralPath $temp) -or (Test-Path -LiteralPath $replaced)){throw 'Inspect a previous temporary write before retrying'};[IO.File]::WriteAllBytes($temp,$Bytes);if(Test-Path -LiteralPath $Name){[IO.File]::Replace($temp,$Name,$replaced);Remove-Item -LiteralPath $replaced -Force}else{[IO.File]::Move($temp,$Name)}}
function Save([string]$Name,$Value){Atomic $Name ([Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Depth 32)))}
function Container([string]$Name){return (ConvertFrom-Json -InputObject (Invoke-ReleaseDocker @('inspect',$Name)))[0]}
function Image([string]$Name){return (ConvertFrom-Json -InputObject (Invoke-ReleaseDocker @('image','inspect',$Name)))[0]}
function Assert-Protected($Items){foreach($old in $Items){$now=Container $old.name;if($now.Id -ne $old.id -or $now.Image -ne $old.image -or $now.State.StartedAt -ne $old.started -or -not $now.State.Running){throw ('Protected container changed: '+$old.name)}}}
function Assert-Configuration($Items){foreach($f in $Items){if((Hash (Join-Path $Root $f.name)) -ne $f.sha256){throw ('Configuration changed: '+$f.name)}}}
$manifest=Json (Join-Path $PackageRoot 'release.json')
if($manifest.releaseId -ne 'crm-pet-hotel-sync-20261021-r1' -or $manifest.revision -notmatch '^[a-f0-9]{40}$' -or $manifest.sourceHash -ne '6485fbd6df5aa057fe5c03428be97a47367b40d4a00fe11e19bb3ade5799c598'){throw 'Unqualified packet'}
$backup=Join-Path $Root ('backups/manual-releases/'+$manifest.releaseId);$statePath=Join-Path $backup 'api-state.json'
$statusPath=Join-Path $PackageRoot ('status-'+$Mode+'.json')
function Status([string]$Status,[string]$Detail=''){Save $statusPath ([pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');mode=$Mode;status=$Status;revision=$manifest.revision;detail=$Detail})}
function Compose([string]$Image,[string]$Revision,[switch]$Apply){
  $composeArguments=@('compose','--project-directory',$Root,'--project-name',$script:project,'--file',(Join-Path $Root 'docker-compose.yml'),'--env-file',(Join-Path $Root '.env'))
  if(Test-Path (Join-Path $Root '.env.runtime')){$composeArguments+=@('--env-file',(Join-Path $Root '.env.runtime'))}
  $oldImage=[Environment]::GetEnvironmentVariable('TEMICHEVVET_API_IMAGE','Process');$oldRevision=[Environment]::GetEnvironmentVariable('CRM_SOURCE_VERSION','Process')
  try{if($Image){$env:TEMICHEVVET_API_IMAGE=$Image};if($Revision){$env:CRM_SOURCE_VERSION=$Revision};if($Apply){$null=Invoke-ReleaseDocker ($composeArguments+@('up','-d','--no-deps','--no-build','--pull','never','api'));return};return ConvertFrom-Json -InputObject (Invoke-ReleaseDocker ($composeArguments+@('config','--format','json')))}
  finally{[Environment]::SetEnvironmentVariable('TEMICHEVVET_API_IMAGE',$oldImage,'Process');[Environment]::SetEnvironmentVariable('CRM_SOURCE_VERSION',$oldRevision,'Process')}
}
function Assert-Compose($Before,$After){
  if($After.services.api.image -ne $manifest.candidate.reference -or $After.services.api.container_name -ne 'clinic-crm-api' -or [string]$After.services.api.environment.SEED_ON_START -ne 'false'){throw 'Unexpected candidate service or seeding enabled'}
  $copy=ConvertFrom-Json -InputObject ($After|ConvertTo-Json -Depth 64)
  $copy.services.api.image=$Before.services.api.image;$copy.services.api.environment.CRM_SOURCE_VERSION=$Before.services.api.environment.CRM_SOURCE_VERSION
  if(($Before|ConvertTo-Json -Depth 64 -Compress) -ne ($copy|ConvertTo-Json -Depth 64 -Compress)){throw 'Compose changes exceed API image and source revision'}
}
function Wait-Healthy([string]$Id){
  for($i=0;$i -lt 45;$i++){try{$c=Container 'clinic-crm-api';if($c.Image -ne $Id -or -not $c.State.Running){throw 'Wrong API image'};$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 4;if($h.status -ne 'ok' -or $h.database -ne 'ok'){throw 'API/database health not ready'};return}catch{if($i -eq 10){$null=Invoke-ReleaseDocker @('exec','clinic-crm-web','nginx','-t');$null=Invoke-ReleaseDocker @('exec','clinic-crm-web','nginx','-s','reload')};Start-Sleep -Milliseconds 500}}
  throw 'API health did not recover'
}
function Restore-Configuration($State){
  foreach($f in $State.configuration){$h=Hash (Join-Path $Root $f.name);if($h -ne $f.sha256 -and $h -ne $f.appliedHash){throw ('Rollback preserved unrelated configuration: '+$f.name)}}
  foreach($f in $State.configuration){Atomic (Join-Path $Root $f.name) ([IO.File]::ReadAllBytes((Join-Path $backup $f.savedName)))}
}
function New-Configuration($State){
  foreach($f in $State.configuration){
    $path=Join-Path $Root $f.name;$bytes=[IO.File]::ReadAllBytes($path);$bom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
    if($f.name -in @('.env','.env.runtime')){
      $text=[IO.File]::ReadAllText($path)
      foreach($key in @('TEMICHEVVET_API_IMAGE','TEMICHEVVET_REMOTE_API_IMAGE','CRM_SOURCE_VERSION')){
        $pattern='(?m)^'+$key+'=[^\r\n]*';$count=[regex]::Matches($text,$pattern).Count
        if($count -gt 1){throw 'Duplicate release pin'}
        if($count -eq 1){$value=if($key -eq 'CRM_SOURCE_VERSION'){$manifest.revision}else{$manifest.candidate.reference};$text=[regex]::Replace($text,$pattern,($key+'='+$value))}
      }
      $encoding=New-Object Text.UTF8Encoding($bom);$result=@($encoding.GetPreamble())+@($encoding.GetBytes($text));$bytes=[byte[]]$result
    }elseif($f.name -eq 'diagnostics/bin/system-diagnostics-config.json'){
      $d=Json $path;$d|Add-Member -NotePropertyName expectedRevision -NotePropertyValue $manifest.revision -Force;$d|Add-Member -NotePropertyName expectedApiImage -NotePropertyValue $manifest.candidate.reference -Force
      $bytes=[Text.Encoding]::UTF8.GetBytes(($d|ConvertTo-Json -Depth 32))
    }
    $planned=Join-Path $backup ('planned-'+$f.savedName);[IO.File]::WriteAllBytes($planned,$bytes);$f.appliedHash=Hash $planned
  }
  Save $statePath $State
  foreach($f in $State.configuration){Atomic (Join-Path $Root $f.name) ([IO.File]::ReadAllBytes((Join-Path $backup ('planned-'+$f.savedName))))}
}
if($Mode -in @('Prepare','Apply','Rollback') -and -not $Execute){throw 'Mutating mode requires explicit -Execute'}
$checks=Json (Join-Path $PackageRoot 'checksums.json')
foreach($f in $checks.PSObject.Properties){if($f.Name -eq 'release.json' -and (Test-Path $statePath)){if((Hash (Join-Path $PackageRoot 'release.json')) -ne (Json $statePath).manifestSha256){throw 'Prepared manifest changed'};continue};if((Hash (Join-Path $PackageRoot $f.Name)) -ne $f.Value){throw ('Packet checksum differs: '+$f.Name)}}
$api=Container 'clinic-crm-api';$web=Container 'clinic-crm-web';$project=$api.Config.Labels.'com.docker.compose.project'
if(-not $project -or $web.Image -ne $manifest.web.image){throw 'Wrong installation or Web image'}
$before=Compose '' ''
if($before.services.api.image -ne $api.Config.Image -or $before.services.web.image -ne $web.Config.Image){throw 'Running images differ from Compose'}
if($Mode -eq 'Inspect'){
  if($api.Image -ne $manifest.previous.image){throw 'API baseline changed'};Assert-Configuration $manifest.configuration;Assert-Protected $manifest.protected
  Assert-Compose $before (Compose $manifest.candidate.reference $manifest.revision)
  [pscustomobject]@{mode=$Mode;host=$env:COMPUTERNAME;api=$api.Image;web=$web.Image;configurationVerified=$true}|ConvertTo-Json;return
}
Status 'RUNNING'
try{
  if($Mode -eq 'Prepare'){
    if($api.Image -ne $manifest.previous.image -or (Image $manifest.previous.reference).Id -ne $manifest.previous.image){throw 'API baseline image changed'}
    Assert-Configuration $manifest.configuration;Assert-Protected $manifest.protected;Assert-Compose $before (Compose $manifest.candidate.reference $manifest.revision)
    if(Test-Path $backup){throw 'Preserve existing backup; inspect before retrying'}
    $null=New-Item -ItemType Directory -Path $backup;$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $backup /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'Backup ACL failed'}
    $build=Invoke-ReleaseDocker @('build','--platform','linux/amd64','--network','none','--pull=false','--build-arg',('BASE_API_IMAGE='+$manifest.previous.reference),'--build-arg',('RELEASE_REVISION='+$manifest.revision),'-f',(Join-Path $PackageRoot 'Dockerfile.api'),'-t',$manifest.candidate.reference,$PackageRoot)
    [IO.File]::WriteAllText((Join-Path $PackageRoot 'build.log'),$build)
    $image=Image $manifest.candidate.reference;if($image.Architecture -ne 'amd64' -or $image.Config.Labels.'org.opencontainers.image.revision' -ne $manifest.revision){throw 'Candidate identity differs'}
    $manifest.candidate.id=$image.Id;Save (Join-Path $PackageRoot 'release.json') $manifest
    $qa='hotel-sync-qualify-'+[guid]::NewGuid().ToString('N').Substring(0,12)
    try{
      $null=Invoke-ReleaseDocker @('create','--name',$qa,'--network','none','--entrypoint','node',$manifest.candidate.reference,'/tmp/qualify.cjs')
      $null=Invoke-ReleaseDocker @('cp',(Join-Path $PackageRoot 'qualify.cjs'),($qa+':/tmp/qualify.cjs'));$null=Invoke-ReleaseDocker @('cp',(Join-Path $PackageRoot 'release.json'),($qa+':/tmp/hotel-sync-release.json'))
      $qualification=Invoke-ReleaseDocker @('start','-a',$qa);if((Container $qa).State.ExitCode -ne 0){throw 'Image qualification failed'}
      [IO.File]::WriteAllText((Join-Path $backup 'image-qualification.json'),$qualification)
    }finally{$null=Invoke-ReleaseDocker @('rm','-f','-v',$qa)}
    $configuration=@();foreach($f in $manifest.configuration){$saved='before-'+$f.name.Replace('/','-');[IO.File]::WriteAllBytes((Join-Path $backup $saved),[IO.File]::ReadAllBytes((Join-Path $Root $f.name)));$configuration+=[pscustomobject]@{name=$f.name;sha256=$f.sha256;savedName=$saved;appliedHash=''}}
    $pg=Container 'clinic-crm-postgres';$user=@($pg.Config.Env|Where-Object{$_ -like 'POSTGRES_USER=*'})[0].Substring(14);$database=@($pg.Config.Env|Where-Object{$_ -like 'POSTGRES_DB=*'})[0].Substring(12)
    $suffix=[guid]::NewGuid().ToString('N');$temporary='hotel-sync-restore-'+$suffix.Substring(0,12);$dump='/tmp/hotel-sync-'+$suffix+'.dump';$started=$false
    try{
      $null=Invoke-ReleaseDocker @('exec','clinic-crm-postgres','pg_dump','-U',$user,'-d',$database,'-Fc','--file',$dump)
      $null=Invoke-ReleaseDocker @('cp',('clinic-crm-postgres:'+$dump),(Join-Path $backup 'database.dump'))
      $null=Invoke-ReleaseDocker @('run','-d','--pull','never','--network','none','--name',$temporary,'--label',('io.temichevvet.release='+$manifest.releaseId),'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',$pg.Image);$started=$true
      $ready=$false;for($i=0;$i -lt 60;$i++){$ErrorActionPreference='Continue';& docker exec $temporary pg_isready -h 127.0.0.1 -U restore_test -d restore_test *> $null;$code=$LASTEXITCODE;$ErrorActionPreference='Stop';if($code -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 500};if(-not $ready){throw 'Isolated PostgreSQL did not start'}
      $null=Invoke-ReleaseDocker @('cp',(Join-Path $backup 'database.dump'),($temporary+':/tmp/database.dump'))
      $null=Invoke-ReleaseDocker @('exec',$temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump')
      $null=Invoke-ReleaseDocker @('exec',$temporary,'pg_isready','-U','restore_test','-d','restore_test')
    }finally{if($started){$null=Invoke-ReleaseDocker @('rm','-f','-v',$temporary)};$null=Invoke-ReleaseDocker @('exec','clinic-crm-postgres','rm','-f',$dump)}
    Assert-Protected $manifest.protected;Assert-Configuration $manifest.configuration
    $current=Container 'clinic-crm-api';if($current.Id -ne $api.Id -or $current.Image -ne $api.Image -or $current.State.StartedAt -ne $api.State.StartedAt){throw 'API changed during preparation'}
    $state=[pscustomobject]@{release=$manifest.releaseId;revision=$manifest.revision;root=$Root;phase='PREPARED';preparedAt=[DateTime]::UtcNow.ToString('o');previous=$manifest.previous;candidate=$manifest.candidate;protected=$manifest.protected;configuration=$configuration;databaseSha256=(Hash (Join-Path $backup 'database.dump'));restoreTested=$true;manifestSha256=(Hash (Join-Path $PackageRoot 'release.json'))}
    Save $statePath $state;Status 'COMPLETE';$state|ConvertTo-Json -Depth 12;return
  }
  $state=Json $statePath
  if($state.root -ne $Root -or $state.revision -ne $manifest.revision -or (Hash (Join-Path $PackageRoot 'release.json')) -ne $state.manifestSha256){throw 'Release state differs'}
  Assert-Protected $state.protected
  if($Mode -eq 'Rollback'){
    if($api.Image -ne $state.candidate.id -or (Image $state.previous.reference).Id -ne $state.previous.image){throw 'Rollback refuses unrelated API'}
    Restore-Configuration $state;Compose $state.previous.reference $state.previous.revision -Apply;Wait-Healthy $state.previous.image;Assert-Protected $state.protected
    $state.phase='ROLLED_BACK';Save $statePath $state;Status 'COMPLETE';return
  }
  if($Mode -eq 'Verify'){
    if($api.Image -ne $state.candidate.id){throw 'Candidate API is not running'};Wait-Healthy $state.candidate.id
    foreach($f in $state.configuration){if((Hash (Join-Path $Root $f.name)) -ne $f.appliedHash){throw 'Configuration changed after release'}}
    [pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');apiImage=$api.Image;revision=$manifest.revision;protectedServices=@($state.protected).Count;databaseArchiveVerified=((Hash (Join-Path $backup 'database.dump')) -eq $state.databaseSha256);restoreTested=$state.restoreTested}|ConvertTo-Json
    Status 'COMPLETE';return
  }
  if($state.phase -ne 'PREPARED' -or $api.Image -ne $state.previous.image -or -not $state.restoreTested -or [DateTime]::Parse($state.preparedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-2) -or (Hash (Join-Path $backup 'database.dump')) -ne $state.databaseSha256){throw 'A fresh verified backup and exact previous API are required'}
  Assert-Configuration $manifest.configuration
  $candidate=Image $manifest.candidate.reference;if($candidate.Id -ne $state.candidate.id){throw 'Candidate tag changed'}
  Assert-Compose $before (Compose $state.candidate.reference $manifest.revision)
  $switchStarted=$false
  try{
    New-Configuration $state;Assert-Compose $before (Compose '' '')
    $state.phase='SWITCHING';Save $statePath $state;$switchStarted=$true
    Compose $state.candidate.reference $manifest.revision -Apply;Wait-Healthy $state.candidate.id;Assert-Protected $state.protected
    $state.phase='COMPLETE';$state|Add-Member -NotePropertyName completedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;Save $statePath $state;Status 'COMPLETE'
    [pscustomobject]@{completedAt=$state.completedAt;revision=$state.revision;candidate=$state.candidate;backup=$backup;protectedServices=@($state.protected).Count;schemaChanged=$false}|ConvertTo-Json;return
  }catch{
    $failure=$_;Restore-Configuration $state;if($switchStarted){Compose $state.previous.reference $state.previous.revision -Apply;Wait-Healthy $state.previous.image};Assert-Protected $state.protected;$state.phase='FAILED_ROLLED_BACK';Save $statePath $state;throw $failure
  }
}catch{Status 'FAILED' $_.Exception.Message;throw}
