# Web-only Avito notification UI. Queue/device behavior is preserved. Current API, database, rights and prior UI releases are protected.
# Default Inspect reads current state; mutating stages require -Execute.
# BackupQualify is deliberately independent of the Web packet and final commit.
[CmdletBinding()]
param(
  [ValidateSet('Inspect','BackupQualify','PrepareWeb','Build','Apply','Verify','Rollback')][string]$Mode='Inspect',
  [ValidatePattern('^crm-staff-[a-z0-9-]+$')][string]$ReleaseId='crm-staff-avito-notifications-20261102-r1',
  [string]$Root='C:/Users/TemichevVet/TemichevVet',
  [string]$PacketRoot='',
  [ValidatePattern('^sha256:[a-f0-9]{64}$')][string]$ExpectedApiImageId='',
  [string]$ExpectedPacketManifestSha256='',
  [string]$PreflightPath='',
  [string]$ExpectedPreflightSha256='',
  [string]$PublicBaseUrl='https://staff.temichevvet.ru',
  [switch]$Execute
)
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); $OutputEncoding=[Console]::OutputEncoding
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4' -or $Root.Replace('\','/').TrimEnd('/') -ne 'C:/Users/TemichevVet/TemichevVet'){throw 'Wrong release host or installation'}
if($Mode -ne 'Inspect' -and -not $Execute){throw 'A mutating mode requires -Execute within the authorized release'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine'; $env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker'
$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
$dockerExecutable='C:/Program Files/Docker/Docker/resources/bin/docker.exe'
if(-not (Test-Path -LiteralPath $dockerExecutable -PathType Leaf)){throw 'Expected Docker Desktop CLI executable is absent'}
$baseRevision='6716c86b4e69619587869a9150332613c1de368b'
$baseWeb='temichevvet-crm-web:queue-device-6716c86b4e69-r1'
$baseWebId='sha256:76b95dbdb29c758cc7bee6533e0f111bc22334d73354083b0fb29f02a0e7cc22'
if(-not $ExpectedApiImageId){throw 'Exact currently qualified API image is required'}
$apiId=$ExpectedApiImageId
$protectedNames=@('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')
$configurationNames=@('docker-compose.yml','.env','.env.runtime','diagnostics/bin/system-diagnostics-config.json')
$backup=Join-Path $Root ('backups/manual-releases/'+$ReleaseId)
$dataStatePath=Join-Path $backup 'data-qualified.json'; $webStatePath=Join-Path $backup 'web-state.json'
$compose=@('compose','--project-directory',$Root,'--project-name','temichevvet','--file',(Join-Path $Root 'docker-compose.yml'))
function Docker([string[]]$A){
  $old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$out=& $dockerExecutable @A 2>&1|Out-String;$exitCode=$LASTEXITCODE}finally{$ErrorActionPreference=$old}
  if($exitCode -ne 0){
    # Inspect remains read-only. For other stages the already restricted backup
    # directory may retain diagnostics; raw config/inspect output is never thrown.
    if($Mode -ne 'Inspect' -and (Test-Path -LiteralPath $backup)){try{[IO.File]::AppendAllText((Join-Path $backup 'docker-errors.private.log'),([DateTime]::UtcNow.ToString('o')+' '+$A[0]+"`n"+$out+"`n"),(New-Object Text.UTF8Encoding($false)))}catch{}}
    throw ('Docker operation failed: '+$A[0]+'; no secret-bearing output was emitted')
  }
  return $out
}
function DockerInput([string[]]$A,[string]$Code){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$out=$Code|& $dockerExecutable @A 2>&1|Out-String;$exitCode=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($exitCode -ne 0){throw 'Read-only database helper failed; inspect private release log'};return $out}
function Json([string]$Path){ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($Path))}
function Hash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function TextHash([string]$Value){$h=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Compact($Value){ConvertTo-Json -InputObject $Value -Depth 64 -Compress}
function Property($Object,[string]$Name){$p=$Object.PSObject.Properties[$Name];if($null -eq $p){return $null};return $p.Value}
function Atomic([string]$Path,[byte[]]$Bytes){
  # All replacement bytes, including existing .env secrets, are first written
  # inside the already ACL-restricted backup directory on this same C: volume.
  # Unique owned temporaries cannot prevent a later rollback after an I/O error.
  if(-not (Test-Path -LiteralPath $backup)){throw 'Restricted backup directory required for atomic replacement'}
  $token=[guid]::NewGuid().ToString('N');$tmp=Join-Path $backup ('atomic-'+$token+'.tmp');$old=Join-Path $backup ('atomic-'+$token+'.previous.tmp');$created=$false;$committed=$false
  try{
    $stream=[IO.File]::Open($tmp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$created=$true
    try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    if(Test-Path -LiteralPath $old){throw 'Unexpected atomic recovery file'}
    if(Test-Path -LiteralPath $Path){[IO.File]::Replace($tmp,$Path,$old)}else{[IO.File]::Move($tmp,$Path)};$committed=$true
  }finally{
    if($created -and (Test-Path -LiteralPath $tmp)){try{Remove-Item -LiteralPath $tmp -Force}catch{}}
    # Failure to remove an owned recovery copy must not turn a committed write
    # into an apparent failed mutation and then self-block guarded rollback.
    if($committed -and (Test-Path -LiteralPath $old)){try{Remove-Item -LiteralPath $old -Force}catch{}}
  }
}
function Save([string]$Path,$Value){Atomic $Path ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $Value -Depth 64)))}
function Container([string]$Name){@(ConvertFrom-Json -InputObject (Docker @('inspect',$Name)))[0]}
function OptionalContainer([string]$Name){
  if($Name -notmatch '^[A-Za-z0-9_-]+$'){throw 'Unexpected container name'}
  $ids=@(((Docker @('ps','-a','--no-trunc','--filter',('name=^/'+$Name+'$'),'--format','{{.ID}}')) -split "`n")|Where-Object{$_.Trim()}|ForEach-Object{$_.Trim()})
  if($ids.Count -eq 0){return $null};if($ids.Count -ne 1 -or $ids[0] -notmatch '^[a-f0-9]{64}$'){throw 'Canonical container lookup is ambiguous'}
  return Container $ids[0]
}
function Image([string]$Name){@(ConvertFrom-Json -InputObject (Docker @('image','inspect',$Name)))[0]}
function Config([string[]]$EnvFiles=@()){
  if($EnvFiles.Count -eq 0){$EnvFiles=@((Join-Path $Root '.env'),(Join-Path $Root '.env.runtime'))}
  $composeArgs=@($compose);foreach($file in $EnvFiles){if(Test-Path -LiteralPath $file){$composeArgs+=@('--env-file',$file)}}
  ConvertFrom-Json -InputObject (Docker ($composeArgs+@('config','--format','json')))
}
function AssertConfigDiff($Before,$After,[string]$WebImage){
  if($After.services.web.image -ne $WebImage){throw 'Compose does not select the qualified Web image'}
  $copy=ConvertFrom-Json -InputObject (Compact $After);$copy.services.web.image=$Before.services.web.image
  if((Compact $Before) -ne (Compact $copy)){throw 'Effective Compose diff exceeds the Web image field'}
}
function Identity([string]$Name){$c=Container $Name;[pscustomobject][ordered]@{name=$Name;id=$c.Id;image=$c.Image;reference=$c.Config.Image;startedAt=$c.State.StartedAt;running=$c.State.Running}}
function AssertProtected($Baseline){foreach($old in $Baseline.protected){$now=Identity $old.name;if($now.id -ne $old.id -or $now.image -ne $old.image -or $now.startedAt -ne $old.startedAt -or -not $now.running){throw ('Protected service drift: '+$old.name)}}}
function EnvValue($Container,[string]$Name,[switch]$Required){$values=@($Container.Config.Env|Where-Object{$_.StartsWith($Name+'=')});if($values.Count -gt 1 -or ($Required -and $values.Count -ne 1)){throw ('Ambiguous container environment key '+$Name)};if($values.Count -eq 0){return $null};$value=$values[0].Substring($Name.Length+1);if($value.Contains("`n") -or $value.Contains("`r")){throw 'Multiline environment values require separate review'};return $value}
function EnvFile([string]$Path,[string[]]$Lines){foreach($line in $Lines){if($line.Contains("`n") -or $line.Contains("`r") -or $line -notmatch '^[A-Za-z_][A-Za-z0-9_]*='){throw 'Unexpected helper environment format'}};[IO.File]::WriteAllText($Path,($Lines -join "`n")+"`n",(New-Object Text.UTF8Encoding($false)))}
function EnvironmentMap($Values){
  $map=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
  foreach($value in $Values){$at=$value.IndexOf('=');if($at -lt 1 -or $map.ContainsKey($value.Substring(0,$at))){throw 'Unexpected duplicate live environment name'};$map.Add($value.Substring(0,$at),$value.Substring($at+1))}
  return $map
}
function SameEnvironment($A,$B){
  $left=EnvironmentMap $A;$right=EnvironmentMap $B;if($left.Count -ne $right.Count){return $false}
  foreach($key in $left.Keys){if(-not $right.ContainsKey($key) -or $right[$key] -cne $left[$key]){return $false}};return $true
}
function AssertWebRecreation($Web,$Service){
  $image=Image $baseWebId;$expected=EnvironmentMap $image.Config.Env;$actual=EnvironmentMap $Web.Config.Env
  $environment=Property $Service 'environment'
  if($null -ne $environment){foreach($entry in $environment.PSObject.Properties){if($null -eq $entry.Value){throw 'An unresolved Web environment override requires qualification'};$expected[$entry.Name]=[string]$entry.Value}}
  if($expected.Count -ne $actual.Count){throw 'Live Web environment cannot be reproduced from image and Compose; qualification required'}
  foreach($key in $expected.Keys){if(-not $actual.ContainsKey($key) -or $actual[$key] -cne $expected[$key]){throw 'Live Web environment differs from image and Compose; qualification required'}}
  foreach($field in @(@('command','Cmd'),@('entrypoint','Entrypoint'),@('user','User'),@('working_dir','WorkingDir'))){
    $value=Property $Service $field[0];if($null -eq $value){$value=Property $image.Config $field[1]}
    # Actual read-only report SHA256 4b84e624029cf0ad4a2f75be563b3f4fa79a2dbee07da56a8fd80d2d03242e7a:
    # Compose.user and pinned image User are absent, while live User is exactly
    # the empty string. Only that omitted default is normalized; nonempty UIDs
    # (including root/0) and any explicit Compose/image user remain exact.
    if($field[1] -ceq 'User' -and $null -eq $Service.PSObject.Properties['user'] -and $null -eq $image.Config.PSObject.Properties['User']){$value=''}
    if((Compact $value) -cne (Compact (Property $Web.Config $field[1]))){throw ('Live Web '+$field[1]+' cannot be reproduced from image and Compose; qualification required')}
  }
}
function ReadConfiguration(){@($configurationNames|ForEach-Object{if(Test-Path -LiteralPath (Join-Path $Root $_)){[pscustomobject][ordered]@{name=$_;sha256=(Hash (Join-Path $Root $_))}}})}
function AssertCriticalWritableLayer($Web){
  # The assets volume is preserved separately. Do not silently discard a live
  # nginx/entry-point/PWA/brand edit in the container's writable layer or a bind.
  if(@($Web.Mounts).Count -ne 1){throw 'Additional Web mounts require explicit qualification'}
  $assets=@($Web.Mounts|Where-Object{$_.Type -eq 'volume' -and $_.Destination -eq '/usr/share/nginx/html/assets'})
  if($assets.Count -ne 1 -or $assets[0].Name -ne 'clinic-crm-web-assets'){throw 'Unexpected persistent Web assets volume'}
  $critical=@(((Docker @('diff',$Web.Id)) -split "`n")|ForEach-Object{$_.Trim()}|Where-Object{$_ -match '^[ACD]\s+/(etc/nginx(?:/|$)|docker-entrypoint(?:\.sh|\.d)(?:/|$)|usr/share/nginx/html(?:/|$)|opt/temichevvet-web-assets(?:/|$))'})
  if($critical.Count -gt 0){
    # Actual isolated audit 9a84ec07 (report SHA256 03a4ffe514bd8d97a8fe972e1ce33ad927c5eecc5835e7426cfd6f274cc93438):
    # these three copy-up marks have identical base/live/reproduced bytes and
    # type/mode/owner. They are NOT an assumed IPv6 configuration exception.
    $qualified=@('C /etc/nginx','C /etc/nginx/conf.d','C /etc/nginx/conf.d/default.conf')
    if($Web.Image -cne $baseWebId -or $critical.Count -ne $qualified.Count){throw 'Live Web critical writable-layer edits require qualification'}
    foreach($line in $qualified){if($critical -cnotcontains $line){throw 'Live Web critical writable-layer edits require qualification'}}
    # Constant ASCII shell argument, not Windows pipeline stdin. Reject symlinks
    # before stat/hash; only directory byte sizes and timestamps are immaterial.
    $check='set -eu; for p in /etc/nginx /etc/nginx/conf.d; do test ! -L "$p"; test -d "$p"; stat -c "%a:%u:%g" "$p"; done; p=/etc/nginx/conf.d/default.conf; test ! -L "$p"; test -f "$p"; stat -c "%a:%u:%g:%s" "$p"; sha256sum "$p"'
    $actual=@(((Docker @('exec',$Web.Id,'sh','-c',$check)) -split "`n")|ForEach-Object{$_.Trim()}|Where-Object{$_})
    $expected=@('755:0:0','755:0:0','644:0:0:2614','e3f80261c71534350f192c09117e35fbe91a23c133e5adf300574525f018ed16  /etc/nginx/conf.d/default.conf')
    if((Compact $actual) -cne (Compact $expected)){throw 'Qualified nginx copy-up metadata or content changed; requalify instead of replacing Web'}
  }
  return $assets[0].Name
}
function Snapshot(){
  foreach($name in @('docker-compose.yml','.env','.env.runtime')){if(-not (Test-Path -LiteralPath (Join-Path $Root $name))){throw ('Expected current installation file is absent: '+$name)}}
  $web=Container 'clinic-crm-web';$api=Container 'clinic-crm-api';$minio=Container 'clinic-crm-minio';$cfg=Config
  if($web.Image -ne $baseWebId -or $api.Image -ne $apiId -or (Image $baseWeb).Id -ne $baseWebId){throw 'Pinned source images changed; requalify this release'}
  if(-not $web.State.Running -or -not $api.State.Running -or $cfg.services.web.image -ne $web.Config.Image -or $cfg.services.api.image -ne $api.Config.Image){throw 'Running and configured API/Web pins differ'}
  if($web.Config.Labels.'com.docker.compose.project' -ne 'temichevvet' -or $web.Config.Labels.'com.docker.compose.service' -ne 'web' -or $cfg.services.web.container_name -ne 'clinic-crm-web'){throw 'Unexpected Compose project or Web service'}
  $assets=AssertCriticalWritableLayer $web
  AssertWebRecreation $web $cfg.services.web
  $configuredAssets=@($cfg.services.web.volumes|Where-Object{$_.type -eq 'volume' -and $_.target -eq '/usr/share/nginx/html/assets'})
  if($configuredAssets.Count -ne 1 -or (Property $cfg.volumes $configuredAssets[0].source).name -ne $assets){throw 'Compose would replace the existing hashed assets volume'}
  foreach($name in $protectedNames){if(-not (Container $name).State.Running){throw ('Protected service is not running: '+$name)}}
  $minioMount=@($minio.Mounts|Where-Object{$_.Type -eq 'volume' -and $_.Destination -eq '/data'})
  if($minioMount.Count -ne 1 -or $minioMount[0].Name -notmatch '^[A-Za-z0-9_.-]+$' -or @($minio.Mounts).Count -ne 1){throw 'MinIO volume topology requires qualification'}
  if((Compact $minio.Config.Cmd) -ne (Compact @('server','/data','--console-address',':9001'))){throw 'MinIO startup topology requires qualification'}
  $health=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 8
  $release=Invoke-RestMethod 'http://127.0.0.1:3000/release.json' -TimeoutSec 8
  if($health.status -ne 'ok' -or $health.database -ne 'ok' -or $release.revision -ne $baseRevision){throw 'Current local health or Web source revision differs'}
  [pscustomobject][ordered]@{host=$env:COMPUTERNAME;root=$Root;web=(Identity 'clinic-crm-web');api=(Identity 'clinic-crm-api');protected=@($protectedNames|ForEach-Object{Identity $_});configuration=(ReadConfiguration);composeSha256=(TextHash (Compact $cfg));apiEnvironmentSha256=(TextHash (Compact $api.Config.Env));webEnvironmentSha256=(TextHash (Compact $web.Config.Env));webAssetsVolume=$assets;minioVolume=$minioMount[0].Name;minioImage=$minio.Image;webRevision=$release.revision}
}
function AssertBaseline($Baseline){$now=Snapshot;if((TextHash (Compact $now)) -ne (TextHash (Compact $Baseline))){throw 'Fresh preflight baseline drifted; inspect instead of overwriting changes'}}
function AssertNoReparse([string]$Path){$pathToCheck=[IO.Path]::GetFullPath($Path);while($pathToCheck){if(Test-Path -LiteralPath $pathToCheck){if(((Get-Item -LiteralPath $pathToCheck -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Release/backup paths must not cross reparse points'}};$parent=Split-Path $pathToCheck -Parent;if($parent -eq $pathToCheck){break};$pathToCheck=$parent}}
function PrivateDirectory([string]$Path){AssertNoReparse $Path;if(Test-Path -LiteralPath $Path){throw 'Release directory already exists; use a new reviewed release id'};$null=New-Item -ItemType Directory -Path $Path;$who=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $Path /inheritance:r /grant:r ($who+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'Private backup ACL failed'}}
function CopyConfiguration([string]$Directory,$Files){
  $null=New-Item -ItemType Directory -Path $Directory
  $saved=@();$i=0;foreach($file in $Files){$name='configuration-'+$i+'.bin';[IO.File]::WriteAllBytes((Join-Path $Directory $name),[IO.File]::ReadAllBytes((Join-Path $Root $file.name)));if((Hash (Join-Path $Directory $name)) -ne $file.sha256){throw 'Configuration copy changed during capture'};$saved+=[pscustomobject]@{name=$file.name;sha256=$file.sha256;savedName=$name;appliedHash=$file.sha256;plannedName=''};$i++}
  $private=Join-Path $Root 'private';$privateCopies=@()
  if(Test-Path -LiteralPath $private){AssertNoReparse $private;foreach($entry in Get-ChildItem -LiteralPath $private -Recurse -Force){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Private backup source contains a reparse point'}};Copy-Item -LiteralPath $private -Destination (Join-Path $Directory 'private-config') -Recurse -Force;foreach($file in Get-ChildItem -LiteralPath $private -File -Recurse -Force){$relative=$file.FullName.Substring($private.Length).TrimStart('\','/');$sha=Hash $file.FullName;if((Hash (Join-Path (Join-Path $Directory 'private-config') $relative)) -ne $sha){throw 'Private configuration copy changed'};$privateCopies+=[pscustomobject]@{name=$relative;sha256=$sha}}}
  Save (Join-Path $Directory 'private-config-checksums.json') $privateCopies
  return $saved
}

# All rows stay inside PostgreSQL. Only counts and compact aggregate hashes are
# emitted. The dump and original fingerprints use the SAME exported snapshot.
$databaseCode=@'
const fs=require('node:fs'),crypto=require('node:crypto');
const req=require('node:module').createRequire('/app/apps/api/package.json');
const {PrismaClient}=req('@prisma/client');const db=new PrismaClient();
const mode=process.argv[2]||'rights';
const rights=['User','Employee','Role','Permission','EmployeeRole','RolePermission','EmployeePermissionOverride','RemoteAccessPolicy','RemoteAccessDevice'];
async function fingerprints(tx,selected,stableRights=false){
 const available=await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const names=[...(selected||available.map(x=>x.tablename))].sort();const result={};
 for(const name of names){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||!available.some(x=>x.tablename===name))throw Error('Unexpected fingerprint table');
  // Activity bookkeeping changes on normal authenticated requests. Every
  // identity, token/trust/revocation field and every other table stays exact.
  const row=stableRights&&name==='RemoteAccessDevice'?"(to_jsonb(t)-ARRAY['lastSeenAt','lastIpAddress','userAgent','updatedAt']::text[])":'to_jsonb(t)';
  result[name]=(await tx.$queryRawUnsafe(`WITH hashes AS MATERIALIZED (SELECT md5(${row}::text) AS h FROM "${name}" t),numbered AS (SELECT h,row_number() OVER (ORDER BY h) AS rn FROM hashes),chunks AS (SELECT (rn-1)/10000 AS part,count(*) AS n,md5(string_agg(h,'' ORDER BY h)) AS h FROM numbered GROUP BY (rn-1)/10000) SELECT coalesce(sum(n),0)::int AS n,md5(coalesce(string_agg(h,'' ORDER BY part),'')) AS h FROM chunks`))[0];
 }return result;
}
async function run(){
 const url=new URL(process.env.DATABASE_URL);
 if(mode==='hold'&&(url.hostname!=='postgres'||decodeURIComponent(url.pathname.slice(1))!==process.env.QUALIFIED_DATABASE_NAME||decodeURIComponent(url.username)!==process.env.QUALIFIED_DATABASE_USER))throw Error('Protected production database identity differs');
 if(mode==='restore'&&(url.hostname!=='127.0.0.1'||url.pathname!=='/restore_test'||url.username!=='restore_test'))throw Error('Isolated restored database required');
 await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
  await tx.$executeRawUnsafe("SET LOCAL datestyle='ISO, YMD'");
  if(mode==='hold'){
   const snap=(await tx.$queryRawUnsafe('SELECT pg_export_snapshot() AS snapshot'))[0].snapshot;
   const database=(await tx.$queryRawUnsafe('SELECT current_database() AS name'))[0].name;
   fs.writeFileSync('/tmp/snapshot-ready.json',JSON.stringify({snapshot:snap,database}));
  }
  const rows=await fingerprints(tx,mode==='rights'?rights:null,mode==='rights');
  if(mode==='rights'){console.log(JSON.stringify(rows));return;}
  fs.writeFileSync('/tmp/fingerprints.json',JSON.stringify(rows));
  if(mode==='hold')fs.writeFileSync('/tmp/stable-rights.json',JSON.stringify(await fingerprints(tx,rights,true)));
  if(mode==='hold'){
   const deadline=Date.now()+1100000;while(!fs.existsSync('/tmp/release-snapshot')){if(Date.now()>deadline)throw Error('Snapshot lease expired');await new Promise(r=>setTimeout(r,200));}
  }
 },{isolationLevel:'RepeatableRead',timeout:1200000,maxWait:10000});
 if(mode==='restore'){
  const {Client}=req('minio');const s3=new Client({endPoint:'127.0.0.1',port:9000,useSSL:false,accessKey:process.env.S3_ACCESS_KEY||'clinic-crm',secretKey:process.env.S3_SECRET_KEY||'clinic-crm-password',region:process.env.S3_REGION||'us-east-1',pathStyle:process.env.S3_FORCE_PATH_STYLE!=='false'});
  const files=await db.fileObject.findMany({where:{deletedAt:null},select:{storageKey:true,sizeBytes:true,checksumSha256:true}});let checkedBytes=0;
  for(const file of files){const stream=await s3.getObject(process.env.S3_BUCKET||'clinic-crm-local',file.storageKey);const hash=crypto.createHash('sha256');let bytes=0;for await(const chunk of stream){bytes+=chunk.length;hash.update(chunk);}const digest=hash.digest('hex');if(file.sizeBytes!==null&&bytes!==file.sizeBytes)throw Error('Restored object length differs');if(file.checksumSha256&&digest!==file.checksumSha256)throw Error('Restored object checksum differs');checkedBytes+=bytes;}
  fs.writeFileSync('/tmp/referenced-files.json',JSON.stringify({activeFiles:files.length,checkedBytes,allReadable:true,storedLengthsAndChecksumsMatch:true,productionAccess:false}));
 }
}
run().catch(e=>{fs.writeFileSync('/tmp/fingerprint-failure.json',JSON.stringify({stage:mode,type:e.name,code:e.code||null}));process.exitCode=1;}).finally(()=>db.$disconnect());
'@
function Rights(){ConvertFrom-Json -InputObject (DockerInput @('exec','-i','clinic-crm-api','node','-') $databaseCode)}
function WaitHelper([string]$Name,[string]$File,[int]$Attempts=120){
  if($File -notmatch '^/tmp/[a-z-]+\.json$'){throw 'Unexpected helper marker path'}
  $code="const f=require('fs');console.log(f.existsSync('/tmp/fingerprint-failure.json')?'FAILED':f.existsSync('"+$File+"')?'READY':'WAIT')"
  for($i=0;$i -lt $Attempts;$i++){$status=(Docker @('exec',$Name,'node','-e',$code)).Trim();if($status -eq 'FAILED'){throw 'Read-only backup qualification helper failed'};if($status -eq 'READY'){return};if($status -ne 'WAIT'){throw 'Unexpected helper status'};Start-Sleep -Milliseconds 500}
  throw 'Isolated backup helper did not become ready'
}
function RemoveHelper([string]$Name,[string]$Token){$c=Container $Name;if($c.Config.Labels.'io.temichevvet.release' -ne $ReleaseId -or $c.Config.Labels.'io.temichevvet.backup-helper' -ne $Token){throw 'Helper ownership differs; no cleanup performed'};$null=Docker @('rm','-f','-v',$Name)}
function AssertDataBackup([switch]$RequireFresh){
  $s=Json $dataStatePath
  if($s.scriptSha256 -cne (Hash $PSCommandPath)){throw 'Qualified backup producer differs'}
  if($s.releaseId -ne $ReleaseId -or $s.host -ne $env:COMPUTERNAME -or $s.root -ne $Root -or $s.phase -ne 'BACKUP_QUALIFIED' -or -not $s.databaseRestoreTested -or -not $s.filesRestoreTested -or -not $s.referencedFilesTested){throw 'Qualified data backup required'}
  foreach($file in $s.checksums.PSObject.Properties){if((Hash (Join-Path $backup $file.Name)) -ne $file.Value){throw ('Qualified backup differs: '+$file.Name)}}
  # Assign before foreach to avoid nesting a JSON array on PowerShell 5.1.
  $privateCopies=Json (Join-Path $backup 'private-configuration-checksums.json')
  foreach($file in $privateCopies){
    if($null -eq $file){continue}
    if($file -is [System.Array] -or $file.name -isnot [string] -or $file.sha256 -isnot [string] -or [IO.Path]::IsPathRooted($file.name) -or $file.name -match '(^|[\\/])\.\.([\\/]|$)' -or $file.sha256 -notmatch '^[0-9a-f]{64}$'){throw 'Unexpected qualified private-copy path/hash'}
    $copy=Join-Path (Join-Path $backup 'before-data-backup/private-config') $file.name;AssertNoReparse $copy
    if((Hash $copy) -cne $file.sha256){throw 'Qualified private configuration copy differs'}
  }
  if($RequireFresh -and [DateTime]::Parse($s.qualifiedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-2)){throw 'Data backup is older than two hours; prepare a new qualified release backup'}
  return $s
}
function BackupQualify(){
  $baseline=Snapshot;PrivateDirectory $backup
  $saved=CopyConfiguration (Join-Path $backup 'before-data-backup') $baseline.configuration
  Save (Join-Path $backup 'baseline-before-data-backup.private.json') $baseline
  $pg=Container 'clinic-crm-postgres';$api=Container 'clinic-crm-api';$minio=Container 'clinic-crm-minio'
  $user=EnvValue $pg 'POSTGRES_USER' -Required;$database=EnvValue $pg 'POSTGRES_DB' -Required
  if($user -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or $database -notmatch '^[A-Za-z_][A-Za-z0-9_]*$'){throw 'Database identifiers require review'}
  $token=[guid]::NewGuid().ToString('N').Substring(0,12)
  $source='employees-compact-source-'+$token;$files='employees-compact-files-'+$token;$restore='employees-compact-restore-'+$token;$restoredMinio='employees-compact-minio-'+$token;$qualify='employees-compact-qualify-'+$token
  $restoreVolume='employees-compact-files-restore-'+$token;$dump='/tmp/employees-compact-'+$token+'.dump'
  $helpers=New-Object 'System.Collections.Generic.List[string]';$volumeCreated=$false;$dumpCreated=$false;$qualifiedState=$null
  $labels=@('--label',('io.temichevvet.release='+$ReleaseId),'--label',('io.temichevvet.backup-helper='+$token))
  [IO.File]::WriteAllText((Join-Path $backup 'database-qualification.cjs'),$databaseCode,(New-Object Text.UTF8Encoding($false)))
  EnvFile (Join-Path $backup 'source-database.private.env') @(('DATABASE_URL='+(EnvValue $api 'DATABASE_URL' -Required)),('QUALIFIED_DATABASE_NAME='+$database),('QUALIFIED_DATABASE_USER='+$user))
  $restoreEnv=@('DATABASE_URL=postgresql://restore_test:isolated-restore-only@127.0.0.1:5432/restore_test')
  foreach($name in @('S3_ACCESS_KEY','S3_SECRET_KEY','S3_REGION','S3_BUCKET','S3_FORCE_PATH_STYLE')){$value=EnvValue $api $name;if($null -ne $value){$restoreEnv+=($name+'='+$value)}}
  EnvFile (Join-Path $backup 'restored-database.private.env') $restoreEnv
  EnvFile (Join-Path $backup 'minio.private.env') @($minio.Config.Env)
  try{
    $null=Docker (@('run','-d','--pull','never','--network','container:clinic-crm-api','--memory','256m','--cpus','1','--name',$source,'--env-file',(Join-Path $backup 'source-database.private.env'))+$labels+@('--entrypoint','sh',$apiId,'-c','sleep 1800'));$helpers.Add($source)
    $null=Docker @('cp',(Join-Path $backup 'database-qualification.cjs'),($source+':/tmp/qualification.cjs'))
    $null=Docker @('exec','-d',$source,'node','/tmp/qualification.cjs','hold');WaitHelper $source '/tmp/snapshot-ready.json'
    $ready=ConvertFrom-Json -InputObject (Docker @('exec',$source,'cat','/tmp/snapshot-ready.json'))
    if($ready.database -ne $database -or $ready.snapshot -notmatch '^[0-9A-Fa-f-]+$'){throw 'Exported snapshot does not match the protected database'}
    $dumpCreated=$true;$null=Docker @('exec','clinic-crm-postgres','pg_dump','-U',$user,'-d',$database,'-Fc','--snapshot',$ready.snapshot,'--file',$dump)
    $null=Docker @('cp',('clinic-crm-postgres:'+$dump),(Join-Path $backup 'database.dump'))
    WaitHelper $source '/tmp/fingerprints.json' 1200
    $null=Docker @('cp',($source+':/tmp/fingerprints.json'),(Join-Path $backup 'source-all-tables.private.json'))
    WaitHelper $source '/tmp/stable-rights.json' 120
    $null=Docker @('cp',($source+':/tmp/stable-rights.json'),(Join-Path $backup 'source-stable-rights.private.json'))
    $null=Docker @('exec',$source,'node','-e',"require('fs').writeFileSync('/tmp/release-snapshot','release')")
    $null=Docker (@('volume','create')+$labels+@($restoreVolume));$volumeCreated=$true
    $fileCode='set -eu; cd /source; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum > /tmp/files.sha256; tar -cf /tmp/files.tar .; tar -xf /tmp/files.tar -C /restored; cd /restored; sha256sum -c /tmp/files.sha256 >/tmp/files-check.log; find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum > /tmp/restored.sha256; cmp /tmp/files.sha256 /tmp/restored.sha256'
    $null=Docker (@('run','-d','--pull','never','--network','none','--memory','256m','--cpus','1','--name',$files,'--user','0','--mount',('type=volume,src='+$baseline.minioVolume+',dst=/source,readonly'),'--mount',('type=volume,src='+$restoreVolume+',dst=/restored'))+$labels+@('--entrypoint','sh',$apiId,'-c',$fileCode));$helpers.Add($files)
    if((Docker @('wait',$files)).Trim() -ne '0'){throw 'MinIO files copy and isolated extraction differ; backup is not qualified'}
    $null=Docker @('cp',($files+':/tmp/files.tar'),(Join-Path $backup 'files-minio.tar'));$null=Docker @('cp',($files+':/tmp/files.sha256'),(Join-Path $backup 'files-minio.sha256'))
    $null=Docker (@('run','-d','--pull','never','--network','none','--memory','768m','--cpus','1','--name',$restore,'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only')+$labels+@($pg.Image));$helpers.Add($restore)
    $ready=$false;for($i=0;$i -lt 120;$i++){try{$null=Docker @('exec',$restore,'pg_isready','-h','127.0.0.1','-U','restore_test','-d','restore_test');$ready=$true;break}catch{Start-Sleep -Milliseconds 500}};if(-not $ready){throw 'Isolated PostgreSQL did not start'}
    $null=Docker @('cp',(Join-Path $backup 'database.dump'),($restore+':/tmp/database.dump'))
    $null=Docker @('exec',$restore,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump')
    $null=Docker (@('run','-d','--pull','never','--network',('container:'+$restore),'--memory','384m','--cpus','1','--name',$restoredMinio,'--env-file',(Join-Path $backup 'minio.private.env'),'--mount',('type=volume,src='+$restoreVolume+',dst=/data'))+$labels+@($baseline.minioImage,'server','/data','--console-address',':9001'));$helpers.Add($restoredMinio)
    $null=Docker (@('run','-d','--pull','never','--network',('container:'+$restore),'--memory','256m','--cpus','1','--name',$qualify,'--env-file',(Join-Path $backup 'restored-database.private.env'))+$labels+@('--entrypoint','sh',$apiId,'-c','sleep 1800'));$helpers.Add($qualify)
    $null=Docker @('cp',(Join-Path $backup 'database-qualification.cjs'),($qualify+':/tmp/qualification.cjs'))
    $minioReady=$false;for($i=0;$i -lt 120;$i++){try{$null=Docker @('exec',$qualify,'node','-e',"require('http').get('http://127.0.0.1:9000/minio/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))");$minioReady=$true;break}catch{Start-Sleep -Milliseconds 500}};if(-not $minioReady){throw 'Isolated MinIO did not become ready'}
    $out=Docker @('exec',$qualify,'node','/tmp/qualification.cjs','restore');[IO.File]::WriteAllText((Join-Path $backup 'isolated-qualification.private.log'),$out)
    $null=Docker @('cp',($qualify+':/tmp/fingerprints.json'),(Join-Path $backup 'restored-all-tables.private.json'));$null=Docker @('cp',($qualify+':/tmp/referenced-files.json'),(Join-Path $backup 'referenced-files-qualification.json'))
    if((Hash (Join-Path $backup 'source-all-tables.private.json')) -ne (Hash (Join-Path $backup 'restored-all-tables.private.json'))){throw 'Restored full-table fingerprints differ from the exported dump snapshot'}
    AssertBaseline $baseline
    [IO.File]::WriteAllBytes((Join-Path $backup 'private-configuration-checksums.json'),[IO.File]::ReadAllBytes((Join-Path $backup 'before-data-backup/private-config-checksums.json')))
    $checks=[ordered]@{};foreach($name in @('database.dump','files-minio.tar','files-minio.sha256','source-all-tables.private.json','source-stable-rights.private.json','restored-all-tables.private.json','referenced-files-qualification.json','database-qualification.cjs','private-configuration-checksums.json')){$checks[$name]=Hash (Join-Path $backup $name)}
    $state=[pscustomobject][ordered]@{releaseId=$ReleaseId;host=$env:COMPUTERNAME;root=$Root;phase='BACKUP_QUALIFIED';qualifiedAt=[DateTime]::UtcNow.ToString('o');scriptSha256=(Hash $PSCommandPath);baselineAtBackup=$baseline;configuration=$saved;databaseRestoreTested=$true;filesRestoreTested=$true;referencedFilesTested=$true;tableCount=@((Json (Join-Path $backup 'source-all-tables.private.json')).PSObject.Properties).Count;physicalFiles=@(Get-Content -LiteralPath (Join-Path $backup 'files-minio.sha256')).Count;referencedFiles=(Json (Join-Path $backup 'referenced-files-qualification.json'));checksums=[pscustomobject]$checks;productionDatabaseMutated=$false;productionMinioMutated=$false}
    $qualifiedState=$state
  }finally{
    $cleanupErrors=New-Object 'System.Collections.Generic.List[string]'
    # Abort the live read-only snapshot first, even if a different helper's
    # cleanup later fails. Never leave its lease waiting behind failed cleanup.
    if($helpers.Contains($source)){try{RemoveHelper $source $token}catch{$cleanupErrors.Add('source snapshot helper retained')}}
    for($i=$helpers.Count-1;$i -ge 0;$i--){if($helpers[$i] -eq $source){continue};try{RemoveHelper $helpers[$i] $token}catch{$cleanupErrors.Add('isolated helper retained: '+$helpers[$i])}}
    if($volumeCreated){try{$v=@(ConvertFrom-Json -InputObject (Docker @('volume','inspect',$restoreVolume)))[0];if($v.Labels.'io.temichevvet.release' -ne $ReleaseId -or $v.Labels.'io.temichevvet.backup-helper' -ne $token){throw 'Restore volume ownership differs'};$null=Docker @('volume','rm',$restoreVolume)}catch{$cleanupErrors.Add('owned isolated restore volume retained')}}
    if($dumpCreated){try{$null=Docker @('exec','clinic-crm-postgres','rm','-f',$dump)}catch{$cleanupErrors.Add('owned temporary dump retained')}}
    if($cleanupErrors.Count -gt 0){throw ($cleanupErrors -join '; ')}
  }
  if($null -eq $qualifiedState){throw 'Backup qualification did not complete'}
  Save $dataStatePath $qualifiedState
  [pscustomobject]@{status='BACKUP_QUALIFIED';releaseId=$ReleaseId;backup=$backup;tables=$qualifiedState.tableCount;physicalFiles=$qualifiedState.physicalFiles;referencedFiles=$qualifiedState.referencedFiles.activeFiles;databaseSha256=$qualifiedState.checksums.'database.dump';filesSha256=$qualifiedState.checksums.'files-minio.tar';webPacketRequired=$false;helpersRemoved=$true}|ConvertTo-Json -Depth 8
}

function Packet(){
  if(-not $PacketRoot -or $ExpectedPacketManifestSha256 -notmatch '^[0-9a-f]{64}$'){throw 'Verified extracted runtime directory and independently recorded manifest hash required'}
  if(-not [IO.Path]::IsPathRooted($PacketRoot)){throw 'Runtime packet root must be absolute'}
  foreach($entry in Get-ChildItem -LiteralPath $PacketRoot -Recurse -Force){if(($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Runtime packet must not contain reparse points'}}
  $manifestPath=Join-Path $PacketRoot 'payload-files.sha256.json'
  if((Hash $manifestPath) -ne $ExpectedPacketManifestSha256){throw 'Runtime packet manifest anchor differs'}
  $manifest=Json $manifestPath;$paths=@($manifest.PSObject.Properties.Name)
  foreach($entry in $manifest.PSObject.Properties){$name=$entry.Name;if($name -notmatch '^[A-Za-z0-9_./-]+$' -or $name.StartsWith('/') -or @($name.Split('/')).Contains('..') -or ($name -notin @('Dockerfile.web','RELEASE-GATES.md','candidate.json','source-receipt.json','web-files.sha256.json') -and -not $name.StartsWith('web/'))){throw 'Unexpected runtime payload path'};$p=Join-Path $PacketRoot $name;if((Get-Item -LiteralPath $p).Length -ne $entry.Value.bytes -or (Hash $p) -ne $entry.Value.sha256){throw 'Runtime payload content differs'}}
  $actual=@(Get-ChildItem -LiteralPath $PacketRoot -File -Recurse|ForEach-Object{$_.FullName.Substring($PacketRoot.TrimEnd('\','/').Length).TrimStart('\','/').Replace('\','/')}|Where-Object{$_ -ne 'payload-files.sha256.json'})
  if((Compact @($actual|Sort-Object)) -ne (Compact @($paths|Sort-Object))){throw 'Unexpected extra or missing runtime files'}
  $m=Json (Join-Path $PacketRoot 'candidate.json');$source=Json (Join-Path $PacketRoot 'source-receipt.json');$files=Json (Join-Path $PacketRoot 'web-files.sha256.json')
  if($m.revision -notmatch '^[a-f0-9]{40}$' -or -not $m.finalRevisionRecorded -or $m.apiChanged -or $m.sourceBaseRevision -ne $baseRevision -or $m.expectedBase.reference -ne $baseWeb -or $m.expectedBase.imageId -ne $baseWebId -or $m.protectedApiImageId -ne $apiId -or $m.runtimeFilesSha256 -ne (Hash (Join-Path $PacketRoot 'web-files.sha256.json'))){throw 'Final scoped packet provenance differs'}
  $allowed=@('apps/web/src/features/avito/AvitoPage.tsx','apps/web/src/features/avito/avito.api.ts','apps/web/src/features/staffAlerts/StaffAlertsPopover.tsx','apps/web/src/features/staffAlerts/presentation.ts','apps/web/src/features/staffAlerts/staffAlerts.api.ts','apps/web/src/features/staffAlerts/types.ts','apps/web/src/layouts/GlobalOperationalAlerts.tsx','apps/web/src/layouts/useLiveUpdates.ts')
  if($source.revision -ne $m.revision -or $source.baseRevision -ne $baseRevision -or $source.overlaySha256 -ne $m.overlaySha256 -or (Compact @($source.overlay.path|Sort-Object)) -ne (Compact @($allowed|Sort-Object))){throw 'Packet exceeds the eight-file Avito notifications overlay'}
  return $m
}
function Manifest([string]$Target,[switch]$Live){
  $code='set -eu; for p in /etc/nginx /docker-entrypoint.sh /docker-entrypoint.d /usr/share/nginx/html /opt/temichevvet-web-assets; do if test -e "$p"; then find "$p" -type f -print0; fi; done | LC_ALL=C sort -zu | xargs -0 -r sha256sum'
  if($Live){$text=Docker @('exec',$Target,'sh','-c',$code)}else{$text=Docker @('run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','sh',$Target,'-c',$code)}
  $map=[ordered]@{};foreach($line in ($text -split "`n")){if(-not $line.Trim()){continue};if($line.Trim() -notmatch '^([a-f0-9]{64})\s+\*?(/.+)$'){throw 'Image file manifest format differs'};if($map.Contains($matches[2])){throw 'Duplicate image manifest path'};$map[$matches[2]]=$matches[1]};return [pscustomobject]$map
}
function WebState([switch]$RequireFresh,[switch]$SkipPacket){
  $s=Json $webStatePath;$null=AssertDataBackup -RequireFresh:$RequireFresh
  if($s.releaseId -ne $ReleaseId -or $s.scriptSha256 -ne (Hash $PSCommandPath)){throw 'Web state belongs to another release or script'}
  if(-not $SkipPacket){$m=Packet;if($s.packetManifestSha256 -ne $ExpectedPacketManifestSha256 -or $s.revision -ne $m.revision){throw 'Web state belongs to another runtime packet'}}
  return $s
}
function PrepareWeb(){
  $data=AssertDataBackup -RequireFresh;$m=Packet
  if(Test-Path -LiteralPath $webStatePath){throw 'Web state already exists; inspect rather than overwrite'}
  if(-not $PreflightPath -or $ExpectedPreflightSha256 -notmatch '^[0-9a-f]{64}$' -or (Hash $PreflightPath) -ne $ExpectedPreflightSha256){throw 'Fresh independently captured post-APNs preflight receipt and hash required'}
  $preflight=Json $PreflightPath
  if($preflight.status -ne 'READ_ONLY_PREFLIGHT' -or [DateTime]::Parse($preflight.capturedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddMinutes(-15) -or $preflight.baselineSha256 -ne (TextHash (Compact $preflight.baseline))){throw 'Preflight receipt is stale or invalid'}
  AssertBaseline $preflight.baseline
  $baseline=$preflight.baseline;$before=Config;$currentRights=Rights
  $sourceRows=Json (Join-Path $backup 'source-stable-rights.private.json')
  foreach($table in $currentRights.PSObject.Properties){if((Compact $table.Value) -ne (Compact (Property $sourceRows $table.Name))){throw 'Users/rights changed since backup; capture a new qualified backup'}}
  $folder=Join-Path $backup 'before-web';$configuration=CopyConfiguration $folder $baseline.configuration
  Save (Join-Path $folder 'compose-before.private.json') $before;Save (Join-Path $folder 'rights-before.private.json') $currentRights
  Save (Join-Path $folder 'web-container-before.private.json') (Container 'clinic-crm-web')
  $live=Manifest 'clinic-crm-web' -Live;Save (Join-Path $folder 'live-web-files.sha256.json') $live
  $runtimeFiles=Json (Join-Path $PacketRoot 'web-files.sha256.json')
  foreach($entry in $runtimeFiles.PSObject.Properties){if($entry.Name.StartsWith('assets/')){$old=Property $live ('/usr/share/nginx/html/'+$entry.Name);if($null -ne $old -and $old -ne $entry.Value.sha256){throw 'New packet would overwrite an old hashed asset with different bytes'}}}
  $candidate='temichevvet-crm-web:avito-notifications-'+$m.revision.Substring(0,12)+'-r1'
  $rollback='temichevvet-crm-web:rollback-'+$ReleaseId
  $rollbackExists=$false;try{$null=Image $rollback;$rollbackExists=$true}catch{};if($rollbackExists){throw 'Rollback tag already exists; do not overwrite unrelated image state'}
  $null=Docker @('tag',$baseWebId,$rollback);if((Image $rollback).Id -ne $baseWebId){throw 'Rollback image pin differs'}
  $plannedEnv=@();$changedWebPins=0
  foreach($f in $configuration){
    $bytes=[IO.File]::ReadAllBytes((Join-Path $folder $f.savedName));$text=[IO.File]::ReadAllText((Join-Path $Root $f.name));$mutable=$false
    if($f.name -in @('.env','.env.runtime')){
      foreach($key in @('TEMICHEVVET_WEB_IMAGE','TEMICHEVVET_REMOTE_WEB_IMAGE')){$pattern='(?m)^'+$key+'=[^\r\n]*';$count=[regex]::Matches($text,$pattern).Count;if($count -gt 1){throw 'Duplicate existing Web pin'};if($count -eq 1){$text=[regex]::Replace($text,$pattern,($key+'='+$candidate));$mutable=$true;if($key -eq 'TEMICHEVVET_WEB_IMAGE'){$changedWebPins++}}}
      if($mutable){$bom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191;$enc=New-Object Text.UTF8Encoding($bom);$bytes=[byte[]](@($enc.GetPreamble())+@($enc.GetBytes($text)))}
    }elseif($f.name -eq 'diagnostics/bin/system-diagnostics-config.json'){
      $d=Json (Join-Path $Root $f.name);if($null -eq $d.PSObject.Properties['expectedWebRevision']){throw 'Installed diagnostics lacks a separate Web revision field'};$d.expectedWebRevision=$m.revision
      if($null -ne $d.PSObject.Properties['expectedWebImage']){$d.expectedWebImage=$candidate};$bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $d -Depth 32));$mutable=$true
    }
    $f.plannedName='planned-'+$f.savedName;[IO.File]::WriteAllBytes((Join-Path $folder $f.plannedName),$bytes);$f.appliedHash=Hash (Join-Path $folder $f.plannedName)
    if($f.name -in @('.env','.env.runtime')){$plannedEnv+=Join-Path $folder $f.plannedName}
  }
  if($changedWebPins -eq 0){throw 'No existing Web image pin may be changed'}
  AssertConfigDiff $before (Config $plannedEnv) $candidate
  AssertBaseline $baseline
  $s=[pscustomobject][ordered]@{releaseId=$ReleaseId;phase='WEB_PREPARED';preparedAt=[DateTime]::UtcNow.ToString('o');revision=$m.revision;packetManifestSha256=$ExpectedPacketManifestSha256;scriptSha256=(Hash $PSCommandPath);baseline=$baseline;configuration=$configuration;candidateReference=$candidate;candidateId=$null;appliedWeb=$null;rollbackReference=$rollback;rollbackImageId=$baseWebId;completedAt=$null;dataBackupQualifiedAt=$data.qualifiedAt}
  Save $webStatePath $s;Write-Output 'WEB_PREPARED_AGAINST_FRESH_POST_APNS_BASELINE; NO_SERVICE_OR_LIVE_CONFIGURATION_CHANGED'
}
function BuildWeb(){
  $s=WebState -RequireFresh;if($s.phase -ne 'WEB_PREPARED'){throw 'Web prepare phase required'};AssertBaseline $s.baseline
  $imageExists=$false;try{$null=Image $s.candidateReference;$imageExists=$true}catch{};if($imageExists){throw 'Candidate tag already exists; do not overwrite intervening image state'}
  $out=Docker @('build','--platform','linux/amd64','--network','none','--pull=false','--build-arg',('BASE_WEB_IMAGE='+$baseWeb),'--build-arg',('RELEASE_REVISION='+$s.revision),'-f',(Join-Path $PacketRoot 'Dockerfile.web'),'-t',$s.candidateReference,$PacketRoot)
  [IO.File]::WriteAllText((Join-Path $backup 'web-build.private.log'),$out)
  if((Image $baseWeb).Id -ne $baseWebId){throw 'Build base tag drifted'}
  $base=Image $baseWebId;$candidate=Image $s.candidateReference;$m=Packet
  if($candidate.Architecture -ne 'amd64' -or $candidate.Config.Labels.'org.opencontainers.image.revision' -ne $s.revision -or $candidate.Config.Labels.'io.temichevvet.web-source-base' -ne $baseRevision -or $candidate.Config.Labels.'io.temichevvet.web-overlay-sha256' -ne $m.overlaySha256){throw 'Candidate architecture or provenance label differs'}
  foreach($name in @('Entrypoint','Cmd','Env','WorkingDir','User','ExposedPorts','Volumes','Healthcheck','StopSignal','Shell')){if((Compact (Property $base.Config $name)) -ne (Compact (Property $candidate.Config $name))){throw ('Inherited Web image configuration differs: '+$name)}}
  $old=Manifest $baseWebId;$new=Manifest $candidate.Id;$runtime=Json (Join-Path $PacketRoot 'web-files.sha256.json');$allowed=@{}
  foreach($entry in $runtime.PSObject.Properties){$allowed['/usr/share/nginx/html/'+$entry.Name]=$entry.Value.sha256;if($entry.Name.StartsWith('assets/')){$allowed['/opt/temichevvet-web-assets/'+$entry.Name.Substring(7)]=$entry.Value.sha256}}
  foreach($file in $old.PSObject.Properties){$current=Property $new $file.Name;if($null -eq $current){throw 'Candidate removed an inherited file'};if($current -ne $file.Value -and ($file.Name.StartsWith('/usr/share/nginx/html/assets/') -or $file.Name.StartsWith('/opt/temichevvet-web-assets/'))){throw 'Candidate replaced an old hashed bundle'};if($current -ne $file.Value -and -not $allowed.ContainsKey($file.Name)){throw 'Candidate changed a file outside the verified Web payload'}}
  foreach($file in $new.PSObject.Properties){if($null -eq (Property $old $file.Name) -and -not $allowed.ContainsKey($file.Name)){throw 'Candidate added a file outside the verified Web payload'}}
  foreach($path in $allowed.Keys){if((Property $new $path) -ne $allowed[$path]){throw 'Candidate payload file hash differs'}}
  Save (Join-Path $backup 'web-image-before.sha256.json') $old;Save (Join-Path $backup 'web-image-candidate.sha256.json') $new
  $s.candidateId=$candidate.Id;$s.phase='WEB_BUILT';Save $webStatePath $s;AssertBaseline $s.baseline
  [pscustomobject]@{status='WEB_BUILT';image=$s.candidateId;revision=$s.revision;apiChanged=$false;configurationChanged=$false}|ConvertTo-Json
}
function AssertAppliedConfiguration($s,[switch]$AllowOriginal){foreach($f in $s.configuration){$now=Hash (Join-Path $Root $f.name);if($now -ne $f.appliedHash -and -not ($AllowOriginal -and $now -eq $f.sha256)){throw ('Intervening configuration change retained: '+$f.name)}}}
function WaitHealthy([string]$ExpectedWeb,[string]$Revision,[switch]$Public){
  $bases=@('http://127.0.0.1:3000');if($Public){if($PublicBaseUrl -notmatch '^https://[A-Za-z0-9.-]+$'){throw 'Unexpected public verification origin'};$bases+=$PublicBaseUrl.TrimEnd('/')}
  foreach($base in $bases){$successes=0;for($i=0;$i -lt 40;$i++){try{$web=Container 'clinic-crm-web';if($web.Image -ne $ExpectedWeb -or -not $web.State.Running -or (Container 'clinic-crm-api').Image -ne $apiId){throw 'Running image differs'};$h=Invoke-RestMethod ($base+'/api/health') -TimeoutSec 4;$r=Invoke-RestMethod ($base+'/release.json') -TimeoutSec 4;if($h.status -ne 'ok' -or $h.database -ne 'ok' -or $r.revision -ne $Revision){throw 'Served health/revision differs'};$successes++;if($successes -ge 3){break}}catch{$successes=0;if($i -eq 39){throw}};Start-Sleep -Milliseconds 500}}
}
function AssertRetainedAssets($s){$before=Json (Join-Path $backup 'before-web/live-web-files.sha256.json');$now=Manifest 'clinic-crm-web' -Live;foreach($entry in $before.PSObject.Properties){if($entry.Name.StartsWith('/usr/share/nginx/html/assets/') -and (Property $now $entry.Name) -ne $entry.Value){throw 'An old asset used by open tabs was lost or replaced'}};return $now}
function ReplaceWeb(){
  $null=Docker ($compose+@('--env-file',(Join-Path $Root '.env'),'--env-file',(Join-Path $Root '.env.runtime'),'up','-d','--no-deps','--no-build','--pull','never','web'))
}
function AssertOwnedCandidateContainer($Container,$s){
  if($Container.Image -ne $s.candidateId -or $Container.Config.Image -ne $s.candidateReference -or $Container.Config.Labels.'com.docker.compose.project' -ne 'temichevvet' -or $Container.Config.Labels.'com.docker.compose.service' -ne 'web'){throw 'Web candidate provenance differs; recovery refused'}
  if($null -ne $s.appliedWeb -and $Container.Id -ne $s.appliedWeb.id){throw 'Intervening same-image Web replacement retained'}
  $old=Json (Join-Path $backup 'before-web/web-container-before.private.json')
  if(-not (SameEnvironment $Container.Config.Env $old.Config.Env)){throw 'Candidate runtime environment differs; recovery refused'}
  foreach($field in @('Entrypoint','Cmd','User','WorkingDir','Healthcheck')){if((Compact (Property $Container.Config $field)) -ne (Compact (Property $old.Config $field))){throw 'Candidate runtime configuration differs; recovery refused'}}
  if((Compact $Container.HostConfig.PortBindings) -ne (Compact $old.HostConfig.PortBindings)){throw 'Candidate host ports differ; recovery refused'}
  $mounts=@($Container.Mounts);if($mounts.Count -ne 1 -or $mounts[0].Type -ne 'volume' -or $mounts[0].Name -ne $s.baseline.webAssetsVolume -or $mounts[0].Destination -ne '/usr/share/nginx/html/assets'){throw 'Candidate assets mount differs; recovery refused'}
}
function RollbackWeb($s,[switch]$PartialApply){
  AssertProtected $s.baseline;AssertAppliedConfiguration $s -AllowOriginal:$PartialApply
  $now=OptionalContainer 'clinic-crm-web'
  if($null -eq $now){
    $persisted=Json $webStatePath
    if(-not $PartialApply -or $s.phase -ne 'WEB_APPLYING' -or $persisted.phase -ne 'WEB_APPLYING' -or $persisted.releaseId -ne $s.releaseId -or $persisted.candidateId -ne $s.candidateId -or $persisted.scriptSha256 -ne $s.scriptSha256){throw 'Canonical Web is absent outside a persisted owned interrupted apply; rollback refused'}
  }
  if($null -ne $now){if($PartialApply -and $now.Id -eq $s.baseline.web.id -and $now.Image -eq $baseWebId){}else{AssertOwnedCandidateContainer $now $s}}
  $originalRenamed=$null
  $serviceIds=@(((Docker @('ps','-a','--no-trunc','--filter','label=com.docker.compose.project=temichevvet','--filter','label=com.docker.compose.service=web','--format','{{.ID}}')) -split "`n")|Where-Object{$_.Trim()}|ForEach-Object{$_.Trim()})
  foreach($id in $serviceIds){
    if($id -notmatch '^[a-f0-9]{64}$'){throw 'Ambiguous Web service container listing'}
    if($null -ne $now -and $id -eq $now.Id){continue}
    $other=Container $id
    if($other.Id -eq $s.baseline.web.id -and $other.Image -eq $baseWebId){$originalRenamed=$other}else{throw 'Unrecognized renamed Web service container retained; recovery refused'}
  }
  if((Image $s.rollbackReference).Id -ne $baseWebId){throw 'Protected rollback image pin drifted'}
  foreach($file in $s.configuration){if((Hash (Join-Path $backup ('before-web/'+$file.savedName))) -ne $file.sha256){throw 'Saved pre-Web configuration differs'}}
  foreach($file in $s.configuration){if((Hash (Join-Path $Root $file.name)) -ne $file.sha256){Atomic (Join-Path $Root $file.name) ([IO.File]::ReadAllBytes((Join-Path $backup ('before-web/'+$file.savedName))))}}
  $before=Json (Join-Path $backup 'before-web/compose-before.private.json');if((Compact (Config)) -ne (Compact $before)){throw 'Rollback Compose differs from the original configuration'}
  # Compose can rename/remove the old container before candidate creation fails.
  # Recover only the exact inspected original; foreign service containers above
  # cause a refusal. A stopped candidate never needs docker exec to be rolled back.
  if($null -ne $originalRenamed){
    if($null -ne $now -and $now.Id -ne $originalRenamed.Id){AssertOwnedCandidateContainer $now $s;$null=Docker @('rm','-f',$now.Id)}
    if($null -ne (OptionalContainer 'clinic-crm-web')){throw 'Canonical Web appeared during recovery; retained'}
    $null=Docker @('rename',$originalRenamed.Id,'clinic-crm-web')
  }
  ReplaceWeb;WaitHealthy $baseWebId $baseRevision;AssertProtected $s.baseline;$null=AssertRetainedAssets $s
  $s.phase='WEB_ROLLED_BACK';Save $webStatePath $s
  Write-Output 'WEB_ROLLED_BACK; DATABASE_OBJECTS_API_AND_APNS_CONFIGURATION_UNCHANGED'
}
function VerifyWeb($s){
  if((Image $s.candidateReference).Id -ne $s.candidateId){throw 'Candidate image tag drifted'}
  $web=Container 'clinic-crm-web';AssertOwnedCandidateContainer $web $s
  AssertAppliedConfiguration $s;AssertProtected $s.baseline;WaitHealthy $s.candidateId $s.revision -Public
  $before=Json (Join-Path $backup 'before-web/compose-before.private.json');AssertConfigDiff $before (Config) $s.candidateReference
  $now=AssertRetainedAssets $s;$runtime=Json (Join-Path $PacketRoot 'web-files.sha256.json')
  foreach($entry in $runtime.PSObject.Properties){if((Property $now ('/usr/share/nginx/html/'+$entry.Name)) -ne $entry.Value.sha256){throw 'Running Web does not expose the qualified packet'}}
  $rights=Rights;Save (Join-Path $backup 'rights-after-web.private.json') $rights
  if((Compact $rights) -ne (Compact (Json (Join-Path $backup 'before-web/rights-before.private.json')))){throw 'Users/rights changed during Web release; inspect instead of modifying data'}
  AssertProtected $s.baseline
}
switch($Mode){
  'Inspect'{$baseline=Snapshot;[pscustomobject][ordered]@{status='READ_ONLY_PREFLIGHT';capturedAt=[DateTime]::UtcNow.ToString('o');baselineSha256=(TextHash (Compact $baseline));baseline=$baseline;productionMutated=$false}|ConvertTo-Json -Depth 32}
  'BackupQualify'{BackupQualify}
  'PrepareWeb'{PrepareWeb}
  'Build'{BuildWeb}
  'Apply'{
    $s=WebState -RequireFresh;if($s.phase -ne 'WEB_BUILT'){throw 'Qualified built Web state required'};AssertBaseline $s.baseline
    if((Image $s.candidateReference).Id -ne $s.candidateId){throw 'Candidate image pin drifted'}
    $before=Json (Join-Path $backup 'before-web/compose-before.private.json')
    foreach($file in $s.configuration){if((Hash (Join-Path $backup ('before-web/'+$file.plannedName))) -ne $file.appliedHash){throw 'Planned configuration bytes differ'}}
    try{
      $s.phase='WEB_APPLYING';Save $webStatePath $s
      foreach($file in $s.configuration){if($file.appliedHash -ne $file.sha256){Atomic (Join-Path $Root $file.name) ([IO.File]::ReadAllBytes((Join-Path $backup ('before-web/'+$file.plannedName))))}}
      AssertConfigDiff $before (Config) $s.candidateReference;AssertProtected $s.baseline
      ReplaceWeb;$s.appliedWeb=Identity 'clinic-crm-web';Save $webStatePath $s
      VerifyWeb $s;$s.phase='WEB_COMPLETE';$s.completedAt=[DateTime]::UtcNow.ToString('o');Save $webStatePath $s
      Write-Output 'WEB_COMPLETE; ONLY_WEB_REPLACED; API_APNS_DATABASE_MINIO_RIGHTS_AND_OLD_ASSETS_PRESERVED'
    }catch{$failure=$_;RollbackWeb $s -PartialApply;throw ('Web apply failed; guarded Web rollback completed. '+$failure.Exception.Message)}
  }
  'Verify'{$s=WebState;if($s.phase -ne 'WEB_COMPLETE'){throw 'Web release is not complete'};VerifyWeb $s;[pscustomobject]@{status='WEB_VERIFIED';revision=$s.revision;image=$s.candidateId;protectedServices=5;backup=$backup;dataRestoreQualified=$true;apiChanged=$false;schemaChanged=$false;staffMessagesSent=$false}|ConvertTo-Json}
  'Rollback'{$s=WebState -SkipPacket;if($s.phase -notin @('WEB_COMPLETE','WEB_APPLYING')){throw 'This release is not a rollback candidate'};RollbackWeb $s -PartialApply:($s.phase -eq 'WEB_APPLYING')}
}
