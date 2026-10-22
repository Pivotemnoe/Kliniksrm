import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {withAvitoListingSource}=require('../apps/api/dist/modules/avito/avito-booking-source.js');
const grooming={direction:'GROOMING',available:true,selfBookingEnabled:false,siteUrl:'https://pet.temichevvet.ru/',address:null};
const hotel={...grooming,direction:'HOTEL',siteUrl:'https://pet.temichevvet.ru/pet-hotel/'};
const rule=(direction,id='8339919613')=>({direction,id,enabled:true});

test('website referrals carry exactly the mapped public source and string listing id for their own direction',()=>{
 const g=withAvitoListingSource(grooming,rule('GROOMING'));
 assert.equal(g.siteUrl,'https://pet.temichevvet.ru/?utm_source=avito&listing_id=8339919613');
 assert.equal(g.selfBookingEnabled,false);assert.equal(grooming.siteUrl,'https://pet.temichevvet.ru/');
 const h=withAvitoListingSource(hotel,rule('HOTEL','4322482374'));
 assert.equal(h.siteUrl,'https://pet.temichevvet.ru/pet-hotel/?utm_source=avito&listing_id=4322482374');
 assert.equal(withAvitoListingSource(g,rule('GROOMING')).siteUrl,g.siteUrl);
});
test('a disabled, missing, wrong-direction or malformed mapping cannot add attribution',()=>{
 for(const id of ['',0,202,'0','0202','-2','+2','2.5','2e3',' 202','202\n','１２３','1'.repeat(21),'202&phone=private']){
  assert.equal(withAvitoListingSource(grooming,rule('GROOMING',id)).siteUrl,grooming.siteUrl,String(id));
 }
 for(const mapping of [undefined,{...rule('GROOMING'),enabled:false},rule('HOTEL'),rule('CLINIC')])assert.equal(withAvitoListingSource(grooming,mapping).siteUrl,grooming.siteUrl);
 const long='99999999999999999999';assert.equal(new URL(withAvitoListingSource(grooming,rule('GROOMING',long)).siteUrl).searchParams.get('listing_id'),long);
 assert.equal(new URL(withAvitoListingSource(grooming,rule('GROOMING','1')).siteUrl).searchParams.get('listing_id'),'1');
 assert.equal(withAvitoListingSource(undefined,rule('GROOMING')),undefined);
});
test('only the trusted HTTPS page for the same business direction receives the source pair',()=>{
 for(const url of ['http://pet.temichevvet.ru/','https://pet.temichevvet.ru.evil.example/','https://pet.temichevvet.ru@evil.example/','https://user:private@pet.temichevvet.ru/','https://pet.temichevvet.ru:444/','https://pet.temichevvet.ru/pet-hotel/','https://pet.temichevvet.ru/redirect','not a URL']){
  assert.equal(withAvitoListingSource({...grooming,siteUrl:url},rule('GROOMING')).siteUrl,grooming.siteUrl,url);
 }
 assert.equal(withAvitoListingSource({...hotel,siteUrl:grooming.siteUrl},rule('HOTEL')).siteUrl,hotel.siteUrl);
 assert.equal(new URL(withAvitoListingSource({...hotel,siteUrl:'https://pet.temichevvet.ru/pet-hotel'},rule('HOTEL','303')).siteUrl).searchParams.get('listing_id'),'303');
});
test('old campaign fields, another listing id, personal data and fragments are never forwarded',()=>{
 const dirty={...grooming,siteUrl:grooming.siteUrl+'?utm_source=other&utm_campaign=private&listing_id=303&chat_id=private&phone=private#private'};
 const url=new URL(withAvitoListingSource(dirty,rule('GROOMING')).siteUrl);
 assert.deepEqual([...url.searchParams],[['utm_source','avito'],['listing_id','8339919613']]);assert.equal(url.hash,'');assert.doesNotMatch(url.href,/private|303|other/);
 assert.equal(withAvitoListingSource(dirty).siteUrl,grooming.siteUrl);
});
