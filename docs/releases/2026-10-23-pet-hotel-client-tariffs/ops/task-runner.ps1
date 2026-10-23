[CmdletBinding()]
param([ValidateSet('Inspect','Build','Backup','Apply','Verify','Rollback')][string]$Phase)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$stage=Split-Path $PSScriptRoot -Parent;$statusPath=$stage+'/status-'+$Phase+'.json'
function Status([string]$Value,[string]$Detail=''){[IO.File]::WriteAllText(($statusPath+'.tmp'),([pscustomobject]@{phase=$Phase;status=$Value;at=[DateTime]::UtcNow.ToString('o');detail=$Detail}|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)));Move-Item -Force -LiteralPath ($statusPath+'.tmp') -Destination $statusPath}
if(Test-Path $statusPath){$old=Get-Content $statusPath -Raw -Encoding UTF8|ConvertFrom-Json;if($old.status -eq 'COMPLETE'){Write-Output 'ALREADY_COMPLETE';return};if($old.status -eq 'RUNNING'){throw 'Inspect the existing task before retrying'}}
$null=Start-Transcript -LiteralPath ($stage+'/task-'+$Phase+'.log') -Append;Status 'RUNNING'
try{& ($PSScriptRoot+'/release.ps1') -Mode $Phase -Execute;Status 'COMPLETE';Write-Output ('PHASE_COMPLETE '+$Phase)}catch{Status 'FAILED' ($_.Exception.Message+'; '+$_.InvocationInfo.PositionMessage);throw}finally{$null=Stop-Transcript}
