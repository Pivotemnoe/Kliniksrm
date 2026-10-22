param([ValidateSet('Prepare','Apply')][string]$Mode='Prepare')
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
$root='C:/Users/TemichevVet/TemichevVet';$packet=$PSScriptRoot;$backup=$root+'/backups/manual-releases/workstation-binding-20261022';$utf=New-Object Text.UTF8Encoding($false)
function RunDocker([string[]]$A){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$s=& docker @A 2>&1|Out-String;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code -ne 0){throw ('Docker '+$A[0]+' failed: '+$s)};return $s}
function Container($n){(ConvertFrom-Json -InputObject (RunDocker @('inspect',$n)))[0]}
function ImageId($n){(ConvertFrom-Json -InputObject (RunDocker @('image','inspect',$n)))[0].Id}
function Hash($p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save($p,$v){[IO.File]::WriteAllText($p,($v|ConvertTo-Json -Depth 40),$utf)}
$m=Get-Content -Raw ($packet+'/manifest.json')|ConvertFrom-Json
foreach($f in $m.files.PSObject.Properties){if($f.Name -match '\.\.' -or (Hash ($packet+'/'+$f.Name)) -ne $f.Value){throw 'Checksum mismatch'}}
$baseApi='temichevvet-crm-api:avito-prices-source-7e4f6b0e946b-r3';$baseWeb='temichevvet-crm-web:api-address-fix-20261022'
$oldApi='sha256:cc979c594ef7b3cb4f346e7b8da81fccca9cac0cd15bc6098a7ffbad38a8d69e';$oldWeb='sha256:b2f578425912ca912ec3e7170df1912fe83feff052238bbac47ef28030ce549d';$fixedWeb='sha256:8b7c67b12ddfc7d64861458c937324e2c7e83b8db7e5a05cd4dc4258fc334105'
$newApi='temichevvet-crm-api:workstation-binding-20261022';$newWeb='temichevvet-crm-web:workstation-binding-20261022'
$compose=@('compose','--project-directory',$root,'--project-name','temichevvet','--file',($root+'/docker-compose.yml'),'--env-file',($root+'/.env'),'--env-file',($root+'/.env.runtime'))
function Config{ConvertFrom-Json -InputObject (RunDocker ($compose+@('config','--format','json')))}
function CheckProtected($items){foreach($p in $items){$c=Container $p.name;if($c.Id -ne $p.id -or $c.State.StartedAt -ne $p.started -or -not $c.State.Running){throw 'Protected service changed'}}}
function Health($ai,$wi){for($i=0;$i -lt 50;$i++){try{$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 3;if($h.status -eq 'ok' -and $h.database -eq 'ok' -and (Container 'clinic-crm-api').Image -eq $ai -and (Container 'clinic-crm-web').Image -eq $wi){return}}catch{};Start-Sleep -Milliseconds 600};throw 'Health failed'}
function Baseline{if((Container 'clinic-crm-api').Image -ne $oldApi -or (Container 'clinic-crm-web').Image -ne $oldWeb){throw 'Runtime changed'};if((ImageId $baseApi) -ne $oldApi -or (ImageId $baseWeb) -ne $fixedWeb){throw 'Base tag changed'}}
if($Mode -eq 'Prepare'){
 Baseline
 if(Test-Path $backup){throw 'Backup exists'}
 $null=New-Item -ItemType Directory $backup
 $account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $backup /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'Backup ACL failed'}
 $before=Config;if([string]$before.services.api.environment.SEED_ON_START -ne 'false'){throw 'Seed enabled'}
 $protected=@();foreach($n in @('clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')){$c=Container $n;$protected+=@{name=$n;id=$c.Id;started=$c.State.StartedAt}}
 $configs=@();foreach($name in @('.env','.env.runtime','docker-compose.yml')){$path=$root+'/'+$name;[IO.File]::WriteAllBytes(($backup+'/before-'+$name),[IO.File]::ReadAllBytes($path));$configs+=@{name=$name;hash=(Hash $path)}}
 foreach($kind in @('api','web')){$tag=if($kind -eq 'api'){$newApi}else{$newWeb};$log=RunDocker @('build','--network','none','--pull=false','-f',($packet+'/Dockerfile.'+$kind),'-t',$tag,$packet);[IO.File]::WriteAllText(($backup+'/'+$kind+'-build.log'),$log,$utf)}
 $null=RunDocker @('run','--rm','--network','none','--entrypoint','node',$newApi,'-e',"require('/app/apps/api/dist/modules/queue/queue.service.js');const p=require('/app/node_modules/@prisma/client');if(!p.Prisma.dmmf.datamodel.models.find(m=>m.name==='QueueWorkstation').fields.some(f=>f.name==='isReception'))throw Error('Missing field');console.log('candidate qualified')")
 $pg=Container 'clinic-crm-postgres';$user=(@($pg.Config.Env|Where-Object{$_ -like 'POSTGRES_USER=*'})[0]).Substring(14);$database=(@($pg.Config.Env|Where-Object{$_ -like 'POSTGRES_DB=*'})[0]).Substring(12)
 $dump='/tmp/workstation-binding-20261022.dump';$null=RunDocker @('exec','clinic-crm-postgres','pg_dump','-U',$user,'-d',$database,'-Fc','--file',$dump);$null=RunDocker @('exec','clinic-crm-postgres','pg_restore','--list',$dump);$null=RunDocker @('cp',('clinic-crm-postgres:'+$dump),($backup+'/database.dump'));$null=RunDocker @('exec','clinic-crm-postgres','rm',$dump)
 Baseline;CheckProtected $protected
 Save ($backup+'/state.json') @{apiId=(ImageId $newApi);webId=(ImageId $newWeb);protected=$protected;configs=$configs;manifest=(Hash ($packet+'/manifest.json'));revision=$m.revision;phase='PREPARED'}
 Write-Output 'PREPARED: uploaded, built and database backup saved; running services unchanged';return
}
$s=Get-Content -Raw ($backup+'/state.json')|ConvertFrom-Json
if($s.phase -ne 'PREPARED' -or $s.manifest -ne (Hash ($packet+'/manifest.json'))){throw 'Not prepared'}
Baseline;CheckProtected $s.protected
foreach($f in $s.configs){if((Hash ($root+'/'+$f.name)) -ne $f.hash){throw 'Concurrent config change'}}
if((ImageId $newApi) -ne $s.apiId -or (ImageId $newWeb) -ne $s.webId){throw 'Candidate drift'}
$before=Config
try{
 foreach($name in @('.env','.env.runtime')){$p=$root+'/'+$name;$t=[IO.File]::ReadAllText($p);foreach($pair in @(@('TEMICHEVVET_API_IMAGE',$newApi),@('TEMICHEVVET_WEB_IMAGE',$newWeb),@('TEMICHEVVET_REMOTE_API_IMAGE',$newApi),@('TEMICHEVVET_REMOTE_WEB_IMAGE',$newWeb))){$t=[regex]::Replace($t,('(?m)^'+$pair[0]+'=[^\r\n]*'),($pair[0]+'='+$pair[1]))};[IO.File]::WriteAllText($p,$t,$utf)}
 $after=Config;if($after.services.api.image -ne $newApi -or $after.services.web.image -ne $newWeb){throw 'Pins not applied'};$after.services.api.image=$before.services.api.image;$after.services.web.image=$before.services.web.image;if(($after|ConvertTo-Json -Depth 40 -Compress) -ne ($before|ConvertTo-Json -Depth 40 -Compress)){throw 'Unexpected compose change'}
 $null=RunDocker ($compose+@('up','-d','--no-deps','--no-build','--pull','never','api','web'))
 # This production Compose starts Node directly; migrations must be applied explicitly.
 $guard = @'
const fs=require('fs');const {PrismaClient}=require('/app/node_modules/@prisma/client');const p=new PrismaClient();(async()=>{const rows=await p.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');const done=new Set(rows.map(r=>r.migration_name));const pending=fs.readdirSync('/app/prisma/migrations').filter(n=>fs.existsSync('/app/prisma/migrations/'+n+'/migration.sql')&&!done.has(n));if(pending.some(n=>n!=='20261022113000_workstation_reception'))throw Error('Unexpected pending migrations');})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
'@
 $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($guard))
 $null=RunDocker @('exec','clinic-crm-api','node','-e',("eval(Buffer.from('"+$encoded+"','base64').toString())"))
 $null=RunDocker @('exec','-e','PGOPTIONS=-c lock_timeout=5000 -c statement_timeout=30000','clinic-crm-api','node','/app/node_modules/prisma/build/index.js','migrate','deploy','--schema','/app/prisma/schema.prisma')
 Health $s.apiId $s.webId;CheckProtected $s.protected
 $r=Invoke-RestMethod 'http://127.0.0.1:3000/release.json' -TimeoutSec 5;if($r.revision -ne $m.revision){throw 'Web revision mismatch'}
 $s.phase='COMPLETE';Save ($backup+'/state.json') $s;Write-Output ('COMPLETE '+$m.revision+'; health/database OK; protected services unchanged')
}catch{
 $failure=$_;foreach($name in @('.env','.env.runtime')){[IO.File]::WriteAllBytes(($root+'/'+$name),[IO.File]::ReadAllBytes(($backup+'/before-'+$name)))}
 $null=RunDocker ($compose+@('up','-d','--no-deps','--no-build','--pull','never','api','web'));Health $oldApi $fixedWeb;CheckProtected $s.protected;throw $failure
}
