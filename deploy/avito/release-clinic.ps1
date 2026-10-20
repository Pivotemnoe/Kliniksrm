[CmdletBinding()]
param(
  [ValidateSet('Inspect','Apply','Rollback')][string]$Mode='Inspect',
  [string]$Root='C:\Users\TemichevVet\TemichevVet',
  [string]$PackagePath=$PSScriptRoot,
  [switch]$SyntheticQa
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=[Console]::OutputEncoding
if(-not $SyntheticQa -and $env:COMPUTERNAME -ne 'WIN-I123AM83GR4') { throw 'Wrong clinic host' }
$apiName='clinic-crm-api';$webName='clinic-crm-web';$projectName='temichevvet'
$healthUrl='http://127.0.0.1:3000/api/health';$releaseUrl='http://127.0.0.1:3000/release.json'
if($SyntheticQa) {
  if(-not $Root.StartsWith('/qa/') -or -not $PackagePath.StartsWith('/qa/')) { throw 'Synthetic acceptance must use /qa paths' }
  $apiName='crm-grooming-integration-qa-api-1';$webName='crm-grooming-integration-qa-web-1';$projectName='crm-grooming-integration-qa'
  $healthUrl='http://web/api/health';$releaseUrl='http://web/release.json'
}
$manifest=Get-Content (Join-Path $PackagePath 'release.json') -Raw | ConvertFrom-Json
$backup=Join-Path $Root ('backups/manual-releases/'+$manifest.releaseId)
$statePath=Join-Path $backup 'avito-state.json'
function Invoke-AvitoDocker([string[]]$Arguments) {
  $savedPreference=$ErrorActionPreference
  try { $ErrorActionPreference='Continue';$result=& docker @Arguments 2>&1 | Out-String;$code=$LASTEXITCODE } finally { $ErrorActionPreference=$savedPreference }
  if($code -ne 0) { throw "Docker $($Arguments[0]) failed: $result" };return $result
}
function Container([string]$Name) { return @(ConvertFrom-Json (Invoke-AvitoDocker -Arguments @('inspect',$Name)))[0] }
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Compose([string[]]$Arguments) {
  $base=@('compose','--project-directory',$Root,'--project-name',$projectName,'--file',(Join-Path $Root 'docker-compose.yml'),'--env-file',(Join-Path $Root '.env'))
  if(Test-Path (Join-Path $Root '.env.runtime')) { $base+=@('--env-file',(Join-Path $Root '.env.runtime')) }
  return Invoke-AvitoDocker -Arguments ($base+$Arguments)
}
function Put-Env([string]$Path,[hashtable]$Values) {
  $bytes=[IO.File]::ReadAllBytes($Path)
  $bom=$bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  $text=[IO.File]::ReadAllText($Path)
  foreach($key in $Values.Keys) {
    $pattern='(?m)^'+[regex]::Escape($key)+'=[^\r\n]*'
    if([regex]::Matches($text,$pattern).Count -gt 1) { throw "Duplicate setting: $key" }
    if([regex]::IsMatch($text,$pattern)) { $text=[regex]::Replace($text,$pattern,($key+'='+$Values[$key])) }
    else { $text=$text.TrimEnd()+"`r`n"+$key+'='+$Values[$key]+"`r`n" }
  }
  [IO.File]::WriteAllText($Path,$text,(New-Object Text.UTF8Encoding($bom)))
}
function Assert-Protected($Items) {
  foreach($item in $Items) { if($item.name -eq $apiName) { continue };$c=Container $item.name;if($c.Id -ne $item.id -or $c.State.StartedAt -ne $item.started -or $c.Image -ne $item.image) { throw "Protected service changed: $($item.name)" } }
}
function Reload-WebUpstream {
  # Nginx resolves the API service when its workers start. Refresh that address
  # gracefully after API recreation, while keeping the Web container and pages.
  $null=Invoke-AvitoDocker -Arguments @('exec',$webName,'nginx','-t')
  $null=Invoke-AvitoDocker -Arguments @('exec',$webName,'nginx','-s','reload')
}
function Restore-Configuration($State,[switch]$OwnedFailure) {
  foreach($file in $State.configuration) {
    $live=Join-Path $Root $file.name
    if(-not $OwnedFailure -and (Hash $live) -ne $file.appliedHash) { throw "Rollback refuses changed configuration: $($file.name)" }
  }
  foreach($file in $State.configuration) { [IO.File]::WriteAllBytes((Join-Path $Root $file.name),[IO.File]::ReadAllBytes((Join-Path $backup $file.savedName))) }
}
function Wait-Healthy([string]$ApiId,[string]$WebId,[switch]$Candidate) {
  for($i=0;$i -lt 45;$i++) {
    try {
      $a=Container $apiName;$w=Container $webName
      if($a.Image -ne $ApiId -or $w.Image -ne $WebId -or -not $a.State.Running -or -not $w.State.Running) { throw 'Application images are not ready' }
      $health=Invoke-RestMethod $healthUrl -TimeoutSec 4
      if($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'Health is not ready' }
      if($Candidate -and $a.Config.Env -notcontains ('TEMICHEVVET_GIT_COMMIT='+$manifest.revision)) { throw 'API revision differs' }
      return
    } catch { Start-Sleep -Seconds 2 }
  };throw 'Application did not recover'
}
$api=Container $apiName;$web=Container $webName
if($Mode -eq 'Inspect') {
  [PSCustomObject]@{host=$env:COMPUTERNAME;api=$api.Config.Image;apiId=$api.Image;web=$web.Config.Image;webId=$web.Image;release=$manifest.releaseId;health=(Invoke-RestMethod $healthUrl -TimeoutSec 5)} | ConvertTo-Json -Depth 4
  return
}
if($Mode -eq 'Rollback') {
  $state=Get-Content $statePath -Raw | ConvertFrom-Json
  if($api.Image -ne $state.candidateApiId -or $web.Image -ne $state.candidateWebId) { throw 'Rollback refuses an unrelated release' }
  Assert-Protected $state.protected
  Restore-Configuration $state
  $null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api')
  Reload-WebUpstream
  Wait-Healthy $state.previousApiId $state.previousWebId
  Assert-Protected $state.protected
  $state.phase='ROLLED_BACK';$state|ConvertTo-Json -Depth 9|Set-Content $statePath -Encoding UTF8
  [PSCustomObject]@{completedAt=[DateTime]::UtcNow.ToString('o');release=$manifest.releaseId;apiId=$state.previousApiId;webId=$state.previousWebId;recordsRestored=$false}|ConvertTo-Json|Set-Content (Join-Path $backup 'rollback-receipt.json') -Encoding UTF8
  Write-Output 'ROLLBACK_OK: previous application images/configuration restored. Current records and additive Avito tables preserved.'
  return
}
if($api.Image -ne $manifest.previous.api.id -or $web.Image -ne $manifest.previous.web.id) { throw 'Current images differ from the coordinated release baseline' }
if(Test-Path $statePath) { throw 'A release state already exists; inspect it instead of repeating Apply' }
$verified=Get-Content (Join-Path $backup 'verified-backup.json') -Raw | ConvertFrom-Json
if(-not $verified.verified -or -not $verified.restoreTested -or -not $verified.avitoMigrationsRehearsed -or [DateTime]::Parse($verified.capturedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-2)) { throw 'A recent verified backup and Avito migration rehearsal are required' }
if((Hash (Join-Path $backup $verified.database.name)) -ne $verified.database.sha256) { throw 'Backup hash differs' }
foreach($item in $verified.protected) { $c=Container $item.name;if($c.Id -ne $item.id -or $c.State.StartedAt -ne $item.started) { throw "Service changed since backup: $($item.name)" } }
foreach($component in @('api')) {
  $image=@(ConvertFrom-Json (Invoke-AvitoDocker -Arguments @('image','inspect',$manifest.images.$component.reference)))[0]
  if($image.Id -ne $manifest.images.$component.id -or $image.Architecture -ne 'amd64' -or $image.Config.Labels.'org.opencontainers.image.revision' -ne $manifest.revision) { throw "Candidate identity differs: $component" }
}
$beforeConfig=ConvertFrom-Json (Compose -Arguments @('config','--format','json'))
if($beforeConfig.services.api.image -ne $api.Config.Image -or $beforeConfig.services.web.image -ne $web.Config.Image -or $beforeConfig.services.api.environment.SEED_ON_START -ne 'false') { throw 'Compose differs from the running installation or seeding is enabled' }
$configuration=@()
foreach($name in @('.env','.env.runtime','docker-compose.yml','diagnostics/bin/system-diagnostics-config.json')) {
  $live=Join-Path $Root $name
  if(Test-Path $live) { $savedName='before-'+$name.Replace('/','-');if(-not(Test-Path (Join-Path $backup $savedName))) { throw "Configuration backup missing: $name" };$configuration += [PSCustomObject]@{name=$name;savedName=$savedName;appliedHash=''} }
}
$state=[PSCustomObject]@{release=$manifest.releaseId;root=$Root;previousApiId=$api.Image;previousWebId=$web.Image;candidateApiId=$manifest.images.api.id;candidateWebId=$manifest.images.web.id;protected=$verified.protected;configuration=$configuration;phase='PREPARED'}
$state | ConvertTo-Json -Depth 9 | Set-Content $statePath -Encoding UTF8
$appsStarted=$false
try {
  $keyFile=Join-Path $Root 'private/avito-credentials.env'
  if(-not(Test-Path -LiteralPath $keyFile)) { throw 'Private Avito credential file is missing' }
  $values=@{TEMICHEVVET_API_IMAGE=$manifest.images.api.reference;TEMICHEVVET_REMOTE_API_IMAGE=$manifest.images.api.reference;CRM_SOURCE_VERSION=$manifest.revision;AVITO_INGEST_ENABLED='false';AVITO_LIVE_SEND_ENABLED='false';AVITO_AI_ENABLED='false'}
  foreach($name in @('.env','.env.runtime')) { $path=Join-Path $Root $name;if(Test-Path $path) { Put-Env $path $values } }
  $composePath=Join-Path $Root 'docker-compose.yml';$text=[IO.File]::ReadAllText($composePath)
  if([regex]::IsMatch($text,'(?m)^      AVITO_')) { throw 'Existing Avito configuration must be inspected' }
  $match=[regex]::Match($text,'(?ms)^  api:\r?\n.*?(?=^  [A-Za-z0-9_-]+:|\z)')
  if(-not $match.Success) { throw 'API service block missing' }
  $apiText=$match.Value
  if([regex]::Matches($apiText,'(?m)^    volumes:').Count -ne 1 -or [regex]::Matches($apiText,'(?m)^      CRM_SOURCE_VERSION:').Count -ne 1) { throw 'Unexpected API Compose layout' }
  $envLines=@('      AVITO_CREDENTIALS_FILE: /run/secrets/avito-credentials.env','      AVITO_INGEST_ENABLED: ${AVITO_INGEST_ENABLED:-false}','      AVITO_LIVE_SEND_ENABLED: ${AVITO_LIVE_SEND_ENABLED:-false}','      AVITO_AI_ENABLED: ${AVITO_AI_ENABLED:-false}')
  $apiText=[regex]::Replace($apiText,'(?m)^      CRM_SOURCE_VERSION:',([string]::Join("`n",$envLines)+"`n      CRM_SOURCE_VERSION:"))
  $apiText=[regex]::Replace($apiText,'(?m)^    volumes:',"    volumes:`n      - ./private/avito-credentials.env:/run/secrets/avito-credentials.env:ro")
  $text=$text.Substring(0,$match.Index)+$apiText+$text.Substring($match.Index+$match.Length)
  [IO.File]::WriteAllText($composePath,$text,(New-Object Text.UTF8Encoding($false)))
  $diagnostics=Join-Path $Root 'diagnostics/bin/system-diagnostics-config.json'
  if(Test-Path $diagnostics) { $d=Get-Content $diagnostics -Raw|ConvertFrom-Json;$d|Add-Member -NotePropertyName expectedRevision -NotePropertyValue $manifest.revision -Force;[IO.File]::WriteAllText($diagnostics,($d|ConvertTo-Json -Depth 32),(New-Object Text.UTF8Encoding($false))) }
  $afterConfig=ConvertFrom-Json (Compose -Arguments @('config','--format','json'))
  foreach($key in @('DATABASE_URL','REDIS_URL','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY','S3_SECRET_KEY','REMOTE_ACCESS_GATEWAY_SECRET','OWNER_GATEWAY_SYNC_SECRET','OWNER_GATEWAY_URL','APP_URL','SEED_ON_START','GROOMING_CRM_SYNC_ENABLED','GROOMING_BOOKING_SIGNING_SECRET','GROOMING_STAFF_PUSH_ENABLED','GROOMING_STAFF_VAPID_PUBLIC_KEY','GROOMING_STAFF_VAPID_PRIVATE_KEY')) { if(($beforeConfig.services.api.environment.PSObject.Properties[$key] | ForEach-Object {$_.Value}) -ne ($afterConfig.services.api.environment.PSObject.Properties[$key] | ForEach-Object {$_.Value})) { throw "Protected setting changed: $key" } }
  if($afterConfig.services.api.image -ne $manifest.images.api.reference -or $afterConfig.services.web.image -ne $manifest.images.web.reference -or $afterConfig.services.api.environment.AVITO_INGEST_ENABLED -ne 'false' -or $afterConfig.services.api.environment.AVITO_LIVE_SEND_ENABLED -ne 'false' -or $afterConfig.services.api.environment.AVITO_AI_ENABLED -ne 'false') { throw 'Avito configuration did not reach Compose' }
  foreach($file in $state.configuration) { $file.appliedHash=Hash (Join-Path $Root $file.name) }
  $state.phase='CONFIGURED';$state|ConvertTo-Json -Depth 9|Set-Content $statePath -Encoding UTF8
  $null=Compose -Arguments @('run','--rm','--no-deps','-T','--entrypoint','/app/node_modules/.bin/prisma','api','migrate','deploy','--schema','/app/prisma/schema.prisma')
  $state.phase='MIGRATED';$state|ConvertTo-Json -Depth 9|Set-Content $statePath -Encoding UTF8
  $appsStarted=$true
  $null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api')
  Reload-WebUpstream
  Wait-Healthy $manifest.images.api.id $manifest.images.web.id -Candidate
  $null=Invoke-AvitoDocker -Arguments @('cp',(Join-Path $PackagePath 'initialization'),($apiName+':/tmp/avito-initialization'))
  $initialized=Invoke-AvitoDocker -Arguments @('exec','-e','AVITO_RELEASE_EXECUTE=clinic-20261020','-e',('AVITO_RELEASE_ACTOR_ID='+$manifest.actorId),$apiName,'node','/tmp/avito-initialization/initialize-module.cjs')
  $null=Invoke-AvitoDocker -Arguments @('cp',($apiName+':/tmp/avito-initialization/initialization-receipt.json'),(Join-Path $backup 'initialization-receipt.json'))
  $null=Invoke-AvitoDocker -Arguments @('exec',$apiName,'rm','-rf','/tmp/avito-initialization')
  Assert-Protected $state.protected
  $state.phase='COMPLETE';$state|ConvertTo-Json -Depth 9|Set-Content $statePath -Encoding UTF8
  [PSCustomObject]@{completedAt=[DateTime]::UtcNow.ToString('o');release=$manifest.releaseId;revision=$manifest.revision;api=$manifest.images.api;web=$manifest.images.web;module=(ConvertFrom-Json $initialized);protected=$state.protected;backupPath=$backup;clinicalDataRestored=$false}|ConvertTo-Json -Depth 9|Set-Content (Join-Path $backup 'deployment-receipt.json') -Encoding UTF8
  Write-Output 'APPLY_OK: separate Avito clinic module enabled in MANUAL mode; Web and protected services retained; no outgoing workers enabled.'
} catch {
  $failure=$_
  try {
    if($state.phase -eq 'CONFIGURED' -and -not $appsStarted) {
      $querySource="const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{try{const r=await p.`$queryRawUnsafe('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');console.log(JSON.stringify(r));await p.`$disconnect();process.exit(0)}catch(e){console.error(e.message);await p.`$disconnect();process.exit(1)}})();"
      $queryEncoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($querySource))
      $failed=ConvertFrom-Json (Invoke-AvitoDocker -Arguments @('exec',$apiName,'node','-e',("eval(Buffer.from('"+$queryEncoded+"','base64').toString())")))
      foreach($row in @($failed)) {
        if($row.migration_name -notin @('20261020090000_avito_clinic_module')) { throw 'An unrelated failed migration requires inspection' }
        $null=Compose -Arguments @('run','--rm','--no-deps','-T','--entrypoint','/app/node_modules/.bin/prisma','api','migrate','resolve','--rolled-back',$row.migration_name,'--schema','/app/prisma/schema.prisma')
      }
    }
  } finally { Restore-Configuration $state -OwnedFailure }
  if($appsStarted) { $null=Compose -Arguments @('up','-d','--no-deps','--no-build','--pull','never','api');Reload-WebUpstream;Wait-Healthy $state.previousApiId $state.previousWebId }
  Assert-Protected $state.protected
  throw $failure
}
