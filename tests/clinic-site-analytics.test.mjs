import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('сводка сайта считает сессии, источники и обращения без идентификации человека', () => {
  const { buildClinicSiteAnalyticsSummary } = require('../apps/owner-gateway/dist/clinic-site-analytics.js');
  const now = new Date('2026-08-27T12:00:00.000Z');
  const event = (sessionId, eventName, minutes, extra = {}) => ({
    sessionId,
    eventName,
    section: null,
    target: null,
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    deviceType: 'desktop',
    createdAt: new Date(now.getTime() - minutes * 60_000),
    ...extra,
  });

  const summary = buildClinicSiteAnalyticsSummary({
    days: 30,
    now,
    events: [
      event('session-direct-1', 'page_view', 30),
      event('session-direct-1', 'section_view', 29, { section: 'home' }),
      event('session-direct-1', 'section_view', 28, { section: 'services' }),
      event('session-direct-1', 'phone_click', 27, { section: 'services' }),
      event('session-yandex-2', 'page_view', 20, { utmSource: 'yandex', utmMedium: 'cpc', utmCampaign: 'clinic' }),
      event('session-yandex-2', 'chat_open', 19, { section: 'contacts' }),
      event('session-yandex-2', 'chat_handoff_sent', 18, { section: 'contacts' }),
    ],
  });

  assert.equal(summary.totals.sessions, 2);
  assert.equal(summary.totals.engagedSessions, 2);
  assert.equal(summary.totals.contactSessions, 2);
  assert.equal(summary.totals.inquirySessions, 1);
  assert.equal(summary.totals.contactRate, 100);
  assert.deepEqual(summary.actions.phone_click, { count: 1, sessions: 1 });
  assert.equal(summary.sources.find((source) => source.label === 'yandex / cpc · clinic')?.sessions, 1);
  assert.equal(summary.recentSessions[0].visitor.startsWith('Посетитель '), true);
  assert.equal('sessionId' in summary.recentSessions[0], false);
});

test('контракт аналитики не сохраняет IP и поля формы', async () => {
  const [dto, service, schema, migration, controller, dashboard] = await Promise.all([
    readFile(new URL('../apps/owner-gateway/src/dto/create-public-clinic-analytics-event.dto.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/owner-gateway/src/public-clinic.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/owner-gateway/prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../apps/owner-gateway/prisma/migrations/20260827000100_public_clinic_analytics/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../apps/owner-gateway/src/public-clinic.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/api/src/modules/dashboard/dashboard.controller.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(dto, /PUBLIC_CLINIC_ANALYTICS_EVENTS/);
  assert.match(dto, /chat_handoff_sent/);
  assert.doesNotMatch(dto, /^\s*(contactName|phone|animalNickname|message)[?!]?:/im);
  assert.doesNotMatch(service.match(/createAnalyticsEvent[\s\S]*?\n  }/)?.[0] ?? '', /contactName|phone|animalNickname|message/i);
  assert.match(schema, /model PublicClinicAnalyticsEvent/);
  assert.doesNotMatch(schema.match(/model PublicClinicAnalyticsEvent[\s\S]*?\n}/)?.[0] ?? '', /ipAddress|userAgent/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
  assert.match(controller, /@Post\('analytics\/events'\)/);
  assert.match(dashboard, /@Get\('site-analytics'\)/);
});
