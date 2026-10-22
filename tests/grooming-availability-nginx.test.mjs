import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const location=`    location = /v1/public/grooming/catalog {
        limit_except GET { deny all; }
        proxy_pass http://127.0.0.1:4100;
        include /etc/nginx/proxy_params;
        proxy_connect_timeout 5s;
        proxy_read_timeout 25s;
    }
`;
test('the exact public availability route forwards GET queries while POST and private routes remain denied',{timeout:30000},async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'grooming-route-qa-')),name='crm-grooming-availability-qa-20261022';let created=false;
  const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try{
    const before=`server {\n    listen 8080;\n${location}    location ^~ /v1/ { return 404; }\n    location ^~ /internal/ { return 404; }\n}\n`;
    await writeFile(path.join(temp,'before.conf'),before);
    const script=`import importlib.util,sys\nfrom pathlib import Path\nspec=importlib.util.spec_from_file_location('release','deploy/grooming-availability/release.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\np=Path(sys.argv[1]);before=p.read_bytes();after=m.render_config(before);assert m.render_config.__name__=='render_config'\ntry:m.render_config(after)\nexcept RuntimeError:pass\nelse:raise RuntimeError('duplicate route accepted')\np.with_name('after.conf').write_bytes(after)\n`;
    execFileSync('python3',['-c',script,path.join(temp,'before.conf')],{stdio:['ignore','pipe','pipe']});
    const after=await readFile(path.join(temp,'after.conf'),'utf8');
    assert.equal(after.replace(location.replace('/grooming/catalog','/grooming/availability'),''),before);
    const wrap=routes=>`events {}\nhttp { access_log off; server { listen 4100; location / { default_type application/json; add_header Cache-Control no-store; return 200 '{"slots":[],"enabled":false,"query":"$args","method":"$request_method"}'; } } ${routes} }\n`;
    await writeFile(path.join(temp,'nginx.conf'),wrap(before));await writeFile(path.join(temp,'proxy_params'),'proxy_set_header Host $host;\n');
    docker('run','-d','--platform','linux/amd64','--pull','never','--name',name,'--label','io.temichevvet.qa=grooming-availability-20261022','-p','127.0.0.1:18494:8080','-v',temp+':/qa:ro','-v',path.join(temp,'proxy_params')+':/etc/nginx/proxy_params:ro','--entrypoint','nginx','nginx:1.27-alpine','-g','daemon off;','-c','/qa/nginx.conf');created=true;
    const base='http://127.0.0.1:18494',query='date=2026-10-23&species=DOG&size=SMALL&coat=ANY&serviceId=local-qa';
    let ready=false;for(let n=0;n<30;n++){try{ready=(await fetch(base+'/v1/public/grooming/catalog')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
    assert.equal((await fetch(base+'/v1/public/grooming/availability?'+query)).status,404,'reproduces the old missing route');
    await writeFile(path.join(temp,'nginx.conf'),wrap(after));docker('exec',name,'nginx','-t','-c','/qa/nginx.conf');docker('exec',name,'nginx','-s','reload','-c','/qa/nginx.conf');
    let response;for(let n=0;n<30;n++){response=await fetch(base+'/v1/public/grooming/availability?'+query);if(response.ok)break;await response.text();await new Promise(r=>setTimeout(r,100));}
    assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{slots:[],enabled:false,query,method:'GET'});
    assert.equal((await fetch(base+'/v1/public/grooming/availability',{method:'POST',body:'local synthetic probe'})).status,403);
    assert.equal((await fetch(base+'/v1/public/grooming/availability/unknown')).status,404);
    assert.equal((await fetch(base+'/v1/private')).status,404);assert.equal((await fetch(base+'/internal/v1/grooming')).status,404);
    assert.equal((await fetch(base+'/v1/public/grooming/catalog')).status,200,'existing catalog still works');
  }finally{
    if(created){const c=JSON.parse(docker('inspect',name))[0];assert.equal(c.Config.Labels['io.temichevvet.qa'],'grooming-availability-20261022');docker('rm','-f','-v',name);}
    await rm(temp,{recursive:true,force:true});
  }
});
