import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureHotelQa, hotelQaApp } from './helpers/pet-hotel-qa-app.mjs';
configureHotelQa();
const { hotelFixture, qaPassword } = await import('./helpers/pet-hotel-fixture.mjs');
const rejectsStatus = (promise, status) => assert.rejects(promise, e => e.getStatus?.() === status);

test('independent pet hotel: persisted bookings, money, races, module boundaries and HTTP roles', { timeout:90000 }, async t => {
  const f = await hotelFixture(); let app;
  t.after(async () => { await app?.close(); await f.close(); });
  const moduleBefore = await f.prisma.clinicModuleInstallation.findMany({where:{moduleKey:{in:['GROOMING','avito-administrator']}},orderBy:{moduleKey:'asc'}});
  const clinicalBefore = await Promise.all([f.prisma.appointment.count(), f.prisma.groomingReservation.count()]);
  const cat1 = f.rooms.find(r => r.code === 'CAT-1'), cat2 = f.rooms.find(r => r.code === 'CAT-2'), dog1 = f.rooms.find(r => r.code === 'DOG-1');
  let saved, originalInput;
  await t.test('explicit 8+4 setup is repeatable and preserves edited names', async () => {
    assert.equal(f.rooms.filter(r => r.species === 'CAT').length, 8); assert.equal(f.rooms.filter(r => r.species === 'DOG').length, 4);
    await f.service.saveRoom({ ...cat2, name:'Кошачий бокс №2 · проверено' }, f.director, cat2.id);
    const key=randomUUID(); await f.service.setupRooms(key,f.director); await f.service.setupRooms(key,f.director);
    assert.equal(await f.prisma.petHotelRoom.count(),12); assert.equal((await f.prisma.petHotelRoom.findUniqueOrThrow({where:{id:cat2.id}})).name,'Кошачий бокс №2 · проверено');
  });
  await t.test('2 days plus 3 hours costs 3 days; idempotent save persists exact cents', async () => {
    const input=f.booking(); originalInput=input; const preview=await f.service.availability(input,f.now);
    assert.equal(preview.quote.billableDays,3); assert.equal(preview.quote.totalPrice,'2100.00');
    saved=await f.service.book(input,f.administrator,undefined,f.now);
    assert.equal(String(saved.totalPrice),'2100'); assert.equal(saved.billableDays,3);
    assert.equal((await f.service.book(input,f.administrator,undefined,f.now)).id,saved.id);
    await rejectsStatus(f.service.book({...input,notes:'Different'},f.administrator,undefined,f.now),409);
    assert.equal((await f.service.booking(saved.id)).notes,input.notes);
    assert.equal(await f.prisma.petHotelReservation.count({where:{id:saved.id}}),1);
  });
  await t.test('concurrent reservations cannot occupy one room twice', async () => {
    const a=f.booking({roomId:cat2.id}), b=f.booking({roomId:cat2.id,ownerId:f.otherOwner.id,animalId:f.otherAnimal.id});
    // First animal is already booked in CAT-1; use an unrelated interval for both contenders.
    for(const input of [a,b]) { input.startsAt=new Date(f.start.getTime()+10*86400000).toISOString(); input.endsAt=new Date(f.start.getTime()+12*86400000).toISOString(); }
    const results=await Promise.allSettled([f.service.book(a,f.administrator,undefined,f.now),f.service.book(b,f.administrator,undefined,f.now)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(results.find(r=>r.status==='rejected').reason.getStatus(),409);
  });
  await t.test('owner, species, dog weight, cats, minimum stay and check-in hours are enforced', async () => {
    await rejectsStatus(f.service.availability(f.booking({ownerId:f.otherOwner.id}),f.now),404);
    await rejectsStatus(f.service.availability(f.booking({animalId:f.dog.id,weightKg:11}),f.now),400);
    await rejectsStatus(f.service.availability(f.booking({walkCount:1}),f.now),400);
    await rejectsStatus(f.service.availability(f.booking({endsAt:new Date(f.start.getTime()+47*3600000).toISOString()}),f.now),400);
    await rejectsStatus(f.service.availability(f.booking({startsAt:f.start.toISOString().slice(0,10)+'T20:00:00+03:00'}),f.now),400);
    await rejectsStatus(f.service.book(f.booking({ownerId:f.otherOwner.id,animalId:f.otherAnimal.id,roomId:dog1.id}),f.administrator,undefined,f.now),409);
    const input=f.booking({animalId:f.dog.id,roomId:dog1.id,weightKg:10,walkCount:4});
    const quote=await f.service.availability(input,f.now); assert.equal(quote.quote.totalPrice,'2700.00'); assert.equal(quote.quote.walksPrice,'600.00');
    const dog=await f.service.book(input,f.administrator,undefined,f.now); assert.equal(dog.billableDays,3);
  });
  await t.test('rate changes do not rewrite saved bookings or their amendments; stale versions fail', async () => {
    const overview=await f.service.overview(f.director), s=overview.settings;
    await f.service.saveSettings({version:s.version,dailyRate:800.25,walkRate:175.5,minimumDays:s.minimumDays,maximumDogWeightKg:Number(s.maximumDogWeightKg),checkInFrom:s.checkInFrom,checkInTo:s.checkInTo,siteUrl:s.siteUrl},f.director);
    const change=f.booking({version:saved.version,endsAt:new Date(f.start.getTime()+75*3600000).toISOString()});
    const next=await f.service.book(change,f.administrator,saved.id,f.now); assert.equal(String(next.dailyRate),'700'); assert.equal(String(next.totalPrice),'2800');
    await rejectsStatus(f.service.book({...change,clientKey:randomUUID()},f.administrator,saved.id,f.now),409); saved=next;
    const newQuote=await f.service.availability(f.booking({ownerId:f.otherOwner.id,animalId:f.otherAnimal.id,roomId:cat2.id}),f.now); assert.equal(newQuote.quote.totalPrice,'2400.75');
    await rejectsStatus(f.service.saveRoom({...cat1,isActive:false},f.director,cat1.id),409);
  });
  await t.test('check-in/out, overdue occupancy and disabled module retain history safely', async () => {
    await rejectsStatus(f.service.status(saved.id,{clientKey:randomUUID(),version:saved.version,status:'IN_HOUSE'},f.administrator,f.now),400);
    const checkInInput={clientKey:randomUUID(),version:saved.version,status:'IN_HOUSE'};
    saved=await f.service.status(saved.id,checkInInput,f.administrator,new Date(f.start.getTime()+3600000));
    const late=new Date(f.start.getTime()+6*86400000); const occupied=await f.service.availability(f.booking({ownerId:f.otherOwner.id,animalId:f.otherAnimal.id,startsAt:late.toISOString(),endsAt:new Date(+late+2*86400000).toISOString()}),late);
    assert.ok(!occupied.rooms.some(r=>r.id===cat1.id));
    const installation=await f.modules.installation('PET_HOTEL'); await f.modules.setEnabled('PET_HOTEL',false,installation.version,f.director.id);
    assert.equal((await f.service.book(originalInput,f.administrator,undefined,f.now)).id,saved.id);
    assert.equal((await f.service.status(saved.id,checkInInput,f.administrator,f.start)).id,saved.id);
    assert.equal((await f.service.overview(f.administrator)).limited,true); assert.equal((await f.service.booking(saved.id)).status,'IN_HOUSE');
    await rejectsStatus(f.service.book(f.booking(),f.administrator,undefined,f.now),403);
    const reserved=await f.prisma.petHotelReservation.findFirstOrThrow({where:{status:'RESERVED'}});
    await rejectsStatus(f.service.status(reserved.id,{clientKey:randomUUID(),version:reserved.version,status:'IN_HOUSE'},f.administrator,f.start),403);
    await f.service.status(reserved.id,{clientKey:randomUUID(),version:reserved.version,status:'CANCELLED'},f.administrator,f.start);
    const key=randomUUID(),input={clientKey:key,version:saved.version,status:'CHECKED_OUT'};
    const out=await f.service.status(saved.id,input,f.administrator,late); assert.equal(out.status,'CHECKED_OUT'); assert.ok(out.actualCheckOutAt);
    assert.equal((await f.service.status(saved.id,input,f.administrator,late)).id,out.id);
    const latest=await f.modules.installation('PET_HOTEL'); await f.modules.setEnabled('PET_HOTEL',true,latest.version,f.director.id);
    f.license.enforcementActive=true; f.license.status='VALID'; f.license.features=['GROOMING'];
    await rejectsStatus(f.service.book(f.booking(),f.administrator,undefined,f.now),403);
    await rejectsStatus(f.modules.setEnabled('PET_HOTEL',true,latest.version+1,f.director.id),403);
    f.license.enforcementActive=false;
  });
  await t.test('real HTTP authentication, validation, role separation and toggle version checks', async () => {
    app=await hotelQaApp(); await app.listen(0,'127.0.0.1'); const base=(await app.getUrl())+'/api';
    const request=async(path,{method='GET',body,cookie}={})=>{const r=await fetch(base+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
    const login=async e=>{const r=await request('/auth/login',{method:'POST',body:{login:e.email,password:qaPassword}});assert.equal(r.status,200,JSON.stringify(r.data));return r.cookie;};
    const director=await login(f.director),admin=await login(f.administrator),viewer=await login(f.viewer),groomer=await login(f.groomer);
    assert.equal((await request('/v1/pet-hotel/overview')).status,401);
    assert.equal((await request('/v1/pet-hotel/overview',{cookie:viewer})).status,200);
    assert.equal((await request('/v1/pet-hotel/overview',{cookie:groomer})).status,403);
    assert.equal((await request('/v1/pet-hotel/bookings',{method:'POST',cookie:viewer,body:f.booking()})).status,403);
    assert.equal((await request('/v1/pet-hotel/rooms/setup',{method:'POST',cookie:admin,body:{clientKey:randomUUID()}})).status,403);
    assert.equal((await request('/v1/pet-hotel/bookings',{method:'POST',cookie:admin,body:{...f.booking(),walkCount:-1}})).status,400);
    const streamAbort=new AbortController(); let eventTimer;
    try {
      const stream=await fetch(base+'/v1/live-updates?clientId=hotel-reader',{headers:{cookie:admin},signal:streamAbort.signal});
      assert.equal(stream.status,200); const reader=stream.body.getReader();
      const event=(async()=>{let text='';while(true){const part=await reader.read();if(part.done)throw Error('SSE closed before hotel update');text+=new TextDecoder().decode(part.value);const line=text.split('\n').find(s=>s.startsWith('data:')&&s.includes('"scope":"pet-hotel"'));if(line)return JSON.parse(line.slice(5));}})();
      const setup=await fetch(base+'/v1/pet-hotel/rooms/setup',{method:'POST',headers:{cookie:director,'content-type':'application/json','x-temichevvet-client-id':'hotel-writer'},body:JSON.stringify({clientKey:randomUUID()})});assert.equal(setup.status,201);
      const delivered=await Promise.race([event,new Promise((_,reject)=>{eventTimer=setTimeout(()=>reject(Error('No live hotel event')),5000);})]);
      assert.equal(delivered.scope,'pet-hotel');assert.equal(delivered.sourceClientId,'hotel-writer');
    } finally {clearTimeout(eventTimer);streamAbort.abort();}
    const current=await f.modules.installation('PET_HOTEL');
    assert.equal((await request('/v1/clinic-modules/PET_HOTEL',{method:'PATCH',cookie:director,body:{enabled:false,version:current.version-1}})).status,409);
    const r=await request('/v1/clinic-modules/PET_HOTEL',{method:'PATCH',cookie:director,body:{enabled:false,version:current.version}});assert.equal(r.status,200,JSON.stringify(r.data));
    const availability=await request('/v1/clinic-modules/availability',{cookie:admin}); assert.equal(availability.status,200); assert.equal(availability.data.find(x=>x.key==='PET_HOTEL').available,false);
    assert.equal((await request('/v1/pet-hotel/bookings',{cookie:admin})).status,200);
    await f.modules.setEnabled('PET_HOTEL',true,r.data.version,f.director.id);
  });
  await t.test('hotel commands write audit without modifying clinical or grooming records', async () => {
    assert.deepEqual(await Promise.all([f.prisma.appointment.count(),f.prisma.groomingReservation.count()]),clinicalBefore);
    assert.deepEqual(await f.prisma.clinicModuleInstallation.findMany({where:{moduleKey:{in:['GROOMING','avito-administrator']}},orderBy:{moduleKey:'asc'}}),moduleBefore);
    assert.ok(await f.prisma.auditLog.count({where:{action:{startsWith:'pet_hotel.'}}})>5);
  });
});
