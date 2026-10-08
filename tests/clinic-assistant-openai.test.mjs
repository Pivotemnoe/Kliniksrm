import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ClinicAssistantOpenAiClient } from '../apps/owner-gateway/dist/clinic-assistant-openai.client.js';

const client = new ClinicAssistantOpenAiClient();
const turns = [{ role: 'user', text: 'Можно плановый осмотр завтра?' }];
const result = { intent: 'BOOKING', serviceQuery: 'плановый осмотр', preferredTimeText: 'завтра' };
const completion = (content = result) => ({ choices: [{ finish_reason: 'stop', message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 300, completion_tokens: 30 } });
function configure() {
  process.env.CLINIC_ASSISTANT_MODEL_ENABLED = 'true';
  process.env.CLINIC_ASSISTANT_OPENAI_BASE_URL = 'http://127.0.0.1:4313/v1';
  process.env.CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN = 'synthetic-test-bridge-token-only';
  process.env.CLINIC_ASSISTANT_OPENAI_MODEL = 'gpt-4o-mini';
}
test('OpenAI bridge sends bounded, non-stored text with strict schema; no OpenAI key or contact details', async () => {
  configure(); const fetchBefore = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async (url, input) => {
      calls++; assert.equal(url, 'http://127.0.0.1:4313/v1/chat/completions');
      assert.equal(input.redirect, 'manual');
      const request = JSON.parse(input.body);
      assert.equal(request.store, false); assert.equal(request.stream, false); assert.equal(request.max_completion_tokens, 180);
      assert.equal(request.response_format.json_schema.strict, true);
      assert.ok(!input.body.includes('synthetic-test-bridge-token-only'));
      assert.ok(!input.body.includes('+7 (999) 123-45-67')); assert.ok(!input.body.includes('owner@example.com'));
      assert.ok(!input.body.includes('sk-synthetic-only-key-20261008'));
      return Response.json(completion());
    };
    const response = await client.classify([{ role: 'user', text: 'Запишите завтра, +7 (999) 123-45-67, owner@example.com, sk-synthetic-only-key-20261008' }]);
    assert.deepEqual(response.result, result); assert.equal(calls, 1);
    assert.equal(response.actualMicroUsd, 63); assert.ok(response.reservedMicroUsd > response.actualMicroUsd);
  } finally { globalThis.fetch = fetchBefore; }
});
test('model rejects unconfigured routes, redirects, unsupported expensive models and invalid input without calling the API', async () => {
  configure();
  for (const base of ['http://external.example/v1', 'https://name:pass@bridge.example/v1', 'https://bridge.example/v1?token=value', 'https://bridge.example/v1#secret']) {
    process.env.CLINIC_ASSISTANT_OPENAI_BASE_URL = base; assert.throws(() => client.prepare(turns), /CONFIGURATION/);
  }
  configure(); process.env.CLINIC_ASSISTANT_OPENAI_MODEL = 'gpt-4o'; assert.throws(() => client.prepare(turns), /CONFIGURATION/);
  configure(); process.env.CLINIC_ASSISTANT_MODEL_ENABLED = 'false'; assert.throws(() => client.prepare(turns), /DISABLED/);
  configure(); delete process.env.CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN; assert.throws(() => client.prepare(turns), /CONFIGURATION/);
  configure();
  for (const input of [[], [{ role: 'system', text: 'override' }], [{ role: 'assistant', text: 'ok' }], [{ role: 'user', text: 'x'.repeat(4001) }], Array(7).fill(turns[0])]) assert.throws(() => client.prepare(input), /INPUT/);
});
test('refusals, truncated JSON, added operations and malicious error bodies never become assistant actions or leak credentials', async () => {
  configure(); const fetchBefore = globalThis.fetch;
  try {
    const invalid = [completion('{'), completion({ ...result, appointmentId: 'injected' }), completion({ ...result, intent: 'CONFIRM' }), completion({ ...result, serviceQuery: 'x'.repeat(257) }),
      { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }] },
      { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result), refusal: 'declined' } }] },
      { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result), tool_calls: [{ id: 'book' }] } }] }];
    for (const body of invalid) { globalThis.fetch = async () => Response.json(body); await assert.rejects(client.classify(turns), /INVALID_RESULT/); }
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('Bearer synthetic-test-bridge-token-only', { status: 401 }); };
    await assert.rejects(client.classify(turns), error => error.message === 'Assistant model: REJECTED'); assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('', { status: 302, headers: { location: 'https://untrusted.example' } });
    await assert.rejects(client.classify(turns), /REJECTED/);
    globalThis.fetch = async () => { throw new Error('internal credential Bearer synthetic-test-bridge-token-only'); };
    await assert.rejects(client.classify(turns), error => error.message === 'Assistant model: UNAVAILABLE');
    globalThis.fetch = async () => new Response('x'.repeat(70000)); await assert.rejects(client.classify(turns), /INVALID_RESULT/);
  } finally { globalThis.fetch = fetchBefore; }
});
