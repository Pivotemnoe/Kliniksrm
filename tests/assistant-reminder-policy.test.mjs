import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNotificationTime, notificationLocalTime } from '../apps/owner-gateway/dist/owner-notification-policy.js';
test('quiet hours cover overnight, daytime, exact boundary and disabled interval', () => {
  const at = new Date('2026-10-08T20:30:15Z');
  assert.equal(nextNotificationTime(at, 'Europe/Moscow', 1320, 480).toISOString(), '2026-10-09T05:00:00.000Z');
  assert.equal(nextNotificationTime(new Date('2026-10-09T04:59:30Z'), 'Europe/Moscow', 1320, 480).toISOString(), '2026-10-09T05:00:00.000Z');
  assert.equal(nextNotificationTime(at, 'Europe/Moscow', 0, 0), at);
  const day = new Date('2026-10-08T10:00:00Z');
  assert.equal(nextNotificationTime(day, 'Europe/Moscow', 720, 840).toISOString(), '2026-10-08T11:00:00.000Z');
  assert.equal(nextNotificationTime(new Date('2026-10-08T05:00:00Z'), 'Europe/Moscow', 1320, 480).toISOString(), '2026-10-08T05:00:00.000Z');
});
test('quiet hours use real UTC instants through DST changes and local date rollover', () => {
  assert.equal(nextNotificationTime(new Date('2026-03-29T00:30:00Z'), 'Europe/Berlin', 60, 180).toISOString(), '2026-03-29T01:00:00.000Z');
  assert.equal(nextNotificationTime(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin', 120, 180).toISOString(), '2026-10-25T02:00:00.000Z');
  assert.equal(notificationLocalTime(new Date('2026-10-08T23:00:00Z'), 'Asia/Kamchatka').dayKey, '2026-10-09');
  assert.throws(() => notificationLocalTime(new Date(), 'invalid-timezone'));
});
