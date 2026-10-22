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
const bundle=await require('esbuild').build({entryPoints:[project+'src/SiteBooking.jsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,plugins:[{name:'shared-react',setup(build){build.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:require.resolve(args.path),external:true}));}}]});
await writeFile(path.join(temp,'booking.cjs'),bundle.outputFiles[0].text);
const {SiteBooking}=require(path.join(temp,'booking.cjs'));
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
test.after(()=>rm(temp,{recursive:true,force:true}));
