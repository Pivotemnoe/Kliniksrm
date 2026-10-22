#!/usr/bin/env python3
"""Immutable attribution-only release. Prepare locally; root review is required for every host mutation."""
import argparse, datetime, hashlib, json, os, pathlib, re, shutil, socket, subprocess, time, urllib.request, uuid

P = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('/opt/temichevvet-owner-gateway')
APP, PG, BACKUP = 'temichevvet-owner-gateway', 'temichevvet-owner-postgres', 'temichevvet-owner-backup'
BASE = 'sha256:339981be14103cd2ad16d26c71d93d80c058e89b0d3ca2bb5a61ea6f2ecf14fb'
CLINIC = '22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e'
PREFIXES = ['booking-attribution', 'grooming/grooming-portal.dto', 'grooming/grooming-portal.service', 'pet-hotel/pet-hotel.dto', 'pet-hotel/pet-hotel.controller', 'pet-hotel/pet-hotel-storefront.service', 'pet-hotel/pet-hotel-portal.service']
COMPOSE = [str(ROOT/'releases/crm-redesign-20261019-r3/compose-linux-amd64'), '--project-directory', str(ROOT), '--project-name', 'temichevvet-owner-gateway', '--file', str(ROOT/'docker-compose.yml'), '--env-file', str(ROOT/'.env')]
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def digest(v): return hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest()
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(ok, message):
    if not ok: raise RuntimeError(message)
def save(p, v):
    p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    q=p.with_name(p.name+'.tmp'); q.write_text(json.dumps(v, indent=2)+'\n'); q.chmod(0o600); q.replace(p)
def tree(root):
    require(root.is_dir(), 'Missing payload tree')
    files={}
    for p in sorted(root.rglob('*')):
        require(not p.is_symlink(), 'Symlink in payload')
        if p.is_file(): files[str(p.relative_to(root))]=sha(p)
    return files
def run(args):
    r=subprocess.run(args, text=True, capture_output=True)
    require(r.returncode==0, args[0]+' failed: '+(r.stderr or r.stdout)[-1400:]); return r.stdout
def inspect(n): return json.loads(run(['docker','inspect',n]))[0]
def compose(*args): return run(COMPOSE+list(args))
def env(c): return dict(v.split('=',1) for v in c['Config']['Env'])
def runtime(c): return digest(dict(environment=env(c), mounts=c['Mounts'], networks=sorted(c['NetworkSettings']['Networks'])))
def distribution(image):
    code="const f=require('fs'),p=require('path'),c=require('crypto'),o={};function w(d){for(const e of f.readdirSync(d,{withFileTypes:true})){const n=p.join(d,e.name);if(e.isDirectory())w(n);else if(e.isFile())o[p.relative('/app/apps/owner-gateway/dist',n)]=c.createHash('sha256').update(f.readFileSync(n)).digest('hex')}}w('/app/apps/owner-gateway/dist');process.stdout.write(JSON.stringify(o))"
    return json.loads(run(['docker','run','--rm','--pull','never','--network','none','--read-only','--cap-drop','ALL','--entrypoint','node',image,'-e',code]))
def protected():
    services=[dict(name=n,id=(c:=inspect(n))['Id'],image=c['Image'],started=c['State']['StartedAt']) for n in [PG,BACKUP]]
    static={}
    for kind in ['grooming','pet-hotel']:
        root=pathlib.Path('/var/www/temichevvet-'+kind+'/current').resolve(); files=tree(root)
        static[kind]=dict(target=str(root),manifestHash=digest(files),files=len(files))
    nginx={str(p):sha(p) for p in pathlib.Path('/etc/nginx/sites-available').iterdir() if p.is_file()}
    return dict(services=services,static=static,nginx=nginx)
def config_hashes(): return {n:sha(ROOT/n) for n in ['.env','docker-compose.yml']}
def closed_catalog(data):
    s=data.get('storefront')
    require(isinstance(s,dict) and s.get('selfBookingEnabled') is False,'Grooming self-booking state changed')
    require(isinstance(s.get('services'),list) and len(s['services'])==172 and isinstance(s.get('specialists'),list) and len(s['specialists'])==0,'Grooming service/specialist baseline changed')
def health():
    with urllib.request.urlopen('http://127.0.0.1:4100/health',timeout=5) as r: require(r.status==200,'Gateway health failed')
    with urllib.request.urlopen('http://127.0.0.1:4100/v1/public/grooming/catalog',timeout=10) as r:
        closed_catalog(json.load(r))
def ready(image):
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        try:
            if inspect(APP)['Image']==image: health(); return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('Gateway did not recover')
