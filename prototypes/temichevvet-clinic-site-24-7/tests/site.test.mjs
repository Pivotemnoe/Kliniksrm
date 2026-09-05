import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { routes } from '../src/content.js';
import { validatePublicCatalog, formatPrice } from '../src/catalog.js';
test('all 16 pages have static content, unique titles, canonical and correct indexing',async()=>{
 const titles=new Set();for(const route of routes){const html=await fs.readFile(new URL(`../dist/client${route==='/'?'':route}/index.html`,import.meta.url),'utf8');assert.match(html,/<h1[ >]/);assert.match(html,/rel="canonical"/);assert.match(html,process.env.SITE_INDEXABLE==='true'? /content="index,follow"/ : /content="noindex,nofollow"/);assert.match(html,/<html lang="ru"/);if(process.env.VITE_SITE_PUBLIC_RELEASE==='true')assert.doesNotMatch(html,/Локальный макет|Проверить форму/);titles.add(html.match(/<title>(.*?)<\/title>/)[1]);}assert.equal(titles.size,routes.length);
});
test('every internal page link resolves to a generated page',async()=>{
 for(const route of routes){const html=await fs.readFile(new URL(`../dist/client${route==='/'?'':route}/index.html`,import.meta.url),'utf8');for(const m of html.matchAll(/href="(\/[^"]*)"/g)){const path=m[1].split(/[?#]/)[0];if(path.startsWith('/assets/')||path.startsWith('/fonts/'))continue;assert.ok(routes.includes(path),`${route}: ${path}`);}}
});
test('unfinished photo sections are honestly marked without exposing production notes',async()=>{
 for(const route of ['/team','/services/consultation','/services/diagnostics','/services/surgery','/services/pharmacy']){
  const html=await fs.readFile(new URL(`../dist/client${route}/index.html`,import.meta.url),'utf8');assert.match(html,/РАЗДЕЛ В РАЗРАБОТКЕ/);assert.match(html,/Клиника работает в обычном режиме/);assert.doesNotMatch(html,/МЕСТО ДЛЯ ФОТОГРАФИИ|здесь будут фотографии/i);
 }
});
test('frontend fails closed for stale, malformed or unavailable prices, preserves zero and ranges',()=>{
 const item={id:'test',title:'Тест',category:'Тест',priceType:'FIXED',price:0};const data={status:'ready',currency:'RUB',updatedAt:new Date().toISOString(),items:[item]};
 assert.ok(validatePublicCatalog(data));assert.match(formatPrice(item),/^0/);
 for(const altered of [{...data,status:'stale'},{...data,updatedAt:'2020-01-01'},{...data,items:[{...item,price:-1}]},{...data,items:[{...item,priceType:'RANGE',minimumPrice:100,maximumPrice:50}]}])assert.equal(validatePublicCatalog(altered),null);
 assert.match(formatPrice({...item,priceType:'RANGE',minimumPrice:100,maximumPrice:200}),/100.*200/);
 assert.doesNotMatch(formatPrice({...item,priceType:'RANGE',minimumPrice:100,maximumPrice:100}),/–/);
});
