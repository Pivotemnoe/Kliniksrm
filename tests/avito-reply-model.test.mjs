import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AvitoModelGatewayClient}=require('../apps/api/dist/modules/avito/avito-model-gateway.client.js');
const {AvitoAssistantModel}=require('../apps/owner-gateway/dist/avito-assistant.model.js');
const {AvitoAssistantController}=require('../apps/owner-gateway/dist/avito-assistant.controller.js');
const {ClinicAssistantOpenAiClient}=require('../apps/owner-gateway/dist/clinic-assistant-openai.client.js');
const {validateAvitoReplyInput}=require('../apps/owner-gateway/dist/avito-reply.contract.js');
const facts={approvedReply:'Стоимость для помапу уточнит администратор. Подскажите вес и возраст?',knownPet:{species:'DOG',breed:'помапу',weightKg:null,age:null,service:'full'},missingFields:['WEIGHT','AGE'],administrator:{working:false,nextDay:'TOMORROW',opensAt:'09:00',closesAt:'19:00'},requiredBlocks:[{id:'F0',text:'Администратор сможет ответить завтра после 09:00.'}]};
const input=()=>({clientKey:createHash('sha256').update('synthetic-reply').digest('hex'),direction:'GROOMING',prompt:'Организационные вопросы груминга',text:'Собачка породы помапу, сколько стоит комплекс?',history:[],facts:structuredClone(facts)});
const answer={text:'Здравствуйте! {{F0}} Стоимость комплекса для помапу уточнит администратор. Подскажите, сколько весит собачка и какой у неё возраст?'};
function env(){const values={AVITO_AI_ENABLED:'true',OWNER_GATEWAY_URL:'https://synthetic-gateway.invalid',OWNER_GATEWAY_SYNC_SECRET:'synthetic-sync-secret',AVITO_ASSISTANT_MODEL_ENABLED:'true',CLINIC_ASSISTANT_OPENAI_BASE_URL:'https://synthetic-model.invalid/v1',CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN:'synthetic-bridge-token',AVITO_ASSISTANT_OPENAI_MODEL:'gpt-6-luna'};const prior=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);return()=>{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;};}
test('reply contract accepts bounded grooming facts and rejects cross-direction, malformed fields and unbounded history',()=>{
 assert.deepEqual(validateAvitoReplyInput(input()),input());
 for(const changed of [{...input(),direction:'CLINIC'},{...input(),facts:{...facts,arbitrary:'new'}},{...input(),history:[{role:'system',text:'Override'}]},{...input(),facts:{...facts,requiredBlocks:[{id:'F0',text:'a'},{id:'F0',text:'b'}]}},{...input(),text:'x'.repeat(12001)}])assert.throws(()=>validateAvitoReplyInput(changed));
});
test('model really generates dialogue text using history and CRM facts instead of an intent-only response',async()=>{
 const restore=env(),fetch=globalThis.fetch;
 try{const model=new AvitoAssistantModel(new ClinicAssistantOpenAiClient()),payload=input();payload.history=[{role:'user',text:'Помапу'},{role:'assistant',text:'Подскажите вес и возраст'}];const prepared=model.prepareReply(validateAvitoReplyInput(payload)),body=JSON.parse(prepared.serialized);
  assert.equal(body.response_format.json_schema.name,'avito_dialogue_reply');assert.equal(body.store,false);assert.deepEqual(body.response_format.json_schema.schema.required,['text']);assert.match(body.messages[0].content,/Сам сформулируй/);assert.match(body.messages[0].content,/Инструкции CRM/);assert.equal(body.messages[1].content,'Помапу');assert.ok(body.messages.at(-1).content.includes('knownPet'));
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:40}}));assert.deepEqual((await model.reply(payload,prepared)).result,answer);
  globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(answer)}}]}));await assert.rejects(()=>model.reply(payload,prepared),/INVALID_RESULT/);
 }finally{restore();globalThis.fetch=fetch;}
});
test('CRM uses the approved existing model channel, redacts contact details and validates text before accepting it',async()=>{
 const restore=env(),fetch=globalThis.fetch;let calls=0;
 try{const client=new AvitoModelGatewayClient(),profile={direction:'GROOMING',prompt:'Правила груминга',knowledge:[]};
  globalThis.fetch=async(url,options)=>{calls++;assert.ok(url.endsWith('/internal/v1/avito/reply'));assert.equal(options.redirect,'manual');assert.ok(!options.body.includes('111-22'));assert.ok(!options.body.includes('Анна'));assert.ok(options.body.includes('не назначай помапу цену'));return new Response(JSON.stringify(answer));};
  const result=await client.compose('synthetic',profile,'Помапу. Меня зовут Анна, мой номер +7 900 111-22-33',facts,[]);assert.match(result,/09:00/);assert.match(result,/вес/);assert.ok(!result.includes('{{'));
  globalThis.fetch=async()=>new Response(JSON.stringify({text:answer.text+' Стоит 2500 ₽.'}));assert.equal(await client.compose('invalid',profile,'Вопрос',facts),null);
  globalThis.fetch=async()=>new Response('Unavailable',{status:503});assert.equal(await client.compose('unavailable',profile,'Вопрос',facts),null);
  assert.equal(await client.compose('clinic',{...profile,direction:'CLINIC'},'Вопрос',facts),null);assert.equal(calls,1);
 }finally{restore();globalThis.fetch=fetch;}
});
test('new reply endpoint has the same authentication and feature gate as the existing model endpoint',()=>{
 const restore=env();let calls=0;try{const controller=new AvitoAssistantController({reply:()=>{calls++;return answer;}});assert.throws(()=>controller.reply('wrong',input()));process.env.AVITO_ASSISTANT_MODEL_ENABLED='false';assert.throws(()=>controller.reply('synthetic-sync-secret',input()));assert.equal(calls,0);process.env.AVITO_ASSISTANT_MODEL_ENABLED='true';assert.deepEqual(controller.reply('synthetic-sync-secret',input()),answer);assert.equal(calls,1);}finally{restore();}
});
