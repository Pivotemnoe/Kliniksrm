#!/usr/bin/env python3
"""Create a reviewable API-only packet. Does not contact or modify any server."""
from pathlib import Path
import hashlib
import json
import shutil
import tarfile

own = Path(__file__).resolve().parents[1]
backend = own / 'QA/.generated/backend'
packet = own / 'build/StaffServerPacket'
packet.mkdir(parents=True, exist_ok=True)
report = json.loads((own / 'Docs/current-server-candidate.json').read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
for entry in report['changedFiles']:
    source = backend / entry['path']
    if sha(source) != entry['sha256']:
        raise RuntimeError('Source changed after integration: ' + entry['path'])
    if entry['path'].endswith('.ts'):
        stem = entry['path'].replace('apps/api/src/', '').removesuffix('.ts')
        for suffix in ['.js', '.d.ts', '.js.map']:
            source = backend / 'apps/api/dist' / (stem + suffix)
            target = packet / 'api' / (stem + suffix)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
shutil.copyfile(backend / 'prisma/schema.prisma', packet / 'schema.prisma')
adapter = own / 'ServerAdapter/password-login'
shutil.copyfile(adapter / 'assert-model.cjs', packet / 'assert-model.cjs')
shutil.copyfile(adapter / 'README.md', packet / 'README.md')
migration = packet / 'migration'
migration.mkdir(exist_ok=True)
shutil.copyfile(adapter / 'staff-integration.sql', migration / 'migration.sql')
(packet / 'Dockerfile.api').write_text('''ARG BASE_API_IMAGE
FROM ${BASE_API_IMAGE}
RUN node -e "require('fs').writeFileSync('/tmp/staff-base-datamodel.json',JSON.stringify(require('@prisma/client').Prisma.dmmf.datamodel))"
COPY schema.prisma /app/prisma/schema.prisma
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused node /app/node_modules/prisma/build/index.js generate --schema /app/prisma/schema.prisma
COPY assert-model.cjs /tmp/staff-assert-model.cjs
RUN node /tmp/staff-assert-model.cjs && rm /tmp/staff-assert-model.cjs /tmp/staff-base-datamodel.json
COPY api/ /app/apps/api/dist/
COPY migration/ /app/prisma/migrations/20261028213000_staff_native_shared/
LABEL io.temichevvet.release="crm-staff-native-password-20261028-r2"
''')
manifest = {
    'releaseId': 'crm-staff-native-password-20261028-r2',
    'baseSourceCommit': report['currentProductionSourceCommit'],
    'expectedBaseApiImageId': 'sha256:f28aa61e0caf40e900f9e42b5afef13dbe768a1c143a250190cee8202bc3492d',
    'migration': '20261028213000_staff_native_shared',
    'schema': {'newTables': 6, 'newExistingTableColumn': 'InternalMessage.clientKey nullable String', 'destructiveStatements': False},
    'switchOnly': ['clinic-crm-api'],
    'preserve': ['clinic-crm-web', 'PostgreSQL', 'Redis', 'MinIO', 'backups', 'owner-gateway', 'clinical data', 'existing roles'],
    'sourceFiles': report['changedFiles'],
    'files': {str(p.relative_to(packet)): sha(p) for p in sorted(packet.rglob('*')) if p.is_file() and p.name != 'manifest.json'},
    'status': 'LOCAL_CANDIDATE_NOT_DEPLOYED',
    'freshRuntimeBackupAndRestoreQualificationRequired': True,
    'productionChanged': False,
}
(packet / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
archive = own / 'Artifacts/StaffServer-password-login-20261028.tar.gz'
archive.parent.mkdir(exist_ok=True)
with tarfile.open(archive, 'w:gz') as tar:
    tar.add(packet, arcname='staff-server-packet')
(own / 'Docs/password-login-server-packet.json').write_text(json.dumps({
    'status': manifest['status'], 'releaseId': manifest['releaseId'], 'path': str(archive.relative_to(own)),
    'sha256': sha(archive), 'bytes': archive.stat().st_size, 'files': len(manifest['files']) + 1,
    'baseSourceCommit': manifest['baseSourceCommit'], 'productionChanged': False,
}, indent=2) + '\n')
print(json.dumps({'serverPacketPrepared': True, 'files': len(manifest['files']) + 1, 'productionChanged': False}))
