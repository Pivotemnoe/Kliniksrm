import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { AvitoCrmKnowledgeService, crmQuestions } = require('../apps/api/dist/modules/avito/avito-crm-knowledge.service.js');
const { defaultAvitoSettings } = require('../apps/api/dist/modules/avito/avito.settings.js');
const { decideAvitoReply } = require('../apps/api/dist/modules/avito/avito.policy.js');
const { petSpecies } = require('../apps/api/dist/modules/avito/avito-service-query.js');

test('ordinary message words cannot infer a puppy or overwrite a known cat',()=>{
 for(const text of ['Системное сообщение','Жду ваше сообщение','Есть помещение','Уточнение обращения'])assert.equal(petSpecies(text),null,text);
 for(const text of ['Моя собака','У щенка','У щенков','Мой пёс','У пса'])assert.equal(petSpecies(text),'DOG',text);
 assert.equal(petSpecies('Сообщение про кошку'),'CAT');assert.equal(petSpecies('Кошка и собака'),null);
 const settings=defaultAvitoSettings();settings.listings=[{id:'cat-context',title:'Диспансеризация',direction:'CLINIC',enabled:true}];
 const d=decideAvitoReply({settings,listingId:'cat-context',text:'Жду сообщение',messageId:'clarification',contact:{petSpecies:'CAT'},now:new Date('2026-10-22T09:00:00Z')});assert.equal(d.contact.petSpecies,'CAT');
});
const tariff = (title, price, min = null, max = null) => ({ title, priceType: min === null ? 'FIXED' : 'FLOATING', price, minimumPrice:min, maximumPrice:max });
const rows = [tariff('УЗИ',1035),tariff('УЗИ обзорное',1380),tariff('Санация ротовой полости ультразвуковым аппаратом -- кошки',0,4050,5175),tariff('Санация ротовой полости ультразвуковым аппаратом -- собаки',0,5175,11500),tariff('Вакцинация кошки Мультифел',1900),tariff('Первичный прием врача',600)];
const crm = new AvitoCrmKnowledgeService({ service:{findMany:async()=>rows}, clinicOffice:{findMany:async()=>[{phone:'+79284214542',workingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isWorking:true,is24Hours:true}]))}]} });
test('a model plan with no subject retains the service card, with no duplicate price question',async()=>{
 const result=await crm.answer('org','Приветствую! Сколько это стоит?',undefined,'УЗИ',undefined,[{kind:'PRICE',text:'Сколько это стоит?',serviceQuery:null}]);
 assert.match(result.text,/УЗИ/); assert.ok(!/Стоимость какой|Санация/.test(result.text)); assert.equal(result.reason,'CRM_PRICE_AMBIGUOUS');
});
test('ultrasound pricing never includes a dental ultrasonic procedure',async()=>{
 for(const query of ['Цена УЗИ','Сколько стоит ультразвуковое исследование?']){
  const result=await crm.answer('org',query);assert.ok(!/ротовой|5.?175|4.?050/.test(result.text),result.text);
 }
});
test('colloquial dental and vaccination names filter species before quoting CRM ranges',async()=>{
 for(const [query,amount,forbidden] of [['Сколько стоит чистка зубов коту?','4.?050','собак'],['Сколько стоит зубы почистить собаке?','5.?175','кошк'],['Сколько прививка кошке стоит?','1.?900','собак']]){
  const result=await crm.answer('org',query); assert.match(result.text,new RegExp(amount));assert.ok(!new RegExp(forbidden).test(result.text));
 }
});
test('an explicitly different unavailable service never falls back to the listing price',async()=>{
 const result=await crm.answer('org','Сколько стоит томография?',undefined,'УЗИ'); assert.equal(result.reason,'CRM_PRICE_NOT_FOUND'); assert.ok(!/1.?035/.test(result.text));
});
function decide(text,card={},extra={}) {const settings=defaultAvitoSettings();settings.listings=[{id:'1',title:'Услуга',direction:'CLINIC',enabled:true,...card}];return decideAvitoReply({settings,listingId:'1',text,messageId:'m',now:new Date('2026-10-19T09:00:00Z'),clinicPhone:'+79284214542',...extra});}
test('intake recognizes already provided species, age and referral across service cards',()=>{
 for(const [input,question] of [['Запишите кошку, ей 4 года. Меня зовут Анна.','У вас кошка или собака и сколько питомцу лет?'],['Нужна запись на вакцинацию собаки. Меня зовут Анна.','Для кошки или собаки нужна вакцинация?'],['Запишите кошку по направлению. Меня зовут Анна.','Для какого питомца и есть ли направление врача?']]) {
  const result=decide(input,{intakeQuestion:question}); assert.match(result.text,/номер телефона/);assert.ok(!/кошка или собака|сколько питомцу лет|есть ли направление/.test(result.text));
 }
});
test('negated and past symptoms do not replace a verified organizational answer',()=>{
 for(const text of ['Рвоты и поноса нет, сколько стоит приём?','Понос был год назад. Сколько стоит приём?']){
  const result=decide(text,{}, {crmAnswer:{text:'Первичный приём — 600 ₽.',reason:'CRM_PRICE',handoff:false}}); assert.match(result.text,/600/);assert.ok(!/Как к вам|Не ждите/.test(result.text));
 }
});
test('colloquial urinary emergencies bypass intake and contact requests',()=>{
 for(const text of ['Кот не может пописать, хочу записаться','Кот не писает']){const result=decide(text,{intakeQuestion:'Кто у вас и сколько лет?'});assert.equal(result.reason,'URGENT');assert.match(result.text,/Приезжайте в клинику/);assert.equal(result.createInquiry,false);}
});
test('a literal but meaningless model subject cannot turn general clinic hours into procedure availability',async()=>{
 const text='Вы работаете в субботу?'; const result=await crm.answer('org',text,undefined,undefined,undefined,[{kind:'HOURS',text,serviceQuery:'работаете'}],{note:'',administratorWorking:true});
 assert.match(result.text,/круглосуточно, ежедневно/);assert.ok(!/Возможность.*процедур/.test(result.text));
});
test('an incomplete model plan cannot drop an elliptical visit-price question after a new address topic',async()=>{
 const c=new AvitoCrmKnowledgeService({service:{findMany:async()=>rows},clinicOffice:{findMany:async()=>[{address:'Тестовый адрес'}]}});
 const result=await c.answer('org','А адрес какой и приём сколько?',undefined,'УЗИ',undefined,[]);
 assert.match(result.text,/Тестовый адрес/);assert.match(result.text,/600/);assert.ok(!/1.?035/.test(result.text));
});
test('a service price without стоит stays present beside another question without model assistance',async()=>{
 const c=new AvitoCrmKnowledgeService({service:{findMany:async()=>rows},clinicOffice:{findMany:async()=>[{address:'Тестовый адрес'}]}});
 for(const query of ['Сколько УЗИ кошке и какой адрес?','Подскажите, сколько у вас УЗИ кошке и где вы находитесь?']){
  const result=await c.answer('org',query,undefined,'УЗИ',undefined,[]);
  assert.match(result.text,/1.?035/);assert.match(result.text,/Тестовый адрес/);
 }
 const plan=crmQuestions('Сколько стандартная диспансеризация кошки в клинике и какой адрес?');
 assert.ok(plan.some(q=>q.kind==='PRICE'));assert.ok(plan.some(q=>q.kind==='ADDRESS'));
});
test('time, duration and quantity questions about a service are not elliptical prices',()=>{
 for(const query of ['Во сколько начинается приём?','УЗИ во сколько?','Сколько длится УЗИ?','Сколько диспансеризация обычно длится?','Сколько показателей в диспансеризации?','Сколько снимков нужно при рентгене?','Через сколько после вакцинации можно гулять?']){
  assert.ok(!crmQuestions(query).some(q=>q.kind==='PRICE'),query);
 }
});
test('a no-model checkup price and address answer uses the owner table without CRM price linkage',async()=>{
 const table=JSON.parse(readFileSync(new URL('../docs/plans/2026-10-19-avito-clinic-pilot.json',import.meta.url),'utf8')).settings.clinicProgrammeTable;
 let priceReads=0;
 const c=new AvitoCrmKnowledgeService({service:{findMany:async()=>{priceReads++;throw Error('No checkup CRM price linkage');}},clinicOffice:{findMany:async()=>[{address:'Тестовый адрес'}]}});
 const result=await c.answer('org','Сколько стандартная диспансеризация кошки в клинике и какой адрес?',undefined,'Диспансеризация',undefined,[],{note:'',programmeTable:table});
 const reply=result.text.replace(/\s/g,' ');
 assert.match(reply,/5 300/);assert.match(reply,/4 700/);assert.match(reply,/Тестовый адрес/);
 assert.equal(priceReads,0);assert.equal(result.reason,'CRM_MULTIPLE_QUESTIONS');
});
