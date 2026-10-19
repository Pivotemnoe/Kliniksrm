param([ValidateSet('Inspect','Apply','Rollback')][string]$Mode='Inspect',[string]$BackupFolder='backup',[switch]$FailReleaseCheck)
if ($BackupFolder -notmatch '^backup(?:-[a-z0-9]+)?$') { throw 'Only named QA backup directories are allowed' }
$releaseUrl = if ($FailReleaseCheck) { 'http://web/intentional-release-check-failure' } else { 'http://web/release.json' }
& /scripts/release-web.ps1 -Mode $Mode -Root /qa -PackageRoot /packet -BackupPath (Join-Path /qa $BackupFolder) `
  -WebContainer crm-redesign-production-qa-web -ApiContainer crm-redesign-production-qa-api `
  -ProtectedContainers @('crm-redesign-production-qa-api','crm-redesign-production-qa-postgres','crm-redesign-production-qa-redis','crm-redesign-production-qa-minio','crm-redesign-production-qa-gateway') `
  -HealthUrl http://web/api/health -ReleaseUrl $releaseUrl -Execute:($Mode -ne 'Inspect')
