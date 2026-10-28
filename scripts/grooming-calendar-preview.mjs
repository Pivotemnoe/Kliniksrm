// Synthetic, isolated preview. It never loads production env or external transports.
import {createServer, request as forward} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {configureIndependentQa,independentApp,independentFixture,qaPassword} from '../tests/helpers/grooming-calendar-qa.mjs';
configureIndependentQa(true);
Object.assign(process.env,{REMOTE_DEVICE_COOKIE_NAME:'grooming_slots_preview_device',GROOMING_STAFF_PUSH_ENABLED:'false'});
const out=resolve('..'),f=await independentFixture(),app=await independentApp();
await app.listen(4382,'127.0.0.1');
const call=async(path,body,cookie,method=body===undefined?'GET':'POST')=>{const r=await fetch('http://127.0.0.1:4382/api'+path,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(JSON.stringify({path,status:r.status,data}));return{data,headers:r.headers}};
const login=await call('/auth/login',{login:f.administrator.email,password:qaPassword}),cookie=login.headers.get('set-cookie').split(';')[0];
await call('/v1/grooming/workplaces/setup',{},cookie);
const state=await call('/v1/grooming/overview',undefined,cookie),places=state.data.resources.workplaces;
const groomers=[];
for(const [name,email] of [['Анна · пример','anna.slots@example.local'],['Мария · пример','maria.slots@example.local']]){
 let groomer=state.data.specialists.find(s=>s.displayName===name);
 if(!groomer)groomer=(await call('/v1/grooming/specialists',{fullName:name,email,password:qaPassword,species:['DOG','CAT']},cookie)).data;
 groomers.push(groomer);
}
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));
const at=t=>`${date}T${t}:00+03:00`,periods=[];
for(let i=0;i<2;i++){
 let period=await f.prisma.groomingWorkPeriod.findFirst({where:{specialistId:groomers[i].id,startsAt:new Date(at('10:00')),kind:'WORK',isActive:true}});
 if(!period)period=(await call('/v1/grooming/shifts',{employeeId:groomers[i].employeeId,locationId:places[i].locationId,workplaceId:places[i].id,startsAt:at('10:00'),endsAt:at('18:00'),kind:'WORK',isActive:true,comment:'Пример · только локальная проверка'},cookie)).data;
 periods.push(period);
}
const owners=[];
for(const [n,name] of [[1,'Ирина · пример'],[2,'Олег · пример']]){
 const owner=await f.prisma.owner.upsert({where:{id:`grooming-calendar-preview-owner-${n}`},create:{id:`grooming-calendar-preview-owner-${n}`,fullName:name,phone:`+7999000662${n}`,allowMax:false},update:{}});
 const pet=await f.prisma.animal.upsert({where:{id:`grooming-calendar-preview-pet-${n}`},create:{id:`grooming-calendar-preview-pet-${n}`,ownerId:owner.id,nickname:n===1?'Ричи · пример':'Боня · пример',species:'Собака'},update:{}});
 owners.push({owner,pet});
}
const services=state.data.resources.services.filter(s=>s.isActive&&s.catalogData?.species==='DOG'&&!s.catalogData?.supplement&&s.priceType==='FIXED');
for(let i=0;i<2;i++){
 const employee=await f.prisma.employee.findUnique({where:{id:groomers[i].employeeId}});
 await f.prisma.user.update({where:{id:employee.userId},data:{mustChangePassword:false}}); // Synthetic preview accounts only.
 if(!await f.prisma.groomingServiceRule.count({where:{serviceId:services[i].id,isActive:true}}))await call('/v1/grooming/services/'+services[i].id+'/booking',{clientKey:randomUUID(),version:services[i].version,specialistIds:[groomers[i].id],durationMinutes:90,isActive:true},cookie);
}
const settings=await f.prisma.groomingSettings.findUnique({where:{installationId:f.installation.id}});
if(!settings.selfBookingEnabled)await call('/v1/grooming/settings',{version:settings.version,selfBookingEnabled:true,minimumCancelMinutes:0,reminderHours:[24,2],administratorMaxIds:[]},cookie,'PATCH');
for(let i=0;i<2;i++){
 const period=periods[i],{owner,pet}=owners[i],exists=await f.prisma.groomingReservation.findFirst({where:{employeeId:groomers[i].employeeId,startsAt:new Date(at('12:00'))}});
 if(!exists)await call('/v1/grooming/calendar/bookings',{clientKey:randomUUID(),workPeriodId:period.id,workPeriodVersion:period.version,serviceId:services[i].id,ownerId:owner.id,animalId:pet.id,startsAt:at('12:00'),durationMinutes:120,notes:'Пример двух параллельных записей · вымышленные данные',contactConsent:true,bookingConsent:true},cookie);
}
await writeFile(resolve(out,'preview-access.json'),JSON.stringify({url:`http://127.0.0.1:4381/grooming/calendar?date=${date}`,administrator:f.administrator.email,password:qaPassword,groomers:groomers.map((g,i)=>({displayName:g.displayName,login:i?'maria.slots@example.local':'anna.slots@example.local'})),date},null,2),{mode:0o600});
Object.assign(process.env,{OWNER_GATEWAY_DATABASE_URL:'postgresql://grooming_slots_qa:synthetic-slots-only@127.0.0.1:55466/grooming_slots_gateway_preview_20261028',OWNER_GATEWAY_SYNC_SECRET:'grooming-slots-preview-gateway-only-20261028',OWNER_GATEWAY_SESSION_COOKIE:'grooming_slots_owner_preview',GROOMING_CRM_SYNC_ENABLED:'true',GROOMING_CLIENT_NOTIFICATIONS_ENABLED:'false',APP_URL:'http://127.0.0.1:4381'});
const require=createRequire(import.meta.url),{NestFactory}=require('@nestjs/core'),{ValidationPipe}=require('@nestjs/common'),{GroomingModule}=require('../apps/owner-gateway/dist/grooming/grooming.module.js'),{PrismaService:GatewayPrisma}=require('../apps/owner-gateway/dist/prisma.service.js'),{GroomingSyncService}=require('../apps/api/dist/modules/grooming/grooming-sync.service.js'),{hashToken}=require('../apps/owner-gateway/dist/security.js');
const gateway=await NestFactory.create(GroomingModule,{logger:false});gateway.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await gateway.listen(4384,'127.0.0.1');process.env.OWNER_GATEWAY_URL='http://127.0.0.1:4384';process.env.OWNER_GATEWAY_PUBLIC_URL='http://127.0.0.1:4381';
const g=gateway.get(GatewayPrisma),previewToken=randomUUID()+randomUUID(),{owner:previewOwner,pet:previewPet}=owners[0];
await g.ownerSnapshot.upsert({where:{ownerId:previewOwner.id},create:{ownerId:previewOwner.id,displayName:previewOwner.fullName,payload:{owner:{id:previewOwner.id,fullName:previewOwner.fullName},animals:[{id:previewPet.id,nickname:previewPet.nickname}]},sourceVersion:'calendar-preview',sourceUpdatedAt:new Date()},update:{}});
await g.portalSession.create({data:{ownerId:previewOwner.id,tokenHash:hashToken(previewToken),expiresAt:new Date(Date.now()+86400000)}});
const sync=app.get(GroomingSyncService);await sync.syncNow();const syncTimer=setInterval(()=>void sync.syncNow(),1000);syncTimer.unref();
await f.close();
const root=resolve('apps/web/dist'),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const servers=[];
for(const[port,remote]of[[4381,false],[4383,true]]){
 const server=createServer(async(req,res)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  const path=new URL(req.url,'http://localhost').pathname;
  if(!remote&&(path.startsWith('/v1/portal/grooming/')||path.startsWith('/v1/public/grooming/'))){
   const proxy=forward({hostname:'127.0.0.1',port:4384,path:req.url,method:req.method,headers:{...req.headers}},reply=>{res.writeHead(reply.statusCode,{...reply.headers,'cache-control':'no-store'});reply.pipe(res)});proxy.on('error',()=>{res.writeHead(502);res.end('Local owner gateway unavailable')});req.pipe(proxy);return;
  }
  if(!remote&&['/portal/grooming','/portal/grooming.js','/portal/grooming.css'].includes(path)){
   const file=path==='/portal/grooming'?'grooming.html':path.split('/').at(-1),data=await readFile(resolve('apps/owner-gateway/public',file));
   res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store',...(path==='/portal/grooming'?{'Set-Cookie':`grooming_slots_owner_preview=${previewToken}; Path=/; HttpOnly; SameSite=Lax`}:{})});res.end(data);return;
  }
  if(path.startsWith('/api/')){
   const headers={...req.headers,host:'127.0.0.1:4382'};delete headers['x-temichevvet-remote-access'];delete headers['x-temichevvet-gateway-secret'];
   if(remote){headers['x-temichevvet-remote-access']='1';headers['x-temichevvet-gateway-secret']=process.env.REMOTE_ACCESS_GATEWAY_SECRET;}
   const proxy=forward({hostname:'127.0.0.1',port:4382,path:req.url,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,{...reply.headers,'cache-control':'no-store'});reply.pipe(res)});
   proxy.on('error',()=>{res.writeHead(502);res.end('Local preview API unavailable')});req.pipe(proxy);return;
  }
  try{
   let file=resolve(root,'.'+decodeURIComponent(path));if(!file.startsWith(root+sep)&&file!==root)throw Error();
   let data;try{data=await readFile(file)}catch{if(extname(path)&&!path.endsWith('.html')){res.writeHead(404);res.end();return;}file=resolve(root,remote?'grooming/index.html':'index.html');data=await readFile(file);}
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(404);res.end();}
 });await new Promise(r=>server.listen(port,'127.0.0.1',r));servers.push(server);
}
console.log(`Local calendar ready: http://127.0.0.1:4381/grooming/calendar?date=${date}; two physical places, synthetic data only. Owner website flow: http://127.0.0.1:4381/portal/grooming`);
for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(syncTimer);gateway.getHttpServer().closeAllConnections();await gateway.close();for(const server of servers){server.closeAllConnections();server.close()}app.getHttpServer().closeAllConnections();await app.close();process.exit(0)});
