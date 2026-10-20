import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { avitoFixture } from './helpers/avito-fixture.mjs';
const require=createRequire(import.meta.url);
const { parseProgrammeTable, programmePriceAnswer }=require('../apps/api/dist/modules/avito/avito-programmes.js');
const { AvitoCrmKnowledgeService }=require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
const { parseAvitoSettings, defaultAvitoSettings }=require('../apps/api/dist/modules/avito/avito.settings.js');
const { listingIssues, parseListingContent, factsHash }=require('../apps/api/dist/modules/avito/avito-editor.policy.js');
const table=JSON.parse(readFileSync('docs/plans/2026-10-19-avito-clinic-pilot.json')).settings.clinicProgrammeTable;
const clean=text=>text.replace(/\s/g,' ');
test('approved table keeps ordinary and discounted prices as distinct validated fields',()=>{
 assert.deepEqual(parseProgrammeTable(table),table);
 const settings=defaultAvitoSettings();settings.clinicProgrammeTable=table;assert.deepEqual(parseAvitoSettings(settings).clinicProgrammeTable,table);
 for(const mutate of [t=>t.prices[0].discountedPrice=99999,t=>t.prices[0].regularPrice=0,t=>t.prices.push(t.prices[0]),t=>t.source='CLIENT_MESSAGE']){
  const changed=structuredClone(table);mutate(changed);assert.throws(()=>parseProgrammeTable(changed));
 }
});
test('all eight programme variants quote both exact table prices without applying night arithmetic',()=>{
 for(const row of table.prices){
  const input=`Стоимость диспансеризации ${row.species==='CAT'?'кошки':'собаки'} ${row.programme==='STANDARD'?'стандартной':'расширенной'} ${row.laboratory==='CLINIC'?'в клинике':'с Инвитро'}`;
  const reply=clean(programmePriceAnswer(input,table).text);
  assert.ok(reply.includes(new Intl.NumberFormat('ru-RU').format(row.regularPrice).replace(/\s/g,' ')),reply);
  assert.ok(reply.includes(new Intl.NumberFormat('ru-RU').format(row.discountedPrice).replace(/\s/g,' ')),reply);
  assert.match(reply,/обычная цена/);assert.match(reply,/скидкой для всех/);
 }
});
test('approved table works independently of CRM price reads and never replaces a named other service',async()=>{
 let reads=0;const crm=new AvitoCrmKnowledgeService({service:{findMany:async()=>{reads++;return [{title:'Рентген',priceType:'FIXED',price:690}];}}});
 const programme=await crm.answer('org','Сколько стоит стандартная диспансеризация кошки в клинике?',undefined,'Диспансеризация',undefined,undefined,{note:'С 20:00 до 08:00 действует двойной ночной тариф.',programmeTable:table});
 assert.equal(reads,0);assert.match(clean(programme.text),/5 300.*4 700/);assert.match(programme.text,/двойной/);assert.ok(!/9.?400/.test(programme.text));
 const xray=await crm.answer('org','Сколько стоит рентген?',undefined,'Диспансеризация',undefined,undefined,{note:'',programmeTable:table});assert.equal(reads,1);assert.match(xray.text,/690/);assert.ok(!/скидк/.test(xray.text));
 const followup=await crm.answer('org','Сколько стоит?',undefined,'Диспансеризация',undefined,undefined,{note:'',programmeTable:table,petSpecies:'DOG'});assert.match(clean(followup.text),/5 550.*4 700/);
});
test('editor validates programme prices against the approved table and invalidates approval if the table changes',()=>{
 const content=parseListingContent({title:'Диспансеризация',description:'Обычная цена 5 300 ₽, со скидкой для всех 4 700 ₽.',photoIds:['photo']});
 const facts={service:null,office:{id:'office',name:'Внутренний офис',address:'Тестовый адрес',phone:null},programmeTable:{...table,priceText:'от 4 700 ₽ со скидкой для всех'}};
 assert.deepEqual(listingIssues(content,facts).errors,[]);assert.equal(listingIssues(content,facts).warnings.length,0);
 assert.ok(listingIssues({...content,description:'Цена 9 999 ₽'},facts).errors.length>0);
 const changed=structuredClone(facts);changed.programmeTable.prices[0].discountedPrice=4600;assert.notEqual(factsHash(changed),factsHash(facts));
});
test('queued programme prices are checked again before automatic delivery',async()=>{
 const f=await avitoFixture();
 const office=await f.prisma.clinicOffice.create({data:{organizationId:'avito-qa-org',name:'Programme QA phone',phone:'+79990000011'}});
 try{
  const settings={...f.settings,mode:'AUTO',administratorSchedule:{...f.settings.administratorSchedule,officeId:office.id},clinicProgrammeTable:table,listings:[{id:'101',title:'Диспансеризация',direction:'CLINIC',enabled:true,crmQuery:'Диспансеризация'}]};
  await f.service.updateSettings({version:f.integration.settingsVersion,settings},f.actorId);
  await f.prisma.clinicModuleInstallation.update({where:{id:f.integration.installationId},data:{enabled:true,enabledAt:new Date(Date.now()-60000)}});
  const chat='programme-revalidation-'+Date.now();f.api.add(chat,'programme-price','Сколько стоит стандартная диспансеризация кошки в клинике?');await f.service.syncChat(chat);
  const c=await f.prisma.avitoConversation.findUniqueOrThrow({where:{integrationId_externalChatId:{integrationId:f.integration.id,externalChatId:chat}}});
  const op=await f.prisma.avitoOutgoingOperation.findFirstOrThrow({where:{conversationId:c.id,status:'PENDING'}});assert.match(clean(op.text),/5 300.*4 700/);
  const changed=structuredClone(settings);changed.clinicProgrammeTable.prices[0].discountedPrice=4600;
  await f.prisma.avitoIntegration.update({where:{id:f.integration.id},data:{settings:changed}});
  await f.service.deliver(op.id);const stored=await f.prisma.avitoOutgoingOperation.findUniqueOrThrow({where:{id:op.id}});assert.equal(stored.status,'CANCELLED');assert.equal(f.api.sent.length,0);
 }finally{await f.prisma.clinicOffice.delete({where:{id:office.id}});await f.prisma.$disconnect();}
});
