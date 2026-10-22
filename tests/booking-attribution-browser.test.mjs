import assert from 'node:assert/strict';
import test from 'node:test';
import {captureAttribution,normalizeAttribution} from '../packages/booking-attribution/browser.mjs';

const value={source:'AVITO',listingId:'8339919613'};
function storage(){const data=new Map();return {data,getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}

test('only a complete unambiguous Avito pair is captured; no other URL data are retained',()=>{
 const store=storage();
 assert.deepEqual(captureAttribution({module:'GROOMING',search:'?utm_source=avito&listing_id=8339919613&phone=private&token=secret',storage:store,now:100}),value);
 assert.doesNotMatch(JSON.stringify([...store.data]),/private|secret|phone|token/);
 for(const search of ['?utm_source=avito','?listing_id=8339919613','?utm_source=yandex&listing_id=8339919613','?utm_source=avito&listing_id=0','?utm_source=avito&listing_id=0123','?utm_source=avito&listing_id=1e3','?utm_source=avito&listing_id=123456789012345678901','?utm_source=avito&listing_id=1&listing_id=2'])assert.equal(captureAttribution({module:'GROOMING',search,storage:store,now:100}),undefined,search);
 assert.equal(store.data.size,0);
});
test('same-direction navigation and reload retain the source for thirty minutes; another module stays separate',()=>{
 const store=storage();captureAttribution({module:'GROOMING',search:'?utm_source=avito&listing_id=8339919613',storage:store,now:100});
 assert.deepEqual(captureAttribution({module:'GROOMING',storage:store,now:200}),value);
 assert.equal(captureAttribution({module:'PET_HOTEL',storage:store,now:200}),undefined);
 const hotel={source:'AVITO',listingId:'4322482374'};
 assert.deepEqual(captureAttribution({module:'PET_HOTEL',search:'?utm_source=avito&listing_id=4322482374',storage:store,now:200}),hotel);
 assert.deepEqual(captureAttribution({module:'GROOMING',storage:store,now:300}),value);
 assert.equal(captureAttribution({module:'GROOMING',storage:store,now:100+30*60*1000}),undefined);
});
test('invalid input clears previous attribution; disabled storage does not break the journey',()=>{
 const store=storage();captureAttribution({module:'GROOMING',search:'?utm_source=avito&listing_id=8339919613',storage:store,now:100});
 captureAttribution({module:'GROOMING',search:'?utm_source=avito',storage:store,now:200});
 assert.equal(captureAttribution({module:'GROOMING',storage:store,now:300}),undefined);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.deepEqual(captureAttribution({module:'GROOMING',search:'?utm_source=avito&listing_id=8339919613',storage:blocked}),value);
 assert.equal(captureAttribution({module:'GROOMING',storage:blocked}),undefined);
});
test('normalized attribution contains exactly the two allowed fields',()=>{
 for(const bad of [null,[],{},'avito',{source:'AVITO'}, {source:'avito',listingId:'123'}, {...value,ownerId:'injected'}, {...value,price:1}])assert.equal(normalizeAttribution(bad),undefined);
 assert.deepEqual(normalizeAttribution(value),value);
});
