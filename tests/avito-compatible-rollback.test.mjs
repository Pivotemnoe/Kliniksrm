import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {plainToInstance}=require('class-transformer');
const {validate}=require('class-validator');
const {GroomingBookDto}=require('../apps/api/dist/modules/grooming/grooming.dto.js');
const {HotelOwnerBookDto}=require('../apps/api/dist/modules/pet-hotel/pet-hotel-portal.dto.js');
const {PetHotelBookingDto}=require('../apps/api/dist/modules/pet-hotel/pet-hotel.dto.js');
const pair={source:'AVITO',listingId:'8339919613'};
const cases=[
 [GroomingBookDto,{clientKey:'rollback-cached-client',offerToken:'x'.repeat(64),contactConsent:true,bookingConsent:true}],
 [HotelOwnerBookDto,{animalId:'qa-pet',offerToken:'x'.repeat(64),notes:'',contactConsent:true,bookingConsent:true}],
 [PetHotelBookingDto,{clientKey:'rollback-cached-client',ownerId:'qa-owner',animalId:'qa-pet',roomId:'qa-room',startsAt:'2026-11-01T07:00:00Z',endsAt:'2026-11-03T07:00:00Z',walkCount:0,notes:''}],
];
test('the rollback receiver accepts cached clients with or without a valid source pair',async()=>{
 for(const [Dto,input]of cases)for(const attribution of [undefined,pair]){
  const dto=plainToInstance(Dto,{...input,...(attribution?{attribution}:{})});
  assert.deepEqual(await validate(dto,{whitelist:true,forbidNonWhitelisted:true}),[]);
  assert.deepEqual(dto.attribution,attribution);
 }
});
test('malformed metadata is discarded without rejecting a valid booking',async()=>{
 for(const [Dto,input]of cases)for(const attribution of [{...pair,phone:'never retain this'},{source:'AVITO',listingId:123},{source:'AVITO'},null]){
  const dto=plainToInstance(Dto,{...input,attribution});assert.deepEqual(await validate(dto,{whitelist:true,forbidNonWhitelisted:true}),[]);assert.equal(dto.attribution,undefined);
 }
});
test('accepting source metadata does not weaken the outer booking whitelist',async()=>{
 for(const [Dto,input]of cases){const dto=plainToInstance(Dto,{...input,attribution:pair,priceOverride:1});const errors=await validate(dto,{whitelist:true,forbidNonWhitelisted:true});assert.ok(errors.some(e=>e.property==='priceOverride'));}
});
