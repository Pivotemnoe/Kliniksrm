import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

export type AvitoApiMessage = { id: string; author_id?: number; direction?: string; type?: string; created: number; content?: { text?: string } };
export type AvitoApiChat = { id: string; users?: { id: number; name?: string }[]; context?: { type?: string; value?: { id?: number; title?: string } } };
export function avitoPilotAllowsChat(chatId: string) {
  const raw = process.env.AVITO_PILOT_CHAT_IDS?.trim();
  if (!raw) return true;
  const ids = raw.split(',').map(value => value.trim());
  return ids.length <= 5 && ids.every(value => /^[A-Za-z0-9:_~-]{1,200}$/.test(value)) && ids.includes(chatId);
}
export type AvitoPublishingCheck = {
  accountId: string; checkedAt: string; mode: 'READ_ONLY'; profileHttpStatus: number | null; fieldsHttpStatus: number | null;
  category: string; schemaFields: string[]; livePublishingEnabled: false; writeTested: false;
  operations: { key: 'publication' | 'editing' | 'photos'; schemaSupported: boolean; access: 'BLOCKED' | 'NOT_VERIFIED'; note: string }[];
};

/** No arbitrary URLs, raw upstream errors, credentials, or token values cross this adapter. */
@Injectable()
export class AvitoApiClient {
  private cached: { token: string; until: number } | null = null;
  configured() { return Boolean(process.env.AVITO_CREDENTIALS_FILE?.trim() || (process.env.AVITO_CLIENT_ID?.trim() && process.env.AVITO_CLIENT_SECRET?.trim())); }
  liveSendEnabled() { return process.env.AVITO_LIVE_SEND_ENABLED === 'true'; }
  ingestionEnabled() { return process.env.AVITO_INGEST_ENABLED === 'true'; }

