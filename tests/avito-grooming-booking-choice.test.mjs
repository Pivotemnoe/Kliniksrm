import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {defaultAvitoSettings}=require('../apps/api/dist/modules/avito/avito.settings.js');
const {decideAvitoReply}=require('../apps/api/dist/modules/avito/avito.policy.js');
const {petServiceAnswer}=require('../apps/api/dist/modules/avito/avito-pet-services.js');
const settings=defaultAvitoSettings();
settings.profiles.find(p=>p.direction==='GROOMING').enabled=true;
settings.listings=[{id:'groom-choice',title:'Груминг',direction:'GROOMING',enabled:true}];
const petService={direction:'GROOMING',available:true,selfBookingEnabled:true,siteUrl:'https://pet.temichevvet.ru/',address:null};
const reply=(text,extra={})=>decideAvitoReply({settings,listingId:'groom-choice',text,messageId:'incoming',petService,now:new Date('2026-10-21T09:00:00Z'),...extra});

test('booking starts with a choice without collecting contacts or forcing a website visit',()=>{
 const d=reply('Хочу записать собаку на стрижку');
 assert.match(d.text,/самостоятельно на сайте.*заявку здесь.*администратор позвонил/s);
 assert.equal(d.contact.bookingChoiceOffered,true);assert.equal(d.contact.collecting,undefined);
 assert.equal(d.createInquiry,false);assert.equal(d.handoff,false);assert.doesNotMatch(d.text,/https:|Как к вам обращаться/);
});
test('a short website selection remembers the channel without authorizing a callback',()=>{
 const first=reply('Хочу записаться');
 for(const text of ['На сайте','Самостоятельно','Сама']){
  const d=reply(text,{contact:{...first.contact,name:'Анна',phone:'+79001112233',callbackAt:'old',callbackMessageId:'old'}});
  assert.equal(d.contact.bookingChannel,'WEBSITE');assert.equal(d.petServiceChannel,'WEBSITE');
  assert.equal(d.contact.collecting,undefined);assert.equal(d.contact.callbackMessageId,undefined);
  assert.ok(d.text.includes(petService.siteUrl));assert.equal(d.createInquiry,false);
  assert.equal(d.text,petServiceAnswer(petService,text,true,'WEBSITE'));
  const again=reply('Хочу выбрать время',{contact:d.contact});assert.ok(again.text.includes(petService.siteUrl));assert.doesNotMatch(again.text,/Как вам удобнее/);
 }
});
test('here means callback after the choice; channel words are never mistaken for a name',()=>{
 const first=reply('Хочу записаться');
 for(const text of ['Здесь','Тут','В Авито','Через администратора']){
  const d=reply(text,{contact:first.contact});
  assert.equal(d.contact.bookingChannel,'CALLBACK');assert.equal(d.contact.collecting,true);
  assert.equal(d.contact.name,undefined);assert.equal(d.createInquiry,false);assert.doesNotMatch(d.text,/https:|Как вам удобнее/);
  const named=reply('Анна',{contact:d.contact});assert.equal(named.contact.name,'Анна');assert.equal(named.createInquiry,false);
  const done=reply('Мой номер +7 900 111-22-33',{contact:named.contact,messageId:'real-phone-source'});
  assert.equal(done.createInquiry,true);assert.equal(done.contact.callbackMessageId,'real-phone-source');
  assert.match(done.text,/администратору груминга/);assert.match(done.text,/09:00 до 19:00/);assert.match(done.text,/пока не подтверждена/);
 }
});

test('grooming callback is saved around 09:00 and 19:00 without promising an immediate administrator',()=>{
 for(const [at,period] of [['2026-10-21T05:59:59Z','сегодня после 09:00'],['2026-10-21T06:00:00Z',null],['2026-10-21T15:59:59Z',null],['2026-10-21T16:00:00Z','завтра после 09:00'],['2026-10-21T20:59:59Z','завтра после 09:00'],['2026-10-21T21:00:00Z','сегодня после 09:00']]){
  const now=new Date(at);
  const d=reply('Перезвоните, меня зовут Анна, +7 900 111-22-33',{now,messageId:'callback-source'});
  assert.equal(d.createInquiry,true);assert.equal(d.handoff,true);assert.equal(d.direction,'GROOMING');assert.equal(d.contact.callbackMessageId,'callback-source');
  assert.match(d.text,/09:00 до 19:00/);assert.match(d.text,/Запись пока не подтверждена/);
  if(period){assert.ok(d.text.includes(period),at);assert.match(d.text,/Заявку сохранил/);assert.doesNotMatch(d.text,/Передал заявку|дежур|ночн|двойн|ровно/);}
  else {assert.match(d.text,/Передал заявку/);assert.doesNotMatch(d.text,/сейчас.*не работает|завтра после/i);}
 }
});

