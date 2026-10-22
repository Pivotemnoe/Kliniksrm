#!/usr/bin/env python3
"""Release only the reviewed closed-booking grooming HTML/JS over the pinned live image."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, socket, subprocess, time, urllib.request, uuid

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['inspect', 'build', 'backup', 'apply', 'rollback'])
mode = parser.parse_args().mode
STAGE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('/opt/temichevvet-owner-gateway')
M = json.loads((STAGE / 'release.json').read_text())
if socket.gethostname() != M['hostName']:
    raise RuntimeError('Wrong owner gateway host')
APP, PG, BACKUP_SERVICE = 'temichevvet-owner-gateway', 'temichevvet-owner-postgres', 'temichevvet-owner-backup'
B = ROOT / 'backups' / M['releaseId']
STATE = B / 'owner-static-state.json'
COMPOSE = [str(ROOT / 'releases/crm-redesign-20261019-r3/compose-linux-amd64'), '--project-directory', str(ROOT), '--project-name', 'temichevvet-owner-gateway', '--file', str(ROOT / 'docker-compose.yml'), '--env-file', str(ROOT / '.env')]

def run(command):
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(command[0] + ' failed: ' + (result.stderr or result.stdout)[-1600:])
    return result.stdout

def inspect(name): return json.loads(run(['docker', 'inspect', name]))[0]
def env(c): return dict(v.split('=', 1) for v in c['Config']['Env'])
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def digest(v): return hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(p, v):
    temp = p.with_name(p.name + '.tmp')
    temp.write_text(json.dumps(v, indent=2)); temp.chmod(0o600); temp.replace(p)
def protected():
    services=[dict(name=n, id=inspect(n)['Id'], image=inspect(n)['Image'], started=inspect(n)['State']['StartedAt']) for n in [PG, BACKUP_SERVICE]]
    static={}
    for name in ['grooming','pet-hotel']:
        root=pathlib.Path('/var/www/temichevvet-'+name+'/current').resolve()
        manifest={str(p.relative_to(root)):sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
        static[name]=dict(target=str(root),manifestHash=digest(manifest),files=len(manifest))
    nginx={str(p):sha(p) for p in pathlib.Path('/etc/nginx/sites-available').iterdir() if p.is_file()}
    return dict(services=services,static=static,nginx=nginx)
def protect(items):
    if protected() != items: raise RuntimeError('Protected services, static sites or nginx changed')
def compose(*args): return run(COMPOSE + list(args))
def config(): return json.loads(compose('config', '--format', 'json'))
def health():
    with urllib.request.urlopen('http://127.0.0.1:4100/health', timeout=5) as response:
        if response.status != 200: raise RuntimeError('Owner health is not 200')
def ready(image):
    for _ in range(60):
        try:
            if inspect(APP)['Image'] == image:
                health(); return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('Owner gateway did not recover')
def files(image):
    js = "const f=require('fs'),p=require('path'),c=require('crypto'),o={};function w(d){for(const e of f.readdirSync(d,{withFileTypes:true})){const n=p.join(d,e.name);if(e.isDirectory())w(n);else if(e.isFile())o[n]=c.createHash('sha256').update(f.readFileSync(n)).digest('hex')}}w('/app/apps/owner-gateway/dist');console.log(JSON.stringify(o))"
    return json.loads(run(['docker', 'run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--entrypoint', 'node', image, '-e', js]))
def runtime_hash(c):
    return digest(dict(environment=env(c), mounts=c['Mounts'], networks=sorted(c['NetworkSettings']['Networks'])))
def restore_config():
    for name in ['.env', 'docker-compose.yml']: shutil.copy2(B / ('before-' + name), ROOT / name)
def verify_config_hashes(state):
    if any(sha(ROOT / n) != v for n, v in state['configuration'].items()): raise RuntimeError('Configuration changed after this release')

if set(M.get('files',{}))!={'grooming.html','grooming.js'} or any(v['path']!='/app/apps/owner-gateway/dist/public/'+k for k,v in M['files'].items()):
    raise RuntimeError('Only the two grooming contact files are allowed')
os.umask(0o077)
if mode == 'inspect':
    c = inspect(APP)
    print(json.dumps(dict(host=socket.gethostname(), image=c['Image'], reference=c['Config']['Image'], protected=protected(), configuration={n:sha(ROOT/n) for n in ['.env','docker-compose.yml']})))
elif mode == 'build':
    if inspect(APP)['Image'] != M['previous']['id'] or inspect(M['previous']['reference'])['Id'] != M['previous']['id']: raise RuntimeError('Gateway baseline changed')
    protect(M['protectedBaseline'])
    if any(sha(ROOT/n)!=v for n,v in M['configuration'].items()): raise RuntimeError('Configuration baseline changed')
    for name,item in M['files'].items():
        if sha(STAGE/'candidate'/name)!=item['candidateHash'] or sha(STAGE/'rollback'/name)!=item['previousHash']: raise RuntimeError('Reviewed source differs')
    log = run(['docker', 'build', '--platform', 'linux/amd64', '--network', 'none', '--pull=false', '--build-arg', 'BASE_GATEWAY_IMAGE='+M['previous']['reference'], '--build-arg', 'RELEASE_REVISION='+M['revision'], '--build-arg', 'OWNER_HTML_SHA256='+M['files']['grooming.html']['candidateHash'], '--build-arg', 'OWNER_JS_SHA256='+M['files']['grooming.js']['candidateHash'], '-f', str(STAGE/'Dockerfile.gateway'), '-t', M['candidate']['reference'], str(STAGE)])
    (STAGE / 'build.log').write_text(log)
    c = inspect(M['candidate']['reference'])
    if c['Architecture'] != 'amd64' or c['Config']['Labels']['org.opencontainers.image.revision'] != M['revision']: raise RuntimeError('Candidate identity differs')
    old, new = files(M['previous']['id']), files(c['Id'])
    changed = sorted(k for k in set(old)|set(new) if old.get(k) != new.get(k))
    if changed != sorted(item['path'] for item in M['files'].values()): raise RuntimeError('Unexpected runtime file changes')
    for item in M['files'].values():
        if old[item['path']]!=item['previousHash'] or new[item['path']]!=item['candidateHash']: raise RuntimeError('Reviewed runtime hash differs')
    if inspect(M['previous']['id'])['Config']['Env'] != c['Config']['Env']: raise RuntimeError('Candidate environment differs')
    save(STAGE/'build.json', dict(at=now(), id=c['Id'], reference=M['candidate']['reference'], protectedFiles=len(old)-2, changedFiles=changed))
    print('BUILD_OK: exactly two reviewed public files changed')
elif mode == 'backup':
    if B.exists() or inspect(APP)['Image'] != M['previous']['id']: raise RuntimeError('Backup already exists or baseline changed')
    before = protected(); B.mkdir(mode=0o700, parents=True)
    for name in ['.env','docker-compose.yml']:
        shutil.copy2(ROOT/name, B/('before-'+name)); (B/('before-'+name)).chmod(0o600)
    for name in M['files']: shutil.copy2(STAGE/'rollback'/name,B/('before-'+name))
    pg = env(inspect(PG)); temporary = 'grooming-owner-contact-restore-'+uuid.uuid4().hex[:12]; dump='/tmp/'+temporary+'.dump'; started=False
    try:
        run(['docker','exec',PG,'pg_dump','-U',pg['POSTGRES_USER'],'-d',pg['POSTGRES_DB'],'-Fc','--file',dump])
        run(['docker','cp',PG+':'+dump,str(B/'database.dump')]); (B/'database.dump').chmod(0o600)
        run(['docker','run','-d','--network','none','--pull','never','--name',temporary,'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',inspect(PG)['Image']]); started=True
        for _ in range(60):
            if subprocess.run(['docker','exec',temporary,'pg_isready','-h','127.0.0.1','-U','restore_test','-d','restore_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0: break
            time.sleep(.5)
        run(['docker','cp',str(B/'database.dump'),temporary+':/tmp/database.dump'])
        run(['docker','exec',temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump'])
        health(); protect(before)
        save(B/'verified-backup.json',dict(at=now(),restoreTested=True,databaseSha256=sha(B/'database.dump'),configuration={n:sha(ROOT/n) for n in ['.env','docker-compose.yml']},protected=before,runtimeHash=runtime_hash(inspect(APP))))
        print('BACKUP_OK: current owner database restored in an isolated container')
    finally:
        if started: run(['docker','rm','-f','-v',temporary])
        run(['docker','exec',PG,'rm','-f',dump])
elif mode == 'apply':
    proof=json.loads((B/'verified-backup.json').read_text()); built=json.loads((STAGE/'build.json').read_text())
    if STATE.exists() or inspect(APP)['Image'] != M['previous']['id'] or inspect(M['candidate']['reference'])['Id'] != built['id']: raise RuntimeError('Gateway or candidate changed')
    if not proof['restoreTested'] or sha(B/'database.dump') != proof['databaseSha256'] or datetime.datetime.fromisoformat(proof['at']) < datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=2): raise RuntimeError('Backup differs or is stale')
    verify_config_hashes(proof); protect(proof['protected'])
    if runtime_hash(inspect(APP)) != proof['runtimeHash']: raise RuntimeError('Gateway runtime changed')
    before=config(); expected=json.loads(json.dumps(before))
    if expected['services']['gateway']['image'] != M['previous']['reference']: raise RuntimeError('Compose baseline differs')
    expected['services']['gateway']['image']=M['candidate']['reference']
    state=dict(at=now(),phase='PREPARED',previous=M['previous'],candidate=built,protected=proof['protected'],runtimeHash=proof['runtimeHash']); save(STATE,state)
    try:
        path=ROOT/'.env'; text=path.read_text(); pattern=r'(?m)^OWNER_GATEWAY_IMAGE=[^\r\n]*'
        if len(re.findall(pattern,text)) != 1: raise RuntimeError('Expected one gateway image pin')
        path.write_text(re.sub(pattern,lambda _:'OWNER_GATEWAY_IMAGE='+M['candidate']['reference'],text)); path.chmod(0o600)
        if config() != expected: raise RuntimeError('Unrelated Compose configuration changed')
        state['configuration']={n:sha(ROOT/n) for n in ['.env','docker-compose.yml']}; state['phase']='CONFIGURED'; save(STATE,state)
        compose('up','-d','--no-deps','--no-build','--pull','never','gateway'); ready(built['id']); protect(state['protected'])
        if runtime_hash(inspect(APP)) != state['runtimeHash']: raise RuntimeError('Gateway settings, mounts or networks changed')
        state['phase']='COMPLETE';state['at']=now();save(STATE,state)
        save(B/'deployment-receipt.json',dict(at=now(),revision=M['revision'],image=built['id'],changedFiles=sorted(item['path'] for item in M['files'].values()),protectedServicesPreserved=True,environmentPreserved=True,databaseMigrations=False,recordsRestored=False))
        print('APPLY_OK: closed grooming contact updated; backend, MAX and current data preserved')
    except Exception:
        restore_config(); compose('up','-d','--no-deps','--no-build','--pull','never','gateway'); ready(M['previous']['id']); protect(state['protected']);state['phase']='FAILED_ROLLED_BACK';save(STATE,state);raise
else:
    state=json.loads(STATE.read_text()); protect(state['protected']); verify_config_hashes(state)
    if state['phase'] != 'COMPLETE' or inspect(APP)['Image'] != state['candidate']['id'] or runtime_hash(inspect(APP)) != state['runtimeHash']: raise RuntimeError('Rollback refuses a later release or changed runtime')
    restore_config();compose('up','-d','--no-deps','--no-build','--pull','never','gateway');ready(state['previous']['id']);protect(state['protected'])
    if runtime_hash(inspect(APP)) != state['runtimeHash']: raise RuntimeError('Rollback runtime differs')
    state['phase']='ROLLED_BACK';state['at']=now();save(STATE,state)
    print('ROLLBACK_OK: previous owner UI restored; current records and sessions retained')
