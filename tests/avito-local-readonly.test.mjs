import assert from 'node:assert/strict';
import test from 'node:test';
import { readonlyAvitoTransport } from '../scripts/avito/local-readonly-transport.mjs';

test('local account review only permits documented reads and token issuance', async () => {
  const calls=[];
  const {guardedFetch,stats}=readonlyAvitoTransport('900001',async(input,init)=>{calls.push({url:String(input),method:init.method||'GET',redirect:init.redirect});return Response.json({});});
  await guardedFetch('https://api.avito.ru/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials'})});
  for(const path of ['/core/v1/accounts/self','/core/v1/items?status=old','/messenger/v2/accounts/900001/chats?limit=20','/messenger/v3/accounts/900001/chats/chat~a/messages/?limit=100'])await guardedFetch(`https://api.avito.ru${path}`);
  for(const [path,method] of [['/autoload/v2/profile','POST'],['/autoload/v1/upload','POST'],['/messenger/v1/accounts/900001/chats/chat-a/messages','POST'],['/core/v1/items/1','DELETE'],['/messenger/v2/accounts/900002/chats','GET'],['/autoload/v2/profile','GET']])await assert.rejects(()=>guardedFetch(`https://api.avito.ru${path}`,{method}));
  await assert.rejects(()=>guardedFetch('https://example.com/core/v1/accounts/self'));
  assert.equal(calls.length,5);assert.equal(stats.readRequests,4);assert.equal(stats.tokenRequests,1);assert.equal(stats.rejectedRequests,7);assert.ok(calls.every(c=>c.redirect==='error'));
});
test('local adapter remains unable to send when process flags are accidentally enabled', async () => {
  const previous=process.env.AVITO_LIVE_SEND_ENABLED;
  process.env.AVITO_LIVE_SEND_ENABLED='true';
  try{
    const {api}=readonlyAvitoTransport('900001',()=>assert.fail('No network request expected'));
    assert.equal(api.liveSendEnabled(),false);assert.equal(api.ingestionEnabled(),false);
    await assert.rejects(()=>api.send('900001','chat-a','Synthetic text'),/отключена/);
    await assert.rejects(()=>api.publishingAccess('900001'),/отложена/);
    assert.throws(()=>api.chats('900002'),/Другой аккаунт/);
  }finally{if(previous===undefined)delete process.env.AVITO_LIVE_SEND_ENABLED;else process.env.AVITO_LIVE_SEND_ENABLED=previous;}
});
test('local account review rejects credentials belonging to a different account', async () => {
  const previous={fetch:globalThis.fetch,id:process.env.AVITO_CLIENT_ID,secret:process.env.AVITO_CLIENT_SECRET,file:process.env.AVITO_CREDENTIALS_FILE};
  process.env.AVITO_CLIENT_ID='synthetic-client';process.env.AVITO_CLIENT_SECRET='synthetic-secret';delete process.env.AVITO_CREDENTIALS_FILE;
  const {api,guardedFetch,stats}=readonlyAvitoTransport('900001',async input=>String(input).endsWith('/token')?Response.json({access_token:'synthetic-token',expires_in:3600}):Response.json({id:900002}));
  globalThis.fetch=guardedFetch;
  try{await assert.rejects(()=>api.self(),/другому профилю/);assert.equal(stats.tokenRequests,1);assert.equal(stats.readRequests,1);}
  finally{globalThis.fetch=previous.fetch;for(const [key,value]of[['AVITO_CLIENT_ID',previous.id],['AVITO_CLIENT_SECRET',previous.secret],['AVITO_CREDENTIALS_FILE',previous.file]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('AI integration opens only the two local model routes and keeps all Avito mutations blocked', async () => {
  const seen = [];
  const { guardedFetch, stats } = readonlyAvitoTransport('900001', async (input, init) => { seen.push({ input, redirect: init.redirect }); return Response.json({}); }, { localModelGateway: true });
  for (const path of ['intent', 'copy']) await guardedFetch(`http://127.0.0.1:4021/internal/v1/avito/${path}`, { method: 'POST' });
  for (const url of ['http://127.0.0.1:4021/internal/v1/avito/intent?x=1', 'http://localhost:4021/internal/v1/avito/intent', 'http://127.0.0.1:4021/internal/v1/clinic/catalog', 'https://api.avito.ru/messenger/v1/accounts/900001/chats/c/messages']) await assert.rejects(() => guardedFetch(url, { method: 'POST' }));
  assert.equal(stats.localModelRequests, 2); assert.equal(stats.outboundMessages, 0); assert.ok(seen.every(x => x.redirect === 'error'));
});
