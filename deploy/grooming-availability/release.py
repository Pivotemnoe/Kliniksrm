#!/usr/bin/env python3
"""Add the missing read-only grooming route without changing applications or data."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

RELEASE = 'grooming-availability-20261022-r1'
DOMAIN = 'pet.temichevvet.ru'
CONF = Path('/etc/nginx/sites-available') / DOMAIN
BACKUP = Path('/var/backups/temichevvet-grooming') / RELEASE


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def run(args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def render_config(before):
    require(b'location = /v1/public/grooming/availability {' not in before, 'Route already exists')
    pattern = rb'(?m)^    location = /v1/public/grooming/catalog \{\n.*?^    \}\n'
    matches = list(re.finditer(pattern, before, re.S))
    require(len(matches) == 1, 'Expected exactly one catalog location')
    block = matches[0].group()
    require(b'limit_except GET { deny all; }' in block, 'Catalog method guard differs')
    require(b'proxy_pass http://127.0.0.1:4100;' in block, 'Unexpected upstream')
    require(b'include /etc/nginx/proxy_params;' in block, 'Proxy headers differ')
    added = block.replace(b'/grooming/catalog', b'/grooming/availability', 1)
    candidate = before[:matches[0].end()] + added + before[matches[0].end():]
    require(candidate.replace(added, b'', 1) == before, 'Changes exceed one exact GET route')
    return candidate


def tree_digest(path):
    rows = []
    for p in sorted(path.rglob('*')):
        if p.is_symlink():
            rows.append([str(p.relative_to(path)), 'link', os.readlink(p)])
        elif p.is_file():
            rows.append([str(p.relative_to(path)), sha(p.read_bytes())])
    return sha(json.dumps(rows, separators=(',', ':')).encode())


def surroundings():
    other = {}
    for directory in ['sites-enabled', 'sites-available', 'conf.d']:
        for p in sorted((Path('/etc/nginx') / directory).rglob('*')):
            if p.is_file() and p.resolve() != CONF.resolve():
                other[str(p)] = sha(p.read_bytes())
    static = {}
    for name in ['grooming', 'pet-hotel']:
        current = Path('/var/www/temichevvet-' + name + '/current').resolve(strict=True)
        static[name] = {'current': str(current), 'tree': tree_digest(current)}
    names = ['temichevvet-owner-gateway', 'temichevvet-owner-postgres', 'temichevvet-owner-backup']
    items = json.loads(run(['docker', 'inspect', *names]))
    containers = [{'name': c['Name'], 'id': c['Id'], 'image': c['Image'], 'started': c['State']['StartedAt'], 'running': c['State']['Running']} for c in items]
    require(all(c['running'] for c in containers), 'A protected container is not running')
    return {'mainConfig': sha(Path('/etc/nginx/nginx.conf').read_bytes()), 'otherVhosts': other, 'static': static, 'containers': containers}


def test_config(candidate):
    main = Path('/etc/nginx/nginx.conf').read_text()
    pattern = r'(?m)^\s*include\s+/etc/nginx/sites-enabled/\*\s*;'
    require(len(re.findall(pattern, main)) == 1, 'Unexpected global sites include')
    with tempfile.TemporaryDirectory(prefix='.grooming-route-check-', dir='/etc/nginx') as temporary:
        temp = Path(temporary)
        enabled = temp / 'enabled'
        enabled.mkdir()
        count = 0
        for source in Path('/etc/nginx/sites-enabled').iterdir():
            target = source.resolve(strict=True)
            if target == CONF:
                target = candidate
                count += 1
            (enabled / source.name).symlink_to(target)
        require(count == 1, 'Expected one enabled grooming vhost')
        (temp / 'nginx.conf').write_text(re.sub(pattern, lambda _: '    include ' + str(enabled / '*') + ';', main))
        run(['nginx', '-t', '-p', '/etc/nginx/', '-c', str(temp / 'nginx.conf')])


def save(name, data):
    path = BACKUP / name
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    os.replace(temporary, path)


def replace_conf(data, mode):
    temporary = CONF.with_name('.' + DOMAIN + '-' + RELEASE)
    require(not temporary.exists(), 'Review an existing temporary config first')
    previous = CONF.stat()
    temporary.write_bytes(data)
    temporary.chmod(mode)
    os.chown(temporary, previous.st_uid, previous.st_gid)
    os.replace(temporary, CONF)


def endpoint():
    date = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).date().isoformat()
    url = 'https://' + DOMAIN + '/v1/public/grooming/availability?date=' + date + '&species=DOG&size=SMALL&coat=ANY'
    raw = run(['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '20', '--resolve', DOMAIN + ':443:127.0.0.1', url])
    data = json.loads(raw)
    require(isinstance(data.get('slots'), list) and isinstance(data.get('enabled'), bool), 'Availability is not the expected JSON')
    return {'json': True, 'enabled': data['enabled'], 'slots': len(data['slots'])}


def main(mode, expected):
    require(os.geteuid() == 0 and run(['hostname']).strip() == 'msk-1-vm-d817', 'Wrong host or user')
    if mode == 'prepare':
        require(re.fullmatch(r'[a-f0-9]{64}', expected or '') and sha(CONF.read_bytes()) == expected, 'Nginx predecessor changed')
        require(not BACKUP.exists(), 'Preserve an existing release receipt')
        before = CONF.read_bytes()
        candidate = render_config(before)
        state = {'release': RELEASE, 'phase': 'PREPARED', 'at': stamp(), 'beforeHash': sha(before), 'candidateHash': sha(candidate), 'mode': stat.S_IMODE(CONF.stat().st_mode), 'protected': surroundings()}
        BACKUP.mkdir(mode=0o700, parents=True)
        (BACKUP / 'before.conf').write_bytes(before)
        (BACKUP / 'candidate.conf').write_bytes(candidate)
        test_config(BACKUP / 'candidate.conf')
        require(surroundings() == state['protected'] and sha(CONF.read_bytes()) == state['beforeHash'], 'Installation changed during prepare')
        save('state.json', state)
        return {'phase': 'PREPARED', 'candidateTested': True, 'beforeHash': state['beforeHash'], 'candidateHash': state['candidateHash'], 'backup': str(BACKUP)}
    state = json.loads((BACKUP / 'state.json').read_text())
    if mode == 'verify':
        require(sha(CONF.read_bytes()) == state['candidateHash'], 'Candidate config is not active')
        require(surroundings() == state['protected'], 'Protected services or static releases changed')
        return {'phase': state['phase'], 'route': endpoint(), 'protectedUnchanged': True, 'at': stamp()}
    rollback = mode == 'rollback'
    require(mode in ['apply', 'rollback'], 'Unknown action')
    require(sha(CONF.read_bytes()) == state['candidateHash' if rollback else 'beforeHash'], 'Refuse to overwrite a later vhost')
    protected = surroundings()
    if not rollback:
        require(state['phase'] == 'PREPARED' and protected == state['protected'], 'Prepared installation changed')
    source = BACKUP / ('before.conf' if rollback else 'candidate.conf')
    require(sha(source.read_bytes()) == state['beforeHash' if rollback else 'candidateHash'], 'Saved config changed')
    test_config(source)
    previous = CONF.read_bytes()
    try:
        replace_conf(source.read_bytes(), state['mode'])
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
        require(surroundings() == protected, 'Protected services or static releases changed')
        result = None if rollback else endpoint()
    except Exception:
        replace_conf(previous, state['mode'])
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
        raise
    state['phase'] = 'ROLLED_BACK' if rollback else 'COMPLETE'
    state['completedAt'] = stamp()
    save('state.json', state)
    return {'phase': state['phase'], 'route': result, 'protectedUnchanged': True, 'backup': str(BACKUP), 'at': stamp()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare', 'apply', 'verify', 'rollback'])
    parser.add_argument('--expected-nginx-sha256')
    args = parser.parse_args()
    with open('/var/lock/temichevvet-grooming-static-release.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(main(args.mode, args.expected_nginx_sha256), ensure_ascii=False))
