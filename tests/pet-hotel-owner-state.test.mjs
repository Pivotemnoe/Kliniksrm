import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source=await readFile(new URL('../apps/owner-gateway/public/pet-hotel.js',import.meta.url),'utf8');
const application=source.replace(/\nvoid start\(\);\s*$/,'');
assert.notEqual(application,source,'The harness must disable only automatic page startup.');
const base='/v1/portal/pet-hotel';
const stateKey='hotel-owner-state-pending-v1';
const mutationKey='hotel-owner-pending-v1';

function fixture({delay=0}={}){
  const clock={now:0},storage=new Map(),calls=[],operations=new Map();
  const backend={owner:'owner-a',delay,loseBeforePost:false,loseAfterPost:false,terminal:null,onDone:null,onPost:null};
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
  const present=operation=>{
    const done=clock.now>=operation.readyAt;
    const result={id:operation.id,status:backend.terminal||(done?'DONE':'PENDING'),result:operation.result,error:backend.terminal?'Test terminal error':null};
    if(result.status==='DONE')backend.onDone?.(operation);
    return response(result);
  };
  const fetch=async(path,options={})=>{
    const body=options.body===undefined?undefined:JSON.parse(options.body);
    calls.push({path,body,owner:backend.owner});
    if(path===base+'/session')return response({ownerKey:backend.owner});
    if(path==='/v1/portal/logout')return response({});
    if(path===base+'/operations'&&body){
      backend.onPost?.(body);
      if(backend.loseBeforePost){backend.loseBeforePost=false;throw new TypeError('POST response lost before acceptance');}
      const key=backend.owner+':'+body.clientKey;
      let operation=operations.get(key);
      if(!operation){
        operation={id:'operation-'+(operations.size+1),owner:backend.owner,clientKey:body.clientKey,kind:body.kind,readyAt:clock.now+backend.delay,result:body.kind==='STATE'?{owner:{fullName:backend.owner},animals:[],bookings:[],selfBookingEnabled:false}:{saved:true}};
        operations.set(key,operation);
      }
      if(backend.loseAfterPost){backend.loseAfterPost=false;throw new TypeError('POST response lost after acceptance');}
      return present(operation);
    }
    if(path.startsWith(base+'/operations/')){
      const byKey=path.startsWith(base+'/operations/by-key/');
      const value=decodeURIComponent(path.split('/').at(-1));
      const operation=byKey?operations.get(backend.owner+':'+value):[...operations.values()].find(o=>o.id===value&&o.owner===backend.owner);
      return operation?present(operation):response({message:'Not found'},404);
    }
    throw new Error('Unexpected endpoint '+path);
  };
  function page(){
    const app={innerHTML:'',querySelectorAll:()=>[]};
    const nodes=new Map([['#hotel-owner-app',app],['#logout',{hidden:true}],['#refresh',{}],['#add-pet',{}]]);
    const location={hash:'',assigned:null,assign(value){this.assigned=value;}};
    class FakeDate extends Date{static now(){return clock.now;}}
    const context=vm.createContext({
      document:{querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[]},location,
      history:{replaceState(){}},URLSearchParams,Intl,Date:FakeDate,crypto:{randomUUID},fetch,
      AbortSignal:{timeout:()=>undefined},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
      setTimeout:(callback,ms)=>{clock.now+=ms;queueMicrotask(callback);return 1;},setInterval:()=>1,clearInterval(){}
    });
    vm.runInContext(application,context);
    const api=vm.runInContext('({command,start,setOwner:value=>{ownerKey=value;}})',context);
    api.setOwner(backend.owner);
    return {...api,app,nodes,location};
  }
  return {clock,storage,calls,operations,backend,page,posts:()=>calls.filter(c=>c.body?.kind)};
}

for(const delay of [26000,61000])test(`STATE completes after ${delay/1000}s without a false connection error`,async()=>{
  const f=fixture({delay});
  const result=await f.page().command('STATE');
  assert.equal(result.owner.fullName,'owner-a');
  assert.ok(f.clock.now>=delay);
  assert.equal(f.posts().length,1);
  assert.equal(f.storage.has(stateKey),false);
});

test('lost accepted POST response survives page reload and returns the ready result using the same key',async()=>{
  const f=fixture({delay:26000});f.backend.loseAfterPost=true;
  await assert.rejects(f.page().command('STATE'),/POST response lost/);
  const saved=JSON.parse(f.storage.get(stateKey));
  f.clock.now=30000;
  const result=await f.page().command('STATE');
  assert.equal(result.owner.fullName,'owner-a');
  assert.equal(f.posts().length,1);
  assert.equal(f.operations.size,1);
  assert.ok(f.calls.some(c=>c.path===base+'/operations/by-key/'+saved.clientKey));
  assert.equal(f.storage.has(stateKey),false);
});

