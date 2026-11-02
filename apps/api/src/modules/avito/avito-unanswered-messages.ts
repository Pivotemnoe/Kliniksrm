type Message = { id: string; authorId: string; type: string; text: string; at: number };

/** A pending draft is not an answer. Keep consecutive customer messages together;
 * contact consent and phone evidence must still use the raw current message. */
export function unansweredAvitoText(messages: Message[], latestId: string, accountId: string, clientIds: string[], enabledAt = 0) {
  const unique = [...new Map(messages.filter(m => m.id && Number.isFinite(m.at)).map(m => [m.id, m])).values()];
  const latest = unique.find(m => m.id === latestId);
  if (!latest) return '';
  const clients = new Set(clientIds);
  const boundary = Math.max(enabledAt - 1, latest.at - 24 * 3600000, ...unique.filter(m => m.type !== 'system' && m.authorId === accountId && m.at <= latest.at).map(m => m.at));
  const request = unique.filter(m => m.type === 'text' && clients.has(m.authorId) && m.at > boundary && m.at <= latest.at).sort((a, b) => a.at - b.at);
  if (!request.some(m => m.id === latest.id) && latest.type === 'text' && clients.has(latest.authorId)) request.push(latest);
  const text = request.map(m => m.text.trim()).filter(Boolean).join('\n\n');
  return text.length <= 12000 ? text : `${text.slice(0, 8000)}\n\n${latest.text.slice(-4000)}`;
}
