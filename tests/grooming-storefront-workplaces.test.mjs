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
