import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Render the actual portal script with fictional state; no gateway or database.
const source=readFileSync(new URL('../apps/owner-gateway/public/grooming.js',import.meta.url),'utf8');
assert.match(source,/\nvoid start\(\);\s*$/);
function render(selfBookingEnabled,bookings=[]) {
 const app={innerHTML:'',querySelectorAll:()=>[]}, controls=new Map();
 const document={querySelector(selector){
  if(selector==='#grooming-app')return app;
  if(!['#logout','#refresh','#add-pet','#booking-form'].includes(selector))return null;
  if(selector==='#booking-form'&&!app.innerHTML.includes('id="booking-form"'))return null;
  if(!controls.has(selector))controls.set(selector,{});
  return controls.get(selector);
 }};
 const context=vm.createContext({document,location:{hash:''},URLSearchParams,Intl,Date,
  sessionStorage:{getItem:()=>null},fetch(){throw Error('Network is forbidden in this UI test');}});
 vm.runInContext(source.replace(/\nvoid start\(\);\s*$/,''),context);
 context.example={owner:{fullName:'Вымышленный владелец'},selfBookingEnabled,minimumCancelMinutes:60,
  animals:[{id:'example-pet',nickname:'Бим (пример)',species:'Собака'}],bookings,
  services:[{id:'example-care',title:'Уход (пример)',priceLabel:'2 000 ₽'}],
  specialists:[{id:'example-groomer',displayName:'Мастер (пример)'}]};
 vm.runInContext('state = example; render();',context);
 return app.innerHTML;
}

test('closed self-booking provides a direct contact instead of a dead end',()=>{
 const html=render(false);
 assert.match(html,/Договоримся о визите/);
 assert.match(html,/Позвонить и записаться/);
 assert.match(html,/href="tel:\+79284214542"/);
 assert.match(html,/href="https:\/\/pet\.temichevvet\.ru\/"/);
 assert.match(html,/ул\. Каспарова, 27\/2/);
 assert.doesNotMatch(html,/Выберем удобное время\?|id="booking-form"|Показать свободное время/);
});

test('open self-booking keeps pet, service, groomer, date and time selection',()=>{
 const html=render(true);
 for(const field of ['animalId','serviceId','specialistId','date','size','coat','notes'])assert.match(html,new RegExp(`name="${field}"`));
 assert.match(html,/Мастер \(пример\)/);
 assert.match(html,/Показать свободное время/);
 assert.doesNotMatch(html,/Самостоятельная запись пока закрыта|Позвонить и записаться/);
});

test('closing new bookings preserves the upcoming visit, history and cancellation',()=>{
 const booking={id:'example-booking',status:'CONFIRMED',startsAt:new Date(Date.now()+86400000).toISOString(),
  animal:{nickname:'Бим (пример)'},serviceTitle:'Уход (пример)',employee:{fullName:'Мастер (пример)'},
  location:{name:'Салон (пример)',timezone:'Europe/Moscow'},priceLabel:'2 000 ₽',looks:[]};
 const html=render(false,[booking]);
 assert.match(html,/data-cancel="example-booking"/);
 assert.match(html,/Бим \(пример\) · Уход \(пример\)/);
 assert.match(html,/Мастер \(пример\)/);
 assert.doesNotMatch(html,/data-move=|Предстоящих записей пока нет/);
 assert.match(html,/Позвонить и записаться/);
});
