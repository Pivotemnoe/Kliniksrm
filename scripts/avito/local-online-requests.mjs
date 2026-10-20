import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { OnlineRequestsController } = require('../../apps/api/dist/modules/online-requests/online-requests.controller.js');
const { OnlineRequestsService } = require('../../apps/api/dist/modules/online-requests/online-requests.service.js');
const { OnlineRequestAttentionService } = require('../../apps/api/dist/modules/online-requests/online-request-attention.service.js');
const { ClinicConversationSyncService } = require('../../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js');
const { OwnerGatewayBookingSyncService } = require('../../apps/api/dist/modules/online-requests/owner-gateway-booking-sync.service.js');
const blocked = () => { throw Error('В локальной проверке доступны очередь заявок и взятие в работу. Запись и внешняя синхронизация отключены.'); };
export function localOnlineRequests(prisma, audit) {
  const conversations = { jobs: async () => [], syncNow: blocked, enqueue: blocked, retry: blocked };
  return { controller: OnlineRequestsController, providers: [
    { provide: OnlineRequestsService, useValue: new OnlineRequestsService(prisma, audit, {}, {}, conversations) },
    { provide: OnlineRequestAttentionService, useValue: new OnlineRequestAttentionService(prisma) },
    { provide: ClinicConversationSyncService, useValue: conversations },
    { provide: OwnerGatewayBookingSyncService, useValue: { syncNow: blocked } },
  ] };
}
export function localRequestRouteAllowed(method, path) {
  if (!path.startsWith('/api/v1/online-requests')) return false;
  const suffix = path.slice('/api/v1/online-requests'.length);
  return method === 'GET' && /^(?:|\/attention|\/[A-Za-z0-9_-]+(?:\/conversation-jobs)?)$/.test(suffix)
    || method === 'POST' && /^\/[A-Za-z0-9_-]+\/(?:claim|release|snooze|takeover)$/.test(suffix);
}
