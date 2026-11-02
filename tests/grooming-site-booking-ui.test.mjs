import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';

const project=new URL('../prototypes/temichevvet-grooming-fitting-20261015/',import.meta.url).pathname;
const require=createRequire(project+'package.json');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const temp=await mkdtemp(path.join(tmpdir(),'grooming-booking-ui-'));
const bundle=await require('esbuild').build({entryPoints:{booking:project+'src/SiteBooking.jsx',prices:project+'src/PriceList.jsx'},outdir:temp,outExtension:{'.js':'.cjs'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,plugins:[{name:'shared-react',setup(build){build.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:require.resolve(args.path),external:true}));}}]});
for(const file of bundle.outputFiles)await writeFile(file.path,file.contents);
const {SiteBooking,BookingStart}=require(path.join(temp,'booking.cjs'));
const {PriceList}=require(path.join(temp,'prices.cjs'));
const catalog=require(new URL('../apps/api/src/modules/grooming/price-catalog.json',import.meta.url).pathname);
const service={id:'example-full',title:'Полный комплекс',priceLabel:'2 500 ₽',bookable:false,catalogData:{species:'DOG',breedId:'york',breedRowId:'york',kind:'full',category:'CARE'}};
function render(storefront,breed={id:'york',name:'Йоркширский терьер',species:'dog',size:'small'}){
 return renderToStaticMarkup(React.createElement(SiteBooking,{config:{storefront,bookingPortalUrl:'https://cabinet.temichevvet.ru/portal/grooming'},breed,notes:'',onNotes(){},lookIds:[],selectedLooks:[],onToggleLook(){},lookName:id=>id}));
}
const open={connected:true,selfBookingEnabled:true,services:[service],specialists:[]};
test('online selection stays visible with no eligible groomers and offers an honest phone fallback',()=>{
 const html=render(open);
 for(const label of ['Услуга для записи','Грумер для записи','Дата визита'])assert.ok(html.includes(label),label);
 assert.match(html,/Пока нет свободного времени/);
 assert.match(html,/Пока нет доступных грумеров/);
 assert.match(html,/href="tel:\+79284214542"/);
 assert.doesNotMatch(html,/Продолжить через MAX|все грумеры заняты|Для этой услуги длительность/);
});
test('a dog-only groomer does not appear as available for a cat',()=>{
 const html=render({...open,specialists:[{id:'dog-only',displayName:'Тестовый мастер собак',species:['DOG']}]},{id:'cat-domestic-short',name:'Кошка',species:'cat'});
 assert.match(html,/Пока нет свободного времени/);
 assert.doesNotMatch(html,/Тестовый мастер собак|Размер собаки для записи/);
});
test('disabled self-booking retains the working phone path',()=>{
 const html=render({...open,selfBookingEnabled:false});
 assert.match(html,/Позвонить и записаться/);
 assert.doesNotMatch(html,/Грумер для записи|Дата визита|Продолжить через MAX/);
});
test('a disconnected catalogue is not presented as a fully booked schedule',()=>{
 const html=render({...open,connected:false});
 assert.match(html,/Не удалось показать услуги/);
 assert.doesNotMatch(html,/Пока нет свободного времени|Дата визита/);
});
test('client choices keep the real start time and omit the end when duration changes',()=>{
 const startsAt='2026-10-29T07:00:00.000Z';
 const start=endsAt=>renderToStaticMarkup(React.createElement(BookingStart,{startsAt,endsAt}));
 assert.equal(start('2026-10-29T08:30:00.000Z'),'10:00');
 assert.equal(start('2026-10-29T09:00:00.000Z'),'10:00');
 assert.equal(start('2026-10-29T10:00:00.000Z'),'10:00');
});
test('booking excludes retired and manually named wash-free haircuts while retaining other care',()=>{
 const services=[
  service,
  {id:'legacy-dry',catalogKey:'dog:york:dry',title:'Старая услуга',catalogData:{species:'DOG'}},
  {id:'manual-dry',title:'Йорк · Стрижка собак без мытья',catalogData:{species:'DOG'}},
  {id:'renamed-dry',title:'Старая услуга',catalogData:{species:'DOG',serviceName:'СТРИЖКА БЕЗ\u00a0МЫТЬЯ'}},
  {id:'hygiene',title:'Гигиенический уход',catalogData:{species:'DOG'}},
  {id:'brushing',catalogKey:'dog:husky:dry',title:'Вычёсывание без мытья',catalogData:{species:'DOG'}},
 ];
 const html=render({...open,services});
 assert.doesNotMatch(html,/legacy-dry|manual-dry|renamed-dry|Стрижка собак без мытья|СТРИЖКА БЕЗ/);
 for(const label of ['Полный комплекс','Гигиенический уход','Вычёсывание без мытья'])assert.ok(html.includes(label),label);
 const cat=render({...open,services:[{id:'cat-dry',catalogKey:'cat:clean:dry',title:'Старая услуга',catalogData:{species:'CAT'}},{id:'cat-wash',title:'Стрижка и мытьё',catalogData:{species:'CAT'}},{id:'cat-deshed',title:'Экспресс-линька без мытья',catalogData:{species:'CAT'}}]},{id:'cat-domestic-short',name:'Кошка',species:'cat'});
 assert.doesNotMatch(cat,/cat-dry|Старая услуга/);
 assert.match(cat,/Стрижка и мытьё/);
 assert.match(cat,/Экспресс-линька без мытья/);
});
test('price cards never restore wash-free haircuts from the archived fallback catalogue',()=>{
 for(const connected of [false,true])for(const row of catalog.dogs){
  const html=renderToStaticMarkup(React.createElement(PriceList,{breed:{id:row.catalogueId||row.id,name:row.name,species:'dog',defaultServiceId:row.coatCare?'coat':'haircut'},storefront:{connected,services:[]},onBook(){},onShowLooks(){}}));
  assert.doesNotMatch(html,/Стрижка без мытья|Возможен без мытья|Мытьё дома|Мытьё и сушка — по согласованию/,row.id);
  assert.match(html,/Гигиенический уход/,row.id);
  if(row.coatCare)assert.match(html,/Вычёсывание без мытья/,row.id);
 }
 const html=renderToStaticMarkup(React.createElement(PriceList,{breed:{id:'cat-domestic-short',name:'Кошка',species:'cat'},storefront:{connected:false,services:[]},onBook(){},onShowLooks(){}}));
 assert.doesNotMatch(html,/Стрижка без мытья/);
 assert.match(html,/Стрижка и мытьё/);
});
test.after(()=>rm(temp,{recursive:true,force:true}));