  private async credentials() {
    let clientId = process.env.AVITO_CLIENT_ID?.trim(); let clientSecret = process.env.AVITO_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      const file = process.env.AVITO_CREDENTIALS_FILE?.trim();
      if (!file) throw new ServiceUnavailableException('Ключи Авито ещё не подключены на сервере');
      let content: string;
      try { content = await readFile(file, 'utf8'); } catch { throw new ServiceUnavailableException('Не удалось прочитать серверное хранилище ключей Авито'); }
      const values = Object.fromEntries(content.split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')]; }));
      clientId = values.AVITO_CLIENT_ID; clientSecret = values.AVITO_CLIENT_SECRET;
    }
    if (!clientId || !clientSecret) throw new ServiceUnavailableException('В серверном хранилище не заполнены ключи Авито');
    return { clientId, clientSecret };
  }
  private async token() {
    if (this.cached && this.cached.until > Date.now()) return this.cached.token;
    const { clientId, clientSecret } = await this.credentials();
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
    const result = await this.request('/token', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, false);
    if (typeof result.access_token !== 'string') throw new ServiceUnavailableException('Авито не вернул токен доступа');
    this.cached = { token: result.access_token, until: Date.now() + Math.max(1, Number(result.expires_in || 3600) - 60) * 1000 };
    return result.access_token as string;
  }
  private async request(path: string, init: RequestInit = {}, authorize = true): Promise<any> {
    const token = authorize ? await this.token() : null;
    let response: Response;
    try { response = await fetch(`https://api.avito.ru${path}`, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } }); }
    catch { throw new ServiceUnavailableException('Нет подтверждённого результата запроса к Авито. Исходящую отправку нужно сверить с историей.'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) this.cached = null;
      throw new ServiceUnavailableException(`Авито вернул HTTP ${response.status}. Проверьте доступ или повторите позже.`);
    }
    try { return await response.json(); } catch { throw new ServiceUnavailableException('Не удалось проверить ответ Авито'); }
  }
  self(): Promise<{ id: number; name?: string }> { return this.request('/core/v1/accounts/self'); }
  async chats(accountId: string, offset = 0): Promise<AvitoApiChat[]> {
    const data = await this.request(`/messenger/v2/accounts/${segment(accountId)}/chats?limit=20&offset=${offset}&chat_types=u2i`);
    if (!Array.isArray(data.chats)) throw new ServiceUnavailableException('Авито не вернул список чатов');
    return data.chats;
  }
  chat(accountId: string, chatId: string): Promise<AvitoApiChat> { return this.request(`/messenger/v2/accounts/${segment(accountId)}/chats/${segment(chatId)}`); }
  async messages(accountId: string, chatId: string, offset = 0): Promise<AvitoApiMessage[]> {
    const data = await this.request(`/messenger/v3/accounts/${segment(accountId)}/chats/${segment(chatId)}/messages/?limit=100&offset=${offset}`);
    if (!Array.isArray(data.messages)) throw new ServiceUnavailableException('Авито не вернул историю сообщений');
    return data.messages;
  }
  async send(accountId: string, chatId: string, text: string): Promise<{ id: string }> {
    if (!this.liveSendEnabled()) throw new ServiceUnavailableException('Реальная отправка Авито не включена на сервере');
    if (!avitoPilotAllowsChat(chatId)) throw new ServiceUnavailableException('Пилот Авито ограничен контрольным диалогом');
    const data = await this.request(`/messenger/v1/accounts/${segment(accountId)}/chats/${segment(chatId)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { text }, type: 'text' }) });
    if (typeof data.id !== 'string') throw new ServiceUnavailableException('Авито не подтвердил идентификатор отправленного сообщения');
    return { id: data.id };
  }
  async ownListings(page = 1, status = 'active') {
    if (!Number.isSafeInteger(page) || page < 1 || page > 201 || !['all', 'active', 'old', 'removed', 'blocked', 'rejected'].includes(status)) throw new ServiceUnavailableException('Некорректный фильтр объявлений');
    const items = new Map<string, { id: string; title: string; status: string; url: string | null }>(); let more = false;
    for (const state of status === 'all' ? ['active', 'old', 'removed', 'blocked', 'rejected'] : [status]) {
      const data = await this.request(`/core/v1/items?per_page=50&page=${page}&status=${state}`);
      if (!Array.isArray(data.resources)) throw new ServiceUnavailableException('Авито не вернул объявления');
      more ||= data.resources.length === 50;
      for (const x of data.resources) items.set(String(x.id), { id: String(x.id), title: String(x.title ?? ''), status: String(x.status ?? ''), url: typeof x.url === 'string' && /^https:\/\/(?:www\.)?avito\.ru\//.test(x.url) ? x.url : null });
    }
    return { items: [...items.values()], nextPage: more ? page + 1 : null };
  }
  /** Introspection only. Never creates a profile/feed or attempts a publication/photo upload. */
  async publishingAccess(expectedAccountId: string): Promise<AvitoPublishingCheck> {
    const self = await this.self();
    if (String(self.id) !== expectedAccountId) throw new ServiceUnavailableException('Ключи относятся к другому профилю Авито');
    const [profile, fields] = await Promise.all([
      this.readAccess('/autoload/v2/profile'),
      this.readAccess('/autoload/v1/user-docs/node/uhod_za_zhivotnymi/fields'),
    ]);
    const tags: string[] = fields.status === 200 && fields.data?.node?.slug === 'uhod_za_zhivotnymi' && Array.isArray(fields.data.fields)
      ? fields.data.fields.map((field: any) => field?.tag).filter((tag: unknown): tag is string => typeof tag === 'string' && /^[A-Za-z][A-Za-z0-9]{0,60}$/.test(tag)) : [];
    const note = profile.status === 403 ? 'Авито вернул HTTP 403 при чтении профиля автозагрузки. Причину ограничения нужно уточнить в Авито; тариф по этому ответу не определяется.'
      : profile.status === 200 ? 'Чтение настроек доступно. Публикация и изменения не выполнялись, право на запись пока не подтверждено.'
        : `Чтение профиля автозагрузки не подтверждено${profile.status ? ` (HTTP ${profile.status})` : ''}.`;
    return { accountId: expectedAccountId, checkedAt: new Date().toISOString(), mode: 'READ_ONLY', profileHttpStatus: profile.status, fieldsHttpStatus: fields.status,
      category: 'Уход за животными', schemaFields: tags, livePublishingEnabled: false, writeTested: false,
      operations: [
        { key: 'publication', schemaSupported: ['Id', 'Title', 'Description'].every(tag => tags.includes(tag)), access: profile.status === 403 ? 'BLOCKED' : 'NOT_VERIFIED', note },
        { key: 'editing', schemaSupported: tags.includes('AvitoId'), access: profile.status === 403 ? 'BLOCKED' : 'NOT_VERIFIED', note },
        { key: 'photos', schemaSupported: tags.includes('Images'), access: profile.status === 403 ? 'BLOCKED' : 'NOT_VERIFIED', note },
      ] };
  }
  private async readAccess(path: string): Promise<{ status: number | null; data: any }> {
    try {
      const token = await this.token();
      const response = await fetch(`https://api.avito.ru${path}`, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return { status: response.status, data: null };
      if (!response.body || Number(response.headers.get('content-length') || 0) > 3000000) return { status: response.status, data: null };
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.body as any) { size += chunk.length; if (size > 3000000) throw Error(); chunks.push(chunk); }
      return { status: response.status, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    } catch { return { status: null, data: null }; }
  }
}
function segment(value: string) { if (!/^[A-Za-z0-9:_~-]{1,200}$/.test(value)) throw new ServiceUnavailableException('Некорректный идентификатор Авито'); return encodeURIComponent(value); }
