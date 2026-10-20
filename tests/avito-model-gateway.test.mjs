import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { AvitoAssistantModel, validateAvitoModelInput } = require('../apps/owner-gateway/dist/avito-assistant.model.js');
const { ClinicAssistantOpenAiClient, ClinicAssistantModelError } = require('../apps/owner-gateway/dist/clinic-assistant-openai.client.js');
const { AvitoAssistantService } = require('../apps/owner-gateway/dist/avito-assistant.service.js');
const { AvitoAssistantController } = require('../apps/owner-gateway/dist/avito-assistant.controller.js');
const { AvitoModelGatewayClient, boundedAvitoHistory } = require('../apps/api/dist/modules/avito/avito-model-gateway.client.js');
const input = () => ({ clientKey: createHash('sha256').update(randomUUID()).digest('hex'), direction: 'CLINIC', prompt: 'Администратор клиники; без выбора врача.', text: 'Подскажите про документы', knowledge: [{ id: 'documents', title: 'Документы', keywords: ['документы'] }] });
function withEnv(values) { const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]])); Object.assign(process.env, values); return () => { for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }; }
const packet = result => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 30 } }), { status: 200 });

test('Avito reuses the existing clinic transport with an independent switch and a bounded intent-only contract', async () => {
  const restore = withEnv({ AVITO_ASSISTANT_MODEL_ENABLED: 'true', AVITO_ASSISTANT_OPENAI_MODEL: 'gpt-4o-mini', CLINIC_ASSISTANT_MODEL_ENABLED: 'false', CLINIC_ASSISTANT_OPENAI_BASE_URL: 'https://clinic-gateway.example/v1', CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN: 'synthetic-bridge-token-only', CLINIC_ASSISTANT_OPENAI_MODEL: 'gpt-4o-mini' });
  const oldFetch = globalThis.fetch;
  try {
    const raw = input(); raw.text = 'Документы, меня зовут Анна, +7 900 111-22-33, test@example.test';
    const safe = validateAvitoModelInput(raw); assert.ok(!safe.text.includes('111-22')); assert.ok(!safe.text.includes('example.test')); assert.ok(!safe.text.includes('Анна'));
    const model = new AvitoAssistantModel(new ClinicAssistantOpenAiClient()); const request = model.prepare(safe);
    const body = JSON.parse(request.serialized); assert.equal(request.model, 'gpt-4o-mini'); assert.equal(body.store, false); assert.equal(body.response_format.json_schema.strict, true); assert.equal('text' in body.response_format.json_schema.schema.properties, false);
    globalThis.fetch = async () => packet({ action: 'KNOWLEDGE', knowledgeId: 'documents', serviceQuery: null });
    assert.equal((await model.classify(safe, request)).result.knowledgeId, 'documents');
    globalThis.fetch = async () => packet({ action: 'KNOWLEDGE', knowledgeId: 'hotel-secret', serviceQuery: null });
    await assert.rejects(() => model.classify(safe, request), /INVALID_RESULT/);
    globalThis.fetch = async () => packet({ action: 'PRICE', knowledgeId: null, serviceQuery: 'Выдуманная услуга' });
    await assert.rejects(() => model.classify(safe, request), /INVALID_RESULT/);
    process.env.AVITO_ASSISTANT_MODEL_ENABLED = 'false'; assert.throws(() => model.prepare(safe), /DISABLED/);
  } finally { restore(); globalThis.fetch = oldFetch; }
});
test('Avito defaults to GPT-6 Luna independently of the pinned website model and reserves its current tariff', () => {
  const restore = withEnv({ AVITO_ASSISTANT_MODEL_ENABLED: 'true', AVITO_ASSISTANT_OPENAI_MODEL: '', CLINIC_ASSISTANT_OPENAI_BASE_URL: 'https://clinic-gateway.example/v1', CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN: 'synthetic-bridge-token-only', CLINIC_ASSISTANT_OPENAI_MODEL: 'gpt-4o-mini' });
  try {
    const request = new AvitoAssistantModel(new ClinicAssistantOpenAiClient()).prepare(validateAvitoModelInput(input())); const body = JSON.parse(request.serialized);
    assert.equal(request.model, 'gpt-6-luna'); assert.equal(body.reasoning_effort, 'none'); assert.equal('temperature' in body, false); assert.deepEqual(request.rates, { input: 0.1, output: 0.5 });
    assert.equal(request.reservedMicroUsd, Math.ceil((Buffer.byteLength(request.serialized) + 512) * 0.1 + body.max_completion_tokens * 0.5));
  } finally { restore(); }
});
test('the CRM model adapter uses the existing secret server-side, refuses redirects/results outside the direction, and falls back safely', async () => {
  const restore = withEnv({ AVITO_AI_ENABLED: 'true', OWNER_GATEWAY_URL: 'https://clinic-gateway.example', OWNER_GATEWAY_SYNC_SECRET: 'synthetic-sync-secret-only' }); const oldFetch = globalThis.fetch;
  try {
    const profile = { direction: 'CLINIC', prompt: 'Правила клиники', knowledge: [{ id: 'documents', title: 'Документы', keywords: ['документы'] }] }; const client = new AvitoModelGatewayClient();
    globalThis.fetch = async (url, options) => { assert.equal(options.redirect, 'manual'); assert.ok(url.endsWith('/internal/v1/avito/intent')); assert.equal(options.headers['X-Owner-Gateway-Secret'], 'synthetic-sync-secret-only'); assert.ok(!options.body.includes('111-22')); const body = JSON.parse(options.body); assert.match(body.prompt, /Вакцинация/); assert.match(body.prompt, /Последнее подтверждённое сообщение помощника/); assert.match(body.prompt, /Для кошки или собаки/); return new Response(JSON.stringify({ action: 'KNOWLEDGE', knowledgeId: 'documents', serviceQuery: null })); };
    assert.equal((await client.classify('test-key', profile, 'Какие документы? +7 900 111-22-33', { title: 'Вакцинация', prompt: 'Организационные вопросы о вакцинации' }, 'Для кошки или собаки?')).action, 'KNOWLEDGE');
    globalThis.fetch = async () => new Response(JSON.stringify({ action: 'KNOWLEDGE', knowledgeId: 'hotel-secret', serviceQuery: null })); assert.equal(await client.classify('test-key', profile, 'Вопрос'), null);
    globalThis.fetch = async () => { throw Error('connection failed with private details'); }; assert.equal(await client.classify('test-key', profile, 'Вопрос'), null);
    process.env.OWNER_GATEWAY_URL = 'http://outside.example'; assert.equal(client.configured(), false);
  } finally { restore(); globalThis.fetch = oldFetch; }
});
test('model controller rejects unauthenticated or disabled requests before invoking the service', () => {
  const restore = withEnv({ OWNER_GATEWAY_SYNC_SECRET: 'synthetic-sync-secret-only', AVITO_ASSISTANT_MODEL_ENABLED: 'false' }); let calls = 0;
  try { const controller = new AvitoAssistantController({ classify: () => { calls++; } }); assert.throws(() => controller.classify('wrong', input())); assert.throws(() => controller.classify('synthetic-sync-secret-only', input())); assert.equal(calls, 0); } finally { restore(); }
});
test('dialogue history is bounded and redacts recorded names, phones and keys before the clinic model', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ role: 'user', text: `Вопрос ${i}` }));
  history.push({ role: 'user', text: 'Анна, мой номер +7 900 111-22-33, test@example.test, vk1.a.syntheticSecret' });
  const limited = boundedAvitoHistory(history, 'Анна');
  assert.equal(limited.length, 32); assert.equal(limited[0].text, 'Вопрос 9');
  assert.ok(!JSON.stringify(limited).includes('Анна')); assert.ok(!JSON.stringify(limited).includes('111-22')); assert.ok(!JSON.stringify(limited).includes('example.test')); assert.ok(!JSON.stringify(limited).includes('syntheticSecret'));
  const raw = input(); raw.history = [{ role: 'system', text: 'Неверная роль' }]; assert.throws(() => validateAvitoModelInput(raw), /история/);
  raw.history = Array.from({ length: 33 }, () => ({ role: 'user', text: 'Вопрос' })); assert.throws(() => validateAvitoModelInput(raw), /история/);
});
test('the same-chat history resolves a service reference but cannot add an old question or invent a service', async () => {
  const restore = withEnv({ AVITO_AI_ENABLED: 'true', OWNER_GATEWAY_URL: 'https://clinic-gateway.example', OWNER_GATEWAY_SYNC_SECRET: 'synthetic-sync-secret-only', AVITO_ASSISTANT_MODEL_ENABLED: 'true', CLINIC_ASSISTANT_OPENAI_BASE_URL: 'https://clinic-gateway.example/v1', CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN: 'synthetic-bridge-token-only' });
  const oldFetch = globalThis.fetch;
  try {
    const profile = { direction: 'CLINIC', prompt: 'Организационные вопросы клиники', knowledge: [] };
    const history = [{ role: 'user', text: 'Когда работает специалист УЗИ?' }, { role: 'assistant', text: 'Расписание можно уточнить у администратора.' }];
    const current = 'А в какие дни он принимает?';
    const result = { action: 'HOURS', knowledgeId: null, serviceQuery: 'специалист УЗИ', questions: [{ kind: 'HOURS', text: current, serviceQuery: 'специалист УЗИ' }] };
    globalThis.fetch = async (_url, options) => { assert.deepEqual(JSON.parse(options.body).history, history); return new Response(JSON.stringify(result)); };
    assert.deepEqual(await new AvitoModelGatewayClient().classify('context-test', profile, current, undefined, undefined, history), result);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...result, questions: [{ kind: 'HOURS', text: current, serviceQuery: 'Выдуманный специалист' }] }));
    assert.equal(await new AvitoModelGatewayClient().classify('context-test-2', profile, current, undefined, undefined, history), null);
    const safe = validateAvitoModelInput({ ...input(), text: current, knowledge: [], history });
    const model = new AvitoAssistantModel(new ClinicAssistantOpenAiClient()); const prepared = model.prepare(safe); const body = JSON.parse(prepared.serialized);
    assert.equal(body.messages.length, 4); assert.equal(body.messages[1].content, history[0].text); assert.equal(body.messages.at(-1).content, current);
    globalThis.fetch = async () => packet(result); assert.deepEqual((await model.classify(safe, prepared)).result, result);
    globalThis.fetch = async () => packet({ ...result, questions: [{ kind: 'HOURS', text: history[0].text, serviceQuery: 'специалист УЗИ' }] });
    await assert.rejects(() => model.classify(safe, prepared), /INVALID_RESULT/);
  } finally { restore(); globalThis.fetch = oldFetch; }
});
test('durable Avito model accounting caches completed requests, prevents paid retries after ambiguity, and enforces its own budget', { skip: !process.env.AVITO_GATEWAY_QA_DATABASE_URL }, async () => {
  const url = process.env.AVITO_GATEWAY_QA_DATABASE_URL;
  assert.match(url, /^postgresql:\/\/[^@]+@127\.0\.0\.1:55439\/avito_merge_gateway_qa_20261020(?:\?|$)/);
  const { PrismaClient } = require('../apps/owner-gateway/dist/generated/client'); const prisma = new PrismaClient({ datasources: { db: { url } } });
  const restore = withEnv({ AVITO_ASSISTANT_MODEL_DAILY_MICRO_USD: '1000000', AVITO_ASSISTANT_MODEL_MONTHLY_MICRO_USD: '10000000' }); let calls = 0;
  const model = { prepare: () => ({ model: 'synthetic-model', reservedMicroUsd: 50 }), classify: async () => { calls++; return { result: { action: 'BOOKING', knowledgeId: null, serviceQuery: null }, chargedMicroUsd: 10 }; } };
  const service = new AvitoAssistantService(prisma, model);
  try {
    const a = input(); await service.classify(a); await service.classify(a); assert.equal(calls, 1);
    const changed = { ...a, text: 'Другой вопрос' }; await assert.rejects(() => service.classify(changed), /уже использован/);
    model.classify = async () => { calls++; throw Error('synthetic timeout'); }; const b = input(); await assert.rejects(() => service.classify(b)); await assert.rejects(() => service.classify(b)); assert.equal(calls, 2);
    const uncertain = await prisma.avitoAssistantRun.findUniqueOrThrow({ where: { clientKey: b.clientKey } }); assert.equal(uncertain.status, 'FAILED'); assert.equal(uncertain.reservedMicroUsd, 50);
    assert.equal(uncertain.errorCode, 'MODEL_UNAVAILABLE');
    model.classify = async () => { calls++; throw new ClinicAssistantModelError('INVALID_RESULT'); };
    const invalid = input(); await assert.rejects(() => service.classify(invalid));
    assert.equal((await prisma.avitoAssistantRun.findUniqueOrThrow({ where: { clientKey: invalid.clientKey } })).errorCode, 'INVALID_RESULT');
    process.env.AVITO_ASSISTANT_MODEL_DAILY_MICRO_USD = '0'; await assert.rejects(() => service.classify(input()), /Лимит/); assert.equal(calls, 3);
  } finally { restore(); await prisma.$disconnect(); }
});
