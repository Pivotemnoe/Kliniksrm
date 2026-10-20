const assert=require('node:assert/strict'),{createRequire}=require('node:module');
const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');const {PrismaClient}=req('@prisma/client'),prisma=new PrismaClient();
(async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/restore_test');
 const fingerprint=async()=>{const rows={};for(const table of ['Owner','Animal','Visit','Appointment','Bill','Payment','StockDocument','Employee','GroomingSettings','GroomingReservation','AvitoIntegration']){const values=await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS hash FROM "${table}" t`);rows[table]=values[0];}return rows;};
 const before=await fingerprint();const {initialize,prisma:other}=require('/tmp/initialize.cjs');let result;
 try{result=await initialize();const again=await initialize();assert.deepEqual(again,result);}finally{await other.$disconnect();}
 assert.deepEqual(await fingerprint(),before);assert.equal(result.catRooms,8);assert.equal(result.dogRooms,4);assert.equal(result.enabled,true);assert.equal(result.selfBookingEnabled,true);
 assert.equal(result.dailyRate,'700');assert.equal(result.walkRate,'150');assert.equal(result.minimumDays,2);assert.equal(result.maximumDogWeightKg,'10');
 assert.equal(await prisma.petHotelReservation.count(),0);assert.equal(await prisma.petHotelNotification.count(),0);
 console.log(JSON.stringify({qualified:true,module:result,clinicalRowsPreserved:true,clinicalFingerprints:before,initializerIdempotent:true,externalTransportConfigured:false}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>prisma.$disconnect());
