import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const catalog=require('../apps/api/src/modules/grooming/price-catalog.json');
const {groomingPriceEntries,groomingPriceFields,groomingRetiredCatalogKeys,groomingServiceBookable}=require('../apps/api/dist/modules/grooming/price-catalog.js');
test('only haircuts without washing are removed; all other approved prices and keys are retained',()=>{
  const entries=groomingPriceEntries(),byKey=new Map(entries.map(e=>[e.catalogKey,e]));
  assert.equal(entries.length,172);assert.equal(byKey.size,172);assert.equal(groomingRetiredCatalogKeys.length,46);
  for(const key of groomingRetiredCatalogKeys){assert.equal(byKey.has(key),false,key);assert.equal(groomingServiceBookable({catalogKey:key,priceType:'FIXED'}),false,key);}
  for(const breed of catalog.dogs)for(const kind of ['dry','hygiene','full']){
    const key=`dog:${breed.id}:${kind}`;
    if(kind==='dry'&&!breed.coatCare)continue;
    const entry=byKey.get(key);assert.ok(entry,key);
    for(const [field,value]of Object.entries(groomingPriceFields(breed[kind])))assert.equal(entry[field],value,`${key}:${field}`);
    if(kind==='dry')assert.match(entry.title,/Вычёсывание без мытья/);
  }
  assert.ok(byKey.has('cat:extra:deshed'));assert.ok(byKey.has('cat:clean:wash'));assert.ok(byKey.has('cat:matted:wash'));
  assert.ok(entries.some(e=>e.priceType==='QUOTE'),'unpriced offered services remain available for consultation');
  const brushing=entries.find(entry=>entry.catalogKey.startsWith('dog:')&&entry.catalogData.kind==='dry');
  assert.ok(brushing);assert.equal(groomingServiceBookable({...brushing,priceType:'FIXED'}),true);
  assert.equal(groomingServiceBookable({catalogKey:null,priceType:'FIXED'}),true,'manual services keep existing behavior');
});
