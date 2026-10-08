import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { PrismaClient } from '@prisma/client';
import { ClinicChatService } from '../apps/owner-gateway/dist/clinic-chat.service.js';
import { ClinicAssistantOpenAiClient } from '../apps/owner-gateway/dist/clinic-assistant-openai.client.js';
import { ClinicAssistantRunnerService } from '../apps/owner-gateway/dist/clinic-assistant-runner.service.js';
import { ClinicConversationSyncService } from '../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js';
import { hashToken } from '../apps/owner-gateway/dist/security.js';
import { cases as allCases } from './assistant-qa-dialog-cases.mjs';
assert.equal(process.env.ASSISTANT_OPENAI_SYNTHETIC_QA, 'true');
assert.equal(process.env.CLINIC_ASSISTANT_OPENAI_BASE_URL, 'http://127.0.0.1:4313/v1');
Object.assign(process.env, { CLINIC_ASSISTANT_ENABLED: 'true', CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED: 'true',
  CLINIC_ASSISTANT_MODEL_DAILY_MICRO_USD: '1000000', CLINIC_ASSISTANT_MODEL_MONTHLY_MICRO_USD: '10000000',
  CLINIC_ASSISTANT_APPROVED_ADDRESS: 'Вымышленная клиника: Тестовая улица, 1.', CLINIC_ASSISTANT_APPROVED_HOURS: 'Вымышленная клиника работает с 09:00 до 18:00.', CLINIC_ASSISTANT_APPROVED_PHONE: '+79990000000' });
const gateway = new GatewayDb({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa' } } });
const db = new PrismaClient({ datasources: { db: { url: 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa' } } });
let rawIntent;
const chat = new ClinicChatService(gateway), model = new ClinicAssistantOpenAiClient();
const actualClassify = model.classify.bind(model); model.classify = async (...args) => { const result = await actualClassify(...args); rawIntent = result.result.intent; return result; };
const runner = new ClinicAssistantRunnerService(gateway, model), sync = new ClinicConversationSyncService(db);
const recheck = process.env.ASSISTANT_DIALOG_RECHECK === 'true';
const previous = recheck ? JSON.parse(await readFile(new URL('../outputs/assistant-20261008/openai-dialog-live-qa.json', import.meta.url), 'utf8')) : null;
const cases = recheck ? allCases.filter(c => previous.results.some(r => r.id === c.id && !r.pass)) : allCases;
assert.ok(cases.length > 0 && cases.length <= 50);
const owned = [], path = new URL(`../outputs/assistant-20261008/openai-dialog-${recheck ? 'recheck' : 'live-qa'}.json`, import.meta.url);
const report = { createdAt: new Date().toISOString(), syntheticOnly: true, conversations: cases.length, maximumCalls: cases.reduce((n, c) => n + c.turns.length, 0), maximumReservedMicroUsd: 0, results: [], pass: false };
let calls = 0;
try {
  assert.equal(await gateway.clinicAssistantRun.count({ where: { status: { in: ['PENDING','RUNNING'] } } }), 0, 'QA paid queue must be idle');
  // Before paid I/O reserve all possible synthetic histories conservatively.
  for (const c of cases) report.maximumReservedMicroUsd += model.prepare([{ role: 'assistant', text: 'Здравствуйте! Помогу оставить заявку на приём или передать вопрос администратору.' }, { role: 'user', text: c.turns.join(' ').repeat(2) }]).reservedMicroUsd * c.turns.length * 2;
  assert.ok(report.maximumReservedMicroUsd < 500000, 'Acceptance reserve must stay below half a dollar at configured rates');
  const owner = await db.owner.create({ data: { fullName: '50 диалогов — вымышленный владелец', phone: '+79990000000' } });
  await gateway.ownerSnapshot.create({ data: { ownerId: owner.id, displayName: owner.fullName, payload: {}, sourceVersion: 'synthetic-dialog-qa', sourceUpdatedAt: new Date() } });
  const portalToken = randomUUID(); await gateway.portalSession.create({ data: { ownerId: owner.id, tokenHash: hashToken(portalToken), expiresAt: new Date(Date.now() + 3600000) } });
  for (const c of cases) {
    const session = await chat.start(portalToken); owned.push(session.conversation.id);
    const item = { id: c.id, expectedIntent: c.intent, turns: [], pass: true };
    for (const text of c.turns) {
      const key = randomUUID(), started = Date.now();
      await chat.message(session.token, { clientKey: key, text });
      await runner.runOnce(); calls++;
      const run = await gateway.clinicAssistantRun.findFirstOrThrow({ where: { message: { conversationId: session.conversation.id, clientKey: key } } });
      const view = await chat.read(session.token), reply = view.messages.find(m => m.clientKey === `reply:${key}`);
      const human = ['HUMAN', 'CLINICAL', 'OTHER'].includes(c.intent);
      const pass = run.status === 'DONE' && run.intent === c.intent && view.mode === (human ? 'HUMAN' : 'ASSISTANT') && Boolean(reply)
        && (!human || view.needsAttention) && !/вы записаны|запись подтверждена|API.?ключ.*sk-/i.test(reply?.text || '');
      const paidBefore = await gateway.clinicAssistantRun.count({ where: { message: { conversationId: session.conversation.id } } });
      await chat.message(session.token, { clientKey: key, text }); await runner.runOnce();
      assert.equal(await gateway.clinicAssistantRun.count({ where: { message: { conversationId: session.conversation.id } } }), paidBefore);
      assert.equal((await chat.read(session.token)).messages.filter(m => m.clientKey === `reply:${key}`).length, 1);
      if (human) { const request = await sync.importConversation(view); assert.equal((await sync.importConversation(view)).id, request.id); await chat.acknowledge(view.id, view.sequence, request.id); }
      if (c.intent === 'BOOKING' && pass) { assert.ok(view.bookingDraft); if (view.bookingDraft.serviceQuery) assert.ok(view.messages.filter(m => m.author === 'OWNER').some(m => m.text.toLowerCase().includes(view.bookingDraft.serviceQuery.toLowerCase()))); }
      item.turns.push({ text, intent: run.intent, rawIntent, mode: view.mode, pass, reply: reply?.text || null, elapsedMs: Date.now() - started, inputTokens: run.inputTokens, outputTokens: run.outputTokens, usageMicroUsd: run.chargedMicroUsd, bookingDraft: view.bookingDraft });
      item.pass &&= pass;
      if (!pass && view.mode === 'HUMAN') break;
    }
    report.results.push(item);
    await writeFile(path, JSON.stringify({ ...report, completed: report.results.length, calls }, null, 2) + '\n');
  }
  report.pass = report.results.length === cases.length && report.results.every(c => c.pass);
  if (!report.pass) process.exitCode = 1;
} catch { report.error = 'Synthetic dialog acceptance could not complete; credentials and upstream errors omitted'; process.exitCode = 1; }
finally {
  if (owned.length) await gateway.clinicAssistantRun.updateMany({ where: { status: 'PENDING', message: { conversationId: { in: owned } } }, data: { status: 'SKIPPED', finishedAt: new Date() } });
  await gateway.$disconnect(); await db.$disconnect();
  const result = { ...report, completed: report.results.length, calls, finishedAt: new Date().toISOString() };
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ conversations: result.conversations, completed: result.completed, calls, passed: result.results.filter(c => c.pass).length, failed: result.results.filter(c => !c.pass).map(c => c.id), pass: result.pass, error: result.error || null }));
}
