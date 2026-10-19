[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference='Stop'
function Tree([string]$Directory) {
  return @(Get-ChildItem -LiteralPath $Directory -Force -File -Recurse | ForEach-Object { $_.FullName.Substring($Directory.Length).Replace('\','/')+' '+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } | Sort-Object)
}
$receipt=Get-Content (Join-Path $BackupPath 'verified-backup.json') -Raw|ConvertFrom-Json
if(-not $receipt.verified -or -not $receipt.restoreTested){throw 'Verified database restoration is required'}
$files=@(Tree (Join-Path $BackupPath 'files'))
$restored=@(Tree (Join-Path $BackupPath 'files-restored'))
if([string]::Join("`n",$files) -ne [string]::Join("`n",$restored)){throw 'Full file tree differs, including hidden files'}
$result=[PSCustomObject]@{passed=$true;includesHiddenFiles=$true;fileCount=$files.Count;checkedAt=[DateTime]::UtcNow.ToString('o')}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $BackupPath 'verified-files-all.json') -Encoding UTF8
Write-Output "FILES_VERIFIED: $($files.Count) files matched, including hidden files."
