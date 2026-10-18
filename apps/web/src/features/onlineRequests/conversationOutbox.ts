import { ApiError } from '../../api/errors';
import { sendConversationCommand } from './onlineRequests.api';

export type QueuedReply = {
  clientKey: string;
  employeeId: string;
  requestId: string;
  text: string;
  createdAt: string;
  state: 'queued' | 'needs-review';
  error?: string;
};

const storagePrefix = 'temichevvet:clinic-reply-outbox:v1:';
const changeEvent = 'crm:clinic-reply-outbox-change';
let activeFlush: Promise<void> | null = null;

function key(employeeId: string) { return `${storagePrefix}${employeeId}`; }

export function readQueuedReplies(employeeId: string): QueuedReply[] {
  try {
    const value = sessionStorage.getItem(key(employeeId));
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedReply => Boolean(item && typeof item === 'object'
      && item.employeeId === employeeId && typeof item.requestId === 'string'
      && typeof item.clientKey === 'string' && typeof item.text === 'string'
      && (item.state === 'queued' || item.state === 'needs-review')));
  } catch { return []; }
}

function save(employeeId: string, replies: QueuedReply[]) {
  if (replies.length) sessionStorage.setItem(key(employeeId), JSON.stringify(replies));
  else sessionStorage.removeItem(key(employeeId));
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeQueuedReplies(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  return () => window.removeEventListener(changeEvent, listener);
}

export function queueClinicReply(employeeId: string, requestId: string, text: string) {
  const item: QueuedReply = { clientKey: crypto.randomUUID(), employeeId, requestId, text: text.trim(),
    createdAt: new Date().toISOString(), state: 'queued' };
  if (!item.text) throw new Error('Введите ответ');
  save(employeeId, [...readQueuedReplies(employeeId), item]);
  return item;
}

export function retryQueuedReply(employeeId: string, clientKey: string) {
  save(employeeId, readQueuedReplies(employeeId).map(item => item.clientKey === clientKey
    ? { ...item, state: 'queued', error: undefined } : item));
}

export function discardQueuedReply(employeeId: string, clientKey: string) {
  save(employeeId, readQueuedReplies(employeeId).filter(item => item.clientKey !== clientKey));
}

export function flushQueuedReplies(employeeId: string, onSent?: (requestId: string) => void) {
  if (activeFlush) return activeFlush;
  activeFlush = (async () => {
    for (;;) {
      const item = readQueuedReplies(employeeId).find(reply => reply.state === 'queued');
      if (!item) return;
      try {
        // The same clientKey is reused after an ambiguous network failure. The
        // CRM de-duplicates it before creating its server-side delivery job.
        await sendConversationCommand(item.requestId, { clientKey: item.clientKey, action: 'REPLY', text: item.text });
        save(employeeId, readQueuedReplies(employeeId).filter(reply => reply.clientKey !== item.clientKey));
        onSent?.(item.requestId);
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429) {
          save(employeeId, readQueuedReplies(employeeId).map(reply => reply.clientKey === item.clientKey
            ? { ...reply, state: 'needs-review', error: error.message } : reply));
          continue;
        }
        // Network failure, 401 during session renewal, 429 or 5xx: retain the
        // reply and retry later without guessing whether the server received it.
        return;
      }
    }
  })().finally(() => { activeFlush = null; });
  return activeFlush;
}
