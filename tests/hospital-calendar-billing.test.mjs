import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { calculateHospitalStayDayLines } from '../apps/api/dist/modules/hospital/hospital-calendar-billing.js';
const d = (value) => new Prisma.Decimal(value);
const box = { id: 'box', name: 'Бокс', dailyRate: d(100), office: { timezone: 'Europe/Moscow' } };
const start = new Date('2026-09-25T20:55:00Z');
function stay(periods = []) { return { startedAt: start, dailyRateSnapshot: d(100), hospitalBox: box, ratePeriods: periods }; }
test('calendar days include admission and each midnight, not elapsed 24 hours', () => {
  assert.equal(calculateHospitalStayDayLines(stay(), start)[0].quantity.toNumber(), 1);
  assert.equal(calculateHospitalStayDayLines(stay(), new Date('2026-09-25T21:00:00Z'))[0].quantity.toNumber(), 2);
  assert.equal(calculateHospitalStayDayLines(stay(), new Date('2026-09-26T05:00:00Z'))[0].totalAmount.toNumber(), 200);
  assert.deepEqual(calculateHospitalStayDayLines(stay(), new Date('2026-09-25T20:00:00Z')), []);
});
test('rate change charges the transfer date once and keeps earlier price snapshots', () => {
  const periods = [
    { hospitalBoxId: 'box', hospitalBox: box, dailyRate: d(100), serviceId: 's1', serviceTitle: 'До 7 кг', startedAt: start, endedAt: new Date('2026-09-26T10:00:00Z') },
    { hospitalBoxId: 'other', hospitalBox: { name: 'Другой' }, dailyRate: d(200), serviceId: 's2', serviceTitle: 'Больше 7 кг', startedAt: new Date('2026-09-26T10:00:00Z'), endedAt: null },
  ];
  const lines = calculateHospitalStayDayLines(stay(periods), new Date('2026-09-27T05:00:00Z'));
  assert.equal(lines.reduce((sum, line) => sum + Number(line.quantity), 0), 3);
  assert.equal(lines.reduce((sum, line) => sum + Number(line.totalAmount), 0), 500);
  assert.equal(lines[1].serviceId, 's2');
});
test('calendar handles month and DST boundaries in clinic timezone', () => {
  const source = { ...stay(), startedAt: new Date('2026-10-24T23:00:00Z'), hospitalBox: { ...box, office: { timezone: 'Europe/Berlin' } } };
  assert.equal(Number(calculateHospitalStayDayLines(source, new Date('2026-10-25T23:00:00Z'))[0].quantity), 2);
  source.startedAt = new Date('2026-01-31T20:59:00Z');
  source.hospitalBox = box;
  assert.equal(Number(calculateHospitalStayDayLines(source, new Date('2026-01-31T21:01:00Z'))[0].quantity), 2);
});

test('first priced tariff covers all earlier unpriced calendar dates for any stay', () => {
 const admitted = new Date('2026-09-18T08:00:00Z');
 const selected = new Date('2026-09-29T13:00:00Z');
 const source = {...stay(), startedAt: admitted, dailyRateSnapshot:d(1000), ratePeriods:[
  {hospitalBoxId:'box',hospitalBox:box,dailyRate:d(0),serviceId:null,serviceTitle:null,startedAt:admitted,endedAt:selected},
  {hospitalBoxId:'box',hospitalBox:box,dailyRate:d(1000),serviceId:'s',serviceTitle:'Стационар',startedAt:selected,endedAt:null},
 ]};
 const lines=calculateHospitalStayDayLines(source,selected);
 assert.equal(lines.length,1);
 assert.equal(Number(lines[0].quantity),12);
 assert.equal(Number(lines[0].totalAmount),12000);
 assert.equal(Number(calculateHospitalStayDayLines(source,new Date('2026-09-29T21:00:00Z'))[0].totalAmount),13000);
});
test('zero price after a paid period remains free; no selected tariff remains zero', () => {
 const changed=new Date('2026-09-26T09:00:00Z');
 const source={...stay(),ratePeriods:[
  {hospitalBoxId:'box',hospitalBox:box,dailyRate:d(100),serviceId:'s',serviceTitle:'Стационар',startedAt:start,endedAt:changed},
  {hospitalBoxId:'box',hospitalBox:box,dailyRate:d(0),serviceId:null,serviceTitle:null,startedAt:changed,endedAt:null},
 ]};
 assert.equal(calculateHospitalStayDayLines(source,new Date('2026-09-27T09:00:00Z')).reduce((s,l)=>s+Number(l.totalAmount),0),100);
 assert.equal(Number(calculateHospitalStayDayLines({...stay(),dailyRateSnapshot:d(0)},start)[0].totalAmount),0);
});
