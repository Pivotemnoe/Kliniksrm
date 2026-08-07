import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('миграция контроля просроченных приёмов только добавляет журнал событий', async () => {
  const [schema, migration] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260807000300_visit_overdue_alerts/migration.sql'),
  ]);

  assert.match(schema, /model VisitOverdueAlert/);
  assert.match(schema, /visitId\s+String\s+@unique/);
  assert.match(schema, /thresholdMinutes\s+Int\s+@default\(60\)/);
  assert.match(migration, /CREATE TABLE "VisitOverdueAlert"/);
  assert.match(migration, /CREATE UNIQUE INDEX "VisitOverdueAlert_visitId_key"/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+[^\s]+\s+SET)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Owner|Animal|Visit|Bill|Product|StockBatch)"/);
});

test('отчёты и аудит содержат отдельные ежедневные счётчики', async () => {
  const [reportService, reportTypes, reportPage, reportExport, auditService, auditPage] = await Promise.all([
    read('apps/api/src/modules/reports/reports.service.ts'),
    read('apps/web/src/features/reports/types.ts'),
    read('apps/web/src/features/reports/ReportsPage.tsx'),
    read('apps/web/src/features/reports/reportExport.ts'),
    read('apps/api/src/modules/audit/audit.service.ts'),
    read('apps/web/src/features/audit/AuditLogsPage.tsx'),
  ]);

  for (const source of [reportService, reportTypes, reportPage, reportExport]) {
    assert.match(source, /overdueVisits/);
    assert.match(source, /overdueNotifications/);
    assert.match(source, /completedVisits/);
  }
  assert.match(auditService, /notificationsIssued/);
  assert.match(auditService, /visitOverdueAlert/);
  assert.match(auditPage, /Ежедневный контроль завершения приёмов/);
  assert.match(auditPage, /visit\.overdue_alert/);
});

test('дата просрочки и дата фактической выдачи уведомления считаются отдельно', async () => {
  const { AuditService } = require('../apps/api/dist/modules/audit/audit.service.js');
  const prisma = {
    visit: {
      findMany: async () => [{ id: 'completed-1', completedAt: new Date('2026-08-07T09:00:00.000Z') }],
    },
    visitOverdueAlert: {
      findMany: async ({ where }) => where.overdueAt
        ? [{ id: 'overdue-1', visitId: 'visit-1', overdueAt: new Date('2026-08-07T08:00:00.000Z') }]
        : [
            { id: 'notification-1', visitId: 'visit-1', createdAt: new Date('2026-08-07T08:01:00.000Z') },
            { id: 'notification-2', visitId: 'visit-old', createdAt: new Date('2026-08-07T08:02:00.000Z') },
          ],
    },
  };

  const control = await new AuditService(prisma).getVisitControl({ from: '2026-08-07', to: '2026-08-07' });

  assert.deepEqual(control.totals, {
    completedVisits: 1,
    overdueVisits: 1,
    notificationsIssued: 2,
  });
  assert.equal(control.daily[0].completedVisits, 1);
  assert.equal(control.daily[0].overdueVisits, 1);
  assert.equal(control.daily[0].notificationsIssued, 2);
});
