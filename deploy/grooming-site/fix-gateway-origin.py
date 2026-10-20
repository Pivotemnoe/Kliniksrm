#!/usr/bin/env python3
"""Add the public grooming origin to the existing gateway, without an image change."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
import urllib.request

ROOT = Path('/opt/temichevvet-owner-gateway')
BACKUP = ROOT / 'backups/grooming-site-origin-20261020-r1'
COMPOSE = ROOT / 'releases/crm-redesign-20261019-r3/compose-linux-amd64'
GATEWAY = 'temichevvet-owner-gateway'
IMAGE = 'sha256:218a56904941ae692ae8f8dbe81bb1d4baab78d7361e72ceda651ec8337b21d8'
KEY = 'OWNER_GATEWAY_PUBLIC_SITE_ORIGINS'
ORIGIN = 'https://pet.temichevvet.ru'


def run(*command):
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Command failed: ' + command[0] + '\n' + result.stderr[-1400:])
    return result.stdout


def inspect(name):
    return json.loads(run('docker', 'inspect', name))[0]


def env(container):
    return dict(line.split('=', 1) for line in container['Config']['Env'])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    path = BACKUP / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def compose(*args):
    return run(str(COMPOSE), '--project-directory', str(ROOT), '--project-name',
               'temichevvet-owner-gateway', '--file', str(ROOT / 'docker-compose.yml'),
               '--env-file', str(ROOT / '.env'), *args)


def healthy():
    for _ in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4100/health', timeout=2) as response:
                if response.status == 200 and inspect(GATEWAY)['Image'] == IMAGE:
                    return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('Gateway did not become healthy')


def put_env(content):
    temp = ROOT / '.env.grooming-origin-next'
    temp.write_bytes(content)
    temp.chmod(0o600)
    os.replace(temp, ROOT / '.env')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['apply', 'rollback'])
    args = parser.parse_args()
    if socket.gethostname() != 'msk-1-vm-d817':
        raise RuntimeError('Wrong gateway host')
    current = inspect(GATEWAY)
    if current['Image'] != IMAGE:
        raise RuntimeError('Gateway image changed; reconcile the later release first')
    if args.mode == 'rollback':
        receipt = json.loads((BACKUP / 'applied.json').read_text())
        if digest(ROOT / '.env') != receipt['envSha256'] or digest(ROOT / 'docker-compose.yml') != receipt['composeSha256']:
            raise RuntimeError('Later configuration must not be overwritten')
        put_env((BACKUP / 'before.env').read_bytes())
        compose('up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'gateway')
        healthy()
        save('rolled-back.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'imageId': IMAGE})
        print('ORIGIN_ROLLBACK_OK')
        return
    before = env(current)
    origins = [item.strip() for item in before.get(KEY, '').split(',') if item.strip()]
    if ORIGIN in origins or not origins or before.get('GROOMING_SITE_ORIGINS') != ORIGIN:
        raise RuntimeError('Unexpected origin configuration; inspect before applying')
    if BACKUP.exists():
        raise RuntimeError('Origin backup already exists; inspect receipt before repeating')
    BACKUP.mkdir(parents=True, mode=0o700)
    for source, destination in [('.env', 'before.env'), ('docker-compose.yml', 'before-compose.yml')]:
        shutil.copy2(ROOT / source, BACKUP / destination)
        (BACKUP / destination).chmod(0o600)
    protected = {name: inspect(name)['Id'] for name in ['temichevvet-owner-postgres', 'temichevvet-owner-backup']}
    compose_hash = digest(ROOT / 'docker-compose.yml')
    save('before.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'imageId': IMAGE,
                         'origins': origins, 'envSha256': digest(ROOT / '.env'),
                         'composeSha256': compose_hash, 'protected': protected})
    pattern = r'(?m)^' + KEY + r'=[^\r\n]*'
    text = (ROOT / '.env').read_text()
    if len(re.findall(pattern, text)) != 1:
        raise RuntimeError('Expected exactly one existing origin setting')
    target = ','.join([*origins, ORIGIN])
    changed = re.sub(pattern, lambda match: KEY + '=' + target, text)
    put_env(changed.encode())
    changed_hash = digest(ROOT / '.env')
    try:
        candidate = json.loads(compose('config', '--format', 'json'))['services']['gateway']
        if candidate['image'] != current['Config']['Image'] or inspect(candidate['image'])['Id'] != IMAGE:
            raise RuntimeError('Resolved Compose image differs')
        if candidate['environment'].get(KEY) != target:
            raise RuntimeError('Resolved Compose did not use the new origin')
        for name, value in candidate['environment'].items():
            if name != KEY and before.get(name) != value:
                raise RuntimeError('Unrelated gateway setting changed: ' + name)
        if inspect(GATEWAY)['Id'] != current['Id'] or digest(ROOT / 'docker-compose.yml') != compose_hash:
            raise RuntimeError('Concurrent gateway/configuration change')
        compose('up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'gateway')
        healthy()
        after = inspect(GATEWAY)
        if env(after) != {**before, KEY: target}:
            raise RuntimeError('Unrelated runtime environment changed')
        if any(inspect(name)['Id'] != identity for name, identity in protected.items()):
            raise RuntimeError('Protected database/backup service changed')
        receipt = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'imageId': after['Image'],
                   'changedSettings': [KEY], 'origins': target.split(','), 'envSha256': changed_hash,
                   'composeSha256': compose_hash, 'protectedServicesUnchanged': True,
                   'databaseMigration': False}
        save('applied.json', receipt)
        print(json.dumps(receipt, ensure_ascii=False))
    except Exception:
        if inspect(GATEWAY)['Image'] != IMAGE or digest(ROOT / '.env') != changed_hash or digest(ROOT / 'docker-compose.yml') != compose_hash:
            raise RuntimeError('Release/configuration changed; automatic rollback refused')
        put_env((BACKUP / 'before.env').read_bytes())
        compose('up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'gateway')
        healthy()
        raise


if __name__ == '__main__':
    main()
