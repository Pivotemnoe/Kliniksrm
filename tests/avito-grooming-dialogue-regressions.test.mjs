import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');
const {groomingPriceRows,groomingPriceQuestion,groomingPriceAnswer}=require('../apps/api/dist/modules/avito/avito-grooming-prices.js');
const {defaultAvitoSettings}=require('../apps/api/dist/modules/avito/avito.settings.js');
const {decideAvitoReply}=require('../apps/api/dist/modules/avito/avito.policy.js');
const settings=defaultAvitoSettings();settings.profiles.find(p=>p.direction==='GROOMING').enabled=true;
settings.listings=[{id:'202',title:'Груминг',direction:'GROOMING',enabled:true}];
const rows=groomingPriceEntries().map(row=>({...row,id:row.catalogKey,version:1}));
const source={direction:'GROOMING',available:true,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/',address:null,groomingPrices:groomingPriceRows(rows)};
const reply=(text,extra={})=>decideAvitoReply({settings,listingId:'202',text,messageId:'incoming',now:new Date('2026-10-22T09:00:00Z'),petService:source,...extra});
const clean=text=>text.replace(/\s/g,' ');

test('the lost enquiry is a price request including spaced and colloquial price wording',()=>{
 for(const wording of ['по чем','по чём','по  чем','почём']){
  const text=`Здравствуйте, ${wording} стрижка полностью йорк терьер 10 лет, а вес примерно 3-4 кг`;
  assert.equal(groomingPriceQuestion(text),true);
  const d=reply(text);assert.equal(d.reason,'GROOMING_PRICE');assert.match(d.text,/Йоркширский терьер.*Полный комплекс/);
  assert.equal(d.contact.groomingPriceContext.breedRowIds[0],'york');assert.equal(d.contact.groomingPriceContext.kind,'full');
  assert.equal(d.needsAttention,false);assert.equal(d.handoff,false);assert.equal(d.createInquiry,false);
  assert.match(clean(d.text),/Полный комплекс — 2 500 ₽/);
  assert.doesNotMatch(d.text,/онлайн-запись пока закрыта|Стрижки собак и кошек|— 0 ₽|2\s*800|точную стоимость уточнит/);
 }
});
test('a numerical CRM override is answered directly without a hardcoded catalogue price',()=>{
 const current=groomingPriceRows(rows.map(row=>row.catalogKey==='dog:york:full'?{...row,priceType:'FIXED',price:3100,version:2}:row));
 const d=reply('Здравствуйте, по чем стрижка полностью йорк терьер 10 лет, а вес примерно 3-4 кг',{petService:{...source,groomingPrices:current}});
 assert.match(clean(d.text),/Йоркширский терьер.*Полный комплекс — 3 100 ₽/);assert.match(d.text,/Оставим заявку\?/);
 assert.equal(d.needsAttention,false);assert.doesNotMatch(d.text,/пока закрыта|Стрижки собак и кошек|точную стоимость уточнит/);
});
test('an explicitly missing CRM price flags staff attention while keeping the bot available',()=>{
 const missing=groomingPriceRows(rows.map(row=>row.catalogKey==='dog:york:full'?{...row,priceType:'QUOTE',price:0,version:2}:row));
 const d=reply('По чем полный комплекс йорку?',{petService:{...source,groomingPrices:missing}});
 assert.match(d.text,/точную стоимость уточнит администратор груминга/);assert.equal(d.needsAttention,true);assert.equal(d.handoff,false);assert.doesNotMatch(d.text,/₽/);
});
test('a validated PRICE intent can select catalogue facts without an exact price keyword',()=>{
 const d=reply('По деньгам полный комплекс мальтезе',{intent:{action:'PRICE',knowledgeId:null,serviceQuery:null}});
 assert.match(clean(d.text),/2 100–2 500 ₽/);assert.equal(d.reason,'GROOMING_PRICE');assert.equal(d.handoff,false);
 const colloquial=reply('Скок полный комплекс мальтезе',{intent:{action:'PRICE',knowledgeId:null,serviceQuery:null}});assert.match(clean(colloquial.text),/2 100–2 500 ₽/);
});
test('ordinary unclear enquiries keep the bot available and ask a concrete follow-up',()=>{
 for(const text of ['Груминг','Можно?','Добрый день! Подскажите пожалуйста','Вы тут?','?','Йорк']){
  const first=reply(text);assert.ok(first.text);assert.match(first.text,/\?/);assert.equal(first.handoff,false);assert.equal(first.createInquiry,false);
  const next=reply('По чём гигиена йорка',{contact:first.contact});assert.equal(next.reason,'GROOMING_PRICE');assert.match(clean(next.text),/2 100 ₽/);
 }
 const first=reply('По чём груминг собаки');assert.equal(first.contact.groomingPriceContext.awaiting,'BREED');
 const ping=reply('?',{contact:first.contact});assert.match(ping.text,/Какой породы собака/);assert.equal(ping.handoff,false);
 const vague=reply('Подскажите');const pet=reply('Йорк',{contact:vague.contact});assert.match(pet.text,/Какая услуга нужна/);assert.equal(pet.contact.groomingPriceContext.awaiting,'SERVICE');
 const care=reply('Гигиена',{contact:pet.contact});assert.match(clean(care.text),/2 100 ₽/);
});
test('a thank-you followed by a new request is not swallowed as a courtesy',()=>{
 const d=reply('Спасибо, подскажите про транспортировку питомца');assert.equal(d.reason,'GROOMING_CLARIFY');assert.match(d.text,/\?/);assert.equal(d.handoff,false);
 assert.equal(reply('Спасибо за ответ!').reason,'COURTESY');
 assert.equal(reply('Спасибо, по чём полный комплекс мальтезе').reason,'GROOMING_PRICE');
});
test('unclear wording does not reverse an actual staff takeover, medical escalation or callback refusal',()=>{
 for(const text of ['Груминг','Можно?','по чем стрижка йорка'])assert.equal(reply(text,{mode:'HUMAN'}).text,null);
 assert.equal(reply('Соедините с сотрудником').reason,'DIRECT_HUMAN_REQUEST');
 assert.equal(reply('Не звоните, только здесь').reason,'CONTACT_DECLINED');
 assert.equal(reply('Собака задыхается, по чём груминг?').reason,'URGENT');
});
test('colloquial duration and age cannot be forced into prices by a PRICE intent or earlier price context',()=>{
 const prior=reply('Сколько гигиена йорка?').contact;
 for(const text of ['Скок времени занимает стрижка йорка?','Скок часов длится процедура?','Скок лет грумеру?','Скоко по времени занимает процедура?','Сколько времени занимает стрижка йорка?']){
  assert.equal(groomingPriceQuestion(text),false);assert.equal(groomingPriceAnswer(source,text,prior.groomingPriceContext,true),null);
  const s=structuredClone(settings);s.profiles.find(p=>p.direction==='GROOMING').knowledge=[{id:'approved-duration',title:'Тестовая длительность',keywords:[text.includes('лет')?'лет':'времени','часов'],answer:'Утверждённый тестовый ответ о длительности или возрасте.'}];
  const d=reply(text,{settings:s,contact:prior,intent:{action:'PRICE',knowledgeId:null,serviceQuery:null}});
  assert.equal(d.reason,'KNOWLEDGE:approved-duration');assert.equal(d.text,'Утверждённый тестовый ответ о длительности или возрасте.');assert.doesNotMatch(d.text,/₽/);
 }
 const mixed=reply('Скок времени занимает стрижка йорка и какая цена?');assert.equal(mixed.reason,'GROOMING_PRICE');assert.match(mixed.text,/Йоркширский терьер.*Полный комплекс/);
 const s=structuredClone(settings);s.profiles.find(p=>p.direction==='GROOMING').knowledge=[{id:'duration',title:'Тестовая длительность',keywords:['времени'],answer:'Утверждённая тестовая длительность.'}];
 const callback=reply('Скок времени занимает стрижка? Меня зовут Иван, мой телефон +79001234567',{settings:s,intent:{action:'PRICE',knowledgeId:null,serviceQuery:null}});
 assert.equal(callback.createInquiry,true);assert.equal(callback.purpose,'SUBMITTED');assert.equal(callback.contact.name,'Иван');assert.equal(callback.contact.phone,'+79001234567');assert.equal(callback.contact.callbackMessageId,'incoming');
});
