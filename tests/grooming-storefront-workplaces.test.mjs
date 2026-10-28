import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {GroomingStorefrontService}=require('../apps/owner-gateway/dist/grooming/grooming-storefront.service.js');

test('public grooming slots follow the assigned workplace and retain legacy unassigned shifts',async()=>{
 let row;
 const service=new GroomingStorefrontService({groomingStorefrontSnapshot:{upsert:async({create,update})=>{row={...create,...update,receivedAt:new Date()};},findUnique:async()=>row}});
 const now=new Date(),date=new Date(now.getTime()+86400000).toISOString().slice(0,10);
 const snapshot={schemaVersion:1,capturedAt:now.toISOString(),enabled:true,selfBookingEnabled:true,
  services:[{id:'service',title:'Уход',price:'1300',priceType:'FIXED',priceLabel:'1300 ₽',bookable:true,version:1}],
  specialists:[{id:'groomer',employeeId:'employee',displayName:'Грумер QA',species:['DOG']}],
  rules:[{id:'rule',specialistId:'groomer',employeeId:'employee',serviceId:'service',locationId:'studio',workplaceId:'place-1',species:'DOG',size:'ANY',coat:'ANY',durationMinutes:60,bufferMinutes:15,stepMinutes:15,minimumLeadMinutes:0,maximumDaysAhead:30,timezone:'Europe/Moscow',locationName:'Студия'}],
  shifts:[{specialistId:'groomer',locationId:'studio',workplaceId:'place-2',kind:'WORK',startsAt:date+'T07:00:00Z',endsAt:date+'T10:00:00Z'}],busy:[]};
 const query={serviceId:'service',date,species:'DOG',size:'ANY',coat:'ANY'};
 await service.store(snapshot);assert.equal(row.payload.shifts[0].workplaceId,'place-2');
 assert.equal((await service.availability(query,'qa-other-place',now)).slots.length,0);
 snapshot.shifts[0].workplaceId='place-1';await service.store(snapshot);
 assert.ok((await service.availability(query,'qa-assigned-place',now)).slots.length>0);
 delete snapshot.shifts[0].workplaceId;await service.store(snapshot);
 assert.equal(row.payload.shifts[0].workplaceId,null);
 assert.ok((await service.availability(query,'qa-legacy-place',now)).slots.length>0);
});


test('website defaults take the place and occupancy from each actual shift',async()=>{
 let row;const service=new GroomingStorefrontService({groomingStorefrontSnapshot:{upsert:async({create,update})=>{row={...create,...update,receivedAt:new Date()};},findUnique:async()=>row}});
 const now=new Date(),date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const snapshot={schemaVersion:1,capturedAt:now.toISOString(),enabled:true,selfBookingEnabled:true,services:[{id:'service',title:'Уход',price:'1300',priceType:'FIXED',priceLabel:'1300 ₽',bookable:true,version:1}],specialists:[{id:'groomer',employeeId:'employee',displayName:'Грумер QA',species:['DOG']}],rules:[{id:'rule',specialistId:'groomer',employeeId:'employee',serviceId:'service',locationId:'anchor-studio',workplaceId:'anchor-place',followShiftWorkplace:true,species:'DOG',size:'ANY',coat:'ANY',durationMinutes:60,bufferMinutes:0,stepMinutes:30,minimumLeadMinutes:0,maximumDaysAhead:30,timezone:'Europe/Moscow',locationName:'Старое место'}],shifts:[{specialistId:'groomer',locationId:'actual-studio',workplaceId:'place-2',kind:'WORK',startsAt:date+'T07:00:00Z',endsAt:date+'T12:00:00Z',timezone:'Europe/Moscow',locationName:'Салон',workplaceName:'Стол 2'}],busy:[{employeeId:'another-groomer',workplaceId:'place-2',startsAt:date+'T08:00:00Z',endsAt:date+'T09:00:00Z'}]};
 await service.store(snapshot);const query={serviceId:'service',date,species:'DOG',size:'ANY',coat:'ANY'},slots=(await service.availability(query,'actual-place',now)).slots;
 assert(slots.length);assert(slots.every(s=>s.durationMinutes===90&&Date.parse(s.endsAt)-Date.parse(s.startsAt)===5400000));assert(slots.every(s=>s.workplaceId==='place-2'&&s.locationName==='Салон'&&s.workplaceName==='Стол 2'));assert(!slots.some(s=>Date.parse(s.startsAt)<Date.parse(date+'T09:00:00Z')&&Date.parse(s.endsAt)>Date.parse(date+'T08:00:00Z')));
 delete snapshot.shifts[0].workplaceId;await service.store(snapshot);assert.equal((await service.availability(query,'unassigned-new-rule',now)).slots.length,0);
});
