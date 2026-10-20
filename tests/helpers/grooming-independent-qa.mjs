import 'reflect-metadata';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const qaPassword = 'LocalGroomingOnly2026!';
export function configureIndependentQa(preview = false) {
  const keep = Object.fromEntries(['PATH','HOME','TMPDIR','LANG','TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, keep, { NODE_ENV:'test', CLINIC_RUNTIME_MODE:'test', TEMICHEVVET_LICENSE_MODE:'compatibility',
    DATABASE_URL:`postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_independent_${preview ? 'preview' : 'tests'}_20261020`,
    SESSION_COOKIE_NAME:'grooming_independent_qa',SESSION_COOKIE_SECURE:'false',GROOMING_QA_MODE:'true',GROOMING_CRM_SYNC_ENABLED:'false',
    GROOMING_CLIENT_NOTIFICATIONS_ENABLED:'false',CLINIC_ASSISTANT_ENABLED:'false',AVITO_WORKER_ENABLED:'false',
    CLINIC_SITE_CATALOG_SYNC_ENABLED:'false',CLINIC_ASSISTANT_REMINDERS_ENABLED:'false',
    REMOTE_STAFF_PUBLIC_URL:'http://localhost:4303',REMOTE_ACCESS_GATEWAY_SECRET:'independent-local-gateway-only',
    GROOMING_BOOKING_SIGNING_SECRET:'independent-local-booking-signing-only',
    REMOTE_DEVICE_COOKIE_SECURE:'false' });
  const original = globalThis.fetch;
  globalThis.fetch = (input, options) => { const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw Error('External transport disabled in independent grooming QA'); return original(input, options); };
}
export async function independentFixture({reset=false}={}) {
  const {PrismaClient}=require('@prisma/client');
  const {PasswordService}=require('../../apps/api/dist/modules/auth/password.service.js');
  const prisma=new PrismaClient();
  const parsed=new URL(process.env.DATABASE_URL);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='55440'||!/^\/grooming_independent_(tests|preview)_20261020$/.test(parsed.pathname))throw Error('Dedicated independent QA database required');
  if(reset){
    if(parsed.pathname!=='/grooming_independent_tests_20261020')throw Error('Only the disposable test database may reset');
    const tables=await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe('TRUNCATE '+tables.map(row=>'"'+row.tablename.replaceAll('"','""')+'"').join(',')+' CASCADE');
  }
  for(const code of ['grooming.read','grooming.operate','grooming.manage','grooming.schedule','modules.manage'])await prisma.permission.upsert({where:{code},create:{code,title:code},update:{}});
  const organization=await prisma.organization.upsert({where:{id:'grooming-independent-qa-org'},create:{id:'grooming-independent-qa-org',displayName:'Локальный груминг · проверка'},update:{}});
  const hash=await new PasswordService().hashPassword(qaPassword);
  const people={};
  for(const [code,title] of [['director','Директор · локальная проверка'],['administrator','Администратор · локальная проверка']]){
    const role=await prisma.role.upsert({where:{code},create:{code,title},update:{}});
    const permissions=await prisma.permission.findMany({where:{OR:[{code:{startsWith:'grooming.'}},{code:'modules.manage'}]}});
    for(const permission of permissions.filter(p=>code==='director'||p.code.startsWith('grooming.')))await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});
    for(const code of ['employees.read','appointments.read']){const permission=await prisma.permission.upsert({where:{code},create:{code,title:code},update:{}});await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});}
    const email=`independent-${code}@example.local`;
    const user=await prisma.user.upsert({where:{email},create:{email,passwordHash:hash},update:{passwordHash:hash}});
    const employee=await prisma.employee.upsert({where:{userId:user.id},create:{userId:user.id,fullName:title,defaultRoute:'/grooming/calendar',roles:{create:{roleId:role.id}}},update:{}});people[code]={...employee,email};
  }
  const role=await prisma.role.upsert({where:{code:'groomer'},create:{code:'groomer',title:'Грумер'},update:{}});
  for(const code of ['grooming.read','grooming.operate']){const permission=await prisma.permission.findUniqueOrThrow({where:{code}});await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},create:{roleId:role.id,permissionId:permission.id},update:{}});}
  const installation=await prisma.clinicModuleInstallation.upsert({where:{organizationId_moduleKey:{organizationId:organization.id,moduleKey:'GROOMING'}},create:{organizationId:organization.id,moduleKey:'GROOMING',enabled:true},update:{enabled:true}});
  await prisma.groomingSettings.upsert({where:{installationId:installation.id},create:{installationId:installation.id},update:{}});
  await prisma.remoteAccessPolicy.upsert({where:{organizationId:organization.id},create:{organizationId:organization.id,enabled:true},update:{enabled:true}});
  return {prisma,...people,installation,close:()=>prisma.$disconnect()};
}
export async function independentApp() {
  const {Module,ValidationPipe}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core');
  const imports=[['prisma/prisma.module','PrismaModule'],['modules/auth/auth.module','AuthModule'],['modules/grooming/grooming.module','GroomingCrmModule'],['modules/clinic-modules/clinic-modules.module','ClinicModulesModule'],['modules/employees/employees.module','EmployeesModule'],['modules/scheduling/scheduling.module','SchedulingModule'],['modules/remote-access/remote-access.module','RemoteAccessModule'],['modules/health/health.module','HealthModule'],['modules/staff-alerts/staff-alerts.module','StaffAlertsModule'],['modules/internal-messages/internal-messages.module','InternalMessagesModule'],['modules/live-updates/live-updates.module','LiveUpdatesModule']].map(([file,name])=>require('../../apps/api/dist/'+file+'.js')[name]);
  class QaApp{};Module({imports})(QaApp);
  const app=await NestFactory.create(QaApp,{logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));return app;
}