def verify_packet():
    sums=read(P/'checksums.json')
    for n,h in sums.items():
        require(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts,'Unsafe checksum path')
        require((P/n).is_file() and not (P/n).is_symlink() and sha(P/n)==h,'Immutable packet drift: '+n)
    require(set(tree(P))==set(sums)|{'checksums.json'},'Unexpected immutable packet files')
    m=read(P/'release.json'); require(m['previous']['id']==BASE and m['excludedVisualRevision'].startswith('114684e'),'Wrong baseline or visual boundary')
    d=m['gateway']['distribution']; require(d==read(P/'gateway/distribution.json'),'Distribution manifest mismatch')
    for mode in ['forward','compat']:
        allowed={p+e for p in PREFIXES for e in ['.js','.js.map','.d.ts']}
        if mode=='forward': allowed|={'public/grooming.js','public/pet-hotel.js'}
        else: allowed-={p+e for p in ['pet-hotel/pet-hotel.controller','pet-hotel/pet-hotel-storefront.service'] for e in ['.js','.js.map','.d.ts']}
        delta={p for p in set(d['before'])|set(d[mode]) if d['before'].get(p)!=d[mode].get(p)}
        require(delta<=allowed and delta==set(d['overlay'][mode]),'Gateway file whitelist exceeded')
        require(tree(P/'gateway'/mode)=={p:d[mode][p] for p in delta},'Overlay bytes differ')
        require(d[mode]['clinic-chat.service.js']==CLINIC,'Clinic context fix missing')
    for kind,s in m['static'].items():
        for mode in ['forward','compat']: require(tree(P/'static'/kind/mode)==s[mode],'Static bytes differ')
        for n in s['retainedAssets']: require(s['forward'][n]==s['compat'][n],'Cached-client asset not retained')
    return m
def host_guard(m): require(socket.gethostname()==m['hostName']=='msk-1-vm-d817','Wrong release host')
def reviewed(m, receipt):
    require(receipt is not None,'Root review receipt required')
    r=read(receipt); require(r.get('approved') is True and r.get('packetSha256')==sha(P/'checksums.json'),'Root review is absent or for another immutable packet')
    q=read(P/'qa/receipt.json'); require(q.get('passed') is True and q.get('actualPayload') is True and q.get('productionChanged') is False,'Actual-payload QA not passed')
    require(q.get('forwardDistribution')==m['gateway']['distribution']['forward'] and q.get('compatDistribution')==m['gateway']['distribution']['compat'],'QA used different payload')
    dependency=read(P/'qa/clinical-dependency-binding.json')
    require(dependency.get('passed') is True and dependency.get('forwardCompiledBytesUnchanged') is True and dependency.get('compatCompiledBytesUnchanged') is True and dependency.get('schemaFormattingOnly') is True,'Clinical dependency qualification not passed')
    require(sha(P/'qa/clinical-qualified-source-manifest.json')==dependency['qualifiedManifestSha256'],'Clinical qualified manifest changed')
    require(dependency.get('imageQualificationPrepared') is True and sha(P/'qa/clinical-images-identified.json')==dependency.get('imageIdentificationSha256'),'Clinical final image identification missing or changed')
    require(dependency.get('actualImageQaPassed') is True and sha(P/'qa/clinical-actual-image-qa.json')==dependency.get('actualImageQaSha256'),'Clinical final actual-image QA missing or changed')
    require(dependency.get('backupRestorePassed') is True and sha(P/'qa/clinical-backup-restore.json')==dependency.get('backupRestoreSha256'),'Clinical full backup/restore qualification missing or changed')
    clinical=r.get('clinical',{})
    require(clinical.get('sourceManifestSha256')==dependency['qualifiedManifestSha256'] and clinical.get('forwardReference')==dependency['forwardReference'] and clinical.get('compatReference')==dependency['compatReference'] and clinical.get('compatibleRollbackAccepted') is True,'Root clinical consumer/rollback acceptance missing')
    require(all(re.fullmatch(r'sha256:[0-9a-f]{64}',clinical.get(n,'')) for n in ['forwardImageId','compatImageId']),'Root must record exact qualified clinical image IDs')
    require(all(clinical[n]==dependency.get(n) for n in ['forwardImageId','compatImageId']),'Root clinical image IDs differ from the qualified images')
def guard_baseline(m):
    require(inspect(APP)['Image']==m['previous']['id'],'Gateway image changed')
    require(inspect(m['previous']['reference'])['Id']==BASE,'Gateway base image reference changed')
    require(distribution(m['previous']['id'])==m['gateway']['distribution']['before'],'Gateway baseline distribution changed')
    require(runtime(inspect(APP))==m['runtimeHash'] and config_hashes()==m['configuration'],'Gateway configuration/runtime changed')
    require(protected()==m['protectedBaseline'],'Protected baseline changed')
    health()
