const assert=require('node:assert/strict'),{createRequire}=require('node:module');
const req=createRequire('/app/apps/owner-gateway/package.json');req('reflect-metadata');const {PrismaClient}=req('/app/apps/owner-gateway/dist/generated/client'),prisma=new PrismaClient();
(async()=>{
 const url=new URL(process.env.OWNER_GATEWAY_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/restore_test');
 const fingerprint=async()=>{const rows={};for(const table of ['OwnerSnapshot','MessengerBinding','PortalSession','PortalInvitation','GroomingStorefrontSnapshot','GroomingPortalOperation','OwnerNotificationDelivery']){const values=await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`);rows[table]=values[0];}return rows;};
 const before=await fingerprint();process.env.PET_HOTEL_CRM_SYNC_ENABLED='true';process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED='false';
 const {PetHotelStorefrontService}=req('/app/apps/owner-gateway/dist/pet-hotel/pet-hotel-storefront.service.js'),service=new PetHotelStorefrontService(prisma);
 const rooms=['CAT','DOG'].flatMap(species=>Array.from({length:species==='CAT'?8:4},(_,i)=>({id:species+'-'+i,code:species+'-'+(i+1),name:'Номер №'+(i+1),species,dailyRate:'700.00',isActive:true,version:1,sortOrder:i})));
 await service.store({schemaVersion:1,capturedAt:new Date().toISOString(),enabled:true,selfBookingEnabled:true,settings:{dailyRate:'700.00',walkRate:'150.00',minimumDays:2,maximumDogWeightKg:10,checkInFrom:'09:00',checkInTo:'18:00'},rooms,busy:[]});
 const result=await service.catalog();assert.equal(result.connected,true);assert.equal(result.selfBookingEnabled,true);assert.equal(result.rooms.length,12);assert.deepEqual(await fingerprint(),before);
 const intents=await prisma.petHotelDeliveryIntent.count();assert.equal(intents,0);
 console.log(JSON.stringify({qualified:true,ownerRowsPreserved:true,fingerprints:before,hotelRooms:12,sharedDeliveryIntentReady:true,externalTransportConfigured:false}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>prisma.$disconnect());
