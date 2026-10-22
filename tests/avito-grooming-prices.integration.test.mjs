import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {avitoFixture} from './helpers/avito-fixture.mjs';
const require=createRequire(import.meta.url);
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');
const {loadPetServiceContext}=require('../apps/api/dist/modules/avito/avito-pet-services.js');
const clean=s=>s.replace(/\s/g,' ');

test('grooming prices read the current module and validate persisted replies before transport',{skip:!process.env.AVITO_QA_DATABASE_URL},async t=>{
 const f=await avitoFixture(),{prisma,service,api,actorId}=f,suffix=randomUUID().slice(0,8);
 const installation=await prisma.clinicModuleInstallation.findUniqueOrThrow({where:{id:f.integration.installationId}}),org=installation.organizationId;
 const grooming=await prisma.clinicModuleInstallation.upsert({where:{organizationId_moduleKey:{organizationId:org,moduleKey:'GROOMING'}},create:{organizationId:org,moduleKey:'GROOMING',enabled:true},update:{enabled:true}});
 await prisma.groomingSettings.upsert({where:{installationId:grooming.id},create:{installationId:grooming.id,selfBookingEnabled:false},update:{selfBookingEnabled:false}});
 for(const row of groomingPriceEntries())await prisma.groomingService.upsert({where:{installationId_catalogKey:{installationId:grooming.id,catalogKey:row.catalogKey}},create:{installationId:grooming.id,...row},update:{...row,isActive:true}});
 const clinical=await prisma.onlineAppointmentRequest.count(),reservations=await prisma.groomingReservation.count();
 const chat=prefix=>`groom-prices-${prefix}-${suffix}`;
 const load=async id=>{await service.syncChat(id);const c=await prisma.avitoConversation.findUniqueOrThrow({where:{integrationId_externalChatId:{integrationId:f.integration.id,externalChatId:id}}});return service.getConversation(c.id);};
 const draft=c=>c.outbox.find(x=>x.status==='DRAFT');
 const approve=c=>service.reply(c.id,{clientKey:randomUUID(),text:draft(c).text,draftId:draft(c).id,version:c.version},actorId);
 try{
  await t.test('all active facts are tenant-scoped and a mistakenly active retired haircut is still excluded',async()=>{
   const foreignOrg=await prisma.organization.create({data:{id:'price-foreign-'+suffix,displayName:'Чужая тестовая организация'}});
   const foreign=await prisma.clinicModuleInstallation.create({data:{organizationId:foreignOrg.id,moduleKey:'GROOMING',enabled:true}});
   const source=groomingPriceEntries().find(r=>r.catalogKey==='dog:york:hygiene');await prisma.groomingService.create({data:{installationId:foreign.id,...source,price:1}});
   const retired=await prisma.groomingService.upsert({where:{installationId_catalogKey:{installationId:grooming.id,catalogKey:'dog:york:dry'}},create:{installationId:grooming.id,...source,catalogKey:'dog:york:dry',price:1},update:{isActive:true,price:1}});
   const context=await loadPetServiceContext(prisma,org,'GROOMING');assert.equal(context.groomingPrices.length,172);assert.ok(!context.groomingPrices.some(r=>r.key==='dog:york:dry'));
   const sim=await service.simulate('202','Сколько гигиена йорка?');assert.match(clean(sim.decision.text),/2 100 ₽/);assert.doesNotMatch(sim.decision.text,/— 1 ₽/);assert.equal(sim.persisted,false);
   await prisma.groomingService.update({where:{id:retired.id},data:{isActive:false}});
  });
  await t.test('a price quote persists through reload and is delivered only once with its catalogue fingerprint',async()=>{
   const id=chat('fixed');api.add(id,'price-fixed','Сколько стоит гигиена йорка?');let c=await load(id);
   assert.equal(c.stage,'GROOMING_PRICE');assert.match(clean(draft(c).text),/2 100 ₽/);assert.ok(draft(c).replyContext.groomingPriceFingerprint);assert.equal(c.inquiries.length,0);
   const op=await approve(c);await service.deliver(op.operationId);c=await service.getConversation(c.id);assert.equal(c.outbox.find(o=>o.id===op.operationId).status,'SENT');
   await load(id);await service.deliver(op.operationId);assert.equal(api.sent.filter(x=>x.chatId===id).length,1);
  });
  await t.test('ordinary enquiries and the spaced price question are answered in AUTO without silently switching off the bot',async()=>{
   const before=await service.integration();await service.updateSettings({version:before.settingsVersion,settings:{...before.settings,mode:'AUTO',profiles:before.settings.profiles.map(p=>({...p,enabled:p.direction==='GROOMING'}))}},actorId);
   try{
    const id=chat('ordinary-auto');
    for(const [n,text] of ['Добрый день! Подскажите пожалуйста','Груминг','Можно?','Вы тут?','?','Здравствуйте, по чем стрижка полностью йорк терьер 10 лет, а вес примерно 3-4 кг'].entries()){
     const messageId=`ordinary-${n}`;api.add(id,messageId,text);let c=await load(id);assert.equal(c.mode,'BOT');
     const pending=c.outbox.find(o=>o.triggerMessageId===messageId);assert.ok(pending?.text);assert.equal(pending.status,'PENDING');
     if(n===5){assert.match(pending.text,/Йоркширский терьер.*Полный комплекс/);assert.match(pending.text,/точную стоимость уточнит администратор груминга/);assert.equal(c.needsAttention,true);}
     else assert.match(pending.text,/\?/);
     await service.deliver(pending.id);await service.deliver(pending.id);await load(id);c=await service.getConversation(c.id);
     assert.equal(c.mode,'BOT');assert.equal(c.outbox.find(o=>o.id===pending.id).status,'SENT');assert.equal(api.sent.filter(o=>o.chatId===id).length,n+1);
    }
    assert.equal((await service.getConversation((await prisma.avitoConversation.findUniqueOrThrow({where:{integrationId_externalChatId:{integrationId:f.integration.id,externalChatId:id}}})).id)).inquiries.length,0);
   }finally{const current=await service.integration();await service.updateSettings({version:current.settingsVersion,settings:before.settings},actorId);}
  });
  await t.test('the actual enquiry uses a current numerical price when CRM contains one, with no private chat hardcoding',async()=>{
   const where={installationId_catalogKey:{installationId:grooming.id,catalogKey:'dog:york:full'}},row=await prisma.groomingService.findUniqueOrThrow({where});
   try{
    await prisma.groomingService.update({where,data:{price:2500,priceType:'FIXED',version:{increment:1}}});
    const id=chat('actual-priced');api.add(id,'actual-priced','Здравствуйте, по чем стрижка полностью йорк терьер 10 лет, а вес примерно 3-4 кг');const c=await load(id);
    assert.match(clean(draft(c).text),/Йоркширский терьер.*Полный комплекс — 2 500 ₽/);assert.equal(c.mode,'BOT');assert.equal(c.needsAttention,false);
    const op=await approve(c);await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'SENT');
   }finally{await prisma.groomingService.update({where,data:{price:row.price,priceType:row.priceType,version:{increment:1}}});}
  });
  await t.test('free wording PRICE classification reaches the grooming catalogue through sync and persisted delivery',async()=>{
   const configured=f.model.configured,classify=f.model.classify;f.model.configured=()=>true;f.model.classify=async()=>({action:'PRICE',knowledgeId:null,serviceQuery:null});
   try{
    const id=chat('semantic-price');api.add(id,'semantic-price','По деньгам полный комплекс мальтезе');const c=await load(id);assert.match(clean(draft(c).text),/2 100–2 500 ₽/);
    assert.ok(draft(c).replyContext.groomingPriceFingerprint);const op=await approve(c);await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'SENT');
   }finally{f.model.configured=configured;f.model.classify=classify;}
  });
  await t.test('short cat and breed clarifications persist and simulation reads the same saved state',async()=>{
   const id=chat('cat');api.add(id,'cat-price','Сколько стрижка кошки?');let c=await load(id);assert.equal(c.contact.groomingPriceContext.awaiting,'CONDITION');assert.match(draft(c).text,/есть колтуны/);
   const sim=await service.simulate('202','Нет',c.contact);assert.match(clean(sim.decision.text),/2 500–3 300 ₽/);assert.equal(sim.persisted,false);
   api.add(id,'cat-no-mats','Нет');c=await load(id);assert.match(clean(draft(c).text),/без колтунов — 2 500–3 300 ₽/);assert.equal(c.inquiries.length,0);
   const op=await approve(c);await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'SENT');
   const dog=chat('breed');api.add(dog,'breed-price','Сколько стоит полный комплекс для собаки?');let b=await load(dog);assert.equal(b.contact.groomingPriceContext.awaiting,'BREED');api.add(dog,'breed-answer','Мальтезе');b=await load(dog);assert.match(clean(draft(b).text),/2 100–2 500 ₽/);
  });
  await t.test('a changed unlisted dog cannot reuse the earlier breed through persisted state',async()=>{
   const id=chat('breed-change');api.add(id,'breed-york','Сколько гигиена йорка?');let c=await load(id);assert.match(clean(draft(c).text),/2 100 ₽/);
   api.add(id,'breed-corgi','А сколько для корги?');c=await load(id);assert.doesNotMatch(draft(c).text,/₽/);assert.equal(c.contact.groomingPriceContext.awaiting,'BREED');
   const sim=await service.simulate('202','Мальтезе',c.contact);assert.match(clean(sim.decision.text),/1 500 ₽/);
   api.add(id,'breed-maltese','Мальтезе');c=await load(id);assert.match(clean(draft(c).text),/1 500 ₽/);assert.equal(c.inquiries.length,0);
  });
  await t.test('QUOTE stays unknown and an actual callback is saved to grooming with the priced service source',async()=>{
   const id=chat('quote');api.add(id,'quote-1','Сколько полный комплекс йорку?');let c=await load(id);assert.match(draft(c).text,/точную стоимость уточнит администратор груминга/);assert.doesNotMatch(draft(c).text,/\d\s*₽/);
   api.add(id,'quote-hygiene','А гигиена?');c=await load(id);assert.match(clean(draft(c).text),/2 100 ₽/);api.add(id,'quote-here','Здесь');c=await load(id);assert.equal(c.contact.bookingChannel,'CALLBACK');api.add(id,'quote-name','Анна');await load(id);api.add(id,'quote-phone','Мой номер +7 900 111-22-33');c=await load(id);
   assert.equal(c.inquiries.length,1);assert.equal(c.inquiries[0].direction,'GROOMING');assert.equal(c.inquiries[0].conversationId,c.id);assert.equal(c.inquiries[0].contactMessageId,'quote-phone');assert.match(c.inquiries[0].summary,/Йоркширский терьер.*Гигиенический уход/s);assert.equal(c.requestId,null);
   assert.equal(await prisma.onlineAppointmentRequest.count(),clinical);assert.equal(await prisma.groomingReservation.count(),reservations);
  });
  await t.test('a direct price plus contact message keeps both price and saved-request acknowledgement through delivery',async()=>{
   const id=chat('direct-contact');api.add(id,'price-contact','Сколько подстричь когти? Меня зовут Анна, +7 900 111-22-33');const c=await load(id);assert.equal(c.inquiries.length,1);assert.match(clean(draft(c).text),/550 ₽.*Передал заявку/s);assert.ok(draft(c).replyContext.groomingPriceFingerprint);assert.equal(c.requestId,null);
   const op=await approve(c);await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'SENT');
  });
  await t.test('fixed/range/QUOTE changes cancel stale approved answers before any transport call',async()=>{
   for(const [key,text,patch]of [['extra:claws','Сколько подстричь когти?',{price:600}],['dog:maltese:full','Сколько полный комплекс мальтезе?',{maximumPrice:2600}],['dog:york:full','Сколько полный комплекс йорку?',{priceType:'FIXED',price:2800}]]){
    const row=await prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:grooming.id,catalogKey:key}}});const id=chat('stale-'+key.replace(/:/g,'-'));api.add(id,'stale-input',text);const c=await load(id),op=await approve(c),sent=api.sent.length;
    try{await prisma.groomingService.update({where:{id:row.id},data:{...patch,version:{increment:1}}});await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'CANCELLED');assert.equal(api.sent.length,sent);}
    finally{await prisma.groomingService.update({where:{id:row.id},data:{price:row.price,maximumPrice:row.maximumPrice,priceType:row.priceType,version:{increment:1}}});}
   }
  });
  await t.test('a closed/disabled module cannot send a previously prepared quote',async()=>{
   const id=chat('disabled');api.add(id,'disabled-input','Сколько гигиена йорка?');const c=await load(id),op=await approve(c),sent=api.sent.length;
   try{await prisma.clinicModuleInstallation.update({where:{id:grooming.id},data:{enabled:false}});await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'CANCELLED');assert.equal(api.sent.length,sent);}
   finally{await prisma.clinicModuleInstallation.update({where:{id:grooming.id},data:{enabled:true}});}
  });
  await t.test('a website choice plus price is replayable without losing the website or forcing a callback',async()=>{
   const id=chat('website');api.add(id,'website-price','Сколько гигиена йорка на сайте?');const c=await load(id);assert.equal(c.contact.bookingChannel,'WEBSITE');assert.match(clean(draft(c).text),/2 100 ₽/);assert.match(draft(c).text,/https:\/\/pet.temichevvet.ru/);assert.ok(draft(c).replyContext.petService);assert.ok(draft(c).replyContext.groomingPricePrefix);
   const url=new URL(draft(c).text.split('\n').find(x=>x.startsWith('https://')));assert.deepEqual([...url.searchParams],[['utm_source','avito'],['listing_id','202']]);
   const op=await approve(c);await service.deliver(op.operationId);assert.equal((await service.getConversation(c.id)).outbox.find(o=>o.id===op.operationId).status,'SENT');assert.equal(c.inquiries.length,0);
  });
 }finally{await prisma.$disconnect();}
});
