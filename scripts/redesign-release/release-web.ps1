[CmdletBinding()]
param(
  [ValidateSet('Inspect','Apply','Rollback')][string]$Mode = 'Inspect',
  [Parameter(Mandatory=$true)][string]$Root,
  [string]$PackageRoot = $PSScriptRoot,
  [string]$BackupPath,
  [string]$WebContainer = 'clinic-crm-web',
  [string]$ApiContainer = 'clinic-crm-api',
  [string[]]$ProtectedContainers = @('clinic-crm-api','clinic-crm-postgres','clinic-crm-redis','clinic-crm-minio','clinic-crm-backup'),
  [string]$HealthUrl = 'http://127.0.0.1:3000/api/health',
  [string]$ReleaseUrl = 'http://127.0.0.1:3000/release.json',
  [switch]$Execute
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Invoke-Docker([string[]]$Arguments) {
  $savedPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5.1 turns native stderr warnings into ErrorRecords.
    # Docker's exit code remains authoritative; preserve stderr for diagnostics.
    $ErrorActionPreference = 'Continue'
    $output = & docker @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $savedPreference }
  if ($exitCode -ne 0) { throw "Docker command failed: $($Arguments[0]) $output" }
  return $output
}
function Read-Container([string]$Name) { return @(ConvertFrom-Json (Invoke-Docker -Arguments @('inspect',$Name)))[0] }
function Read-Identities {
  return @($ProtectedContainers | ForEach-Object { $c = Read-Container $_; [PSCustomObject]@{ name=$_; id=$c.Id; image=$c.Image; started=$c.State.StartedAt } })
}
function Assert-Protected($Before) {
  foreach ($item in $Before) {
    $current = Read-Container $item.name
    if ($current.Id -ne $item.id -or $current.Image -ne $item.image -or $current.State.StartedAt -ne $item.started) { throw "Protected service changed: $($item.name)" }
  }
}
function Get-Hash([string]$Name) { return (Get-FileHash -LiteralPath $Name -Algorithm SHA256).Hash.ToLowerInvariant() }
function Set-WebPin([string]$Name,[string]$Image) {
  $bytes = [IO.File]::ReadAllBytes($Name)
  $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  $text = [IO.File]::ReadAllText($Name)
  $pattern = '(?m)^TEMICHEVVET_WEB_IMAGE=[^\r\n]*'
  if ([regex]::Matches($text,$pattern).Count -ne 1) { throw "Exactly one Web image pin is required in $Name" }
  $updated = [regex]::Replace($text,$pattern,"TEMICHEVVET_WEB_IMAGE=$Image")
  foreach ($pin in @(@('TEMICHEVVET_REMOTE_WEB_IMAGE',$Image),@('TEMICHEVVET_REMOTE_API_IMAGE',$script:Api.Config.Image))) {
    $remotePattern = '(?m)^' + $pin[0] + '=[^\r\n]*'
    if ([regex]::Matches($updated,$remotePattern).Count -gt 1) { throw "Duplicate release pin: $($pin[0])" }
    $updated = [regex]::Replace($updated,$remotePattern,($pin[0] + '=' + $pin[1]))
  }
  [IO.File]::WriteAllText($Name,$updated,(New-Object Text.UTF8Encoding($bom)))
}
function Set-DiagnosticsRevisions([string]$Name) {
  $config = [IO.File]::ReadAllText($Name) | ConvertFrom-Json
  $config | Add-Member -NotePropertyName expectedRevision -NotePropertyValue $script:Manifest.baseRevision -Force
  $config | Add-Member -NotePropertyName expectedWebRevision -NotePropertyValue $script:Manifest.revision -Force
  [IO.File]::WriteAllText($Name,($config | ConvertTo-Json -Depth 32),(New-Object Text.UTF8Encoding($false)))
}
function Invoke-Compose([string]$Image,[switch]$ValidateOnly) {
  $composeArguments = @('compose','--project-directory',$Root,'--project-name',$script:Project,'--file',$script:Compose,'--env-file',(Join-Path $Root '.env'))
  $runtime = Join-Path $Root '.env.runtime'
  if (Test-Path -LiteralPath $runtime) { $composeArguments += @('--env-file',$runtime) }
  $savedWeb = [Environment]::GetEnvironmentVariable('TEMICHEVVET_WEB_IMAGE','Process')
  try {
    [Environment]::SetEnvironmentVariable('TEMICHEVVET_WEB_IMAGE',$Image,'Process')
    $config = ConvertFrom-Json (Invoke-Docker ($composeArguments + @('config','--format','json')))
    if ($config.services.web.image -ne $Image) { throw 'Compose selects an unexpected Web image' }
    if ($config.services.api.image -ne $script:Api.Config.Image) { throw 'Compose/API image mismatch' }
    if ($config.services.web.container_name -ne $WebContainer) { throw 'Compose/Web container mismatch' }
    $assetConfig=@($config.services.web.volumes | Where-Object { $_.target -eq '/usr/share/nginx/html/assets' -and $_.type -eq 'volume' })
    if ($assetConfig.Count -ne 1) { throw 'Compose must retain exactly one hashed assets volume' }
    $assetName=$config.volumes.($assetConfig[0].source).name
    if ($assetName -ne $script:assets[0].Name) { throw 'Compose would replace the existing hashed assets volume' }
    if (-not $ValidateOnly) { $null = Invoke-Docker ($composeArguments + @('up','-d','--no-deps','--no-build','--pull','never','web')) }
  } finally { [Environment]::SetEnvironmentVariable('TEMICHEVVET_WEB_IMAGE',$savedWeb,'Process') }
}
function Wait-Healthy([string]$ImageId,[switch]$Candidate) {
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    try {
      $web = Read-Container $WebContainer
      if ($web.Image -ne $ImageId -or -not $web.State.Running) { throw 'Unexpected Web container' }
      $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 4
      if ($health.status -ne 'ok' -or $health.database -ne 'ok') { throw 'Health is not ready' }
      if ($Candidate) {
        $served = Invoke-RestMethod -Uri $ReleaseUrl -TimeoutSec 4
        if ($served.revision -ne $script:Manifest.revision) { throw 'Served revision mismatch' }
      }
      return
    } catch { if ($attempt -eq 29) { throw }; Start-Sleep -Milliseconds 500 }
  }
}
function Restore-Configuration($State) {
  foreach ($file in $State.envFiles) {
    $live = Join-Path $Root $file.name
    if ((Get-Hash $live) -ne $file.appliedHash) { throw "Configuration changed after preflight: $($file.name)" }
  }
  foreach ($file in $State.envFiles) { [IO.File]::WriteAllBytes((Join-Path $Root $file.name),[IO.File]::ReadAllBytes((Join-Path $BackupPath $file.savedName))) }
}
$Manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'release.json') -Raw | ConvertFrom-Json
$Compose = Join-Path $Root 'docker-compose.yml'
if (-not (Test-Path -LiteralPath $Compose) -or -not (Test-Path -LiteralPath (Join-Path $Root '.env'))) { throw 'Existing installation is required' }
if ($Mode -ne 'Inspect' -and -not $Execute) { throw 'Inspect is read-only. A mutating mode requires -Execute after separate release authorization.' }
$pins = @{}
foreach ($name in @('.env','.env.runtime')) {
  $file = Join-Path $Root $name
  if (-not (Test-Path -LiteralPath $file)) { continue }
  $seen = @{}
  foreach ($line in [IO.File]::ReadAllLines($file)) {
    if ($line -match '^(CRM_SOURCE_VERSION|TEMICHEVVET_(?:API_IMAGE|WEB_IMAGE|REMOTE_API_IMAGE|REMOTE_WEB_IMAGE))=(.*)$') {
      $key=$matches[1]; $value=$matches[2].Trim().Trim('"').Trim("'")
      if ($seen.ContainsKey($key)) { throw "Duplicate release pin: $key" }
      if ($pins.ContainsKey($key) -and $pins[$key] -ne $value) { throw "Conflicting release configuration: $key" }
      $pins[$key]=$value; $seen[$key]=$value
    }
  }
}
$web = Read-Container $WebContainer
$Api = Read-Container $ApiContainer
if ($Api.Image -ne $Manifest.images.api.previousId) { throw 'Running API differs from the locally verified baseline; stop and requalify the package' }
$diagnosticsRelative = 'diagnostics/bin/system-diagnostics-config.json'
$diagnosticsPath = Join-Path $Root $diagnosticsRelative
if (Test-Path -LiteralPath $diagnosticsPath) {
  $diagnostics = [IO.File]::ReadAllText($diagnosticsPath) | ConvertFrom-Json
  $allowedDiagnosticRevisions = @($Manifest.baseRevision)
  if ($pins.ContainsKey('TEMICHEVVET_REMOTE_API_IMAGE') -and $pins['TEMICHEVVET_REMOTE_API_IMAGE'] -match '^ghcr\.io/pivotemnoe/kliniksrm-api:([a-f0-9]{40})$') { $allowedDiagnosticRevisions += $matches[1] }
  if ($diagnostics.expectedRevision -notin $allowedDiagnosticRevisions) { throw 'Diagnostics baseline differs from the qualified API and recorded remote release' }
  if ($env:OS -eq 'Windows_NT' -and $diagnostics.expectedHost -ne $env:COMPUTERNAME) { throw 'Diagnostics belongs to another host' }
  $diagnosticsScript = Join-Path (Split-Path $diagnosticsPath) 'system-diagnostics.ps1'
  if (-not (Test-Path -LiteralPath $diagnosticsScript) -or [IO.File]::ReadAllText($diagnosticsScript) -notmatch 'expectedWebRevision') { throw 'Installed diagnostics must support separate API and Web revisions' }
}
$Project = $web.Config.Labels.'com.docker.compose.project'
if (-not $Project) { throw 'Web container must belong to the existing Compose project' }
$assets = @($web.Mounts | Where-Object { $_.Destination -eq '/usr/share/nginx/html/assets' -and $_.Type -eq 'volume' })
if ($assets.Count -ne 1) { throw 'Persistent hashed assets volume is required for open tabs' }
$identities = Read-Identities
$image = @(ConvertFrom-Json (Invoke-Docker -Arguments @('image','inspect',$Manifest.images.web.candidate)))[0]
if ($image.Id -ne $Manifest.images.web.candidateId -or $image.Architecture -ne 'amd64') { throw 'Candidate image identity/platform mismatch' }
if ($Mode -eq 'Inspect') {
  if ($web.Image -ne $Manifest.images.web.previousId -and $web.Image -ne $Manifest.images.web.candidateId) { throw 'Unexpected running Web image' }
  Invoke-Compose $Manifest.images.web.candidate -ValidateOnly
  Write-Output "READ_ONLY: candidate verified; API baseline matched; assets volume=$($assets[0].Name); no containers/configuration changed."
  return
}
if (-not $BackupPath) { throw 'A verified backup directory is required' }
$statePath = Join-Path $BackupPath 'redesign-state.json'
if ($Mode -eq 'Rollback') {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if ($state.candidateId -ne $Manifest.images.web.candidateId -or $state.root -ne $Root) { throw 'Rollback state does not match this installation/package' }
  if ($web.Image -ne $state.candidateId) { throw 'Rollback refuses to overwrite an unexpected or already replaced Web release' }
  $rollbackImage=@(ConvertFrom-Json (Invoke-Docker -Arguments @('image','inspect',$state.previousImage)))[0]
  if ($rollbackImage.Id -ne $state.previousId) { throw 'Rollback image tag no longer matches its verified identity' }
  Assert-Protected $state.protected
  Restore-Configuration $state
  Invoke-Compose $state.previousImage
  Wait-Healthy $state.previousId
  Assert-Protected $state.protected
  Write-Output 'ROLLBACK_OK: previous Web restored; API, data services and database records were not rolled back.'
  return
}
if ($web.Image -ne $Manifest.images.web.previousId -or $web.Config.Image -ne $Manifest.images.web.previous) { throw 'Apply requires the exact qualified previous Web image' }
if (Test-Path -LiteralPath $statePath) { throw 'A release state already exists; inspect or roll back instead of overwriting it' }
$backup = Get-Content -LiteralPath (Join-Path $BackupPath 'verified-backup.json') -Raw | ConvertFrom-Json
if (-not $backup.restoreTested -or -not $backup.verified -or [DateTime]::Parse($backup.capturedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-24)) { throw 'A recent verified restoration rehearsal is required' }
if (@($backup.protected).Count -ne $ProtectedContainers.Count) { throw 'Backup must identify all protected services' }
Assert-Protected $backup.protected
foreach ($file in @($backup.database,$backup.files)) {
  if ($file.name -match '[/\\]' -or (Get-Hash (Join-Path $BackupPath $file.name)) -ne $file.sha256) { throw 'Backup file identity mismatch' }
}
$previous = @(ConvertFrom-Json (Invoke-Docker -Arguments @('image','inspect',$Manifest.images.web.previous)))[0]
if ($previous.Id -ne $Manifest.images.web.previousId) { throw 'Previous rollback image must be present locally' }
$envFiles = @()
foreach ($name in @('.env','.env.runtime')) {
  $live = Join-Path $Root $name
  if (-not (Test-Path -LiteralPath $live)) { continue }
  $text = [IO.File]::ReadAllText($live)
  if ($name -eq '.env.runtime' -and $text -notmatch '(?m)^TEMICHEVVET_WEB_IMAGE=') { continue }
  if ([regex]::Matches($text,'(?m)^TEMICHEVVET_WEB_IMAGE=[^\r\n]*').Count -ne 1) { throw "Ambiguous Web pin in $name" }
  $savedName = 'before' + $name
  [IO.File]::WriteAllBytes((Join-Path $BackupPath $savedName),[IO.File]::ReadAllBytes($live))
  $envFiles += [PSCustomObject]@{name=$name;savedName=$savedName;appliedHash='';kind='env'}
}
if (Test-Path -LiteralPath $diagnosticsPath) {
  [IO.File]::WriteAllBytes((Join-Path $BackupPath 'before-diagnostics.json'),[IO.File]::ReadAllBytes($diagnosticsPath))
  $envFiles += [PSCustomObject]@{name=$diagnosticsRelative;savedName='before-diagnostics.json';appliedHash='';kind='diagnostics'}
}
Invoke-Compose $Manifest.images.web.candidate -ValidateOnly
try {
  foreach ($file in $envFiles) {
    $live = Join-Path $Root $file.name
    if ($file.kind -eq 'diagnostics') { Set-DiagnosticsRevisions $live } else { Set-WebPin $live $Manifest.images.web.candidate }
    $file.appliedHash=Get-Hash $live
  }
} catch {
  foreach ($file in $envFiles) { [IO.File]::WriteAllBytes((Join-Path $Root $file.name),[IO.File]::ReadAllBytes((Join-Path $BackupPath $file.savedName))) }
  throw
}
$state = [PSCustomObject]@{ root=$Root; previousImage=$Manifest.images.web.previous; previousId=$Manifest.images.web.previousId; candidateId=$Manifest.images.web.candidateId; protected=$identities; envFiles=$envFiles }
$state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding UTF8
try {
  Invoke-Compose $Manifest.images.web.candidate
  Wait-Healthy $Manifest.images.web.candidateId -Candidate
  Assert-Protected $identities
  Write-Output 'APPLY_OK: only Web replaced; API/data services unchanged; old and new hashed assets retained.'
} catch {
  $failure = $_
  Restore-Configuration $state
  Invoke-Compose $state.previousImage
  Wait-Healthy $state.previousId
  Assert-Protected $identities
  throw "Apply failed and previous Web restored: $failure"
}
