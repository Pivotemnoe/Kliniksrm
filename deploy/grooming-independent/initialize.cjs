'use strict';
// Import the approved catalog and classify only a proven, existing module test identity.
// No password, client, animal, reservation, shift or phone is created or reset.
const {createRequire}=require('node:module');const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');
const {PrismaClient}=req('@prisma/client');const prisma=new PrismaClient();
async function initialize(){
 const {AuditService}=req('/app/apps/api/dist/modules/audit/audit.service.js');
 const {SupportService}=req('/app/apps/api/dist/modules/support/support.service.js');
 const {ClinicModulesService}=req('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
 const {GroomingCrmService}=req('/app/apps/api/dist/modules/grooming/grooming.service.js');
 const row=await prisma.employee.findFirst({where:{id:process.env.GROOMING_MODULE_ACTOR_ID,status:'ACTIVE',roles:{some:{role:{code:'director'}}}},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
 if(!row)throw Error('The inspected active director is required');
 const actor={...row,roles:row.roles.map(r=>r.role.code),permissions:[...new Set(row.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))]};
 if(!actor.permissions.includes('grooming.manage'))throw Error('Director grooming permission missing');
 const audit=new AuditService(prisma),modules=new ClinicModulesService(prisma,audit,new SupportService(prisma,audit,undefined));
 const installation=await modules.assertEnabled('GROOMING');
 const settingsBefore=await prisma.groomingSettings.findUniqueOrThrow({where:{installationId:installation.id}});
 let classified=0;
 await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019,2)`;
  const candidates=await tx.groomingSpecialist.findMany({where:{installationId:installation.id,employee:{accountScope:'CLINIC'}},include:{employee:{include:{roles:{include:{role:true}},permissionOverrides:true}}}});
  const references=await tx.$queryRawUnsafe(`SELECT conrelid::regclass::text AS table_name,(SELECT attname FROM pg_attribute WHERE attrelid=conrelid AND attnum=conkey[1]) AS column_name FROM pg_constraint WHERE contype='f' AND confrelid='"Employee"'::regclass AND array_length(conkey,1)=1`);
  const allowed=new Set(['RemoteAccessInvitation','RemoteAccessDevice','GroomingSpecialist','GroomingStaffNotice','GroomingPushSubscription','GroomingReservation','AuditLog','EmployeeRole']);
  for(const specialist of candidates){
   const employee=specialist.employee;
   if(employee.roles.length!==1||employee.roles[0].role.code!=='groomer'||employee.permissionOverrides.length)continue;
   if(!await tx.auditLog.count({where:{entityId:employee.id,action:'grooming.test_groomer_provision'}}))continue;
   for(const ref of references){
    if(allowed.has(ref.table_name.replaceAll('"','')))continue;
    const count=await tx.$queryRawUnsafe('SELECT count(*)::int AS n FROM '+ref.table_name+' WHERE "'+ref.column_name.replaceAll('"','""')+'"=$1',employee.id);
    if(count[0].n)throw Error('A proven test groomer has clinical references; classification requires review');
   }
   await tx.employee.update({where:{id:employee.id},data:{accountScope:'GROOMING'}});
   await audit.log({actorId:actor.id,action:'grooming.account_scope.classify',entityType:'Employee',entityId:employee.id,metadata:{from:'CLINIC',to:'GROOMING',provenance:'grooming.test_groomer_provision',credentialChanged:false}},tx);classified++;
  }
 });
 const service=new GroomingCrmService(prisma,modules,audit);
 const prices=await service.importPrices({clientKey:'grooming-independent-20261020-r1'},actor);
 const settingsAfter=await prisma.groomingSettings.findUniqueOrThrow({where:{installationId:installation.id}});
 if(JSON.stringify(settingsAfter)!==JSON.stringify(settingsBefore))throw Error('Existing grooming settings changed');
 return {enabled:installation.enabled,selfBookingEnabled:settingsAfter.selfBookingEnabled,prices,classifiedExistingModuleAccounts:classified,clinicalRecordsCreated:false,credentialsChanged:false};
}
module.exports={initialize,prisma};
if(require.main===module)initialize().then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
