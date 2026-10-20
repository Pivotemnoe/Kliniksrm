// Explicit physical-device acceptance only. No production database or webhook changes.
import 'reflect-metadata';
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID, X509Certificate } from 'node:crypto';
const require = createRequire(import.meta.url);
const directory = resolve('.artifacts/grooming-device-20261020');
const approvedCa = resolve('certs/russian_trusted_root_ca.pem');
if (new X509Certificate(readFileSync(approvedCa)).fingerprint256.replaceAll(':', '').toLowerCase() !== 'd26d2d0231b7c39f92cc738512ba54103519e4405d68b5bd703e9788ca8ecf31' || process.env.NODE_EXTRA_CA_CERTS !== approvedCa) throw Error('Start the device helper with the existing verified MAX CA bundle');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const configPath = resolve(directory, 'private-config.json'), manifestPath = resolve(directory, 'private-manifest.json');
const verified = JSON.parse(readFileSync('/Users/konstantin/.codex/worktrees/grooming-module/CRM/.artifacts/grooming-device-qa/private-config.json', 'utf8'));
if (!/^\d{1,24}$/.test(verified.maxVerifiedUserId || '')) throw Error('The previously verified user MAX account is required');
const configuration = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : { runId: randomUUID(), vapid: require('web-push').generateVAPIDKeys(), liveMaxArmed: true, maxVerifiedUserId: verified.maxVerifiedUserId, validUntil: new Date(Date.now() + 4 * 3600000).toISOString(), authorization: 'User authorized their verified MAX as test client and groomer, 20 October 2026' };
if (configuration.maxVerifiedUserId !== verified.maxVerifiedUserId) throw Error('Device recipient differs from verified account');

