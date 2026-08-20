import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('стационар ищет владельца во всём реестре и загружает его пациентов отдельно', async () => {
  const page = await read('apps/web/src/features/hospital/HospitalPage.tsx');

  assert.match(page, /listOwners\(\{ search: ownerSearch\.trim\(\) \|\| undefined, limit: 50/);
  assert.match(page, /listOwnerAnimals\(selectedOwnerId!\)/);
  assert.match(page, /filterOption=\{false\}/);
  assert.doesNotMatch(page, /listAnimals\(\{ limit: 100/);
});

test('послеоперационный приём поддержан базой, очередью, приёмом и импортом', async () => {
  const [schema, migration, visitTypes, visitForm, visitExam, queueForm, queueTypes, importer] = await Promise.all([
    read('prisma/schema.prisma'),
    read('prisma/migrations/20260820000400_visit_post_operation_type/migration.sql'),
    read('apps/web/src/features/visits/types.ts'),
    read('apps/web/src/features/visits/VisitFormDrawer.tsx'),
    read('apps/web/src/features/visits/VisitExamTab.tsx'),
    read('apps/web/src/features/queue/QueueFormDrawer.tsx'),
    read('apps/web/src/features/queue/types.ts'),
    read('apps/api/src/modules/imports/data-transfer.service.ts'),
  ]);

  assert.match(schema, /enum VisitType[\s\S]*POST_OPERATION/);
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'POST_OPERATION'/);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE/i);
  for (const source of [visitTypes, visitForm, visitExam, queueForm, queueTypes]) assert.match(source, /POST_OPERATION/);
  assert.match(visitTypes, /POST_OPERATION: 'Послеоперационный'/);
  assert.match(importer, /VisitType\.POST_OPERATION/);
});

test('изменения с другого компьютера обновляют активные данные без перезагрузки страницы', async () => {
  const [moduleSource, interceptor, hook, client, layout, queryClient, localNginx, gatewayNginx] = await Promise.all([
    read('apps/api/src/modules/live-updates/live-updates.module.ts'),
    read('apps/api/src/modules/live-updates/live-updates.interceptor.ts'),
    read('apps/web/src/layouts/useLiveUpdates.ts'),
    read('apps/web/src/api/client.ts'),
    read('apps/web/src/layouts/CrmLayout.tsx'),
    read('apps/web/src/app/queryClient.ts'),
    read('apps/web/nginx.conf'),
    read('deploy/staff-gateway/nginx-staff-https.conf.template'),
  ]);

  assert.match(moduleSource, /APP_INTERCEPTOR/);
  assert.match(interceptor, /x-temichevvet-client-id/);
  assert.match(hook, /new EventSource/);
  assert.match(hook, /invalidateQueries\(\{ refetchType: 'active' \}\)/);
  assert.match(client, /x-temichevvet-client-id/);
  assert.match(layout, /Обновить данные/);
  assert.match(queryClient, /refetchOnWindowFocus: 'always'/);
  for (const source of [localNginx, gatewayNginx]) {
    assert.match(source, /location = \/api\/v1\/live-updates/);
    assert.match(source, /proxy_buffering off/);
  }
});

test('лабораторный экран получает сводку одним запросом и не перерисовывает всю таблицу на каждый символ', async () => {
  const [controller, service, page, drawer, gatewayNginx] = await Promise.all([
    read('apps/api/src/modules/laboratory/laboratory.controller.ts'),
    read('apps/api/src/modules/laboratory/laboratory.service.ts'),
    read('apps/web/src/features/laboratory/LaboratoryPage.tsx'),
    read('apps/web/src/features/laboratory/LaboratoryResultsTableDrawer.tsx'),
    read('deploy/staff-gateway/nginx-staff-https.conf.template'),
  ]);

  assert.match(controller, /@Get\('summary'\)/);
  assert.match(service, /async getSummary\(\)/);
  assert.match(service, /\.\.\.dto\.items\.map/);
  assert.match(page, /queryFn: getLaboratorySummary/);
  assert.doesNotMatch(page, /summary', 'active'/);
  assert.match(drawer, /shouldCellUpdate/);
  assert.match(drawer, /useCallback/);
  assert.match(gatewayNginx, /proxy_cache temichevvet_assets/);
  assert.match(gatewayNginx, /gzip on/);
});
