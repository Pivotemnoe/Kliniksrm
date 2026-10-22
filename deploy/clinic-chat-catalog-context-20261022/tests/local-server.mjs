// Explicitly isolated QA fixture. No production DSN and no main AppModule.
import {createRequire,Module as CjsModule} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const testRoot=dirname(fileURLToPath(import.meta.url));
const runtime=process.env.CLINIC_CONTEXT_QA_RUNTIME_ROOT||resolve(testRoot,'../../..');
const require=createRequire(join(runtime,'package.json'));
require('reflect-metadata');
const {Module,ValidationPipe}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const dist=join(runtime,'apps/owner-gateway/dist');
const {PrismaClient:GatewayDb}=require(join(dist,'generated/client/index.js'));
const {PrismaClient:CrmDb}=require('@prisma/client');
const {ClinicChatService}=require(join(dist,'clinic-chat.service.js'));
const {ClinicChatController,ClinicChatInternalController}=require(join(dist,'clinic-chat.controller.js'));
const {ClinicChatBookingService}=require(join(dist,'clinic-chat-booking.service.js'));
const {OwnerNotificationService}=require(join(dist,'owner-notification.service.js'));
const {ClinicConversationSyncService}=require(join(runtime,'apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js'));
const payload=resolve(testRoot,'../payload/clinic-chat.service.js');
const expected=JSON.parse(await readFile(resolve(testRoot,'../PATCH.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(await readFile(join(dist,'clinic-chat.service.js')))!==expected.runtimeFiles[0].beforeSha256)throw Error('Unreviewed baseline runtime');
if(sha(await readFile(payload))!==expected.runtimeFiles[0].afterSha256)throw Error('Unreviewed payload');
Object.assign(process.env,{CLINIC_ASSISTANT_ENABLED:'true',CLINIC_ASSISTANT_MODEL_ENABLED:'false',CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED:'false',CLINIC_CHAT_LEADS_ENABLED:'true',CLINIC_CHAT_PRIVACY_URL:'https://clinic.temichevvet.ru/privacy',CLINIC_CHAT_PRIVACY_VERSION:'LOCAL-QA-ONLY-20261022',OWNER_GATEWAY_COOKIE_SECURE:'false',OWNER_GATEWAY_SYNC_SECRET:'local-clinic-qa-20261022-not-production',MAX_BOT_TOKEN:'',TELEGRAM_BOT_TOKEN:'',OWNER_GATEWAY_VAPID_PUBLIC_KEY:'',OWNER_GATEWAY_VAPID_PRIVATE_KEY:''});
const gateway=new GatewayDb({datasources:{db:{url:'postgresql://clinic_qa:local-only-qa-20261022@127.0.0.1:15498/clinic_context_form_qa'}}});
const crm=new CrmDb({datasources:{db:{url:'postgresql://clinic_qa:local-only-qa-20261022@127.0.0.1:15498/clinic_context_crm_qa'}}});
const compiled=new CjsModule(join(dist,'clinic-chat.service.js'));compiled.filename=join(dist,'clinic-chat.service.js');compiled.paths=CjsModule._nodeModulePaths(dist);compiled._compile(await readFile(payload,'utf8'),compiled.filename);
const chat=new compiled.exports.ClinicChatService(gateway);
const sync=new ClinicConversationSyncService(crm);
class LocalContextModule{}
Module({controllers:[ClinicChatController,ClinicChatInternalController],providers:[{provide:ClinicChatService,useValue:chat},{provide:ClinicChatBookingService,useValue:{}},{provide:OwnerNotificationService,useValue:{}}]})(LocalContextModule);
const app=await NestFactory.create(LocalContextModule,{logger:false});app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));await app.listen(0,'127.0.0.1');
const internal=await app.getUrl();process.env.OWNER_GATEWAY_URL=internal;
const sourcePaths=[join(dist,'clinic-chat.controller.js'),join(dist,'clinic-chat.service.js'),join(runtime,'apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js'),payload];
const sourceHashes=await Promise.all(sourcePaths.map(async file=>({file,sha256:sha(await readFile(file))})));
const requests=[];
async function metrics(){return {at:new Date().toISOString(),localOnly:true,contextQa:true,databases:{gateway:'127.0.0.1:15498/clinic_context_form_qa',crm:'127.0.0.1:15498/clinic_context_crm_qa'},leads:await crm.onlineAppointmentRequest.findMany({select:{id:true,conversationId:true,conversationVersion:true,source:true,status:true,ownerId:true,appointmentId:true,conversationSnapshot:true}}),conversations:await gateway.clinicConversation.count(),ownerRecords:await crm.owner.count(),appointments:await crm.appointment.count(),assistantRuns:await gateway.clinicAssistantRun.count(),pending:(await chat.pending()).items.map(x=>({id:x.id,sequence:x.sequence})),requests,sourceHashes};}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:4235');
  if(req.method==='GET'&&url.pathname==='/qa-metrics')return json(res,200,await metrics());
  let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw Error('QA body too large');}
  if(req.method==='POST'&&url.pathname==='/qa-model-flag'){const flag=JSON.parse(body);if(typeof flag.enabled!=='boolean')return json(res,400,{error:'Boolean required'});process.env.CLINIC_ASSISTANT_MODEL_ENABLED=String(flag.enabled);return json(res,200,{localOnly:true,enabled:flag.enabled});}
  if(!new Set(['/api/chat','/api/chat/session','/api/chat/messages','/api/chat/contact']).has(url.pathname))return json(res,404,{error:'Not exposed'});
  const response=await fetch(internal+'/v1/public/assistant'+url.pathname.slice('/api/chat'.length),{method:req.method,headers:{cookie:req.headers.cookie||'','Content-Type':'application/json'},...(req.method==='POST'?{body}:{}),redirect:'manual'});
  const text=await response.text();requests.push({path:url.pathname,method:req.method,status:response.status});
  if(req.method==='POST'&&response.ok&&url.pathname!=='/api/chat/session')await sync.syncNow();
  res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store',...(response.headers.get('set-cookie')?{'Set-Cookie':response.headers.get('set-cookie')}:{})});res.end(text);
}catch(error){json(res,500,{error:error.message});}});
await new Promise((yes,no)=>{server.once('error',no);server.listen(4235,'127.0.0.1',yes);});
await mkdir(resolve(testRoot,'../evidence'),{recursive:true});
console.log(JSON.stringify({localOnly:true,pid:process.pid,frontend:'http://127.0.0.1:4235',modelRunnerRegistered:false}));
async function close(){await writeFile(resolve(testRoot,'../evidence/local-final-counts.json'),JSON.stringify({at:new Date().toISOString(),localOnly:true,leads:await crm.onlineAppointmentRequest.count(),owners:await crm.owner.count(),appointments:await crm.appointment.count(),queuedModelRuns:await gateway.clinicAssistantRun.count()},null,2)+'\n');server.close();await app.close();await gateway.$disconnect();await crm.$disconnect();process.exit(0);}
process.once('SIGTERM',close);process.once('SIGINT',close);
