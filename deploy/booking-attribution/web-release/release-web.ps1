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
if($env:COMPUTERNAME -ne 'WIN-I123AM83GR4'){throw 'Wrong clinic host'}
$env:DOCKER_HOST='npipe:////./pipe/dockerDesktopLinuxEngine';$env:DOCKER_CONFIG='C:/Users/TemichevVet/.docker';$env:Path='C:/Program Files/Docker/Docker/resources/bin;'+$env:Path
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
function Write-WebBytesAtomic([string]$Name,[byte[]]$Bytes) {
  $temporary=$Name+'.codex-web-'+[guid]::NewGuid().ToString('N')+'.tmp'
  $replaced=$Name+'.codex-web-'+[guid]::NewGuid().ToString('N')+'.replaced'
  try {
    [IO.File]::WriteAllBytes($temporary,$Bytes)
    # Windows PowerShell 5.1 coerces a null backup path to an invalid filename.
    if(Test-Path -LiteralPath $Name){[IO.File]::Replace($temporary,$Name,$replaced)}
    else{[IO.File]::Move($temporary,$Name)}
  } finally {
    if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}
    if(Test-Path -LiteralPath $replaced){Remove-Item -LiteralPath $replaced -Force}
  }
}
function Write-WebTextAtomic([string]$Name,[string]$Text,[Text.Encoding]$Encoding) {
  [byte[]]$bytes=$Encoding.GetPreamble()+$Encoding.GetBytes($Text)
  Write-WebBytesAtomic $Name $bytes
}
function Save-WebState([string]$Name,$State) {
  if(Test-Path -LiteralPath $Name){throw 'Preserve existing release journal'}
  $text=$State|ConvertTo-Json -Depth 16
  $null=ConvertFrom-Json -InputObject $text
  Write-WebTextAtomic $Name $text (New-Object Text.UTF8Encoding($false))
  if([IO.File]::ReadAllText($Name) -ne $text){throw 'Release journal readback failed'}
}
function Set-WebPin([string]$Name,[string]$Image) {
  $bytes = [IO.File]::ReadAllBytes($Name)
  $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
  $text = [IO.File]::ReadAllText($Name)
  $pattern = '(?m)^TEMICHEVVET_WEB_IMAGE=[^\r\n]*'
  if ([regex]::Matches($text,$pattern).Count -ne 1) { throw "Exactly one Web image pin is required in $Name" }
  $updated = [regex]::Replace($text,$pattern,"TEMICHEVVET_WEB_IMAGE=$Image")
  foreach ($key in @('TEMICHEVVET_REMOTE_WEB_IMAGE')) {
    $remotePattern = '(?m)^' + $key + '=[^\r\n]*'
    if ([regex]::Matches($updated,$remotePattern).Count -gt 1) { throw "Duplicate release pin: $key" }
    if ([regex]::IsMatch($updated,$remotePattern)) { $updated=[regex]::Replace($updated,$remotePattern,($key+'='+$Image)) }
  }
  Write-WebTextAtomic $Name $updated (New-Object Text.UTF8Encoding($bom))
}
function Set-DiagnosticsRevisions([string]$Name) {
  $config = [IO.File]::ReadAllText($Name) | ConvertFrom-Json
  $config | Add-Member -NotePropertyName expectedRevision -NotePropertyValue $script:Manifest.baseRevision -Force
  $config | Add-Member -NotePropertyName expectedWebRevision -NotePropertyValue $script:Manifest.revision -Force
  $config | Add-Member -NotePropertyName expectedWebImage -NotePropertyValue $script:Manifest.images.web.candidate -Force
  Write-WebTextAtomic $Name ($config | ConvertTo-Json -Depth 32) (New-Object Text.UTF8Encoding($false))
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
  if((Get-Hash $Compose) -ne $State.composeHash){throw 'Compose changed after Web release; refuse to recreate a different service'}
  foreach ($file in $State.envFiles) {
    $live = Join-Path $Root $file.name
    $beforeHash=Get-Hash (Join-Path $BackupPath $file.savedName)
    if($beforeHash -ne $file.beforeHash){throw "Configuration backup changed: $($file.name)"}
    if ((Get-Hash $live) -notin @($beforeHash,$file.appliedHash)) { throw "Configuration changed after preflight: $($file.name)" }
  }
  foreach ($file in $State.envFiles) {
    $saved=Join-Path $BackupPath $file.savedName;$live=Join-Path $Root $file.name
    if((Get-Hash $live) -ne (Get-Hash $saved)){Write-WebBytesAtomic $live ([IO.File]::ReadAllBytes($saved))}
  }
}
$Manifest = Get-Content -LiteralPath (Join-Path $PackageRoot 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($Manifest.releaseId -ne 'crm-booking-source-web-20261022-r1' -or $Manifest.revision -ne '7e4f6b0e946b2266147adcc429eb4ecc50f8ab50' -or $Manifest.images.web.previousId -ne 'sha256:12d225af8448dc1794052bd429c13d1b8733f1b0b7e5f4e5938dcd958960f185'){throw 'Wrong qualified Web packet'}
if($Manifest.images.api.previousId -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Seal the coordinated API identity before Web Apply'}
foreach($file in $Manifest.files){if($file.name -notmatch '^[A-Za-z0-9_./-]+$' -or $file.name -match '(^|/)\.\.(/|$)' -or (Get-Hash (Join-Path $PackageRoot $file.name)) -ne $file.sha256){throw 'Web packet checksum/path mismatch'}}
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
      # Match Compose's ordered --env-file precedence: .env.runtime overrides
      # .env. Duplicate keys inside either file are still refused above; the
      # effective Compose API image is checked against the running API below.
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
$statePath = Join-Path $BackupPath 'web-release-state.json'
if ($Mode -eq 'Rollback') {
  $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
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
$backup = Get-Content -LiteralPath (Join-Path $BackupPath 'web-prepared.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$cleanup = Get-Content -LiteralPath (Join-Path $BackupPath 'qa-cleanup.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($backup.releaseId -ne $Manifest.releaseId -or $backup.candidateId -ne $Manifest.images.web.candidateId -or $backup.previousWebId -ne $Manifest.images.web.previousId -or [DateTime]::Parse($backup.preparedAt).ToUniversalTime() -lt [DateTime]::UtcNow.AddHours(-4)){throw 'Fresh matching Web preparation is required'}
if(@($backup.qa).Count -ne 2 -or @($backup.qa|Where-Object{$_.kind -eq 'retained' -and $_.httpShaMime -and $_.priorLiveAssetsPreserved -gt 0}).Count -ne 1 -or @($backup.qa|Where-Object{$_.kind -eq 'empty' -and $_.httpShaMime}).Count -ne 1){throw 'Both empty and actual nonempty volume checks must pass'}
if(-not $cleanup.ownedContainersRemoved -or -not $cleanup.ownedVolumesRemoved -or -not $cleanup.productionVolumeRetained){throw 'QA cleanup receipt required'}
if((Get-Hash (Join-Path $BackupPath 'assets-before.tar')) -ne $backup.webAssetsBackupHash){throw 'Web assets backup changed'}
$qualifiedPath=Join-Path $BackupPath 'web-manifest-qualified.json'
if((Get-Hash $qualifiedPath) -ne $backup.manifestHash){throw 'Original QA manifest differs'}
$qualified=Get-Content -LiteralPath $qualifiedPath -Raw -Encoding UTF8|ConvertFrom-Json
$qualifiedPayload=@($qualified.files|Where-Object{$_.name.StartsWith('web/') -or $_.name -eq 'Dockerfile.web'}|ForEach-Object{$_.name+' '+$_.sha256}|Sort-Object)
$currentPayload=@($Manifest.files|Where-Object{$_.name.StartsWith('web/') -or $_.name -eq 'Dockerfile.web'}|ForEach-Object{$_.name+' '+$_.sha256}|Sort-Object)
if(($qualifiedPayload -join "`n") -ne ($currentPayload -join "`n")){throw 'Web payload changed since volume QA'}
# Web does not touch the database. Its rollback uses the retained assets and
# previous image/config; the coordinated API packet owns the database backup.
$previous = @(ConvertFrom-Json (Invoke-Docker -Arguments @('image','inspect',$Manifest.images.web.previous)))[0]
if ($previous.Id -ne $Manifest.images.web.previousId) { throw 'Previous rollback image must be present locally' }
$envFiles = @()
$composeHash=Get-Hash $Compose
[IO.File]::WriteAllBytes((Join-Path $BackupPath 'before-docker-compose.yml'),[IO.File]::ReadAllBytes($Compose))
if((Get-Hash (Join-Path $BackupPath 'before-docker-compose.yml')) -ne $composeHash){throw 'Compose changed during backup'}
foreach ($name in @('.env','.env.runtime')) {
  $live = Join-Path $Root $name
  if (-not (Test-Path -LiteralPath $live)) { continue }
  $text = [IO.File]::ReadAllText($live)
  if ($name -eq '.env.runtime' -and $text -notmatch '(?m)^TEMICHEVVET_WEB_IMAGE=') { continue }
  if ([regex]::Matches($text,'(?m)^TEMICHEVVET_WEB_IMAGE=[^\r\n]*').Count -ne 1) { throw "Ambiguous Web pin in $name" }
  $savedName = 'before' + $name
  [IO.File]::WriteAllBytes((Join-Path $BackupPath $savedName),[IO.File]::ReadAllBytes($live))
  $envFiles += [PSCustomObject]@{name=$name;savedName=$savedName;appliedHash='';beforeHash=(Get-Hash (Join-Path $BackupPath $savedName));kind='env'}
}
if (Test-Path -LiteralPath $diagnosticsPath) {
  [IO.File]::WriteAllBytes((Join-Path $BackupPath 'before-diagnostics.json'),[IO.File]::ReadAllBytes($diagnosticsPath))
  $envFiles += [PSCustomObject]@{name=$diagnosticsRelative;savedName='before-diagnostics.json';appliedHash='';beforeHash=(Get-Hash (Join-Path $BackupPath 'before-diagnostics.json'));kind='diagnostics'}
}
Invoke-Compose $Manifest.images.web.candidate -ValidateOnly
$state = [PSCustomObject]@{ root=$Root; previousImage=$Manifest.images.web.previous; previousId=$Manifest.images.web.previousId; candidateId=$Manifest.images.web.candidateId; protected=$identities; envFiles=$envFiles; composeHash=$composeHash; composeSavedName='before-docker-compose.yml' }
try {
  foreach ($file in $envFiles) {
    $live = Join-Path $Root $file.name
    if ($file.kind -eq 'diagnostics') { Set-DiagnosticsRevisions $live } else { Set-WebPin $live $Manifest.images.web.candidate }
    $file.appliedHash=Get-Hash $live
  }
  Save-WebState $statePath $state
} catch {
  Restore-Configuration $state
  throw
}
try {
  if((Get-Hash $Compose) -ne $state.composeHash){throw 'Compose changed before Web switch'}
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
