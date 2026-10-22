import 'reflect-metadata';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
const require=createRequire(import.meta.url);
const {plainToInstance}=require('class-transformer'),{validate}=require('class-validator');
const {GroomingDraftDto}=require('../apps/owner-gateway/dist/grooming/grooming-portal.dto.js');
const {HotelDraftDto}=require('../apps/owner-gateway/dist/pet-hotel/pet-hotel.dto.js');
const {bookingCommandAttribution}=require('../apps/owner-gateway/dist/booking-attribution.js');
const attribution={source:'AVITO',listingId:'8339919613'};

test('draft DTOs drop invalid attribution while preserving valid booking fields',async()=>{
 for(const [Dto,base] of [[GroomingDraftDto,{breedId:'maltipoo',looks:[],notes:''}],[HotelDraftDto,{offerToken:'a'.repeat(40)}]]){
  for(const source of [attribution,null,{source:'AVITO'},{...attribution,ownerId:'injected'},{source:'AVITO',listingId:'0'}]){
   const dto=plainToInstance(Dto,{...base,attribution:source});
   assert.equal((await validate(dto,{whitelist:true,forbidNonWhitelisted:true})).length,0);
   assert.deepEqual(dto.attribution,source===attribution?attribution:undefined);
   for(const key of Object.keys(base))assert.deepEqual(dto[key],base[key]);
  }
 }
 assert.deepEqual(bookingCommandAttribution('RESCHEDULE',{version:1,attribution}),{version:1});
});

const target=process.env.ATTRIBUTION_GATEWAY_QA_URL;
test('isolated gateway persists draft, owner claim and BOOK attribution through reconnect and retry',{skip:!target},async()=>{
 const url=new URL(target);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/source_attribution_gateway_20261022_qa');assert.equal(url.username,'attribution_gateway_qa');
 process.env.OWNER_GATEWAY_DATABASE_URL=target;
 process.env.GROOMING_CRM_SYNC_ENABLED='true';process.env.PET_HOTEL_CRM_SYNC_ENABLED='true';
 for(const name of Object.keys(process.env))if(/MAX.*TOKEN|MAX.*SECRET/.test(name))delete process.env[name];
 const {PrismaService}=require('../apps/owner-gateway/dist/prisma.service.js');
 const {hashToken}=require('../apps/owner-gateway/dist/security.js');
 const {GroomingPortalService}=require('../apps/owner-gateway/dist/grooming/grooming-portal.service.js');
 const {PetHotelStorefrontService}=require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-storefront.service.js');
 const {PetHotelPortalService}=require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-portal.service.js');
 const {GROOMING_BREEDS}=require('../apps/owner-gateway/dist/grooming/catalog.js');
 let prisma=new PrismaService();await prisma.$connect();
 const noMessages=new Proxy({},{get(){throw Error('External messages are forbidden in this test');}});
 const services=()=>({grooming:new GroomingPortalService(prisma,noMessages,noMessages),hotel:new PetHotelStorefrontService(prisma),portal:new PetHotelPortalService(prisma)});
 try{
  const owners=['qa-attribution-'+randomUUID(),'qa-attribution-'+randomUUID()],sessions=owners.map(()=>randomUUID()+randomUUID());
  for(let i=0;i<owners.length;i++){
   await prisma.ownerSnapshot.create({data:{ownerId:owners[i],displayName:'Вымышленный владелец',sourceVersion:'attribution-qa',sourceUpdatedAt:new Date(),payload:{owner:{fullName:'Вымышленный владелец'},animals:[]}}});
   await prisma.portalSession.create({data:{ownerId:owners[i],tokenHash:hashToken(sessions[i]),expiresAt:new Date(Date.now()+3600000)}});
  }
  let f=services();const breed=GROOMING_BREEDS[0];
  const created=await f.grooming.createDraft({breedId:breed.id,looks:[],notes:'Isolated attribution test',attribution},'qa-loopback');
  const claimed=await f.grooming.consumeDraft(sessions[0],created.token);
  assert.deepEqual(claimed.attribution,attribution);assert.equal(claimed.breedId,breed.id);
  await assert.rejects(f.grooming.consumeDraft(sessions[1],created.token),/другом кабинете/);
  const startsAt=new Date(Date.now()+2*86400000).toISOString().slice(0,10)+'T10:00:00+03:00';
  const endsAt=new Date(Date.parse(startsAt)+51*3600000).toISOString();
  await f.hotel.store({schemaVersion:1,capturedAt:new Date().toISOString(),enabled:true,selfBookingEnabled:true,testMode:true,
   settings:{dailyRate:'700.00',walkRate:'150.00',minimumDays:2,maximumDogWeightKg:10,checkInFrom:'09:00',checkInTo:'18:00'},
   rooms:[{id:'example-cat-room',code:'CAT-1',name:'Тестовый номер',species:'CAT',dailyRate:'900.00',isActive:true,version:1,sortOrder:0}],busy:[]});
  const offered=(await f.hotel.availability({species:'CAT',startsAt,endsAt,walkCount:0},'qa-loopback')).rooms[0];
  const hotelAttribution={source:'AVITO',listingId:'4322482374'};
  const selected=await f.hotel.draft(offered.offerToken,'qa-loopback',hotelAttribution);
  const hotelDraft=await f.hotel.consume(owners[0],selected.token);
  assert.deepEqual(hotelDraft.attribution,hotelAttribution);assert.deepEqual(hotelDraft.quote,offered.quote);assert.equal(hotelDraft.quote.totalPrice,'2700.00');
  await assert.rejects(f.hotel.consume(owners[1],selected.token),/другом кабинете/);
  const requests=[{kind:'BOOK',clientKey:randomUUID(),input:{offerToken:'fresh-clinical-offer',contactConsent:true,bookingConsent:true,attribution:claimed.attribution}},
   {kind:'BOOK',clientKey:randomUUID(),input:{offerToken:'fresh-clinical-offer',animalId:'example-cat',contactConsent:true,bookingConsent:true,attribution:hotelDraft.attribution}}];
  const saved=[await f.grooming.operation(sessions[0],requests[0]),await f.portal.operation(sessions[0],requests[1])];
  await prisma.$disconnect();prisma=new PrismaService();await prisma.$connect();f=services();
  assert.deepEqual((await f.grooming.consumeDraft(sessions[0],created.token)).attribution,attribution);
  assert.deepEqual((await f.hotel.consume(owners[0],selected.token)).attribution,hotelAttribution);
  for(let i=0;i<2;i++){
   const service=i?f.portal:f.grooming,table=i?prisma.petHotelPortalOperation:prisma.groomingPortalOperation;
   assert.equal((await service.operation(sessions[0],requests[i])).id,saved[i].id);
   const rows=await table.findMany({where:{ownerId:owners[0],clientKey:requests[i].clientKey}});
   assert.equal(rows.length,1);assert.deepEqual(rows[0].input.attribution,i?hotelAttribution:attribution);
  }
  const bad=await f.grooming.createDraft({breedId:breed.id,looks:[],notes:'Malformed source',attribution:{...attribution,price:1}},'qa-loopback');
  assert.equal((await f.grooming.consumeDraft(sessions[0],bad.token)).attribution,undefined);
  const snapshots=await prisma.ownerSnapshot.findMany({where:{ownerId:{in:owners}}});
  assert.equal(snapshots.length,2);assert.ok(snapshots.every(s=>s.payload.owner.fullName==='Вымышленный владелец'));
 }finally{await prisma.$disconnect();}
});
