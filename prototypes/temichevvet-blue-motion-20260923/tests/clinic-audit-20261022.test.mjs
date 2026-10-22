import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCatalog} from '../src/catalog.js';
import {clinicLeadFormOpen} from '../src/clinic-chat-ui.js';
import {priceSelectionBooking} from '../src/price-selection.js';
import {serviceCatalogItems} from '../src/service-catalog.js';

const now = Date.parse('2026-10-22T07:30:00Z');
const fixed = (id,title,price=100) => ({id,title,category:'Диагностика',price,priceType:'FIXED',minimumPrice:null,maximumPrice:null});
const data = items => ({status:'ready',currency:'RUB',updatedAt:new Date(now).toISOString(),items});

test('УЗИ matches an abbreviation, not the middle of infusion/transfusion words',()=>{
  const items=[fixed('1','УЗИ'),fixed('2','УЗИ обзорное'),fixed('3','УЗИ-диагностика'),fixed('4','Инфузия'),fixed('5','Гемотрансфузия'),fixed('6','Подкожная инфузионная терапия')];
  assert.deepEqual(new Set(filterCatalog(items,'УзИ','').map(i=>i.id)),new Set(['1','2','3']));
  assert.deepEqual(filterCatalog(items,'узи обзор','').map(i=>i.id),['2']);
  assert.deepEqual(filterCatalog(items,'инфуз','').map(i=>i.id),['4','6']);
});

test('an existing consented contact never hides the composer behind a phantom lead form',()=>{
  assert.equal(clinicLeadFormOpen(true,true),false);
  assert.equal(clinicLeadFormOpen(false,true),false);
  assert.equal(clinicLeadFormOpen(true,false),true);
  assert.equal(clinicLeadFormOpen(false,false),false);
  assert.equal(clinicLeadFormOpen(true,undefined),true);
});

test('selected public services keep current IDs, prices, ordering and a non-final estimate',()=>{
  const catalog=data([fixed('uzi','УЗИ',1035),fixed('overview','УЗИ обзорное',1380)]);
  const result=priceSelectionBooking(catalog,['overview','uzi','uzi'],now);
  assert.equal(result.count,2);
  assert.equal(result.minimum,2415);
  assert.equal(result.maximum,2415);
  assert.deepEqual(result.serviceIds,['uzi','overview']);
  assert.match(result.message,/УЗИ — 1\s035 ₽/);
  assert.match(result.message,/УЗИ обзорное — 1\s380 ₽/);
  assert.doesNotMatch(result.message,/позиция|overview/);
  assert.match(result.message,/не окончательная стоимость/);
  assert.ok(result.message.indexOf('1. УЗИ —')<result.message.indexOf('2. УЗИ обзорное —'));
});

test('selection handoff excludes unknown, zero, internal and stale catalog data',()=>{
  const catalog=data([fixed('public','УЗИ',1035),fixed('zero','Нулевая услуга',0),fixed('internal','Служебная позиция',500)]);
  const result=priceSelectionBooking(catalog,['public','zero','internal','unknown'],now);
  assert.equal(result.count,1);
  assert.doesNotMatch(result.message,/Нулевая|Служебная|unknown/);
  assert.equal(priceSelectionBooking({...catalog,updatedAt:'2020-01-01'},['public'],now),null);
  assert.equal(priceSelectionBooking(catalog,['unknown'],now),null);
  assert.equal(priceSelectionBooking(catalog,[],now),null);
});

test('a direction passes only its own currently public selected services',()=>{
  const catalog=data([
    {...fixed('uzi','УЗИ',1035),category:'Визуальная диагностика'},
    {...fixed('surgery','Кастрация',6000),category:'ОПЕРАЦИИ ОБЩЕГО ПРОФИЛЯ'},
  ]);
  const available=serviceCatalogItems(catalog.items,'diagnostics');
  const result=priceSelectionBooking({...catalog,items:available},['uzi','surgery'],now);
  assert.deepEqual(result.serviceIds,['uzi']);
  assert.equal(result.minimum,1035);
  assert.doesNotMatch(result.message,/Кастрация/);
  assert.equal(priceSelectionBooking({...catalog,items:serviceCatalogItems(catalog.items,'pharmacy')},['uzi'],now),null);
});

test('range estimates remain ranges and an oversized list is never silently truncated',()=>{
  const catalog=data([{id:'range',title:'Процедура',category:'Диагностика',priceType:'RANGE',price:null,minimumPrice:100,maximumPrice:250}]);
  const result=priceSelectionBooking(catalog,['range'],now);
  assert.equal(result.minimum,100);
  assert.equal(result.maximum,250);
  assert.match(result.message,/100 ₽ – 250 ₽/);
  const many=data(Array.from({length:50},(_,i)=>fixed(`id-${i}`,'Длинное название услуги '.repeat(8))));
  assert.equal(priceSelectionBooking(many,many.items.map(i=>i.id),now),null);
});
