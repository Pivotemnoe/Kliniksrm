const assert=require('node:assert/strict');const {createRequire}=require('node:module');const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');
const {PrismaClient}=req('@prisma/client');const prisma=new PrismaClient();
(async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/restore_test');
 const fingerprint=async()=>{const rows={};for(const table of ['Owner','Animal','Visit','Appointment','Bill','Payment','StockDocument','Employee']){const data=table==='Employee'?"(to_jsonb(t)-'accountScope'-'updatedAt')":"to_jsonb(t)";const values=await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count,md5(coalesce(string_agg(md5((${data})::text),'' ORDER BY id),'')) AS hash FROM "${table}" t`);rows[table]=values[0];}return rows;};
 const before=await fingerprint();
 const {initialize,prisma:other}=require('/tmp/initialize.cjs');let result;try{result=await initialize();}finally{await other.$disconnect();}
 assert.deepEqual(await fingerprint(),before);
 assert.equal(await prisma.groomingService.count({where:{catalogKey:{not:null}}}),218);
 const settings=await prisma.groomingSettings.findMany();assert.ok(settings.every(s=>s.selfBookingEnabled===false));
 const people=await prisma.employee.findMany({where:{accountScope:'GROOMING'},include:{roles:{include:{role:true}},permissionOverrides:true}});
 assert.ok(people.every(p=>p.roles.length===1&&p.roles[0].role.code==='groomer'&&!p.permissionOverrides.length));
 console.log(JSON.stringify({qualified:true,module:result,clinicalRowsPreserved:true,clinicalFingerprints:before,newGroomerPermissionsRestricted:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
