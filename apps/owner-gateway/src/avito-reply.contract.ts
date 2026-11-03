import { BadRequestException } from '@nestjs/common';
import { redactAvitoText } from './avito-assistant.model';

export type AvitoReplyInput = {
  clientKey: string; direction: 'GROOMING'; prompt: string; text: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  facts: {
    approvedReply: string;
    knownPet: { species: string | null; breed: string | null; weightKg: string | null; age: string | null; service: string | null };
    missingFields: string[];
    administrator: { working: boolean; nextDay: 'TODAY' | 'TOMORROW' | null; opensAt: string; closesAt: string };
    requiredBlocks: { id: string; text: string }[];
  };
};
const keys = (x: unknown, expected: string) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).sort().join(',') === expected;
export function validateAvitoReplyInput(raw: unknown): AvitoReplyInput {
  const x = raw as AvitoReplyInput;
  if (!keys(x, 'clientKey,direction,facts,history,prompt,text') || !/^[a-f0-9]{64}$/.test(x.clientKey) || x.direction !== 'GROOMING'
    || typeof x.prompt !== 'string' || x.prompt.length > 14000 || typeof x.text !== 'string' || !x.text.trim() || x.text.length > 12000
    || !Array.isArray(x.history) || x.history.length > 32 || x.history.some(t => !keys(t, 'role,text') || !['user', 'assistant'].includes(t.role) || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 1000)
    || x.history.reduce((n, t) => n + t.text.length, 0) > 16000
    || !keys(x.facts, 'administrator,approvedReply,knownPet,missingFields,requiredBlocks') || typeof x.facts.approvedReply !== 'string' || !x.facts.approvedReply.trim() || x.facts.approvedReply.length > 6000
    || !keys(x.facts.knownPet, 'age,breed,service,species,weightKg') || Object.values(x.facts.knownPet).some(v => v !== null && (typeof v !== 'string' || v.length > 160))
    || !Array.isArray(x.facts.missingFields) || x.facts.missingFields.length > 6 || x.facts.missingFields.some(v => !['WEIGHT', 'AGE', 'PET', 'BREED', 'SERVICE', 'CONDITION', 'DETAILS'].includes(v))
    || !keys(x.facts.administrator, 'closesAt,nextDay,opensAt,working') || typeof x.facts.administrator.working !== 'boolean' || ![null, 'TODAY', 'TOMORROW'].includes(x.facts.administrator.nextDay)
    || !/^\d{2}:\d{2}$/.test(x.facts.administrator.opensAt) || !/^\d{2}:\d{2}$/.test(x.facts.administrator.closesAt)
    || !Array.isArray(x.facts.requiredBlocks) || x.facts.requiredBlocks.length > 12 || x.facts.requiredBlocks.some(b => !keys(b, 'id,text') || !/^F\d{1,2}$/.test(b.id) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 2000)
    || new Set(x.facts.requiredBlocks.map(b => b.id)).size !== x.facts.requiredBlocks.length) throw new BadRequestException('Некорректный запрос ответа Авито');
  return JSON.parse(redactAvitoText(JSON.stringify(x))) as AvitoReplyInput;
}