test('the night notice survives short booking choices, contact collection, human requests and refusal of calls',()=>{
 const now=new Date('2026-10-21T19:00:00Z');
 const first=reply('Хочу записаться',{now});assert.match(first.text,/не работает/);assert.match(first.text,/завтра после 09:00/);
 const here=reply('Здесь',{now,contact:first.contact});assert.equal(here.contact.bookingChannel,'CALLBACK');assert.match(here.text,/завтра после 09:00/);
 const name=reply('Анна',{now,contact:here.contact});assert.equal(name.contact.name,'Анна');assert.match(name.text,/завтра после 09:00/);
 const human=reply('Соедините с сотрудником',{now});assert.equal(human.handoff,true);assert.match(human.text,/завтра после 09:00/);assert.doesNotMatch(human.text,/Передам диалог администратору\./);
 const no=reply('Не звоните, только здесь',{now,contact:first.contact});assert.equal(no.createInquiry,false);assert.match(no.text,/оформлять не буду/);assert.match(no.text,/ответит в переписке/);
 const hours=reply('Когда работает администратор?',{now});assert.match(hours.text,/09:00 до 19:00/);assert.equal(hours.text.split('Сейчас администратор').length,2);
 const urgent=reply('Собака задыхается',{now});assert.equal(urgent.reason,'URGENT');assert.doesNotMatch(urgent.text,/завтра|09:00/);
});
test('refusing a website keeps the administrator callback available',()=>{
 const d=reply('Не хочу на сайт, пусть администратор позвонит');
 assert.equal(d.reason,'CALLBACK');assert.equal(d.contact.collecting,true);assert.equal(d.createInquiry,false);
 assert.doesNotMatch(d.text,/без заявки на обратный звонок|https:/);
});
test('the client can switch from a website to callback and later back without repeating saved questions',()=>{
 const website=reply('Дайте сайт');
 const callback=reply('Здесь',{contact:website.contact});assert.equal(callback.contact.bookingChannel,'CALLBACK');
 const known=reply('Перезвоните',{contact:{...callback.contact,name:'Анна'}});assert.doesNotMatch(known.text,/Как к вам обращаться/);
 const back=reply('Лучше сама запишусь на сайте',{contact:{...known.contact,phone:'+79001112233',callbackMessageId:'old',callbackAt:'old'}});
 assert.equal(back.createInquiry,false);assert.equal(back.contact.collecting,undefined);assert.equal(back.contact.callbackMessageId,undefined);
});
test('a closed booking flow never promises self booking, while the website and administrator remain available',()=>{
 const closed={...petService,selfBookingEnabled:false};
 const first=reply('Хочу записаться',{petService:closed});assert.match(first.text,/пока закрыта/);assert.match(first.text,/администратор позвонил/);
 const yes=reply('Да',{petService:closed,contact:first.contact});assert.equal(yes.contact.collecting,true);
 const website=reply('На сайте',{petService:closed,contact:first.contact});assert.match(website.text,/пока закрыта/);assert.ok(website.text.includes(petService.siteUrl));
 assert.doesNotMatch(website.text,/Самостоятельно выбрать услугу и доступное время можно/);assert.equal(website.createInquiry,false);
 assert.notEqual(petServiceAnswer(closed,'Хочу записаться'),petServiceAnswer(petService,'Хочу записаться'));
});

test('approved wash and care answers stay specific without inventing a dry haircut or a price',()=>{
 const closed={...petService,selfBookingEnabled:false};
 for(const text of ['Можно подстричь собаку без мытья?','Кошку можно стричь без купания?','Сухая стрижка есть?']){
  const d=reply(text,{petService:closed});assert.equal(d.reason,'PET_SERVICE_INFO');assert.match(d.text,/Стрижки собак и кошек выполняем только с мытьём/);assert.equal(d.handoff,false);assert.doesNotMatch(d.text,/\d+\s*₽/);
 }
 const hygiene=reply('Можно только гигиену без мытья?',{petService:closed});assert.match(hygiene.text,/Гигиенический уход может быть без мытья/);assert.doesNotMatch(hygiene.text,/выполняем только с мытьём/);
 const brushing=reply('Можно вычесать без купания?',{petService:closed});assert.match(brushing.text,/Вычёсывание может быть без мытья/);assert.doesNotMatch(brushing.text,/Стрижки/);
});

test('a callback offer after a price or care question supports the short choice here',()=>{
 const closed={...petService,selfBookingEnabled:false};
 for(const text of ['Сколько стоит груминг?','Можно гигиену без мытья?','Можно вычесать собаку?']){
  const d=reply(text,{petService:closed});assert.equal(d.contact.bookingChoiceOffered,true);assert.match(d.text,/Оставим заявку здесь/);
  const chosen=reply('Здесь',{petService:closed,contact:d.contact});assert.equal(chosen.contact.bookingChannel,'CALLBACK');assert.equal(chosen.contact.collecting,true);assert.equal(chosen.contact.name,undefined);
 }
});
test('medical urgency, a request for human chat and refusal of calls still take priority',()=>{
 assert.equal(reply('Собака задыхается, хочу записаться').reason,'URGENT');
 assert.equal(reply('Чем лечить собаку?').reason,'MEDICAL');
 assert.equal(reply('Соедините с сотрудником').reason,'DIRECT_HUMAN_REQUEST');
 const no=reply('Не звоните, только здесь',{contact:{bookingChoiceOffered:true}});
 assert.equal(no.reason,'CONTACT_DECLINED');assert.equal(no.createInquiry,false);assert.equal(no.contact.callbackMessageId,undefined);
});

test('natural refusals of either channel do not reverse the customer preference',()=>{
 for(const text of ['Не надо сайт, пусть администратор позвонит','Не сайт, здесь','Сайт не нужен']){
  const d=reply(text,{contact:{bookingChoiceOffered:true}});assert.equal(d.contact.bookingChannel,'CALLBACK');assert.equal(d.createInquiry,false);assert.doesNotMatch(d.text,/https:/);
 }
 const site=reply('Не звоните, я сама запишусь на сайте',{contact:{bookingChoiceOffered:true,phone:'+79001112233',callbackMessageId:'old',callbackAt:'old'}});
 assert.equal(site.contact.bookingChannel,'WEBSITE');assert.ok(site.text.includes(petService.siteUrl));assert.equal(site.contact.callbackMessageId,undefined);assert.equal(site.createInquiry,false);
 const neither=reply('Не звоните и на сайт не хочу, только здесь',{contact:{bookingChoiceOffered:true}});
 assert.equal(neither.reason,'CONTACT_DECLINED');assert.equal(neither.createInquiry,false);assert.doesNotMatch(neither.text,/https:/);
});
