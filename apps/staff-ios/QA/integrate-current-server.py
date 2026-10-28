#!/usr/bin/env python3
"""Merge the reviewed staff API snapshots into the latest verified CRM source, locally."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[3]
own = root / 'apps/staff-ios'
backend = own / 'QA/.generated/backend'
out = own / 'build/ServerCandidate'
out.mkdir(parents=True, exist_ok=True)
base = 'c43e0e8c8dd46de80a4616072b1a8f9d2826d1c1'
current = '4db748e0236b4b294bca8171550f3cefed49a8db'
grooming_base = '365ef4914b72d487be1e689360bad66f64d08c9a'

def show(rev, path):
    r = subprocess.run(['git', 'show', f'{rev}:{path}'], cwd=root, capture_output=True)
    return r.stdout if r.returncode == 0 else None

def paths(rev):
    return set(subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', rev, '--', 'apps/api/src', 'prisma/schema.prisma'], cwd=root).decode().splitlines())

all_paths = paths(current) | paths(base) | {str(p.relative_to(backend)) for p in (backend / 'apps/api/src').rglob('*.ts')} | {'prisma/schema.prisma'}
changes = []
scratch = out / 'merge-inputs'
scratch.mkdir(exist_ok=True)
for path in sorted(all_paths):
    merge_base = grooming_base if path == 'apps/api/src/modules/grooming/grooming.service.ts' else base
    b, t = show(merge_base, path), show(current, path)
    p = backend / path
    o = p.read_bytes() if p.exists() else None
    if o == b:
        merged = t
    elif t == b or o == t:
        merged = o
    elif b is None:
        if t is None:
            merged = o
        elif o is None:
            merged = t
        else:
            raise RuntimeError('Both versions added a different file: ' + path)
    elif o is None or t is None:
        raise RuntimeError('Deletion requires explicit review: ' + path)
    else:
        for name, data in [('ours', o), ('base', b), ('current', t)]:
            (scratch / name).write_bytes(data)
        r = subprocess.run(['git', 'merge-file', '-p', '--diff3', str(scratch / 'ours'), str(scratch / 'base'), str(scratch / 'current')], capture_output=True)
        if r.returncode:
            (out / 'unresolved-conflict.txt').write_bytes(r.stdout)
            raise RuntimeError('Unresolved conflict: ' + path)
        merged = r.stdout
    if merged is None:
        continue
    if b'<<<<<<<' in merged:
        raise RuntimeError('Conflict marker: ' + path)
    target = out / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(merged)
    if merged != t:
        changes.append({'path': path, 'currentSha256': hashlib.sha256(t).hexdigest() if t is not None else None, 'sha256': hashlib.sha256(merged).hexdigest()})

# Copy only after every three-way merge has succeeded. Nothing outside this app is edited.
for path in sorted(all_paths):
    source = out / path
    if source.is_file():
        target = backend / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
(out / 'current-schema.prisma').write_bytes(show(current, 'prisma/schema.prisma'))
report = {'currentProductionSourceCommit': current, 'commonBase': base,
          'groomingSpecificBase': grooming_base, 'changedFiles': changes,
          'unresolvedConflicts': 0, 'productionChanged': False,
          'runtimeVerificationRequiredBeforeDeployment': True}
(own / 'Docs/current-server-candidate.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'currentServerCandidate': True, 'changedFiles': len(changes), 'unresolvedConflicts': 0, 'productionChanged': False}))
