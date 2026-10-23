const{createRequire}=require('node:module'),fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const req=createRequire('/app/apps/api/package.json'),{PrismaClient}=req('@prisma/client'),{PetHotelService}=req('/app/apps/api/dist/modules/pet-hotel/pet-hotel.service.js'),{AuditService}=req('/app/apps/api/dist/modules/audit/audit.service.js'),{ClinicModulesService}=req('/app/apps/api/dist/modules/clinic-modules/clinic-modules.service.js');
const url=new URL(process.env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.pathname!=='/restore_test'||url.username!=='restore_test')throw Error('Restored isolated database required');
global.fetch=async()=>{throw Error('No external transport in restored qualification');};
const db=new PrismaClient();
const tables=['Owner','Animal','Visit','Appointment','Bill','Payment','StockDocument','Employee','GroomingSettings','GroomingReservation','AvitoIntegration'];
const snapshot=async()=>{const r={};for(const table of tables)r[table]=(await db.$queryRawUnsafe(`SELECT count(*)::int AS n,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS h FROM "${table}" t`))[0];return r;};
(async()=>{const before=await snapshot();const admin=await db.employee.findFirstOrThrow({where:{status:'ACTIVE',roles:{some:{role:{code:'administrator'}}}},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
const actor={id:admin.id,roles:['administrator'],permissions:[...new Set(admin.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))]};assert(actor.permissions.includes('pet_hotel.manage'));
const audit=new AuditService(db),modules=new ClinicModulesService(db,audit,{getLicenseState:async()=>({enforcementActive:false,status:'COMPATIBILITY',features:[]})}),hotel=new PetHotelService(db,modules,audit);
const overview=await hotel.overview(actor);assert(overview.canManage);assert.equal(overview.rooms.filter(r=>r.species==='CAT').length,8);assert.equal(overview.rooms.filter(r=>r.species==='DOG').length,4);
const input={clientKey:randomUUID(),fullName:'ТЕСТ ИЗОЛИРОВАННОЙ КОПИИ '+randomUUID(),nickname:'Проверка гостиницы',species:'CAT'};
const registered=await hotel.registerClient(input,actor),retry=await hotel.registerClient(input,actor);assert.equal(registered.client.id,retry.client.id);
const extra=await hotel.registerClient({clientKey:randomUUID(),nickname:'Второй тестовый питомец',species:'DOG'},actor,registered.client.id);assert.equal(extra.client.animals.length,2);
let i=0;for(const room of overview.rooms){const value=1000+(++i)/100;const updated=await hotel.saveRoom({...room,dailyRate:value},actor,room.id);const reopened=(await hotel.overview(actor)).rooms.find(r=>r.id===room.id);assert.equal(Number(reopened.dailyRate),value);assert.equal(updated.version,room.version+1);}
const now=new Date(),day=new Date(+now+30*86400000).toISOString().slice(0,10),start=new Date(day+'T10:00:00+03:00');
const bookingInput={clientKey:randomUUID(),ownerId:registered.client.id,animalId:registered.animalId,roomId:'',startsAt:start.toISOString(),endsAt:new Date(+start+51*3600000).toISOString(),walkCount:0,notes:'Изолированная копия для приёмки релиза'};
const offer=await hotel.availability(bookingInput,now);assert(offer.rooms.length);bookingInput.roomId=offer.rooms[0].id;const booked=await hotel.book(bookingInput,actor,undefined,now);assert.equal(booked.billableDays,3);
const selected=(await hotel.overview(actor)).rooms.find(r=>r.id===booked.roomId);await hotel.saveRoom({...selected,dailyRate:7777},actor,selected.id);assert.equal(Number((await hotel.booking(booked.id)).dailyRate),Number(booked.dailyRate));
// Remove only records created by this isolated qualification; all restored clinical rows stay exact.
await db.petHotelNotification.deleteMany({where:{reservationId:booked.id}});await db.petHotelReservation.delete({where:{id:booked.id}});await db.petHotelCommandReceipt.deleteMany({where:{id:{endsWith:input.clientKey}}});await db.petHotelCommandReceipt.deleteMany({where:{id:{endsWith:bookingInput.clientKey}}});
await db.animal.deleteMany({where:{ownerId:registered.client.id}});await db.owner.delete({where:{id:registered.client.id}});
for(const room of overview.rooms)await db.petHotelRoom.update({where:{id:room.id},data:{dailyRate:room.dailyRate,version:room.version}});
const after=await snapshot();assert.deepEqual(after,before);console.log(JSON.stringify({status:'QUALIFIED',administrator:true,roomsEditedAndReopened:i,newOwnerAndPet:true,existingOwnerAdditionalPet:true,idempotency:true,rounding:true,savedBookingPriceRetained:true,protectedTablesExact:tables.length}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>db.$disconnect());
