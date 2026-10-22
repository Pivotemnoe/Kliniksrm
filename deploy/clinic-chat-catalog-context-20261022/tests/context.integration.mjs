import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,resolve,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {priceSelectionBooking} from '../../../prototypes/temichevvet-blue-motion-20260923/src/price-selection.js';

// Deliberately fixed localhost endpoints and new QA databases. Never accept a
// production DSN or customer contact from the environment.
const base='http://127.0.0.1:4235';
const testRoot=dirname(fileURLToPath(import.meta.url));
const repo=resolve(testRoot,'../../..');
const runtime=process.env.CLINIC_CONTEXT_QA_RUNTIME_ROOT||repo;
const require=createRequire(join(runtime,'package.json'));
const {PrismaClient}=require(join(runtime,'apps/owner-gateway/dist/generated/client/index.js'));
const db=new PrismaClient({datasources:{db:{url:'postgresql://clinic_qa:local-only-qa-20261022@127.0.0.1:15498/clinic_context_form_qa'}}});
const getMetrics=async()=>{const r=await fetch(base+'/qa-metrics');assert.equal(r.status,200);return r.json();};
const initial=await getMetrics();
assert.equal(initial.contextQa,true);assert.equal(initial.localOnly,true);
assert.equal(initial.databases.gateway,'127.0.0.1:15498/clinic_context_form_qa');
assert.equal(initial.databases.crm,'127.0.0.1:15498/clinic_context_crm_qa');
const payloadSha=createHash('sha256').update(await readFile(resolve(testRoot,'../payload/clinic-chat.service.js'))).digest('hex');
assert.ok(initial.sourceHashes.some(x=>x.file.includes('/payload/')&&x.sha256===payloadSha));
const initialLeadIds=new Set(initial.leads.map(l=>l.id));
const fixed=(id,title,price)=>({id,title,category:'Визуальная диагностика',priceType:'FIXED',price,minimumPrice:null,maximumPrice:null});
const selection=priceSelectionBooking({status:'ready',currency:'RUB',updatedAt:new Date().toISOString(),items:[fixed('qa-uzi','УЗИ',1035),fixed('qa-overview','УЗИ обзорное',1380)]},['qa-uzi','qa-overview']);
assert.ok(selection);assert.equal(selection.minimum,2415);
const cart=selection.message;
const program='Диспансеризация собаки расширенная в Инвитро. Что входит?';
const lastAnswer=v=>v.messages.filter(m=>m.author==='ASSISTANT').at(-1)?.text||'';
const money=text=>text.replaceAll('\u00a0',' ');
const observations=[];
async function guest(){
  const r=await fetch(base+'/api/chat/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,201);const view=await r.json();
  return {id:view.id,cookie:r.headers.get('set-cookie').split(';')[0]};
}
async function post(session,path,data){
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(session?{cookie:session.cookie}:{})},body:JSON.stringify(data)});
  return {status:r.status,data:await r.json()};
}
async function send(s,text,key=randomUUID()){
  const r=await post(s,'/api/chat/messages',{clientKey:key,text});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;
}
async function contact(s,name,key=randomUUID()){
  const body={clientKey:key,contactName:name,phone:'+70000000000',contactConsent:true,preferredReplyChannel:'SITE_CHAT'};
  const r=await post(s,'/api/chat/contact',body);assert.equal(r.status,201,JSON.stringify(r.data));return {view:r.data,body};
}
async function lead(s){const m=await getMetrics();return m.leads.find(l=>l.conversationId===s.id);}
async function model(enabled){const r=await fetch(base+'/qa-model-flag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});assert.equal(r.status,200);}
async function check(name,fn){await fn();observations.push({name,result:'PASS'});console.log('PASS '+name);}
let failed=null;
try{
  await check('anonymous checkup -> exact frontend catalog list -> consented CRM request and idempotent contact',async()=>{
    const s=await guest();await send(s,program);
    const v=await send(s,cart);
    assert.equal(v.bookingDraft,null);assert.equal(v.contactConsent,false);assert.equal(v.needsAttention,false);assert.equal(v.mode,'ASSISTANT');
    assert.match(lastAnswer(v),/Список услуг сохранён/);assert.doesNotMatch(lastAnswer(v),/14\s950|Для собаки|расширенная программа/);
    assert.equal(await lead(s),undefined);
    const saved=await contact(s,'QA смена темы');
    const row=await lead(s);assert.ok(row);assert.equal(row.conversationSnapshot.bookingDraft,null);
    assert.ok(row.conversationSnapshot.messages.some(m=>m.author==='OWNER'&&m.text===cart));
    const receipt=row.conversationSnapshot.messages.find(m=>m.clientKey===saved.body.clientKey);
    assert.ok(receipt);assert.doesNotMatch(receipt.text,/Диспансеризация:|14\s950/);
    assert.ok(row.conversationSnapshot.messages.some(m=>m.text===program),'Keep history');
    const replay=await post(s,'/api/chat/contact',saved.body);assert.equal(replay.status,201);
    const after=await lead(s);assert.equal(after.id,row.id);assert.equal(after.conversationVersion,row.conversationVersion);
    const read=await fetch(base+'/api/chat',{headers:{cookie:s.cookie}});assert.equal(read.status,200);assert.equal((await read.json()).bookingDraft,null);
  });
  await check('explicit checkup continuation retains species/lab/program and correct approved prices',async()=>{
    const s=await guest();await send(s,program);
    const v=await send(s,'Что входит?');
    assert.equal(v.bookingDraft.checkup.species,'dog');assert.equal(v.bookingDraft.checkup.lab,'invitro');assert.equal(v.bookingDraft.checkup.program,'expanded');assert.match(money(lastAnswer(v)),/14 950 ₽/);
    const standard=await send(s,'А стандартная программа?');assert.equal(standard.bookingDraft.checkup.program,'standard');assert.equal(standard.bookingDraft.checkup.lab,'invitro');assert.match(money(lastAnswer(standard)),/5 750 ₽/);
    assert.equal(await lead(s),undefined);
  });
  await check('consented HUMAN conversation changes draft before early return and updates same CRM request',async()=>{
    const s=await guest();await send(s,program);await contact(s,'QA существующий контакт');
    const before=await lead(s);assert.ok(before.conversationSnapshot.bookingDraft.checkup);
    const v=await send(s,cart);assert.equal(v.bookingDraft,null);assert.equal(v.mode,'HUMAN');assert.equal(v.contactConsent,true);assert.equal(v.needsAttention,true);
    const after=await lead(s);assert.equal(after.id,before.id);assert.ok(after.conversationVersion>before.conversationVersion);assert.equal(after.conversationSnapshot.bookingDraft,null);assert.ok(after.conversationSnapshot.messages.some(m=>m.text===cart));
    assert.equal(after.ownerId,null);assert.equal(after.appointmentId,null);
  });
  await check('replayed older catalog clientKey cannot clear a newer explicit checkup draft',async()=>{
    const s=await guest();await send(s,program);const key=randomUUID();await send(s,cart,key);
    const current=await send(s,'Диспансеризация кошки стандартная в клинике');
    const retry=await send(s,cart,key);assert.equal(retry.sequence,current.sequence);assert.deepEqual(retry.bookingDraft,current.bookingDraft);assert.equal(retry.bookingDraft.checkup.species,'cat');assert.equal(retry.messages.filter(m=>m.clientKey===key).length,1);
    assert.equal(await lead(s),undefined);
  });
  await check('clinical warning is not bypassed by a catalog-looking message',async()=>{
    const s=await guest();await send(s,program);const v=await send(s,cart+'\nСобака задыхается.');
    assert.equal(v.bookingDraft,null);assert.equal(v.contactConsent,false);assert.equal(v.needsAttention,false);
    assert.match(lastAnswer(v),/По симптомам нельзя|сразу позвоните/);assert.doesNotMatch(lastAnswer(v),/14\s950/);assert.equal(await lead(s),undefined);
  });
  await check('a non-checkup booking draft is not erased',async()=>{
    const s=await guest();const draft={revision:1,serviceQuery:'УЗИ',preferredTimeText:'завтра',visitKind:'INITIAL'};
    await db.clinicConversation.update({where:{id:s.id},data:{bookingDraft:draft}});
    const v=await send(s,cart);assert.deepEqual(v.bookingDraft,draft);assert.equal(await lead(s),undefined);
  });
  await check('catalog handoff has deterministic priority with the model flag enabled; no run queued',async()=>{
    await model(true);
    try{const s=await guest();await send(s,program);const v=await send(s,cart);assert.equal(v.bookingDraft,null);assert.match(lastAnswer(v),/Список услуг сохранён/);assert.equal((await getMetrics()).assistantRuns,0);assert.equal(await lead(s),undefined);}
    finally{await model(false);}
  });
  await check('authentication, callback consent and first-name requirements remain enforced',async()=>{
    const noAuth=await post(null,'/api/chat/messages',{clientKey:randomUUID(),text:cart});assert.equal(noAuth.status,401);
    const s=await guest();await send(s,program);await send(s,cart);
    for(const body of [
      {contactName:'QA',phone:'+70000000000',contactConsent:false},
      {phone:'+70000000000',contactConsent:true},
      {contactName:'QA',phone:'123',contactConsent:true},
      {contactName:'QA',phone:'+70000000000',contactConsent:true,preferredReplyChannel:'MAX'},
    ]){const r=await post(s,'/api/chat/contact',{clientKey:randomUUID(),...body});assert.equal(r.status,400);}
    assert.equal(await lead(s),undefined);
  });
  const final=await getMetrics();const created=final.leads.filter(l=>!initialLeadIds.has(l.id));
  assert.equal(created.length,2);assert.equal(final.ownerRecords,0);assert.equal(final.appointments,0);assert.equal(final.assistantRuns,0);assert.equal(final.pending.length,0);
}catch(error){failed={name:error.name,message:error.message};throw error;}
finally{
  const final=await getMetrics();await db.$disconnect();
  const report={at:new Date().toISOString(),result:failed?'FAIL':'PASS',localOnly:true,actualNestControllers:true,actualGatewayPostgres:true,actualCrmSyncService:true,actualCrmPostgres:true,sourcePatchOnly:true,productionMessagesSent:0,productionLeadsSent:0,passed:observations.length,failed,observations,payloadSha256:payloadSha,counts:{newCrmLeads:final.leads.filter(l=>!initialLeadIds.has(l.id)).length,owners:final.ownerRecords,appointments:final.appointments,queuedModelRuns:final.assistantRuns,pending:final.pending.length},databases:final.databases,runtimeSources:final.sourceHashes.map(x=>({module:basename(x.file),role:x.file.includes('/payload/')?'patched':'baseline',sha256:x.sha256}))};
  await mkdir(resolve(testRoot,'../evidence'),{recursive:true});await writeFile(resolve(testRoot,'../evidence/context-regression.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
