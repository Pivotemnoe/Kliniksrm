import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {groomingFixture,qaSecret} from './helpers/grooming-crm-fixture.mjs';
const require=createRequire(import.meta.url);
const {GroomingStorefrontService}=require('../apps/owner-gateway/dist/grooming/grooming-storefront.service.js');
Object.assign(process.env,{NODE_ENV:'test',GROOMING_BOOKING_SIGNING_SECRET:qaSecret,GROOMING_CRM_SYNC_ENABLED:'true',GROOMING_CLIENT_NOTIFICATIONS_ENABLED:'true'});
delete process.env.MAX_BOT_TOKEN;delete process.env.GROOMING_MAX_BOT_TOKEN;
const fixture=async t=>{const f=await groomingFixture();f.cleanup=[];t.after(async()=>{for(const job of f.cleanup)await job();await f.close();});return f;};
const plain=v=>JSON.parse(JSON.stringify(v));
const bookInput=o=>({clientKey:randomUUID(),offerToken:o.offerToken,contactConsent:true,bookingConsent:true,notes:'Тест связи сайта и модуля',looks:[]});

test('price import is idempotent, keeps ranges/percent/hour and preserves manual edits',async t=>{
 const f=await fixture(t),key=randomUUID();
 const a=await f.service.importPrices({clientKey:key},f.director);
 assert.equal(a.created+a.preserved,218);
 assert.deepEqual(await f.service.importPrices({clientKey:key},f.director),a);
 const husky=await f.prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:f.installation.id,catalogKey:'dog:husky:full'}}});
 f.cleanup.push(()=>f.prisma.groomingService.update({where:{id:husky.id},data:{price:0,priceType:'UP_TO',maximumPrice:6300}}));
 assert.equal(husky.priceType,'UP_TO');assert.equal(husky.maximumPrice.toString(),'6300');
 const show=await f.prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:f.installation.id,catalogKey:'extra:show'}}});assert.equal(show.price.toString(),'30');assert.equal(show.priceType,'PERCENT');
 const mats=await f.prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:f.installation.id,catalogKey:'extra:mats'}}});assert.equal(mats.price.toString(),'1300');assert.equal(mats.catalogData.unit,'hour');
 await f.service.saveService({title:husky.title,price:0,priceType:'UP_TO',maximumPrice:6400,isActive:true,version:husky.version},f.director,husky.id);
 const b=await f.service.importPrices({clientKey:randomUUID()},f.director);assert.equal(b.created,0);assert.equal((await f.prisma.groomingService.findUniqueOrThrow({where:{id:husky.id}})).maximumPrice.toString(),'6400');
});
test('site availability contains no clients, respects busy time and final booking collision checks',async t=>{
 const f=await fixture(t),store=new GroomingStorefrontService(f.gateway);
 await store.store(plain(await f.service.storefrontSnapshot()));
 const query={serviceId:f.groomingService.id,specialistId:f.specialist.id,date:f.selectedDate,species:'DOG',size:'SMALL',coat:'ANY'};
 const first=await store.availability(query,'test-'+randomUUID());assert.ok(first.slots.length);
 const raw=JSON.stringify(await store.catalog());assert.equal(raw.includes(f.owner.id),false);assert.equal(raw.includes(f.owner.phone),false);assert.equal(raw.includes('maxUserId'),false);
 const offer=(await f.service.options(f.owner.id,f.options)).offers.find(o=>o.startsAt===first.slots[0].startsAt);assert.ok(offer);
 const stale=(await f.service.options(f.otherOwner.id,{...f.options,animalId:f.otherAnimal.id})).offers.find(o=>o.startsAt===offer.startsAt);
 const booked=await f.service.book(f.owner.id,bookInput(offer));
 await assert.rejects(f.service.book(f.otherOwner.id,bookInput(stale)),/занято/);
 await store.store(plain(await f.service.storefrontSnapshot()));
 const fresh=await store.availability(query,'test-'+randomUUID());assert.ok(fresh.slots.every(o=>o.startsAt>=booked.blockedUntil));
 await f.gateway.groomingStorefrontSnapshot.update({where:{id:'grooming'},data:{receivedAt:new Date(Date.now()-120000)}});
 await assert.rejects(store.availability(query,'test-'+randomUUID()),/обновляется/);
});
test('bulk schedule preview is read-only; conflicts roll back the whole batch and repeat is safe',async t=>{
 const f=await fixture(t),date=new Date(Date.parse(f.selectedDate+'T12:00:00+03:00')+12*86400000).toISOString().slice(0,10);
 const input={clientKey:randomUUID(),employeeIds:[f.groomer.id],locationId:f.location.id,from:date,to:date,weekdays:[0,1,2,3,4,5,6],startsTime:'10:00',endsTime:'17:00',comment:'Явная тестовая смена'};
 const count=await f.prisma.groomingWorkPeriod.count();const preview=await f.service.batchShifts(input,f.administrator,true);assert.equal(preview.created,1);assert.equal(await f.prisma.groomingWorkPeriod.count(),count);
 const result=await f.service.batchShifts(input,f.administrator);assert.equal(result.created,1);assert.deepEqual(await f.service.batchShifts(input,f.administrator),result);
 const clash={...input,clientKey:randomUUID(),to:new Date(Date.parse(date+'T12:00:00+03:00')+86400000).toISOString().slice(0,10),startsTime:'11:00'};
 const before=await f.prisma.groomingWorkPeriod.count();await assert.rejects(f.service.batchShifts(clash,f.administrator),/пересечения/);assert.equal(await f.prisma.groomingWorkPeriod.count(),before);
});
test('price snapshots survive edits and test mode permits only the verified MAX client',async t=>{
 const f=await fixture(t);await f.service.importPrices({clientKey:randomUUID()},f.director);
 const service=await f.prisma.groomingService.findUniqueOrThrow({where:{installationId_catalogKey:{installationId:f.installation.id,catalogKey:'dog:bichon:full'}}});
 await f.service.saveRule({...Object.fromEntries(['specialistId','locationId','workplaceId','species','size','coat','durationMinutes','bufferMinutes','stepMinutes','minimumLeadMinutes','maximumDaysAhead'].map(k=>[k,f.rule[k]])),serviceId:service.id,isActive:true},f.director);
 f.cleanup.push(()=>f.prisma.groomingService.update({where:{id:service.id},data:{price:2300,priceType:'RANGE',maximumPrice:2800}}));
 const options={...f.options,serviceId:service.id};const offer=(await f.service.options(f.owner.id,options)).offers[0];assert.equal(offer.priceLabel.replaceAll('\u00a0',' '),'2 300–2 800 ₽');
 const b=await f.service.book(f.owner.id,bookInput(offer));assert.equal(b.priceType,'RANGE');assert.equal(b.maximumPrice,'2800');
 await f.service.saveService({title:service.title,price:2500,priceType:'RANGE',maximumPrice:3000,version:service.version},f.director,service.id);const saved=await f.service.booking(b.id,f.director);assert.equal(saved.price.toString(),'2300');assert.equal(saved.maximumPrice.toString(),'2800');
 await f.prisma.groomingSettings.update({where:{installationId:f.installation.id},data:{testClientMaxId:f.owner.maxUserId}});
 assert.ok((await f.service.portalState(f.owner.id)).selfBookingEnabled);assert.equal((await f.service.portalState(f.otherOwner.id)).selfBookingEnabled,false);
 await assert.rejects(f.service.options(f.otherOwner.id,{...options,animalId:f.otherAnimal.id}),/тестовый запуск/);
});
test('confirmation and scheduled reminders target both owner and assigned groomer',async t=>{
 const f=await fixture(t),offer=(await f.service.options(f.owner.id,f.options)).offers[0],booked=await f.service.book(f.owner.id,bookInput(offer));
 const rows=await f.prisma.groomingNotification.findMany({where:{reservationId:booked.id}});
 assert.ok(rows.some(n=>n.event==='CONFIRMED'&&n.recipientKind==='OWNER'));assert.ok(rows.some(n=>n.event==='CONFIRMED'&&n.recipientKind==='STAFF'&&n.recipientId===f.specialist.maxUserId));
 assert.ok(rows.some(n=>n.event==='REMINDER'&&n.recipientKind==='STAFF'&&n.recipientId===f.specialist.maxUserId));
 assert.ok(rows.some(n=>n.event==='REMINDER'&&n.recipientKind==='OWNER'));
});
