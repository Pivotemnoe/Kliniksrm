const chatBase = (import.meta.env.VITE_CLINIC_CHAT_API_BASE || '/assistant-chat-api').replace(/\/$/, '');
export class ClinicChatError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function chatRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${chatBase}${path}`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new ClinicChatError(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Чат недоступен', res.status);
  return data;
}
