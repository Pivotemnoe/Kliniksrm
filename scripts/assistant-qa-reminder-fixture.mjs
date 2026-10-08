// Only creates fictional owner/session records in fixed, isolated QA databases.
import { PrismaClient } from '@prisma/client';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
import { writeFile } from 'node:fs/promises';
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa' } } });
const gateway = new GatewayDb({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa' } } });
try {
  const owner = await db.owner.create({ data: { fullName: 'Браузер QA — напоминания', phone: '+79990000008' } });
  await db.clientPortalAccess.create({ data: { ownerId: owner.id, status: 'ENABLED' } });
  await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: owner.fullName, payload: {}, sourceVersion: 'synthetic-reminder-browser', sourceUpdatedAt: new Date() } });
  const token = 'synthetic-portal-reminders-qa-only-20261008';
  await gateway.portalSession.upsert({ where: { tokenHash: hashToken(token) }, create: { ownerId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 6 * 3600000) }, update: { ownerId: owner.id, revokedAt: null, expiresAt: new Date(Date.now() + 6 * 3600000) } });
  const result = { ownerId: owner.id, synthetic: true, messengerLinked: false };
  await writeFile('outputs/assistant-20261008/reminders-browser-fixture.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { await db.$disconnect(); await gateway.$disconnect(); }
