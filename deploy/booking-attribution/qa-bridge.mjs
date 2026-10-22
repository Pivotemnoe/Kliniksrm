// Combined local services QA: separate empty clinical and gateway databases; no transport or MAX.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.env.ATTRIBUTION_CLINICAL_QA_ROOT;
if(!root)throw Error('Explicit clinical checkout required');
const cr=createRequire(root+'/package.json');
const qroot=process.env.ATTRIBUTION_PAYLOAD_QA_ROOT,packet=process.env.ATTRIBUTION_PACKET;
if(!qroot||!packet)throw Error('Actual packet payload paths required');
const gr=createRequire(qroot+'/gateway-forward/package.json'),rr=createRequire(qroot+'/gateway-compat/package.json'),old=createRequire(qroot+'/gateway-baseline/package.json');
const cf=createRequire(qroot+'/clinical-forward/package.json'),cc=createRequire(qroot+'/clinical-compat/package.json');
const release=JSON.parse(await readFile(packet+'/release.json','utf8'));
process.env.PRISMA_QUERY_ENGINE_LIBRARY=process.env.ATTRIBUTION_NATIVE_QA_ENGINE;
const clinicalUrl=new URL(process.env.BRIDGE_CLINICAL_QA_URL||'');
const gatewayUrl=new URL(process.env.BRIDGE_GATEWAY_QA_URL||'');
for(const [u,dbName]of[[clinicalUrl,'source_bridge_clinical_20261022_qa'],[gatewayUrl,'source_bridge_gateway_20261022_qa']]){
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username,'attribution_bridge_qa');assert.equal(u.pathname,'/'+dbName);
}
for(const key of Object.keys(process.env))if(/MAX.*TOKEN|MAX.*SECRET/.test(key))delete process.env[key];
process.env.GROOMING_CRM_SYNC_ENABLED='true';process.env.PET_HOTEL_CRM_SYNC_ENABLED='true';
process.env.GROOMING_BOOKING_SIGNING_SECRET='local-grooming-bridge-test-only-secret';
process.env.PET_HOTEL_BOOKING_SIGNING_SECRET='local-hotel-bridge-test-only-secret';
process.env.OWNER_GATEWAY_DATABASE_URL=gatewayUrl.href;
const {PrismaClient}=cr('@prisma/client');
const {PrismaService}=gr('./dist/prisma.service.js');
const {AuditService}=cf('./dist/modules/audit/audit.service.js');
const {ClinicModulesService}=cf('./dist/modules/clinic-modules/clinic-modules.service.js');
const {GroomingCrmService}=cf('./dist/modules/grooming/grooming.service.js');
const {GroomingSyncService}=cf('./dist/modules/grooming/grooming-sync.service.js');
const {PetHotelService}=cf('./dist/modules/pet-hotel/pet-hotel.service.js');
const {PetHotelOwnerService}=cf('./dist/modules/pet-hotel/pet-hotel-portal.service.js');
const {GroomingPortalService}=gr('./dist/grooming/grooming-portal.service.js');
const {PetHotelStorefrontService}=gr('./dist/pet-hotel/pet-hotel-storefront.service.js');
const {PetHotelPortalService}=gr('./dist/pet-hotel/pet-hotel-portal.service.js');
const {hashToken}=gr('./dist/security.js');
const {GROOMING_BREEDS}=gr('./dist/grooming/catalog.js');
const db=new PrismaClient({datasources:{db:{url:clinicalUrl.href}}});let gw=new PrismaService();
const noMessages=new Proxy({},{get(){throw Error('External messages forbidden');}});
let gatewayRequire=gr;
const services=()=>({groom:new (gatewayRequire('./dist/grooming/grooming-portal.service.js').GroomingPortalService)(gw,noMessages,noMessages),hotel:new (gatewayRequire('./dist/pet-hotel/pet-hotel-storefront.service.js').PetHotelStorefrontService)(gw),portal:new (gatewayRequire('./dist/pet-hotel/pet-hotel-portal.service.js').PetHotelPortalService)(gw)});
const checks=[];function ok(name){checks.push(name);console.log('PASS '+name);}
const {ValidationPipe}=gr('@nestjs/common');
const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
async function draftDto(req,kind,value){const Dto=kind==='groom'?req('./dist/grooming/grooming-portal.dto.js').GroomingDraftDto:req('./dist/pet-hotel/pet-hotel.dto.js').HotelDraftDto;return pipe.transform(value,{type:'body',metatype:Dto});}
const publicRequest={headers:{origin:'http://127.0.0.1:49120'},ip:'127.0.0.1-qa'};
process.env.GROOMING_SITE_ORIGINS=publicRequest.headers.origin;process.env.PET_HOTEL_SITE_ORIGINS=publicRequest.headers.origin;
async function publicDraft(req,services,kind,value){const dto=await draftDto(req,kind,value);if(kind==='groom')return new (req('./dist/grooming/grooming-portal.controller.js').GroomingDraftPublicController)(services.groom,noMessages).create(publicRequest,dto);return new (req('./dist/pet-hotel/pet-hotel.controller.js').PetHotelPublicController)(services.hotel).draft(publicRequest,dto);}
try{
 assert.equal(await db.organization.count(),0);assert.equal(await gw.ownerSnapshot.count(),0);
  await db.organization.create({ data: { displayName: 'Вымышленная клиника · источник записи' } });
  const employee = await db.employee.create({ data: { fullName: 'Вымышленный грумер', accountScope: 'GROOMING' } });
  const actor = { id: employee.id, roles: ['director'], permissions: ['pet_hotel.read', 'pet_hotel.operate', 'pet_hotel.manage'] };
  const owner = await db.owner.create({ data: { fullName: 'Вымышленный владелец', portalAccess: { create: { status: 'ENABLED' } } } });
  const other = await db.owner.create({ data: { fullName: 'Другой вымышленный владелец' } });
  const animal = await db.animal.create({ data: { ownerId: owner.id, nickname: 'Луна · пример', species: 'Кошка' } });
  const audit = new AuditService(db), modules = new ClinicModulesService(db, audit, { getLicenseState: async () => ({ enforcementActive: false, features: [] }) });
  const gi = await modules.installation('GROOMING'), hi = await modules.installation('PET_HOTEL');
  await db.clinicModuleInstallation.updateMany({ where: { id: { in: [gi.id, hi.id] } }, data: { enabled: true } });
  await db.groomingSettings.create({ data: { installationId: gi.id, selfBookingEnabled: true, administratorMaxIds: [], reminderHours: [] } });
  const hs = await db.petHotelSettings.create({ data: { installationId: hi.id, selfBookingEnabled: true, dailyRate: 700, administratorMaxIds: [], reminderHours: [] } });
  const room = await db.petHotelRoom.create({ data: { installationId: hi.id, code: 'CAT-1', name: 'Тестовый номер', species: 'CAT', dailyRate: 700 } });
  const location = await db.groomingLocation.create({ data: { installationId: gi.id, name: 'Тестовая студия', address: 'Вымышленный адрес', timezone: 'Europe/Moscow' } });
  const workplace = await db.groomingWorkplace.create({ data: { locationId: location.id, name: 'Тестовый стол' } });
  const specialist = await db.groomingSpecialist.create({ data: { installationId: gi.id, employeeId: employee.id, displayName: employee.fullName, species: ['CAT'], isActive: true } });
  const service = await db.groomingService.create({ data: { installationId: gi.id, title: 'Уход · пример', price: 2500 } });
  const rule = await db.groomingServiceRule.create({ data: { installationId: gi.id, specialistId: specialist.id, serviceId: service.id, locationId: location.id, workplaceId: workplace.id, species: 'CAT', size: 'ANY', coat: 'ANY', durationMinutes: 60, bufferMinutes: 15, stepMinutes: 15, minimumLeadMinutes: 0, maximumDaysAhead: 90, isActive: true } });
  const now = new Date(), day = new Date(+now + 5 * 86400000).toISOString().slice(0, 10);
  const start = new Date(day + 'T10:00:00+03:00');
  await db.groomingWorkPeriod.create({ data: { specialistId: specialist.id, locationId: location.id, startsAt: new Date(day + 'T09:00:00+03:00'), endsAt: new Date(day + 'T19:00:00+03:00') } });


 const grooming=new GroomingCrmService(db,modules,audit);let sync=new GroomingSyncService(db,grooming);
 const hotel=new PetHotelService(db,modules,audit);let portal=new PetHotelOwnerService(db,hotel,audit);
 const token=randomUUID()+randomUUID(),otherToken=randomUUID()+randomUUID();
 for(const [o,t]of[[owner,token],[other,otherToken]]){
  await gw.ownerSnapshot.create({data:{ownerId:o.id,displayName:o.fullName,sourceVersion:'local-bridge',sourceUpdatedAt:new Date(),payload:{owner:{fullName:o.fullName},animals:[]}}});
  await gw.portalSession.create({data:{ownerId:o.id,tokenHash:hashToken(t),expiresAt:new Date(Date.now()+3600000)}});
 }
 let f=services();
 async function execute(kind,input,module='groom',session=token){
  const command={kind,input,clientKey:randomUUID()},service=module==='groom'?f.groom:f.portal;
  const queued=await service.operation(session,command),table=module==='groom'?gw.groomingPortalOperation:gw.petHotelPortalOperation;
  const row=await table.findUniqueOrThrow({where:{id:queued.id}}),op={...row,expiresAt:row.expiresAt.toISOString()};
  const result=module==='groom'?await sync.execute(op):await portal.execute(op);
  // A lost response replays the same real clinical command, then saves its receipt to the gateway.
  const repeated=module==='groom'?await sync.execute(op):await portal.execute(op);
  if(['BOOK','RESCHEDULE','CANCEL'].includes(kind))assert.deepEqual(repeated,result);
  await service.complete(row.id,{status:'DONE',result});
  assert.equal((await service.operation(session,command)).id,row.id);
  assert.equal((await table.findUniqueOrThrow({where:{id:row.id}})).status,'DONE');
  return result;
 }
 const attribution={source:'AVITO',listingId:'8339919613'},hotelAttribution={source:'AVITO',listingId:'4322482374'};
 const breed=GROOMING_BREEDS.find(b=>b.species==='cat');
 const d=await f.groom.createDraft({breedId:breed.id,looks:[],notes:'Synthetic bridge test',attribution},'local-bridge');
 const claimed=await f.groom.consumeDraft(token,d.token);assert.deepEqual(claimed.attribution,attribution);
 await assert.rejects(f.groom.consumeDraft(otherToken,d.token));
 const options=await execute('OPTIONS',{animalId:animal.id,serviceId:service.id,species:claimed.species,size:claimed.size,coat:'ANY',date:day});
 const bookedG=await execute('BOOK',{offerToken:options.offers[0].offerToken,contactConsent:true,bookingConsent:true,attribution:claimed.attribution});
 assert.equal(bookedG.source,'CLIENT_PORTAL');assert.equal(bookedG.price,'2500');
 ok('Grooming: public draft -> same-owner claim -> queued OPTIONS/BOOK -> actual clinical reservation, retry receipt');
 const gMovedOptions=await execute('OPTIONS',{animalId:animal.id,serviceId:service.id,species:'CAT',size:'ANY',coat:'ANY',date:day,reservationId:bookedG.id});
 const gOtherTime=gMovedOptions.offers.find(o=>o.startsAt!==bookedG.startsAt);
 const movedG=await execute('RESCHEDULE',{reservationId:bookedG.id,version:bookedG.version,offerToken:gOtherTime.offerToken,contactConsent:true,bookingConsent:true,attribution:hotelAttribution});
 assert.deepEqual(movedG.attribution,attribution);assert.equal(movedG.price,'2500');
 ok('Grooming move preserves the original source and price');
 await f.hotel.store(await portal.storefrontSnapshot());
 const select={species:'CAT',startsAt:start.toISOString(),endsAt:new Date(+start+51*3600000).toISOString(),walkCount:0};
 const offer=(await f.hotel.availability(select,'local-bridge')).rooms.find(o=>o.id===room.id);
 const hd=await f.hotel.draft(offer.offerToken,'local-bridge',hotelAttribution);
 const hc=await f.hotel.consume(owner.id,hd.token);assert.deepEqual(hc.attribution,hotelAttribution);
 await assert.rejects(f.hotel.consume(other.id,hd.token));
 const hOptions=await execute('OPTIONS',{...select,animalId:animal.id},'hotel');
 const bookedH=await execute('BOOK',{animalId:animal.id,offerToken:hOptions.rooms[0].offerToken,notes:'Synthetic bridge test',contactConsent:true,bookingConsent:true,attribution:hc.attribution},'hotel');
 assert.equal((await db.petHotelReservation.findUniqueOrThrow({where:{id:bookedH.id}})).source,'OWNER_PORTAL');assert.equal(bookedH.totalPrice,'2100.00');assert.equal(bookedH.billableDays,3);
 ok('Hotel: actual clinical storefront snapshot -> public offer/draft -> claim -> queued OPTIONS/BOOK -> clinical reservation, retry receipt');
 await db.petHotelRoom.update({where:{id:room.id},data:{dailyRate:900}});
 const moveSelection={...select,animalId:animal.id,reservationId:bookedH.id,startsAt:new Date(+start+5*86400000).toISOString(),endsAt:new Date(+start+5*86400000+51*3600000).toISOString()};
 const hMovedOptions=await execute('OPTIONS',moveSelection,'hotel');
 const movedH=await execute('RESCHEDULE',{animalId:animal.id,reservationId:bookedH.id,version:bookedH.version,offerToken:hMovedOptions.rooms[0].offerToken,notes:'',contactConsent:true,bookingConsent:true,attribution},'hotel');
 assert.deepEqual((await db.petHotelReservation.findUniqueOrThrow({where:{id:movedH.id}})).attribution,hotelAttribution);assert.equal(movedH.dailyRate,'700.00');assert.equal(movedH.totalPrice,'2100.00');
 ok('Hotel move retains source and saved 700 rate after room price changes to 900');
 const gdBad=await f.groom.createDraft({breedId:breed.id,looks:[],notes:'Synthetic malformed attribution',attribution:{...attribution,phone:'must not persist'}},'local-bridge');
 const gcBad=await f.groom.consumeDraft(token,gdBad.token);assert.equal(gcBad.attribution,undefined);
 const goodOptions=await execute('OPTIONS',{animalId:animal.id,serviceId:service.id,species:'CAT',size:'ANY',coat:'ANY',date:day});
 const goodWithoutSource=await execute('BOOK',{offerToken:goodOptions.offers[0].offerToken,contactConsent:true,bookingConsent:true,attribution:gcBad.attribution});
 assert.equal(goodWithoutSource.attribution,null);
 const badSelect={...select,startsAt:new Date(+start+15*86400000).toISOString(),endsAt:new Date(+start+15*86400000+51*3600000).toISOString()};
 await f.hotel.store(await portal.storefrontSnapshot());
 const bo=(await f.hotel.availability(badSelect,'local-bridge')).rooms.find(o=>o.id===room.id);
 const bd=await f.hotel.draft(bo.offerToken,'local-bridge',{...hotelAttribution,phone:'must not persist'}),bc=await f.hotel.consume(owner.id,bd.token);assert.equal(bc.attribution,undefined);
 const bop=await execute('OPTIONS',{...badSelect,animalId:animal.id},'hotel');
 const bbook=await execute('BOOK',{animalId:animal.id,offerToken:bop.rooms[0].offerToken,notes:'',contactConsent:true,bookingConsent:true,attribution:bc.attribution},'hotel');
 assert.equal((await db.petHotelReservation.findUniqueOrThrow({where:{id:bbook.id}})).attribution,null);
 ok('Malformed attribution drops across both actual draft/claim/booking flows without blocking booking');
 // Capture the exact public-client metadata from the actual packet helper.
 const helperPath=release.static['pet-hotel'].retainedAssets[0];
 const browser=await import('file://'+packet+'/static/pet-hotel/forward/'+helperPath);
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const fromBrowser=browser.captureAttribution({module:'GROOMING',search:'?utm_source=avito&listing_id=8339919613&phone=not-carried',storage});
 assert.deepEqual(fromBrowser,attribution);assert.equal(browser.captureAttribution({module:'PET_HOTEL',search:'',storage}),undefined);
 for(const kind of ['groom','hotel']){
  const input=kind==='groom'?{breedId:breed.id,looks:[],notes:'Synthetic cached public client',attribution}:{offerToken:'a'.repeat(40),attribution:hotelAttribution};
  await assert.rejects(draftDto(old,kind,input),e=>e.getStatus?.()===400);
  for(const req of [gr,rr]){
   assert.deepEqual((await draftDto(req,kind,input)).attribution,input.attribution);
   const malformed=await draftDto(req,kind,{...input,attribution:{...input.attribution,phone:'discard'}});assert.equal(malformed.attribution,undefined);
  }
 }
 ok('Actual helper isolates modules and strips unrelated URL data; strict legacy DTO rejects new input, forward/compat HTTP DTOs accept it');
 // New public drafts and queued BOOKs are left pending across a simulated restart/rollback.
 const savedG=await publicDraft(gr,f,'groom',{breedId:breed.id,looks:[],notes:'Synthetic saved pre-rollback draft',attribution:fromBrowser});
 const cg=await f.groom.consumeDraft(token,savedG.token);assert.deepEqual(cg.attribution,attribution);
 const gBefore=await execute('OPTIONS',{animalId:animal.id,serviceId:service.id,species:'CAT',size:'ANY',coat:'ANY',date:day});
 await f.hotel.store(await portal.storefrontSnapshot());
 const rbSelect={...select,startsAt:new Date(+start+25*86400000).toISOString(),endsAt:new Date(+start+25*86400000+51*3600000).toISOString()};
 const rbOffer=(await f.hotel.availability(rbSelect,'rollback-public-client')).rooms.find(o=>o.id===room.id);
 const savedH=await publicDraft(gr,f,'hotel',{offerToken:rbOffer.offerToken,attribution:hotelAttribution});
 const ch=await f.hotel.consume(owner.id,savedH.token);assert.deepEqual(ch.attribution,hotelAttribution);
 const hBefore=await execute('OPTIONS',{...rbSelect,animalId:animal.id},'hotel');
 const commands=[{kind:'BOOK',clientKey:randomUUID(),input:{offerToken:gBefore.offers[0].offerToken,notes:'Synthetic pending rollback booking',contactConsent:true,bookingConsent:true,attribution:cg.attribution}},
  {kind:'BOOK',clientKey:randomUUID(),input:{animalId:animal.id,offerToken:hBefore.rooms[0].offerToken,notes:'Synthetic pending rollback booking',contactConsent:true,bookingConsent:true,attribution:ch.attribution}}];
 const pending=[await f.groom.operation(token,commands[0]),await f.portal.operation(token,commands[1])];
 for(let i=0;i<2;i++)assert.equal(pending[i].status,'PENDING');
 await gw.$disconnect();gw=new (rr('./dist/prisma.service.js').PrismaService)();await gw.$connect();gatewayRequire=rr;f=services();
 const CompatGrooming=cc('./dist/modules/grooming/grooming.service.js').GroomingCrmService;
 const CompatSync=cc('./dist/modules/grooming/grooming-sync.service.js').GroomingSyncService;
 const CompatHotel=cc('./dist/modules/pet-hotel/pet-hotel.service.js').PetHotelService;
 const CompatPortal=cc('./dist/modules/pet-hotel/pet-hotel-portal.service.js').PetHotelOwnerService;
 sync=new CompatSync(db,new CompatGrooming(db,modules,audit));portal=new CompatPortal(db,new CompatHotel(db,modules,audit),audit);
 assert.deepEqual((await f.groom.consumeDraft(token,savedG.token)).attribution,attribution);
 assert.deepEqual((await f.hotel.consume(owner.id,savedH.token)).attribution,hotelAttribution);
 await assert.rejects(f.groom.consumeDraft(otherToken,savedG.token));await assert.rejects(f.hotel.consume(other.id,savedH.token));
 const rolledBookings=[];
 for(let i=0;i<2;i++){
  const s=i?f.portal:f.groom,t=i?gw.petHotelPortalOperation:gw.groomingPortalOperation;
  const retried=await s.operation(token,commands[i]);assert.equal(retried.id,pending[i].id);assert.equal(retried.status,'PENDING');
  const row=await t.findUniqueOrThrow({where:{id:retried.id}});assert.deepEqual(row.input.attribution,commands[i].input.attribution);
  const op={...row,expiresAt:row.expiresAt.toISOString()},consumer=i?portal:sync;
  const result=await consumer.execute(op);assert.deepEqual(await consumer.execute(op),result);
  await s.complete(row.id,{status:'DONE',result});const again=await s.operation(token,commands[i]);assert.equal(again.id,row.id);assert.equal(again.status,'DONE');assert.deepEqual(again.result,result);rolledBookings.push(result);
 }
 ok('Actual forward saved drafts and pending BOOKs survive gateway+clinical compat rollback, ownership, reconnect, same-key retry, lost-response replay and confirmation receipt');
 // An already loaded new public client can still make a draft on rollback. Only its new label is omitted.
 const droppedG=await publicDraft(rr,f,'groom',{breedId:breed.id,looks:[],notes:'Synthetic post-rollback public draft',attribution});
 assert.equal((await f.groom.consumeDraft(token,droppedG.token)).attribution,undefined);
 const postOptions=await execute('OPTIONS',{animalId:animal.id,serviceId:service.id,species:'CAT',size:'ANY',coat:'ANY',date:day});
 const postG=await execute('BOOK',{offerToken:postOptions.offers[0].offerToken,notes:'Synthetic post-rollback booking',contactConsent:true,bookingConsent:true});
 await f.hotel.store(await portal.storefrontSnapshot());
 const postSelect={...select,startsAt:new Date(+start+35*86400000).toISOString(),endsAt:new Date(+start+35*86400000+51*3600000).toISOString()};
 const postOffer=(await f.hotel.availability(postSelect,'rollback-cached-client')).rooms.find(o=>o.id===room.id);
 const droppedH=await publicDraft(rr,f,'hotel',{offerToken:postOffer.offerToken,attribution:hotelAttribution});
 assert.equal((await f.hotel.consume(owner.id,droppedH.token)).attribution,undefined);
 const postHOptions=await execute('OPTIONS',{...postSelect,animalId:animal.id},'hotel');
 const postH=await execute('BOOK',{animalId:animal.id,offerToken:postHOptions.rooms[0].offerToken,notes:'Synthetic post-rollback booking',contactConsent:true,bookingConsent:true},'hotel');
 assert.equal((await db.groomingReservation.findUniqueOrThrow({where:{id:postG.id}})).attribution,null);
 assert.equal((await db.petHotelReservation.findUniqueOrThrow({where:{id:postH.id}})).attribution,null);
 ok('Cached new public client after rollback: both actual controllers accept optional pair, omit only new draft metadata, and real clinical BOOK/receipt still completes');
 await gw.$disconnect();await db.$disconnect();gw=new PrismaService();
 const reopen=new PrismaClient({datasources:{db:{url:clinicalUrl.href}}});
 try{
  const g=await reopen.groomingReservation.findUniqueOrThrow({where:{id:bookedG.id}}),h=await reopen.petHotelReservation.findUniqueOrThrow({where:{id:bookedH.id}});
  assert.equal(g.ownerId,owner.id);assert.equal(h.ownerId,owner.id);assert.deepEqual(g.attribution,attribution);assert.deepEqual(h.attribution,hotelAttribution);
  assert.equal(g.price.toString(),'2500');assert.equal(h.dailyRate.toString(),'700');assert.equal(h.source,'OWNER_PORTAL');
  assert.equal(await reopen.groomingReservation.count(),4);assert.equal(await reopen.petHotelReservation.count(),4);
  assert.equal(await reopen.appointment.count(),0);assert.equal(await reopen.payment.count(),0);
  assert.equal(await gw.groomingPortalOperation.count({where:{status:'PENDING'}}),0);assert.equal(await gw.petHotelPortalOperation.count({where:{status:'PENDING'}}),0);
  ok('Both databases reopened: owner/source/price retained, no duplicate reservation, no medical appointments or payments');
 }finally{await reopen.$disconnect();}
 await writeFile(qroot+'/bridge-receipt.json',JSON.stringify({checkedAt:new Date().toISOString(),clinicalRevision:process.env.ATTRIBUTION_CLINICAL_QA_REVISION,gatewayRevision:'f88aba9',checks,realMaxMessages:0,productionChanged:false,databases:'two isolated loopback PostgreSQL databases, synthetic records'},null,2));
}finally{await gw.$disconnect();await db.$disconnect();}