def static_root(kind,mode): return pathlib.Path('/var/www/temichevvet-'+kind+'/releases/booking-attribution-'+kind+'-'+('compat-' if mode=='compat' else '')+'20261022-r1')
def expected_protected(m,mode):
    p=json.loads(json.dumps(m['protectedBaseline']))
    p['static']={kind:dict(target=str(static_root(kind,mode)),manifestHash=digest(s[mode]),files=len(s[mode])) for kind,s in m['static'].items()}
    return p
def stage_static(m):
    for kind,s in m['static'].items():
        for mode in ['forward','compat']:
            dest=static_root(kind,mode)
            if dest.exists(): require(tree(dest)==s[mode],'Refusing to overwrite an existing static release')
            else: shutil.copytree(P/'static'/kind/mode,dest)
            require(tree(dest)==s[mode],'Staged static verification failed')
def switch_static(m,mode):
    for kind in m['static']:
        current=pathlib.Path('/var/www/temichevvet-'+kind+'/current'); temp=current.with_name('current-attribution-'+uuid.uuid4().hex)
        temp.symlink_to(static_root(kind,mode)); temp.replace(current)
def atomic_env(path, content, expected_hash):
    require(sha(path)==expected_hash,'Environment changed before atomic write')
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'wb') as stream:
            stream.write(content); stream.flush(); os.fchmod(stream.fileno(),0o600); os.fsync(stream.fileno())
        require(sha(path)==expected_hash,'Environment changed before atomic replace')
        os.replace(temp,path)
        directory=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        try: temp.unlink()
        except FileNotFoundError: pass
def pin_image(m,mode,base_config):
    reference=m['gateway'][mode+'Reference']; p=ROOT/'.env'; original=p.read_bytes(); original_hash=hashlib.sha256(original).hexdigest(); text=original.decode(); pattern=r'(?m)^OWNER_GATEWAY_IMAGE=[^\r\n]*'
    require(len(re.findall(pattern,text))==1,'Expected one image pin')
    before=json.loads(compose('config','--format','json'))
    allowed={m['previous']['reference'],m['gateway']['forwardReference'],m['gateway']['compatReference']}
    known=json.loads(json.dumps(base_config)); known['services']['gateway']['image']=before['services']['gateway']['image']
    require(before==known and before['services']['gateway']['image'] in allowed,'Compose configuration is not a guarded known version')
    candidate=re.sub(pattern,lambda _:'OWNER_GATEWAY_IMAGE='+reference,text).encode(); candidate_hash=hashlib.sha256(candidate).hexdigest()
    expected=json.loads(json.dumps(base_config)); expected['services']['gateway']['image']=reference
    try:
        atomic_env(p,candidate,original_hash)
        require(json.loads(compose('config','--format','json'))==expected,'Unrelated Compose settings changed')
    except Exception:
        current=sha(p)
        if current==candidate_hash: atomic_env(p,original,candidate_hash)
        else: require(current==original_hash,'Environment changed externally; refusing to overwrite it during recovery')
        require(json.loads(compose('config','--format','json'))==before,'Known environment restored but Compose configuration changed externally')
        raise
def verify_active(m,mode,built):
    require(inspect(APP)['Image']==built[mode]['id'],'Wrong active image')
    require(runtime(inspect(APP))==m['runtimeHash'],'Runtime configuration changed')
    require(protected()==expected_protected(m,mode),'Protected services/sites/nginx changed')
    ready(built[mode]['id'])
