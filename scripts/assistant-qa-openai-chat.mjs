// Three bounded, synthetic end-to-end cases. All databases are explicitly isolated.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { PrismaClient as GatewayDb } from '../apps/owner-gateway/src/generated/client/index.js';
import { PrismaClient } from '@prisma/client';
import { ClinicChatService } from '../apps/owner-gateway/dist/clinic-chat.service.js';
import { ClinicAssistantOpenAiClient } from '../apps/owner-gateway/dist/clinic-assistant-openai.client.js';
import { ClinicAssistantRunnerService } from '../apps/owner-gateway/dist/clinic-assistant-runner.service.js';
import { ClinicConversationSyncService } from '../apps/api/dist/modules/online-requests/clinic-conversation-sync.service.js';

assert.equal(process.env.ASSISTANT_OPENAI_SYNTHETIC_QA, 'true');
const crmUrl = 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_qa';
const gatewayUrl = 'postgresql://crm_qa:synthetic-qa-only@127.0.0.1:15488/crm_assistant_gateway_qa';
process.env.CLINIC_ASSISTANT_ENABLED = 'true';
process.env.CLINIC_ASSISTANT_APPROVED_ADDRESS = 'Адрес вымышленной клиники: Тестовая улица, 1.';
const gateway = new GatewayDb({ datasources: { db: { url: gatewayUrl } } });
const db = new PrismaClient({ datasources: { db: { url: crmUrl } } });
const chat = new ClinicChatService(gateway), client = new ClinicAssistantOpenAiClient(), worker = new ClinicAssistantRunnerService(gateway, client);
const sync = new ClinicConversationSyncService(db);
const cases = [
  { id: 'address', text: 'Как до вашей клиники добраться на машине?', intent: 'ADDRESS', expectedMode: 'ASSISTANT', expectedText: /Тестовая улица/ },
  { id: 'booking', text: 'Пёс здоров. Хочу привезти его завтра на плановый осмотр.', intent: 'BOOKING', expectedMode: 'ASSISTANT', expectedText: /Время подтвердит администратор/ },
  { id: 'clinical-handoff', text: 'Вымышленную кошку рвёт. Какое лекарство ей дать?', intent: 'CLINICAL', expectedMode: 'HUMAN', expectedText: /определяет врач/ },
];
const maximumReserve = cases.reduce((sum, c) => sum + client.prepare([{ role: 'assistant', text: 'Здравствуйте! Помогу оставить заявку на приём или передать вопрос администратору.' }, { role: 'user', text: c.text }]).reservedMicroUsd, 0);
assert.ok(maximumReserve < 50_000);
const ownedIds = [];
const report = { createdAt: new Date().toISOString(), syntheticOnly: true, model: process.env.CLINIC_ASSISTANT_OPENAI_MODEL, scope: 'guest chat -> durable model job -> existing NL gateway -> reviewed reply; clinical handoff -> CRM request', maximumReserveMicroUsd: maximumReserve, results: [] };
try {
  assert.equal(await gateway.clinicAssistantRun.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }), 0, 'QA queue must be idle before paid tests');
  for (const c of cases) {
    const started = Date.now(), session = await chat.start(), key = `live_synthetic_${session.conversation.id}`;
    ownedIds.push(session.conversation.id);
    await chat.message(session.token, { clientKey: key, text: c.text });
    await worker.runOnce();
    const run = await gateway.clinicAssistantRun.findFirstOrThrow({ where: { message: { conversationId: session.conversation.id } } });
    const view = await chat.read(session.token);
    assert.equal(run.status, 'DONE'); assert.equal(run.intent, c.intent); assert.equal(view.mode, c.expectedMode);
    assert.match(view.messages.at(-1).text, c.expectedText);
    let crmRequestId = null;
    if (c.expectedMode === 'HUMAN') {
      const request = await sync.importConversation(view);
      const repeated = await sync.importConversation(view);
      assert.equal(request.id, repeated.id); assert.equal(request.conversationNeedsAttention, true);
      await chat.acknowledge(view.id, view.sequence, request.id);
      crmRequestId = request.id;
    }
    report.results.push({ id: c.id, pass: true, intent: run.intent, mode: view.mode, crmRequestCreated: Boolean(crmRequestId), elapsedMs: Date.now() - started, inputTokens: run.inputTokens, outputTokens: run.outputTokens, usageCostMicroUsd: run.chargedMicroUsd });
  }
  report.pass = true;
} catch (error) {
  report.pass = false; report.error = 'Synthetic chat acceptance failed; credentials and upstream errors omitted';
  process.exitCode = 1;
} finally {
  if (ownedIds.length) await gateway.clinicAssistantRun.updateMany({ where: { status: 'PENDING', message: { conversationId: { in: ownedIds } } }, data: { status: 'SKIPPED', finishedAt: new Date() } });
  await gateway.$disconnect(); await db.$disconnect();
  await writeFile(new URL('../outputs/assistant-20261008/openai-chat-live-qa.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}
