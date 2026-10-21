// Runs inside the qualified clinic API image. State is saved by the release runner in its ACL-protected backup.
require('/app/node_modules/reflect-metadata');
const {PrismaClient}=require('/app/node_modules/@prisma/client');
const {createHash}=require('node:crypto'),fs=require('node:fs');
const base='/app/apps/api/dist/modules/';
const {AvitoService}=require(base+'avito/avito.service.js'),{AvitoApiClient}=require(base+'avito/avito-api.client.js');
const {AvitoCrmKnowledgeService}=require(base+'avito/avito-crm-knowledge.service.js');
const {AvitoModelGatewayClient}=require(base+'avito/avito-model-gateway.client.js');
const {AuditService}=require(base+'audit/audit.service.js');
const db=new PrismaClient(),api=new AvitoApiClient(),audit=new AuditService(db),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const mode=process.argv[2]||'plan';
const preserve=s=>({...s,profiles:s.profiles.filter(p=>p.direction==='CLINIC'),listings:s.listings.filter(l=>l.id!=='4322482374')});
(async()=>{
 if(!['plan','apply','rollback'].includes(mode))throw Error('Unknown mode');
 const i=await db.avitoIntegration.findFirstOrThrow({include:{installation:true}});
 if(i.accountId!=='367079428'||!i.installation.enabled)throw Error('Unexpected account or disabled module');
 const actors=await db.employee.findMany({where:{fullName:'Темичев Константин Валерьевич',status:'ACTIVE',roles:{some:{role:{code:'director'}}}},select:{id:true}});
 if(actors.length!==1)throw Error('Director identity is ambiguous');
 const service=new AvitoService(db,{installation:async key=>{if(key!=='avito-administrator')throw Error('Unexpected module');return i.installation}},api,audit,new AvitoCrmKnowledgeService(db),new AvitoModelGatewayClient());
 if(mode==='plan'){console.log(JSON.stringify({at:new Date(),mode,version:i.settingsVersion,directions:i.settings.profiles.map(p=>({direction:p.direction,enabled:p.enabled})),clinicHash:hash(preserve(i.settings)),...(process.argv.includes('--snapshot')?{beforeSettings:i.settings}:{}),hotelListing:'4322482374',groomingListing:null}));return}
 if(!process.argv.includes('--execute')||i.settingsVersion!==Number(process.env.AVITO_DIRECTION_EXPECTED_VERSION))throw Error('Explicit execution and exact settings version required');
 let next;
 if(mode==='rollback'){
  const saved=JSON.parse(fs.readFileSync('/tmp/avito-directions-settings-snapshot.json','utf8'));
  if(saved.integrationId!==i.id||saved.afterVersion!==i.settingsVersion||hash(i.settings)!==saved.afterHash)throw Error('Refuse rollback over later settings changes');
  next=saved.beforeSettings;
 }else{
  const own=await api.ownListings(1,'all');if(!own.items.some(x=>x.id==='4322482374'&&x.title==='Зоогостиница для кошек и собак'))throw Error('Owned hotel advertisement not verified');
  next=structuredClone(i.settings);next.profiles=next.profiles.map(p=>p.direction==='CLINIC'?p:{...p,enabled:true,prompt:p.direction==='GROOMING'
   ?'Ты — помощник груминга в Авито. Отвечай только по услугам груминга. Услуги и прайс доступны на https://pet.temichevvet.ru/. Состояние онлайн-записи проверяет сервер по собственному модулю груминга: пока нет реальных грумеров и смен, запись закрыта. Не обещай доступное время и не оформляй запись в Авито. Если человек сам просит обратный звонок, сохрани отдельное обращение груминга с его контактами. Медицинские вопросы передавай специалисту. Не используй цены, врачей и график клиники или зоогостиницы.'
   :'Ты — помощник зоогостиницы в Авито. Условия, стоимость и доступность записи проверяет сервер по модулю зоогостиницы. Сайт: https://pet.temichevvet.ru/pet-hotel/. Для выбора дат, номера и оформления брони предлагай сайт. Не подтверждай бронь в Авито и не обещай свободное место без повторной проверки на сайте. Если человек просит обратный звонок, сохрани отдельное обращение зоогостиницы с его контактами. Не смешивай услуги, прайс и сотрудников клиники или груминга.'});
  const old=next.listings.find(l=>l.id==='4322482374');
  if(old&&old.direction!=='HOTEL')throw Error('Hotel advertisement has a different assigned direction');
  if(old)old.enabled=true;else next.listings.push({id:'4322482374',title:'Зоогостиница для кошек и собак',direction:'HOTEL',enabled:true,greeting:'Здравствуйте! Что хотите уточнить об условиях зоогостиницы?',prompt:'Это объявление зоогостиницы. Бронирование оформляется на её сайте. Запрос обратного звонка сохраняется отдельно от клиники.'});
  if(hash(preserve(next))!==hash(preserve(i.settings)))throw Error('Unrelated clinic configuration changed');
 }
 const result=await service.updateSettings({version:i.settingsVersion,settings:next},actors[0].id);
 const after=await db.avitoIntegration.findUniqueOrThrow({where:{id:i.id}});
 const report={at:new Date(),mode,integrationId:i.id,beforeVersion:i.settingsVersion,afterVersion:result.version,beforeSettings:i.settings,afterHash:hash(after.settings),clinicSettingsPreserved:hash(preserve(after.settings))===hash(preserve(i.settings)),directions:after.settings.profiles.map(p=>({direction:p.direction,enabled:p.enabled})),hotelListingAttached:after.settings.listings.some(l=>l.id==='4322482374'&&l.direction==='HOTEL'&&l.enabled),groomingListingAttached:after.settings.listings.some(l=>l.direction==='GROOMING'&&l.enabled),pendingOperations:await db.avitoOutgoingOperation.count({where:{status:{in:['PENDING','SENDING','UNCERTAIN']}}})};
 console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message||'Configuration failed');process.exitCode=1}).finally(()=>db.$disconnect());
