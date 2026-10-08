import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '../apps/owner-gateway/src/generated/client/index.js';
import { ClinicChatService } from '../apps/owner-gateway/dist/clinic-chat.service.js';
import { ClinicAssistantRunnerService } from '../apps/owner-gateway/dist/clinic-assistant-runner.service.js';

const url = process.env.ASSISTANT_TEST_GATEWAY_DATABASE_URL;
test('isolated PostgreSQL: model queue preserves handoff, cost limits and paid-request idempotency', { skip: !url }, async t => {
  const parsed = new URL(url); assert.ok(parsed.hostname === '127.0.0.1' && parsed.port === '15488' && parsed.pathname === '/crm_assistant_gateway_qa');
  const db = new PrismaClient({ datasources: { db: { url } } });
  process.env.CLINIC_ASSISTANT_ENABLED = 'true'; process.env.CLINIC_ASSISTANT_MODEL_ENABLED = 'true';
  process.env.CLINIC_ASSISTANT_MODEL_DAILY_MICRO_USD = '100000000'; process.env.CLINIC_ASSISTANT_MODEL_MONTHLY_MICRO_USD = '100000000';
  process.env.CLINIC_ASSISTANT_APPROVED_ADDRESS = 'Synthetic QA address only';
  const chat = new ClinicChatService(db);
  const prepare = () => ({ reservedMicroUsd: 1000, model: 'synthetic-model', rates: { input: .15, output: .6 } });
  const response = intent => ({ result: { intent, serviceQuery: null, preferredTimeText: null }, model: 'synthetic-model', actualMicroUsd: 500, tokens: { input: 100, output: 10 } });
  t.after(async () => { process.env.CLINIC_ASSISTANT_MODEL_ENABLED = 'false'; await db.$disconnect(); });
  async function message(text = 'Где к вам подъехать?') {
    const session = await chat.start();
    const key = `synthetic_model_${session.conversation.id}`;
    await chat.message(session.token, { clientKey: key, text });
    const row = await db.clinicAssistantRun.findFirstOrThrow({ where: { message: { conversationId: session.conversation.id } } });
    return { ...session, key, run: row };
  }
  await t.test('restart-safe pending message and replay produce one paid request and one reviewed answer', async () => {
    const session = await message();
    await chat.message(session.token, { clientKey: session.key, text: 'Где к вам подъехать?' });
    assert.equal(await db.clinicAssistantRun.count({ where: { message: { conversationId: session.conversation.id } } }), 1);
    let calls = 0;
    const model = { prepare, classify: async () => { calls++; return response('ADDRESS'); } };
    await new ClinicAssistantRunnerService(db, model).runOnce();
    await new ClinicAssistantRunnerService(db, model).runOnce();
    assert.equal(calls, 1);
    const view = await chat.read(session.token);
    assert.equal(view.messages.filter(x => x.clientKey === `reply:${session.key}`).length, 1);
    assert.equal(view.messages.at(-1).text, 'Synthetic QA address only');
    const run = await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } });
    assert.equal(run.status, 'DONE'); assert.equal(run.chargedMicroUsd, 500);
  });
  await t.test('two workers cannot pay for the same message', async () => {
    const session = await message(); let calls = 0;
    const model = { prepare, classify: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return response('ADDRESS'); } };
    await Promise.all([new ClinicAssistantRunnerService(db, model).runOnce(), new ClinicAssistantRunnerService(db, model).runOnce()]);
    assert.equal(calls, 1);
    assert.equal((await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } })).status, 'DONE');
  });
  await t.test('administrator takeover during a slow model call remains responsive and suppresses the late answer', async () => {
    const session = await message();
    let release, entered;
    const barrier = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const model = { prepare, classify: async () => { entered(); await barrier; return response('ADDRESS'); } };
    const work = new ClinicAssistantRunnerService(db, model).runOnce();
    await started;
    await chat.command(session.conversation.id, { clientKey: `takeover_${session.conversation.id}`, action: 'REPLY', text: 'Администратор уже отвечает (QA)' });
    // The paid call does not hold a DB transaction or the conversation lock.
    assert.equal((await chat.read(session.token)).mode, 'HUMAN');
    release(); await work;
    const view = await chat.read(session.token);
    assert.equal(view.messages.filter(x => x.clientKey === `reply:${session.key}`).length, 0);
    const run = await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } });
    assert.equal(run.status, 'SKIPPED'); assert.equal(run.chargedMicroUsd, 500);
  });
  await t.test('uncertain result after process death is handed to an administrator once without a paid replay', async () => {
    const session = await message();
    await db.clinicAssistantRun.update({ where: { id: session.run.id }, data: { status: 'RUNNING', startedAt: new Date(Date.now() - 60_000), reservedMicroUsd: 1000 } });
    const model = { prepare, classify: async () => assert.fail('ambiguous paid request must not repeat') };
    await new ClinicAssistantRunnerService(db, model).runOnce();
    await new ClinicAssistantRunnerService(db, model).runOnce();
    const view = await chat.read(session.token);
    assert.equal(view.mode, 'HUMAN'); assert.equal(view.needsAttention, true);
    assert.equal(view.messages.filter(x => x.clientKey === `reply:${session.key}`).length, 1);
    const run = await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } });
    assert.equal(run.status, 'FAILED'); assert.equal(run.errorCode, 'UNCERTAIN');
    assert.equal(run.reservedMicroUsd, 1000); assert.equal(run.chargedMicroUsd, null);
  });
  await t.test('a shared daily reserve blocks competing workers before the second API call', async () => {
    const a = await message(), b = await message();
    const now = new Date(), day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sum = await db.$queryRaw`SELECT COALESCE(SUM(COALESCE("chargedMicroUsd","reservedMicroUsd")),0)::bigint AS "amount" FROM "ClinicAssistantRun" WHERE "startedAt" >= ${day}`;
    process.env.CLINIC_ASSISTANT_MODEL_DAILY_MICRO_USD = String(Number(sum[0].amount) + 1500);
    let release, entered, calls = 0;
    const barrier = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
    const model = { prepare, classify: async () => { calls++; entered(); await barrier; return response('ADDRESS'); } };
    const one = new ClinicAssistantRunnerService(db, model).runOnce(); await started;
    await new ClinicAssistantRunnerService(db, model).runOnce(); release(); await one;
    assert.equal(calls, 1);
    const runs = await db.clinicAssistantRun.findMany({ where: { id: { in: [a.run.id, b.run.id] } } });
    assert.equal(runs.filter(x => x.errorCode === 'BUDGET').length, 1);
    assert.equal(runs.filter(x => x.status === 'DONE').length, 1);
    process.env.CLINIC_ASSISTANT_MODEL_DAILY_MICRO_USD = '100000000';
  });
  await t.test('monthly zero/invalid limits and model failure keep the request and expose no secret-bearing errors', async () => {
    for (const value of ['0', 'invalid']) {
      const session = await message();
      process.env.CLINIC_ASSISTANT_MODEL_MONTHLY_MICRO_USD = value;
      await new ClinicAssistantRunnerService(db, { prepare, classify: async () => assert.fail('closed monthly cap') }).runOnce();
      assert.equal((await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } })).errorCode, 'BUDGET');
      assert.equal((await chat.read(session.token)).needsAttention, true);
    }
    process.env.CLINIC_ASSISTANT_MODEL_MONTHLY_MICRO_USD = '100000000';
    const session = await message();
    await new ClinicAssistantRunnerService(db, { prepare, classify: async () => { throw new Error('secret bridge-token-do-not-print'); } }).runOnce();
    const view = await chat.read(session.token);
    assert.ok(view.messages.every(x => !x.text.includes('bridge-token-do-not-print')));
    assert.equal(view.mode, 'HUMAN'); assert.equal(view.needsAttention, true);
    const run = await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } });
    assert.equal(run.errorCode, 'UNAVAILABLE'); assert.equal(run.reservedMicroUsd, 1000);
  });
  await t.test('messages remain ordered and a human conversation never creates a paid job', async () => {
    const session = await chat.start(), first = `qa_order_first_${session.conversation.id}`, second = `qa_order_second_${session.conversation.id}`;
    await chat.message(session.token, { clientKey: first, text: 'Где вы находитесь?' });
    await chat.message(session.token, { clientKey: second, text: 'А во сколько закрываетесь?' });
    const seen = [];
    const model = { prepare, classify: async turns => { seen.push(turns.at(-1).text); return response(seen.length === 1 ? 'ADDRESS' : 'HOURS'); } };
    await new ClinicAssistantRunnerService(db, model).runOnce(); await new ClinicAssistantRunnerService(db, model).runOnce();
    assert.deepEqual(seen, ['Где вы находитесь?', 'А во сколько закрываетесь?']);
    await chat.command(session.conversation.id, { clientKey: `human_${session.conversation.id}`, action: 'REPLY', text: 'QA administrator' });
    const count = await db.clinicAssistantRun.count();
    await chat.message(session.token, { clientKey: `human_message_${session.conversation.id}`, text: 'Где вы?' });
    assert.equal(await db.clinicAssistantRun.count(), count);
  });
  await t.test('model booking fragments are literal, durable and preserved across a date-only followup', async () => {
    process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED = 'true';
    const { randomUUID } = await import('node:crypto'), { hashToken } = await import('../apps/owner-gateway/dist/security.js');
    const ownerId = randomUUID(), token = randomUUID();
    await db.ownerSnapshot.create({ data: { ownerId, displayName: 'Synthetic dialog owner', payload: {}, sourceVersion: 'synthetic', sourceUpdatedAt: new Date() } });
    await db.portalSession.create({ data: { ownerId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    const session = await chat.start(token);
    await chat.message(session.token, { clientKey: randomUUID(), text: 'Хочу вакцинацию завтра' });
    const model = { prepare, classify: async () => ({ ...response('BOOKING'), result: { intent: 'BOOKING', serviceQuery: 'вакцинацию', preferredTimeText: 'завтра' } }) };
    await new ClinicAssistantRunnerService(db, model).runOnce();
    assert.equal((await chat.read(session.token)).bookingDraft.serviceQuery, 'вакцинацию');
    await chat.message(session.token, { clientKey: randomUUID(), text: 'Лучше послезавтра' });
    model.classify = async () => ({ ...response('BOOKING'), result: { intent: 'BOOKING', serviceQuery: 'invented service', preferredTimeText: 'послезавтра' } });
    await new ClinicAssistantRunnerService(db, model).runOnce();
    const view = await chat.read(session.token);
    assert.equal(view.bookingDraft.serviceQuery, 'вакцинацию'); assert.equal(view.bookingDraft.preferredTimeText, 'послезавтра'); assert.equal(view.mode, 'ASSISTANT');
    assert.match(view.messages.at(-1).text, /Варианты появятся/);
  });
  await t.test('a wrong booking classification cannot suppress clinical or human handoff', async () => {
    for (const [text, intent] of [['Кот не ест два дня, какой диагноз?', 'CLINICAL'], ['Соедините с оператором, пожалуйста', 'HUMAN']]) {
      const session = await message(text);
      await new ClinicAssistantRunnerService(db, { prepare, classify: async () => response('BOOKING') }).runOnce();
      const view = await chat.read(session.token);
      assert.equal(view.mode, 'HUMAN'); assert.equal(view.needsAttention, true); assert.equal(view.bookingDraft, null);
      assert.equal((await db.clinicAssistantRun.findUniqueOrThrow({ where: { id: session.run.id } })).intent, intent);
    }
  });
});
