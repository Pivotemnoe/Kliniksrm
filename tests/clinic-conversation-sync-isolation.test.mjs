import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ClinicConversationSyncService } from '../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js';
test('one rejected conversation never blocks another contact or its acknowledgment',async t=>{
 const old=process.env.CLINIC_ASSISTANT_ENABLED;process.env.CLINIC_ASSISTANT_ENABLED='true';t.after(()=>old===undefined?delete process.env.CLINIC_ASSISTANT_ENABLED:process.env.CLINIC_ASSISTANT_ENABLED=old);
 const sync=new ClinicConversationSyncService({});const acknowledgments=[];
 sync.flush=async()=>{};
 sync.gateway=async(path,body)=>{if(path==='/pending')return{items:[{id:'legacy-invalid',sequence:1},{id:'consented-contact',sequence:2}]};acknowledgments.push({path,body});return{ok:true};};
 sync.importConversation=async item=>{if(item.id==='legacy-invalid')throw Error('legacy record rejected');return{id:'new-request'};};
 assert.deepEqual(await sync.syncNow(),{status:'partial',count:1,failed:1});
 assert.deepEqual(acknowledgments,[{path:'/consented-contact/ack',body:{sequence:2,crmRequestId:'new-request'}}]);
 assert.deepEqual(await sync.syncNow(),{status:'partial',count:1,failed:1});
});
