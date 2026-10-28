#!/usr/bin/env python3
"""Seal the API-only Windows release from fresh read-only preflight receipts."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tarfile

own = Path(__file__).resolve().parents[1]
release = own / 'Release'
stage = own / 'build/ProductionRelease-20261028'
packet = stage / 'packet'
packet.mkdir(parents=True, exist_ok=True)
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
write = lambda p, v: p.write_text(json.dumps(v, indent=2) + '\n')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pre = load(stage / 'preflight-clinic.private.json')
audit = load(stage / 'account-audit.private.json')['audit']
source = own / 'build/StaffServerPacket'
source_manifest = load(source / 'manifest.json')
assert pre['host'] == 'WIN-I123AM83GR4'
assert pre['containers'][0]['image'] == source_manifest['expectedBaseApiImageId']
assert pre['release']['revision'] == source_manifest['baseSourceCommit']
assert pre['health']['status'] == pre['health']['database'] == 'ok'
assert all(row['finished_at'] or row['rolled_back_at'] for row in audit['ledger'])
assert not any(row['migration_name'] == source_manifest['migration'] for row in audit['ledger'])
assert audit['remotePolicy'][0]['enabled'] and audit['gatewaySecretConfigured']
for path, expected in source_manifest['files'].items():
    assert sha(source / path) == expected, path
for name in ['api', 'migration']:
    shutil.copytree(source / name, packet / name, dirs_exist_ok=True)
for name in ['schema.prisma', 'assert-model.cjs', 'Dockerfile.api']:
    shutil.copyfile(source / name, packet / name)
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=own).decode().strip()
dockerfile = packet / 'Dockerfile.api'
dockerfile.write_text(dockerfile.read_text() + f'LABEL io.temichevvet.component-source="{revision}" org.opencontainers.image.revision="{revision}"\n')
for name in ['release.ps1', 'protected-snapshot.cjs', 'qualify.cjs', 'migration-status.cjs', 'rollback-compatible.cjs']:
    shutil.copyfile(release / name, packet / name)
# A detached phase survives an SSH interruption; it never retries a mutation automatically.
runner = '''[CmdletBinding()]
param([ValidateSet('Inspect','Build','Backup','Apply','Verify','Rollback')][string]$Phase)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$stage=Split-Path $PSScriptRoot -Parent;$statusPath=$stage+'/status-'+$Phase+'.json'
function Status([string]$Value,[string]$Detail=''){[IO.File]::WriteAllText(($statusPath+'.tmp'),([pscustomobject]@{phase=$Phase;status=$Value;at=[DateTime]::UtcNow.ToString('o');detail=$Detail}|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)));Move-Item -Force -LiteralPath ($statusPath+'.tmp') -Destination $statusPath}
if(Test-Path $statusPath){$old=Get-Content $statusPath -Raw -Encoding UTF8|ConvertFrom-Json;if($old.status -eq 'COMPLETE'){Write-Output 'ALREADY_COMPLETE';return};throw 'Existing phase must be inspected before retrying'}
$null=Start-Transcript -LiteralPath ($stage+'/task-'+$Phase+'.log') -Append;Status 'RUNNING'
try{& ($PSScriptRoot+'/release.ps1') -Mode $Phase -Execute;Status 'COMPLETE';Write-Output ('PHASE_COMPLETE '+$Phase)}catch{Status 'FAILED' ($_.Exception.Message+'; '+$_.InvocationInfo.PositionMessage);throw}finally{$null=Stop-Transcript}
'''
(packet / 'task-runner.ps1').write_text(runner)
mounts = load(stage / 'account-audit.private.json')['mounts']
volume = next(m['Name'] for c in mounts if c['container'] == 'clinic-crm-minio' for m in c['mounts'] if m['Destination'] == '/data' and m['Type'] == 'volume')
m = {'releaseId': source_manifest['releaseId'], 'host': pre['host'], 'revision': revision,
     'previousWebRevision': pre['release']['revision'], 'previous': {'api': pre['containers'][0], 'web': pre['containers'][1]},
     'candidate': {'api': {'reference': 'temichevvet-crm-api:staff-native-password-' + revision[:7] + '-r1'},
                   'web': {'reference': pre['containers'][1]['reference']}},
     'configuration': pre['configuration'], 'protected': pre['containers'][1:],
     'minioVolume': volume, 'migration': source_manifest['migration'],
     'migrationSha256': sha(packet / 'migration/migration.sql'), 'schemaSha256': sha(packet / 'schema.prisma'),
     'previousMigrations': audit['ledger'],
     'allowedApiPaths': ['/app/apps/api/dist/' + p.removeprefix('api/') for p in source_manifest['files'] if p.startswith('api/')],
     'userAuthorization': '2026-10-28: update CRM server with backup, preserve data and existing rights, release staff iOS build 2 without CRM invitations'}
write(packet / 'release.json', m)
write(stage / 'packet-checksums.json', {str(p.relative_to(packet)): sha(p) for p in sorted(packet.rglob('*')) if p.is_file()})
archive = stage / 'staff-native-server-clinic-20261028-r2.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(packet, arcname='packet')
    tar.add(stage / 'packet-checksums.json', arcname='packet-checksums.json')
remote_stage = 'C:/Users/TemichevVet/TemichevVet/releases/' + m['releaseId']
remote_archive = 'C:/Users/TemichevVet/staff-native-server-clinic-20261028-r2.tar.gz'
stage_script = f'''$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$archive='{remote_archive}';$stage='{remote_stage}'
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne '{sha(archive)}'){{throw 'Archive differs'}}
if(Test-Path $stage){{throw 'Existing stage requires inspection'}}
$null=New-Item -ItemType Directory -Path $stage
& tar -xzf $archive -C $stage;if($LASTEXITCODE -ne 0){{throw 'Extraction failed'}}
$tokens=$null;$errors=$null;[void][System.Management.Automation.Language.Parser]::ParseFile(($stage+'/packet/release.ps1'),[ref]$tokens,[ref]$errors);if($errors.Count){{throw ($errors|Out-String)}}
& ($stage+'/packet/release.ps1') -Mode Inspect
'''
(stage / 'staff-native-stage-20261028.ps1').write_text(stage_script)
for phase in ['Build', 'Backup', 'Apply']:
    script = f'''$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$stage='{remote_stage}';$phase='{phase}';$task='Codex-StaffNative-20261028-r2-'+$phase
if(Test-Path ($stage+'/status-'+$phase+'.json')){{Get-Content ($stage+'/status-'+$phase+'.json') -Raw;return}}
$old=Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue;if($null -ne $old){{throw 'Existing task requires inspection'}}
$action=New-ScheduledTaskAction -Execute 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' -Argument ('-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$stage+'/packet/task-runner.ps1" -Phase '+$phase)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType S4U -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$null=Register-ScheduledTask -TaskName $task -Action $action -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName $task
[pscustomobject]@{{task=$task;started=$true;phase=$phase}}|ConvertTo-Json
'''
    (stage / ('staff-native-start-' + phase.lower() + '-20261028.ps1')).write_text(script)
status = f'''$ErrorActionPreference='Stop';$stage='{remote_stage}'
foreach($phase in @('Build','Backup','Apply')){{$p=$stage+'/status-'+$phase+'.json';if(Test-Path $p){{Get-Content $p -Raw}}}}
'''
(stage / 'staff-native-status-20261028.ps1').write_text(status)
(stage / 'staff-native-verify-20261028.ps1').write_text(f"& '{remote_stage}/packet/release.ps1' -Mode Verify\n")
write(stage / 'packet-summary.json', {'releaseId': m['releaseId'], 'revision': revision, 'sha256': sha(archive), 'archive': str(archive), 'apiOnly': True, 'protectedServices': 5, 'newTables': 6, 'atomicMigration': True})
print(json.dumps({'releasePacketSealed': True, 'apiOnly': True, 'protectedServices': 5, 'archiveBytes': archive.stat().st_size, 'atomicMigration': True}))
