import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const server=await createServer({configFile:false,esbuild:{jsx:'automatic'},server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
const {SiteBooking}=await server.ssrLoadModule('/src/SiteBooking.jsx');
const breed={id:'york',species:'dog',size:'small',name:'Йоркширский терьер'};
const service=(id,kind,title)=>({id,title,priceLabel:'2 000 ₽',bookable:true,catalogKey:`dog:york:${kind}`,catalogData:{kind,breedId:'york',species:'DOG'}});
const services=[service('dry','dry','Отменённая стрижка без мытья'),service('full','full','Полный комплекс')];
function render(storefront){return renderToStaticMarkup(React.createElement(SiteBooking,{config:{bookingPortalUrl:'https://cabinet.temichevvet.ru/portal/grooming',storefront},breed,lookIds:[],selectedLooks:[],notes:'',onNotes(){},onToggleLook(){},lookName(){}}));}

await test('closed schedule gives a usable clinic contact, without an empty time picker or disabled MAX action',()=>{
 const html=render({connected:true,selfBookingEnabled:false,services,specialists:[]});
 assert.match(html,/Позвонить и записаться/);
 assert.match(html,/href="tel:\+79284214542"/);
 assert.doesNotMatch(html,/Грумер для записи|Дата визита|Свободное время|Продолжить через MAX/);
 assert.doesNotMatch(html,/Отменённая стрижка без мытья/);
 assert.match(html,/Полный комплекс/);
});
await test('open schedule retains the specialist, date and authenticated MAX handoff',()=>{
 const html=render({connected:true,selfBookingEnabled:true,services,specialists:[{id:'test-groomer',displayName:'Тестовый грумер',species:['DOG']}]});
 assert.match(html,/Грумер для записи/);
 assert.match(html,/Дата визита/);
 assert.match(html,/Тестовый грумер/);
 assert.match(html,/Продолжить через MAX/);
 assert.doesNotMatch(html,/Запишем через администратора/);
 assert.doesNotMatch(html,/Отменённая стрижка без мытья/);
});
await test('catalogue connection failure still offers the verified contact',()=>{
 const html=render(undefined);
 assert.match(html,/Позвонить и записаться/);
 assert.match(html,/href="tel:\+79284214542"/);
 assert.doesNotMatch(html,/Продолжить через MAX/);
});
await server.close();
