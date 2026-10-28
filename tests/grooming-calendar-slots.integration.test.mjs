import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configureIndependentQa,independentFixture,independentApp,qaPassword} from './helpers/grooming-calendar-qa.mjs';
configureIndependentQa();
const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10),at=(d,t)=>`${d}T${t}:00+03:00`;
test('calendar: independent groomers, two places, any service and half-hour duration', {timeout:180000}, async t=>{
 const f=await independentFixture({reset:true}),app=await independentApp();await app.listen(0,'127.0.0.1');const base=(await app.getUrl())+'/api';
 t.after(async()=>{app.getHttpServer().closeAllConnections();await app.close();await f.close()});
 const request=async(path,body,cookie,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),headers:r.headers}};
 const signed=await request('/auth/login',{login:f.administrator.email,password:qaPassword});assert.equal(signed.status,200);const admin=signed.headers.get('set-cookie').split(';')[0];
 const ok=async(path,body,status=201,method)=>{const r=await request('/v1/grooming'+path,body,admin,method);assert.equal(r.status,status,JSON.stringify(r.data));return r.data};
 const setup=await ok('/workplaces/setup',{}),overview=await ok('/overview',undefined,200),places=overview.resources.workplaces;assert.equal(places.length,2);
 const beforeClinic=await f.prisma.employee.count({where:{accountScope:'CLINIC'}}),groomers=[];
 for(const name of['Анна','Мария','Третий грумер'])groomers.push(await ok('/specialists',{fullName:name+' · календарь QA',email:randomUUID()+'@example.local',password:qaPassword,species:['DOG','CAT']}));
 const [anna,maria,third]=groomers;assert.equal(await f.prisma.employee.count({where:{accountScope:'CLINIC'}}),beforeClinic);
 const service=await ok('/services',{title:'Комплекс · календарь QA',price:1200,priceType:'FIXED',isActive:true}),other=await ok('/services',{title:'Уход · календарь QA',price:800,priceType:'FIXED',isActive:true}),quote=await ok('/services',{title:'Особый уход · календарь QA',price:0,priceType:'QUOTE',isActive:true});
 const owner=await f.prisma.owner.create({data:{fullName:'Владелец · календарь QA',phone:'+79990006628',allowMax:false}}),pet=await f.prisma.animal.create({data:{ownerId:owner.id,nickname:'Барсик · календарь QA',species:'Собака'}});
 const shift=async(groomer,place,date=day(3),from='10:00',to='18:00')=>ok('/shifts',{employeeId:groomer.employeeId,locationId:place.locationId,workplaceId:place.id,startsAt:at(date,from),endsAt:at(date,to),kind:'WORK',isActive:true,comment:'Изолированная проверка'});
 let a,b,firstBooking;
 const body=(period,date,time,minutes=120,serviceId=service.id)=>({clientKey:randomUUID(),workPeriodId:period.id,workPeriodVersion:period.version,serviceId,ownerId:owner.id,animalId:pet.id,startsAt:at(date,time),durationMinutes:minutes,notes:'Только вымышленные данные',contactConsent:true,bookingConsent:true});
 await t.test('two parallel shifts bind two independent groomers to two places; a third cannot use either',async()=>{
  a=await shift(anna,places[0]);b=await shift(maria,places[1]);
  for(const place of places){const r=await request('/v1/grooming/shifts',{employeeId:third.employeeId,locationId:place.locationId,workplaceId:place.id,startsAt:at(day(3),'10:00'),endsAt:at(day(3),'18:00'),kind:'WORK',isActive:true,comment:''},admin);assert.equal(r.status,409,JSON.stringify(r.data));}
  const noPlace=await request('/v1/grooming/shifts',{employeeId:third.employeeId,locationId:places[0].locationId,startsAt:at(day(3),'10:00'),endsAt:at(day(3),'18:00'),kind:'WORK',isActive:true,comment:''},admin);assert.equal(noPlace.status,400);
  const rows=await ok('/shifts',undefined,200);assert.equal(rows.filter(s=>s.startsAt===a.startsAt&&s.kind==='WORK').length,2);assert.equal(await f.prisma.groomingWorkplace.count(),2);
 });
 await t.test('12:00–14:00 can hold two appointments on different places without any service setup',async()=>{
  assert.equal(await f.prisma.groomingServiceRule.count({where:{serviceId:service.id}}),0);
  const first=body(a,day(3),'12:00');firstBooking=await ok('/calendar/bookings',first);const second=await ok('/calendar/bookings',body(b,day(3),'12:00',120,other.id));
  for(const [r,employee,place]of[[firstBooking,anna,places[0]],[second,maria,places[1]]]){assert.equal(r.employeeId,employee.employeeId);assert.equal(r.workplaceId,place.id);assert.equal(Date.parse(r.endsAt)-Date.parse(r.startsAt),120*60000);assert.equal(r.blockedUntil,r.endsAt);}
  assert.equal((await ok('/calendar/bookings',first)).id,firstBooking.id);
  const repeated=await request('/v1/grooming/calendar/bookings',{...first,durationMinutes:90},admin);assert.equal(repeated.status,409);
  for(const period of[a,b]){const third=await request('/v1/grooming/calendar/bookings',body(period,day(3),'12:30',30),admin);assert.equal(third.status,409);}
  assert.equal(await f.prisma.groomingReservation.count(),2);
  assert.equal(await f.prisma.groomingServiceRule.count({where:{isActive:true}}),0,'Manual appointments must not open customer self-booking');
 });
 await t.test('any service can be scheduled for 30, 60, 90 or 120 minutes with adjacent boundaries',async()=>{
  const date=day(4),period=await shift(anna,places[0],date),minutes=[30,60,90,120],starts=['10:00','10:30','11:30','13:00'];
  for(let i=0;i<minutes.length;i++){const made=await ok('/calendar/bookings',body(period,date,starts[i],minutes[i],i%2?other.id:service.id));assert.equal(Date.parse(made.endsAt)-Date.parse(made.startsAt),minutes[i]*60000);assert.equal(made.blockedUntil,made.endsAt);}
  const invalid=await request('/v1/grooming/calendar/bookings',body(period,date,'16:00',45),admin);assert.equal(invalid.status,400);
  const quoted=await ok('/calendar/bookings',body(period,date,'16:00',30,quote.id));assert.equal(quoted.priceType,'QUOTE');assert.match(quoted.priceLabel,/Уточн/);
  assert.equal((await f.prisma.groomingService.findUnique({where:{id:service.id}})).version,service.version);
  assert.equal(Number((await f.prisma.groomingService.findUnique({where:{id:service.id}})).price),1200);
 });
 await t.test('a real break and the end of a shift bound the full appointment interval',async()=>{
  const date=day(5),period=await shift(third,places[0],date);
  await ok('/shifts',{employeeId:third.employeeId,locationId:places[0].locationId,startsAt:at(date,'12:00'),endsAt:at(date,'13:00'),kind:'BLOCK',isActive:true,comment:'Перерыв'});
  assert.equal((await request('/v1/grooming/calendar/bookings',body(period,date,'11:30',90),admin)).status,409);
  assert.equal((await request('/v1/grooming/calendar/bookings',body(period,date,'17:30',60),admin)).status,409);
  await ok('/calendar/bookings',body(period,date,'13:00',90));await ok('/calendar/bookings',body(period,date,'17:30',30));
 });
 await t.test('simultaneous writes cannot double-book one place or one groomer',async()=>{
  const date=day(6),period=await shift(maria,places[1],date),results=await Promise.all([request('/v1/grooming/calendar/bookings',body(period,date,'12:00',60),admin),request('/v1/grooming/calendar/bookings',body(period,date,'12:00',60,other.id),admin)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 });
 await t.test('an edited shift invalidates stale forms; a 24-hour shift permits its exact last half-hour',async()=>{
  const date=day(7),period=await shift(third,places[1],date);
  await ok('/shifts/'+period.id,{employeeId:third.employeeId,locationId:places[1].locationId,workplaceId:places[1].id,startsAt:at(date,'09:00'),endsAt:at(date,'18:00'),kind:'WORK',isActive:true,comment:'Новые часы',version:period.version},200,'PATCH');
  assert.equal((await request('/v1/grooming/calendar/bookings',body(period,date,'12:00',30),admin)).status,409);
  const next=day(8),schedule={clientKey:randomUUID(),employeeIds:[maria.employeeId],locationId:places[1].locationId,workplaceId:places[1].id,from:next,to:next,weekdays:[0,1,2,3,4,5,6],startsTime:'00:00',endsTime:'00:00',endsNextDay:true,excludedDates:[],comment:'Сутки'};
  assert.equal((await ok('/shifts/preview',schedule)).created,1);assert.equal((await ok('/shifts/batch',schedule)).created,1);
  const all=await ok('/shifts',undefined,200),full=all.find(s=>s.employeeId===maria.employeeId&&s.startsAt===new Date(at(next,'00:00')).toISOString());assert(full);assert.equal(Date.parse(full.endsAt)-Date.parse(full.startsAt),86400000);
  await ok('/calendar/bookings',body(full,next,'23:30',30));assert.equal((await request('/v1/grooming/calendar/bookings',body(full,next,'23:30',60),admin)).status,409);
 });
 await t.test('manual rescheduling keeps the owner, pet and agreed price; stale versions are rejected',async()=>{
  const currentService=await f.prisma.groomingService.findUnique({where:{id:service.id}});await ok('/services/'+service.id,{title:currentService.title,price:1800,priceType:'FIXED',isActive:true,version:currentService.version},200,'PATCH');
  const move={...body(a,day(3),'15:00',90),version:firstBooking.version};const moved=await ok('/calendar/bookings/'+firstBooking.id,move,200,'PATCH');assert.equal(moved.ownerId,owner.id);assert.equal(moved.animalId,pet.id);assert.equal(Number(moved.price),1200);assert.equal(Date.parse(moved.endsAt)-Date.parse(moved.startsAt),90*60000);
  assert.equal((await request('/v1/grooming/calendar/bookings/'+firstBooking.id,{...move,clientKey:randomUUID()},admin,'PATCH')).status,409);
 });
 await t.test('staff notifications and own calendars belong to the assigned groomer, and clinical data stay separate',async()=>{
  const email=(await f.prisma.user.findUnique({where:{id:(await f.prisma.employee.findUnique({where:{id:anna.employeeId}})).userId}})).email;const login=await request('/auth/login',{login:email,password:qaPassword});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const records=await request('/v1/grooming/bookings',undefined,cookie);assert.equal(records.status,200);assert(records.data.length);assert(records.data.every(b=>b.employeeId===anna.employeeId));
  const inbox=await request('/v1/grooming/staff/inbox',undefined,cookie);assert.equal(inbox.status,200);assert(inbox.data.items.some(i=>i.reservationId===firstBooking.id||i.href.endsWith(firstBooking.id)));
  assert.equal((await request('/v1/grooming/calendar/bookings',body(a,day(3),'17:00',30),cookie)).status,403);
  assert.equal(await f.prisma.appointment.count(),0);assert.equal(await f.prisma.visit.count(),0);assert.equal(await f.prisma.bill.count(),0);assert.equal(await f.prisma.employeeShift.count(),0);assert.equal(await f.prisma.groomingWorkplace.count(),2);
 });
 await t.test('optional website defaults follow the actual shift place, preserve pricing, and reject stale offers',async()=>{
  const date=day(9),period=await shift(maria,places[1],date),fresh=await ok('/services',{title:'Сайт · независимые слоты QA',price:1350,priceType:'FIXED',isActive:true});
  const config={clientKey:randomUUID(),version:fresh.version,specialistIds:[maria.id],durationMinutes:90,isActive:true};
  const made=await ok('/services/'+fresh.id+'/booking',config);assert.equal(made.durationMinutes,90);assert.equal(made.bufferMinutes,0);
  const rules=await f.prisma.groomingServiceRule.findMany({where:{serviceId:fresh.id,isActive:true}});assert(rules.length);assert(rules.every(r=>r.followShiftWorkplace&&r.durationMinutes===90&&r.stepMinutes===30));
  assert.equal(Number((await f.prisma.groomingService.findUnique({where:{id:fresh.id}})).price),1350);
  const ownerCount=await f.prisma.owner.count(),bookingCount=await f.prisma.groomingReservation.count();
  const preview=await ok('/slots/preview',{date,serviceId:fresh.id,specialistId:maria.id});assert(preview.offers.length);assert(preview.offers.every(o=>o.workplaceId===places[1].id&&Date.parse(o.endsAt)-Date.parse(o.startsAt)===5400000));
  assert.equal(await f.prisma.owner.count(),ownerCount);assert.equal(await f.prisma.groomingReservation.count(),bookingCount);
  const optionsBody={date,serviceId:fresh.id,specialistId:maria.id,ownerId:owner.id,animalId:pet.id,species:'DOG',size:'ANY',coat:'ANY'},oldOffers=await ok('/options',optionsBody);
  await ok('/shifts/'+period.id,{employeeId:maria.employeeId,locationId:places[0].locationId,workplaceId:places[0].id,startsAt:at(date,'10:00'),endsAt:at(date,'18:00'),kind:'WORK',isActive:true,comment:'Другое место',version:period.version},200,'PATCH');
  const bookingBody=offer=>({ownerId:owner.id,clientKey:randomUUID(),offerToken:offer.offerToken,notes:'',looks:[],contactConsent:true,bookingConsent:true});
  assert.equal((await request('/v1/grooming/bookings',bookingBody(oldOffers.offers[0]),admin)).status,409);
  const offers=await ok('/options',optionsBody);assert(offers.offers.length);assert(offers.offers.every(o=>o.workplaceId===places[0].id));
  const booked=await ok('/bookings',bookingBody(offers.offers[0]));assert.equal(booked.workplaceId,places[0].id);assert.equal(Date.parse(booked.endsAt)-Date.parse(booked.startsAt),5400000);
  const price=await f.prisma.groomingService.findUnique({where:{id:fresh.id}});assert.equal(Number(price.price),1350);
  assert.equal((await request('/v1/grooming/services/'+fresh.id+'/booking',{...config,clientKey:randomUUID(),version:price.version,durationMinutes:45},admin)).status,400);
 });
 await t.test('a booking crossing midnight remains visible on both calendar days',async()=>{
  const date=day(10),next=day(11),period=await ok('/shifts',{employeeId:anna.employeeId,locationId:places[0].locationId,workplaceId:places[0].id,startsAt:at(date,'20:00'),endsAt:at(next,'04:00'),kind:'WORK',isActive:true,comment:'Ночная смена'});
  const made=await ok('/calendar/bookings',body(period,date,'23:30',90));
  const r=await request('/v1/grooming/bookings?from='+encodeURIComponent(at(next,'00:00'))+'&to='+encodeURIComponent(at(next,'23:59')),undefined,admin);
  assert.equal(r.status,200);assert(r.data.some(b=>b.id===made.id));
  await f.prisma.groomingReservation.update({where:{id:made.id},data:{endsAt:new Date(at(next,'00:00')),blockedUntil:new Date(at(next,'00:30'))}});
  const buffered=await request('/v1/grooming/bookings?from='+encodeURIComponent(at(next,'00:00'))+'&to='+encodeURIComponent(at(next,'23:59')),undefined,admin);assert(buffered.data.some(b=>b.id===made.id),'A legacy preparation buffer crossing midnight still blocks the calendar');
 });

});
