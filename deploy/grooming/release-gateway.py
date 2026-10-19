#!/usr/bin/env python3
"""Qualified gateway update; the public grooming link is enabled last."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, socket, subprocess, time, urllib.request, uuid

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['inspect', 'backup', 'build', 'apply', 'enable', 'rollback'])
parser.add_argument('--synthetic-qa-root')
args = parser.parse_args()
qa = bool(args.synthetic_qa_root)
ROOT = pathlib.Path(args.synthetic_qa_root) if qa else pathlib.Path('/opt/temichevvet-owner-gateway')
if qa and '/.artifacts/grooming-integration/' not in str(ROOT.resolve()): raise RuntimeError('QA must use the dedicated private fixture directory')
if not qa and socket.gethostname() != 'msk-1-vm-d817': raise RuntimeError('Wrong public gateway host')
STAGE = ROOT / 'releases/grooming-integration-20261019-r1'
BACKUP = ROOT / 'backups/grooming-integration-20261019-r1'
GATEWAY = 'crm-grooming-integration-qa-gateway-1' if qa else 'temichevvet-owner-gateway'
POSTGRES = 'crm-grooming-qa-20261019' if qa else 'temichevvet-owner-postgres'
PROTECTED = [POSTGRES] if qa else [POSTGRES, 'temichevvet-owner-backup']
PREVIOUS_ID = 'sha256:2bad6374d52318648bf786e7614bb75c5abcd91c42789ed67e920ef05e3373d5'
CANDIDATE = 'temichevvet-owner-gateway:grooming-integration-20261019-r1'
COMPOSE = ['docker', 'compose'] if qa else [str(ROOT / 'releases/crm-redesign-20261019-r3/compose-linux-amd64')]
PROJECT = 'crm-grooming-integration-qa' if qa else 'temichevvet-owner-gateway'
MIGRATIONS = ['20261019120000_grooming_intake', '20261019170000_grooming_portal']
def run(command, **kwargs):
    result = subprocess.run(command, text=True, capture_output=True, **kwargs)
    if result.returncode: raise RuntimeError('Command failed: ' + command[0] + ' ' + result.stderr[-1800:])
    return result.stdout
def inspect(name): return json.loads(run(['docker', 'inspect', name]))[0]
def environment(container): return dict(item.split('=', 1) for item in container['Config']['Env'])
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path, value):
    path.write_text(json.dumps(value, indent=2)); path.chmod(0o600)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def identities(): return [dict(name=name, id=inspect(name)['Id'], started=inspect(name)['State']['StartedAt']) for name in PROTECTED]
def protected(items):
    for item in items:
        current=inspect(item['name'])
        if current['Id'] != item['id'] or current['State']['StartedAt'] != item['started']: raise RuntimeError('Protected gateway service changed')
def compose(*arguments): return run(COMPOSE + ['--project-directory', str(ROOT), '--project-name', PROJECT, '--file', str(ROOT/'docker-compose.yml'), '--env-file', str(ROOT/'.env'), *arguments])
def put_env(values):
    text=(ROOT/'.env').read_text()
    for key, value in values.items():
        pattern=r'(?m)^'+re.escape(key)+r'=[^\r\n]*'
        if len(re.findall(pattern,text)) > 1: raise RuntimeError('Duplicate setting: '+key)
        text=re.sub(pattern,lambda m:key+'='+value,text) if re.search(pattern,text) else text.rstrip()+'\n'+key+'='+value+'\n'
    (ROOT/'.env').write_text(text); (ROOT/'.env').chmod(0o600)
def wait_healthy(image_id):
    url='http://127.0.0.1:4273/health' if qa else 'http://127.0.0.1:4100/health'
    for _ in range(40):
        try:
            if inspect(GATEWAY)['Image'] == image_id:
                with urllib.request.urlopen(url,timeout=3) as response:
                    if response.status == 200: return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('Gateway did not recover')
def runtime_preservation(candidate):
    source="const fs=require('fs'),p=require('path'),c=require('crypto'),out={};function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())walk(f);else if(e.isFile())out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}}walk('/app/apps/owner-gateway/dist');console.log(JSON.stringify(out));"
    get=lambda image:json.loads(run(['docker','run','--rm','--platform','linux/amd64','--network','none','--entrypoint','node',image,'-e',source]))
    old,new=get(PREVIOUS_ID),get(candidate)
    allowed=re.compile(r'/dist/(grooming/|generated/client/|app\.module\.js$|max-bot\.client\.js$|max-webhook\.service\.js$|owner-notification\.service\.js$|portal-page\.controller\.js$|portal\.service\.js$|dto/owner-notification\.dto\.js$|public/(app\.js$|index\.html$|grooming\.(html|css|js)$))')
    bad=[name for name in set(old)|set(new) if old.get(name)!=new.get(name) and not allowed.search(name)]
    if bad: raise RuntimeError('Unrelated gateway runtime files differ: '+str(bad))
    return dict(protectedFiles=sum(not allowed.search(name) for name in old),unexpectedChanges=[])

def migration_identity():
    env=environment(inspect(POSTGRES)); db='grooming_portal_rollout_qa' if qa else env['POSTGRES_DB']
    raw=run(['docker','exec',POSTGRES,'psql','-U',env['POSTGRES_USER'],'-d',db,'-tA','-c','SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;'])
    failed=run(['docker','exec',POSTGRES,'psql','-U',env['POSTGRES_USER'],'-d',db,'-tA','-c','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;']).strip()
    if failed != '0': raise RuntimeError('An existing failed gateway migration requires inspection')
    applied=dict(line.split('|') for line in raw.splitlines() if line)
    files={p.parent.name:digest(p) for p in (STAGE/'apps/owner-gateway/prisma/migrations').glob('*/migration.sql')}
    if any(name not in files or files[name] != checksum for name,checksum in applied.items()): raise RuntimeError('Existing gateway migration history differs')
    if set(files)-set(applied)-set(MIGRATIONS): raise RuntimeError('Unrelated pending gateway migrations')
    return env, db
def migrate(*arguments):
    env=environment(inspect(GATEWAY)); network=next(iter(inspect(GATEWAY)['NetworkSettings']['Networks']))
    secret_file=BACKUP/'migration.env'
    secret_file.write_text('OWNER_GATEWAY_DATABASE_URL='+env['OWNER_GATEWAY_DATABASE_URL']+'\n');secret_file.chmod(0o600)
    try: return run(['docker','run','--rm','--platform','linux/amd64','--network',network,'--env-file',str(secret_file),'--entrypoint','/app/node_modules/.bin/prisma',CANDIDATE,'migrate',*arguments,'--schema','/app/apps/owner-gateway/prisma/schema.prisma'])
    finally: secret_file.unlink(missing_ok=True)

if args.mode == 'inspect':
    app=inspect(GATEWAY)
    print(json.dumps(dict(host=socket.gethostname(),image=app['Config']['Image'],imageId=app['Image'],protected=identities())))
elif args.mode == 'build':
    if inspect(GATEWAY)['Image'] != PREVIOUS_ID: raise RuntimeError('Gateway base changed')
    source=json.loads((STAGE/'source.json').read_text())
    run(['docker','build','--platform','linux/amd64','--network','none','--pull=false','--build-arg','TEMICHEVVET_GIT_COMMIT='+source['revision'],'-f',str(STAGE/'Dockerfile.gateway'),'-t',CANDIDATE,str(STAGE)])
    image=inspect(CANDIDATE)
    if image['Architecture'] != 'amd64' or image['Config']['Labels']['org.opencontainers.image.revision'] != source['revision']: raise RuntimeError('Gateway image identity differs')
    save(STAGE/'gateway-build.json',dict(reference=CANDIDATE,id=image['Id'],revision=source['revision'],runtimePreservation=runtime_preservation(CANDIDATE)))
    print('BUILD_OK: current contact-gate runtime retained; independent grooming files added.')
elif args.mode == 'backup':
    if BACKUP.exists(): raise RuntimeError('Backup directory must be new')
    env,db=migration_identity(); before=identities(); BACKUP.mkdir(parents=True,mode=0o700)
    for name in ['.env','docker-compose.yml']: shutil.copy2(ROOT/name,BACKUP/('before-'+name));(BACKUP/('before-'+name)).chmod(0o600)
    temporary='grooming-owner-restore-'+uuid.uuid4().hex[:12];dump='/tmp/'+temporary+'.dump';started=False
    try:
        run(['docker','exec',POSTGRES,'pg_dump','-U',env['POSTGRES_USER'],'-d',db,'-Fc','--file',dump])
        run(['docker','cp',POSTGRES+':'+dump,str(BACKUP/'database.dump')])
        run(['docker','run','-d','--network','none','--pull','never','--name',temporary,'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',inspect(POSTGRES)['Image']]);started=True
        for _ in range(60):
            if subprocess.run(['docker','exec',temporary,'pg_isready','-U','restore_test','-d','restore_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode == 0: break
            time.sleep(.5)
        run(['docker','cp',str(BACKUP/'database.dump'),temporary+':/tmp/database.dump'])
        run(['docker','exec',temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump'])
        query='SELECT (SELECT count(*) FROM "OwnerSnapshot"),(SELECT count(*) FROM "MessengerBinding"),(SELECT count(*) FROM "PortalSession");'
        counts=lambda:run(['docker','exec',temporary,'psql','-U','restore_test','-d','restore_test','-tA','-c',query]).strip()
        initial=counts()
        for name in MIGRATIONS:
            run(['docker','cp',str(STAGE/'apps/owner-gateway/prisma/migrations'/name/'migration.sql'),temporary+':/tmp/grooming.sql'])
            run(['docker','exec',temporary,'psql','-U','restore_test','-d','restore_test','-v','ON_ERROR_STOP=1','-f','/tmp/grooming.sql'])
        if counts() != initial: raise RuntimeError('Existing owner records changed in rehearsal')
        protected(before)
        save(BACKUP/'verified-backup.json',dict(at=now(),verified=True,restoreTested=True,migrationsRehearsed=True,counts=initial,databaseSha256=digest(BACKUP/'database.dump'),envSha256=digest(ROOT/'.env'),composeSha256=digest(ROOT/'docker-compose.yml'),protected=before))
        print('BACKUP_OK: gateway copy restored without network; grooming migrations preserved owners/bindings/sessions.')
    finally:
        if started: run(['docker','rm','-f','-v',temporary])
        run(['docker','exec',POSTGRES,'rm','-f',dump])
else:
    state_path=BACKUP/'grooming-state.json'
    if args.mode == 'apply':
        proof=json.loads((BACKUP/'verified-backup.json').read_text()); candidate=json.loads((STAGE/'gateway-build.json').read_text())
        if inspect(GATEWAY)['Image'] != PREVIOUS_ID or state_path.exists(): raise RuntimeError('Gateway changed or release already started')
        if not all(proof[k] for k in ['verified','restoreTested','migrationsRehearsed']) or digest(BACKUP/'database.dump') != proof['databaseSha256'] or digest(ROOT/'.env') != proof['envSha256'] or digest(ROOT/'docker-compose.yml') != proof['composeSha256']: raise RuntimeError('Backup/configuration identity differs')
        protected(proof['protected']); migration_identity()
        previous=inspect(GATEWAY)['Config']['Image']; critical=environment(inspect(GATEWAY))
        text=(ROOT/'docker-compose.yml').read_text()
        if len(re.findall(r'(?m)^      MAX_BOT_NAME:',text)) != 1 or re.search(r'(?m)^      GROOMING_',text): raise RuntimeError('Unexpected gateway Compose layout')
        names=['GROOMING_CRM_SYNC_ENABLED','GROOMING_CLIENT_NOTIFICATIONS_ENABLED','GROOMING_NOTIFICATION_DAILY_LIMIT','GROOMING_SITE_ORIGINS','MAX_BOT_USERNAME']
        text=re.sub(r'(?m)^      MAX_BOT_NAME:', '\n'.join('      '+name+': ${'+name+'}' for name in names)+'\n      MAX_BOT_NAME:',text)
        state=dict(at=now(),phase='PREPARED',previous=previous,previousId=PREVIOUS_ID,candidate=CANDIDATE,candidateId=candidate['id'],protected=proof['protected'])
        save(state_path,state)
        try:
            migrate('deploy')
            put_env(dict(OWNER_GATEWAY_IMAGE=CANDIDATE,GROOMING_CRM_SYNC_ENABLED='false',GROOMING_CLIENT_NOTIFICATIONS_ENABLED='false',GROOMING_NOTIFICATION_DAILY_LIMIT='10',GROOMING_SITE_ORIGINS='https://pet.temichevvet.ru',MAX_BOT_USERNAME=('grooming-synthetic-qa-bot' if qa else 'id230210303969_2_bot')))
            (ROOT/'docker-compose.yml').write_text(text)
            config=json.loads(compose('config','--format','json'))['services']['gateway']
            for key in ['OWNER_GATEWAY_DATABASE_URL','OWNER_GATEWAY_SYNC_SECRET','MAX_BOT_TOKEN','MAX_WEBHOOK_SECRET','OWNER_GATEWAY_PUBLIC_URL']:
                if config['environment'].get(key,'') != critical.get(key,''): raise RuntimeError('Protected gateway setting changed: '+key)
            if config['image'] != CANDIDATE: raise RuntimeError('Wrong candidate image')
            compose('up','-d','--no-deps','--no-build','--pull','never','gateway');wait_healthy(candidate['id']);protected(state['protected'])
            state.update(phase='STAGED_DISABLED',envSha256=digest(ROOT/'.env'),composeSha256=digest(ROOT/'docker-compose.yml'));save(state_path,state)
            print('APPLY_OK: gateway healthy; grooming link/transport remain disabled until the main CRM is ready.')
        except Exception:
            try:
                env=environment(inspect(POSTGRES)); db='grooming_portal_rollout_qa' if qa else env['POSTGRES_DB']
                failed=run(['docker','exec',POSTGRES,'psql','-U',env['POSTGRES_USER'],'-d',db,'-tA','-c','SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;']).splitlines()
                for name in failed:
                    if name not in MIGRATIONS: raise RuntimeError('Unrelated failed gateway migration')
                    migrate('resolve','--rolled-back',name)
            finally:
                for name in ['.env','docker-compose.yml']: shutil.copy2(BACKUP/('before-'+name),ROOT/name)
            compose('up','-d','--no-deps','--no-build','--pull','never','gateway');wait_healthy(PREVIOUS_ID);protected(state['protected'])
            raise
    else:
        state=json.loads(state_path.read_text());protected(state['protected'])
        if inspect(GATEWAY)['Image'] != state['candidateId'] or digest(ROOT/'.env') != state['envSha256'] or digest(ROOT/'docker-compose.yml') != state['composeSha256']: raise RuntimeError('A later release/configuration must not be overwritten')
        if args.mode == 'enable':
            before=(ROOT/'.env').read_bytes()
            try:
                put_env(dict(GROOMING_CRM_SYNC_ENABLED='true',GROOMING_CLIENT_NOTIFICATIONS_ENABLED='true'))
                compose('up','-d','--no-deps','--no-build','--pull','never','gateway');wait_healthy(state['candidateId'])
            except Exception:
                (ROOT/'.env').write_bytes(before)
                compose('up','-d','--no-deps','--no-build','--pull','never','gateway');wait_healthy(state['candidateId'])
                raise
            state.update(phase='ENABLED',envSha256=digest(ROOT/'.env'));save(state_path,state)
            print('ENABLE_OK: client cabinet and current MAX transport are connected.')
        else:
            for name in ['.env','docker-compose.yml']: shutil.copy2(BACKUP/('before-'+name),ROOT/name)
            compose('up','-d','--no-deps','--no-build','--pull','never','gateway');wait_healthy(state['previousId'])
            state.update(phase='ROLLED_BACK');save(state_path,state)
            print('ROLLBACK_OK: previous gateway restored; current owner records and grooming tables preserved.')
        protected(state['protected'])
        save(BACKUP/(args.mode+'-receipt.json'),dict(at=now(),phase=state['phase'],image=inspect(GATEWAY)['Image'],protected=state['protected'],recordsRestored=False))
