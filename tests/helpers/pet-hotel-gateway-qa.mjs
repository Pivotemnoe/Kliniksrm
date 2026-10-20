import 'reflect-metadata';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
const exec=promisify(execFile),require=createRequire(import.meta.url);
export const hotelGatewayQaSecret='synthetic-hotel-gateway-only-20261020';
export function configureHotelGatewayQa(preview=false){
  const name=preview?'pet_hotel_gateway_preview_20261020_qa':'pet_hotel_gateway_tests_20261020_qa';
  const keep=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','TZ'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  for(const key of Object.keys(process.env))delete process.env[key];
  Object.assign(process.env,keep,{NODE_ENV:'test',OWNER_GATEWAY_DATABASE_URL:`postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/${name}`,OWNER_GATEWAY_SYNC_SECRET:hotelGatewayQaSecret,OWNER_GATEWAY_SESSION_COOKIE:'hotel_gateway_qa_owner',OWNER_GATEWAY_PUBLIC_URL:'http://127.0.0.1:4313',PET_HOTEL_CRM_SYNC_ENABLED:'true',PET_HOTEL_SITE_ORIGINS:'http://127.0.0.1:4274',GROOMING_CRM_SYNC_ENABLED:'false',MAX_BOT_USERNAME:'hotel-qa-no-external-send',MAX_WEBHOOK_SECRET:hotelGatewayQaSecret,CLINIC_ASSISTANT_ENABLED:'false'});
  const original=globalThis.fetch;
  globalThis.fetch=(input,options)=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw Error('External network is disabled for hotel gateway QA');return original(input,options);};
  return name;
}
export async function prepareHotelGatewayDatabase(name){
  if(!['pet_hotel_gateway_preview_20261020_qa','pet_hotel_gateway_tests_20261020_qa'].includes(name))throw Error('Only hotel gateway QA databases are allowed');
  const args=['exec','crm-grooming-qa-20261019'];
  const exists=await exec('docker',[...args,'psql','-U','grooming_module_qa','-d','postgres','-tAc',`SELECT 1 FROM pg_database WHERE datname='${name}'`]);
  if(!exists.stdout.trim()){const {stdout}=await exec('docker',[...args,'printenv','POSTGRES_USER']);const admin=stdout.trim();if(!/^[A-Za-z0-9_]+$/.test(admin))throw Error('Invalid QA container administrator');await exec('docker',[...args,'createdb','-U',admin,'-O','grooming_module_qa',name]);}
  await exec('node',['node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/owner-gateway/prisma/schema.prisma'],{env:process.env,maxBuffer:1000000});
}
export async function hotelGatewayQaApp(port=0){
  const {Module,ValidationPipe}=require('@nestjs/common'),{NestFactory}=require('@nestjs/core');
  const {PetHotelModule}=require('../../apps/owner-gateway/dist/pet-hotel/pet-hotel.module.js');
  const {PrismaService}=require('../../apps/owner-gateway/dist/prisma.service.js');
  const {PortalPageController}=require('../../apps/owner-gateway/dist/portal-page.controller.js');
  const {PortalController}=require('../../apps/owner-gateway/dist/portal.controller.js');
  const {PortalService}=require('../../apps/owner-gateway/dist/portal.service.js');
  const {WebPushService}=require('../../apps/owner-gateway/dist/web-push.service.js');
  const {setGatewaySecurityHeaders}=require('../../apps/owner-gateway/dist/security-headers.js');
  class HotelGatewayQaApp{};Module({imports:[PetHotelModule],controllers:[PortalPageController,PortalController],providers:[PrismaService,PortalService,WebPushService]})(HotelGatewayQaApp);
  const app=await NestFactory.create(HotelGatewayQaApp,{logger:false});
  app.use((req,res,next)=>{setGatewaySecurityHeaders(res);next();});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(port,'127.0.0.1');
  const origin=await app.getUrl();process.env.OWNER_GATEWAY_PUBLIC_URL=origin;
  const prisma=app.get(PrismaService),{hashToken}=require('../../apps/owner-gateway/dist/security.js');
  const ownerId='hotel-qa-'+randomUUID(),otherOwnerId='hotel-qa-'+randomUUID();
  for(const id of [ownerId,otherOwnerId])await prisma.ownerSnapshot.create({data:{ownerId:id,displayName:'Тестовый владелец гостиницы',payload:{owner:{id,fullName:'Тестовый владелец гостиницы',phone:'+70000000000'},animals:[{id:'hotel-qa-cat',nickname:'Тестовая Мурка',species:'CAT',breed:'Домашняя кошка'}],appointments:[],messages:[],bills:[],documents:[]},sourceVersion:'hotel-gateway-qa',sourceUpdatedAt:new Date()}});
  const cookieFor=async id=>{const token=randomBytes(32).toString('hex');await prisma.portalSession.create({data:{ownerId:id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return `hotel_gateway_qa_owner=${token}`;};
  const cookie=await cookieFor(ownerId),otherCookie=await cookieFor(otherOwnerId);
  const registration=app.get(require('../../apps/owner-gateway/dist/pet-hotel/pet-hotel-registration.service.js').PetHotelRegistrationService);
  const source={schemaVersion:1,capturedAt:new Date().toISOString(),enabled:true,selfBookingEnabled:true,testMode:true,settings:{dailyRate:'700.00',walkRate:'150.00',minimumDays:2,maximumDogWeightKg:10,checkInFrom:'09:00',checkInTo:'18:00'},rooms:[...Array.from({length:8},(_,i)=>({id:`hotel-qa-cat-${i+1}`,code:`CAT-${i+1}`,name:`Номер ${i+1} для кошки`,species:'CAT',dailyRate:i===1?'900.00':'700.00',isActive:true,version:1,sortOrder:i})),...Array.from({length:4},(_,i)=>({id:`hotel-qa-dog-${i+1}`,code:`DOG-${i+1}`,name:`Номер ${i+1} для собаки`,species:'DOG',dailyRate:'700.00',isActive:true,version:1,sortOrder:8+i}))],busy:[]};
  const storefront=app.get(require('../../apps/owner-gateway/dist/pet-hotel/pet-hotel-storefront.service.js').PetHotelStorefrontService);await storefront.store(source);
  const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),startsAt=new Date(day+'T10:00:00+03:00').toISOString(),endsAt=new Date(Date.parse(startsAt)+51*3600000).toISOString();
  return {app,origin,prisma,ownerId,otherOwnerId,cookie,otherCookie,cookieFor,source,storefront,registration,selection:{species:'CAT',startsAt,endsAt,walkCount:0},hashToken,async close(){app.getHttpServer().closeAllConnections();await app.close();}};
}
