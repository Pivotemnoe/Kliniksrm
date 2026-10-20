#!/usr/bin/env python3
"""Update only the integrated pet-hotel backend on the existing owner gateway."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, socket, subprocess, time, urllib.request, uuid

parser=argparse.ArgumentParser()
parser.add_argument('mode',choices=['inspect','build','backup','apply','rollback'])
args=parser.parse_args()
ROOT=pathlib.Path('/opt/temichevvet-owner-gateway')
STAGE=pathlib.Path(__file__).resolve().parent
manifest=json.loads((STAGE/'release.json').read_text())
if socket.gethostname()!=manifest['gateway']['hostName']: raise RuntimeError('Wrong owner gateway host')
BACKUP=ROOT/'backups'/manifest['releaseId']
APP='temichevvet-owner-gateway';PG='temichevvet-owner-postgres'
previous=manifest['gateway']['previous'];candidate=manifest['gateway']['candidate']
COMPOSE=[str(ROOT/'releases/crm-redesign-20261019-r3/compose-linux-amd64')]

def run(command,**kwargs):
    result=subprocess.run(command,text=True,capture_output=True,**kwargs)
    if result.returncode: raise RuntimeError(command[0]+' failed: '+(result.stderr or result.stdout)[-1600:])
    return result.stdout
def inspect(name): return json.loads(run(['docker','inspect',name]))[0]
def env(container): return dict(v.split('=',1) for v in container['Config']['Env'])
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,data): path.write_text(json.dumps(data,indent=2));path.chmod(0o600)
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def identities():
    result=[]
    for name in [PG,'temichevvet-owner-backup']:
        c=inspect(name);result.append(dict(name=name,id=c['Id'],image=c['Image'],started=c['State']['StartedAt']))
    return result
def protect(items):
    for item in items:
        c=inspect(item['name'])
        if any(c[key]!=item[field] for key,field in [('Id','id'),('Image','image')]) or c['State']['StartedAt']!=item['started']: raise RuntimeError('Protected owner service changed: '+item['name'])
def compose(*arguments): return run(COMPOSE+['--project-directory',str(ROOT),'--project-name','temichevvet-owner-gateway','--file',str(ROOT/'docker-compose.yml'),'--env-file',str(ROOT/'.env'),*arguments])
def ready(image):
    for _ in range(45):
        try:
            if inspect(APP)['Image']==image:
                with urllib.request.urlopen('http://127.0.0.1:4100/health',timeout=3) as response:
                    if response.status==200:return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('Owner gateway did not recover')
def migrations():
    pgenv=env(inspect(PG));database=pgenv['POSTGRES_DB'];user=pgenv['POSTGRES_USER']
    query='SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;'
    rows=run(['docker','exec',PG,'psql','-U',user,'-d',database,'-tA','-c',query])
    failed=run(['docker','exec',PG,'psql','-U',user,'-d',database,'-tA','-c','SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;']).strip()
    if failed!='0':raise RuntimeError('Existing gateway migration failure requires inspection')
    applied=dict(line.split('|') for line in rows.splitlines() if line)
    files={p.parent.name:sha(p) for p in (STAGE/'gateway/prisma/migrations').glob('*/migration.sql')}
    if any(files.get(name)!=checksum for name,checksum in applied.items()):raise RuntimeError('Applied gateway migration checksum differs')
    pending=sorted(set(files)-set(applied))
    if pending!=manifest['gateway']['pendingMigrations']:raise RuntimeError('Unexpected pending gateway migrations')
    return pgenv,database
def preserve_runtime(image):
    source="const fs=require('fs'),p=require('path'),c=require('crypto'),out={};function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())walk(f);else if(e.isFile())out[f]=c.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}}walk('/app/apps/owner-gateway/dist');console.log(JSON.stringify(out));"
    get=lambda value:json.loads(run(['docker','run','--rm','--network','none','--entrypoint','node',value,'-e',source]))
    old,new=get(previous['id']),get(image)
    public_files=manifest['gateway']['publicFiles']
    if not set(public_files)<=set(['pet-hotel.html','pet-hotel.js','pet-hotel.css','index.html','app.js']):raise RuntimeError('Unexpected public overlay')
    allowed=re.compile(r'/dist/(pet-hotel/|generated/client/|(?:app\.module|max-webhook\.service|max-bot\.client|owner-notification\.service|portal\.service|dto/owner-notification\.dto)\.(?:js|js\.map|d\.ts)$)|/public/(?:'+ '|'.join(re.escape(n) for n in public_files)+r')$')
    changed=[name for name in set(old)|set(new) if old.get(name)!=new.get(name) and not allowed.search(name)]
    if changed:raise RuntimeError('Unrelated owner runtime changed: '+str(changed))
    return dict(protectedFiles=sum(not allowed.search(name) for name in old),unexpectedChanges=[])
def migration_deploy():
    secret=BACKUP/'migration.env';live=inspect(APP);network=next(iter(live['NetworkSettings']['Networks']))
    secret.write_text('OWNER_GATEWAY_DATABASE_URL='+env(live)['OWNER_GATEWAY_DATABASE_URL']+'\n');secret.chmod(0o600)
    try:run(['docker','run','--rm','--network',network,'--env-file',str(secret),'--entrypoint','/app/node_modules/.bin/prisma',candidate['reference'],'migrate','deploy','--schema','/app/apps/owner-gateway/prisma/schema.prisma'])
    finally:secret.unlink(missing_ok=True)
HOTEL_ENV={'PET_HOTEL_CRM_SYNC_ENABLED':'true','PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED':'true','PET_HOTEL_NOTIFICATION_DAILY_LIMIT':'10','PET_HOTEL_SITE_ORIGINS':'https://pet.temichevvet.ru'}
def put_hotel_configuration():
    path=ROOT/'.env';text=path.read_text()
    for key,value in {'OWNER_GATEWAY_IMAGE':candidate['reference'],**HOTEL_ENV}.items():
        pattern=r'(?m)^'+re.escape(key)+r'=[^\r\n]*';count=len(re.findall(pattern,text))
        if count>1 or (key=='OWNER_GATEWAY_IMAGE' and count!=1):raise RuntimeError('Duplicate or missing image/environment pin: '+key)
        text=re.sub(pattern,lambda _:key+'='+value,text) if count else text.rstrip()+'\n'+key+'='+value+'\n'
    path.write_text(text);path.chmod(0o600)
    path=ROOT/'docker-compose.yml';text=path.read_text()
    matches=list(re.finditer(r'(?ms)^  gateway:\r?\n.*?(?=^  [A-Za-z0-9_-]+:|^networks:|^volumes:|\Z)',text))
    if len(matches)!=1:raise RuntimeError('Expected one gateway service block')
    match=matches[0];block=match.group()
    if any(re.search(r'(?m)^      '+key+':',block) for key in HOTEL_ENV):raise RuntimeError('Hotel Compose setting already present; inspect first')
    if len(re.findall(r'(?m)^    environment:[ \t]*\r?$',block))!=1:raise RuntimeError('Expected gateway mapping environment')
    lines='\n'.join('      '+key+': ${'+key+':-'+('false' if key.endswith('_ENABLED') else '10' if key.endswith('_LIMIT') else 'https://pet.temichevvet.ru')+'}' for key in HOTEL_ENV)
    block=re.sub(r'(?m)^    environment:[ \t]*\r?$',lambda _:'    environment:\n'+lines,block)
    path.write_text(text[:match.start()]+block+text[match.end():])
def assert_environment(before,after):
    for key,value in before.items():
        if key in HOTEL_ENV or key=='TEMICHEVVET_GIT_COMMIT':continue
        if after.get(key)!=value:raise RuntimeError('Protected gateway setting changed: '+key)
    if any(after.get(key)!=value for key,value in HOTEL_ENV.items()):raise RuntimeError('Hotel setting did not reach gateway')
    if set(after)-set(before)-set(HOTEL_ENV)-{'TEMICHEVVET_GIT_COMMIT'}:raise RuntimeError('Unexpected gateway setting added')
def restore_config():
    for name in ['.env','docker-compose.yml']:shutil.copy2(BACKUP/('before-'+name),ROOT/name)

if args.mode=='inspect':
    print(json.dumps(dict(host=socket.gethostname(),reference=inspect(APP)['Config']['Image'],image=inspect(APP)['Image'],protected=identities())))
elif args.mode=='build':
    if inspect(APP)['Image']!=previous['id']:raise RuntimeError('Gateway baseline changed')
    log=run(['docker','build','--platform','linux/amd64','--network','none','--pull=false','--build-arg','BASE_GATEWAY_IMAGE='+previous['reference'],'--build-arg','RELEASE_REVISION='+manifest['revision'],'-f',str(STAGE/'Dockerfile.gateway'),'-t',candidate['reference'],str(STAGE)])
    (STAGE/'gateway-build.log').write_text(log)
    image=inspect(candidate['reference'])
    if image['Architecture']!='amd64' or image['Config']['Labels']['org.opencontainers.image.revision']!=manifest['revision']:raise RuntimeError('Gateway candidate identity differs')
    save(STAGE/'gateway-build.json',dict(id=image['Id'],reference=candidate['reference'],runtimePreservation=preserve_runtime(image['Id'])))
    print('BUILD_OK: unrelated gateway runtime and public pages preserved')
elif args.mode=='backup':
    if BACKUP.exists():raise RuntimeError('Backup path must be new')
    pgenv,database=migrations();before=identities();BACKUP.mkdir(parents=True,mode=0o700)
    for name in ['.env','docker-compose.yml']:shutil.copy2(ROOT/name,BACKUP/('before-'+name));(BACKUP/('before-'+name)).chmod(0o600)
    temporary='pet-hotel-integrated-restore-'+uuid.uuid4().hex[:12];dump='/tmp/'+temporary+'.dump';started=False;qa_name=None
    try:
        run(['docker','exec',PG,'pg_dump','-U',pgenv['POSTGRES_USER'],'-d',database,'-Fc','--file',dump]);run(['docker','cp',PG+':'+dump,str(BACKUP/'database.dump')]);(BACKUP/'database.dump').chmod(0o600)
        run(['docker','run','-d','--network','none','--pull','never','--name',temporary,'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',inspect(PG)['Image']]);started=True
        for _ in range(60):
            if subprocess.run(['docker','exec',temporary,'pg_isready','-h','127.0.0.1','-U','restore_test','-d','restore_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
            time.sleep(.5)
        run(['docker','cp',str(BACKUP/'database.dump'),temporary+':/tmp/database.dump']);run(['docker','exec',temporary,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump'])
        query='SELECT (SELECT count(*) FROM "OwnerSnapshot"),(SELECT count(*) FROM "MessengerBinding"),(SELECT count(*) FROM "PortalSession");'
        counts=lambda:run(['docker','exec',temporary,'psql','-U','restore_test','-d','restore_test','-tA','-c',query]).strip()
        initial=counts()
        for name in manifest['gateway']['pendingMigrations']:
            run(['docker','cp',str(STAGE/'gateway/prisma/migrations'/name/'migration.sql'),temporary+':/tmp/pet-hotel-integrated.sql']);run(['docker','exec',temporary,'psql','-U','restore_test','-d','restore_test','-v','ON_ERROR_STOP=1','-f','/tmp/pet-hotel-integrated.sql'])
        if counts()!=initial:raise RuntimeError('Existing owner rows changed in migration rehearsal')
        qa_name='pet-hotel-integrated-owner-qa-'+uuid.uuid4().hex[:12]
        run(['docker','create','--name',qa_name,'--network','container:'+temporary,'-e','OWNER_GATEWAY_DATABASE_URL=postgresql://restore_test:isolated-restore-only@127.0.0.1:5432/restore_test','-e','NODE_ENV=test','--entrypoint','node',candidate['reference'],'/tmp/qualify.cjs']);run(['docker','cp',str(STAGE/'qualify-gateway.cjs'),qa_name+':/tmp/qualify.cjs']);qualified=run(['docker','start','-a',qa_name])
        if inspect(qa_name)['State']['ExitCode']!=0:raise RuntimeError('Restored gateway qualification failed')
        (BACKUP/'candidate-qualification.json').write_text(qualified);protect(before)
        save(BACKUP/'verified-backup.json',dict(at=now(),verified=True,restoreTested=True,migrationsRehearsed=True,candidateQualified=True,counts=initial,databaseSha256=sha(BACKUP/'database.dump'),envSha256=sha(ROOT/'.env'),composeSha256=sha(ROOT/'docker-compose.yml'),protected=before))
        print('BACKUP_OK: owner database restored without network; migrations and candidate qualified')
    finally:
        if qa_name:run(['docker','rm','-f','-v',qa_name])
        if started:run(['docker','rm','-f','-v',temporary])
        run(['docker','exec',PG,'rm','-f',dump])
else:
    state_path=BACKUP/'pet-hotel-integrated-state.json'
    if args.mode=='apply':
        proof=json.loads((BACKUP/'verified-backup.json').read_text());built=json.loads((STAGE/'gateway-build.json').read_text())
        if inspect(APP)['Image']!=previous['id'] or state_path.exists():raise RuntimeError('Gateway changed or this release already started')
        if not all(proof[k] for k in ['verified','restoreTested','migrationsRehearsed','candidateQualified']) or sha(BACKUP/'database.dump')!=proof['databaseSha256'] or sha(ROOT/'.env')!=proof['envSha256'] or sha(ROOT/'docker-compose.yml')!=proof['composeSha256']:raise RuntimeError('Gateway backup/configuration differs')
        if datetime.datetime.fromisoformat(proof['at'])<datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=2):raise RuntimeError('Gateway backup is stale')
        if inspect(candidate['reference'])['Id']!=built['id']:raise RuntimeError('Candidate image changed')
        protect(proof['protected']);migrations();before_config=json.loads(compose('config','--format','json'))['services']['gateway'];before_env=env(inspect(APP))
        if before_config['image']!=previous['reference']:raise RuntimeError('Gateway Compose differs from running image')
        state=dict(at=now(),phase='PREPARED',previous=previous,candidate=built,protected=proof['protected']);save(state_path,state)
        try:
            migration_deploy()
            put_hotel_configuration()
            after_config=json.loads(compose('config','--format','json'))['services']['gateway']
            if after_config['image']!=candidate['reference']:raise RuntimeError('Unexpected gateway image change')
            assert_environment(before_config['environment'],after_config['environment'])
            state.update(phase='CONFIGURED',envSha256=sha(ROOT/'.env'),composeSha256=sha(ROOT/'docker-compose.yml'));save(state_path,state)
            compose('up','-d','--no-deps','--no-build','--pull','never','gateway');ready(built['id']);protect(state['protected'])
            after_env=env(inspect(APP))
            assert_environment(before_env,after_env)
            state['phase']='COMPLETE';save(state_path,state);save(BACKUP/'deployment-receipt.json',dict(at=now(),revision=manifest['revision'],image=built['id'],protectedServicesPreserved=True,maxConfigurationPreserved=True,recordsRestored=False))
            print('APPLY_OK: hotel backend ready; existing MAX settings and public pages preserved')
        except Exception:
            restore_config();compose('up','-d','--no-deps','--no-build','--pull','never','gateway');ready(previous['id']);protect(state['protected']);state['phase']='FAILED_ROLLED_BACK';save(state_path,state);raise
    else:
        state=json.loads(state_path.read_text());protect(state['protected'])
        if inspect(APP)['Image']!=state['candidate']['id'] or sha(ROOT/'.env')!=state['envSha256'] or sha(ROOT/'docker-compose.yml')!=state['composeSha256']:raise RuntimeError('Rollback refuses a later release or configuration')
        restore_config();compose('up','-d','--no-deps','--no-build','--pull','never','gateway');ready(previous['id']);protect(state['protected']);state['phase']='ROLLED_BACK';save(state_path,state)
        print('ROLLBACK_OK: previous gateway restored; current owners, bindings and sessions retained')
