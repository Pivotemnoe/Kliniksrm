[CmdletBinding()]
param([ValidateSet('Inspect','Rollback')][string]$Mode='Inspect',[string]$Root='C:/Users/TemichevVet/TemichevVet',[string]$PackageRoot=$PSScriptRoot,[switch]$Execute)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
function InvokeReleaseDocker([string[]]$A){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$s=& docker @A 2>&1|Out-String;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw ('Docker operation failed: '+$A[0]+' '+$s)};return $s}
function ReadReleaseJson($p){ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($p))}
function GetReleaseHash($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function GetReleaseContainer($n){(ConvertFrom-Json -InputObject (InvokeReleaseDocker @('inspect',$n)))[0]}
function Save($p,$v){$t=$p+'.new';if(Test-Path $t){throw 'Unresolved temporary state'};[IO.File]::WriteAllText($t,($v|ConvertTo-Json -Depth 64),(New-Object Text.UTF8Encoding($false)));if(Test-Path $p){$replaced=$p+'.replaced';if(Test-Path $replaced){throw 'Unresolved replaced state'};[IO.File]::Replace($t,$p,$replaced);Remove-Item -LiteralPath $replaced -Force}else{[IO.File]::Move($t,$p)}}
$m=ReadReleaseJson (Join-Path $PackageRoot 'manifest.json');if($m.releaseId -ne 'crm-admin-reports-20261022-r1' -or $m.revision -notmatch '^[a-f0-9]{40}$'){throw 'Unqualified release'}
foreach($f in $m.files){if($f.name -match '(^|/)\.\.' -or (GetReleaseHash (Join-Path $PackageRoot $f.name)) -ne $f.sha256){throw 'Packet checksum mismatch'}}
$b=Join-Path $Root ('backups/manual-releases/'+$m.releaseId);$stateFile=Join-Path $b 'state.json';$rights=Join-Path $b 'rights'
$api=GetReleaseContainer 'clinic-crm-api';$web=GetReleaseContainer 'clinic-crm-web';$project=$api.Config.Labels.'com.docker.compose.project'
if(-not $project){throw 'Missing compose project'}
function Protected{ @('clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')|ForEach-Object{$c=GetReleaseContainer $_;[pscustomobject]@{name=$_;id=$c.Id;image=$c.Image;started=$c.State.StartedAt}} }
function CheckProtected($s){foreach($p in $s){$c=GetReleaseContainer $p.name;if($c.Id -ne $p.id -or $c.Image -ne $p.image -or $c.State.StartedAt -ne $p.started -or -not $c.State.Running){throw 'Protected service changed'}}}
function Compose($ai,$wi,$rev,[switch]$Switch){
 $args=@('compose','--project-directory',$Root,'--project-name',$project,'--file',(Join-Path $Root 'docker-compose.yml'),'--env-file',(Join-Path $Root '.env'));if(Test-Path (Join-Path $Root '.env.runtime')){$args+=@('--env-file',(Join-Path $Root '.env.runtime'))}
 $keys=@('TEMICHEVVET_API_IMAGE','TEMICHEVVET_WEB_IMAGE','CRM_SOURCE_VERSION');$old=@{};foreach($k in $keys){$old[$k]=[Environment]::GetEnvironmentVariable($k,'Process')}
 try{if($ai){$env:TEMICHEVVET_API_IMAGE=$ai};if($wi){$env:TEMICHEVVET_WEB_IMAGE=$wi};if($rev){$env:CRM_SOURCE_VERSION=$rev};if($Switch){$null=InvokeReleaseDocker ($args+@('up','-d','--no-deps','--no-build','--pull','never','api','web'))}else{ConvertFrom-Json -InputObject (InvokeReleaseDocker ($args+@('config','--format','json')))}}finally{foreach($k in $keys){[Environment]::SetEnvironmentVariable($k,$old[$k],'Process')}}
}
function CheckCompose($before,$after){if([string]$after.services.api.environment.SEED_ON_START -ne 'false'){throw 'Seed must remain disabled'};$c=ConvertFrom-Json -InputObject ($after|ConvertTo-Json -Depth 64);$c.services.api.image=$before.services.api.image;$c.services.web.image=$before.services.web.image;$c.services.api.environment.CRM_SOURCE_VERSION=$before.services.api.environment.CRM_SOURCE_VERSION;if(($before|ConvertTo-Json -Depth 64 -Compress) -ne ($c|ConvertTo-Json -Depth 64 -Compress)){throw 'Unexpected Compose change'}}
function Worker($script,$image,$operation=''){
 $a=GetReleaseContainer 'clinic-crm-api';$network=@($a.NetworkSettings.Networks.PSObject.Properties)[0].Name;$old=$env:DATABASE_URL
 try{$env:DATABASE_URL=(@($a.Config.Env|Where-Object{$_ -like 'DATABASE_URL=*'})[0]).Substring(13);$args=@('run','--rm','--pull','never','--network',$network,'-e','DATABASE_URL','-e','NODE_PATH=/app/node_modules','--mount',('type=bind,source='+$PackageRoot+',target=/release,readonly'),'--entrypoint','node');if($operation){$args+=@('--mount',('type=bind,source='+$rights+',target=/private'))};$args+=@($image,('/release/'+$script));if($operation){$args+=@($operation,'/private')};InvokeReleaseDocker $args}finally{$env:DATABASE_URL=$old}
}
function Health($ai,$wi){for($i=0;$i -lt 40;$i++){try{if((GetReleaseContainer 'clinic-crm-api').Image -ne $ai -or (GetReleaseContainer 'clinic-crm-web').Image -ne $wi){throw 'Images differ'};$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 4;if($h.status -eq 'ok' -and $h.database -eq 'ok'){return}}catch{};Start-Sleep -Milliseconds 500};throw 'Health failed'}
function CheckConfig($s,$phase){foreach($f in $s.config){$expected=if($phase -eq 'after'){$f.afterHash}else{$f.beforeHash};if((GetReleaseHash (Join-Path $Root $f.name)) -ne $expected){throw ('Concurrent configuration edit: '+$f.name)}}}
function ConfigWrite($s,$phase){CheckConfig $s $(if($phase -eq 'after'){'before'}else{'after'});foreach($f in $s.config){$src=Join-Path $b ($phase+'-'+$f.saved);[IO.File]::WriteAllBytes((Join-Path $Root $f.name),[IO.File]::ReadAllBytes($src))}}
$original=ReadReleaseJson $stateFile
$expected=ReadReleaseJson (Join-Path $PSScriptRoot 'rollback-r2-expected.json')
if($api.Image -ne $expected.apiId -or $web.Image -ne $expected.webId){throw 'Runtime changed since rollback qualification'}
CheckConfig $expected 'after';CheckProtected $expected.protected
foreach($f in $original.config){if((GetReleaseHash (Join-Path $b ('before-'+$f.saved))) -ne $f.beforeHash){throw 'Before configuration checksum mismatch'}}
foreach($pair in @(@($original.previousApi,$m.previousApi),@($original.previousWeb,$m.previousWeb))){$image=(ConvertFrom-Json -InputObject (InvokeReleaseDocker @('image','inspect',$pair[0])))[0];if($image.Id -ne $pair[1]){throw 'Rollback image tag changed'}}
$resolved=Compose '' '' '';if($resolved.services.api.image -ne $api.Config.Image -or $resolved.services.web.image -ne $web.Config.Image){throw 'Compose/runtime pin mismatch'}
$null=Worker 'rights.cjs' $expected.apiId 'verify'
Health $expected.apiId $expected.webId
if($Mode -eq 'Inspect'){@{rollbackReady=$true;executed=$false;api=$api.Image;web=$web.Image;targetApi=$m.previousApi;targetWeb=$m.previousWeb;rightsAndMembershipsMatch=$true;configurationMatch=$true}|ConvertTo-Json;return}
if(-not $Execute){throw 'Explicit -Execute is required'}
# Recheck immediately before changing exact permission rows, never restore the database dump.
CheckConfig $expected 'after';CheckProtected $expected.protected
$null=Worker 'rights.cjs' $expected.apiId 'rollback'
ConfigWrite $expected 'before'
Compose $original.previousApi $original.previousWeb $original.previousRevision -Switch
Health $m.previousApi $m.previousWeb;CheckProtected $expected.protected
Save (Join-Path $PSScriptRoot 'rollback-r2-executed.json') @{at=[DateTime]::UtcNow.ToString('o');api=$m.previousApi;web=$m.previousWeb;rolledBack=$true}
