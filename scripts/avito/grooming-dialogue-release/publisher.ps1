param([ValidateSet('Prepare','Apply','Verify','Rollback')][string]$Mode='Prepare',[Parameter(Mandatory=$true)][string]$PrivatePlanPath,[Parameter(Mandatory=$true)][string]$ExpectedBaseImage,[Parameter(Mandatory=$true)][string]$BaseReference,[string]$ExpectedCandidateImage='')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
$plan=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($PrivatePlanPath))
if($env:COMPUTERNAME-ne$plan.expectedComputerName){throw 'Wrong host'}
if($plan.sourceCommit-notmatch'^[a-f0-9]{40}$'-or$plan.archiveSha256-notmatch'^[a-f0-9]{64}$'-or$plan.accountId-notmatch'^\d{1,20}$'-or$plan.release-notmatch'^avito-grooming-dialogue-[a-z0-9-]{5,80}$'){throw 'Invalid private release plan'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG=Join-Path $env:USERPROFILE '.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
$Root=[IO.Path]::GetFullPath($plan.root);$Release=$plan.release;$Packet=Join-Path $Root ('releases/'+$Release);$Backup=Join-Path $Root ('backups/manual-releases/'+$Release);$StatePath=Join-Path $Backup 'prepared.json';$Tag=$plan.candidateReference
function D([string[]]$A){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$s=& docker @A 2>&1|Out-String;$code=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($code-ne0){throw ('Docker failed: '+$s)};return [string]$s}
function C([string]$N){return (ConvertFrom-Json -InputObject (D @('inspect',$N)))[0]}
function I([string]$N){return (ConvertFrom-Json -InputObject (D @('image','inspect',$N)))[0]}
function J([string]$P){ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($P))}
function FileSha([string]$P){return (Get-FileHash -LiteralPath $P -Algorithm SHA256).Hash.ToLowerInvariant()}
# BEGIN IO AND SCOPE HELPERS
function ByteSha([byte[]]$B){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($B))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Canonical($V){
 if($null-eq$V){return 'null'};if($V-is[string]-or$V-is[ValueType]){return ConvertTo-Json -InputObject $V -Depth 65 -Compress}
 if($V-is[Collections.IEnumerable]-and$V-isnot[Collections.IDictionary]-and$V-isnot[pscustomobject]){$items=@(foreach($x in $V){Canonical $x});return '['+($items-join',')+']'}
 $names=if($V-is[Collections.IDictionary]){@($V.Keys|Sort-Object)}else{@($V.PSObject.Properties|ForEach-Object{$_.Name}|Sort-Object)}
 $items=@(foreach($name in $names){if($V-is[Collections.IDictionary]){$value=$V[$name]}else{$value=$V.$name};(ConvertTo-Json -InputObject ([string]$name) -Compress)+':'+(Canonical $value)});return '{'+($items-join',')+'}'
}
function Same($A,$B){return (Canonical $A)-ceq(Canonical $B)}
function DigestToken([string]$H){if($H-eq'NEW'){return 'NEW'};$b=[byte[]]@(for($i=0;$i-lt64;$i+=2){[Convert]::ToByte($H.Substring($i,2),16)});return [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')}
function TokenDigest([string]$T){if($T-eq'NEW'){return 'NEW'};return ([BitConverter]::ToString([Convert]::FromBase64String($T.Replace('-','+').Replace('_','/')+'='))).Replace('-','').ToLowerInvariant()}
function RecoverAtomic([string]$P){
 if(-not(Test-Path $script:AtomicRoot)){return};$id=(ByteSha ([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($P).ToLowerInvariant()))).Substring(0,16)
 foreach($f in @(Get-ChildItem -LiteralPath $script:AtomicRoot -File |Where-Object{$_.Name.StartsWith($id+'.')})){
  if($f.Name-notmatch'^[a-f0-9]{16}\.(NEW|[A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.(tmp|bak)$'){throw 'Unknown atomic artifact'};$before=TokenDigest $matches[1];$after=TokenDigest $matches[2];$kind=$matches[3];$current=if(Test-Path $P){FileSha $P}else{'NEW'}
  if($current-ne$before-and$current-ne$after){throw 'Atomic state outside recorded before/after'}
  if($kind-eq'bak'-and(FileSha $f.FullName)-ne$before){throw 'Atomic backup digest differs'}
  if($current-eq$after-and$kind-eq'tmp'-and(FileSha $f.FullName)-ne$after){throw 'Committed atomic temporary digest differs'}
  [IO.File]::Delete($f.FullName)
 }
}
function Atomic([string]$P,[byte[]]$Bytes){
 $null=New-Item -ItemType Directory -Path $script:AtomicRoot -Force;RecoverAtomic $P
 $after=ByteSha $Bytes;$before=if(Test-Path $P){FileSha $P}else{'NEW'};if($before-eq$after){return}
 $id=(ByteSha ([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($P).ToLowerInvariant()))).Substring(0,16);$stem=Join-Path $script:AtomicRoot ($id+'.'+(DigestToken $before)+'.'+(DigestToken $after));$t=$stem+'.tmp';$b=$stem+'.bak'
 try{$stream=[IO.File]::Open($t,[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($Bytes,0,$Bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()};if($script:IoFault-eq'BeforeReplace'){throw 'Injected before replace'};if($before-eq'NEW'){[IO.File]::Move($t,$P)}else{[IO.File]::Replace($t,$P,$b)};if($script:IoFault-eq'AfterReplace'){throw 'Injected after replace'}}
 catch{if((Test-Path $P)-and(FileSha $P)-eq$after){RecoverAtomic $P;return};throw}
 RecoverAtomic $P
}
function Save([string]$P,$V){Atomic $P ([Text.Encoding]::UTF8.GetBytes(($V|ConvertTo-Json -Depth 65)))}
function PinBytes([string]$P){
 $t=[Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($P))
 foreach($key in @('TEMICHEVVET_API_IMAGE','TEMICHEVVET_REMOTE_API_IMAGE')){$pattern='(?m)^(?<bom>\uFEFF?)'+$key+'=[^\r\n]*';$n=[regex]::Matches($t,$pattern).Count;if($n-gt1){throw 'Duplicate API pin'};if($n){$t=[regex]::Replace($t,$pattern,('${bom}'+$key+'='+$Tag))}}
 return [Text.Encoding]::UTF8.GetBytes($t)
}
function PinPlan{foreach($f in $State.configuration|Where-Object{$_.name-in@('.env','.env.runtime')}){$old=Join-Path $Backup $f.name;if((FileSha $old)-ne$f.sha256){throw 'Original private configuration backup differs'};[pscustomobject]@{name=$f.name;beforeSha256=$f.sha256;afterSha256=(ByteSha (PinBytes $old))}}}
function SetApiPins([switch]$Restore){
 $n=0;foreach($f in $State.pinHashes){$p=Join-Path $Root $f.name;RecoverAtomic $p;$h=FileSha $p;if($h-notin@($f.beforeSha256,$f.afterSha256)){throw 'Pin file outside exact before/after'};$old=Join-Path $Backup $f.name;$bytes=if($Restore){[IO.File]::ReadAllBytes($old)}else{PinBytes $old};Atomic $p $bytes;$n++;if($script:IoFault-eq('AfterPin'+$n)){$script:IoFault='';throw ('Injected after pin '+$n)}}
}
function AssertSnapshot($Expected,$Observed,[string]$Phase){
 if($Phase-notin@('PREPARED','APPLY_INTENT','PINS_READY','UP_INTENT','CANDIDATE_HEALTHY','APPLIED_VERIFIED','ROLLBACK_INTENT','RESTORE_UP_INTENT','ROLLED_BACK')){throw 'Unknown transition phase'}
 if($Observed.apiImage-notin@($Expected.baseImage,$Expected.candidateImage)){throw 'Foreign API image; recovery refused'}
 if(-not$Observed.bindingsValid-or-not$Observed.composeValid-or-not(Same $Expected.protected $Observed.protected)){throw 'Protected identity/image binding/compose drift; recovery refused'}
 foreach($f in $Expected.configuration){$found=@($Observed.configuration|Where-Object{$_.name-eq$f.name});if($found.Count-ne1){throw 'Missing configuration digest'};$allowed=@($f.sha256);$pin=@($Expected.pinHashes|Where-Object{$_.name-eq$f.name});if($pin.Count){$allowed+=@($pin[0].afterSha256)};if($found[0].sha256-notin$allowed){throw ('Non-API or unknown pin configuration drift: '+$f.name)}}
}
# END IO AND SCOPE HELPERS
$script:AtomicRoot=Join-Path $Backup 'atomic';$script:IoFault='';$JournalPath=Join-Path $Backup 'transition.json'
function Journal([string]$Phase){Save $JournalPath @{release=$Release;sourceCommit=$State.sourceCommit;baseImage=$State.baseImage;candidateImage=$State.candidateImage;phase=$Phase;at=[DateTime]::UtcNow.ToString('o')}}
function Phase{RecoverAtomic $JournalPath;if(-not(Test-Path $JournalPath)){return 'PREPARED'};$j=J $JournalPath;if($j.release-ne$Release-or$j.sourceCommit-ne$State.sourceCommit-or$j.baseImage-ne$State.baseImage-or$j.candidateImage-ne$State.candidateImage){throw 'Foreign transition journal'};return $j.phase}
$probe=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'runtime-probe.cjs'));$offline=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'offline-smoke.cjs'))
$runtimeSource='const expectedAccountId='+ (ConvertTo-Json -InputObject ([string]$plan.accountId) -Compress)+';'+$probe
$NodeRuntime="eval(Buffer.from('"+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($runtimeSource))+"','base64').toString('utf8'))"
$NodeImage="eval(Buffer.from('"+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($offline))+"','base64').toString('utf8'))"
$Health="fetch('http://127.0.0.1:4000/api/health',{signal:AbortSignal.timeout(3000)}).then(async r=>{const j=await r.json();if(!r.ok||j.status!=='ok'||j.database!=='ok')throw Error('unhealthy')}).catch(()=>{process.exitCode=1})"

