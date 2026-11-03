import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {avitoFixture} from './helpers/avito-fixture.mjs';
const require=createRequire(import.meta.url);
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');

test('natural replies preserve the durable outbox, source checks, takeover and unanswered message context',{skip:!process.env.AVITO_QA_DATABASE_URL},async t=>{
 const f=await avitoFixture(),{prisma,service,api,model,actorId}=f,suffix=randomUUID().slice(0,8);
 const i=await prisma.clinicModuleInstallation.findUniqueOrThrow({where:{id:f.integration.installationId}});
 const g=await prisma.clinicModuleInstallation.upsert({where:{organizationId_moduleKey:{organizationId:i.organizationId,moduleKey:'GROOMING'}},create:{organizationId:i.organizationId,moduleKey:'GROOMING',enabled:true},update:{enabled:true}});
 await prisma.groomingSettings.upsert({where:{installationId:g.id},create:{installationId:g.id,selfBookingEnabled:false},update:{selfBookingEnabled:false}});
 for(const row of groomingPriceEntries())await prisma.groomingService.upsert({where:{installationId_catalogKey:{installationId:g.id,catalogKey:row.catalogKey}},create:{installationId:g.id,...row},update:{...row,isActive:true}});
 const configured=model.configured,classify=model.classify,compose=model.compose;
 model.configured=()=>true;model.classify=async()=>({action:'OTHER',knowledgeId:null,serviceQuery:null});
 service.now=()=>new Date('2026-11-03T18:34:54Z');
 const before=await service.integration();await service.updateSettings({version:before.settingsVersion,settings:{...before.settings,mode:'AUTO',profiles:before.settings.profiles.map(p=>({...p,enabled:p.direction==='GROOMING'}))}},actorId);
 const load=async id=>{await service.syncChat(id);return prisma.avitoConversation.findUniqueOrThrow({where:{integrationId_externalChatId:{integrationId:f.integration.id,externalChatId:id}},include:{outbox:{orderBy:{createdAt:'desc'}}}});};
 const text='Добрый вечер, подскажите пожалуйста примерную стоимость комплексного ухода для собачки породы помапу ?';
 try{
  await t.test('real flow collects unknown breed, uses the model and sends only once',async()=>{
   const id='groom-natural-'+suffix;api.add(id,'initial',text);let c=await load(id);let calls=0;
   assert.equal(c.mode,'BOT');assert.equal(c.contact.groomingPriceContext.unlistedBreed,'помапу');assert.ok(c.outbox[0].replyContext.groomingAiPlan);
   model.compose=async(_key,_profile,request,facts)=>{calls++;assert.ok(request.includes('помапу'));assert.equal(facts.knownPet.species,'DOG');assert.equal(facts.administrator.nextDay,'TOMORROW');return 'Стоимость ухода для помапу уточнит администратор завтра после 09:00. Подскажите вес и возраст собачки, пожалуйста.';};
   await service.deliver(c.outbox[0].id);await service.deliver(c.outbox[0].id);assert.equal(calls,1);assert.equal(api.sent.filter(m=>m.chatId===id).length,1);
   c=await load(id);assert.equal(c.outbox[0].status,'SENT');assert.equal(c.outbox[0].replyContext.groomingAiStatus,'MODEL');assert.match(api.sent.find(m=>m.chatId===id).text,/помапу/);
   api.add(id,'details','Весит 3 кг, ей 2 года');c=await load(id);assert.doesNotMatch(c.outbox[0].text,/сколько весит|какой.{0,15}возраст|Какой породы|Кого планируете/iu);assert.equal(c.contact.groomingPriceContext.weightKg,'3');assert.equal(c.contact.groomingPriceContext.age,'2 года');
  });
  await t.test('a model timeout falls back to a relevant answer and never leaves the query unanswered',async()=>{
   const id='groom-fallback-'+suffix;api.add(id,'fallback',text);const c=await load(id);model.compose=async()=>null;await service.deliver(c.outbox[0].id);
   const sent=api.sent.filter(m=>m.chatId===id);assert.equal(sent.length,1);assert.match(sent[0].text,/помапу/);assert.match(sent[0].text,/завтра после 09:00/);assert.doesNotMatch(sent[0].text,/Кого планируете|Какой породы/);
  });
  await t.test('staff takeover during model generation cancels the outgoing reply',async()=>{
   const id='groom-takeover-ai-'+suffix;api.add(id,'takeover',text);const c=await load(id);
   model.compose=async()=>{const latest=await prisma.avitoConversation.findUniqueOrThrow({where:{id:c.id}});await service.setMode(c.id,{mode:'HUMAN',version:latest.version},actorId);return 'Подскажите вес и возраст собачки.';};
   const count=api.sent.length;await service.deliver(c.outbox[0].id);assert.equal(api.sent.length,count);assert.equal((await prisma.avitoOutgoingOperation.findUniqueOrThrow({where:{id:c.outbox[0].id}})).status,'CANCELLED');
  });
  await t.test('a changed price during generation cancels stale AI text before transport',async()=>{
   const id='groom-price-ai-'+suffix;api.add(id,'price','Сколько полный комплекс йорку?');const c=await load(id),row=await prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:g.id,catalogKey:'dog:york:full'}}});
   model.compose=async()=>{await prisma.groomingService.update({where:{id:row.id},data:{price:3100,version:{increment:1}}});return 'Полный комплекс — 2 500 ₽.';};
   try{const count=api.sent.length;await service.deliver(c.outbox[0].id);assert.equal(api.sent.length,count);assert.equal((await prisma.avitoOutgoingOperation.findUniqueOrThrow({where:{id:c.outbox[0].id}})).status,'CANCELLED');}
   finally{await prisma.groomingService.update({where:{id:row.id},data:{price:row.price,version:{increment:1}}});}
  });
  await t.test('a price and arrival question split before delivery remain in the AI request',async()=>{
   const id='groom-ai-multipart-'+suffix;api.add(id,'a','Сколько полный комплекс йорку?');await load(id);api.add(id,'b','И когда можно приехать?');const c=await load(id);
   model.compose=async(_key,_profile,request,facts)=>{assert.match(request,/полный комплекс йорку/);assert.match(request,/когда можно приехать/);assert.match(facts.approvedReply,/2\s*500/);assert.match(facts.approvedReply,/время.*администратор/isu);return facts.approvedReply;};
   await service.deliver(c.outbox[0].id);assert.equal(api.sent.filter(m=>m.chatId===id).length,1);
  });
 }finally{model.configured=configured;model.classify=classify;model.compose=compose;const live=await service.integration();await service.updateSettings({version:live.settingsVersion,settings:before.settings},actorId);await prisma.$disconnect();}
});