test('when POST never reached the server, retry submits the original key after an owner-scoped 404',async()=>{
  const f=fixture();f.backend.loseBeforePost=true;
  await assert.rejects(f.page().command('STATE'),/POST response lost/);
  await f.page().command('STATE');
  assert.equal(f.posts().length,2);
  assert.equal(f.posts()[0].body.clientKey,f.posts()[1].body.clientKey);
  assert.equal(f.operations.size,1);
});

test('a prolonged pending STATE retains its key; later reload resumes it without creating another operation',async()=>{
  const f=fixture({delay:Infinity});
  await assert.rejects(f.page().command('STATE'),/Данные кабинета ещё загружаются/);
  assert.ok(f.clock.now>=90000&&f.clock.now<92000);
  const pending=JSON.parse(f.storage.get(stateKey));
  const operation=[...f.operations.values()][0];operation.readyAt=f.clock.now;
  await f.page().command('STATE');
  assert.equal(operation.clientKey,pending.clientKey);
  assert.equal(f.posts().length,1);
  assert.equal(f.storage.has(stateKey),false);
});

test('another owner never queries or consumes the previous owner pending STATE',async()=>{
  const f=fixture();f.backend.loseAfterPost=true;
  await assert.rejects(f.page().command('STATE'),/POST response lost/);
  const previous=JSON.parse(f.storage.get(stateKey));
  f.backend.owner='owner-b';const firstCall=f.calls.length;
  const result=await f.page().command('STATE');
  assert.equal(result.owner.fullName,'owner-b');
  assert.notEqual(f.posts()[1].body.clientKey,previous.clientKey);
  assert.ok(!f.calls.slice(firstCall).some(c=>c.path.includes(previous.clientKey)));
});

test('owner change during a delayed read discards its result and preserves the new owner pending key',async()=>{
  const f=fixture({delay:800}),page=f.page();
  const replacement={ownerKey:'owner-b',clientKey:randomUUID()};
  f.backend.onDone=()=>{page.setOwner('owner-b');f.storage.set(stateKey,JSON.stringify(replacement));};
  await assert.rejects(page.command('STATE'),error=>error.status===401);
  assert.equal(f.storage.get(stateKey),JSON.stringify(replacement));
});

test('STATE recovery does not consume or overwrite a pending booking',async()=>{
  const f=fixture({delay:Infinity}),page=f.page();
  const input={offerToken:'qa-offer',animalId:'qa-pet',contactConsent:true,bookingConsent:true};
  await assert.rejects(page.command('BOOK',input),/CRM ещё проверяет запрос/);
  assert.equal(f.clock.now,20000,'Existing mutation polling remains unchanged.');
  const booking=f.storage.get(mutationKey);
  f.backend.delay=0;await page.command('STATE');
  assert.equal(f.storage.get(mutationKey),booking);
  assert.equal(f.posts().filter(c=>c.body.kind==='BOOK').length,1);
  assert.deepEqual(f.posts()[0].body.input,input);
});

test('a completed mutation invalidates an older pending read before loading current history',async()=>{
  const f=fixture(),page=f.page();f.backend.loseAfterPost=true;
  await assert.rejects(page.command('STATE'),/POST response lost/);
  const oldKey=JSON.parse(f.storage.get(stateKey)).clientKey;
  await page.command('BOOK',{offerToken:'qa-offer',animalId:'qa-pet',contactConsent:true,bookingConsent:true});
  assert.equal(f.storage.has(stateKey),false);
  await page.command('STATE');
  const reads=f.posts().filter(c=>c.body.kind==='STATE');
  assert.equal(reads.length,2);assert.notEqual(reads[1].body.clientKey,oldKey);
});

test('terminal STATE failure clears only that read and allows a new request',async()=>{
  const f=fixture();f.backend.terminal='FAILED';
  f.storage.set(mutationKey,'preserve-booking');
  await assert.rejects(f.page().command('STATE'),/Test terminal error/);
  assert.equal(f.storage.has(stateKey),false);
  assert.equal(f.storage.get(mutationKey),'preserve-booking');
  f.backend.terminal=null;await f.page().command('STATE');
  assert.equal(f.posts().length,2);
  assert.notEqual(f.posts()[0].body.clientKey,f.posts()[1].body.clientKey);
});

test('startup explains confirmed login while data loads; logout clears both separate pending keys',async()=>{
  const f=fixture({delay:26000}),page=f.page();
  let loading;
  f.backend.onPost=()=>{loading=page.app.innerHTML;};
  await page.start();
  assert.match(loading,/Вход подтверждён/);assert.match(loading,/role="status"/);
  assert.match(page.app.innerHTML,/Проживание/);
  f.storage.set(stateKey,JSON.stringify({ownerKey:'owner-a',clientKey:randomUUID()}));
  f.storage.set(mutationKey,'preserve-until-logout');
  await page.nodes.get('#logout').onclick();
  assert.equal(f.storage.has(stateKey),false);assert.equal(f.storage.has(mutationKey),false);
  assert.equal(page.location.assigned,'/portal/pet-hotel');
});
