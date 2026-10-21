[CmdletBinding()]
param([ValidateSet('Publish','Rollback')][string]$Mode='Publish',[string]$Root='C:/Users/TemichevVet/TemichevVet',[string]$PackageRoot=$PSScriptRoot)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
$m=Get-Content (Join-Path $PackageRoot 'release.json') -Raw -Encoding UTF8|ConvertFrom-Json
$backup=Join-Path $Root ('backups/manual-releases/'+$m.releaseId);$result=Join-Path $PackageRoot ('result-'+$Mode+'.json');$log=Join-Path $PackageRoot ('run-'+$Mode+'.log')
function Invoke-AvitoWebDocker([string[]]$Arguments){$saved=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$text=& docker @Arguments 2>&1|Out-String;$rc=$LASTEXITCODE}finally{$ErrorActionPreference=$saved};if($rc -ne 0){throw "Docker failed: $text"};return $text}
function Save-Result([string]$Status,[string]$Detail=''){[IO.File]::WriteAllText(($result+'.tmp'),([pscustomobject]@{status=$Status;at=[DateTime]::UtcNow.ToString('o');mode=$Mode;revision=$m.revision;detail=$Detail}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)));Move-Item -Force ($result+'.tmp') $result}
$null=Start-Transcript -LiteralPath $log -Append
try{
 Save-Result 'RUNNING'
 if($Mode -eq 'Rollback'){
  & (Join-Path $PackageRoot 'release-web.ps1') -Mode Rollback -Execute -Root $Root -PackageRoot $PackageRoot -BackupPath $backup
  Save-Result 'ROLLED_BACK';return
 }
 if(Test-Path $backup){throw 'Preserve existing Avito Web release state; inspect instead of publishing twice'}
 $api=@(Invoke-AvitoWebDocker -Arguments @('inspect','clinic-crm-api')|ConvertFrom-Json)[0];$web=@(Invoke-AvitoWebDocker -Arguments @('inspect','clinic-crm-web')|ConvertFrom-Json)[0]
 if($api.Image -ne $m.images.api.previousId -or $web.Image -ne $m.images.web.previousId){throw 'Qualified baseline changed'}
 foreach($f in $m.configuration){if((Get-FileHash (Join-Path $Root $f.name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256){throw ('Configuration changed since preflight: '+$f.name)}}
 $build=Invoke-AvitoWebDocker -Arguments @('build','--platform','linux/amd64','--network','none','--pull=false','--build-arg',('BASE_WEB_IMAGE='+$m.images.web.previous),'--build-arg',('RELEASE_REVISION='+$m.revision),'-f',(Join-Path $PackageRoot 'Dockerfile.web'),'-t',$m.images.web.candidate,$PackageRoot)
 [IO.File]::WriteAllText((Join-Path $PackageRoot 'build.log'),$build)
 $image=@(Invoke-AvitoWebDocker -Arguments @('image','inspect',$m.images.web.candidate)|ConvertFrom-Json)[0];if($image.Architecture -ne 'amd64' -or $image.Config.Labels.'org.opencontainers.image.revision' -ne $m.revision){throw 'Avito Web image identity differs'}
 $m.images.web.candidateId=$image.Id;[IO.File]::WriteAllText((Join-Path $PackageRoot 'release.json'),($m|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
 $null=New-Item -ItemType Directory -Path $backup;$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $backup /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'Backup ACL failed'}
 $source=Join-Path $Root 'backups/manual-releases/crm-avito-directions-20261021-r1-api';$proof=Get-Content ($source+'/api-state.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if(-not $proof.restoreTested -or $proof.phase -ne 'COMPLETE'){throw 'Verified restoration evidence missing'}
 $dump=Join-Path $source 'database.dump';if((Get-FileHash $dump -Algorithm SHA256).Hash.ToLowerInvariant() -ne $proof.databaseSha256){throw 'Verified database backup changed'}
 $protected=@('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')|ForEach-Object{$c=@(Invoke-AvitoWebDocker -Arguments @('inspect',$_)|ConvertFrom-Json)[0];[pscustomobject]@{name=$_;id=$c.Id;image=$c.Image;started=$c.State.StartedAt}}
 foreach($old in $proof.protected){if($old.name -in @('clinic-crm-api','clinic-crm-web')){continue};$now=@($protected|Where-Object{$_.name -eq $old.name})[0];if($old.id -ne $now.id -or $old.started -ne $now.started){throw 'Data service changed since restoration rehearsal'}}
 $verified=[pscustomobject]@{scope='WEB_CONFIGURATION_ONLY';noDatabaseWrites=$true;verified=$true;restoreTested=$proof.restoreTested;capturedAt=$proof.preparedAt;protected=@($protected);database=[pscustomobject]@{absolutePath=$dump;sha256=$proof.databaseSha256};sourceProof=[pscustomobject]@{absolutePath=($source+'/api-state.json');sha256=(Get-FileHash ($source+'/api-state.json') -Algorithm SHA256).Hash.ToLowerInvariant()}}
 [IO.File]::WriteAllText(($backup+'/verified-backup.json'),($verified|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
 & (Join-Path $PackageRoot 'release-web.ps1') -Mode Inspect -Root $Root -PackageRoot $PackageRoot
 & (Join-Path $PackageRoot 'release-web.ps1') -Mode Apply -Execute -Root $Root -PackageRoot $PackageRoot -BackupPath $backup
 Save-Result 'COMPLETE'
 [IO.File]::WriteAllText(($backup+'/deployment-receipt.json'),([pscustomobject]@{revision=$m.revision;baseRevision=$m.baseRevision;web=$m.images.web;apiUnchanged=$true;dataUnchanged=$true;backup=$backup;scope='AVITO_DIRECTION_TABS'}|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
}catch{Save-Result 'FAILED' $_.Exception.Message;throw}finally{$null=Stop-Transcript}
