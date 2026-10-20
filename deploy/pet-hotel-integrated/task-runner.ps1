[CmdletBinding()]
param([ValidateSet('Probe','Build','Backup','Apply','Rollback')][string]$Phase)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong clinic host'}
$root='C:/Users/TemichevVet/TemichevVet';$stage=$root+'/releases/crm-pet-hotel-integrated-20261020-r1';$package=$stage+'/packet';$ops=$stage+'/operations'
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
Set-Location $root
function Save-Status([string]$Status,[string]$Detail=''){$data=[pscustomobject]@{phase=$Phase;status=$Status;at=[DateTime]::UtcNow.ToString('o');detail=$Detail};$path=$ops+'/status-'+$Phase+'.json';[IO.File]::WriteAllText(($path+'.tmp'),($data|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)));Move-Item -Force -LiteralPath ($path+'.tmp') -Destination $path}
$statusPath=$ops+'/status-'+$Phase+'.json'
if(Test-Path $statusPath){$old=Get-Content $statusPath -Raw -Encoding UTF8|ConvertFrom-Json;if($old.status -eq 'COMPLETE'){Write-Output 'ALREADY_COMPLETE';return};if($old.status -eq 'RUNNING'){throw 'A previous run must be inspected before retrying'}}
$m=Get-Content ($package+'/release.json') -Raw -Encoding UTF8|ConvertFrom-Json
if($m.revision -ne '8c51960999eb49485c8853ef01e3678cd9877b3f' -or $m.releaseId -ne 'crm-pet-hotel-integrated-20261020-r1'){throw 'Unrelated packet'}
$proof=Get-Content ($stage+'/packet-checksums.json') -Raw -Encoding UTF8|ConvertFrom-Json
foreach($item in $proof.PSObject.Properties){if($item.Name -eq 'release.json' -and $Phase -ne 'Build' -and $Phase -ne 'Probe'){continue};if((Get-FileHash (Join-Path $package $item.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw ('Packet differs: '+$item.Name)}}
$null=Start-Transcript -LiteralPath ($ops+'/task-'+$Phase+'.log') -Append
Save-Status 'RUNNING'
try{
 switch($Phase){
  'Probe' {$o=& docker info --format '{{.OSType}}';if($LASTEXITCODE -ne 0 -or $o -ne 'linux'){throw 'Docker Linux engine not available to detached runner'};$h=Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 10;if($h.status -ne 'ok' -or $h.database -ne 'ok'){throw 'Clinic health differs'}}
  'Build' {& ($package+'/build-clinic.ps1') -PackagePath $package}
  'Backup' {& ($package+'/backup-database.ps1') -BackupPath ($root+'/backups/manual-releases/'+$m.releaseId) -MigrationsPath ($package+'/prisma/migrations') -Root $root}
  'Apply' {& ($package+'/release-clinic.ps1') -Mode Apply -Root $root -PackagePath $package}
  'Rollback' {& ($package+'/release-clinic.ps1') -Mode Rollback -Root $root -PackagePath $package}
 }
 Save-Status 'COMPLETE';Write-Output ('PHASE_COMPLETE '+$Phase)
}catch{Save-Status 'FAILED' $_.Exception.Message;throw}finally{$null=Stop-Transcript}
