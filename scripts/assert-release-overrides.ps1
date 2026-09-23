# Fail closed rather than silently start a different release from an old override.
function Assert-ReleaseOverridesConsistent([string]$EnvPath, [string]$OverridePath) {
  if (!(Test-Path -LiteralPath $EnvPath) -or !(Test-Path -LiteralPath $OverridePath)) { return }
  $base=@{}; $overrides=@{}
  foreach($line in [IO.File]::ReadAllLines($EnvPath)) {
    if($line -match '^(CRM_SOURCE_VERSION|TEMICHEVVET_(?:API_IMAGE|WEB_IMAGE|REMOTE_API_IMAGE|REMOTE_WEB_IMAGE))=(.*)$') { $base[$matches[1]]=$matches[2].Trim() }
  }
  foreach($line in [IO.File]::ReadAllLines($OverridePath)) {
    if($line -match '^(CRM_SOURCE_VERSION|TEMICHEVVET_(?:API_IMAGE|WEB_IMAGE|REMOTE_API_IMAGE|REMOTE_WEB_IMAGE))=(.*)$') { $overrides[$matches[1]]=$matches[2].Trim() }
  }
  foreach($key in $overrides.Keys) {
    if($base.ContainsKey($key) -and $base[$key] -ne $overrides[$key]) {
      throw "Conflicting release configuration in .env and .env.runtime: $key. Startup/update stopped; running containers are unchanged. Reconcile release configuration before retrying."
    }
  }
}
