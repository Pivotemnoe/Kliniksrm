// Real API, guards, portal and persistence. Only MAX delivery is intercepted.
import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const preserved = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, preserved, {
  NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', TEMICHEVVET_LICENSE_MODE: 'compatibility',
  DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_crm_preview',
  OWNER_GATEWAY_DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_portal_preview',
  OWNER_GATEWAY_URL: 'http://127.0.0.1:4243', OWNER_GATEWAY_PUBLIC_URL: 'http://127.0.0.1:4243',
  OWNER_GATEWAY_SYNC_SECRET: 'grooming-local-isolated-qa-secret-20261019',
  OWNER_GATEWAY_SESSION_COOKIE: 'grooming_preview_owner', SESSION_COOKIE_NAME: 'grooming_preview_staff', SESSION_COOKIE_SECURE: 'false',
  APP_URL: 'http://127.0.0.1:4241', GROOMING_CRM_SYNC_ENABLED: 'true', GROOMING_CLIENT_NOTIFICATIONS_ENABLED: 'true', GROOMING_QA_MODE: 'true',
  CLINIC_ASSISTANT_ENABLED: 'false', CLINIC_ASSISTANT_REMINDERS_ENABLED: 'false', CLINIC_SITE_CATALOG_SYNC_ENABLED: 'false',
  GROOMING_SITE_ORIGINS: 'http://127.0.0.1:4244', MAX_BOT_USERNAME: 'grooming-local-qa-bot', MAX_WEBHOOK_SECRET: 'grooming-local-qa-webhook-only',
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('External network is blocked in grooming preview');
  return originalFetch(input, options);
};
const require = createRequire(import.meta.url);
const { groomingFixture, qaPassword } = await import('./grooming-crm-fixture.mjs');
const manifestPath = resolve('outputs/grooming-crm-20261019/preview.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
if (previous && previous.mode !== 'QA_LOCAL_ONLY') throw new Error('Only the synthetic grooming preview can be resumed');
const f = previous ? null : await groomingFixture({ fixed: true, preview: true });
const { NestFactory } = require('@nestjs/core'), { ValidationPipe } = require('@nestjs/common');
const { GroomingStandaloneAppModule } = require('../../apps/api/dist/modules/grooming/grooming-standalone.module.js');
const { AppModule: GatewayAppModule } = require('../../apps/owner-gateway/dist/app.module.js');
const { GroomingModule } = require('../../apps/owner-gateway/dist/grooming/grooming.module.js');
const { MaxBotClient } = require('../../apps/owner-gateway/dist/max-bot.client.js');
const { apiBodyParsers, apiAbuseProtection } = require('../../apps/api/dist/common/abuse-protection.js');
const { gatewayAbuseProtection } = require('../../apps/owner-gateway/dist/abuse-protection.js');
const { setGatewaySecurityHeaders } = require('../../apps/owner-gateway/dist/security-headers.js');
const output = resolve('outputs/grooming-crm-20261019'); mkdirSync(output, { recursive: true });
const receipts = resolve(output, 'preview-max-receipts.jsonl');
const fake = async (userId, text, destination) => { const receipt = { messageId: 'qa-' + randomUUID(), userId, text, destination: destination || 'portal', at: new Date().toISOString() }; appendFileSync(receipts, JSON.stringify(receipt) + '\n'); return receipt; };
const gatewayApp = await NestFactory.create(GatewayAppModule, { bodyParser: false, logger: ['error', 'warn'] });
gatewayApp.use(gatewayAbuseProtection());
gatewayApp.use((_req, response, next) => { setGatewaySecurityHeaders(response); next(); });
gatewayApp.enableCors({ origin: ['http://127.0.0.1:4243', 'http://127.0.0.1:4244'], credentials: true });
gatewayApp.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
for (const transport of [gatewayApp.select(GatewayAppModule).get(MaxBotClient, { strict: true }), gatewayApp.select(GroomingModule).get(MaxBotClient, { strict: true })]) { transport.sendMessage = fake; transport.sendStaffMessage = (id, text) => fake(id, text, 'staff'); transport.sendPortalButton = id => fake(id, 'Тестовое приглашение', 'portal'); }
await gatewayApp.listen(4243, '127.0.0.1');
const api = await NestFactory.create(GroomingStandaloneAppModule, { bodyParser: false, logger: ['error', 'warn'] });
api.use(apiAbuseProtection()); api.use(apiBodyParsers('1mb')); api.setGlobalPrefix('api');
api.enableCors({ origin: 'http://127.0.0.1:4241', credentials: true });
api.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
await api.listen(4242, '127.0.0.1');
const { hashToken } = require('../../apps/owner-gateway/dist/security.js');
const token = randomUUID() + randomUUID();
const gatewayDb = gatewayApp.get(require('../../apps/owner-gateway/dist/prisma.service.js').PrismaService);
const ownerId = previous?.ownerId || f.owner.id;
await gatewayDb.ownerSnapshot.findUniqueOrThrow({ where: { ownerId } });
await gatewayDb.portalInvitation.create({ data: { ownerId, tokenHash: hashToken(token), channel: 'WEB', expiresAt: new Date(Date.now() + 86400000) } });
let manifest = previous;
if (!manifest) {
  const offer = (await f.service.options(f.owner.id, f.options)).offers[0];
  const booking = await f.service.book(f.owner.id, { clientKey: randomUUID(), offerToken: offer.offerToken, notes: 'Локальный пример: питомец боится фена. Все данные вымышленные.', looks: [], contactConsent: true, bookingConsent: true });
  manifest = { mode: 'QA_LOCAL_ONLY', staffUrl: `http://127.0.0.1:4241/grooming/calendar?date=${f.selectedDate}`, gatewayUrl: 'http://127.0.0.1:4243', ownerUrl: 'http://127.0.0.1:4243/portal/grooming', ownerId: f.owner.id, animalId: f.animal.id, serviceId: f.groomingService.id, specialistId: f.specialist.id, bookingId: booking.id, selectedDate: f.selectedDate, logins: { director: f.director.email, administrator: f.administrator.email, groomer: f.groomer.email, otherGroomer: f.otherGroomer.email }, password: qaPassword };
}
manifest.ownerActivationUrl = `http://127.0.0.1:4243/portal/activate?token=${token}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log('Grooming API http://127.0.0.1:4242; cabinet http://127.0.0.1:4243/portal/grooming; isolated databases; current MAX is fake');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await api.close(); await gatewayApp.close(); await f?.close(); process.exit(0); });
