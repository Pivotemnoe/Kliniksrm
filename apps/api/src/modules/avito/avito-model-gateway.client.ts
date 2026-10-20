import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CORE_ADMIN_PROMPT, DirectionProfile, ListingRule } from './avito.settings';
import type { ListingFacts } from './avito-editor.policy';
import type { AvitoCrmQuestion } from './avito-crm-knowledge.service';

export type AvitoModelIntent = { action: 'GREETING' | 'PRICE' | 'HOURS' | 'ADDRESS' | 'PHONE' | 'BOOKING' | 'MEDICAL' | 'HUMAN' | 'KNOWLEDGE' | 'OTHER'; knowledgeId: string | null; serviceQuery: string | null; questions?: AvitoCrmQuestion[] };
const actions = ['GREETING', 'PRICE', 'HOURS', 'ADDRESS', 'PHONE', 'BOOKING', 'MEDICAL', 'HUMAN', 'KNOWLEDGE', 'OTHER'];
export type AvitoDialogueTurn = { role: 'user' | 'assistant'; text: string };

export function boundedAvitoHistory(history: AvitoDialogueTurn[], knownName?: string): AvitoDialogueTurn[] {
  const selected: AvitoDialogueTurn[] = []; let remaining = 16000;
  for (const turn of history.slice(-32).reverse()) {
    if (!['user', 'assistant'].includes(turn.role)) continue;
    let text = redactAvitoModelText(turn.text).trim().slice(0, 1000);
    if (knownName) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${knownName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu'), '[имя скрыто]');
    if (!text) continue;
    if (text.length > remaining) break;
    remaining -= text.length; selected.push({ role: turn.role, text });
  }
  return selected.reverse();
}

@Injectable()
export class AvitoModelGatewayClient {
  enabled() { return process.env.AVITO_AI_ENABLED === 'true'; }
  configured() { try { this.configuration(); return this.enabled(); } catch { return false; } }
  private configuration(operation: 'intent' | 'copy' = 'intent') {
    const base = process.env.OWNER_GATEWAY_URL?.trim().replace(/\/+$/, ''); const secret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();
    const url = new URL(`${base}/internal/v1/avito/${operation}`);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!base || !secret || secret.length < 16 || url.username || url.password || url.search || url.hash || url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw Error('Gateway not configured');
    return { url: url.toString(), secret };
  }
  async classify(key: string, profile: DirectionProfile, text: string, listing?: ListingRule, previousQuestion?: string, history?: AvitoDialogueTurn[]): Promise<AvitoModelIntent | null> {
    if (!this.configured()) return null;
    const input = { clientKey: createHash('sha256').update(key).digest('hex'), direction: profile.direction,
      prompt: redactAvitoModelText(`${CORE_ADMIN_PROMPT}\n\n${profile.prompt}${listing ? `\nКарточка текущего объявления: ${listing.title}\n${listing.prompt ?? ''}` : ''}${previousQuestion && !history?.length ? `\nПоследнее подтверждённое сообщение помощника: ${previousQuestion.slice(0, 500)}\nУчитывай короткий ответ клиента в контексте этого вопроса.` : ''}`).slice(0, 14000), text: redactAvitoModelText(text), knowledge: profile.knowledge.map(({ id, title, keywords }) => ({ id, title: redactAvitoModelText(title), keywords: keywords.map(redactAvitoModelText) })), ...(history ? { history: boundedAvitoHistory(history) } : {}) };
    try {
      const { url, secret } = this.configuration();
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Owner-Gateway-Secret': secret }, body: JSON.stringify(input), redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.body) return null;
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.body as any) { size += chunk.length; if (size > 16384) throw Error(); chunks.push(chunk); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AvitoModelIntent;
      const contextText = [input.text, ...(input.history ?? []).map(turn => turn.text)].join('\n').toLocaleLowerCase('ru-RU');
      if (!result || Array.isArray(result) || !['action,knowledgeId,serviceQuery', 'action,knowledgeId,questions,serviceQuery'].includes(Object.keys(result).sort().join(',')) || !actions.includes(result.action)
        || result.knowledgeId !== null && !input.knowledge.some(item => item.id === result.knowledgeId)
        || result.action === 'KNOWLEDGE' && result.knowledgeId === null || result.action !== 'KNOWLEDGE' && result.knowledgeId !== null
        || result.serviceQuery !== null && (!['PRICE', 'HOURS'].includes(result.action) || typeof result.serviceQuery !== 'string' || !result.serviceQuery.trim() || result.serviceQuery.length > 256 || !contextText.includes(result.serviceQuery.toLocaleLowerCase('ru-RU')))
        || !validQuestionPlan(result.questions, input.text, contextText)) return null;
      return result;
    } catch { return null; }
  }
  async generateCopy(key: string, direction: string, brief: string, rules: string, facts: ListingFacts): Promise<{ title: string; description: string } | null> {
    if (!this.configured() || !facts.service) return null;
    const input = { clientKey: createHash('sha256').update(`copy:${key}`).digest('hex'), direction,
      brief: redactAvitoModelText(brief), rules: redactAvitoModelText(rules),
      facts: { serviceTitle: facts.service.title.slice(0, 300), priceText: facts.service.priceText, officeName: null, address: facts.office?.address?.slice(0, 300) ?? null } };
    try {
      const { url, secret } = this.configuration('copy');
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Owner-Gateway-Secret': secret }, body: JSON.stringify(input), redirect: 'manual', signal: AbortSignal.timeout(25000) });
      if (!response.ok || !response.body) return null;
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.body as any) { size += chunk.length; if (size > 40000) throw Error(); chunks.push(chunk); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || Array.isArray(result) || Object.keys(result).sort().join(',') !== 'description,title' || typeof result.title !== 'string' || !result.title.trim() || result.title.length > 100 || typeof result.description !== 'string' || !result.description.trim() || result.description.length > 7500) return null;
      return { title: result.title.trim(), description: result.description.trim() };
    } catch { return null; }
  }
}
function validQuestionPlan(value: unknown, text: string, contextText = text.toLocaleLowerCase('ru-RU')) {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 8) return false;
  return value.every(question => {
    if (!question || Object.keys(question).sort().join(',') !== 'kind,serviceQuery,text' || !['PRICE', 'HOURS', 'ADDRESS', 'PHONE', 'VACCINES', 'SERVICE', 'ADMISSION'].includes(question.kind)
      || typeof question.text !== 'string' || !question.text.trim() || question.text.length > 500 || !text.toLocaleLowerCase('ru-RU').includes(question.text.toLocaleLowerCase('ru-RU'))) return false;
    return question.serviceQuery === null || typeof question.serviceQuery === 'string' && question.serviceQuery.trim() && question.serviceQuery.length <= 256 && contextText.includes(question.serviceQuery.toLocaleLowerCase('ru-RU'));
  });
}
export function redactAvitoModelText(text: string) {
  return text.replace(/(?:sk-|vk1\.a\.)[A-Za-z0-9_.-]+/g, '[ключ скрыт]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email скрыт]')
    .replace(/(?:\+?\d[\s().-]*){10,15}/g, '[телефон скрыт]')
    .replace(/(?:меня\s+зовут|имя\s*[:—-])\s*[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29}(?:\s+[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29})?/giu, '[имя скрыто]');
}
