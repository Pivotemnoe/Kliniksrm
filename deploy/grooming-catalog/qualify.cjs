require('/app/node_modules/reflect-metadata');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const manifest=require('/tmp/grooming-wash-release.json'),base='/app/apps/api/dist/modules/grooming/';
for(const file of manifest.compiled)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(base+file.name)).digest('hex'),file.sha256);
const {groomingPriceEntries,groomingRetiredCatalogKeys,groomingServiceBookable}=require(base+'price-catalog.js');
assert.equal(groomingPriceEntries().length,172);assert.equal(groomingRetiredCatalogKeys.length,46);
assert.deepEqual([...groomingRetiredCatalogKeys].sort(),[...manifest.retiredCatalogKeys].sort());
for(const key of groomingRetiredCatalogKeys){assert.equal(groomingPriceEntries().some(e=>e.catalogKey===key),false);assert.equal(groomingServiceBookable({catalogKey:key,priceType:'FIXED'}),false);}
assert.ok(groomingPriceEntries().some(e=>e.catalogKey==='cat:extra:deshed'));
assert.ok(groomingPriceEntries().some(e=>e.catalogKey==='dog:york:hygiene'));
assert.ok(groomingPriceEntries().some(e=>e.catalogKey==='dog:york:full'));
const {GroomingCrmService}=require(base+'grooming.service.js');assert.equal(typeof GroomingCrmService.prototype.importPrices,'function');
console.log(JSON.stringify({passed:true,compiledHashesVerified:manifest.compiled.length,offeredServices:172,retiredHaircuts:46,hygieneAndBrushingPreserved:true,databaseAccess:false,externalNetwork:false}));
