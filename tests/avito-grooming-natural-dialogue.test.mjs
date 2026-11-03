import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {defaultAvitoSettings}=require('../apps/api/dist/modules/avito/avito.settings.js');
const {decideAvitoReply}=require('../apps/api/dist/modules/avito/avito.policy.js');
const {groomingPriceEntries}=require('../apps/api/dist/modules/grooming/price-catalog.js');
const {groomingPriceRows}=require('../apps/api/dist/modules/avito/avito-grooming-prices.js');
const {petSpecies}=require('../apps/api/dist/modules/avito/avito-service-query.js');
const {avitoReplyPlan,renderAvitoModelReply}=require('../apps/api/dist/modules/avito/avito-reply-composer.js');
const settings=defaultAvitoSettings();settings.profiles.forEach(p=>p.enabled=true);settings.listings=[{id:'groom',title:'Груминг',direction:'GROOMING',enabled:true}];
const source={direction:'GROOMING',available:true,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/',address:'Тестовый адрес',groomingPrices:groomingPriceRows(groomingPriceEntries().map(r=>({...r,id:r.catalogKey,version:1})))};
const at=new Date('2026-11-03T18:34:54Z');
const ask=(text,contact={},more={})=>decideAvitoReply({settings,listingId:'groom',text,contact,messageId:'current',now:at,petService:source,...more});
const original='Добрый вечер, подскажите пожалуйста примерную стоимость комплексного ухода для собачки породы помапу ?';
const noRepeat=/Кого планируете|кошк\S* или собак|Какой породы|напишите породу/iu;

for(const species of ['собака','собачка','собачки','собачку','собачонка','пёс','пёсик','пёсика','пса','псу','щенок','щеночек','щенуля','dog','puppy'])test(`recognizes ordinary dog wording: ${species}`,()=>{
 assert.equal(petSpecies(`У меня ${species}`),'DOG');
 const d=ask(`Сколько полный комплекс, у меня ${species} породы помапу?`);assert.doesNotMatch(d.text,noRepeat);assert.match(d.text,/помапу/);assert.match(d.text,/вес/);assert.match(d.text,/возраст/);assert.match(d.text,/завтра после 09:00/);
});
for(const species of ['кот','кота','коту','котик','котика','котейка','котейку','котёнок','котёнка','кошечка','кошечку','кошка','кошку','котята','cat','kitten'])test(`recognizes ordinary cat wording: ${species}`,()=>{
 assert.equal(petSpecies(`У меня ${species}`),'CAT');
 const d=ask(`Сколько стрижка с мытьём, у меня ${species}?`);assert.match(d.text,/колтуны/);assert.doesNotMatch(d.text,noRepeat);
});
test('the actual request preserves dog, unknown breed and package and asks only missing weight/age',()=>{
 const d=ask(original);assert.equal(d.contact.groomingPriceContext.species,'DOG');assert.equal(d.contact.groomingPriceContext.unlistedBreed,'помапу');assert.equal(d.contact.groomingPriceContext.kind,'full');
 assert.doesNotMatch(d.text,noRepeat);assert.doesNotMatch(d.text,/₽|пудел|шпиц|метис/iu);assert.match(d.text,/администратор/);assert.match(d.text,/вес/);assert.match(d.text,/возраст/);assert.equal(d.needsAttention,true);assert.equal(d.handoff,false);
});
test('unknown-breed details survive a real assistant reply and are not requested again',()=>{
 const first=ask(original);const weight=ask('Весит 3,5 кг',first.contact);assert.match(weight.text,/возраст/);assert.doesNotMatch(weight.text,/сколько весит|Какой породы|кого планируете/iu);
 const age=ask('Ей 2 года',weight.contact);assert.doesNotMatch(age.text,/какой.{0,15}возраст|сколько весит|Какой породы/iu);assert.doesNotMatch(age.text,/₽/);assert.match(age.text,/администратор/);
 assert.equal(age.contact.groomingPriceContext.weightKg,'3,5');assert.equal(age.contact.groomingPriceContext.age,'2 года');
});
test('provided weight or age is not re-collected in the first reply',()=>{
 for(const [suffix,missing,answered] of [['Возраст 4 месяца','вес','возраст'],['Вес 4 кг','возраст','вес'],['Вес 4 кг, ей 2 года',null,null]]){
  const d=ask(original+' '+suffix);assert.doesNotMatch(d.text,noRepeat);const questions=d.text.split('\n').filter(l=>l.includes('?')).join(' ');
  if(missing)assert.match(questions,new RegExp(missing));if(answered)assert.doesNotMatch(questions,new RegExp(answered));if(!missing)assert.doesNotMatch(questions,/вес|возраст/iu);
 }
});
test('bare catalogue and unlisted breed names establish species across separate messages',()=>{
 for(const breed of ['Йорк','Мальтезе','Шитцу','Мальтипу','Хаски','Помапу','Корги']){
  const first=ask(breed);assert.equal(first.contact.groomingPriceContext.species,'DOG',breed);assert.doesNotMatch(first.text,noRepeat,breed);
  const price=ask('Сколько будет полный комплекс?',first.contact);assert.doesNotMatch(price.text,noRepeat,breed);
 }
 for(const breed of ['Мейн-кун','Сфинкс','Британская','Шотландская']){const first=ask(breed);assert.equal(first.contact.groomingPriceContext.species,'CAT',breed);assert.doesNotMatch(first.text,noRepeat,breed);}
});
test('an explicit arbitrary breed is acknowledged without borrowing a similar price',()=>{
 const d=ask('Сколько комплекс для собачки породы ксолоитцкуинтли?');assert.match(d.text,/ксолоитцкуинтли/);assert.doesNotMatch(d.text,noRepeat);assert.doesNotMatch(d.text,/₽/);assert.match(d.text,/вес/);assert.match(d.text,/возраст/);
});
test('all exact catalogue breed names keep their own full-package row and no PET/BREED loop',()=>{
 for(const row of source.groomingPrices.filter(r=>r.species==='DOG'&&r.kind==='full')){
  const d=ask(`Сколько полный комплекс для собаки породы ${row.breedName}?`);
  assert.doesNotMatch(d.text,noRepeat,row.breedName);
  if(!row.breedRowId.startsWith('mixed-'))assert.equal(d.contact.groomingPriceContext.breedRowIds.length,1,row.breedName);
  if(!row.breedRowId.startsWith('mixed-'))assert.equal(d.contact.groomingPriceContext.breedRowIds[0],row.breedRowId,row.breedName);
 }
});
test('admin calendar distinguishes evening, after midnight and open hours',()=>{
 for(const [time,day] of [['2026-11-03T18:00:00Z','TOMORROW'],['2026-11-03T22:30:00Z','TODAY'],['2026-11-04T07:00:00Z',null]]){
  const now=new Date(time),d=ask(original,{}, {now}),plan=avitoReplyPlan(d,settings,now);assert.equal(plan.facts.administrator.nextDay,day);assert.equal(plan.facts.administrator.working,day===null);
 }
});
test('AI wording is flexible while numeric/source facts are inserted exactly',()=>{
 const d=ask('Сколько полный комплекс йорку?'),plan=avitoReplyPlan(d,settings,at);const tokens=plan.facts.requiredBlocks.map(b=>`{{${b.id}}}`).join('\n\n');
 const a=renderAvitoModelReply({text:`Да, подскажу.\n\n${tokens}\n\nХотите оставить пожелания по стрижке здесь?`},plan.facts);
 const b=renderAvitoModelReply({text:`Для йорка можем сориентировать по прайсу:\n\n${tokens}\n\nЧто хотелось бы сделать с шерстью?`},plan.facts);
 assert.ok(a);assert.ok(b);assert.notEqual(a,b);assert.match(a.replace(/\s/g,' '),/2 500 ₽/);assert.ok(!a.includes('{{'));
});
test('AI cannot invent a price, reopen the administrator, repeat known fields or omit missing ones',()=>{
 const d=ask(original),facts=avitoReplyPlan(d,settings,at).facts,anchors=facts.requiredBlocks.map(b=>`{{${b.id}}}`).join('\n');
 const good=`${anchors}\nСтоимость для помапу уточнит администратор. Подскажите, пожалуйста, сколько весит собачка и какой у неё возраст?`;
 assert.ok(renderAvitoModelReply({text:good},facts));
 for(const text of [good+' Стоит 2500 ₽.',good+' Сейчас администратор позвонит.',good+' Какой породы собака?',good+' Кого планируете привести?',`${anchors}\nУточните, кошка или собака?`,good.replace(' и какой у неё возраст',''),good.replace(anchors,''),good+' Вы записаны.'])assert.equal(renderAvitoModelReply({text},facts),null,text);
});
test('urgency, staff control and callback refusal stay outside free response generation',()=>{
 for(const [text,more] of [['Собачка задыхается, сколько стрижка?',{}],[original,{mode:'HUMAN'}],['Не звоните, только здесь',{}]])assert.equal(avitoReplyPlan(ask(text,{},more),settings,at),null);
});
