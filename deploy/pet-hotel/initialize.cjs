const {createRequire}=require('node:module');
const req=createRequire('/app/apps/api/package.json');req('reflect-metadata');
const {PrismaClient}=req('@prisma/client');
const {AuditService}=req('/app/apps/api/dist/modules/audit/audit.service.js');
const {SupportService}=req('/app/apps/api/dist/modules/support/support.service.js');
const {ClinicModulesService}=req('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const {PetHotelService}=req('/app/apps/api/dist/modules/pet-hotel/pet-hotel.service.js');
const db=new PrismaClient();
async function initialize(){
  const employee=await db.employee.findUniqueOrThrow({where:{id:process.env.PET_HOTEL_ACTOR_ID},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
  const actor={...employee,roles:employee.roles.map(r=>r.role.code),permissions:[...new Set(employee.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))]};
  if(employee.status!=='ACTIVE'||!actor.roles.includes('director')||!actor.permissions.includes('modules.manage')||!actor.permissions.includes('pet_hotel.manage'))throw Error('Active authorized director required');
  const audit=new AuditService(db),support=new SupportService(db,audit,{}),modules=new ClinicModulesService(db,audit,support),hotel=new PetHotelService(db,modules,audit);
  if(!await modules.entitlement('PET_HOTEL'))throw Error('PET_HOTEL entitlement unavailable');
  const before=await db.clinicModuleInstallation.findMany({where:{moduleKey:{in:['GROOMING','avito-administrator']}},orderBy:{moduleKey:'asc'}});
  await hotel.setupRooms('crm-pet-hotel-20261020-r1-setup',actor);
  const installation=await modules.installation('PET_HOTEL');
  if(!installation.enabled)await modules.setEnabled('PET_HOTEL',true,installation.version,actor.id);
  const overview=await hotel.overview(actor);
  if(overview.stats.catRooms!==8||overview.stats.dogRooms!==4||overview.limited)throw Error('Approved room configuration differs');
  const after=await db.clinicModuleInstallation.findMany({where:{moduleKey:{in:['GROOMING','avito-administrator']}},orderBy:{moduleKey:'asc'}});
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Another module changed');
  return {module:'PET_HOTEL',enabled:overview.installation.enabled,stats:overview.stats,siteUrl:overview.settings.siteUrl,sitePublished:false,dailyRate:String(overview.settings.dailyRate),walkRate:String(overview.settings.walkRate),otherModulesPreserved:true};
}
module.exports={initialize,db};
if(require.main===module)initialize().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
