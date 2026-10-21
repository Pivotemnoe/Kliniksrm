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
const reply=(text,extra={})=>decideAvitoReply({settings,listingId:'groom-choice',text,messageId:'incoming',petService,...extra});

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
  assert.match(done.text,/администратору груминга/);assert.match(done.text,/в рабочее время/);assert.match(done.text,/пока не подтверждена/);
 }
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
test('medical urgency, a request for human chat and refusal of calls still take priority',()=>{
 assert.equal(reply('Собака задыхается, хочу записаться').reason,'URGENT');
 assert.equal(reply('Чем лечить собаку?').reason,'MEDICAL');
 assert.equal(reply('Соедините с сотрудником').reason,'DIRECT_HUMAN_REQUEST');
 const no=reply('Не звоните, только здесь',{contact:{bookingChoiceOffered:true}});
 assert.equal(no.reason,'CONTACT_DECLINED');assert.equal(no.createInquiry,false);assert.equal(no.contact.callbackMessageId,undefined);
});
