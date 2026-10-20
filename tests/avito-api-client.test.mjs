import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AvitoApiClient, avitoPilotAllowsChat } = require('../apps/api/dist/modules/avito/avito-api.client.js');

test('controlled pilot fails closed for malformed lists and blocks other chats before network I/O', async () => {
  const previous = { pilot: process.env.AVITO_PILOT_CHAT_IDS, live: process.env.AVITO_LIVE_SEND_ENABLED, fetch: global.fetch };
  process.env.AVITO_LIVE_SEND_ENABLED = 'true';
  let requests = 0;
  global.fetch = async () => { requests++; throw Error('No request expected'); };
  try {
    process.env.AVITO_PILOT_CHAT_IDS = 'owner-chat';
    assert.equal(avitoPilotAllowsChat('owner-chat'), true);
    assert.equal(avitoPilotAllowsChat('customer-chat'), false);
    await assert.rejects(() => new AvitoApiClient().send('900001', 'customer-chat', 'synthetic'), /контрольным диалогом/);
    for (const invalid of ['owner-chat,', 'owner-chat,../other', 'a,b,c,d,e,f', 'owner-chat\nother-chat']) {
      process.env.AVITO_PILOT_CHAT_IDS = invalid;
      assert.equal(avitoPilotAllowsChat('owner-chat'), false);
      await assert.rejects(() => new AvitoApiClient().send('900001', 'owner-chat', 'synthetic'), /контрольным диалогом/);
    }
    assert.equal(requests, 0);
    delete process.env.AVITO_PILOT_CHAT_IDS;
    assert.equal(avitoPilotAllowsChat('customer-chat'), true);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [['AVITO_PILOT_CHAT_IDS', previous.pilot], ['AVITO_LIVE_SEND_ENABLED', previous.live]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('provider chat identifiers containing a tilde work while path and query injection stays blocked', async () => {
  const previous={fetch:global.fetch,id:process.env.AVITO_CLIENT_ID,secret:process.env.AVITO_CLIENT_SECRET,file:process.env.AVITO_CREDENTIALS_FILE};
  process.env.AVITO_CLIENT_ID='synthetic-client';process.env.AVITO_CLIENT_SECRET='synthetic-secret';delete process.env.AVITO_CREDENTIALS_FILE;
  const calls=[];
  global.fetch=async url=>{calls.push(String(url));if(String(url).endsWith('/token'))return Response.json({access_token:'synthetic-token',expires_in:3600});return Response.json({messages:[]});};
  try{const api=new AvitoApiClient();await api.messages('900001','u2i-synthetic~chat');assert.ok(calls.some(url=>url.includes('/u2i-synthetic~chat/messages/')));const before=calls.length;for(const id of ['../other','chat/next','chat?x=1','chat#x',''])await assert.rejects(()=>api.messages('900001',id),/идентификатор/);assert.equal(calls.length,before);}
  finally{global.fetch=previous.fetch;for(const [key,value]of[['AVITO_CLIENT_ID',previous.id],['AVITO_CLIENT_SECRET',previous.secret],['AVITO_CREDENTIALS_FILE',previous.file]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

test('webhook accepts the same provider chat identifier without trusting its message body', async () => {
  const {AvitoService}=require('../apps/api/dist/modules/avito/avito.service.js');
  const previous=process.env.AVITO_WEBHOOK_SECRET;process.env.AVITO_WEBHOOK_SECRET='synthetic-webhook-secret-at-least-32-characters';
  const events=[];
  const context={api:{ingestionEnabled:()=>true},requireConnected:async()=>({id:'synthetic-integration',accountId:'900001'}),prisma:{avitoIncomingEvent:{upsert:async data=>events.push(data)}}};
  try{await AvitoService.prototype.acceptEvent.call(context,process.env.AVITO_WEBHOOK_SECRET,{payload:{value:{user_id:900001,chat_id:'u2i-synthetic~chat',id:'synthetic-message',content:{text:'never trust a webhook body'}}}});assert.equal(events[0].create.externalChatId,'u2i-synthetic~chat');assert.ok(!JSON.stringify(events).includes('never trust'));}
  finally{if(previous===undefined)delete process.env.AVITO_WEBHOOK_SECRET;else process.env.AVITO_WEBHOOK_SECRET=previous;}
});

test('Avito adapter uses fixed TLS origin, caches tokens, redacts failures and gates writes', async () => {
  const previous = { fetch: global.fetch, id: process.env.AVITO_CLIENT_ID, secret: process.env.AVITO_CLIENT_SECRET, live: process.env.AVITO_LIVE_SEND_ENABLED, file: process.env.AVITO_CREDENTIALS_FILE };
  process.env.AVITO_CLIENT_ID = 'test-client-id'; process.env.AVITO_CLIENT_SECRET = 'synthetic-secret-never-a-real-key'; delete process.env.AVITO_CREDENTIALS_FILE; delete process.env.AVITO_LIVE_SEND_ENABLED;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    assert.ok(String(url).startsWith('https://api.avito.ru/'));
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/token')) return Response.json({ access_token: 'synthetic-access-token', expires_in: 86400 });
    if (url.endsWith('/accounts/self')) return Response.json({ id: 900001, name: 'Synthetic profile' });
    return new Response(JSON.stringify({ message: 'upstream error with synthetic-secret-never-a-real-key' }), { status: 403 });
  };
  try {
    const api = new AvitoApiClient();
    assert.equal((await api.self()).id, 900001); await api.self();
    assert.equal(calls.filter(c => c.url.endsWith('/token')).length, 1);
    assert.ok(!calls[0].url.includes('synthetic-secret'));
    const count = calls.length; await assert.rejects(() => api.send('900001', 'chat-1', 'test'), /не включена/); assert.equal(calls.length, count);
    await assert.rejects(() => api.messages('900001', '../other'), /идентификатор/);
    await assert.rejects(() => api.chats('900001'), error => error.message.includes('HTTP 403') && !error.message.includes('synthetic-secret'));
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [['AVITO_CLIENT_ID', previous.id], ['AVITO_CLIENT_SECRET', previous.secret], ['AVITO_LIVE_SEND_ENABLED', previous.live], ['AVITO_CREDENTIALS_FILE', previous.file]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
test('all listings include supported inactive states, preserve pagination and reject invented filters before I/O', async () => {
  const previous = { fetch: global.fetch, id: process.env.AVITO_CLIENT_ID, secret: process.env.AVITO_CLIENT_SECRET, file: process.env.AVITO_CREDENTIALS_FILE };
  process.env.AVITO_CLIENT_ID = 'test-client-id'; process.env.AVITO_CLIENT_SECRET = 'synthetic-secret-only'; delete process.env.AVITO_CREDENTIALS_FILE;
  const calls = [];
  global.fetch = async url => {
    calls.push(String(url));
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'synthetic-access-token', expires_in: 86400 });
    const parsed = new URL(url); assert.equal(parsed.searchParams.get('page'), '1'); assert.equal(parsed.searchParams.get('per_page'), '50');
    const state = parsed.searchParams.get('status');
    const rows = state === 'active' ? [{ id: 1, title: 'Опубликовано', status: state, url: 'https://www.avito.ru/example' }]
      : state === 'old' ? Array.from({ length: 50 }, (_, i) => ({ id: i + 1, title: 'Неактивное', status: state, url: 'https://outside.example' })) : [];
    return Response.json({ resources: rows });
  };
  try {
    const api = new AvitoApiClient(); const result = await api.ownListings(1, 'all');
    assert.equal(result.items.length, 50); assert.equal(result.nextPage, 2); assert.ok(result.items.every(item => item.url === null));
    assert.deepEqual(calls.filter(url => !url.endsWith('/token')).map(url => new URL(url).searchParams.get('status')), ['active', 'old', 'removed', 'blocked', 'rejected']);
    assert.equal(calls.filter(url => url.endsWith('/token')).length, 1);
    const count = calls.length; for (const [page, status] of [[1, 'draft'], [0, 'all'], [202, 'active'], [1, 'active,old']]) await assert.rejects(() => api.ownListings(page, status), /фильтр/);
    assert.equal(calls.length, count);
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [['AVITO_CLIENT_ID', previous.id], ['AVITO_CLIENT_SECRET', previous.secret], ['AVITO_CREDENTIALS_FILE', previous.file]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
