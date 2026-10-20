// Read-only contract fixture. This is not the clinic processor and cannot book a stay.
import {mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {configureHotelGatewayQa,prepareHotelGatewayDatabase,hotelGatewayQaApp} from '../tests/helpers/pet-hotel-gateway-qa.mjs';
if(!process.argv.includes('--fixture-readonly'))throw Error('Explicit --fixture-readonly required; this server cannot run against production');
const name=configureHotelGatewayQa(true);await prepareHotelGatewayDatabase(name);const f=await hotelGatewayQaApp(4313);
const token=randomBytes(32).toString('hex');
await f.prisma.portalInvitation.create({data:{ownerId:f.ownerId,tokenHash:f.hashToken(token),channel:'WEB',expiresAt:new Date(Date.now()+86400000)}});
const folder='output/pet-hotel-booking-20261020';await mkdir(folder,{recursive:true});
await writeFile(folder+'/preview-access.json',JSON.stringify({mode:'READ_ONLY_GATEWAY_CONTRACT_FIXTURE_NOT_CLINIC_BOOKING',site:'http://127.0.0.1:4274/pet-hotel/#estimate',portal:f.origin+'/portal/pet-hotel',activate:f.origin+'/portal?token='+token,source:'Synthetic room prices; fixture cannot process BOOK/RESCHEDULE/CANCEL/PET_CREATE'},null,2),{mode:0o600});
const {createRequire}=await import('node:module'),require=createRequire(import.meta.url);
const {PetHotelPortalService}=require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-portal.service.js'),portal=f.app.get(PetHotelPortalService);
let running=false;
const timer=setInterval(async()=>{
  if(running)return;running=true;
  try{
    f.source.capturedAt=new Date().toISOString();await f.storefront.store(f.source);
    for(const item of (await portal.pending()).items){
      if(item.kind==='STATE')await portal.complete(item.id,{status:'DONE',result:{owner:{fullName:'Тестовый владелец гостиницы'},animals:[{id:'hotel-qa-cat',nickname:'Тестовая Мурка',species:'CAT',breed:'Домашняя кошка'}],bookings:[],settings:f.source.settings,selfBookingEnabled:true,mode:'qa',bridgeReady:false}});
      else if(item.kind==='OPTIONS'){
        const {hotelSelection,hotelQuote}=require('../apps/owner-gateway/dist/pet-hotel/pet-hotel-contract.js');
        try{const selection=hotelSelection(item.input,f.source.settings);await portal.complete(item.id,{status:'DONE',result:{enabled:true,rooms:f.source.rooms.filter(r=>r.species===selection.species).map(r=>({...r,quote:hotelQuote(r.dailyRate,f.source.settings.walkRate,selection),offerToken:'qa-readonly-not-bookable-'+r.id,expiresAt:new Date(Date.now()+300000).toISOString()})),notice:'Тест внешнего контракта. Клинический обработчик брони ещё не подключён.'}});}catch(e){await portal.complete(item.id,{status:'FAILED',error:e.message.slice(0,300)});}
      }else await portal.complete(item.id,{status:'FAILED',error:'Этот стенд проверяет только интерфейс и шлюз. Создание/изменение брони требует клинического обработчика.'});
    }
  }finally{running=false;}
},800);
console.log('Hotel gateway fixture on http://127.0.0.1:4313; read-only clinic contract; all external transports blocked.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await f.close();process.exit(0);});
