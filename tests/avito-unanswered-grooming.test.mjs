import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {unansweredAvitoText}=require('../apps/api/dist/modules/avito/avito-unanswered-messages.js');
const {defaultAvitoSettings}=require('../apps/api/dist/modules/avito/avito.settings.js');
const {decideAvitoReply}=require('../apps/api/dist/modules/avito/avito.policy.js');
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');
const {groomingPriceRows}=require('../apps/api/dist/modules/avito/avito-grooming-prices.js');
const settings=defaultAvitoSettings();settings.profiles.forEach(p=>p.enabled=true);settings.listings=[{id:'202',enabled:true,direction:'GROOMING',title:'Synthetic grooming'}];
const source={direction:'GROOMING',available:true,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/',address:null,groomingPrices:groomingPriceRows(groomingPriceEntries().map(x=>({...x,id:x.catalogKey,version:1})))};
const ask=(text,extra={})=>decideAvitoReply({settings,listingId:'202',text,messageId:'latest',petService:source,now:new Date('2026-11-02T07:41:46Z'),...extra});
const first='Здравствуйте\nМожно узнать сколько будет стоить стрижка и обработка от блох той пуделя? Возраст 4 месяца',second='И когда можно приехать?';
const m=(id,text,at,authorId='customer',type='text')=>({id,text,at,authorId,type});
test('all unanswered messages stay together across sync batches and duplicate history',()=>{
 const rows=[m('a',first,1000),m('b',second,2000),m('a',first,1000)];assert.equal(unansweredAvitoText(rows,'b','staff',['customer']),first+'\n\n'+second);
});
test('actual replies cut the request while system and foreign messages cannot supply facts',()=>{
 const rows=[m('a',first,1000),m('out','actual answer',2000,'staff'),m('system','notification',2300,'staff','system'),m('foreign','old price',2400,'foreign'),m('b',second,3000)];
 assert.equal(unansweredAvitoText(rows,'b','staff',['customer']),second);
 assert.equal(unansweredAvitoText([m('a',first,1000),m('system','notice',1500,'staff','system'),m('b',second,2000)],'b','staff',['customer']),first+'\n\n'+second);
});
test('activation boundary, bounded text and missing latest are handled without leaking unrelated history',()=>{
 assert.equal(unansweredAvitoText([m('a',first,1000),m('b',second,3000)],'b','staff',['customer'],2000),second);
 assert.equal(unansweredAvitoText([],'missing','staff',['customer']),'');
 assert.ok(unansweredAvitoText([m('a','x'.repeat(16000),1000),m('b',second,3000)],'b','staff',['customer']).length<=12002);
});
test('the two-message enquiry answers preparation, stated age, known variety and arrival without another breed question',()=>{
 const preview=ask(first),d=ask(second,{contact:preview.contact,contextText:first+'\n\n'+second});
 assert.equal(d.reason,'GROOMING_CARE_PREPARATION');assert.match(d.text,/врач|препарат/);assert.match(d.text,/4 месяца/);assert.match(d.text,/той-пуделя/);assert.match(d.text,/время.*администратор/isu);assert.match(d.text,/стоимость/iu);
 assert.doesNotMatch(d.text,/Какой породы|Для метиса|Пудель карликовый|Пудель королевский|1\s*900|2\s*100|600–800|230|недел/);assert.equal(d.handoff,false);assert.equal(d.needsAttention,true);
});
test('ordinary multi-message prices use current CRM rows and retain a later address/arrival request',()=>{
 const a=ask('Сколько стоит полный комплекс йорку?');const d=ask(second,{contact:a.contact,contextText:'Сколько стоит полный комплекс йорку?\n\n'+second});
 assert.match(d.text.replace(/\s/g,' '),/2 500 ₽/);assert.match(d.text,/время.*администратор/isu);assert.doesNotMatch(d.text,/Какой породы/);
});
test('primary intent variations cannot erase either grooming price, preparation or arrival',()=>{
 for(const action of ['MEDICAL','PRICE','HOURS','BOOKING','OTHER']){
  const d=ask(second,{contact:ask(first).contact,contextText:first+'\n\n'+second,intent:{action,knowledgeId:null,serviceQuery:null}});
  assert.match(d.text,/врач/);assert.match(d.text,/той-пуделя/);assert.match(d.text,/стоимость/iu);assert.match(d.text,/время.*администратор/isu);assert.doesNotMatch(d.text,/Какой породы|Пудель карликовый/);
 }
 assert.equal(ask('Той-пудель необработан от блох, когда можно на стрижку?').contact.groomingParasites,'NEEDS_CLINIC');
});
test('a current breed correction overrides older facts without quoting a toy-poodle price',()=>{
 const a=ask(first),d=ask('Я ошиблась, у нас йорк, сколько полный комплекс?',{contact:a.contact,contextText:first+'\n\nЯ ошиблась, у нас йорк, сколько полный комплекс?'});
 assert.match(d.text.replace(/\s/g,' '),/2 500 ₽/);assert.equal(d.contact.groomingPriceContext.unlistedBreed,undefined);assert.doesNotMatch(d.text,/той-пуделя/);
});
test('a named toy variety is retained across service follow-ups instead of selecting the miniature row',()=>{
 const a=ask('По чём полный комплекс той-пуделю?'),d=ask('А гигиена?',{contact:a.contact});assert.match(d.text,/той-пуделя/);assert.match(d.text,/гигиенического ухода/);assert.doesNotMatch(d.text,/₽|Какой породы/);
});
test('past/negative flea statements are not treated as a current infestation',()=>{
 assert.notEqual(ask('У йорка нет блох, сколько полный комплекс?').reason,'GROOMING_CARE_PREPARATION');
 const d=ask('Той-пуделя обработали от блох неделю назад, когда можно приехать?');assert.match(d.text,/обработка уже проведена/);assert.doesNotMatch(d.text,/подожд|через неделю|Сначала/);
});
test('care composition retains address and the chosen website channel',()=>{
 const petService={...source,address:'СИНТЕТИЧЕСКИЙ АДРЕС ДЛЯ QA'};const a=ask(first,{petService});
 const address=ask('И по какому адресу приехать?',{petService,contact:a.contact,contextText:first+'\n\nИ по какому адресу приехать?'});assert.match(address.text,/СИНТЕТИЧЕСКИЙ АДРЕС ДЛЯ QA/);
 const website=ask('Хочу записаться на сайте',{petService,contact:a.contact,contextText:first+'\n\nХочу записаться на сайте'});assert.ok(website.text.includes(source.siteUrl));assert.equal(website.contact.bookingChannel,'WEBSITE');assert.ok(website.groomingPriceFingerprint);
});
test('short treatment follow-ups update the existing concern and do not contaminate a different pet',()=>{
 const a=ask(first),b=ask('Уже обработали неделю назад',{contact:a.contact});assert.equal(b.contact.groomingParasites,'TREATED');
 const c=ask('Когда можно приехать?',{contact:b.contact});assert.match(c.text,/обработка уже проведена/);assert.doesNotMatch(c.text,/С обработкой.*поможет врач/);
 const different=ask('А для корги сколько стоит?',{contact:a.contact,contextText:first+'\n\nА для корги сколько стоит?'});assert.doesNotMatch(different.text,/той-пуделя/);assert.equal(different.contact.groomingPriceContext.unlistedBreed,'корги');assert.equal(different.contact.groomingParasites,undefined);
 for(const text of ['У йорка нет клещей, сколько полный комплекс?','У йорка нет паразитов, сколько полный комплекс?','У йорка блох не обнаружили, сколько полный комплекс?'])assert.notEqual(ask(text).reason,'GROOMING_CARE_PREPARATION');
 assert.equal(ask('У йорка нет блох, но есть клещи. Сколько полный комплекс?').contact.groomingParasites,'NEEDS_CLINIC');
});
test('contact evidence remains tied to the current original message and survives a later name',()=>{
 const a=ask('Хочу записать йорка, мой телефон +79001234567',{messageId:'phone'});
 const d=ask('Меня зовут Анна',{messageId:'name',contact:a.contact,contextText:'Хочу записать йорка, мой телефон +79001234567\n\nМеня зовут Анна'});
 assert.equal(d.createInquiry,true);assert.equal(d.contact.callbackMessageId,'phone');assert.equal(d.contact.name,'Анна');assert.equal(d.contact.phone,'+79001234567');
});
test('urgent unanswered text, refusal, staff control and night callback rules retain priority',()=>{
 assert.equal(ask(second,{contextText:'Собака задыхается\n\n'+second}).reason,'URGENT');
 assert.equal(ask('Не звоните, только здесь',{contextText:first+'\n\nНе звоните, только здесь'}).reason,'CONTACT_DECLINED');
 assert.equal(ask(second,{mode:'HUMAN',contextText:first+'\n\n'+second}).text,null);
 const d=ask(first,{now:new Date('2026-11-02T20:00:00Z')});assert.doesNotMatch(d.text,/немедленно|ровно в 09|сейчас.*свободно/iu);
});