def main():
    parser=argparse.ArgumentParser(); parser.add_argument('mode',choices=['verify','inspect','build','backup','apply','rollback']); parser.add_argument('--review',type=pathlib.Path); args=parser.parse_args()
    os.umask(0o077); m=verify_packet(); B=ROOT/'backups'/m['releaseId']; state_file=B/'state.json'
    if args.mode=='verify': print('VERIFY_OK: immutable metadata-only packet; no host mutation'); return
    host_guard(m)
    if args.mode=='inspect':
        print(json.dumps(dict(at=now(),image=inspect(APP)['Image'],runtimeHash=runtime(inspect(APP)),configuration=config_hashes(),protected=protected()))); return
    reviewed(m,args.review)
    if args.mode=='build':
        guard_baseline(m); built={}
        for mode in ['forward','compat']:
            ref=m['gateway'][mode+'Reference']
            log=run(['docker','build','--platform','linux/amd64','--network','none','--pull=false','--build-arg','BASE_GATEWAY_IMAGE='+m['previous']['reference'],'--build-arg','RELEASE_REVISION='+m['sourceRevision'],'-f',str(P/'gateway'/('Dockerfile.'+mode)),'-t',ref,str(P/'gateway')])
            c=inspect(ref); require(distribution(c['Id'])==m['gateway']['distribution'][mode],'Built image changes unrelated files')
            require(c['Config']['Env']==inspect(BASE)['Config']['Env'],'Built image changes environment')
            built[mode]=dict(id=c['Id'],reference=ref); save(B/('build-'+mode+'.json'),dict(log=log,**built[mode]))
        guard_baseline(m); save(B/'built.json',dict(packetSha256=sha(P/'checksums.json'),**built)); print('BUILD_OK: forward and compatible rollback images verified; active service unchanged'); return
    if args.mode=='backup':
        guard_baseline(m); require(not (B/'backup.json').exists(),'Backup already exists'); B.mkdir(parents=True,exist_ok=True,mode=0o700)
        for n in ['.env','docker-compose.yml']: shutil.copy2(ROOT/n,B/('before-'+n)); (B/('before-'+n)).chmod(0o600)
        pg=env(inspect(PG)); name='attribution-restore-'+uuid.uuid4().hex[:12]; dump='/tmp/'+name+'.dump'; started=False
        try:
            run(['docker','exec',PG,'pg_dump','-U',pg['POSTGRES_USER'],'-d',pg['POSTGRES_DB'],'-Fc','--file',dump]); run(['docker','cp',PG+':'+dump,str(B/'database.dump')]); (B/'database.dump').chmod(0o600)
            run(['docker','run','-d','--network','none','--pull','never','--memory','512m','--memory-swap','512m','--cpus','0.5','--pids-limit','128','--label','codex.task=booking-attribution-restore','--label','codex.release='+m['releaseId'],'--name',name,'-e','POSTGRES_USER=restore_test','-e','POSTGRES_DB=restore_test','-e','POSTGRES_PASSWORD=isolated-restore-only',inspect(PG)['Image']]); started=True
            for _ in range(60):
                if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','restore_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0: break
                time.sleep(.5)
            run(['docker','cp',str(B/'database.dump'),name+':/tmp/database.dump']); run(['docker','exec',name,'pg_restore','-U','restore_test','-d','restore_test','--no-owner','--no-privileges','--exit-on-error','/tmp/database.dump'])
            guard_baseline(m); save(B/'backup.json',dict(at=now(),restoreTested=True,sha256=sha(B/'database.dump'),configuration=m['configuration'],runtimeHash=m['runtimeHash'],baseConfig=json.loads(compose('config','--format','json')))); print('BACKUP_OK: isolated restore passed')
        finally:
            if started:
                labels=inspect(name)['Config'].get('Labels') or {}
                require(labels.get('codex.task')=='booking-attribution-restore' and labels.get('codex.release')==m['releaseId'],'Restore container ownership changed; refusing cleanup')
                run(['docker','rm','-fv',name])
            run(['docker','exec',PG,'rm','-f',dump])
        return
    built=read(B/'built.json'); require(built['packetSha256']==sha(P/'checksums.json'),'Images built from another packet')
    for mode in ['forward','compat']: require(inspect(built[mode]['reference'])['Id']==built[mode]['id'],'Image tag drift')
    proof=read(B/'backup.json')
    if args.mode=='apply':
        guard_baseline(m); require(not state_file.exists(),'Release state already exists')
        require(proof['restoreTested'] and sha(B/'database.dump')==proof['sha256'] and datetime.datetime.fromisoformat(proof['at'])>datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=2),'Backup absent, changed or stale')
        stage_static(m); guard_baseline(m); state=dict(at=now(),phase='PREPARED',packetSha256=sha(P/'checksums.json')); save(state_file,state)
        try:
            pin_image(m,'forward',proof['baseConfig']); compose('up','-d','--no-deps','--no-build','--pull','never','gateway'); ready(built['forward']['id'])
            switch_static(m,'forward'); verify_active(m,'forward',built)
            state.update(phase='COMPLETE',at=now(),configuration=config_hashes()); save(state_file,state); print('APPLY_OK: metadata only; data, MAX, clinic context and visual baselines preserved')
        except Exception:
            switch_static(m,'compat'); pin_image(m,'compat',proof['baseConfig']); compose('up','-d','--no-deps','--no-build','--pull','never','gateway'); verify_active(m,'compat',built)
            state.update(phase='FAILED_COMPAT_ROLLBACK',at=now(),configuration=config_hashes()); save(state_file,state); raise
    else:
        state=read(state_file); require(state['phase']=='COMPLETE' and state['packetSha256']==sha(P/'checksums.json'),'Release is not the active completed packet')
        require(config_hashes()==state['configuration'],'Configuration changed after release'); verify_active(m,'forward',built)
        switch_static(m,'compat'); pin_image(m,'compat',proof['baseConfig']); compose('up','-d','--no-deps','--no-build','--pull','never','gateway'); verify_active(m,'compat',built)
        state.update(phase='COMPAT_ROLLBACK',at=now(),configuration=config_hashes()); save(state_file,state); print('ROLLBACK_OK: cached clients and queued commands remain readable; no records restored/deleted')
if __name__=='__main__': main()
