import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {ValidationPipe}=require('@nestjs/common');
const {LaboratoryService}=require('../apps/api/dist/modules/laboratory/laboratory.service.js');
const {UpdateLaboratoryOrderResultsDto:Dto}=require('../apps/api/dist/modules/laboratory/dto/update-laboratory-order-results.dto.js');
const id='fe9cbc97-363f-4ba1-afea-fa08b1149719';

function fixture(){
  let state={order:{id:'order',visitId:'visit',status:'IN_PROGRESS',visit:{status:'COMPLETED'},formSnapshots:[{original:true}]},items:[
    {id:'a',orderId:'order',title:'A',status:'COMPLETED',resultValue:'123',resultText:null,unit:'u',referenceRange:'1–2',testId:'test',billItemId:'bill',files:[{id:'file'}]},
    {id:'b',orderId:'order',title:'B',status:'ORDERED',resultValue:null,resultText:null,files:[]},
    {id:'foreign',orderId:'other',title:'Other',status:'ORDERED',files:[]},
  ]};
  const audit=[];
  const getOrder=()=>({...state.order,items:state.items.filter(i=>i.orderId==='order')});
  const tx={
    laboratoryOrder:{findUnique:async()=>getOrder(),findUniqueOrThrow:async()=>getOrder(),update:async({data})=>Object.assign(state.order,data)},
    laboratoryOrderItem:{
      update:async({where,data})=>Object.assign(state.items.find(i=>i.id===where.id),data),
      create:async({data})=>{if(state.items.some(i=>i.id===data.id))throw Error('Unique id conflict');const item={files:[],...data};state.items.push(item);return item;},
    },
    $queryRaw:async()=>[],
  };
  const p={...tx,$transaction:async fn=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}}};
  return {service:new LaboratoryService(p,{log:async e=>audit.push(e)}),state:()=>state,audit};
}

test('add and remove rows in the same order; retain removed values, attachment and bill link',async()=>{
  const f=fixture();
  const dto={items:[{itemId:'b',resultValue:'2',status:'COMPLETED'}],removedItemIds:['a'],addedItems:[{itemId:id,title:' Extra ',code:'X',unit:'u',referenceRange:'0–3',resultValue:'1,5',status:'COMPLETED'}]};
  const result=await f.service.updateOrderResults('order',dto,'doctor');
  assert.equal(result.status,'COMPLETED');assert.equal(result.items.length,3);
  const removed=result.items.find(i=>i.id==='a');
  assert.equal(removed.status,'CANCELLED');assert.equal(removed.resultValue,'123');assert.equal(removed.billItemId,'bill');assert.equal(removed.files[0].id,'file');
  const extra=result.items.find(i=>i.id===id);assert.equal(extra.title,'Extra');assert.equal(extra.billItemId,undefined);assert.equal(extra.testId,undefined);
  assert.deepEqual(result.formSnapshots,[{original:true}]);
  assert.equal(f.audit[0].metadata.removedItems[0].resultValue,'123');
  await f.service.updateOrderResults('order',dto,'doctor');
  assert.equal(f.state().items.filter(i=>i.id===id).length,1,'retry must not duplicate a new row');
});
test('foreign rows, duplicates, empty names, last-row removal and cancelled orders fail without changes',async()=>{
  for(const dto of [
    {items:[{itemId:'foreign',resultValue:'bad'}]},
    {items:[],removedItemIds:['foreign']},
    {items:[{itemId:'a'}],removedItemIds:['a']},
    {items:[],addedItems:[{itemId:id,title:'  '}]},
    {items:[],removedItemIds:['a','b']},
    {items:[],addedItems:[{itemId:id,title:'New',status:'COMPLETED'}]},
  ]) {
    const f=fixture(),before=structuredClone(f.state());
    await assert.rejects(f.service.updateOrderResults('order',dto,'doctor'));
    assert.deepEqual(f.state(),before);assert.equal(f.audit.length,0);
  }
  for(const target of ['order','visit']){
    const f=fixture();if(target==='order')f.state().order.status='CANCELLED';else f.state().order.visit.status='CANCELLED';
    await assert.rejects(f.service.updateOrderResults('order',{items:[],addedItems:[{itemId:id,title:'New'}]},'doctor'));
  }
});
test('a conflicting addition rolls back earlier result edits and removals',async()=>{
  const f=fixture(),before=structuredClone(f.state());
  await assert.rejects(f.service.updateOrderResults('order',{items:[{itemId:'b',resultValue:'changed'}],removedItemIds:['a'],addedItems:[{itemId:'foreign',title:'New'}]},'doctor'),/conflict/);
  assert.deepEqual(f.state(),before);
});
test('addition without a result reopens completed order; removed row cannot be edited',async()=>{
  const f=fixture();await f.service.updateOrderResults('order',{items:[{itemId:'b',status:'COMPLETED',resultValue:'2'}]},'doctor');
  assert.equal(f.state().order.status,'COMPLETED');
  await f.service.updateOrderResults('order',{items:[],removedItemIds:['a'],addedItems:[{itemId:id,title:'New'}]},'doctor');
  assert.equal(f.state().order.status,'IN_PROGRESS');
  await assert.rejects(f.service.updateOrderResults('order',{items:[{itemId:'a',status:'COMPLETED',resultValue:'bad'}]},'doctor'),/Удалённый/);
});
test('real DTO accepts new/deleted rows but preserves field, UUID and result validation',async()=>{
  const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true});
  const valid={items:[],addedItems:[{itemId:id,title:'Manual',referenceRange:'1,0–2,0'}]};
  assert.equal((await pipe.transform(valid,{type:'body',metatype:Dto})).addedItems[0].title,'Manual');
  for(const body of [{items:[],removedItemIds:['wrong']},{items:[],addedItems:[{itemId:id,title:'',billItemId:id}]},{items:[],addedItems:Array(101).fill(valid.addedItems[0])}]) await assert.rejects(pipe.transform(body,{type:'body',metatype:Dto}));
});
