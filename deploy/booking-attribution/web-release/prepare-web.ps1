[CmdletBinding()]
param([ValidateSet('Inspect','Prepare')][string]$Mode='Inspect',[string]$Root='C:/Users/TemichevVet/TemichevVet',[string]$PackageRoot=$PSScriptRoot,[switch]$Execute)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
function InvokeWebDocker([string[]]$A){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$s=& docker @A 2>&1|Out-String;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw ('Docker '+$A[0]+' failed: '+$s)};return $s}
function ReadWebJson($p){ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($p))}
function WebHash($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function WebContainer($n){(ConvertFrom-Json -InputObject (InvokeWebDocker @('inspect',$n)))[0]}
function SaveWeb($p,$v){if(Test-Path $p){throw 'Preserve existing receipt'};[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 64),(New-Object Text.UTF8Encoding($false)))}
$m=ReadWebJson (Join-Path $PackageRoot 'release.json')
if($m.releaseId -ne 'crm-booking-source-web-20261022-r1' -or $m.revision -ne '7e4f6b0e946b2266147adcc429eb4ecc50f8ab50'){throw 'Wrong packet'}
foreach($f in $m.files){if($f.name -notmatch '^[A-Za-z0-9_./-]+$' -or $f.name -match '(^|/)\.\.(/|$)' -or (WebHash (Join-Path $PackageRoot $f.name)) -ne $f.sha256){throw 'Packet checksum/path mismatch'}}
$web=WebContainer 'clinic-crm-web'
if($web.Image -ne $m.images.web.previousId){throw 'Web baseline changed'}
if((ConvertFrom-Json -InputObject (InvokeWebDocker @('image','inspect',$web.Config.Image)))[0].Id -ne $web.Image){throw 'Baseline tag changed'}
$assets=@($web.Mounts|Where-Object{$_.Type -eq 'volume' -and $_.Destination -eq '/usr/share/nginx/html/assets'})
if($assets.Count -ne 1){throw 'Expected retained assets volume'}
$names=@('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup','clinic-crm-web')
$before=@($names|ForEach-Object{$c=WebContainer $_;[pscustomobject]@{name=$_;id=$c.Id;image=$c.Image;started=$c.State.StartedAt}})
if($Mode -eq 'Inspect'){@{baselineVerified=$true;web=$web.Image;assetsVolume=$assets[0].Name;mutated=$false}|ConvertTo-Json;return}
if(-not $Execute){throw 'Prepare needs explicit -Execute'}
$backup=Join-Path $Root ('backups/manual-releases/'+$m.releaseId)
if(Test-Path $backup){throw 'Preserve existing preparation and inspect its state'}
$null=New-Item -ItemType Directory $backup
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $backup /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null
if($LASTEXITCODE -ne 0){throw 'Backup ACL failed'}
if((InvokeWebDocker @('images','--quiet',$m.images.web.candidate)).Trim()){throw 'Candidate tag already exists'}
$build=InvokeWebDocker @('build','--network','none','--pull=false','--platform','linux/amd64','--build-arg',('BASE_WEB_IMAGE='+$web.Config.Image),'--build-arg',('RELEASE_REVISION='+$m.revision),'-f',(Join-Path $PackageRoot 'Dockerfile.web'),'-t',$m.images.web.candidate,$PackageRoot)
[IO.File]::WriteAllText((Join-Path $backup 'web-build.log'),$build)
$candidate=(ConvertFrom-Json -InputObject (InvokeWebDocker @('image','inspect',$m.images.web.candidate)))[0]
if($candidate.Architecture -ne 'amd64'){throw 'Wrong architecture'}
$ownedVolumes=@();$ownedContainers=@();$task='crm-booking-source-web-20261022'
try{
 $results=@()
 foreach($kind in @('empty','retained')){
  $suffix=[guid]::NewGuid().ToString('N').Substring(0,10)
  $vol='crm-booking-source-web-'+$kind+'-'+$suffix;$qa=$vol+'-nginx'
  $null=InvokeWebDocker @('volume','create','--label',('codex.task='+$task),$vol);$ownedVolumes+=,$vol
  $mount='type=volume,source='+$vol+',target=/usr/share/nginx/html/assets'
  $prior=''
  if($kind -eq 'retained'){
   $seedScript='cp -a /old/. /seed/; cd /seed; find . -type f | sort | xargs sha256sum; tar -C /old -cf /backup/assets-before.tar .'
   $prior=(InvokeWebDocker @('run','--rm','--pull','never','--network','none','--mount',('type=volume,source='+$assets[0].Name+',target=/old,readonly'),'--mount',('type=volume,source='+$vol+',target=/seed'),'--mount',('type=bind,source='+$backup+',target=/backup'),'--entrypoint','sh',$web.Image,'-ec',$seedScript)).Trim()
   if(-not $prior){throw 'No live retained assets captured'}
   [IO.File]::WriteAllText((Join-Path $backup 'assets-before.sha256'),$prior)
  }
  $id=(InvokeWebDocker @('run','-d','--pull','never','--network','none','--name',$qa,'--label',('codex.task='+$task),'--memory','256m','--cpus','0.5','--add-host','api:127.0.0.1','--mount',$mount,$candidate.Id)).Trim();$ownedContainers+=,$id
  $ready=$false
  for($i=0;$i -lt 30;$i++){try{$null=InvokeWebDocker @('exec',$id,'wget','-q','-O','/dev/null','http://127.0.0.1/index.html');$ready=$true;break}catch{Start-Sleep -Milliseconds 250}}
  if(-not $ready){throw 'QA Nginx not ready'}
  $lines=@('set -eu')
  $newFiles=@($m.files|Where-Object{$_.name.StartsWith('web/')})
  foreach($f in $newFiles){$path=$f.name.Substring(4);$lines+=('wget -q -S -O /tmp/qa-response http://127.0.0.1/'+$path+' 2>/tmp/qa-headers');$lines+=('test "$(sha256sum /tmp/qa-response | cut -d " " -f1)" = '+$f.sha256);if($path -match '\.js$'){$lines+="grep -Eiq 'Content-Type: *(application|text)/javascript' /tmp/qa-headers"};if($path -match '\.css$'){$lines+="grep -Eiq 'Content-Type: *text/css' /tmp/qa-headers"}}
  $lines+=('printf "HTTP_SHA_MIME_OK '+$newFiles.Count+'\n"')
  $check=Join-Path $backup ('check-'+$kind+'.sh');[IO.File]::WriteAllText($check,($lines -join "`n"),(New-Object Text.UTF8Encoding($false)))
  $null=InvokeWebDocker @('cp',$check,($id+':/tmp/check-web.sh'))
  $http=InvokeWebDocker @('exec',$id,'sh','/tmp/check-web.sh')
  $preserved=0
  if($kind -eq 'retained'){
   $after=(InvokeWebDocker @('exec',$id,'sh','-ec','cd /usr/share/nginx/html/assets; find . -type f | sort | xargs sha256sum')).Trim()
   $set=@{};foreach($line in ($after -split "`n")){if($line.Trim()){$set[$line.Trim()]=$true}}
   foreach($line in ($prior -split "`n")){if($line.Trim()){if(-not $set.ContainsKey($line.Trim())){throw 'Existing live asset changed'};$preserved++}}
  }
  $results+=,[pscustomobject]@{kind=$kind;newFilesVerified=$newFiles.Count;httpShaMime=$true;priorLiveAssetsPreserved=$preserved}
 }
 foreach($p in $before){$c=WebContainer $p.name;if($c.Id -ne $p.id -or $c.Image -ne $p.image -or $c.State.StartedAt -ne $p.started){throw 'Working service changed during Web QA'}}
 $record=[pscustomobject]@{releaseId=$m.releaseId;revision=$m.revision;preparedAt=[DateTime]::UtcNow.ToString('o');previousWeb=$web.Config.Image;previousWebId=$web.Image;candidateWeb=$m.images.web.candidate;candidateId=$candidate.Id;qa=$results;webAssetsBackupHash=(WebHash (Join-Path $backup 'assets-before.tar'));workingServicesUnchanged=$true;manifestHash=(WebHash (Join-Path $PackageRoot 'release.json'));dataServicesChanged=$false;apiChanged=$false}
 SaveWeb (Join-Path $backup 'web-prepared.json') $record
 $m.images.web.previous=$web.Config.Image;$m.images.web.candidateId=$candidate.Id
 [IO.File]::WriteAllText((Join-Path $PackageRoot 'release.json'),($m|ConvertTo-Json -Depth 64),(New-Object Text.UTF8Encoding($false)))
 $record|ConvertTo-Json -Depth 12
}finally{
 foreach($id in $ownedContainers){$c=WebContainer $id;if($c.Config.Labels.'codex.task' -ne $task){throw 'QA container ownership changed'};$null=InvokeWebDocker @('rm','-f',$id)}
 foreach($vol in $ownedVolumes){$v=(ConvertFrom-Json -InputObject (InvokeWebDocker @('volume','inspect',$vol)))[0];if($v.Labels.'codex.task' -ne $task){throw 'QA volume ownership changed'};$null=InvokeWebDocker @('volume','rm',$vol)}
 SaveWeb (Join-Path $backup 'qa-cleanup.json') @{ownedContainersRemoved=$true;ownedVolumesRemoved=$true;productionVolumeRetained=$true;at=[DateTime]::UtcNow.ToString('o')}
}
