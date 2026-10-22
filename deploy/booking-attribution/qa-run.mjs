// Exact prepared payload QA in empty loopback databases. No host deployment or external messaging.
import {execFileSync,spawnSync} from 'node:child_process';
import {cp,mkdir,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
const root=resolve(new URL('../..',import.meta.url).pathname),packet=resolve(process.argv[2]),output=resolve(process.argv[3]);
const core=process.env.ATTRIBUTION_CLINICAL_QA_ROOT||'/Users/konstantin/.codex/worktrees/pet-hotel-production-20261020/CRM';
const clinicalPacket=process.env.ATTRIBUTION_CLINICAL_PACKET||'/Users/konstantin/Documents/CRM/output/deployments/crm-avito-prices-source-20261022-r1/packet';
const input=dirname(packet),baseline=resolve(input,'baseline/gateway-dist');
const m=JSON.parse(await readFile(packet+'/release.json','utf8'));
assert.equal(m.previous.id,'sha256:339981be14103cd2ad16d26c71d93d80c058e89b0d3ca2bb5a61ea6f2ecf14fb');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function manifest(dir){const files={};async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())await walk(p);else if(e.isFile())files[p.slice(dir.length+1)]=hash(await readFile(p));else throw Error('Symlink in immutable payload');}}await walk(dir);return files;}
await mkdir(output);await mkdir(output+'/evidence');
for(const mode of ['forward','compat','baseline']){
 const dir=output+'/gateway-'+mode;await mkdir(dir);await writeFile(dir+'/package.json','{"type":"commonjs"}');await symlink(root+'/node_modules',dir+'/node_modules','dir');
 await cp(baseline,dir+'/dist',{recursive:true});if(mode!=='baseline')await cp(packet+'/gateway/'+mode,dir+'/dist',{recursive:true});
 assert.deepEqual(await manifest(dir+'/dist'),m.gateway.distribution[mode==='baseline'?'before':mode]);
}
const clinicalSourceManifest=await readFile(clinicalPacket+'/source-manifest.json');
const clinicalHashes={};
for(const [mode,overlay]of[['forward','api'],['compat','rollback-api']]){
 const dir=output+'/clinical-'+mode;await mkdir(dir);await writeFile(dir+'/package.json','{"type":"commonjs"}');await symlink(core+'/node_modules',dir+'/node_modules','dir');
 await cp(core+'/apps/api/dist',dir+'/dist',{recursive:true});await cp(clinicalPacket+'/'+overlay,dir+'/dist',{recursive:true});
 clinicalHashes[mode]=await manifest(clinicalPacket+'/'+overlay);
 for(const [p,h]of Object.entries(clinicalHashes[mode]))assert.equal(hash(await readFile(dir+'/dist/'+p)),h);
}
const nativeFolder=root+'/apps/owner-gateway/src/generated/client';
const engine=(await readdir(nativeFolder)).find(n=>n.startsWith('libquery_engine-')&&n.endsWith('.dylib.node'));
assert(engine,'Explicit native QA engine required');
let server,staticMode='forward';const assetChecks=[];
try{
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'||url.pathname.includes('..')){res.writeHead(405).end();return;}const kind=url.pathname.startsWith('/pet-hotel/')?'pet-hotel':'grooming';const p=url.pathname.slice(1)||'index.html';const body=await readFile(packet+'/static/'+kind+'/'+staticMode+'/'+p);res.writeHead(200,{'Content-Type':p.endsWith('.js')?'text/javascript':'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 for(const mode of ['forward','compat']){staticMode=mode;for(const [kind,s]of Object.entries(m.static))for(const [p,h]of Object.entries(s[mode])){const response=await fetch(base+'/'+p);assert.equal(response.status,200,p+' missing in '+mode);assert.equal(hash(Buffer.from(await response.arrayBuffer())),h);assetChecks.push(mode+':'+kind+':'+p);}}
}finally{if(server)await new Promise(r=>server.close(r));}
await writeFile(output+'/evidence/asset-receipt.json',JSON.stringify({allResponses200:true,allHashesMatch:true,requests:assetChecks.length,retained:Object.fromEntries(Object.entries(m.static).map(([k,s])=>[k,s.retainedAssets])),checkedAt:new Date().toISOString()},null,2));
const name='crm-attribution-packet-qa-20261022',label='booking-attribution-actual-payload-20261022';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
const before=docker('ps','--format','{{.ID}} {{.Names}} {{.Ports}}');
if(docker('ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}'))throw Error('Dedicated test name already exists; refuse to reuse');
docker('run','-d','--name',name,'--label','codex.task='+label,'-p','127.0.0.1::5432','-e','POSTGRES_USER=attribution_bridge_qa','-e','POSTGRES_PASSWORD=isolated-bridge-test-only','-e','POSTGRES_DB=source_bridge_clinical_20261022_qa','postgres:16-alpine');
try{
 for(let n=0;n<25;n++){const r=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','attribution_bridge_qa']);if(r.status===0)break;if(n===24)throw Error('Test PG not ready');await new Promise(r=>setTimeout(r,300));}
 const port=docker('port',name,'5432/tcp').split(':').at(-1),base='postgresql://attribution_bridge_qa:isolated-bridge-test-only@127.0.0.1:'+port+'/';
 const clinical=base+'source_bridge_clinical_20261022_qa',gateway=base+'source_bridge_gateway_20261022_qa';
 docker('exec',name,'createdb','-h','127.0.0.1','-U','attribution_bridge_qa','source_bridge_gateway_20261022_qa');
 for(const [dir,schema,url,key]of[[core,clinicalPacket+'/schema.prisma',clinical,'DATABASE_URL'],[root,root+'/apps/owner-gateway/prisma/schema.prisma',gateway,'OWNER_GATEWAY_DATABASE_URL']]){
  const r=spawnSync('node',[resolve(dir,'node_modules/prisma/build/index.js'),'db','push','--skip-generate','--schema',schema],{cwd:dir,env:{...process.env,[key]:url},encoding:'utf8'});
  await writeFile(output+'/evidence/'+key+'-schema.log',r.stdout+'\n'+r.stderr);if(r.status!==0)throw Error('Could not prepare fresh '+key+' schema, see log');
 }
 const r=spawnSync('node',[root+'/deploy/booking-attribution/qa-bridge.mjs'],{cwd:root,env:{...process.env,ATTRIBUTION_CLINICAL_QA_ROOT:core,ATTRIBUTION_CLINICAL_QA_REVISION:execFileSync('git',['rev-parse','HEAD'],{cwd:core,encoding:'utf8'}).trim(),ATTRIBUTION_PACKET:packet,ATTRIBUTION_PAYLOAD_QA_ROOT:output,ATTRIBUTION_NATIVE_QA_ENGINE:nativeFolder+'/'+engine,BRIDGE_CLINICAL_QA_URL:clinical,BRIDGE_GATEWAY_QA_URL:gateway},encoding:'utf8'});
 await writeFile(output+'/evidence/checks.log',r.stdout+'\n'+r.stderr);console.log(r.stdout);if(r.status!==0){console.log(r.stderr.split('\n').slice(0,25).join('\n'));throw Error('Actual payload bridge verification failed; full log saved');}
 assert.equal(hash(await readFile(clinicalPacket+'/source-manifest.json')),hash(clinicalSourceManifest),'Upstream clinical packet changed during QA');
 const bridge=JSON.parse(await readFile(output+'/bridge-receipt.json','utf8'));
 await writeFile(output+'/evidence/receipt.json',JSON.stringify({...bridge,passed:true,actualPayload:true,forwardDistribution:m.gateway.distribution.forward,compatDistribution:m.gateway.distribution.compat,clinicalForwardFiles:clinicalHashes.forward,clinicalCompatFiles:clinicalHashes.compat,clinicalSourceManifestSha256:hash(clinicalSourceManifest),clinicalSchemaSha256:hash(await readFile(clinicalPacket+'/schema.prisma')),staticAssetChecks:assetChecks.length,engineAdapter:'Only the Prisma engine binary is overridden for the macOS QA host; all gateway dist JS and generated client bytes equal actual baseline plus exact overlay. No engine adapter is shipped.',nativeEngineSha256:hash(await readFile(nativeFolder+'/'+engine)),realMaxMessages:0,productionChanged:false},null,2));
}finally{
 if(docker('inspect','-f','{{index .Config.Labels "codex.task"}}',name)!==label)throw Error('Unexpected container label; refuse cleanup');
 docker('rm','-fv',name);
 const after=docker('ps','--format','{{.ID}} {{.Names}} {{.Ports}}');
 if(!before.split('\n').every(row=>after.split('\n').includes(row)))throw Error('A pre-existing shared container changed; inspect independently');
 await writeFile(output+'/evidence/cleanup.json',JSON.stringify({ownContainerRemoved:true,unrelatedContainersPreserved:true,checkedAt:new Date().toISOString()},null,2));
 console.log('Dedicated test container removed; shared containers unchanged.');
}
