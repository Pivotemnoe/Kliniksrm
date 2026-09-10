import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {publishDiagnostic}=createRequire(import.meta.url)('../scripts/system-diagnostics-notify.cjs');
const report={state:'warning',checkedAt:'2026-09-10T08:00:00Z',expectedRevision:'a'.repeat(40),issues:[{code:'version.api',message:'API version mismatch'}],event:{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',recovery:false}};
test('diagnostic notification targets directors only and records a system audit',async()=>{
  const writes=[]; const tx={newsPost:{findUnique:async()=>null,create:async x=>writes.push(x)},auditLog:{create:async x=>writes.push(x)}};
  await publishDiagnostic({$transaction:fn=>fn(tx)},report);
  assert.deepEqual(writes[0].data.audienceRoleCodes,['director']); assert.equal(writes[0].data.createdById,undefined); assert.equal(writes[1].data.action,'system.diagnostics.notification');
});
test('retry is idempotent and does not generate duplicate news',async()=>{
  const result=await publishDiagnostic({$transaction:fn=>fn({newsPost:{findUnique:async()=>({id:report.event.id}),create:()=>assert.fail()}})},report);
  assert.equal(result.duplicate,true);
});
test('recovery includes the missed incident and does not masquerade as a fresh failure',async()=>{
  let data; await publishDiagnostic({$transaction:fn=>fn({newsPost:{findUnique:async()=>null,create:async x=>{data=x.data;}},auditLog:{create:async()=>{}}})},{...report,state:'ok',issues:[],event:{...report.event,recovery:true,previousIssues:report.issues}});
  assert.equal(data.priority,'INFO'); assert.match(data.body,/API version mismatch/);
});
test('malformed diagnostic input cannot write a notification',async()=>{
  await assert.rejects(publishDiagnostic({$transaction:()=>assert.fail()},{...report,event:{id:'bad'}}));
});
