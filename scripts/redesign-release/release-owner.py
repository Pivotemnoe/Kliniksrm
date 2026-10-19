#!/usr/bin/env python3
"""Guarded, static-only owner-gateway release on the existing RU installation."""
import argparse, datetime as dt, hashlib, json, os, pathlib, re, shutil, socket, subprocess, time, urllib.request, uuid
ROOT=pathlib.Path('/opt/temichevvet-owner-gateway')
STAGE=ROOT/'releases/crm-redesign-20261019-r3'
BACKUP=ROOT/'backups/crm-redesign-20261019-r3-v2'
COMPOSE=STAGE/'compose-linux-amd64'
PREVIOUS='temichevvet-owner-gateway:contact-gate-staff-20261018-v1'
PREVIOUS_ID='sha256:2f5bb2fe1ac974114d3b657af9c756e556792f772b3e134e8f0c80558d9030d9'
CANDIDATE='temichevvet-owner-gateway:crm-redesign-20261019-r1'
CANDIDATE_ID='sha256:2bad6374d52318648bf786e7614bb75c5abcd91c42789ed67e920ef05e3373d5'
PROTECTED=['temichevvet-owner-postgres','temichevvet-owner-backup']
GATEWAY='temichevvet-owner-gateway'
ASSET_HASHES=json.loads((STAGE/'owner-assets.json').read_text())

def run(args, *, stdout=subprocess.PIPE, check=True):
    p=subprocess.run(args,stdout=stdout,stderr=subprocess.PIPE)
    if check and p.returncode:
        raise RuntimeError('Command failed: '+str(args[0])+' '+str(args[1])+'; '+p.stderr.decode(errors='replace')[-1500:])
    return p

def inspect(name, image=False):
    return json.loads(run(['docker',*(['image'] if image else []),'inspect',name]).stdout)[0]

def identity(name):
    c=inspect(name)
    return dict(name=name,id=c['Id'],image=c['Image'],reference=c['Config']['Image'],started=c['State']['StartedAt'])

def protected():return [identity(n) for n in PROTECTED]
def assert_protected(before):
    if protected()!=before:raise RuntimeError('Protected owner data services changed')
def digest(file):
    h=hashlib.sha256()
    with open(file,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def save(file,value):
    with open(file,'x',encoding='utf8') as f:json.dump(value,f,indent=2)
    os.chmod(file,0o600)
def utc():return dt.datetime.now(dt.timezone.utc).isoformat()
def config():
    return json.loads(run([str(COMPOSE),'--project-directory',str(ROOT),'--project-name','temichevvet-owner-gateway','--file',str(ROOT/'docker-compose.yml'),'--env-file',str(ROOT/'.env'),'config','--format','json']).stdout)
def compose_up(image):
    c=config()
    if c['services']['gateway']['image']!=image:raise RuntimeError('Compose selects an unexpected owner image')
    if c['services']['gateway'].get('container_name')!=GATEWAY:raise RuntimeError('Wrong owner container')
    run([str(COMPOSE),'--project-directory',str(ROOT),'--project-name','temichevvet-owner-gateway','--file',str(ROOT/'docker-compose.yml'),'--env-file',str(ROOT/'.env'),'up','-d','--no-deps','--no-build','--pull','never','gateway'])
def healthy(image_id,assets=False):
    last=None
    for _ in range(40):
        try:
            c=inspect(GATEWAY)
            if c['Image']!=image_id or not c['State']['Running']:raise RuntimeError('Wrong or stopped owner image')
            with urllib.request.urlopen('http://127.0.0.1:4100/health',timeout=3) as r:health=json.load(r)
            if health.get('ok') is not True:raise RuntimeError('Owner health failed')
            if assets:
                for name,expected in ASSET_HASHES.items():
                    with urllib.request.urlopen('http://127.0.0.1:4100/portal/'+name,timeout=5) as r:data=r.read()
                    if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Owner static asset differs: '+name)
            return health
        except Exception as e:last=e;time.sleep(.4)
    raise RuntimeError('Owner health/version verification failed: '+str(last))
def verify_candidate():
    old=inspect(PREVIOUS,True);new=inspect(CANDIDATE,True)
    if old['Id']!=PREVIOUS_ID or new['Id']!=CANDIDATE_ID or new['Architecture']!='amd64':raise RuntimeError('Owner image identity/platform mismatch')
    if new['RootFS']['Layers'][:len(old['RootFS']['Layers'])]!=old['RootFS']['Layers']:raise RuntimeError('Owner backend baseline differs')
    if new['Config']['Cmd']!=old['Config']['Cmd'] or new['Config']['Entrypoint']!=old['Config']['Entrypoint']:raise RuntimeError('Owner startup command changed')
    if new['Config']['Cmd']!=['node','apps/owner-gateway/dist/main.js']:raise RuntimeError('Unexpected owner startup/migration command')
def env_bytes():
    if (ROOT/'.env').is_symlink():raise RuntimeError('Unexpected environment symlink')
    return (ROOT/'.env').read_bytes()
def set_env(data):
    live=ROOT/'.env';tmp=ROOT/('.env.redesign-'+uuid.uuid4().hex)
    st=live.stat()
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,st.st_mode&0o777)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chown(tmp,st.st_uid,st.st_gid);os.replace(tmp,live)
    finally:
        if tmp.exists():tmp.unlink()
