import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AvitoWorker}=require('../apps/api/dist/modules/avito/avito.worker.js');
function fixture(sync){
 const calls=[];let ticks=0;
 const worker=new AvitoWorker({tick:async()=>{ticks++},integration:async()=>({installation:{enabled:true},accountId:'367079428'}),sync:async offset=>{calls.push(offset);return sync(offset)}},{ingestionEnabled:()=>true,liveSendEnabled:()=>true});
 worker.schedule=()=>{};
 return {worker,calls,ticks:()=>ticks,poll:async()=>{worker.nextPoll=0;await worker.run()}};
}
test('a new enquiry is discovered on the next poll despite a long account history',async()=>{
 let incoming=false,seen=false;
 const f=fixture(offset=>{if(offset===0&&incoming)seen=true;return {nextOffset:offset<260?offset+20:null}});
 await f.poll();incoming=true;await f.poll();
 assert.equal(seen,true,'A new first-page enquiry must not wait for the 277-chat sweep');
 assert.ok(f.calls.includes(20),'Older chats should still be checked');
 assert.equal(f.ticks(),2);
});
test('older pages advance while every cycle still checks current enquiries',async()=>{
 const f=fixture(offset=>({nextOffset:offset<40?offset+20:null}));
 for(let i=0;i<4;i++)await f.poll();
 assert.equal(f.calls.filter(offset=>offset===0).length,4);
 assert.ok(f.calls.includes(20));assert.ok(f.calls.includes(40));
});
test('when the account fits on one page no obsolete history offset is requested',async()=>{
 let short=false;
 const f=fixture(offset=>({nextOffset:short?null:offset+20}));
 await f.poll();short=true;await f.poll();
 assert.deepEqual(f.calls,[0,0]);
});
