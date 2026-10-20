import 'reflect-metadata';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { AvitoApiClient } = require('../../apps/api/dist/modules/avito/avito-api.client.js');

/** Dedicated local review: the transport cannot mutate Avito even if runtime flags change. */
export function readonlyAvitoTransport(expectedAccountId, fetchImpl = globalThis.fetch, { localModelGateway = false } = {}) {
  if (!/^\d{1,20}$/.test(expectedAccountId)) throw Error('Expected Avito account is required');
  const stats = { tokenRequests: 0, readRequests: 0, rejectedRequests: 0, outboundMessages: 0, localModelRequests: 0 };
  const guardedFetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (localModelGateway && url.origin === 'http://127.0.0.1:4021' && !url.username && !url.password && !url.search && !url.hash
      && method === 'POST' && ['/internal/v1/avito/intent', '/internal/v1/avito/copy'].includes(url.pathname)) {
      stats.localModelRequests++;
      return fetchImpl(input, { ...init, redirect: 'error' });
    }
    const token = method === 'POST' && url.pathname === '/token' && init.body instanceof URLSearchParams && init.body.get('grant_type') === 'client_credentials';
    const read = method === 'GET' && (
      ['/core/v1/accounts/self', '/core/v1/items'].includes(url.pathname) ||
      new RegExp(`^/messenger/v[123]/accounts/${expectedAccountId}/chats(?:/[A-Za-z0-9:_~-]{1,200}(?:/messages/?)?)?$`).test(url.pathname)
    );
    if (url.origin !== 'https://api.avito.ru' || url.username || url.password || url.hash || (!token && !read)) {
      stats.rejectedRequests++;
      throw Error('Локальный просмотр допускает только чтение профиля, объявлений и переписки Авито');
    }
    if (token) stats.tokenRequests++; else stats.readRequests++;
    return fetchImpl(input, { ...init, redirect: 'error' });
  };
  class ReadonlyAvitoApi extends AvitoApiClient {
    liveSendEnabled() { return false; }
    ingestionEnabled() { return false; }
    async self() {
      const profile = await super.self();
      if (String(profile.id) !== expectedAccountId) throw Error('Ключи относятся к другому профилю Авито');
      return profile;
    }
    bound(accountId) { if (String(accountId) !== expectedAccountId) throw Error('Другой аккаунт недоступен в локальном просмотре'); }
    chats(accountId, offset = 0) { this.bound(accountId); return super.chats(accountId, offset); }
    chat(accountId, chatId) { this.bound(accountId); return super.chat(accountId, chatId); }
    messages(accountId, chatId, offset = 0) { this.bound(accountId); return super.messages(accountId, chatId, offset); }
    async ownListings(page = 1, status = 'all') { await this.self(); return super.ownListings(page, status); }
    async send() { throw Error('Отправка сообщений отключена в локальном просмотре'); }
    async publishingAccess() { throw Error('Автозагрузка отложена. Черновики готовятся для ручного размещения.'); }
  }
  return { api: new ReadonlyAvitoApi(), guardedFetch, stats };
}