function RuntimeProbe{ConvertFrom-Json -InputObject (D @('exec','clinic-crm-api','node','-e',$NodeRuntime))}
function Compose([switch]$Up){$a=@('compose','--project-directory',$Root,'--project-name',$State.project,'--file',(Join-Path $Root 'docker-compose.yml'),'--env-file',(Join-Path $Root '.env'),'--env-file',(Join-Path $Root '.env.runtime'));if($Up){$null=D ($a+@('up','-d','--no-deps','--no-build','--pull','never','api'))}else{ConvertFrom-Json -InputObject (D ($a+@('config','--format','json')))}}
function ProtectOthers{foreach($e in $State.protected){$c=C $e.name;if($c.Id-ne$e.id-or$c.Image-ne$e.image-or$c.State.StartedAt-ne$e.started-or-not$c.State.Running){throw ('Protected service drift: '+$e.name)}}}
function Healthy([string]$Image){for($n=0;$n-lt35;$n++){$c=C 'clinic-crm-api';if($c.Image-eq$Image-and$c.State.Running){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';& docker exec clinic-crm-api node -e $Health *> $null;$ok=$LASTEXITCODE-eq0}finally{$ErrorActionPreference=$old};if($ok){return}};Start-Sleep -Milliseconds 500};throw 'API/database health failed'}
function VerifyRuntime([switch]$Original){$rt=RuntimeProbe;$expected=@{};foreach($f in $State.runtime.dist){$expected[$f.name]=$f.sha256};if(-not$Original){foreach($f in $State.manifest.files){$expected['modules/avito/'+$f.name]=$f.sha256}};if(@($rt.dist).Count-ne$expected.Count){throw 'Compiled inventory size differs'};foreach($f in $rt.dist){if($expected[$f.name]-ne$f.sha256){throw ('Unexpected compiled file: '+$f.name)}};foreach($k in @('schemaSha256','entrypointSha256','settingsVersion','settingsSha256','mode','rows','priceSha256')){if($rt.$k-ne$State.runtime.$k){throw ('Runtime/data invariant differs: '+$k)}};if(-not(Same $rt.clientVersion $State.runtime.clientVersion)-or-not(Same $rt.successfulMigrations $State.runtime.successfulMigrations)){throw 'Client/migration history differs'};ProtectOthers;return $rt}
if($Mode-eq'Prepare'){
 if(Test-Path $StatePath){throw 'Prepared release already exists; inspect it without overwriting'}
 if((C 'clinic-crm-api').Image-ne$ExpectedBaseImage-or(I $BaseReference).Id-ne$ExpectedBaseImage){throw 'API base changed'}
 $archive=$plan.archivePath;if((FileSha $archive)-ne$plan.archiveSha256){throw 'Packet archive differs'}
 $null=New-Item -ItemType Directory -Path $Packet -Force;$null=New-Item -ItemType Directory -Path $Backup -Force;$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $Backup /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE-ne0){throw 'Private backup ACL failed'}
 & tar -xzf $archive -C $Packet;if($LASTEXITCODE-ne0){throw 'Packet extraction failed'}
 $manifest=J (Join-Path $Packet 'manifest.json');if($manifest.sourceCommit-ne$plan.sourceCommit-or@($manifest.files).Count-ne12){throw 'Wrong source/artifacts'}
 foreach($f in $manifest.files){if($f.name-notmatch'^avito\.(?:policy|settings)\.(?:js|d\.ts|js\.map)$'-and$f.name-notmatch'^avito-(?:grooming-prices|crm-knowledge\.service)\.(?:js|d\.ts|js\.map)$'){throw 'Artifact path outside scope'};if((FileSha (Join-Path $Packet ('api/'+$f.name)))-ne$f.sha256){throw 'Artifact digest mismatch'}}
 $protected=@();foreach($name in @('clinic-crm-web','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')){$c=C $name;$protected+=@{name=$name;id=$c.Id;image=$c.Image;started=$c.State.StartedAt}}
 $configuration=@();foreach($name in @('.env','.env.runtime','docker-compose.yml','diagnostics/bin/system-diagnostics-config.json')){$p=Join-Path $Root $name;$copy=Join-Path $Backup $name;$null=New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($copy)) -Force;Copy-Item -LiteralPath $p -Destination $copy;$configuration+=@{name=$name;sha256=FileSha $p}}
 $api=C 'clinic-crm-api';$State=[pscustomobject]@{release=$Release;sourceCommit=$manifest.sourceCommit;baseImage=$ExpectedBaseImage;baseReference=$BaseReference;project=$api.Config.Labels.'com.docker.compose.project';protected=$protected;configuration=$configuration;manifest=$manifest;runtime=(RuntimeProbe);candidateImage='';candidateReference=$Tag}
 if($State.runtime.settingsVersion-ne$plan.settingsVersion-or$State.runtime.mode-ne'AUTO'-or$State.runtime.rows-ne$plan.activePriceRows-or$State.runtime.entrypointSha256-ne$plan.entrypointSha256){throw 'Unexpected Avito/startup baseline'}
 $State|Add-Member -NotePropertyName pinHashes -NotePropertyValue @(PinPlan);$before=Compose;Save (Join-Path $Backup 'compose-private.json') $before
 $log=D @('build','--network','none','--pull=false','--build-arg',('BASE_API='+$BaseReference),'-t',$Tag,$Packet);[IO.File]::WriteAllText((Join-Path $Backup 'build.log'),$log,[Text.UTF8Encoding]::new($false));$State.candidateImage=(I $Tag).Id
 $probe=ConvertFrom-Json -InputObject (D @('run','--rm','--network','none','--memory','384m','--cpus','1','--pids-limit','128','--entrypoint','node',$Tag,'-e',$NodeImage));if($probe.smoke-ne'PASS'){throw 'Candidate smoke failed'}
 $expected=@{};foreach($f in $State.runtime.dist){$expected[$f.name]=$f.sha256};foreach($f in $manifest.files){$expected['modules/avito/'+$f.name]=$f.sha256};if(@($probe.dist).Count-ne$expected.Count){throw 'Candidate artifact count differs'};foreach($f in $probe.dist){if($expected[$f.name]-ne$f.sha256){throw ('Candidate changed non-reviewed file: '+$f.name)}};if($probe.schemaSha256-ne$State.runtime.schemaSha256-or$probe.entrypointSha256-ne$State.runtime.entrypointSha256){throw 'Candidate changed schema/startup'}
 foreach($f in $configuration){if((FileSha (Join-Path $Root $f.name))-ne$f.sha256){throw 'Configuration changed during preparation'}};if((C 'clinic-crm-api').Image-ne$ExpectedBaseImage){throw 'API changed during preparation'};ProtectOthers;Save $StatePath $State;Journal 'PREPARED'
 [pscustomobject]@{status='PREPARED';release=$Release;baseImage=$ExpectedBaseImage;candidateImage=$State.candidateImage;smoke='PASS';verifiedArtifacts=@($probe.dist).Count;changedArtifacts=12;runtimeSwitched=$false}|ConvertTo-Json -Compress;exit
}
RecoverAtomic $StatePath;$State=J $StatePath
if($State.baseImage-ne$ExpectedBaseImage-or$State.baseReference-ne$BaseReference){throw 'Different base guard'}
function AssertCurrentScope {
 $protected=@();foreach($e in $State.protected){$c=C $e.name;$protected+=@{name=$e.name;id=$c.Id;image=$c.Image;started=$c.State.StartedAt}}
 $cfg=@();foreach($f in $State.configuration){$p=Join-Path $Root $f.name;RecoverAtomic $p;$cfg+=@{name=$f.name;sha256=FileSha $p}}
 $before=J (Join-Path $Backup 'compose-private.json');$now=Compose;$valid=$now.services.api.image-in@($State.baseReference,$Tag);$now.services.api.image=$before.services.api.image
 $observed=@{apiImage=(C 'clinic-crm-api').Image;bindingsValid=((I $State.baseReference).Id-eq$State.baseImage-and(I $State.candidateReference).Id-eq$State.candidateImage);composeValid=($valid-and(Same $before $now));configuration=$cfg;protected=$protected}
 AssertSnapshot $State $observed (Phase)
}
function FinalizeCandidate {
 AssertCurrentScope;Healthy $State.candidateImage;$rt=VerifyRuntime;Journal 'CANDIDATE_HEALTHY'
 $receipt=@{status='APPLIED_VERIFIED';sourceCommit=$State.sourceCommit;candidateImage=$State.candidateImage;at=[DateTime]::UtcNow.ToString('o');settingsVersion=$rt.settingsVersion;rows=$rt.rows;protectedServicesUnchanged=$true;schemaAndPricesUnchanged=$true;rollbackBase=$State.baseImage}
 Save (Join-Path $Backup 'receipt.json') $receipt;Journal 'APPLIED_VERIFIED';$receipt|ConvertTo-Json -Compress
}
function RestoreKnownBase {
 AssertCurrentScope;Journal 'ROLLBACK_INTENT';AssertCurrentScope;SetApiPins -Restore;AssertCurrentScope
 if((C 'clinic-crm-api').Image-ne$State.baseImage){Journal 'RESTORE_UP_INTENT';AssertCurrentScope;Compose -Up}
 Healthy $State.baseImage;$null=VerifyRuntime -Original;Journal 'ROLLED_BACK'
}
function ApplyCandidate {
 if(-not$ExpectedCandidateImage-or$ExpectedCandidateImage-ne$State.candidateImage){throw 'Explicit candidate identity required after review'}
 if((Phase)-ne'PREPARED'){throw 'Existing transition; use read-only Verify before another action'}
 AssertCurrentScope;if((C 'clinic-crm-api').Image-ne$State.baseImage){throw 'API baseline drift'};$null=VerifyRuntime -Original
 foreach($f in $State.configuration){if((FileSha (Join-Path $Root $f.name))-ne$f.sha256){throw 'Initial configuration drift'}}
 try{Journal 'APPLY_INTENT';AssertCurrentScope;SetApiPins;Journal 'PINS_READY';AssertCurrentScope;Journal 'UP_INTENT';AssertCurrentScope;Compose -Up;Healthy $State.candidateImage;$null=VerifyRuntime;Journal 'CANDIDATE_HEALTHY'}
 catch{
  $why=$_.Exception.Message;$completed=$false
  try{AssertCurrentScope;if((C 'clinic-crm-api').Image-eq$State.candidateImage){try{Healthy $State.candidateImage;$null=VerifyRuntime;Journal 'CANDIDATE_HEALTHY';$completed=$true}catch{}};if(-not$completed){RestoreKnownBase}}
  catch{throw ('Transition requires read-only inspection; no further recovery action: '+$why+'; '+$_.Exception.Message)}
  if(-not$completed){throw ('Release failed; exact base restored: '+$why)}
 }
 # Receipt IO cannot undo a healthy, verified candidate. Verify finalizes idempotently.
 FinalizeCandidate
}
if($Mode-eq'Apply'){ApplyCandidate;exit}
function RollbackCandidate {
 if((Phase)-notin@('APPLY_INTENT','PINS_READY','UP_INTENT','CANDIDATE_HEALTHY','APPLIED_VERIFIED','ROLLBACK_INTENT','RESTORE_UP_INTENT','ROLLED_BACK')){throw 'No known transition to roll back'}
 AssertCurrentScope;RestoreKnownBase;@{status='ROLLED_BACK';image=$State.baseImage}|ConvertTo-Json -Compress
}
if($Mode-eq'Rollback'){RollbackCandidate;exit}
AssertCurrentScope
if((C 'clinic-crm-api').Image-eq$State.candidateImage){FinalizeCandidate;exit}
@{status='BASELINE_OBSERVED';phase=(Phase);image=$State.baseImage;runtimeSwitched=$false}|ConvertTo-Json -Compress
