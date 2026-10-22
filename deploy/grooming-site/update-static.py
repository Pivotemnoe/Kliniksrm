#!/usr/bin/env python3
"""Atomically update only the grooming site's files; retain its current services/config."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import subprocess
import tarfile
import tempfile

DOMAIN = 'pet.temichevvet.ru'
ROOT = Path('/var/www/temichevvet-grooming')
CURRENT = ROOT / 'current'
CONF = Path('/etc/nginx/sites-available') / DOMAIN
BACKUPS = Path('/var/backups/temichevvet-grooming')


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr[-1600:] or 'Command failed: ' + args[0])
    return result.stdout


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def runtime():
    return {'nginxSha256': digest(CONF), 'containers': sorted(run(
        'docker', 'ps', '--format', '{{.Names}}|{{.ID}}|{{.Image}}').splitlines())}


def switch(target, release):
    link = ROOT / ('.current-' + release)
    if link.exists() or link.is_symlink():
        raise RuntimeError('Temporary release pointer already exists')
    link.symlink_to(target)
    os.replace(link, CURRENT)


def verify(release):
    result = json.loads(run('curl', '--fail', '--silent', '--show-error',
        '--max-time', '15', '--noproxy', '*', '--resolve', DOMAIN + ':443:127.0.0.1',
        'https://' + DOMAIN + '/release.json'))
    if result['releaseId'] != release:
        raise RuntimeError('Public HTTPS release differs')
    catalog = json.loads(run('curl', '--fail', '--silent', '--show-error',
        '--max-time', '20', '--noproxy', '*', '--resolve', DOMAIN + ':443:127.0.0.1',
        'https://' + DOMAIN + '/v1/public/grooming/catalog'))
    if not isinstance(catalog, dict):
        raise RuntimeError('Public grooming catalog unavailable')
    return result


def deploy(args, backup, build):
    previous = (ROOT / 'releases' / args.expected_previous).resolve(strict=True)
    if not CURRENT.is_symlink() or CURRENT.resolve(strict=True) != previous:
        raise RuntimeError('Current release changed; inspect before proceeding')
    archive = Path(args.archive)
    if not re.fullmatch('[a-f0-9]{64}', args.sha256 or '') or digest(archive) != args.sha256:
        raise RuntimeError('Archive digest differs')
    if build.exists() or backup.exists():
        raise RuntimeError('Release or receipt already exists; do not repeat blindly')
    before_runtime = runtime()
    backup.mkdir(parents=True, mode=0o700)
    before = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'previousCurrent': str(previous), 'releaseId': args.release,
        'archiveSha256': args.sha256, 'runtime': before_runtime}
    save(backup / 'before.json', before)
    shutil.copy2(previous / 'release.json', backup / 'previous-release.json')
    stage = Path(tempfile.mkdtemp(prefix='.' + args.release + '-', dir=build.parent))
    changed = False
    try:
        with tarfile.open(archive) as package:
            members = package.getmembers()
            if sum(item.size for item in members) > 100 * 1024 * 1024:
                raise RuntimeError('Unexpected package size')
            seen = set()
            for item in members:
                name = PurePosixPath(item.name)
                if (name.is_absolute() or '..' in name.parts or not name.parts
                        or any(part.startswith('.') for part in name.parts)
                        or not (item.isdir() or item.isfile()) or str(name) in seen):
                    raise RuntimeError('Unexpected archive entry: ' + item.name)
                seen.add(str(name))
                target = stage.joinpath(*name.parts)
                if item.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.extractfile(item) as source, target.open('wb') as destination:
                        shutil.copyfileobj(source, destination)
        metadata = json.loads((stage / 'release.json').read_text())
        if metadata['releaseId'] != args.release or metadata['site'] != 'https://' + DOMAIN + '/':
            raise RuntimeError('Package metadata differs')
        files = {str(p.relative_to(stage)): digest(p) for p in stage.rglob('*')
                 if p.is_file() and p.name != 'release.json'}
        if files != metadata['files'] or 'index.html' not in files:
            raise RuntimeError('Package contents differ from manifest')
        # Keep old hashed entry assets for browsers that just loaded the prior index.
        carried = {}
        for old in (previous / 'assets').iterdir():
            if old.is_file() and re.fullmatch(r'.+-[\w-]+\.(?:js|css|woff2)', old.name):
                target = stage / 'assets' / old.name
                if not target.exists():
                    shutil.copy2(old, target)
                    carried['assets/' + old.name] = digest(target)
        for item in stage.rglob('*'):
            item.chmod(0o755 if item.is_dir() else 0o644)
        stage.chmod(0o755)
        stage.rename(build)
        if runtime() != before_runtime or CURRENT.resolve(strict=True) != previous:
            raise RuntimeError('Host state changed during staging; inspect before cutover')
        switch(build, args.release)
        changed = True
        verified = verify(args.release)
        if runtime() != before_runtime:
            raise RuntimeError('Runtime/configuration changed during update')
        receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'status': 'PUBLISHED', 'release': verified, 'previousCurrent': str(previous),
            'archiveSha256': args.sha256, 'carriedForwardAssets': carried,
            'runtimeUnchanged': True, 'backup': str(backup)}
        save(backup / 'published.json', receipt)
        print(json.dumps(receipt, ensure_ascii=False))
    except Exception as error:
        restored = False
        if changed and CURRENT.is_symlink() and CURRENT.resolve() == build:
            switch(previous, args.release)
            restored = True
        save(backup / 'failure.json', {'error': str(error), 'restoredPrevious': restored})
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['deploy', 'verify', 'rollback'])
    parser.add_argument('--release', required=True)
    parser.add_argument('--expected-previous')
    parser.add_argument('--archive')
    parser.add_argument('--sha256')
    args = parser.parse_args()
    if not re.fullmatch(r'grooming-site-[a-z0-9-]{1,70}', args.release):
        parser.error('Invalid release identifier')
    # The coordinated attribution release is also a valid static predecessor.
    # deploy() still requires CURRENT to resolve to this exact existing release.
    if args.expected_previous is not None and not re.fullmatch(
            r'(?:grooming-site-|booking-attribution-grooming-)[a-z0-9-]{1,70}',
            args.expected_previous):
        parser.error('Invalid previous release identifier')
    if socket.gethostname() != 'msk-1-vm-d817':
        raise RuntimeError('Wrong public website host')
    backup, build = BACKUPS / args.release, ROOT / 'releases' / args.release
    with (ROOT / '.static-update.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.mode == 'deploy':
            if not args.expected_previous or not args.archive:
                parser.error('Deploy requires expected previous release and archive')
            deploy(args, backup, build)
        elif args.mode == 'verify':
            print(json.dumps(verify(args.release), ensure_ascii=False))
        else:
            before = json.loads((backup / 'before.json').read_text())
            if not CURRENT.is_symlink() or CURRENT.resolve() != build:
                raise RuntimeError('Refusing to replace a later release')
            previous = Path(before['previousCurrent'])
            if previous.parent != ROOT / 'releases' or not previous.is_dir():
                raise RuntimeError('Previous release unavailable')
            switch(previous, args.release)
            verified = verify(json.loads((previous / 'release.json').read_text())['releaseId'])
            save(backup / 'rollback.json', {'release': verified})
            print('STATIC_ROLLBACK_OK')


if __name__ == '__main__':
    main()
