param([string]$BackupFolder='backup-final')
$ErrorActionPreference='Stop'
if ($BackupFolder -notmatch '^backup(?:-[a-z0-9]+)?$') { throw 'Invalid QA backup folder' }
& /scripts/prepare-backup.ps1 -BackupPath (Join-Path /qa $BackupFolder) -PostgresContainer crm-redesign-production-qa-postgres -FilesContainer crm-redesign-production-qa-minio -ProtectedContainers @('crm-redesign-production-qa-api','crm-redesign-production-qa-postgres','crm-redesign-production-qa-redis','crm-redesign-production-qa-minio','crm-redesign-production-qa-gateway') -Execute
