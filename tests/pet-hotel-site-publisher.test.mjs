import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const publisher = fileURLToPath(new URL('../deploy/pet-hotel-site/publish.py', import.meta.url));
const fixture = String.raw`
import datetime as dt, hashlib, importlib.util, io, json, os, pathlib, tarfile, tempfile
spec = importlib.util.spec_from_file_location('hotel_publisher', os.environ['PUBLISHER_PATH'])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
temp = tempfile.TemporaryDirectory(prefix='hotel-publisher-qa-')
root = pathlib.Path(temp.name)
p = mod.Paths(root)
for directory in [p.releases, p.backups, p.conf.parent, p.enabled]:
    directory.mkdir(parents=True, exist_ok=True)
grooming = p.grooming / 'releases' / 'grooming-preserved'
grooming.mkdir(parents=True)
(grooming / 'index.html').write_text('<html>Accepted grooming prices and process</html>')
(grooming / 'release.json').write_text('{"releaseId":"grooming-preserved"}\n')
(grooming / 'asset.js').write_text('preserveEveryByte=true;')
(p.grooming / 'current').symlink_to('releases/grooming-preserved')
original_conf = '''server {
    listen 80;
    server_name pet.temichevvet.ru;
    location / { return 301 https://pet.temichevvet.ru$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name pet.temichevvet.ru;
    root /var/www/temichevvet-grooming/current;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'" always;
    location = /v1/public/grooming/catalog { proxy_pass http://127.0.0.1:4100; }
    location ^~ /v1/ { return 404; }
    location ^~ /internal/ { return 404; }
    location / { try_files $uri $uri/ /index.html; }
}
'''
p.conf.write_text(original_conf)
p.conf.chmod(0o640)
(p.enabled / mod.DOMAIN).symlink_to(p.conf)
other = p.conf.parent / 'unrelated.example'
other.write_text('server { listen 443 ssl; server_name unrelated.example; }\n')
(p.enabled / 'unrelated.example').symlink_to(other)
(p.nginx / 'nginx.conf').write_text('events {}\nhttp {\n    include ' + str(p.enabled) + '/*;\n}\n')
release = 'pet-hotel-site-qa-20261020'
revision = 'a' * 40
gateway_revision = 'b' * 40
now = dt.datetime(2026, 10, 20, 19, 0, tzinfo=dt.timezone.utc)
calls = []
fail_reload = [False]
fail_nginx = [False]
bad_public = [False]
catalog = dict(connected=True, enabled=True, fresh=True, selfBookingEnabled=True,
               testMode=False, capturedAt=now.isoformat(), portalUrl=mod.PORTAL,
               rooms=[dict(id='room-1', name='Номер 1', species='CAT', isActive=True, dailyRate='700.00')])
def fake_run(arguments):
    calls.append(arguments)
    if arguments[:2] == ['docker', 'ps']:
        return 'temichevvet-owner-gateway|abc|hotel-candidate\nprotected-database|def|postgres\n'
    if arguments[:2] == ['docker', 'inspect']:
        return ('sha256:' + 'c' * 64 + '\n') if arguments[3] == 'container' else gateway_revision + '\n'
    if arguments[:2] == ['nginx', '-t']:
        if fail_nginx[0] and len(arguments) == 2:
            fail_nginx[0] = False
            raise RuntimeError('simulated nginx syntax failure')
        if '-c' in arguments:
            check = pathlib.Path(arguments[arguments.index('-c') + 1])
            assert 'include ' + str(p.enabled) + '/*;' not in check.read_text()
            enabled = check.parent / 'enabled'
            assert (enabled / mod.DOMAIN).resolve().name == 'candidate-nginx.conf'
            assert (enabled / 'unrelated.example').resolve() == other.resolve()
        return ''
    if arguments == ['systemctl', 'reload', 'nginx']:
        if fail_reload[0]:
            fail_reload[0] = False
            raise RuntimeError('simulated reload failure')
        return ''
    raise AssertionError('Unexpected command: ' + repr(arguments))
def fake_fetch(url):
    if url.endswith('/v1/public/pet-hotel/catalog'):
        return 200, json.dumps(catalog).encode()
    if url in [mod.PORTAL, 'http://127.0.0.1:4100/portal/pet-hotel']:
        return 200, b'<main id="hotel-owner-app">Real portal</main>'
    if url.startswith(mod.SITE + '/pet-hotel/'):
        name = url[len(mod.SITE + '/pet-hotel/'):]
        active = p.current / 'pet-hotel' / name
        if not active.is_file():
            return 404, b'not found'
        return 200, b'corrupted' if bad_public[0] else active.read_bytes()
    if url in [mod.SITE + '/index.html', mod.SITE + '/release.json']:
        return 200, (p.grooming / 'current' / url.rsplit('/', 1)[1]).read_bytes()
    return 404, b'not found'
pub = mod.Publisher(p, fake_run, fake_fetch, clock=lambda: now)
files = {'index.html': b'<html>Real hotel</html>', 'app.js': b'app=true;', 'booking.js': b'booking=true;',
         'style.css': b'body{}', 'assets/real-photo.jpg': b'unchanged-photo-bytes'}
metadata = dict(releaseId=release, revision=revision, builtAt=now.isoformat(), sourceDirty=False,
                fixturesIncluded=False, gatewayContract=1, site=mod.SITE + '/pet-hotel/', ownerPortal=mod.PORTAL,
                files={name: hashlib.sha256(body).hexdigest() for name, body in files.items()})
archive = root / 'release.tar'
def make_archive(extra=None, change=None, include_extra=True):
    content = dict(files)
    content['release.json'] = json.dumps(change or metadata).encode()
    with tarfile.open(archive, 'w') as package:
        for name, body in content.items():
            entry = tarfile.TarInfo('pet-hotel/' + name)
            entry.size = len(body)
            package.addfile(entry, io.BytesIO(body))
        if extra is not None:
            package.addfile(extra, io.BytesIO(b'x') if extra.isfile() else None)
make_archive()
def prepare():
    return pub.prepare(release, archive, mod.digest(archive), mod.digest(p.conf))
def expect_error(callback, message):
    try:
        callback()
        raise AssertionError('Expected error: ' + message)
    except RuntimeError as error:
        assert message in str(error), str(error)
`;

