import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { AvitoAssistantModel } = require('../apps/owner-gateway/dist/avito-assistant.model.js');
const { validateAvitoCopyInput } = require('../apps/owner-gateway/dist/avito-copy.contract.js');
const { ClinicAssistantOpenAiClient } = require('../apps/owner-gateway/dist/clinic-assistant-openai.client.js');
const { AvitoAssistantService } = require('../apps/owner-gateway/dist/avito-assistant.service.js');
const { AvitoAssistantController } = require('../apps/owner-gateway/dist/avito-assistant.controller.js');
const { AvitoModelGatewayClient } = require('../apps/api/dist/modules/avito/avito-model-gateway.client.js');
const input = () => ({ clientKey: createHash('sha256').update(randomUUID()).digest('hex'), direction: 'CLINIC', brief: 'Понятно объяснить услугу', rules: 'Без неподтверждённых обещаний', facts: { serviceTitle: 'Тестовая вакцинация', priceText: '1 300 ₽', officeName: 'Тестовый филиал', address: 'Тестовый адрес' } });
function env(values) { const prev = Object.fromEntries(Object.keys(values).map(k => [k,process.env[k]])); Object.assign(process.env,values); return () => { for(const [k,v] of Object.entries(prev)) if(v===undefined)delete process.env[k];else process.env[k]=v; }; }

test('copy uses the existing clinic transport, strict output and confirmed CRM facts, with no tools or publication route', async () => {
  const restore = env({ AVITO_ASSISTANT_MODEL_ENABLED:'true', AVITO_ASSISTANT_OPENAI_MODEL:'gpt-6-luna', CLINIC_ASSISTANT_OPENAI_BASE_URL:'https://synthetic-gateway.example/v1', CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN:'synthetic-token-only' }); const oldFetch=global.fetch;
  try {
    const data=validateAvitoCopyInput(input()); const model=new AvitoAssistantModel(new ClinicAssistantOpenAiClient()); const prepared=model.prepareCopy(data); const body=JSON.parse(prepared.serialized);
    assert.equal(body.store,false); assert.equal(body.response_format.json_schema.name,'avito_ad_copy'); assert.deepEqual(body.response_format.json_schema.schema.required,['title','description']); assert.equal('tools' in body,false); assert.equal(body.model,'gpt-6-luna'); assert.match(body.messages[1].content,/1 300/);
    global.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'Тестовая вакцинация',description:'Напишите в Авито, администратор уточнит детали.'})}}],usage:{prompt_tokens:100,completion_tokens:30}});
    assert.equal((await model.copy(data,prepared)).result.title,'Тестовая вакцинация');
    global.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'x',description:'y',publish:true})}}]}); await assert.rejects(()=>model.copy(data,prepared),/INVALID_RESULT/);
    assert.throws(()=>validateAvitoCopyInput({...data,facts:{...data.facts,secret:'bad'}}));
    process.env.AVITO_ASSISTANT_MODEL_ENABLED='false'; assert.throws(()=>model.prepareCopy(data),/DISABLED/);
  } finally { restore();global.fetch=oldFetch; }
});
test('copy controller requires the shared secret and its channel switch; CRM adapter sends only server-selected facts',async()=>{
 const restore=env({OWNER_GATEWAY_SYNC_SECRET:'synthetic-sync-secret-only',AVITO_ASSISTANT_MODEL_ENABLED:'false',AVITO_AI_ENABLED:'true',OWNER_GATEWAY_URL:'https://synthetic-gateway.example'}); const oldFetch=global.fetch;let calls=0;
 try{
  const controller=new AvitoAssistantController({copy:()=>{calls++;}});assert.throws(()=>controller.copy('wrong',input()));assert.throws(()=>controller.copy('synthetic-sync-secret-only',input()));assert.equal(calls,0);
  global.fetch=async(url,options)=>{calls++;assert.match(url,/\/internal\/v1\/avito\/copy$/);assert.equal(options.redirect,'manual');const data=JSON.parse(options.body);assert.ok(!data.brief.includes('900 111'));assert.deepEqual(Object.keys(data.facts).sort(),['address','officeName','priceText','serviceTitle']);return Response.json({title:'Тестовая вакцинация',description:'Организационные вопросы и заявка администратору.'});};
  const facts={service:{id:'service-1',title:'Тестовая вакцинация',priceText:'1 300 ₽'},office:{id:'office-1',name:'Тест',address:'Адрес',phone:'+7 900 000-00-00'}};
  const result=await new AvitoModelGatewayClient().generateCopy(randomUUID(),'CLINIC','Позвоните +7 900 111-22-33','Правила',facts);assert.equal(result.title,'Тестовая вакцинация');assert.equal(calls,1);
 }finally{restore();global.fetch=oldFetch;}
});
test('ad copy shares durable Avito spending limits, caches success and does not repeat an ambiguous paid request',{skip:!process.env.AVITO_GATEWAY_QA_DATABASE_URL},async()=>{
 const url=process.env.AVITO_GATEWAY_QA_DATABASE_URL;assert.match(url,/^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/avito_merge_gateway_qa_20261020(?:\?|$)/);const{PrismaClient}=require('../apps/owner-gateway/dist/generated/client');const prisma=new PrismaClient({datasources:{db:{url}}});let calls=0;
 const restore=env({AVITO_ASSISTANT_MODEL_DAILY_MICRO_USD:'1000000',AVITO_ASSISTANT_MODEL_MONTHLY_MICRO_USD:'10000000'});
 const model={prepareCopy:()=>({model:'synthetic-copy',reservedMicroUsd:100}),copy:async()=>{calls++;return{result:{title:'Тест',description:'Описание'},chargedMicroUsd:10};}};const service=new AvitoAssistantService(prisma,model);
 try{const data=input();await service.copy(data);await service.copy(data);assert.equal(calls,1);await assert.rejects(()=>service.copy({...data,brief:'Изменённый текст'}),/уже использован/);model.copy=async()=>{calls++;throw Error('synthetic timeout');};const ambiguous=input();await assert.rejects(()=>service.copy(ambiguous));await assert.rejects(()=>service.copy(ambiguous));assert.equal(calls,2);process.env.AVITO_ASSISTANT_MODEL_DAILY_MICRO_USD='0';await assert.rejects(()=>service.copy(input()),/Лимит/);assert.equal(calls,2);}finally{restore();await prisma.$disconnect();}
});
