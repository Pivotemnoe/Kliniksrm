#!/usr/bin/env python3
"""Four-file, no-migration update of the existing approved Avito AI transport."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, socket, subprocess, tarfile, time, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['prepare', 'apply', 'verify', 'rollback'])
parser.add_argument('--plan', required=True)
args = parser.parse_args()
plan = json.loads(pathlib.Path(args.plan).read_text())
root = pathlib.Path(plan['root'])
if socket.gethostname() != plan['host'] or not re.fullmatch(r'avito-natural-reply-[a-z0-9-]{5,60}', plan['release']):
    raise RuntimeError('Wrong host or release')
stage = root / 'releases' / plan['release']
backup = root / 'backups' / plan['release']
state_file = backup / 'prepared.json'
allowed = {'avito-assistant.controller.js', 'avito-assistant.model.js', 'avito-assistant.service.js', 'avito-reply.contract.js'}
gateway = 'temichevvet-owner-gateway'

def run(command, **kwargs):
    result = subprocess.run(command, capture_output=True, **kwargs)
    if result.returncode:
        # Docker/configuration/provider output may contain credentials. Keep it private.
        if backup.exists():
            private = backup / 'last-command-private.log'
            private.write_bytes(result.stdout + b'\n' + result.stderr)
            private.chmod(0o600)
        raise RuntimeError('Command failed; inspect the private release log')
    return result.stdout.decode() if kwargs.get('text') else result.stdout

def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def atomic(path, data):
    temporary = path.with_suffix(path.suffix + '.new')
    with temporary.open('wb') as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)

def save(path, value):
    atomic(path, json.dumps(value, ensure_ascii=False, indent=2).encode())

def at():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def identity(name):
    i = inspect(name)
    return dict(name=name, id=i['Id'], image=i['Image'], started=i['State']['StartedAt'])

def check_protected():
    if [identity(x['name']) for x in plan['protected']] != plan['protected']:
        raise RuntimeError('Protected service changed')

inventory_js = "const fs=require('fs'),p=require('path'),c=require('crypto');function inv(r,k=''){return fs.readdirSync(r,{withFileTypes:true}).flatMap(f=>f.isDirectory()?inv(p.join(r,f.name),k+f.name+'/'):f.isFile()?[{name:k+f.name,sha256:c.createHash('sha256').update(fs.readFileSync(p.join(r,f.name))).digest('hex')}]:[])}console.log(JSON.stringify(inv('/app/apps/owner-gateway/dist')));"

def inventory(image=None):
    command = ['docker', 'run', '--rm', '--network', 'none', '--pull', 'never', '--entrypoint', 'node', image, '-e', inventory_js] if image else ['docker', 'exec', gateway, 'node', '-e', inventory_js]
    return json.loads(run(command))

def file_map(rows):
    return {x['name']: x['sha256'] for x in rows}

def compose():
    return [str(root / 'releases/crm-redesign-20261019-r3/compose-linux-amd64'), '--project-directory', str(root), '--project-name', 'temichevvet-owner-gateway', '--file', str(root / 'docker-compose.yml'), '--env-file', str(root / '.env')]

def health(image):
    for _ in range(40):
        try:
            if inspect(gateway)['Image'] == image:
                with urllib.request.urlopen('http://127.0.0.1:4100/health', timeout=2) as r:
                    if r.status == 200:
                        return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('Gateway health did not recover')

def check_scope(state):
    check_protected()
    current = inspect(gateway)
    if current['Image'] not in [state['baseImage'], state['candidateImage']] or current['Mounts']:
        raise RuntimeError('Unqualified running image or bindings')
    if sha(root / 'docker-compose.yml') != plan['composeSha256'] or sha(root / '.env') not in [state['beforeEnvSha256'], state['afterEnvSha256']]:
        raise RuntimeError('Configuration changed outside the image pin')
    original = json.loads((backup / 'container-private.json').read_text())
    for key in ['Env', 'Entrypoint', 'Cmd', 'User', 'WorkingDir']:
        observed, expected = current['Config'].get(key), original['Config'].get(key)
        if (sorted(observed) if key == 'Env' else observed) != (sorted(expected) if key == 'Env' else expected):
            raise RuntimeError('Runtime credentials or startup changed')

def verify(state):
    check_scope(state)
    health(state['candidateImage'])
    if file_map(inventory()) != state['candidateFiles']:
        raise RuntimeError('Running compiled inventory differs')
    save(backup / 'transition.json', dict(phase='APPLIED_VERIFIED', at=at()))
    print(json.dumps(dict(status='APPLIED_VERIFIED', at=at(), source=plan['sourceCommit'], image=state['candidateImage'], compiledFiles=len(state['candidateFiles']), changedFiles=4, schemaAndCredentialsPreserved=True, protectedServicesPreserved=True)))

if args.mode == 'prepare':
    if state_file.exists() or backup.exists() or stage.exists():
        raise RuntimeError('Release directories must be fresh')
    check_protected()
    before = inspect(gateway)
    if before['Image'] != plan['baseImage'] or before['Mounts'] or inspect(plan['baseReference'])['Id'] != plan['baseImage']:
        raise RuntimeError('Gateway base changed')
    if sha(root / '.env') != plan['envSha256'] or sha(root / 'docker-compose.yml') != plan['composeSha256'] or sha(pathlib.Path(plan['archive'])) != plan['archiveSha256']:
        raise RuntimeError('Base configuration or packet differs')
    backup.mkdir(mode=0o700, parents=True)
    stage.mkdir(mode=0o700, parents=True)
    with tarfile.open(plan['archive']) as archive:
        if any(not m.isfile() and not m.isdir() or m.name.startswith('/') or '..' in pathlib.PurePosixPath(m.name).parts for m in archive.getmembers()):
            raise RuntimeError('Unsafe packet')
        archive.extractall(stage, filter='data')
    manifest = json.loads((stage / 'manifest.json').read_text())
    if manifest['sourceCommit'] != plan['sourceCommit'] or {x['name'] for x in manifest['files']} != allowed or len(manifest['files']) != 4:
        raise RuntimeError('Wrong source or artifact scope')
    original = file_map(inventory())
    if original != file_map(inventory(plan['baseImage'])):
        raise RuntimeError('Rollback image does not reproduce running code')
    for entry in manifest['files']:
        if original.get(entry['name'], 'NEW') != entry['beforeSha256'] or sha(stage / 'runtime' / entry['name']) != entry['sha256']:
            raise RuntimeError('Source baseline or artifact differs')
    for name in ['.env', 'docker-compose.yml']:
        shutil.copy2(root / name, backup / name)
        (backup / name).chmod(0o600)
    save(backup / 'container-private.json', before)
    # A code-only update does not run migrations, startup seeders or restoration.
    pg = inspect('temichevvet-owner-postgres')
    env = dict(item.split('=', 1) for item in pg['Config']['Env'])
    dump = run(['docker', 'exec', pg['Id'], 'pg_dump', '-U', env['POSTGRES_USER'], '-d', env['POSTGRES_DB'], '-Fc'])
    atomic(backup / 'database.dump', dump)
    run(['docker', 'exec', '-i', pg['Id'], 'pg_restore', '--list'], input=dump)
    run(['docker', 'build', '--network', 'none', '--pull=false', '--build-arg', 'BASE_GATEWAY=' + plan['baseReference'], '-t', plan['candidateReference'], str(stage)])
    candidate = inspect(plan['candidateReference'])['Id']
    expected = dict(original)
    for entry in manifest['files']:
        expected[entry['name']] = entry['sha256']
    if file_map(inventory(candidate)) != expected:
        raise RuntimeError('Candidate changed unreviewed runtime')
    smoke = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--pull', 'never', '--entrypoint', 'node', candidate, '-e', (stage / 'offline-smoke.cjs').read_text()]))
    if smoke.get('status') != 'PASS':
        raise RuntimeError('Offline smoke failed')
    old_env = (backup / '.env').read_bytes()
    decoded = old_env.decode()
    if len(re.findall(r'(?m)^OWNER_GATEWAY_IMAGE=[^\r\n]*', decoded)) != 1:
        raise RuntimeError('Missing or duplicate image pin')
    new_env = re.sub(r'(?m)^OWNER_GATEWAY_IMAGE=[^\r\n]*', 'OWNER_GATEWAY_IMAGE=' + plan['candidateReference'], decoded).encode()
    state = dict(baseImage=plan['baseImage'], candidateImage=candidate, candidateFiles=expected, source=plan['sourceCommit'], beforeEnvSha256=hashlib.sha256(old_env).hexdigest(), afterEnvSha256=hashlib.sha256(new_env).hexdigest(), databaseDumpSha256=sha(backup / 'database.dump'))
    atomic(backup / 'candidate.env', new_env)
    save(state_file, state)
    save(backup / 'transition.json', dict(phase='PREPARED', at=at()))
    check_scope(state)
    print(json.dumps(dict(status='PREPARED', at=at(), image=candidate, compiledFiles=len(expected), changedFiles=4, runtimeSwitched=False)))
else:
    state = json.loads(state_file.read_text())
    if state['baseImage'] != plan['baseImage'] or state['source'] != plan['sourceCommit']:
        raise RuntimeError('Foreign prepared state')
    check_scope(state)
    if args.mode == 'verify':
        verify(state)
    elif args.mode == 'apply':
        if inspect(gateway)['Image'] != state['baseImage'] or sha(root / '.env') != state['beforeEnvSha256']:
            raise RuntimeError('Apply requires the prepared base; use verify after an ambiguous result')
        save(backup / 'transition.json', dict(phase='APPLY_INTENT', at=at()))
        atomic(root / '.env', (backup / 'candidate.env').read_bytes())
        try:
            run(compose() + ['up', '-d', '--no-deps', 'gateway'])
            verify(state)
        except Exception:
            # Exact before/after guards prevent a rollback over unrelated work.
            check_scope(state)
            atomic(root / '.env', (backup / '.env').read_bytes())
            run(compose() + ['up', '-d', '--no-deps', 'gateway'])
            health(state['baseImage'])
            save(backup / 'transition.json', dict(phase='ROLLED_BACK', at=at()))
            raise
    else:
        atomic(root / '.env', (backup / '.env').read_bytes())
        run(compose() + ['up', '-d', '--no-deps', 'gateway'])
        health(state['baseImage'])
        check_protected()
        save(backup / 'transition.json', dict(phase='ROLLED_BACK', at=at()))
        print(json.dumps(dict(status='ROLLED_BACK', at=at(), image=state['baseImage'])))