def backup():
    if inspect(GATEWAY)['Image']!=PREVIOUS_ID:raise RuntimeError('Owner baseline changed before backup')
    if BACKUP.exists():raise RuntimeError('Existing backup must not be overwritten')
    if shutil.disk_usage(ROOT).free<3*1024**3:raise RuntimeError('Insufficient backup space')
    before=protected();BACKUP.mkdir(mode=0o700,parents=True)
    shutil.copy2(ROOT/'.env',BACKUP/'before.env');shutil.copy2(ROOT/'docker-compose.yml',BACKUP/'before-compose.yml')
    os.chmod(BACKUP/'before.env',0o600)
    pg=inspect(PROTECTED[0]);env=dict(s.split('=',1) for s in pg['Config']['Env'] if '=' in s)
    user=env['POSTGRES_USER'];database=env['POSTGRES_DB']
    with open(BACKUP/'gateway.dump','xb') as f:run(['docker','exec',PROTECTED[0],'pg_dump','-U',user,'-d',database,'-Fc'],stdout=f)
    temp='crm-owner-redesign-restore-'+uuid.uuid4().hex[:12];created=False
    try:
        run(['docker','run','-d','--name',temp,'--pull','never','--network','none','--label','io.temichevvet.redesign-restore=true','-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',pg['Image']]);created=True
        for _ in range(80):
            if run(['docker','exec',temp,'pg_isready','-h','127.0.0.1','-U','restore_test','-d','restore_test'],check=False).returncode==0:break
            time.sleep(.4)
        else:raise RuntimeError('Isolated restoration PostgreSQL not ready')
        run(['docker','cp',str(BACKUP/'gateway.dump'),temp+':/tmp/gateway.dump'])
        run(['docker','exec',temp,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/gateway.dump'])
        tables=int(run(['docker','exec',temp,'psql','-U','restore_test','-d','restore_test','-tA','-v','ON_ERROR_STOP=1','-c',"SELECT count(*) FROM pg_tables WHERE schemaname='public';"]).stdout.strip())
        if tables<1:raise RuntimeError('No restored owner tables')
    finally:
        if created:run(['docker','rm','-f','-v',temp])
    assert_protected(before)
    receipt=dict(capturedAt=utc(),verified=True,restoreTested=True,restoredTables=tables,databaseSha256=digest(BACKUP/'gateway.dump'),envBeforeSha256=digest(BACKUP/'before.env'),composeBeforeSha256=digest(BACKUP/'before-compose.yml'),protected=before)
    save(BACKUP/'verified-backup.json',receipt)
    print('OWNER_BACKUP_OK: isolated restoration succeeded; protected services unchanged.',flush=True)
def restore(state):
    assert_protected(state['protected'])
    if digest(ROOT/'.env') not in [state['appliedEnvSha256'],state['beforeEnvSha256']]:raise RuntimeError('Owner environment changed after release; refuse overwrite')
    if digest(ROOT/'docker-compose.yml')!=state['composeSha256']:raise RuntimeError('Owner Compose configuration changed after release')
    set_env((BACKUP/'before.env').read_bytes())
    if inspect(GATEWAY)['Image']!=PREVIOUS_ID:compose_up(PREVIOUS)
    healthy(PREVIOUS_ID);assert_protected(state['protected'])
def apply():
    verify_candidate()
    b=json.loads((BACKUP/'verified-backup.json').read_text())
    if not b['verified'] or not b['restoreTested'] or dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(b['capturedAt'])>dt.timedelta(hours=24):raise RuntimeError('Recent verified owner backup required')
    assert_protected(b['protected'])
    if inspect(GATEWAY)['Image']!=PREVIOUS_ID:raise RuntimeError('Unexpected live owner image')
    if digest(BACKUP/'gateway.dump')!=b['databaseSha256'] or digest(ROOT/'.env')!=b['envBeforeSha256'] or digest(ROOT/'docker-compose.yml')!=b['composeBeforeSha256']:raise RuntimeError('Owner backup/configuration identity mismatch')
    original=env_bytes();pattern=rb'(?m)^OWNER_GATEWAY_IMAGE=[^\r\n]*'
    if len(re.findall(pattern,original))!=1:raise RuntimeError('Exactly one owner image pin required')
    updated=re.sub(pattern,b'OWNER_GATEWAY_IMAGE='+CANDIDATE.encode(),original)
    state=dict(at=utc(),previousImage=PREVIOUS,previousId=PREVIOUS_ID,candidateImage=CANDIDATE,candidateId=CANDIDATE_ID,protected=b['protected'],beforeEnvSha256=b['envBeforeSha256'],appliedEnvSha256=hashlib.sha256(updated).hexdigest(),composeSha256=b['composeBeforeSha256'])
    save(BACKUP/'release-state.json',state)
    try:
        set_env(updated);compose_up(CANDIDATE);health=healthy(CANDIDATE_ID,True);assert_protected(state['protected'])
        save(BACKUP/'deployment-receipt.json',dict(at=utc(),gateway=identity(GATEWAY),protected=protected(),health=health,staticAssetsMatched=True,backendUnchanged=True,backupPath=str(BACKUP)))
        print('OWNER_APPLY_OK: static frontend replaced; owner PostgreSQL and backup unchanged.',flush=True)
    except Exception as error:
        restore(state)
        raise RuntimeError('Owner release failed and previous gateway restored: '+str(error)) from error

def main():
    os.umask(0o077)
    if socket.gethostname()!='msk-1-vm-d817':raise RuntimeError('Wrong owner deployment host')
    a=argparse.ArgumentParser();a.add_argument('mode',choices=['Inspect','Backup','Apply','Rollback']);mode=a.parse_args().mode
    if mode=='Backup':backup()
    elif mode=='Apply':apply()
    elif mode=='Rollback':
        s=json.loads((BACKUP/'release-state.json').read_text())
        if inspect(GATEWAY)['Image']!=CANDIDATE_ID:raise RuntimeError('Rollback refuses an unexpected or already replaced owner image')
        restore(s);print('OWNER_ROLLBACK_OK: old frontend restored; existing sessions and data retained.')
    else:
        verify_candidate();cfg=config()
        if cfg['services']['gateway']['image'] not in [PREVIOUS,CANDIDATE]:raise RuntimeError('Unexpected configured owner image')
        if inspect(GATEWAY)['Image'] not in [PREVIOUS_ID,CANDIDATE_ID]:raise RuntimeError('Unexpected live owner image')
        healthy(inspect(GATEWAY)['Image']);print('OWNER_INSPECT_OK: exact images, unchanged startup command, existing installation healthy.')
if __name__=='__main__':main()
