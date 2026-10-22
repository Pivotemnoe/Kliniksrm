import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DashboardService } = require('../apps/api/dist/modules/dashboard/dashboard.service.js');
const { StaffAlertsService } = require('../apps/api/dist/modules/staff-alerts/staff-alerts.service.js');
const emptyModel = { findMany: async () => [], count: async () => 0, aggregate: async () => ({ _sum: { amount: 0 } }) };
test('dashboard counts all 321 low-stock products and 27 expiring batches while preview remains six', async () => {
 const products = Array.from({length: 321}, (_,i)=>({id:`p${i}`, title:`Product ${i}`, minStock:1, batches:[], stockUnit:'шт.'}));
 const batches = Array.from({length:27},(_,i)=>({id:`b${i}`}));
 const repo = new Proxy({}, { get: (_, key) => key === 'product' ? {findMany: async ({take}) => products.slice(0,take)} : key === 'stockBatch' ? {findMany: async ({take}) => batches.slice(0,take)} : emptyModel });
 const result = await new DashboardService(repo, {}).getToday({date:'2026-09-24'}, {id:'d',roles:['director'],permissions:['*']});
 assert.equal(result.stock.lowStockProducts, 321); assert.equal(result.stock.lowStockItems.length, 6);
 assert.equal(result.stock.expiringBatches, 27); assert.equal(result.stock.expiringItems.length, 6);
});
test('doctor with broad permissions never queries billing, stock or site requests for operational alerts', async () => {
 const repo = new Proxy({}, {get: (_,key) => ['bill','product','employeeWarehouseAccess','onlineAppointmentRequest'].includes(key)
  ? {findMany: async () => { throw Error(`Doctor queried ${key}`); }} : emptyModel });
 const result = await new StaffAlertsService(repo, {}).list({id:'doctor',roles:['doctor'],permissions:['*']});
 assert.equal(result.items.some(x=>['UNPAID_BILL','LOW_STOCK'].includes(x.kind)),false);
});
test('doctor dashboard never returns site-request details even with appointment permissions', async () => {
 const repo = new Proxy({}, { get: (_, key) => key === 'onlineAppointmentRequest'
  ? { count: async () => 2, findMany: async () => [{ id: 'private-request', ownerName: 'Private', phone: '+79990000000' }] }
  : emptyModel });
 const result = await new DashboardService(repo, {}).getToday({ date: '2026-10-18' }, { id: 'doctor', roles: ['doctor'], permissions: ['*', 'appointments.read'] });
 assert.deepEqual(result.onlineRequests, { newRequests: 0, inReview: 0, items: [] });
});

test('operational billing access does not expose clinic-wide monetary totals', async () => {
 const repo = new Proxy({}, {get: () => ({...emptyModel, aggregate: async () => ({_sum:{amount:123456}})})});
 const service = new DashboardService(repo, {});
 const administrator = await service.getToday({date:'2026-10-22'}, {id:'qa-admin', roles:['administrator'], permissions:['dashboard.read','billing.read']});
 assert.equal(administrator.finance.paymentsTodayAmount,0);
 assert.equal(administrator.finance.refundsTodayAmount,0);
 const director = await service.getToday({date:'2026-10-22'}, {id:'qa-director', roles:['director'], permissions:['dashboard.read','billing.read','business.read']});
 assert.equal(director.finance.paymentsTodayAmount,123456);
});
