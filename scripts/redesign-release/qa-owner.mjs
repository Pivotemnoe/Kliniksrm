import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { packet, qaDir, qaProject } from './config.mjs';
const web='http://127.0.0.1:4251', owner='http://127.0.0.1:4253';
const manifest=JSON.parse(await readFile(resolve(packet,'release.json'),'utf8'));
const checks=[];
const check=(actual,expected,name)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
function run(command,args) {const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:1024*1024*4});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;}
// The cloned local cabinet already uses the original fixture phone.
const fixtureScript=resolve(qaDir,'owner-fixtures.mjs');
await writeFile(fixtureScript,(await readFile(fixtureScript,'utf8')).replaceAll('+79990000199','+79990000299'));
run('node',[fixtureScript]);
const fixture=JSON.parse(await readFile(resolve(qaDir,'owner-fixtures.json'),'utf8'));
const login=await fetch(web+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'director@example.local',password:'LocalCRM2026!'})});
assert.ok(login.ok);const staffCookie=login.headers.get('set-cookie').split(';')[0];
async function session(ownerId) {
  const inviteResponse=await fetch(web+`/api/v1/notifications/owners/${ownerId}/portal-invites`,{method:'POST',headers:{cookie:staffCookie,'content-type':'application/json'},body:JSON.stringify({channel:'WEB'})});
  assert.ok(inviteResponse.ok);const invite=await inviteResponse.json();check(invite.gatewaySync,'synced','real CRM invitation synchronized');
  const url=new URL(invite.deliveryUrls.WEB);assert.equal(url.origin,owner);
  const result=await fetch(owner+'/v1/portal/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:url.searchParams.get('token')})});
  assert.ok(result.ok);return result.headers.get('set-cookie').split(';')[0];
}
const cookie=await session(fixture.ownerId);
const otherCookie=await session('d3519000-0000-4000-8000-000000000101');
const getMe=async()=>{const r=await fetch(owner+'/v1/portal/me',{headers:{cookie}});assert.equal(r.status,200);return r.json();};
const before=await getMe();
const protectedNames=['web','api','postgres','redis','minio'].map(v=>`${qaProject}-${v}`);
const identities=()=>JSON.parse(run('docker',['inspect',...protectedNames])).map(v=>[v.Id,v.Image,v.State.StartedAt]);
const protectedBefore=identities();
const envFile=resolve(qaDir,'.env');
async function switchImage(image,expectedId) {
  const text=await readFile(envFile,'utf8');assert.equal((text.match(/^OWNER_GATEWAY_IMAGE=/gm)||[]).length,1);
  await writeFile(envFile,text.replace(/^OWNER_GATEWAY_IMAGE=.*$/m,'OWNER_GATEWAY_IMAGE='+image));
  run('docker',['compose','--project-directory',qaDir,'--project-name',qaProject,'-f',resolve(qaDir,'docker-compose.yml'),'--env-file',envFile,'up','-d','--no-deps','--no-build','--pull','never','gateway']);
  for(let i=0;i<30;i++) {try{if((await fetch(owner+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  const container=JSON.parse(run('docker',['inspect',`${qaProject}-gateway`]))[0];check(container.Image,expectedId,'exact owner image selected');
  check(identities(),protectedBefore,'staff API, Web and data services untouched by owner switch');
  const me=await getMe();check(me.ownerId,before.ownerId,'existing owner session survives image switch');
  check(me.snapshot,before.snapshot,'existing clinical snapshot survives image switch');
}
await switchImage(manifest.images.owner.candidate,manifest.images.owner.candidateId);
check((await fetch(owner+'/v1/portal/me')).status,401,'anonymous snapshot denied');
const me=await getMe();
check(me.snapshot.animals.map(v=>v.id).sort(),[fixture.animalId,fixture.secondAnimalId].sort(),'two pets retained');
check(me.snapshot.laboratoryOrders.some(v=>v.items.length===18),true,'18 laboratory results retained');
check(me.snapshot.laboratoryOrders.some(v=>v.items.some(i=>i.resultValue==='123')),true,'clinical result retained');
check(me.snapshot.bills.length,4,'all four current and historical bills retained');
check(me.snapshot.bills.filter(v=>!['CANCELLED','REFUNDED'].includes(v.status)).reduce((s,v)=>s+Math.max(0,Number(v.totalAmount)-Number(v.paidAmount)),0),2000,'due amount excludes refunded and cancelled bills');
const file=me.snapshot.files.find(v=>v.fileName==='local-test.pdf');assert.ok(file);
const documentUrl=owner+'/v1/portal/documents/'+encodeURIComponent(file.id);
check((await fetch(documentUrl)).status,401,'anonymous PDF denied');
const pdf=await fetch(documentUrl,{headers:{cookie}});check(pdf.status,200,'authorized owner receives PDF');
check(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-','real object-storage PDF bytes returned');
check([403,404].includes((await fetch(documentUrl,{headers:{cookie:otherCookie}})).status),true,'another owner cannot read PDF');
for(const name of ['app.js','app.css','sw.js']) {
  const result=await fetch(owner+'/portal/'+name);assert.equal(result.status,200);
  check(createHash('sha256').update(Buffer.from(await result.arrayBuffer())).digest('hex'),createHash('sha256').update(await readFile(resolve(packet,'owner-public',name))).digest('hex'),`served ${name} matches packaged bytes`);
}
const html=await (await fetch(owner+'/portal')).text();check(html.includes('v=20261019-crm-design-2'),true,'new versioned frontend served');
await switchImage(manifest.images.owner.previous,manifest.images.owner.previousId);
await switchImage(manifest.images.owner.candidate,manifest.images.owner.candidateId);
await writeFile(resolve(qaDir,'owner-verification.json'),JSON.stringify({at:new Date().toISOString(),passed:true,checks:checks.length,details:checks,productionDeployed:false},null,2));
console.log(`${checks.length} owner gateway checks passed, including image rollback and preserved sessions.`);
