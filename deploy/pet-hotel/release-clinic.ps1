[CmdletBinding()]
param([ValidateSet('Inspect','Apply','Rollback')][string]$Mode='Inspect',[string]$Root='C:/Users/TemichevVet/TemichevVet',[string]$PackagePath=$PSScriptRoot)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong clinic host'}
$manifest=Get-Content (Join-Path $PackagePath 'release.json') -Raw|ConvertFrom-Json
$backup=Join-Path $Root ('backups/manual-releases/'+$manifest.releaseId);$statePath=Join-Path $backup 'hotel-state.json'
function Invoke-HotelDocker([string[]]$Arguments){$saved=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$r=& docker @Arguments 2>&1|Out-String;$rc=$LASTEXITCODE}finally{$ErrorActionPreference=$saved};if($rc -ne 0){throw "Docker $($Arguments[0]) failed: $r"};return $r}
function Container([string]$Name){return @(ConvertFrom-Json (Invoke-HotelDocker -Arguments @('inspect',$Name)))[0]}
function Hash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Compose([string[]]$Arguments){$base=@('compose','--project-directory',$Root,'--project-name','temichevvet','--file',(Join-Path $Root 'docker-compose.yml'),'--env-file',(Join-Path $Root '.env'));if(Test-Path (Join-Path $Root '.env.runtime')){$base+=@('--env-file',(Join-Path $Root '.env.runtime'))};return Invoke-HotelDocker -Arguments ($base+$Arguments)}
function Assert-Protected($Items){foreach($item in $Items){if($item.name -in @('clinic-crm-api','clinic-crm-web')){continue};$c=Container $item.name;if($c.Id -ne $item.id -or $c.Image -ne $item.image -or $c.State.StartedAt -ne $item.started){throw "Protected service changed: $($item.name)"}}}
function Put-Env([string]$Path,[hashtable]$Values){$bytes=[IO.File]::ReadAllBytes($Path);$bom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191;$text=[IO.File]::ReadAllText($Path);foreach($key in $Values.Keys){$pattern='(?m)^'+[regex]::Escape($key)+'=[^\r\n]*';if([regex]::Matches($text,$pattern).Count -gt 1){throw "Duplicate setting: $key"};if([regex]::IsMatch($text,$pattern)){$text=[regex]::Replace($text,$pattern,($key+'='+$Values[$key]))}else{$text=$text.TrimEnd()+"`r`n"+$key+'='+$Values[$key]+"`r`n"}};[IO.File]::WriteAllText($Path,$text,(New-Object Text.UTF8Encoding($bom)))}
function Restore-Configuration($State,[switch]$OwnedFailure){foreach($f in $State.configuration){if(-not $OwnedFailure -and (Hash (Join-Path $Root $f.name)) -ne $f.appliedHash){throw "Rollback refuses changed configuration: $($f.name)"}};foreach($f in $State.configuration){[IO.File]::WriteAllBytes((Join-Path $Root $f.name),[IO.File]::ReadAllBytes((Join-Path $backup $f.savedName)))}}
function Wait-Healthy([string]$ApiId,[string]$WebId,[switch]$Candidate){for($i=0;$i -lt 45;$i++){try{$a=Container 'clinic-crm-api';$w=Container 'clinic-crm-web';if($a.Image -ne $ApiId -or $w.Image -ne $WebId -or -not $a.State.Running -or -not $w.State.Running){throw 'Application identity differs'};$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 4;if($h.status -ne 'ok' -or $h.database -ne 'ok'){throw 'Health not ready'};if($Candidate){$r=Invoke-RestMethod 'http://127.0.0.1:3000/release.json' -TimeoutSec 4;if($r.revision -ne $manifest.revision){throw 'Web revision differs'}};return}catch{Start-Sleep -Seconds 2}};throw 'Application did not recover'}
$api=Container 'clinic-crm-api';$web=Container 'clinic-crm-web'
if($Mode -eq 'Inspect'){[pscustomobject]@{host=$env:COMPUTERNAME;api=$api.Config.Image;apiId=$api.Image;web=$web.Config.Image;webId=$web.Image;release=$manifest.releaseId}|ConvertTo-Json;return}
if($Mode -eq 'Rollback'){
 $state=Get-Content $statePath -Raw|ConvertFrom-Json
 if($api.Image -ne $state.candidateApiId -or $web.Image -ne $state.candidateWebId){throw 'Rollback refuses an unrelated release'}
 Assert-Protected $state.protected;Restore-Configuration $state
 $null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api','web');Wait-Healthy $state.previousApiId $state.previousWebId;Assert-Protected $state.protected
 $state.phase='ROLLED_BACK';$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8
 Write-Output 'ROLLBACK_OK: previous API/Web restored; current clinical data and new hotel tables retained.';return
}
if($api.Image -ne $manifest.previous.api.id -or $web.Image -ne $manifest.previous.web.id){throw 'Current release differs from the inspected baseline'}
if(Test-Path $statePath){throw 'Release state already exists; inspect before retrying'}
$verified=Get-Content (Join-Path $backup 'verified-backup.json') -Raw|ConvertFrom-Json
if(-not $verified.verified -or -not $verified.restoreTested -or -not $verified.hotelMigrationsRehearsed -or -not $verified.candidateQualified -or [DateTime]::Parse($verified.capturedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-2)){throw 'A fresh verified backup and candidate migration rehearsal are required'}
if((Hash (Join-Path $backup $verified.database.name)) -ne $verified.database.sha256){throw 'Backup hash differs'}
foreach($item in $verified.protected){$c=Container $item.name;if($c.Id -ne $item.id -or $c.Image -ne $item.image -or $c.State.StartedAt -ne $item.started){throw "Service changed after backup: $($item.name)"}}
foreach($kind in @('api','web')){$image=@(ConvertFrom-Json (Invoke-HotelDocker -Arguments @('image','inspect',$manifest.images.$kind.reference)))[0];if($image.Id -ne $manifest.images.$kind.id -or $image.Architecture -ne 'amd64' -or $image.Config.Labels.'org.opencontainers.image.revision' -ne $manifest.revision){throw "Candidate identity differs: $kind"}}
foreach($f in $manifest.configuration){if((Hash (Join-Path $Root $f.name)) -ne $f.sha256){throw "Configuration changed since inspection: $($f.name)"}}
$before=ConvertFrom-Json (Compose -Arguments @('config','--format','json'))
if($before.services.api.image -ne $api.Config.Image -or $before.services.web.image -ne $web.Config.Image -or $before.services.api.environment.SEED_ON_START -ne 'false'){throw 'Compose differs from running images or seeding is enabled'}
$configuration=@();foreach($f in $manifest.configuration){$saved='before-'+$f.name.Replace('/','-');if((Hash (Join-Path $backup $saved)) -ne $f.sha256){throw 'Configuration backup differs'};$configuration+=[pscustomobject]@{name=$f.name;savedName=$saved;appliedHash=''}}
$state=[pscustomobject]@{release=$manifest.releaseId;previousApiId=$api.Image;previousWebId=$web.Image;candidateApiId=$manifest.images.api.id;candidateWebId=$manifest.images.web.id;configuration=$configuration;protected=$verified.protected;phase='PREPARED'}
$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8;$appsStarted=$false
try{
 $values=@{TEMICHEVVET_API_IMAGE=$manifest.images.api.reference;TEMICHEVVET_WEB_IMAGE=$manifest.images.web.reference;TEMICHEVVET_REMOTE_API_IMAGE=$manifest.images.api.reference;TEMICHEVVET_REMOTE_WEB_IMAGE=$manifest.images.web.reference;CRM_SOURCE_VERSION=$manifest.revision}
 foreach($n in @('.env','.env.runtime')){$p=Join-Path $Root $n;if(Test-Path $p){Put-Env $p $values}}
 $diagnostics=Join-Path $Root 'diagnostics/bin/system-diagnostics-config.json';if(Test-Path $diagnostics){$d=Get-Content $diagnostics -Raw|ConvertFrom-Json;$d|Add-Member -NotePropertyName expectedRevision -NotePropertyValue $manifest.revision -Force;$d|Add-Member -NotePropertyName expectedWebRevision -NotePropertyValue $manifest.revision -Force;[IO.File]::WriteAllText($diagnostics,($d|ConvertTo-Json -Depth 32),(New-Object Text.UTF8Encoding($false)))}
 $after=ConvertFrom-Json (Compose -Arguments @('config','--format','json'))
 foreach($key in $before.services.api.environment.PSObject.Properties.Name){if($key -in @('CRM_SOURCE_VERSION','TEMICHEVVET_GIT_COMMIT')){continue};if($before.services.api.environment.$key -ne $after.services.api.environment.$key){throw "Protected API setting changed: $key"}}
 if($after.services.api.image -ne $manifest.images.api.reference -or $after.services.web.image -ne $manifest.images.web.reference){throw 'Image pins did not reach Compose'}
 foreach($f in $state.configuration){$f.appliedHash=Hash (Join-Path $Root $f.name)};$state.phase='CONFIGURED';$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8
 $null=Compose -Arguments @('run','--rm','--no-deps','-T','--entrypoint','/app/node_modules/.bin/prisma','api','migrate','deploy','--schema','/app/prisma/schema.prisma')
 $state.phase='MIGRATED';$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8
 $appsStarted=$true;$null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api','web');Wait-Healthy $manifest.images.api.id $manifest.images.web.id -Candidate
 $null=Invoke-HotelDocker -Arguments @('cp',(Join-Path $PackagePath 'initialize.cjs'),'clinic-crm-api:/tmp/hotel-initialize.cjs')
 $initialized=Invoke-HotelDocker -Arguments @('exec','-e',('PET_HOTEL_ACTOR_ID='+$manifest.actorId),'clinic-crm-api','node','/tmp/hotel-initialize.cjs')
 Assert-Protected $state.protected;$state.phase='COMPLETE';$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8
 [pscustomobject]@{completedAt=[DateTime]::UtcNow.ToString('o');release=$manifest.releaseId;revision=$manifest.revision;api=$manifest.images.api;web=$manifest.images.web;module=(ConvertFrom-Json $initialized);backupPath=$backup;clinicalDataRestored=$false;protectedServicesPreserved=$true}|ConvertTo-Json -Depth 12|Set-Content (Join-Path $backup 'deployment-receipt.json') -Encoding UTF8
 Write-Output 'APPLY_OK: independent pet hotel enabled; 8 cat and 4 dog rooms; API/Web healthy; protected services preserved.'
}catch{
 $failure=$_;Restore-Configuration $state -OwnedFailure
 if($appsStarted){$null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api','web');Wait-Healthy $state.previousApiId $state.previousWebId}
 Assert-Protected $state.protected;$state.phase='FAILED_ROLLED_BACK';$state|ConvertTo-Json -Depth 12|Set-Content $statePath -Encoding UTF8
 throw $failure
}
