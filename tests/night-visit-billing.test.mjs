import assert from 'node:assert/strict';
import test from 'node:test';
import { nightVisitBillingDeadline } from '../apps/api/dist/modules/visits/night-visit-billing.js';

const actor = { id: 'doctor-1', roles: ['doctor'] };
const visit = (completedAt, employeeId = actor.id, status = 'COMPLETED') => ({ status, employeeId, completedAt: new Date(completedAt) });
test('night window includes 19:30, crosses midnight and excludes 09:00 in the branch timezone', () => {
  const v = visit('2026-10-15T16:30:00Z');
  for (const now of ['2026-10-15T16:30:00Z', '2026-10-15T20:59:59Z', '2026-10-16T00:00:00Z', '2026-10-16T05:59:59Z']) {
    assert.equal(nightVisitBillingDeadline(v, actor, new Date(now))?.toISOString(), '2026-10-16T06:00:00.000Z');
  }
  for (const now of ['2026-10-15T16:29:59Z', '2026-10-16T06:00:00Z', '2026-10-16T16:30:00Z']) assert.equal(nightVisitBillingDeadline(v, actor, new Date(now)), null);
});
test('night exception is limited to the responsible doctor and visits completed during this night', () => {
  const now = new Date('2026-10-15T21:00:00Z');
  for (const v of [visit('2026-10-15T16:29:59Z'), visit('2026-10-14T22:00:00Z'), visit('2026-10-16T01:00:00Z'), visit('2026-10-15T20:00:00Z', 'other-doctor'), visit('2026-10-15T20:00:00Z', actor.id, 'CANCELLED')]) assert.equal(nightVisitBillingDeadline(v, actor, now), null);
  assert.equal(nightVisitBillingDeadline(visit('2026-10-15T20:00:00Z'), { id: actor.id, roles: ['administrator'] }, now), null);
});
test('night deadline uses branch calendar across DST and year boundary', () => {
  assert.equal(nightVisitBillingDeadline(visit('2026-12-31T10:31:00Z'), actor, new Date('2026-12-31T23:00:00Z'), 'Asia/Tokyo')?.toISOString(), '2027-01-01T00:00:00.000Z');
  assert.equal(nightVisitBillingDeadline(visit('2026-10-24T17:30:00Z'), actor, new Date('2026-10-25T01:30:00Z'), 'Europe/Amsterdam')?.toISOString(), '2026-10-25T08:00:00.000Z');
});
