import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {normalizeCatalog} from '../src/catalog.js';
const output=process.argv[2] || '/Users/konstantin/Documents/CRM/outputs/clinic-site-release-20260923';
const base='https://clinic.temichevvet.ru';
const manifestPath=process.argv[2] ? output+'/SHA256SUMS' : output+'/site/SHA256SUMS';
const manifest=(await readFile(manifestPath,'utf8')).trim().split('\n').map(line=>({hash:line.slice(0,64),file:line.slice(66)}));
const result={at:new Date().toISOString(),files:[],checks:[]};
async function get(path,options={}){
  for(let attempt=0;attempt<5;attempt++){
    const response=await fetch(base+path,{signal:AbortSignal.timeout(20000),...options});
    if(response.status!==429 || attempt===4)return response;
    await response.arrayBuffer();
    await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));
  }
}
let cursor=0;
await Promise.all(Array.from({length:2},async()=>{
  while(cursor<manifest.length){
    const entry=manifest[cursor++];
    const path=entry.file==='index.html'?'/':entry.file.endsWith('/index.html')?'/'+entry.file.slice(0,-11):'/'+entry.file;
    // The private error document is exposed only when Nginx serves a 404.
    const requestPath=entry.file==='404.html'?'/release-unknown-check':path;
    const response=await get(requestPath);
    assert.equal(response.status,entry.file==='404.html'?404:200,path);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.hash,path);
    if(entry.file.endsWith('index.html')){
      assert.match(bytes.toString(),/content="index,follow"/);
      assert.match(bytes.toString(),/rel="canonical"/);
      assert.match(response.headers.get('content-security-policy'),/style-src-attr 'unsafe-inline'/);
      assert.match(response.headers.get('content-security-policy'),/script-src 'self';/);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    }
    result.files.push({path:requestPath,status:response.status,sha256:entry.hash});
  }
}));
for(const path of ['/photo-plan','/internal/','/assets/missing-release-file.js','/assets/anatomy-dog-muscles-v2.provenance.md','/api/unknown']){
  const r=await get(path);assert.equal(r.status,404,path);result.checks.push({path,status:r.status});
}
for(const [path,target] of [['/about','/clinic'],['/about/','/clinic'],['/inpatient','/services/inpatient']]){
  const r=await get(path,{redirect:'manual'});assert.equal(r.status,301);assert.equal(new URL(r.headers.get('location'),base).pathname,target);result.checks.push({path,status:r.status,target});
}
const catalogResponse=await get('/api/prices');assert.equal(catalogResponse.status,200);assert.match(catalogResponse.headers.get('cache-control'),/no-store/);
const raw=await catalogResponse.json();const catalog=normalizeCatalog(raw);
assert.equal(catalog.items.length,raw.items.length);
assert.ok(catalog.items.length>0);
for(const item of raw.items)assert.deepEqual(Object.keys(item).sort(),['category','id','maximumPrice','minimumPrice','price','priceType','title']);
const upstream=await (await get('/v1/public/clinic/catalog')).json();assert.deepEqual(raw.items,upstream.items);
result.catalog={count:catalog.items.length,updatedAt:catalog.updatedAt,matchesPublicGateway:true,noZeroOrInternal:true};
const inquiries=await get('/api/inquiries');assert.equal(inquiries.status,503);result.inquiries='disabled, verified without submitting data';
const pwa=await fetch('https://temichevvet.ru/api/health',{signal:AbortSignal.timeout(15000)});result.neighborPwaHealth=pwa.status;assert.equal(pwa.status,200);
result.files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(output+'/live-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({filesVerified:result.files.length,catalog:result.catalog,checks:result.checks,inquiries:result.inquiries,neighborPwaHealth:result.neighborPwaHealth},null,2));
