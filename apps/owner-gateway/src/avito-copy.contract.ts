import { BadRequestException } from '@nestjs/common';
import { redactAvitoText } from './avito-assistant.model';
export type AvitoCopyInput = {
  clientKey: string; direction: 'CLINIC' | 'GROOMING' | 'HOTEL'; brief: string; rules: string;
  facts: { serviceTitle: string; priceText: string | null; officeName: string | null; address: string | null };
};
export function validateAvitoCopyInput(raw: unknown): AvitoCopyInput {
  const x = raw as AvitoCopyInput;
  if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).sort().join(',') !== 'brief,clientKey,direction,facts,rules'
    || typeof x.clientKey !== 'string' || !/^[a-f0-9]{64}$/.test(x.clientKey) || !['CLINIC','GROOMING','HOTEL'].includes(x.direction)
    || typeof x.brief !== 'string' || x.brief.length > 1500 || typeof x.rules !== 'string' || x.rules.length > 3000
    || !x.facts || typeof x.facts !== 'object' || Array.isArray(x.facts) || Object.keys(x.facts).sort().join(',') !== 'address,officeName,priceText,serviceTitle'
    || typeof x.facts.serviceTitle !== 'string' || !x.facts.serviceTitle.trim() || x.facts.serviceTitle.length > 300
    || !['priceText','officeName','address'].every(key => x.facts[key as keyof typeof x.facts] === null || typeof x.facts[key as keyof typeof x.facts] === 'string' && x.facts[key as keyof typeof x.facts]!.length <= 300)) throw new BadRequestException('Некорректный запрос редактора Авито');
  return { ...x, brief: redactAvitoText(x.brief), rules: redactAvitoText(x.rules) };
}
