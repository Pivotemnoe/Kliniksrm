import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');
const {groomingPriceRows,groomingPriceAnswer,groomingPriceFingerprint,groomingPriceQuestion}=require('../apps/api/dist/modules/avito/avito-grooming-prices.js');
const {defaultAvitoSettings}=require('../apps/api/dist/modules/avito/avito.settings.js');
const {decideAvitoReply}=require('../apps/api/dist/modules/avito/avito.policy.js');
const raw=groomingPriceEntries().map(s=>({...s,id:s.catalogKey,version:1}));
const facts=groomingPriceRows(raw),settings=defaultAvitoSettings();settings.profiles.forEach(p=>p.enabled=true);
settings.listings=[{id:'groom-price',title:'Груминг',direction:'GROOMING',enabled:true},{id:'clinic-price',title:'Клиника',direction:'CLINIC',enabled:true},{id:'hotel-price',title:'Гостиница',direction:'HOTEL',enabled:true}];
const source={direction:'GROOMING',available:true,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/',address:'Адрес салона',groomingPrices:facts};
const reply=(text,contact={},extra={})=>decideAvitoReply({settings,listingId:'groom-price',text,contact,messageId:'incoming',petService:source,now:new Date('2026-10-22T09:00:00Z'),...extra});
const clean=d=>d.text.replace(/\s/g,' ');

test('all 172 current module entries retain their price types and retired dry haircuts stay excluded',()=>{
 assert.equal(facts.length,172);assert.ok(!facts.some(r=>r.key==='dog:york:dry'||r.key==='cat:clean:dry'));
 assert.ok(facts.some(r=>r.key==='dog:german-shepherd:dry'));
 const removed={...raw.find(r=>r.catalogKey==='dog:york:full'),id:'retired',catalogKey:'dog:york:dry',price:1,priceType:'FIXED'};
 assert.equal(groomingPriceRows([removed]).length,0);
 assert.equal(groomingPriceRows([{...raw[0],price:null},{...raw[0],priceType:'RANGE',maximumPrice:null}]).length,0);
});
test('fixed breed prices are quoted from the current module without adding 300 again',()=>{
 const d=reply('Сколько стоит гигиена йорка?');assert.match(clean(d),/Йоркширский терьер.*Гигиенический уход — 2 100 ₽/);assert.doesNotMatch(clean(d),/2 400|2 500|2 800/);assert.equal(d.reason,'GROOMING_PRICE');assert.equal(d.createInquiry,false);
});
test('a missing full-package price remains QUOTE and never becomes zero or the old document price',()=>{
 const d=reply('Сколько стоит полный комплекс йорку?',{}, {petService:{...source,selfBookingEnabled:true}});assert.match(d.text,/точная стоимость в прайсе не указана/);assert.doesNotMatch(d.text,/\d[\d\s]*\s*₽|самостоятельно на сайте/);assert.match(d.text,/администратор/);
});
test('an approved range stays a range rather than a guessed minimum or a repeated surcharge',()=>{
 const d=reply('Сколько полный комплекс мальтезе?');assert.match(clean(d),/2 100–2 500 ₽/);assert.doesNotMatch(clean(d),/2 400–2 800|от 2 100/);
});
test('ambiguous poodle variants ask for the catalogue variant before quoting',()=>{
 const first=reply('Сколько полный комплекс пуделю?');assert.equal(first.reason,'GROOMING_PRICE_CLARIFY');assert.doesNotMatch(first.text,/₽/);assert.match(first.text,/карликовый.*королевский|королевский.*карликовый/);
 const d=reply('Карликовый',first.contact);assert.match(clean(d),/Пудель карликовый.*1 900–2 100 ₽/);assert.equal(d.handoff,false);
});
test('breed and service clarifications survive short follow-ups instead of borrowing an unrelated service',()=>{
 const first=reply('Сколько стоит полный комплекс для собаки?');assert.equal(first.contact.groomingPriceContext.awaiting,'BREED');
 const known=reply('Мальтезе',first.contact);assert.match(clean(known),/2 100–2 500 ₽/);
 const service=reply('Сколько стоит йорк?');assert.equal(service.contact.groomingPriceContext.awaiting,'SERVICE');assert.doesNotMatch(service.text,/₽/);
 const d=reply('Гигиенический уход',service.contact);assert.match(clean(d),/2 100 ₽/);
});
test('cat coat condition is clarified and both source ranges keep their exact labels',()=>{
 const first=reply('Сколько стоит стрижка кошки?');assert.match(first.text,/есть колтуны/);assert.doesNotMatch(first.text,/₽/);
 const cleanCat=reply('Нет',first.contact);assert.match(clean(cleanCat),/без колтунов — 2 500–3 300 ₽/);
 const matted=reply('Да',first.contact);assert.match(clean(matted),/есть колтуны — 2 100–2 800 ₽/);assert.equal(matted.createInquiry,false);
});
test('cat dry deshedding and wash-required haircuts are separate services',()=>{
 assert.match(clean(reply('Сколько экспресс-линька кошки без мытья?')),/Экспресс-линька без мытья — 1 300–2 300 ₽/);
 const haircut=reply('Сколько стрижка кошки без мытья?');assert.match(haircut.text,/Стрижки собак и кошек выполняем только с мытьём/);assert.doesNotMatch(haircut.text,/₽/);
 assert.match(reply('Сколько экспресс-линька и мытьё кошки без колтунов?').text,/точная стоимость в прайсе не указана/);
});
test('approved dry brushing for a shepherd remains available at its own price',()=>{
 const d=reply('Сколько вычесать немецкую овчарку без мытья?');assert.match(clean(d),/Немецкая овчарка.*Вычёсывание без мытья — 2 300 ₽/);assert.doesNotMatch(clean(d),/3 800/);
});
test('unknown breeds, mixed boundary weights and unknown services do not borrow another minimum',()=>{
 for(const text of ['Сколько полный комплекс корги?','Сколько полный комплекс метису 10 кг?','Сколько тримминг йорка?','Сколько комплекс кавказской овчарке?','Сколько комплекс австралийской овчарке?','Сколько гигиена бивер-йорку?','Не йорк, а корги. Сколько гигиена?','Сколько полный комплекс той-пуделю?','Сколько полный комплекс йорку и карликовому пуделю?'])assert.doesNotMatch(reply(text).text,/₽/,text);
 assert.match(clean(reply('Сколько полный комплекс метису 8 кг?')),/Метис 5–10 кг.*1 900–2 100 ₽/);
 assert.doesNotMatch(reply('Сколько полный комплекс той-пуделю?').text,/Той-терьер/);
 assert.doesNotMatch(reply('Сколько комплекс кавказской овчарке?').text,/Немецкая овчарка/);
});
test('a new unlisted pet cannot inherit the earlier dog price while short service follow-ups still can',()=>{
 const first=reply('Сколько гигиена йорка?');
 for(const text of ['А сколько для корги?','А гигиена корги?','А для другой собаки?','А для другой собаки, пожалуйста?','Сколько гигиена для другой собаки?','Сколько гигиена кавказской овчарке?']){
  const d=reply(text,first.contact);assert.doesNotMatch(d.text,/₽/,text);assert.equal(d.contact.groomingPriceContext.awaiting,'BREED',text);assert.match(d.text,/породы/,text);
  assert.match(clean(reply('Мальтезе',d.contact)),/1 500 ₽/);
 }
 assert.match(clean(reply('А сколько это будет стоить, пожалуйста?',first.contact)),/2 100 ₽/);
 assert.match(clean(reply('А полный комплекс?',first.contact)),/точная стоимость в прайсе не указана/);
});
test('fixed extras, hourly fees and percentage supplements are not treated as package totals',()=>{
 assert.match(clean(reply('Сколько подстричь когти?')),/Подстригание когтей — 550 ₽/);
 assert.match(clean(reply('Сколько подстричь когти без мытья?')),/550 ₽/);
 assert.doesNotMatch(reply('Можно подстричь когти без мытья?').text,/Стрижки собак и кошек выполняем только с мытьём/);
 const dryMuzzle=reply('Сколько стрижка морды без мытья?');assert.match(dryMuzzle.text,/только с мытьём/);assert.doesNotMatch(dryMuzzle.text,/800.*₽/);
 assert.match(clean(reply('Сколько вычесать подшёрсток за 2 часа?')),/800 ₽ \/ час/);assert.doesNotMatch(clean(reply('Сколько вычесать подшёрсток за 2 часа?')),/1 600/);
 assert.match(clean(reply('Сколько удаление колтунов?')),/1 300 ₽ \/ час/);
 const show=reply('Сколько подготовка к выставке?');assert.match(show.text,/\+ 30%/);assert.match(show.text,/От стоимости полного комплекса/);assert.doesNotMatch(show.text,/\d\s*₽/);
});
test('up-to prices retain the upper-bound wording without turning the zero lower field into a free service',()=>{
 const row={...raw.find(r=>r.catalogKey==='extra:claws'),priceType:'UP_TO',price:0,maximumPrice:900};
 const d=reply('Сколько подстричь когти?',{}, {petService:{...source,groomingPrices:groomingPriceRows([row])}});assert.match(clean(d),/до 900 ₽/);assert.doesNotMatch(clean(d),/— 0 ₽/);
});
test('a known cat remains in context after the ordinary word message',()=>{
 const first=reply('Сколько стрижка кошки?');const d=reply('Нет колтунов, жду сообщение',first.contact);assert.match(clean(d),/Кошка.*2 500–3 300 ₽/);assert.equal(d.contact.petSpecies,'CAT');
});
test('an uncertain coat-condition statement cannot become a quoted condition or reuse the earlier guess',()=>{
 const first=reply('Сколько стрижка кошки без колтунов?');assert.match(clean(first),/2 500–3 300 ₽/);
 const unsure=reply('Кошка, я не уверена, есть колтуны или нет',first.contact);assert.match(unsure.text,/есть колтуны\?/);assert.doesNotMatch(unsure.text,/₽/);
});
test('a price answer and source address both survive a multipart question',()=>{
 const d=reply('Сколько гигиена йорка и какой адрес?');assert.match(clean(d),/2 100 ₽/);assert.match(d.text,/Адрес салона/);
 const missing=reply('Сколько гигиена йорка и какой адрес?',{}, {petService:{...source,address:null}});assert.match(clean(missing),/2 100 ₽/);assert.match(missing.text,/Точный адрес уточнит администратор/);assert.doesNotMatch(missing.text,/Основная клиника|Адрес салона/);
});
test('a priced service can move into callback while keeping its request summary and actual phone evidence',()=>{
 const price=reply('Сколько стоит гигиена йорка?');const chosen=reply('Здесь',price.contact);const named=reply('Анна',chosen.contact);const done=reply('Мой номер +7 900 111-22-33',named.contact);
 assert.equal(done.createInquiry,true);assert.equal(done.contact.callbackMessageId,'incoming');assert.match(done.contact.summary,/Йоркширский терьер/);assert.match(done.contact.summary,/Гигиенический уход/);
});
test('a price question with provided callback details answers the price before the saved-request confirmation',()=>{
 const d=reply('Сколько подстричь когти? Меня зовут Анна, +7 900 111-22-33',{}, {now:new Date('2026-10-22T16:30:00Z')});assert.equal(d.createInquiry,true);assert.match(clean(d),/550 ₽.*Заявку сохранил/s);assert.match(d.text,/завтра после 09:00/);assert.doesNotMatch(d.text,/1\s*100\s*₽/);
});
test('a website choice keeps the website while answering a new price question',()=>{
 const d=reply('Сколько гигиена йорка на сайте?',{}, {petService:{...source,selfBookingEnabled:true}});assert.match(clean(d),/2 100 ₽/);assert.ok(d.text.includes(source.siteUrl));assert.equal(d.contact.bookingChannel,'WEBSITE');assert.equal(d.createInquiry,false);assert.doesNotMatch(d.text,/Стоимость груминга зависит/);
});
test('clinic/hotel, urgency, refusal and staff control cannot inherit grooming prices',()=>{
 const c=reply('Сколько гигиена йорка?',{}, {listingId:'clinic-price'});assert.doesNotMatch(c.text,/2\s*100/);
 const urgent=reply('Собака задыхается. Сколько гигиена йорка?');assert.equal(urgent.reason,'URGENT');assert.doesNotMatch(urgent.text,/₽/);
 assert.equal(reply('Сколько гигиена йорка?',{}, {mode:'HUMAN'}).text,null);
 assert.equal(reply('Не звоните, только здесь. Сколько гигиена йорка?').reason,'CONTACT_DECLINED');
 const hotel={direction:'HOTEL',available:false,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/pet-hotel/',address:null,groomingPrices:facts};assert.equal(groomingPriceAnswer(hotel,'Сколько гигиена йорка?'),null);
});
test('catalogue changes and availability changes alter the fingerprint while row order does not',()=>{
 assert.equal(groomingPriceFingerprint(source),groomingPriceFingerprint({...source,groomingPrices:groomingPriceRows([...raw].reverse())}));
 assert.notEqual(groomingPriceFingerprint(source),groomingPriceFingerprint({...source,selfBookingEnabled:true}));
 const changed=raw.map(r=>r.catalogKey==='extra:claws'?{...r,price:600,version:2}:r);assert.notEqual(groomingPriceFingerprint(source),groomingPriceFingerprint({...source,groomingPrices:groomingPriceRows(changed)}));
});
test('duration questions and explicitly clinical procedures do not become a guessed grooming quote',()=>{
 assert.equal(groomingPriceQuestion('Сколько времени длится стрижка?'),false);
 assert.equal(groomingPriceAnswer(source,'Сколько времени длится стрижка йорка?'),null);
 for(const text of ['Сколько УЗИ кошки?','Сколько ультразвуковая чистка зубов?'])assert.equal(groomingPriceAnswer(source,text),null);
});
