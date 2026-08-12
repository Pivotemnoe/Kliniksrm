import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('рабочие списки подгружаются вниз порциями без стрелочной пагинации', async () => {
  const [infiniteTable, stockService, ...pages] = await Promise.all([
    read('apps/web/src/shared/ui/InfiniteTable.tsx'),
    read('apps/api/src/modules/stock/stock.service.ts'),
    ...[
      'owners/OwnersPage.tsx',
      'animals/AnimalsPage.tsx',
      'visits/VisitsPage.tsx',
      'appointments/AppointmentsPage.tsx',
      'queue/QueuePage.tsx',
      'billing/BillsPage.tsx',
      'stock/StockPage.tsx',
      'hospital/HospitalPage.tsx',
      'laboratory/LaboratoryPage.tsx',
      'tasks/TasksPage.tsx',
      'sales/SalesPage.tsx',
      'onlineRequests/OnlineRequestsPage.tsx',
      'notifications/MessagesPage.tsx',
    ].map((file) => read(`apps/web/src/features/${file}`)),
  ]);

  assert.match(infiniteTable, /DEFAULT_INFINITE_PAGE_SIZE = 50/);
  assert.match(infiniteTable, /useInfiniteQuery/);
  assert.match(infiniteTable, /IntersectionObserver/);
  assert.match(infiniteTable, /rootMargin: '700px 0px'/);
  assert.match(infiniteTable, /pagination=\{false\}/);
  assert.match(infiniteTable, /TableWithTopScrollbar/);
  assert.match(infiniteTable, /className="table-top-scroll"/);
  assert.match(infiniteTable, /tableScroll\.scrollLeft = topScroll\.scrollLeft/);
  assert.match(infiniteTable, /topScroll\.scrollLeft = tableScroll\.scrollLeft/);
  for (const page of pages) {
    assert.match(page, /useInfiniteListQuery/);
    assert.match(page, /InfiniteTable/);
  }

  const featureFiles = await listFiles(path.join(root, 'apps/web/src/features'));
  const sources = await Promise.all(featureFiles.filter((file) => file.endsWith('.tsx')).map((file) => readFile(file, 'utf8')));
  assert.equal(sources.some((source) => /pagination=\{\{/.test(source)), false);

  assert.match(stockService, /const sortBy = query\.sortBy \?\? 'title'/);
  assert.match(stockService, /service\.findMany\(\{[\s\S]*orderBy: \{ title: 'asc' \}/);
});

test('таблица услуг ограничивает широкие колонки и не прячет цены за длинным названием', async () => {
  const stockPage = await read('apps/web/src/features/stock/StockPage.tsx');
  assert.match(stockPage, /title: 'Название'[\s\S]*?width: 360[\s\S]*?ellipsis: true/);
  assert.match(stockPage, /title: 'Цена'[\s\S]*?width: 190/);
  assert.match(stockPage, /title: 'Тип цены'[\s\S]*?width: 150/);
  assert.match(stockPage, /fixed: 'right'/);
  assert.match(stockPage, /StockTable query=\{servicesQuery\} columns=\{columns\} scrollX=\{1150\}/);
});

test('завершение приёма атомарно ставит обновление личного кабинета в долговечную очередь', async () => {
  const [syncService, visitsService, notificationsModule, visitsModule, schema] = await Promise.all([
    read('apps/api/src/modules/notifications/owner-gateway-snapshot-sync.service.ts'),
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/api/src/modules/notifications/notifications.module.ts'),
    read('apps/api/src/modules/visits/visits.module.ts'),
    read('prisma/schema.prisma'),
  ]);

  assert.match(schema, /model BackgroundJob \{/);
  assert.match(syncService, /client\.backgroundJob\.create/);
  assert.match(syncService, /status: JobStatus\.PENDING/);
  assert.match(syncService, /MAX_ATTEMPTS = 96/);
  assert.match(syncService, /recoverStuckJobs/);
  assert.match(syncService, /enqueueActivePortalRefreshes/);
  assert.match(syncService, /ClientPortalStatus\.INVITED, ClientPortalStatus\.ENABLED/);
  assert.match(syncService, /visitId: null/);
  assert.match(syncService, /actorId: null/);
  assert.match(syncService, /ownerGatewayClient\.syncSnapshot/);
  assert.match(syncService, /catch \(error\)[\s\S]*scheduleRetry/);
  assert.match(syncService, /private async scheduleRetry/);
  assert.match(syncService, /client_portal\.snapshot_sync_automatic/);
  assert.match(visitsService, /this\.prisma\.\$transaction\(async \(tx\) => \{[\s\S]*ownerGatewaySnapshotSyncService\.enqueue\([\s\S]*, tx\)/);
  assert.match(visitsService, /VisitStatus\.COMPLETED \|\| status === VisitStatus\.CANCELLED/);
  assert.match(notificationsModule, /exports: \[OwnerGatewayClient, OwnerGatewaySnapshotSyncService\]/);
  assert.match(visitsModule, /NotificationsModule/);
});

test('кабинет владельца получает диагнозы и манипуляции и обновляется после исправления завершённого приёма', async () => {
  const [clientPortalService, visitsService, publicPortal, localPortal, portalTypes] = await Promise.all([
    read('apps/api/src/modules/client-portal/client-portal.service.ts'),
    read('apps/api/src/modules/visits/visits.service.ts'),
    read('apps/owner-gateway/public/app.js'),
    read('apps/web/src/features/clientPortal/ClientPortalPage.tsx'),
    read('apps/web/src/features/clientPortal/types.ts'),
  ]);

  assert.match(clientPortalService, /exam: \{ select: \{ manipulations: true \} \}/);
  assert.match(clientPortalService, /diagnoses: \{ select: \{ id: true, title: true, status: true \} \}/);
  assert.match(publicPortal, /<strong>Манипуляции:<\/strong> \$\{escapeHtml\(item\.exam\?\.manipulations \|\| '—'\)\}/);
  assert.match(localPortal, /title: 'Манипуляции'[\s\S]*item\.exam\?\.manipulations \|\| '—'/);
  assert.match(portalTypes, /exam: \{ manipulations: string \| null \} \| null/);

  for (const mutation of ['upsertExam', 'upsertRecommendation', 'createDiagnosis', 'updateDiagnosis', 'deleteDiagnosis']) {
    const start = visitsService.indexOf(`async ${mutation}`);
    assert.notEqual(start, -1, `${mutation} должен существовать`);
    const next = visitsService.indexOf('\n  async ', start + 8);
    const source = visitsService.slice(start, next === -1 ? visitsService.length : next);
    assert.match(source, /syncCompletedVisitSnapshot\(visit, actor\.id\)/);
  }
  assert.match(visitsService, /private async syncCompletedVisitSnapshot/);
  assert.match(visitsService, /!isPortalSnapshotStatus\(visit\.status\)/);
  assert.match(visitsService, /visitStatus: visit\.status/);
  assert.match(visitsService, /ownerGatewaySnapshotSyncService\.enqueue/);
  assert.match(visitsService, /ownerGatewaySnapshotSyncService\.syncNow/);
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}
