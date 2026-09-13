import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
// Local fictional preview only. No CRM database, gateway or external messages.
const root=path.resolve(new URL('../apps/owner-gateway/public/', import.meta.url).pathname);
const animal={id:'demo-cat',nickname:'Мурка (пример)',species:'Кошка',breed:'Домашняя короткошёрстная',sex:'FEMALE',birthDate:'2021-04-10',isSterilized:true,status:'ACTIVE',weights:[{weightKg:'4.2',measuredAt:'2026-09-10T10:00:00+03:00'}],vaccinations:[{title:'Комплексная вакцинация',status:'COMPLETED',vaccinatedAt:'2025-09-20',expiresAt:'2026-09-20'}]};
const snapshot={owner:{fullName:'Демонстрационный владелец',phone:'Телефон не указан',balance:'1500'},animals:[animal,{id:'demo-dog',nickname:'Бим (пример)',species:'Собака',sex:'MALE',status:'ACTIVE',weights:[],vaccinations:[]}],appointments:[{id:'demo-appointment',startsAt:'2026-09-15T10:00:00+03:00',status:'PLANNED',animal,employee:{fullName:'Врач клиники'},room:{name:'Кабинет 1'}}],visits:[{id:'demo-visit',startedAt:'2026-09-10T10:00:00+03:00',animal,employee:{fullName:'Врач клиники'},exam:{purpose:'Плановый осмотр',anamnesis:'Вымышленные данные для проверки интерфейса.',examination:'Текст осмотра для демонстрации.',weightKg:'4.2'},diagnoses:[{title:'Предварительное заключение (пример)',diagnosisType:'Предварительный',status:'SUSPECTED'}],recommendation:{treatmentPlan:'Демонстрационный текст назначения из завершённого приёма. Не является медицинской рекомендацией.',careNotes:'Повторный осмотр по согласованию с клиникой.'},hospitalRecords:[],laboratoryOrders:[{status:'IN_PROGRESS',items:[{title:'Показатель А (пример)',resultValue:'7.0',unit:'ммоль/л',referenceRange:'3.3–6.3',status:'COMPLETED'},{title:'Показатель Б (пример)',resultValue:null,status:'PENDING'}]}],documents:[{title:'Выписка (пример)',body:'Демонстрационный документ. Не является медицинской рекомендацией.',createdAt:'2026-09-10'}]}],files:[{id:'demo-file',fileName:'Результаты (пример).pdf',animalId:animal.id,animalName:animal.nickname,archiveCategory:'Анализы',sourceLabel:'Клиника',documentDate:'2026-09-10',sizeBytes:35000}],bills:[{totalAmount:'2000',paidAmount:'500',status:'PARTIAL',createdAt:'2026-09-10',animal,items:[{title:'Услуга (пример)',quantity:'2',totalAmount:'2000'}]}],notifications:[{id:'demo-message',subject:'Результаты готовы (пример)',body:'Демонстрационное сообщение клиники.',sentAt:'2026-09-10'}]};
snapshot.laboratoryOrders=snapshot.visits.flatMap(visit=>visit.laboratoryOrders.map((order,index)=>({...order,id:`demo-lab-${index}`,animal:visit.animal,createdAt:'2026-09-12',items:order.items.map(item=>({...item,completedAt:item.status==='COMPLETED'?'2026-09-13T08:00:00Z':null}))})));
snapshot.hospitalStays=[{id:'demo-stay',status:'ACTIVE',animal:snapshot.animals[1],startedAt:'2026-09-12T08:00:00Z',updatedAt:'2026-09-13T08:00:00Z',employee:{fullName:'Врач клиники'},latestTemperature:{value:'38.4',measuredAt:'2026-09-13T08:00:00Z'},completedCare:[{type:'CARE',count:2},{type:'FEEDING',count:1}],recordsLimited:false}];
snapshot.historyLimits={visits:30,bills:30,files:200,laboratoryOrders:100,notifications:20};
const requests=[{id:'demo-request',animalId:animal.id,animalNickname:animal.nickname,preferredAt:'2026-09-15T09:00:00+03:00',createdAt:'2026-09-12',status:'IMPORTED',clinicStatus:'ACCEPTED',clinicUpdatedAt:'2026-09-13',appointment:snapshot.appointments[0]}];
const attempts=new Map();
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{try{
const u=new URL(req.url,'http://127.0.0.1');
const ref=new URL(req.headers.referer||'http://127.0.0.1');
const scenario=ref.searchParams.get('scenario');
if(req.method==='POST'&&u.pathname==='/v1/portal/booking-requests'){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)return json(res,{message:'Слишком большая заявка'},400);}
 const payload=JSON.parse(raw);const existing=attempts.get(payload.clientRequestId);
 if(existing)return json(res,existing);
 const pet=snapshot.animals.find(item=>item.id===payload.animalId);
 const request={...payload,id:`demo-new-${requests.length}`,createdAt:new Date().toISOString(),status:'NEW',animalNickname:pet?.nickname||payload.animalNickname};
 requests.unshift(request);attempts.set(payload.clientRequestId,request);
 if(scenario==='retry')return json(res,{message:'Демонстрационная потеря ответа после сохранения'},503);
 return json(res,request);
}
if(req.method!=='GET')return json(res,{message:'Демонстрационный сервер'},405);
if(u.pathname==='/v1/portal/me'){
 if(scenario==='noaccess')return json(res,{message:'Демонстрационная сессия завершена'},403);
 const data=scenario==='empty'?{owner:snapshot.owner,animals:[],appointments:[],visits:[],files:[],bills:[],notifications:[],laboratoryOrders:[],hospitalStays:[]}:snapshot;
 return json(res,{ownerId:'demo-owner',syncedAt:scenario==='stale'?'2026-09-01T09:00:00Z':new Date().toISOString(),snapshot:data});
}
if(u.pathname==='/v1/portal/booking-requests')return json(res,scenario==='empty'?[]:requests);
if(u.pathname==='/v1/portal/push/config')return json(res,{available:false});
if(u.pathname.startsWith('/v1/'))return json(res,{message:'Демонстрационный файл: скачивание не подключено'},404);
let rel=u.pathname==='/portal'||u.pathname==='/'?'index.html':u.pathname.replace(/^\/portal\//,'').replace(/^\//,'');
if(rel==='sw.js'){res.writeHead(404);res.end();return;}
const file=path.resolve(root,rel);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
}catch{res.writeHead(404);res.end();}});
server.listen(4387,'127.0.0.1',()=>console.log('Fictional owner portal preview: http://127.0.0.1:4387/portal'));
