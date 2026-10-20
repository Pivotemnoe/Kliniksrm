// Runs only beside the disposable restored DB, in its network-isolated namespace.
const {createRequire}=require('node:module');const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');
const {PrismaClient}=req('@prisma/client');const db=new PrismaClient();
const {petHotelQuote}=req('/app/apps/api/dist/modules/pet-hotel/pet-hotel.pricing.js');
(async()=>{
  const assert=require('node:assert/strict');
  const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/restore_test');
  const counts=async()=>{const out={};for(const m of ['owner','animal','visit','appointment','bill','payment','stockDocument','groomingReservation','avitoInquiry'])out[m]=await db[m].count();return out;};
  const before=await counts();const q=petHotelQuote(new Date('2030-01-01T10:00:00+03:00'),new Date('2030-01-03T13:00:00+03:00'),700,150,4,2);assert.equal(q.billableDays,3);assert.equal(q.totalPrice,'2700.00');
  const {initialize,db:other}=require('/tmp/initialize.cjs');let result;try{result=await initialize();}finally{await other.$disconnect();}
  assert.deepEqual(await counts(),before);assert.equal(await db.petHotelReservation.count(),0);
  console.log(JSON.stringify({qualified:true,quote:q,module:result,clinicalCountsPreserved:true,counts:before}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
