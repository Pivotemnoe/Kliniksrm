import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('публичный кабинет хранит заявки отдельно и CRM забирает их исходящим запросом', async () => {
  const gatewaySchema = await read('apps/owner-gateway/prisma/schema.prisma');
  const gatewayController = await read('apps/owner-gateway/src/internal-sync.controller.ts');
  const syncService = await read('apps/api/src/modules/online-requests/owner-gateway-booking-sync.service.ts');
  const crmSchema = await read('prisma/schema.prisma');

  assert.match(gatewaySchema, /model PortalBookingRequest/);
  assert.match(gatewayController, /booking-requests\/pending/);
  assert.match(syncService, /pullPendingBookingRequests/);
  assert.match(syncService, /acknowledgeBookingRequest/);
  assert.match(crmSchema, /externalRequestId\s+String\?\s+@unique/);
});

test('онлайн-заявка не создаёт запись автоматически', async () => {
  const portalService = await read('apps/owner-gateway/src/portal.service.ts');
  const syncService = await read('apps/api/src/modules/online-requests/owner-gateway-booking-sync.service.ts');

  assert.match(portalService, /portalBookingRequest\.upsert/);
  assert.match(syncService, /onlineAppointmentRequest\.create/);
  assert.doesNotMatch(syncService, /createAppointment|appointment\.create/);
});

test('сотрудник видит действия заявки и может сразу ответить владельцу', async () => {
  const requestsPage = await read('apps/web/src/features/onlineRequests/OnlineRequestsPage.tsx');
  const messagesPage = await read('apps/web/src/features/notifications/MessagesPage.tsx');

  assert.match(requestsPage, />\s*Подтвердить\s*</);
  assert.match(requestsPage, /Редактировать/);
  assert.match(requestsPage, />\s*Ответить\s*</);
  assert.match(requestsPage, /Связаться/);
  assert.match(requestsPage, /acceptOnlineRequest/);
  assert.match(requestsPage, /compose: '1'/);
  assert.match(messagesPage, /searchParams\.get\('compose'\) !== '1'/);
  assert.match(messagesPage, /reset\(getNotificationDefaults\(initialValues\)\)/);
});

test('Telegram-рассылка требует предпросмотр и явное подтверждение', async () => {
  const controller = await read('apps/api/src/modules/notifications/notifications.controller.ts');
  const dto = await read('apps/api/src/modules/notifications/dto/create-telegram-broadcast.dto.ts');
  const page = await read('apps/web/src/features/notifications/MessagesPage.tsx');

  assert.match(controller, /broadcasts\/telegram\/preview/);
  assert.match(dto, /@IsIn\(\['ОТПРАВИТЬ'\]\)/);
  assert.match(page, /Проверить аудиторию/);
  assert.match(page, /Поставить рассылку в очередь/);
});

test('миграция штрих-кодов сохраняет исходные части и не удаляет товары', async () => {
  const migration = await read('prisma/migrations/20260730000100_owner_gateway_booking_and_barcode_normalization/migration.sql');
  const service = await read('apps/api/src/modules/stock/stock.service.ts');

  assert.match(migration, /INSERT INTO "ProductBarcode"/);
  assert.match(migration, /regexp_split_to_table/);
  assert.doesNotMatch(migration, /DELETE FROM "Product"|DROP TABLE "Product"|TRUNCATE/i);
  assert.match(service, /selectPrimaryNumericBarcode/);
  assert.match(service, /qualityPercent/);
});

test('контракт сайта не открывает клиническую CRM напрямую', async () => {
  const concept = await read('docs/product/COMMUNICATIONS_BOOKING_AND_SITE_INTEGRATION_RU.md');
  assert.match(concept, /только в публичный owner-gateway/);
  assert.match(concept, /не в API клинической CRM/);
  assert.match(concept, /ограничение частоты запросов/);
});