function python(code) {
  const result = spawnSync('python3', ['-c', fixture + '\n' + code], {
    env: {...process.env, PUBLISHER_PATH: publisher, PYTHONDONTWRITEBYTECODE: '1'}, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}

test('prepare is inactive; activation publishes only hotel subtree and rollback restores exact grooming/config', () => {
  python(String.raw`
before_grooming = pub.grooming()
before_other = pub.other_vhosts()
prepared = prepare()
assert prepared['status'] == 'PREPARED'
assert not p.current.exists()
assert p.conf.read_text() == original_conf
assert not any(args[0] in ['systemctl', 'docker'] for args in calls)
candidate = (p.backups / release / 'candidate-nginx.conf').read_text()
assert 'location = /pet-hotel { return 308 /pet-hotel/; }' in candidate
assert 'location ^~ /pet-hotel/' in candidate
assert candidate.count('location = /v1/public/pet-hotel/') == 3
assert 'limit_except POST' in candidate
assert candidate.replace(candidate[candidate.index(mod.BEGIN):candidate.index(mod.END) + len(mod.END)], '') == original_conf
receipt = pub.activate(release, gateway_revision)
assert receipt['status'] == 'PUBLISHED'
assert os.readlink(p.current) == str(p.releases / release)
assert (p.releases / release / 'pet-hotel/assets/real-photo.jpg').read_bytes() == files['assets/real-photo.jpg']
assert pub.grooming() == before_grooming
assert pub.other_vhosts() == before_other
assert p.conf.stat().st_mode & 0o777 == 0o640
rolled_back = pub.rollback(release)
assert rolled_back['status'] == 'ROLLED_BACK'
assert p.conf.read_text() == original_conf
assert not p.current.exists() and not p.current.is_symlink()
assert pub.grooming() == before_grooming
assert pub.other_vhosts() == before_other
assert all(args[0] != 'docker' or args[1] in ['ps', 'inspect'] for args in calls)
`);
});

test('artifact extraction rejects traversal, links, duplicates, extra files, dirty builds and altered hashes', () => {
  const cases = [
    String.raw`entry = tarfile.TarInfo('../escape'); entry.size = 1; make_archive(entry); message='Unsafe archive entry'`,
    String.raw`entry = tarfile.TarInfo('pet-hotel/link'); entry.type=tarfile.SYMTYPE; entry.linkname='/etc/passwd'; make_archive(entry); message='Unsafe archive entry'`,
    String.raw`entry = tarfile.TarInfo('pet-hotel/hard'); entry.type=tarfile.LNKTYPE; entry.linkname='pet-hotel/index.html'; make_archive(entry); message='Unsafe archive entry'`,
    String.raw`entry = tarfile.TarInfo('pet-hotel/index.html'); entry.size=1; make_archive(entry); message='duplicate archive entry'`,
    String.raw`entry = tarfile.TarInfo('pet-hotel/private.env'); entry.size=1; make_archive(entry); message='Package files differ'`,
    String.raw`metadata['sourceDirty']=True; make_archive(change=metadata); message='Invalid production release metadata'`,
    String.raw`metadata['fixturesIncluded']=True; make_archive(change=metadata); message='Invalid production release metadata'`,
    String.raw`metadata['files']['app.js']='0'*64; make_archive(change=metadata); message='Package files differ'`,
  ];
  for (const setup of cases) {
    python(setup + String.raw`
expect_error(prepare, message)
assert not p.current.exists()
assert p.conf.read_text() == original_conf
assert not (root.parent / 'escape').exists()
assert not any(args[0] == 'systemctl' for args in calls)
`);
  }
});

test('activation gates require current production gateway, fresh real room catalog and actual owner portal', () => {
  const cases = [
    [`catalog['testMode']=True`, 'Production hotel booking is not ready'],
    [`catalog['selfBookingEnabled']=False`, 'Production hotel booking is not ready'],
    [`catalog['connected']=False`, 'Production hotel booking is not ready'],
    [`catalog['capturedAt']=(now - dt.timedelta(seconds=91)).isoformat()`, 'Hotel snapshot is stale'],
    [`catalog['rooms']=[]`, 'Production hotel rooms are missing'],
    [`catalog['portalUrl']='https://different.example/portal'`, 'Production owner portal URL differs'],
    [`gateway_revision='d'*40`, 'Production gateway revision differs'],
    [`pub.fetch=lambda url: (200,b'<main>Wrong portal</main>') if url==mod.PORTAL else fake_fetch(url)`, 'Public owner hotel portal is unavailable'],
  ];
  for (const [change, message] of cases) {
    python(String.raw`
prepare()
` + change + String.raw`
expect_error(lambda: pub.activate(release, 'b'*40), '${message}')
assert p.conf.read_text() == original_conf
assert not p.current.exists()
assert not any(args[0] == 'systemctl' for args in calls)
`);
  }
});

test('concurrent vhost, grooming and pointer changes are detected before cutover', () => {
  const cases = [
    [String.raw`p.conf.write_text(original_conf + '# unrelated concurrent update\n')`, 'Nginx predecessor changed'],
    [`(grooming / 'asset.js').write_text('new grooming revision')`, 'Grooming static content changed'],
    [`other.write_text('server { listen 443; }')`, 'Unrelated enabled vhost changed'],
    [`prior = p.releases / 'other-release'; prior.mkdir(); p.current.symlink_to(prior)`, 'Hotel pointer changed'],
    [`(p.releases / release / 'pet-hotel/app.js').write_text('edited')`, 'Package files differ from manifest'],
  ];
  for (const [change, message] of cases) {
    python(String.raw`
prepare()
` + change + String.raw`
expect_error(lambda: pub.activate(release, gateway_revision), '${message}')
assert not any(args[0] == 'systemctl' for args in calls)
`);
  }
});

test('syntax, reload and public-content failures restore the predecessor and retain failure receipts', () => {
  const cases = [
    [`fail_nginx[0]=True`, 'simulated nginx syntax failure'],
    [`fail_reload[0]=True`, 'simulated reload failure'],
    [`bad_public[0]=True`, 'Public hotel file differs'],
  ];
  for (const [change, message] of cases) {
    python(String.raw`
before_grooming=pub.grooming()
prepare()
` + change + String.raw`
expect_error(lambda: pub.activate(release, gateway_revision), '${message}')
assert p.conf.read_text() == original_conf
assert not p.current.exists() and not p.current.is_symlink()
assert pub.grooming() == before_grooming
failure=json.loads((p.backups / release / 'failure.json').read_text())
assert failure['restoredPrevious'] is True
assert not (p.backups / release / 'published.json').exists()
assert (p.releases / release).is_dir()
`);
  }
});

test('asynchronous Nginx reload may serve old bytes briefly but must converge to every exact new file', () => {
  python(String.raw`
prepare()
old_counts = {'release.json': 2, 'app.js': 1}
def draining_fetch(url):
    name=url.rsplit('/', 1)[-1]
    if url.startswith(mod.SITE + '/pet-hotel/') and old_counts.get(name, 0):
        old_counts[name] -= 1
        return 200, b'previous nginx worker response'
    return fake_fetch(url)
pub.fetch=draining_fetch
receipt=pub.activate(release,gateway_revision)
assert receipt['status'] == 'PUBLISHED'
assert all(count == 0 for count in old_counts.values())
assert not (p.backups / release / 'failure.json').exists()
`);
});

test('rollback refuses to replace a later release or overwrite any concurrent Nginx edit', () => {
  for (const change of [
    String.raw`newer=p.releases/'later-release'; newer.mkdir(); pub.switch(str(newer)); wanted='later hotel release'`,
    String.raw`p.conf.write_text(p.conf.read_text()+'# later manual change\n'); wanted='concurrent Nginx edit'`,
  ]) {
    python(String.raw`
prepare()
pub.activate(release, gateway_revision)
` + change + String.raw`
current_before=pub.pointer()
conf_before=p.conf.read_bytes()
expect_error(lambda: pub.rollback(release), wanted)
assert pub.pointer() == current_before
assert p.conf.read_bytes() == conf_before
`);
  }
});

test('candidate edits are confined to one managed TLS block and require existing API denial boundaries', () => {
  python(String.raw`
candidate=mod.candidate_config(original_conf,p.current)
assert mod.candidate_config(candidate,p.current) == candidate
assert original_conf.split('server {')[1] == candidate.split('server {')[1]
expect_error(lambda: mod.candidate_config(original_conf.replace('location ^~ /internal/ { return 404; }',''),p.current), 'Internal API deny boundary')
expect_error(lambda: mod.candidate_config(original_conf.replace('location ^~ /v1/ { return 404; }',''),p.current), 'Public API deny boundary')
expect_error(lambda: mod.candidate_config(original_conf + '\n# manual /pet-hotel route\n',p.current), 'Unmanaged hotel')
expect_error(lambda: mod.candidate_config(original_conf.replace('listen 443 ssl http2;', 'listen 444 ssl;'),p.current), 'one existing HTTPS')
`);
});

test('a later hotel release restores the preceding relative symlink and its exact managed vhost', () => {
  python(String.raw`
prior=p.releases/'pet-hotel-site-prior'
(prior/'pet-hotel').mkdir(parents=True)
(prior/'pet-hotel/index.html').write_text('Previous hotel release')
p.current.symlink_to('releases/pet-hotel-site-prior')
original_conf=mod.candidate_config(original_conf,p.current)
p.conf.write_text(original_conf)
prepared=prepare()
assert prepared['before']['previousCurrent'] == 'releases/pet-hotel-site-prior'
pub.activate(release,gateway_revision)
assert os.readlink(p.current) == str(p.releases/release)
pub.rollback(release)
assert os.readlink(p.current) == 'releases/pet-hotel-site-prior'
assert (p.current/'pet-hotel/index.html').read_text() == 'Previous hotel release'
assert p.conf.read_text() == original_conf
`);
});
