#!/usr/bin/env python3
"""Publish the hotel subtree without rebuilding or restarting any application."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import stat
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import quote

DOMAIN = 'pet.temichevvet.ru'
SITE = 'https://' + DOMAIN
PORTAL = 'https://cabinet.temichevvet.ru/portal/pet-hotel'
HOST = 'msk-1-vm-d817'
BEGIN = '    # BEGIN MANAGED PET HOTEL STATIC\n'
END = '    # END MANAGED PET HOTEL STATIC\n'
SHA = re.compile(r'[a-f0-9]{64}')
REVISION = re.compile(r'[a-f0-9]{40}')
RELEASE = re.compile(r'pet-hotel-site-[a-z0-9][a-z0-9-]{0,85}')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def run(arguments):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=35)
    require(result.returncode == 0, 'Command failed: ' + arguments[0] + ': ' + result.stderr[-1600:])
    return result.stdout


def save(path, value):
    temporary = path.with_name('.' + path.name + '.tmp')
    with temporary.open('x', encoding='utf-8') as target:
        json.dump(value, target, ensure_ascii=False, indent=2)
        target.write('\n')
    temporary.chmod(0o600)
    os.replace(temporary, path)


def regular(path):
    return path.is_file() and not path.is_symlink()


def safe_name(name):
    parts = PurePosixPath(name).parts
    return (bool(parts) and not name.startswith('/') and '\\' not in name
            and all(part not in ('.', '..') and not part.startswith('.') for part in parts)
            and str(PurePosixPath(name)) == name.rstrip('/'))


class Paths:
    """The CLI always uses production paths. A temporary root is only an import-time test seam."""
    def __init__(self, test_root=None):
        self.test_root = Path(test_root) if test_root is not None else None
        def local(name):
            return self.test_root / name.lstrip('/') if self.test_root else Path(name)
        self.root = local('/var/www/temichevvet-pet-hotel')
        self.releases = self.root / 'releases'
        self.current = self.root / 'current'
        self.backups = local('/var/backups/temichevvet-pet-hotel')
        self.grooming = local('/var/www/temichevvet-grooming')
        self.nginx = local('/etc/nginx')
        self.conf = self.nginx / 'sites-available' / DOMAIN
        self.enabled = self.nginx / 'sites-enabled'


def braces(text):
    """Brace pairs ignoring quoted strings and comments, so CSP values are untouched."""
    pairs, stack, quoted, escaped, comment = {}, [], None, False, False
    for index, char in enumerate(text):
        if comment:
            if char == '\n':
                comment = False
            continue
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quoted:
            if char == quoted:
                quoted = None
            continue
        if char in ('"', "'"):
            quoted = char
        elif char == '#':
            comment = True
        elif char == '{':
            stack.append(index)
        elif char == '}':
            require(bool(stack), 'Unbalanced Nginx configuration')
            pairs[stack.pop()] = index
    require(not stack and not quoted, 'Unbalanced Nginx configuration')
    return pairs


def candidate_config(text, hotel_current):
    require(text.count(BEGIN) == text.count(END) and text.count(BEGIN) <= 1,
            'Unknown hotel Nginx marker layout')
    if BEGIN in text:
        start, end = text.index(BEGIN), text.index(END) + len(END)
        require(start < end, 'Reversed hotel Nginx markers')
        text = text[:start] + text[end:]
    require('/pet-hotel' not in text, 'Unmanaged hotel Nginx routes already exist')
    pairs, candidates = braces(text), []
    for match in re.finditer(r'(?m)^\s*server\s*\{', text):
        opening = text.index('{', match.start(), match.end())
        require(opening in pairs, 'Invalid Nginx server block')
        closing = pairs[opening]
        block = text[opening:closing]
        if (re.search(r'(?m)^\s*listen\s+(?:\[::\]:)?443\s+[^;]*\bssl\b', block)
                and re.search(r'(?m)^\s*server_name\s+' + re.escape(DOMAIN) + r'\s*;', block)):
            candidates.append(closing)
    require(len(candidates) == 1, 'Expected one existing HTTPS pet vhost')
    closing = candidates[0]
    require(re.search(r'location\s+\^~\s+/v1/\s*\{\s*return\s+404\s*;\s*\}', text),
            'Public API deny boundary is missing')
    require(re.search(r'location\s+\^~\s+/internal/\s*\{\s*return\s+404\s*;\s*\}', text),
            'Internal API deny boundary is missing')
    lines = [BEGIN.rstrip('\n'),
             '    location = /pet-hotel { return 308 /pet-hotel/; }',
             '    location ^~ /pet-hotel/ {',
             '        root ' + str(hotel_current) + ';',
             '        expires -1;',
             '        try_files $uri $uri/ =404;',
             '    }']
    for endpoint, method in [('catalog', 'GET'), ('availability', 'GET'), ('drafts', 'POST')]:
        lines.extend(['    location = /v1/public/pet-hotel/' + endpoint + ' {',
                      '        limit_except ' + method + ' { deny all; }',
                      '        proxy_pass http://127.0.0.1:4100;',
                      '        include /etc/nginx/proxy_params;',
                      '        proxy_connect_timeout 5s;',
                      '        proxy_read_timeout 25s;', '    }'])
    lines.append(END.rstrip('\n'))
    return text[:closing] + '\n'.join(lines) + '\n' + text[closing:]


class Publisher:
    def __init__(self, paths=None, runner=run, fetch=None, clock=utcnow):
        self.p = paths or Paths()
        self.run, self.clock = runner, clock
        self.fetch = fetch or self.http_get

    def http_get(self, url):
        with tempfile.NamedTemporaryFile(prefix='pet-hotel-http-') as body:
            arguments = ['curl', '--silent', '--show-error', '--max-time', '20', '--noproxy', '*',
                         '--output', body.name, '--write-out', '%{http_code}']
            if url.startswith(SITE + '/'):
                arguments.extend(['--resolve', DOMAIN + ':443:127.0.0.1'])
            elif url.startswith('https://cabinet.temichevvet.ru/'):
                arguments.extend(['--resolve', 'cabinet.temichevvet.ru:443:127.0.0.1'])
            status = self.run(arguments + [url]).strip()
            require(status.isdigit(), 'Invalid HTTP response status')
            require(Path(body.name).stat().st_size <= 32 * 1024 * 1024, 'Unexpected HTTP body size')
            return int(status), Path(body.name).read_bytes()

    def get(self, url):
        status, body = self.fetch(url)
        require(status == 200, 'HTTP check failed (' + str(status) + '): ' + url)
        return body

    def containers(self):
        return sorted(self.run(['docker', 'ps', '--format', '{{.Names}}|{{.ID}}|{{.Image}}']).splitlines())

    def pointer(self):
        current = self.p.current
        if not current.exists() and not current.is_symlink():
            return None
        require(current.is_symlink(), 'Hotel current must be a symlink')
        target = current.resolve(strict=True)
        require(target.parent == self.p.releases.resolve() and target.is_dir(), 'Unexpected hotel pointer target')
        return os.readlink(current)

    def grooming(self):
        current = self.p.grooming / 'current'
        require(current.is_symlink(), 'Existing grooming current symlink is required')
        root = current.resolve(strict=True)
        require(root.parent == (self.p.grooming / 'releases').resolve(), 'Unexpected grooming pointer')
        files = {}
        for path in sorted(root.rglob('*')):
            require(not path.is_symlink(), 'Unexpected symlink within grooming release')
            if path.is_file():
                files[str(path.relative_to(root))] = digest(path)
        require('index.html' in files and 'release.json' in files, 'Existing grooming release is incomplete')
        return {'link': os.readlink(current), 'resolved': str(root), 'files': files}

    def other_vhosts(self):
        result = {}
        require((self.p.enabled / DOMAIN).is_symlink()
                and (self.p.enabled / DOMAIN).resolve(strict=True) == self.p.conf.resolve(strict=True),
                'Expected enabled pet vhost symlink')
        for item in sorted(self.p.enabled.iterdir()):
            if item.name == DOMAIN:
                continue
            require(item.is_file(), 'Unexpected enabled Nginx entry')
            result[item.name] = {'link': os.readlink(item) if item.is_symlink() else None, 'sha256': digest(item)}
        return result

    def gateway(self, expected_revision):
        require(REVISION.fullmatch(expected_revision or ''), 'Expected full gateway source revision')
        image = self.run(['docker', 'inspect', '--type', 'container', '--format', '{{.Image}}',
                          'temichevvet-owner-gateway']).strip()
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', image), 'Invalid running gateway image identity')
        actual = self.run(['docker', 'inspect', '--type', 'image', '--format',
                           '{{index .Config.Labels "org.opencontainers.image.revision"}}', image]).strip()
        require(actual == expected_revision, 'Production gateway revision differs')
        catalog = json.loads(self.get('http://127.0.0.1:4100/v1/public/pet-hotel/catalog'))
        self.ready_catalog(catalog)
        require(b'id="hotel-owner-app"' in self.get('http://127.0.0.1:4100/portal/pet-hotel'),
                'Gateway hotel portal is unavailable')
        require(b'id="hotel-owner-app"' in self.get(PORTAL), 'Public owner hotel portal is unavailable')
        return {'imageId': image, 'revision': actual, 'capturedAt': catalog['capturedAt'], 'rooms': len(catalog['rooms'])}

    def ready_catalog(self, catalog):
        require(isinstance(catalog, dict), 'Invalid hotel catalog')
        require(all(catalog.get(key) is True for key in ['connected', 'enabled', 'fresh', 'selfBookingEnabled'])
                and catalog.get('testMode') is False, 'Production hotel booking is not ready')
        try:
            captured = dt.datetime.fromisoformat(catalog['capturedAt'].replace('Z', '+00:00'))
            require(captured.utcoffset() is not None, 'Snapshot timestamp needs a timezone')
            require(abs((self.clock() - captured).total_seconds()) < 90, 'Hotel snapshot is stale')
        except (KeyError, TypeError, ValueError) as error:
            raise RuntimeError('Invalid hotel snapshot timestamp') from error
        rooms = catalog.get('rooms')
        require(isinstance(rooms, list) and 0 < len(rooms) <= 1000, 'Production hotel rooms are missing')
        require(all(isinstance(room, dict) and isinstance(room.get('id'), str) and room['id']
                    and room.get('species') in ['CAT', 'DOG'] and room.get('isActive') is True
                    and isinstance(room.get('name'), str) and room['name']
                    and re.fullmatch(r'\d+(?:\.\d{1,2})?', str(room.get('dailyRate', '')))
                    for room in rooms), 'Invalid production hotel room data')
        require(len(set(room['id'] for room in rooms)) == len(rooms), 'Duplicate production hotel rooms')
        require(catalog.get('portalUrl') == PORTAL, 'Production owner portal URL differs')

    def manifest(self, build, release):
        root = build / 'pet-hotel'
        require(regular(root / 'release.json'), 'Missing release manifest')
        metadata = json.loads((root / 'release.json').read_text())
        require(metadata.get('releaseId') == release and metadata.get('site') == SITE + '/pet-hotel/'
                and metadata.get('ownerPortal') == PORTAL and metadata.get('sourceDirty') is False
                and metadata.get('fixturesIncluded') is False and metadata.get('gatewayContract') == 1
                and REVISION.fullmatch(metadata.get('revision', '')), 'Invalid production release metadata')
        files = metadata.get('files')
        require(isinstance(files, dict) and 0 < len(files) <= 500
                and all(isinstance(name, str) and safe_name(name) and not name.endswith('/')
                        and name != 'release.json' and isinstance(value, str) and SHA.fullmatch(value)
                        for name, value in files.items()), 'Invalid release manifest entries')
        actual = {}
        for path in build.rglob('*'):
            require(not path.is_symlink() and (path.is_file() or path.is_dir()), 'Unexpected staged entry')
            require(path == root or root in path.parents, 'Package must contain only pet-hotel/')
            if path.is_file() and path != root / 'release.json':
                actual[str(path.relative_to(root))] = digest(path)
        require(actual == files and all(name in files for name in ['index.html', 'app.js', 'booking.js', 'style.css']),
                'Package files differ from manifest')
        return metadata

    def extract(self, archive, stage):
        with tarfile.open(archive) as package:
            members = package.getmembers()
            require(0 < len(members) <= 600 and sum(item.size for item in members) <= 128 * 1024 * 1024,
                    'Unexpected package size')
            seen = set()
            for item in members:
                require(safe_name(item.name) and (item.isdir() or item.isfile()), 'Unsafe archive entry: ' + item.name)
                name = PurePosixPath(item.name)
                require(name.parts[0] == 'pet-hotel' and str(name) not in seen, 'Unexpected or duplicate archive entry')
                seen.add(str(name))
                target = stage.joinpath(*name.parts)
                if item.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.extractfile(item) as source, target.open('xb') as destination:
                        shutil.copyfileobj(source, destination)
        for path in stage.rglob('*'):
            path.chmod(0o755 if path.is_dir() else 0o644)
        stage.chmod(0o755)

    def test_nginx(self, candidate):
        # Test the complete current Nginx configuration, replacing only this enabled vhost.
        global_conf = (self.p.nginx / 'nginx.conf').read_text()
        pattern = r'(?m)^\s*include\s+' + re.escape(str(self.p.enabled)) + r'/\*\s*;'
        require(len(re.findall(pattern, global_conf)) == 1, 'Expected one global sites-enabled include')
        with tempfile.TemporaryDirectory(prefix='.pet-hotel-check-', dir=self.p.nginx) as temporary:
            temp = Path(temporary)
            (temp / 'enabled').mkdir()
            for source in self.p.enabled.iterdir():
                target = candidate if source.name == DOMAIN else source.resolve(strict=True)
                (temp / 'enabled' / source.name).symlink_to(target)
            transformed = re.sub(pattern, lambda _: '    include ' + str(temp / 'enabled' / '*') + ';', global_conf)
            (temp / 'nginx.conf').write_text(transformed)
            self.run(['nginx', '-t', '-p', str(self.p.nginx) + '/', '-c', str(temp / 'nginx.conf')])

    def prepare(self, release, archive, expected_sha, expected_nginx_sha):
        require(RELEASE.fullmatch(release or ''), 'Invalid hotel release identifier')
        require(SHA.fullmatch(expected_sha or '') and SHA.fullmatch(expected_nginx_sha or ''), 'Expected SHA-256 digests')
        require(archive.is_absolute() and regular(archive) and digest(archive) == expected_sha, 'Archive digest differs')
        require(regular(self.p.conf) and digest(self.p.conf) == expected_nginx_sha, 'Nginx predecessor changed')
        build, backup = self.p.releases / release, self.p.backups / release
        require(not build.exists() and not build.is_symlink() and not backup.exists() and not backup.is_symlink(),
                'Immutable release or receipt already exists')
        before = {'nginxSha256': digest(self.p.conf), 'nginxMode': stat.S_IMODE(self.p.conf.stat().st_mode),
                  'previousCurrent': self.pointer(), 'grooming': self.grooming(), 'otherVhosts': self.other_vhosts()}
        backup.mkdir(parents=True, mode=0o700)
        backup.chmod(0o700)
        shutil.copy2(self.p.conf, backup / 'before-nginx.conf')
        (backup / 'before-nginx.conf').chmod(0o600)
        save(backup / 'before.json', before)
        stage = Path(tempfile.mkdtemp(prefix='.' + release + '-', dir=self.p.releases))
        try:
            self.extract(archive, stage)
            metadata = self.manifest(stage, release)
            stage.rename(build)
            candidate = backup / 'candidate-nginx.conf'
            candidate.write_text(candidate_config(self.p.conf.read_text(), self.p.current))
            candidate.chmod(0o600)
            self.test_nginx(candidate)
            self.unchanged(before)
            prepared = {'status': 'PREPARED', 'at': self.clock().isoformat(), 'releaseId': release,
                        'archiveSha256': expected_sha, 'manifestSha256': digest(build / 'pet-hotel/release.json'),
                        'candidateNginxSha256': digest(candidate), 'revision': metadata['revision'], 'before': before}
            save(backup / 'prepared.json', prepared)
            return prepared
        except Exception as error:
            save(backup / 'failure.json', {'phase': 'prepare', 'error': str(error)})
            raise
        finally:
            if stage.exists():
                shutil.rmtree(stage)

    def unchanged(self, before):
        require(digest(self.p.conf) == before['nginxSha256'], 'Nginx predecessor changed')
        require(self.pointer() == before['previousCurrent'], 'Hotel pointer changed')
        require(self.grooming() == before['grooming'], 'Grooming static content changed')
        require(self.other_vhosts() == before['otherVhosts'], 'Unrelated enabled vhost changed')

    def replace_conf(self, source, mode):
        temporary = self.p.conf.with_name('.' + DOMAIN + '.hotel.tmp')
        require(not temporary.exists() and not temporary.is_symlink(), 'Unexpected temporary vhost file')
        try:
            with temporary.open('xb') as target:
                target.write(source.read_bytes())
            temporary.chmod(mode)
            os.chown(temporary, self.p.conf.stat().st_uid, self.p.conf.stat().st_gid)
            os.replace(temporary, self.p.conf)
        finally:
            temporary.unlink(missing_ok=True)

    def switch(self, target):
        temporary = self.p.root / '.current-hotel.tmp'
        require(not temporary.exists() and not temporary.is_symlink(), 'Unexpected temporary hotel pointer')
        try:
            if target is None:
                self.p.current.unlink(missing_ok=True)
            else:
                temporary.symlink_to(target)
                os.replace(temporary, self.p.current)
        finally:
            temporary.unlink(missing_ok=True)

    def verify_grooming(self, before):
        require(self.grooming() == before['grooming'], 'Grooming static content changed')
        for name in ['index.html', 'release.json']:
            body = self.get(SITE + '/' + name)
            require(hashlib.sha256(body).hexdigest() == before['grooming']['files'][name],
                    'Public grooming file differs: ' + name)

    def verify_public(self, release, before):
        root = self.p.releases / release / 'pet-hotel'
        metadata = self.manifest(root.parent, release)
        for name in ['release.json', *metadata['files']]:
            # Nginx reload is asynchronous: its previous workers may serve an
            # immediate request. Require the exact new bytes within a bounded
            # readiness window; persistent mismatches still trigger rollback.
            deadline, expected = time.monotonic() + 5, digest(root / name)
            while True:
                body = self.get(SITE + '/pet-hotel/' + quote(name, safe='/'))
                if hashlib.sha256(body).hexdigest() == expected:
                    break
                require(time.monotonic() < deadline, 'Public hotel file differs: ' + name)
                time.sleep(0.2)
        self.ready_catalog(json.loads(self.get(SITE + '/v1/public/pet-hotel/catalog')))
        for path in ['/internal/v1/pet-hotel/portal/operations', '/v1/portal/pet-hotel/session',
                     '/v1/public/pet-hotel/unknown', '/pet-hotel/missing-release-check']:
            require(self.fetch(SITE + path)[0] == 404, 'Public route boundary differs: ' + path)
        self.verify_grooming(before)

    def activate(self, release, expected_revision):
        require(RELEASE.fullmatch(release or ''), 'Invalid hotel release identifier')
        build, backup = self.p.releases / release, self.p.backups / release
        prepared = json.loads((backup / 'prepared.json').read_text())
        before = prepared['before']
        require(prepared['releaseId'] == release and not (backup / 'activation.json').exists(), 'Release activation already started')
        require(digest(build / 'pet-hotel/release.json') == prepared['manifestSha256'], 'Staged manifest changed')
        self.manifest(build, release)
        candidate = backup / 'candidate-nginx.conf'
        require(digest(candidate) == prepared['candidateNginxSha256'], 'Candidate vhost changed')
        self.unchanged(before)
        identities = self.containers()
        gateway = self.gateway(expected_revision)
        self.test_nginx(candidate)
        self.unchanged(before)
        require(self.containers() == identities, 'Application containers changed before activation')
        save(backup / 'activation.json', {'at': self.clock().isoformat(), 'status': 'ACTIVATING',
                                         'gateway': gateway, 'containers': identities})
        try:
            self.switch(str(build))
            self.replace_conf(candidate, before['nginxMode'])
            self.run(['nginx', '-t'])
            self.run(['systemctl', 'reload', 'nginx'])
            self.verify_public(release, before)
            require(self.other_vhosts() == before['otherVhosts'], 'Unrelated vhost changed during activation')
            require(self.containers() == identities, 'Application containers changed during static activation')
            require(digest(self.p.conf) == prepared['candidateNginxSha256'] and self.pointer() == str(build),
                    'Activated hotel identity changed')
            receipt = {'status': 'PUBLISHED', 'at': self.clock().isoformat(), 'releaseId': release,
                       'revision': prepared['revision'], 'gateway': gateway, 'backup': str(backup),
                       'groomingUnchanged': True, 'containersUnchanged': True}
            save(backup / 'published.json', receipt)
            return receipt
        except Exception as error:
            try:
                self.restore(release, prepared)
                save(backup / 'failure.json', {'phase': 'activate', 'error': str(error), 'restoredPrevious': True})
            except Exception as recovery:
                save(backup / 'failure.json', {'phase': 'activate', 'error': str(error),
                                               'restoredPrevious': False, 'recoveryError': str(recovery)})
                raise RuntimeError(str(error) + '; rollback failed: ' + str(recovery)) from error
            raise

    def update_static(self, release, expected_revision):
        """Update an existing routed hotel by switching only its static symlink."""
        require(RELEASE.fullmatch(release or ''), 'Invalid hotel release identifier')
        build, backup = self.p.releases / release, self.p.backups / release
        prepared = json.loads((backup / 'prepared.json').read_text())
        before = prepared['before']
        require(prepared['releaseId'] == release and not (backup / 'activation.json').exists(), 'Release activation already started')
        require(before['previousCurrent'] is not None and BEGIN in self.p.conf.read_text(), 'Static update requires an existing hotel route')
        require(digest(build / 'pet-hotel/release.json') == prepared['manifestSha256'], 'Staged manifest changed')
        self.manifest(build, release)
        self.unchanged(before)
        identities = self.containers()
        gateway = self.gateway(expected_revision)
        self.unchanged(before)
        require(self.containers() == identities, 'Application containers changed before activation')
        save(backup / 'activation.json', {'at': self.clock().isoformat(), 'status': 'ACTIVATING',
                                         'kind': 'STATIC_ONLY', 'gateway': gateway, 'containers': identities})
        try:
            self.switch(str(build))
            self.verify_public(release, before)
            require(digest(self.p.conf) == before['nginxSha256'] and self.other_vhosts() == before['otherVhosts'], 'Nginx changed during static update')
            require(self.containers() == identities, 'Application containers changed during static update')
            require(self.pointer() == str(build), 'Activated hotel identity changed')
            receipt = {'status': 'PUBLISHED', 'at': self.clock().isoformat(), 'releaseId': release,
                       'revision': prepared['revision'], 'gateway': gateway, 'backup': str(backup),
                       'kind': 'STATIC_ONLY', 'nginxUnchanged': True, 'groomingUnchanged': True, 'containersUnchanged': True}
            save(backup / 'published.json', receipt)
            return receipt
        except Exception as error:
            self.restore_static(release, prepared)
            save(backup / 'failure.json', {'phase': 'update-static', 'error': str(error), 'restoredPrevious': True})
            raise

    def restore_static(self, release, prepared):
        before = prepared['before']
        require(self.pointer() in [before['previousCurrent'], str(self.p.releases / release)], 'Refusing to replace a later hotel release')
        require(digest(self.p.conf) == before['nginxSha256'] and self.other_vhosts() == before['otherVhosts'], 'Refusing rollback after Nginx drift')
        require(self.grooming() == before['grooming'], 'Protected grooming site changed')
        self.switch(before['previousCurrent'])
        self.unchanged(before)
        self.verify_grooming(before)

    def restore(self, release, prepared):
        before, backup = prepared['before'], self.p.backups / release
        current = self.pointer()
        require(current in [before['previousCurrent'], str(self.p.releases / release)], 'Refusing to replace a later hotel release')
        require(digest(self.p.conf) in [before['nginxSha256'], prepared['candidateNginxSha256']],
                'Refusing to overwrite a concurrent Nginx edit')
        require(digest(backup / 'before-nginx.conf') == before['nginxSha256'], 'Nginx backup changed')
        require(self.other_vhosts() == before['otherVhosts'] and self.grooming() == before['grooming'],
                'Protected host state changed; inspect before rollback')
        self.replace_conf(backup / 'before-nginx.conf', before['nginxMode'])
        self.switch(before['previousCurrent'])
        self.run(['nginx', '-t'])
        self.run(['systemctl', 'reload', 'nginx'])
        self.unchanged(before)
        self.verify_grooming(before)

    def rollback(self, release):
        require(RELEASE.fullmatch(release or ''), 'Invalid hotel release identifier')
        backup = self.p.backups / release
        require((backup / 'activation.json').exists(), 'Release activation has not started')
        prepared = json.loads((backup / 'prepared.json').read_text())
        identities = self.containers()
        activation = json.loads((backup / 'activation.json').read_text())
        if activation.get('kind') == 'STATIC_ONLY':
            self.restore_static(release, prepared)
        else:
            self.restore(release, prepared)
        require(self.containers() == identities, 'Application containers changed during static rollback')
        receipt = {'status': 'ROLLED_BACK', 'at': self.clock().isoformat(), 'releaseId': release,
                   'previousCurrent': prepared['before']['previousCurrent'], 'groomingUnchanged': True,
                   'containersUnchanged': True}
        save(backup / 'rollback.json', receipt)
        return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'activate', 'update-static', 'rollback'])
    parser.add_argument('--release', required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--sha256')
    parser.add_argument('--expected-nginx-sha256')
    parser.add_argument('--gateway-revision')
    args = parser.parse_args()
    require(socket.gethostname() == HOST and os.geteuid() == 0, 'Wrong public website host or account')
    require(RELEASE.fullmatch(args.release or ''), 'Invalid hotel release identifier')
    publisher = Publisher()
    publisher.p.releases.mkdir(parents=True, exist_ok=True)
    publisher.p.backups.mkdir(parents=True, exist_ok=True, mode=0o700)
    publisher.p.backups.chmod(0o700)
    with contextlib.ExitStack() as stack:
        for path in [publisher.p.root / '.static-update.lock', publisher.p.grooming / '.static-update.lock']:
            lock = stack.enter_context(path.open('a'))
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.mode == 'prepare':
            require(args.archive is not None, 'Prepare requires --archive')
            result = publisher.prepare(args.release, args.archive, args.sha256, args.expected_nginx_sha256)
        elif args.mode == 'activate':
            result = publisher.activate(args.release, args.gateway_revision)
        elif args.mode == 'update-static':
            result = publisher.update_static(args.release, args.gateway_revision)
        else:
            result = publisher.rollback(args.release)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
