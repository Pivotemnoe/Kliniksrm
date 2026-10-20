import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { UploadedFilePayload } from '../files/files.service';
import { ClinicProgrammeTable, programmeTableSummary } from './avito-programmes';

export type ListingContent = { title: string; description: string; serviceId: string | null; officeId: string | null; brief: string; marketingRules: string; photoIds: string[] };
export const DEFAULT_MARKETING_RULES = 'Пишите спокойно, понятно и по делу. Используйте только подтверждённые сведения. Не обещайте результат лечения, отсутствие рисков или гарантированное время приёма. Не придумывайте скидки, награды, отзывы, стаж и оборудование. Пригласите написать в Авито; запись подтверждает администратор.';
export function parseListingContent(raw: unknown): ListingContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Некорректное содержимое объявления');
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some(key => !['title', 'description', 'serviceId', 'officeId', 'brief', 'marketingRules', 'photoIds'].includes(key))) throw new BadRequestException('Неизвестное поле объявления');
  const text = (key: string, max: number, fallback = '') => {
    const value = data[key] ?? fallback;
    if (typeof value !== 'string' || value.length > max || /\u0000/.test(value)) throw new BadRequestException(`Проверьте поле ${key}: не более ${max} символов`);
    return value.trim();
  };
  const reference = (key: string) => {
    const value = data[key]; if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new BadRequestException('Некорректная ссылка на справочник CRM');
    return value;
  };
  const photoIds = data.photoIds ?? [];
  if (!Array.isArray(photoIds) || photoIds.length > 10 || new Set(photoIds).size !== photoIds.length || !photoIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id))) throw new BadRequestException('Можно выбрать до 10 разных фотографий');
  return { title: text('title', 100), description: text('description', 7500), serviceId: reference('serviceId'), officeId: reference('officeId'), brief: text('brief', 1500), marketingRules: text('marketingRules', 3000, DEFAULT_MARKETING_RULES), photoIds };
}
export function listingIssues(content: ListingContent, facts: ListingFacts) {
  const errors: string[] = []; const warnings: string[] = [];
  if (!content.title) errors.push('Добавьте заголовок.');
  if (!content.description) errors.push('Добавьте описание.');
  if (!content.photoIds.length) errors.push('Добавьте хотя бы одну фотографию.');
  if (!facts.office?.address) errors.push('Выберите филиал с адресом в CRM.');
  if (!facts.service && !facts.programmeTable) warnings.push('Услуга CRM не выбрана: цена не будет указана.');
  if (facts.service && facts.service.priceText === null) warnings.push('Точную стоимость уточняет администратор.');
  const amounts = (text: string) => [...text.matchAll(/(\d[\d \u00a0]*(?:[.,]\d{1,2})?)\s*(?:₽|руб(?:лей|ля|ль|\.)?|р\.)/giu)].map(match => Number(match[1].replace(/[ \u00a0]/g, '').replace(',', '.')));
  const price = facts.service?.priceText;
  const allowed = price ? [...price.matchAll(/\d[\d \u00a0]*(?:[.,]\d{1,2})?/g)].map(match => Number(match[0].trim().replace(/[ \u00a0]/g, '').replace(',', '.'))) : [];
  if (facts.programmeTable) allowed.push(...facts.programmeTable.prices.flatMap(row => [row.regularPrice,row.discountedPrice]));
  if (amounts(content.description).some(amount => !allowed.includes(amount))) errors.push('Цена в описании отличается от актуальной цены CRM. Исправьте текст или соберите его заново.');
  if (price?.startsWith('от ') && amounts(content.description).length && !content.description.replace(/\s/g,'').includes(price.replace(/\s/g,''))) errors.push('Укажите актуальный диапазон цены из CRM целиком.');
  if (/[₽$€]|\d+\s*(?:руб|р\.)|(?:\+?\d[\s().-]*){10,15}|продам/i.test(content.title)) errors.push('Уберите цену, телефон и слово «продам» из заголовка.');
  if (/<\/?[a-z][^>]*>/i.test(content.description)) errors.push('В локальном редакторе используется обычный текст. Уберите HTML-разметку.');
  if (/гарант[а-яё]*\s+(?:результат|излеч|вылеч)|100\s*%|без\s+риска|лучши[йе]|номер\s*(?:один|1)/iu.test(content.description) || !facts.programmeTable && /скидк|акци[яию]/iu.test(content.description)) warnings.push('Проверьте рекламные обещания, скидки и превосходные степени: используйте подтверждённые факты.');
  return { errors, warnings, canApprove: errors.length === 0 };
}
export type ListingFacts = {
  programmeTable?: ClinicProgrammeTable & { priceText: string };
  service: { id: string; title: string; priceText: string | null } | null;
  office: { id: string; name: string; address: string | null; phone: string | null } | null;
};
export const factsHash = (facts: ListingFacts) => createHash('sha256').update(JSON.stringify(facts)).digest('hex');
export function composeListing(content: ListingContent, facts: ListingFacts) {
  if (facts.programmeTable) return { title: facts.programmeTable.title, description: [content.brief || null, programmeTableSummary(facts.programmeTable), facts.office?.address ? `Наш адрес: ${facts.office.address}.` : null, 'Напишите в Авито — администратор поможет с заявкой и согласует визит.'].filter(Boolean).join('\n\n') };
  if (!facts.service) throw new BadRequestException('Сначала выберите услугу CRM');
  return { title: facts.service.title.slice(0, 100), description: [
    facts.service.title,
    content.brief || null,
    facts.service.priceText ? `Стоимость: ${facts.service.priceText}.` : 'Стоимость уточнит администратор.',
    facts.office?.address ? `Наш адрес: ${facts.office.address}.` : null,
    'Напишите нам в Авито — администратор уточнит детали и согласует запись.',
  ].filter(Boolean).join('\n\n') };
}
export function checkedImage(file: UploadedFilePayload | undefined) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size > 5 * 1024 * 1024 || file.size < 24) throw new BadRequestException('Выберите JPEG или PNG размером до 5 МБ');
  const b = file.buffer;
  const png = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16) === 'IHDR' && b.toString('ascii',b.length-8,b.length-4) === 'IEND';
  const jpeg = b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length-2] === 255 && b[b.length-1] === 217;
  const mimeType = png ? 'image/png' : jpeg ? 'image/jpeg' : null;
  if (!mimeType || file.mimetype !== mimeType) throw new BadRequestException('Содержимое файла должно соответствовать JPEG или PNG');
  if (png && (!b.readUInt32BE(16) || !b.readUInt32BE(20) || b.readUInt32BE(16) * b.readUInt32BE(20) > 50000000)) throw new BadRequestException('Слишком большое или повреждённое изображение');
  const name = file.originalname.replace(/\\/g,'/').split('/').pop()?.replace(/[\r\n\u0000-\u001f]/g,'').slice(0,150) || `photo.${png ? 'png' : 'jpg'}`;
  return { originalName: name, mimeType, sizeBytes: b.length, sha256: createHash('sha256').update(b).digest('hex'), bytes: new Uint8Array(b) };
}
