const assert=require('node:assert/strict');const {createRequire}=require('node:module');const req=createRequire('/app/apps/owner-gateway/package.json');req('reflect-metadata');
const {PrismaClient}=req('/app/apps/owner-gateway/dist/generated/client');const prisma=new PrismaClient();
(async()=>{
 const url=new URL(process.env.OWNER_GATEWAY_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/restore_test');
 const count=async()=>({owners:await prisma.ownerSnapshot.count(),bindings:await prisma.messengerBinding.count(),sessions:await prisma.portalSession.count()});const before=await count();
 const {GroomingStorefrontService}=req('/app/apps/owner-gateway/dist/grooming/grooming-storefront.service.js');const service=new GroomingStorefrontService(prisma);
 await service.store({schemaVersion:1,capturedAt:new Date().toISOString(),enabled:true,selfBookingEnabled:false,services:[{id:'isolated-qa',title:'Проверка копии',price:'1300',priceType:'FIXED',priceLabel:'1300 ₽',bookable:false,version:1}],specialists:[],rules:[],shifts:[],busy:[]});
 const result=await service.catalog();assert.equal(result.connected,true);assert.equal(result.selfBookingEnabled,false);assert.equal(result.services[0].priceType,'FIXED');assert.deepEqual(await count(),before);
 console.log(JSON.stringify({qualified:true,ownerCountsPreserved:true,counts:before,externalTransportConfigured:false}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
