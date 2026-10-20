'use strict';
// Configure the user-approved hotel only. Existing people, pets, bookings and other modules are preserved.
const {createRequire}=require('node:module'),{createHash}=require('node:crypto');
const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');
const {PrismaClient}=req('@prisma/client');const prisma=new PrismaClient();
async function protectedModules(){
 const installation=await prisma.clinicModuleInstallation.findMany({where:{moduleKey:{not:'PET_HOTEL'}},orderBy:{id:'asc'}});
 const grooming=await prisma.groomingSettings.findMany({orderBy:{installationId:'asc'}});
 const avito=await prisma.avitoIntegration.findMany({orderBy:{id:'asc'},select:{id:true,installationId:true,accountId:true,settings:true,settingsVersion:true}});
 return createHash('sha256').update(JSON.stringify({installation,grooming,avito})).digest('hex');
}
async function initialize(){
 const {AuditService}=req('/app/apps/api/dist/modules/audit/audit.service.js');
 const {SupportService}=req('/app/apps/api/dist/modules/support/support.service.js');
 const {ClinicModulesService}=req('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
 const {PetHotelService}=req('/app/apps/api/dist/modules/pet-hotel/pet-hotel.service.js');
 const row=await prisma.employee.findFirst({where:{id:process.env.PET_HOTEL_MODULE_ACTOR_ID,status:'ACTIVE',roles:{some:{role:{code:'director'}}}},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
 if(!row)throw Error('The inspected active director is required');
 const actor={...row,roles:row.roles.map(r=>r.role.code),permissions:[...new Set(row.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))]};
 if(!actor.permissions.includes('pet_hotel.manage'))throw Error('Director hotel permission missing');
 const preserved=await protectedModules();
 const audit=new AuditService(prisma),modules=new ClinicModulesService(prisma,audit,new SupportService(prisma,audit,undefined));
 let installation=await modules.installation('PET_HOTEL');
 if(!installation.enabled)installation=await modules.setEnabled('PET_HOTEL',true,installation.version,actor.id);
 await modules.assertEnabled('PET_HOTEL');
 const service=new PetHotelService(prisma,modules,audit);
 await service.setupRooms('crm-pet-hotel-integrated-20261020-r1',actor);
 let {settings}=await service.context();
 if(!settings.selfBookingEnabled)settings=await service.saveSettings({version:settings.version,dailyRate:Number(settings.dailyRate),walkRate:Number(settings.walkRate),minimumDays:settings.minimumDays,maximumDogWeightKg:Number(settings.maximumDogWeightKg),checkInFrom:settings.checkInFrom,checkInTo:settings.checkInTo,siteUrl:settings.siteUrl,selfBookingEnabled:true,administratorMaxIds:settings.administratorMaxIds,reminderHours:settings.reminderHours},actor);
 const rooms=await prisma.petHotelRoom.findMany({where:{installationId:installation.id}});
 for(const species of ['CAT','DOG'])for(let n=1;n<=(species==='CAT'?8:4);n++)if(!rooms.some(r=>r.code===species+'-'+n&&r.species===species&&r.isActive))throw Error('Approved hotel room missing');
 if(await protectedModules()!==preserved)throw Error('Existing Grooming or Avito configuration changed');
 return {enabled:installation.enabled,selfBookingEnabled:settings.selfBookingEnabled,catRooms:rooms.filter(r=>r.species==='CAT'&&r.isActive).length,dogRooms:rooms.filter(r=>r.species==='DOG'&&r.isActive).length,siteUrl:settings.siteUrl,dailyRate:String(settings.dailyRate),walkRate:String(settings.walkRate),minimumDays:settings.minimumDays,maximumDogWeightKg:String(settings.maximumDogWeightKg),checkInFrom:settings.checkInFrom,checkInTo:settings.checkInTo,staffNotificationRecipients:settings.administratorMaxIds.length,otherModulesHash:preserved,clinicalRecordsCreated:false,credentialsChanged:false};
}
module.exports={initialize,prisma};
if(require.main===module)initialize().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
