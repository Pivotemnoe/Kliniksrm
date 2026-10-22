$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
function D([string[]]$A){$old=$ErrorActionPreference;try{$ErrorActionPreference='Continue';$s=& docker @A 2>&1|Out-String;$c=$LASTEXITCODE}finally{$ErrorActionPreference=$old};if($c -ne 0){throw $s};return $s}
function C($n){(ConvertFrom-Json -InputObject (D @('inspect',$n)))[0]}
function GetReleaseFileHash($p){(Get-FileHash $p -Algorithm SHA256).Hash}
$r='C:/Users/TemichevVet/TemichevVet';$p=$r+'/releases/workstation-settings-20261022';$b=$r+'/backups/manual-releases/workstation-settings-20261022';$utf=New-Object Text.UTF8Encoding($false)
$base='temichevvet-crm-web:workstation-binding-20261022';$expected='sha256:5e452120808450d733e732c9c37b4bb16851c540a5276daf181f49f0efd4f332';$tag='temichevvet-crm-web:workstation-settings-20261022'
if((C 'clinic-crm-web').Image -ne $expected){throw 'Web baseline changed'}
if(Test-Path $p){throw 'Release exists'};$null=New-Item -ItemType Directory $p;$null=New-Item -ItemType Directory $b
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name;& icacls $b /inheritance:r /grant:r ($account+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' *> $null;if($LASTEXITCODE -ne 0){throw 'ACL failed'}
& tar -xzf 'C:/Users/TemichevVet/workstation-settings-20261022.tar.gz' -C $p;if($LASTEXITCODE -ne 0){throw 'Extract failed'}
$m=Get-Content -Raw ($p+'/manifest.json')|ConvertFrom-Json
foreach($f in $m.files.PSObject.Properties){if((GetReleaseFileHash ($p+'/'+$f.Name)).ToLowerInvariant() -ne $f.Value){throw 'Checksum mismatch'}}
$cfg=@();foreach($n in @('.env','.env.runtime')){Copy-Item ($r+'/'+$n) ($b+'/'+$n);$cfg+=@{name=$n;hash=(GetReleaseFileHash ($r+'/'+$n))}}
$others=@();foreach($n in @('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup')){$c=C $n;$others+=@{name=$n;id=$c.Id;started=$c.State.StartedAt}}
$compose=@('compose','--project-directory',$r,'--project-name','temichevvet','--file',($r+'/docker-compose.yml'),'--env-file',($r+'/.env'),'--env-file',($r+'/.env.runtime'))
$before=ConvertFrom-Json -InputObject (D ($compose+@('config','--format','json')))
if((ConvertFrom-Json -InputObject (D @('image','inspect',$base)))[0].Id -ne $expected){throw 'Base tag drift'}
$log=D @('build','--network','none','--pull=false','-t',$tag,$p);[IO.File]::WriteAllText(($b+'/build.log'),$log,$utf)
foreach($f in $cfg){if((GetReleaseFileHash ($r+'/'+$f.name)) -ne $f.hash){throw 'Concurrent config change'}}
if((C 'clinic-crm-web').Image -ne $expected){throw 'Web baseline drift'}
try{
 foreach($n in @('.env','.env.runtime')){$path=$r+'/'+$n;$t=[IO.File]::ReadAllText($path);foreach($key in @('TEMICHEVVET_WEB_IMAGE','TEMICHEVVET_REMOTE_WEB_IMAGE')){$t=[regex]::Replace($t,('(?m)^'+$key+'=[^\r\n]*'),($key+'='+$tag))};[IO.File]::WriteAllText($path,$t,$utf)}
 $after=ConvertFrom-Json -InputObject (D ($compose+@('config','--format','json')));if($after.services.web.image -ne $tag){throw 'Pin missing'};$after.services.web.image=$before.services.web.image;if(($after|ConvertTo-Json -Depth 50 -Compress) -ne ($before|ConvertTo-Json -Depth 50 -Compress)){throw 'Unexpected config change'}
 $null=D ($compose+@('up','-d','--no-deps','--no-build','--pull','never','web'))
 $ok=$false;for($i=0;$i -lt 30;$i++){try{$v=Invoke-RestMethod 'http://127.0.0.1:3000/release.json' -TimeoutSec 3;$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 3;if($v.revision -eq $m.revision -and $h.status -eq 'ok'){$ok=$true;break}}catch{};Start-Sleep -Milliseconds 500};if(-not $ok){throw 'Postflight failed'}
 foreach($o in $others){$c=C $o.name;if($c.Id -ne $o.id -or $c.State.StartedAt -ne $o.started){throw 'Other service changed'}}
 $receipt=@{status='COMPLETE';revision=$m.revision;webImage=(C 'clinic-crm-web').Image;apiImage=(C 'clinic-crm-api').Image;otherServicesUnchanged=$true;backup=$b};$receipt|ConvertTo-Json|Set-Content ($b+'/receipt.json');$receipt|ConvertTo-Json
}catch{foreach($n in @('.env','.env.runtime')){Copy-Item ($b+'/'+$n) ($r+'/'+$n) -Force};$null=D ($compose+@('up','-d','--no-deps','--no-build','--pull','never','web'));throw}
