import { BadRequestException } from '@nestjs/common';

export function contactPhone(value: string) {
  const text = value.trim(); const digits = text.replace(/[^0-9]/g, '');
  if (!/^\+?[0-9 ()-]{10,32}$/.test(text) || digits.length < 10 || digits.length > 15) throw new BadRequestException('Укажите телефон: от 10 до 15 цифр');
  const normalized = digits.length === 10 ? `7${digits}` : digits.length === 11 && digits[0] === '8' ? `7${digits.slice(1)}` : digits;
  return `+${normalized}`;
}
export function snapshotContact(payload: unknown) {
  const owner = (payload as { owner?: { phone?: unknown } } | null)?.owner;
  try { return typeof owner?.phone === 'string' ? contactPhone(owner.phone) : null; } catch { return null; }
}
export const introduction = 'Здравствуйте! Как к вам обращаться? Напишите, пожалуйста, ваше имя и номер телефона для связи. Можно продолжить без телефона; для записи на приём он понадобится.';
