import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { routes } from '../prototypes/temichevvet-clinic-site-24-7/src/content.js';
const base='https://clinic.temichevvet.ru';
const fetch=async (...args)=>{for(let attempt=0;attempt<3;attempt++){try{return await globalThis.fetch(...args)}catch(error){if(attempt===2)throw error;console.log('Retrying external HTTPS check')}}};
const checks=[];
const titles=new Set();
for(const route of routes){
 const response=await fetch(base+route,{signal:AbortSignal.timeout(15000)});const html=await response.text();
 assert.equal(response.status,200,route);assert.match(html,/<h1[ >]/);assert.match(html,/content="index,follow"/);assert.doesNotMatch(html,/Локальный макет|Проверить форму/);
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/frame-src https:\/\/yandex.ru/);
 const title=html.match(/<title>(.*?)<\/title>/)[1];titles.add(title);checks.push({route,status:response.status,title});
}
assert.equal(titles.size,routes.length);
for(const route of ['/release-unknown-check','/photo-plan','/internal/v1/clinic/catalog','/assets/missing-release-file.js']){
 const r=await fetch(base+route,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,404,route);checks.push({route,status:r.status});
}
const r=await fetch(base+'/v1/public/clinic/catalog',{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
const catalog=await r.json();assert.equal(catalog.status,'ready');assert.equal(catalog.items.length,272);
const selection=JSON.parse(await fs.readFile('outputs/clinic-site-release-20260905/selection.json','utf8'));
const expected=new Map(selection.selected.map(s=>[s.id,s]));
for(const item of catalog.items){
 assert.deepEqual(Object.keys(item).sort(),['category','id','maximumPrice','minimumPrice','price','priceType','title']);
 const source=expected.get(item.id);assert.ok(source,'Unapproved item');assert.equal(item.title,source.title);assert.equal(item.category,source.category||'Другие услуги');
 if(source.priceType==='FIXED'){assert.equal(item.priceType,'FIXED');assert.equal(item.price,source.price);assert.ok(item.price>0)}
 else if(source.minimumPrice!==null&&source.maximumPrice!==null){assert.equal(item.priceType,'RANGE');assert.equal(item.minimumPrice,source.minimumPrice);assert.equal(item.maximumPrice,source.maximumPrice)}
 assert.doesNotMatch(item.category,/Тестовые/);
}
const denied=await fetch(base+'/v1/public/clinic/catalog',{method:'POST',signal:AbortSignal.timeout(15000)});assert.equal(denied.status,403);
const unauthed=await fetch('https://cabinet.temichevvet.ru/internal/v1/clinic/catalog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({capturedAt:new Date().toISOString(),currency:'RUB',items:[]}),signal:AbortSignal.timeout(15000)});assert.equal(unauthed.status,403);
const firstUpdated=catalog.updatedAt;
const result={at:new Date().toISOString(),pages:checks,publicCatalog:{count:catalog.items.length,updatedAt:firstUpdated,allMatchReviewedCrm:true,privateFields:false,zeroPrices:false},writeGuards:{publicPost:denied.status,internalWithoutSecret:unauthed.status}};
await fs.writeFile('outputs/clinic-site-release-20260905/live-http-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
