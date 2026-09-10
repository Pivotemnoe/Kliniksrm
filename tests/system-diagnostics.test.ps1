$ErrorActionPreference='Stop'
$sourcePath=Join-Path $PSScriptRoot '..\scripts\system-diagnostics.ps1'
if (!(Test-Path $sourcePath)) { $sourcePath=Join-Path $PSScriptRoot 'system-diagnostics.ps1' }
$source=[IO.File]::ReadAllText($sourcePath)
. ([ScriptBlock]::Create($source)) -ConfigPath 'unused-test-config.json' -LibraryOnly
$revision='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$config=[PSCustomObject]@{expectedRevision=$revision}
$now=[DateTimeOffset]::UtcNow
function New-Snapshot {
  $s=@{docker=$true;containers=@{};resolved=@{};remote=@{};apiHealth=$true;webHealth=$true;freeBytes=30GB;databaseArchivePresent=$true;filesArchivePresent=$true;backup=@{state='ok';lastDatabaseBackupAt=$now.ToString('o');lastFilesBackupAt=$now.ToString('o');lastIntegrityCheckAt=$now.ToString('o');freeBytes=30GB;lastRestoreTestState='ok'}}
  foreach($name in @('api','web','postgres','redis','minio','backup')) { $s.containers[$name]=@{running=$true;health='healthy';revision=$revision;image="ghcr.io/pivotemnoe/kliniksrm-${name}:$revision"} }
  foreach($name in @('api','web')) { $s.resolved[$name]=$s.containers[$name].image; $s.remote[$name]=$s.containers[$name].image }
  return [PSCustomObject]$s
}
function Assert($condition,$message) { if (!$condition) { throw $message } }
$s=New-Snapshot; Assert (@(Get-DiagnosticIssues $s $config $now).Count -eq 0) 'Healthy snapshot failed'
$s.containers.api.revision='old'; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'version.api') 'Missed rollback'
$s=New-Snapshot; $s.remote.web='old'; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'update.web') 'Missed auto-update rollback risk'
$s=New-Snapshot; $s.resolved.api='old'; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'launch.api') 'Missed launch mismatch'
$s=New-Snapshot; $s.apiHealth=$false; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'api') 'Missed API failure'
$s=New-Snapshot; $s.backup.lastDatabaseBackupAt=$now.AddHours(-37).ToString('o'); Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'backup.lastDatabaseBackupAt') 'Missed stale backup'
$s=New-Snapshot; $s.backup.lastDatabaseBackupAt=$now.AddHours(2).ToString('o'); Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'backup.lastDatabaseBackupAt') 'Future date accepted'
$s=New-Snapshot; $s.filesArchivePresent=$false; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'backup.filesArchive') 'Missing archive accepted'
$s=New-Snapshot; $s.freeBytes=1GB; Assert ((Get-DiagnosticIssues $s $config $now).code -contains 'disk') 'Missed low disk'
$s=New-Snapshot; $s.docker=$false; $s.containers=@{}; Assert (@(Get-DiagnosticIssues $s $config $now).Count -ge 7) 'Docker unavailable not detected'
Assert (!(Test-DiagnosticArchive $PSScriptRoot '..\secret')) 'Traversal accepted'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('crm-diag-test-'+[Guid]::NewGuid().ToString())
[void][IO.Directory]::CreateDirectory($temp)
Write-DiagnosticJson (Join-Path $temp 'report.json') @{ok=$true}
Assert ((Read-DiagnosticJson (Join-Path $temp 'report.json')).ok) 'Report write/read failed'
$timedOut=$false
try { Invoke-DiagnosticTool "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -Command Start-Sleep -Seconds 5' $temp '' 1 | Out-Null } catch { $timedOut=$true }
Assert $timedOut 'Hung probe did not time out'
Write-Output 'DIAGNOSTICS_TESTS_OK: 13 assertions; no production changes'