writeFileSync(configPath, JSON.stringify(configuration, null, 2), { mode: 0o600 });
const liveConfig = () => JSON.parse(readFileSync(configPath, 'utf8'));
const currentMax = {};
for (const line of readFileSync('/Users/konstantin/Documents/CRM/.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && ['MAX_BOT_TOKEN', 'MAX_API_BASE_URL'].includes(match[1])) currentMax[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2');
}
const maxBase = new URL(currentMax.MAX_API_BASE_URL || 'https://platform-api2.max.ru');
if (maxBase.protocol !== 'https:' || maxBase.hostname !== 'platform-api2.max.ru' || !currentMax.MAX_BOT_TOKEN) throw Error('Expected the configured current MAX bot');
const preserved = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'TZ', 'NODE_EXTRA_CA_CERTS'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, preserved, {
  NODE_ENV: 'test', CLINIC_RUNTIME_MODE: 'test', TEMICHEVVET_LICENSE_MODE: 'compatibility',
  DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_crm_device_20261020_qa',
  OWNER_GATEWAY_DATABASE_URL: 'postgresql://grooming_module_qa:synthetic-grooming-only@127.0.0.1:55440/grooming_portal_device_20261020_qa',
  OWNER_GATEWAY_URL: 'http://127.0.0.1:4263', OWNER_GATEWAY_PUBLIC_URL: 'http://127.0.0.1:4263', APP_URL: 'http://127.0.0.1:4261',
  OWNER_GATEWAY_SYNC_SECRET: `grooming-device-${configuration.runId}`, OWNER_GATEWAY_SESSION_COOKIE: 'grooming_20261020_owner', SESSION_COOKIE_NAME: 'grooming_20261020_staff', SESSION_COOKIE_SECURE: 'false',
  GROOMING_CRM_SYNC_ENABLED: 'true', GROOMING_CLIENT_NOTIFICATIONS_ENABLED: 'true', GROOMING_QA_MODE: 'true', GROOMING_QA_DELIVERY: 'device',
  GROOMING_SITE_ORIGINS: 'http://127.0.0.1:4264',
  GROOMING_STAFF_PUSH_ENABLED: 'true', GROOMING_STAFF_VAPID_SUBJECT: 'https://pet.temichevvet.ru', GROOMING_STAFF_VAPID_PUBLIC_KEY: configuration.vapid.publicKey, GROOMING_STAFF_VAPID_PRIVATE_KEY: configuration.vapid.privateKey,
  CLINIC_ASSISTANT_ENABLED: 'false', CLINIC_ASSISTANT_REMINDERS_ENABLED: 'false', CLINIC_SITE_CATALOG_SYNC_ENABLED: 'false',
  ...currentMax, MAX_WEBHOOK_SECRET: `device-webhook-${randomUUID()}`,
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return originalFetch(input, options);
  if (url.origin === maxBase.origin && url.pathname === '/me' && (!options?.method || options.method === 'GET')) return originalFetch(input, options);
  const live = liveConfig();
  if (url.origin === maxBase.origin && url.pathname === '/messages' && options?.method === 'POST' && live.liveMaxArmed === true && /^\d{1,24}$/.test(live.maxVerifiedUserId || '') && url.searchParams.get('user_id') === live.maxVerifiedUserId && Date.parse(live.validUntil) > Date.now()) return originalFetch(input, { ...options, redirect: 'manual' });
  throw Error('Device QA external request rejected');
};
const identityResponse = await fetch(new URL('/me', maxBase), { headers: { Authorization: process.env.MAX_BOT_TOKEN }, signal: AbortSignal.timeout(10000) });
if (!identityResponse.ok) throw Error('Current MAX bot identity is unavailable');
const identity = await identityResponse.json();
if (!identity.is_bot || identity.user_id !== 382809375) throw Error('Unexpected MAX bot');
process.env.MAX_BOT_USERNAME = identity.username;
const { groomingFixture, qaPassword } = await import('./grooming-crm-fixture.mjs');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const fixture = previous ? null : await groomingFixture({ fixed: true, device: true, deviceRun: '20261020' });
if (fixture) await prepareOwnerTest(fixture);
const { NestFactory } = require('@nestjs/core'), { ValidationPipe, ServiceUnavailableException } = require('@nestjs/common');
const { GroomingStandaloneAppModule } = require('../../apps/api/dist/modules/grooming/grooming-standalone.module.js');
const { AppModule: GatewayAppModule } = require('../../apps/owner-gateway/dist/app.module.js');
const { GroomingModule } = require('../../apps/owner-gateway/dist/grooming/grooming.module.js');
const { MaxBotClient } = require('../../apps/owner-gateway/dist/max-bot.client.js');
const { GroomingStaffNotificationsService } = require('../../apps/api/dist/modules/grooming/grooming-staff-notifications.service.js');
const { apiBodyParsers, apiAbuseProtection } = require('../../apps/api/dist/common/abuse-protection.js');
const { gatewayAbuseProtection } = require('../../apps/owner-gateway/dist/abuse-protection.js');
const { setGatewaySecurityHeaders } = require('../../apps/owner-gateway/dist/security-headers.js');
const receipt = item => appendFileSync(resolve(directory, 'private-receipts.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...item }) + '\n', { mode: 0o600 });
let maxSends = 0;
const gateway = await NestFactory.create(GatewayAppModule, { bodyParser: false, logger: ['error', 'warn'] });
gateway.use(gatewayAbuseProtection()); gateway.use((_req, response, next) => { setGatewaySecurityHeaders(response); next(); });
gateway.enableCors({ origin: ['http://127.0.0.1:4263', 'http://127.0.0.1:4264'], credentials: true });
gateway.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
for (const transport of [gateway.select(GatewayAppModule).get(MaxBotClient, { strict: true }), gateway.select(GroomingModule).get(MaxBotClient, { strict: true })]) {
  for (const method of ['sendMessage', 'sendStaffMessage']) {
    const actual = transport[method].bind(transport);
    transport[method] = async (userId, text, destination) => {
      const live = liveConfig();
      if (live.liveMaxArmed !== true || userId !== live.maxVerifiedUserId || Date.parse(live.validUntil) <= Date.now() || maxSends >= 16) throw new ServiceUnavailableException('Device QA recipient is not armed');
      maxSends += 1;
      const result = await actual(userId, `ПРОВЕРКА ГРУМИНГА · тестовые данные\n${text}`, destination);
      receipt({ channel: 'MAX', role: method === 'sendStaffMessage' ? 'GROOMER' : 'CLIENT', providerAccepted: true, messageId: result.messageId, text });
      return result;
    };
  }
  transport.sendPortalButton = async () => { throw new ServiceUnavailableException('Production MAX login routing is not changed in device QA'); };
}
await gateway.listen(4263, '127.0.0.1');
const api = await NestFactory.create(GroomingStandaloneAppModule, { bodyParser: false, logger: ['error', 'warn'] });
api.use(apiAbuseProtection()); api.use(apiBodyParsers('1mb')); api.setGlobalPrefix('api');
api.enableCors({ origin: 'http://127.0.0.1:4261', credentials: true });
api.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
const push = api.get(GroomingStaffNotificationsService), actualPush = push.send.bind(push);
push.send = async (...args) => { const result = await actualPush(...args); receipt({ channel: 'WEB_PUSH', providerAccepted: true, tag: JSON.parse(args[1]).tag, statusCode: result.statusCode }); return result; };
await api.listen(4262, '127.0.0.1');
await api.get(require('../../apps/api/dist/modules/grooming/grooming-sync.service.js').GroomingSyncService).syncNow();
const { PrismaService: ApiPrisma } = require('../../apps/api/dist/prisma/prisma.service.js'), { PrismaService: PortalPrisma } = require('../../apps/owner-gateway/dist/prisma.service.js');
const db = api.get(ApiPrisma), portalDb = gateway.get(PortalPrisma);
let manifest = previous;
if (!manifest) {
  manifest = { mode: 'PHYSICAL_DEVICE_QA', runId: configuration.runId, bot: { id: identity.user_id, username: identity.username, name: identity.first_name }, staffUrl: 'http://127.0.0.1:4261/grooming/notifications', siteUrl: 'http://127.0.0.1:4264/', ownerUrl: 'http://127.0.0.1:4263/portal/grooming', ownerId: fixture.owner.id, animalId: fixture.animal.id, catId: fixture.cat.id, groomerId: fixture.groomer.id, otherGroomerId: fixture.otherGroomer.id, specialistId: fixture.specialist.id, installationId: fixture.installation.id, serviceId: fixture.groomingService.id, selectedDate: fixture.selectedDate, largeAnimalId: fixture.largeAnimal.id, largeServiceId: fixture.largeService.id, priceServiceIds: fixture.priceServiceIds, fullMaxLoginVerified: false, activationMode: 'Local synthetic owner linked to the previously verified MAX; production webhook untouched', logins: { director: fixture.director.email, administrator: fixture.administrator.email, groomer: fixture.groomer.email, otherGroomer: fixture.otherGroomer.email }, password: qaPassword };
}
const token = randomUUID() + randomUUID(), { hashToken } = require('../../apps/owner-gateway/dist/security.js');
await portalDb.portalInvitation.create({ data: { ownerId: manifest.ownerId, tokenHash: hashToken(token), channel: 'WEB', expiresAt: new Date(Date.now() + 86400000) } });
manifest.ownerActivationUrl = `http://127.0.0.1:4263/portal/activate?token=${token}`;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
console.log('Physical device QA ready: staff 4261, API 4262, portal 4263, site 4264; separate synthetic databases; MAX requires the verified selected recipient');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await api.close(); await gateway.close(); await fixture?.close(); process.exit(0); });

