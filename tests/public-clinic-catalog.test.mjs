import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { toPublicCatalogItem, publicCatalogSelect, PublicClinicCatalogSyncService } = require('../apps/api/dist/modules/notifications/public-clinic-catalog-sync.service.js');
const { OwnerGatewayClient } = require('../apps/api/dist/modules/notifications/providers/owner-gateway.client.js');
const { PublicClinicCatalogService, validateCatalog } = require('../apps/owner-gateway/dist/public-clinic-catalog.service.js');
const { PublicClinicCatalogController } = require('../apps/owner-gateway/dist/public-clinic-catalog.controller.js');
const { UpsertPublicCatalogDto } = require('../apps/owner-gateway/dist/dto/upsert-public-catalog.dto.js');
const { Prisma } = require('../apps/owner-gateway/dist/generated/client/index.js');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const fixed = { id: 'synthetic-service', title: 'Тестовая услуга', category: { title: 'Тестовая категория' }, priceType: 'FIXED', price: '1234.50', minimumPrice: null, maximumPrice: null };
const snapshot = (age = 0, items = [toPublicCatalogItem(fixed)]) => ({ currency: 'RUB', capturedAt: new Date(Date.now() - age).toISOString(), items });
function databaseDouble() {
  let row = null;
  return { publicClinicCatalog: {
    async create({ data }) { if (row) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '6' }); row = structuredClone(data); return row; },
    async updateMany({ where, data }) { if (row && row.id === where.id && row.capturedAt < where.capturedAt.lt) { row = { ...row, ...structuredClone(data) }; return { count: 1 }; } return { count: 0 }; },
    async findUnique() { return row; },
  } };
}
test('public projection supports fixed, range, zero and legacy missing bounds without exposing internals', () => {
  const result = toPublicCatalogItem({ ...fixed, description: 'PRIVATE', linkedProducts: ['SECRET'] });
  assert.equal(result.price, 1234.5); assert.equal(result.priceType, 'FIXED');
  assert.equal('description' in result, false); assert.equal('linkedProducts' in result, false);
  assert.deepEqual(Object.keys(publicCatalogSelect).sort(), ['category','id','maximumPrice','minimumPrice','price','priceType','title']);
  assert.equal(toPublicCatalogItem({ ...fixed, price: 0 }).price, 0);
  assert.deepEqual(toPublicCatalogItem({ ...fixed, priceType: 'FLOATING', minimumPrice: '100', maximumPrice: '300' }), { ...result, priceType: 'RANGE', price: null, minimumPrice: 100, maximumPrice: 300 });
  for (const service of [{...fixed, priceType:'FLOATING'}, {...fixed, price:-1}, {...fixed, price:'NaN'}, {...fixed,priceType:'UNKNOWN'}]) assert.equal(toPublicCatalogItem(service).priceType,'ON_REQUEST');
});
test('gateway requires sync secret before accessing storage', async () => {
  const previous = process.env.OWNER_GATEWAY_SYNC_SECRET; process.env.OWNER_GATEWAY_SYNC_SECRET = 'a'.repeat(48);
  try { const controller = new PublicClinicCatalogController({ upsert() { throw new Error('Storage must not be reached'); } }); assert.throws(() => controller.put(undefined, snapshot())); assert.throws(() => controller.put('wrong', snapshot())); }
  finally { if (previous === undefined) delete process.env.OWNER_GATEWAY_SYNC_SECRET; else process.env.OWNER_GATEWAY_SYNC_SECRET = previous; }
});
test('gateway DTO rejects unknown fields, negative money and invalid ranges', async () => {
  for (const input of [{ ...snapshot(), clinicalData:'private' }, { ...snapshot(),items:[{...snapshot().items[0],price:-1}] },{...snapshot(),items:[{...snapshot().items[0],description:'private'}]}]) {
    assert.ok((await validate(plainToInstance(UpsertPublicCatalogDto,input),{whitelist:true,forbidNonWhitelisted:true})).length);
  }
  assert.throws(() => validateCatalog(snapshot(0,[{...snapshot().items[0],priceType:'RANGE',minimumPrice:200,maximumPrice:100}])));
  assert.throws(() => validateCatalog(snapshot(-600000)));
  assert.throws(() => validateCatalog(snapshot(0,[snapshot().items[0],snapshot().items[0]])));
});
test('catalog handles missing/stale snapshots, price edits, opt-out and reordered retries', async () => {
  const service = new PublicClinicCatalogService(databaseDouble());
  assert.equal((await service.get()).status,'unavailable');
  const oldest = snapshot(90000000); await service.upsert(oldest);
  assert.deepEqual((await service.get()).items,[]); assert.equal((await service.get()).status,'stale');
  const first = snapshot(5000); assert.equal((await service.upsert(first)).accepted,true);
  assert.equal((await service.get()).items[0].price,1234.5);
  const edited = snapshot(3000,[toPublicCatalogItem({...fixed,price:1900})]); await service.upsert(edited);
  assert.equal((await service.get()).items[0].price,1900);
  assert.equal((await service.upsert(first)).accepted,false); assert.equal((await service.get()).items[0].price,1900);
  assert.equal((await service.upsert(edited)).accepted,false);
  await service.upsert(snapshot(1000,[])); assert.deepEqual((await service.get()).items,[]);
});
test('CRM sync is opt-in, excludes zero prices, filters active published services, includes empty snapshots and recovers after failure', async () => {
  const previous = process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED;
  let fail=false, count=0; const sent=[];
  const prisma = {service:{async findMany(query){count++;assert.deepEqual(query.where,{isActive:true,publicOnWebsite:true,price:{gt:0}});return count===1?[fixed]:[];}}};
  const runner = new PublicClinicCatalogSyncService(prisma,{async syncPublicCatalog(value){if(fail) throw Error('network');sent.push(value);}});
  try {
    delete process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED; assert.equal(await runner.syncOnce(),'disabled');assert.equal(count,0);
    process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED='true';assert.equal(await runner.syncOnce(),'synced');assert.equal(sent[0].items[0].price,1234.5);
    fail=true;assert.equal(await runner.syncOnce(),'failed');fail=false;assert.equal(await runner.syncOnce(),'synced');assert.deepEqual(sent[1].items,[]);
  } finally { if(previous===undefined)delete process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED;else process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED=previous;runner.onModuleDestroy(); }
});
test('gateway client sends one JSON object with server-only secret to the exact catalog endpoint', async () => {
  const oldFetch = global.fetch; const url=process.env.OWNER_GATEWAY_URL;const secret=process.env.OWNER_GATEWAY_SYNC_SECRET;
  process.env.OWNER_GATEWAY_URL='https://gateway.example.test';process.env.OWNER_GATEWAY_SYNC_SECRET='synthetic-test-secret';
  global.fetch=async (url,options)=>{ assert.equal(url,'https://gateway.example.test/internal/v1/clinic/catalog');assert.equal(options.method,'PUT');assert.equal(options.headers['X-Owner-Gateway-Secret'],'synthetic-test-secret');assert.equal(JSON.parse(options.body).currency,'RUB');return new Response('{"accepted":true}',{status:200}); };
  try { await new OwnerGatewayClient({},{}).syncPublicCatalog(snapshot()); }
  finally {global.fetch=oldFetch;if(url===undefined)delete process.env.OWNER_GATEWAY_URL;else process.env.OWNER_GATEWAY_URL=url;if(secret===undefined)delete process.env.OWNER_GATEWAY_SYNC_SECRET;else process.env.OWNER_GATEWAY_SYNC_SECRET=secret;}
});