async function prepareOwnerTest(f) {
  const maxId = configuration.maxVerifiedUserId;
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  await f.prisma.groomingServiceRule.updateMany({where:{installationId:f.installation.id},data:{isActive:false}});
  await f.prisma.groomingWorkPeriod.updateMany({where:{specialist:{installationId:f.installation.id}},data:{isActive:false}});
  await f.prisma.groomingService.update({where:{id:f.groomingService.id},data:{isActive:false}});
  await f.prisma.groomingSpecialist.update({where:{id:f.secondSpecialist.id},data:{isActive:false,maxUserId:null}});
  await f.prisma.employee.update({where:{id:f.groomer.id},data:{fullName:'Темичев Константин'}});
  f.specialist = await f.prisma.groomingSpecialist.update({where:{id:f.specialist.id},data:{displayName:'Темичев Константин',maxUserId:maxId,species:['DOG','CAT']}});
  f.location = await f.prisma.groomingLocation.update({where:{id:f.location.id},data:{name:'Тестовый приём · груминг',address:'Локальная проверка — реальные приёмы не проводятся'}});
  await f.prisma.groomingWorkplace.update({where:{id:f.workplace.id},data:{name:'Тестовый стол'}});
  f.owner = await f.prisma.owner.update({where:{id:f.owner.id},data:{fullName:'Темичев Константин',maxUserId:maxId,allowMax:true}});
  f.animal = await f.prisma.animal.update({where:{id:f.animal.id},data:{nickname:'Бишон · тест',breed:'Бишон фризе'}});
  f.largeAnimal = await f.prisma.animal.create({data:{ownerId:f.owner.id,nickname:'Хаски · тест',species:'Собака',breed:'Сибирский хаски'}});
  await f.gateway.messengerBinding.deleteMany({});
  await f.gateway.messengerBinding.create({data:{ownerId:f.owner.id,channel:'MAX',externalUserId:maxId}});
  const animals = await f.prisma.animal.findMany({where:{ownerId:f.owner.id},select:{id:true,nickname:true,species:true,breed:true}});
  await f.gateway.ownerSnapshot.update({where:{ownerId:f.owner.id},data:{displayName:f.owner.fullName,payload:{owner:{id:f.owner.id,fullName:f.owner.fullName,phone:f.owner.phone},animals}}});
  await f.prisma.groomingSettings.update({where:{installationId:f.installation.id},data:{selfBookingEnabled:true,testClientMaxId:maxId,administratorMaxIds:[],reminderHours:[24,2]}});
  await f.service.importPrices({clientKey:randomUUID()},f.director);
  const services = await f.prisma.groomingService.findMany({where:{installationId:f.installation.id,catalogKey:{in:['dog:bichon:dry','dog:bichon:hygiene','dog:bichon:full','dog:husky:dry','dog:husky:full']}}});
  f.priceServiceIds = {};
  for(const service of services) {
    const small = service.catalogKey.startsWith('dog:bichon:');
    await f.service.saveRule({specialistId:f.specialist.id,serviceId:service.id,locationId:f.location.id,workplaceId:f.workplace.id,species:'DOG',size:small?'SMALL':'LARGE',coat:'ANY',durationMinutes:small?90:180,bufferMinutes:0,stepMinutes:15,minimumLeadMinutes:0,maximumDaysAhead:1,isActive:true},f.director);
    f.priceServiceIds[service.catalogKey] = service.id;
    if(service.catalogKey==='dog:bichon:full')f.groomingService=service;
    if(service.catalogKey==='dog:husky:full')f.largeService=service;
  }
  await f.service.batchShifts({clientKey:randomUUID(),employeeIds:[f.groomer.id],locationId:f.location.id,from:today,to:today,weekdays:[0,1,2,3,4,5,6],startsTime:'10:00',endsTime:'17:00',comment:'Тестовая смена по указанию пользователя 20.10.2026'},f.director);
  f.selectedDate=today;
}
