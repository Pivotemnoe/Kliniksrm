import { clinicSafetyIntent } from './clinic-chat-policy';

const priceWords = /цен[аыуе]?|стоим|стоит|стоят|стоить|прайс|обойд[её]т|расцен|price/i;
const priceUrl = 'https://clinic.temichevvet.ru/prices';
export function isClinicPriceQuestion(text: string) { return priceWords.test(text) && !clinicSafetyIntent(text); }
type Reply = { human: boolean; text: string };
type Item = { title: string; priceType: string; price?: number | null; minimumPrice?: number | null; maximumPrice?: number | null };

// Only the public, fresh snapshot supplies figures. The model never supplies a price.
export function clinicPriceReply(text: string, catalog: unknown, now = Date.now()): Reply {
  const fallback = { human: true, text: 'Не удалось уточнить актуальную стоимость. Передаю вопрос администратору. Ответ появится здесь.' };
  const c = catalog as { status?: string; currency?: string; updatedAt?: string; items?: unknown[] } | null;
  const captured = Date.parse(c?.updatedAt || '');
  if (c?.status !== 'ready' || c.currency !== 'RUB' || !Number.isFinite(captured) || captured > now + 300_000 || now - captured > 86_400_000 || !Array.isArray(c.items) || c.items.length > 5000) return fallback;
  const items = c.items.filter(validItem);
  const query = queryWords(text);
  if (!query.length) return { human: false, text: `Актуальный прейскурант: ${priceUrl}\nНапишите название услуги, например «Сколько стоит первичный приём?». Помогу узнать стоимость и оставить заявку на приём.` };
  const matches = items.filter(item => query.every(word => queryWords(item.title, false).includes(word)));
  if (!matches.length) return { human: true, text: `Точного совпадения в опубликованном прайсе не нашлось. Передаю вопрос администратору. Прейскурант: ${priceUrl}` };
  return { human: false, text: `${matches.length > 1 ? 'Найдено несколько вариантов в актуальном прайсе:' : 'В актуальном прайсе:'}\n${matches.slice(0, 5).map(item => `${item.title} — ${formatPrice(item)}`).join('\n')}\n${matches.length > 5 ? 'Остальные варианты: ' : 'Прейскурант: '}${priceUrl}\nЭто цена указанной услуги; дополнительные услуги оплачиваются отдельно. Хотите оставить заявку на приём?` };
}
function validItem(value: unknown): value is Item {
  if (!value || typeof value !== 'object') return false;
  const item = value as Item;
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 240) return false;
  const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 9999999999.99;
  return item.priceType === 'FIXED' ? positive(item.price) : item.priceType === 'RANGE' ? positive(item.minimumPrice) && positive(item.maximumPrice) && item.minimumPrice <= item.maximumPrice : item.priceType === 'ON_REQUEST';
}
function formatPrice(item: Item) {
  const rub = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`;
  return item.priceType === 'FIXED' ? rub(item.price!) : item.priceType === 'RANGE' ? item.minimumPrice === item.maximumPrice ? rub(item.minimumPrice!) : `${rub(item.minimumPrice!)}–${rub(item.maximumPrice!)}` : 'стоимость уточнит администратор';
}
function queryWords(value: string, removeQuestion = true) {
  const words = value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim().split(/\s+/);
  return [...new Set(words.filter(w => w.length > 2 && (!removeQuestion || !/^(?:сколько|стоит|стоят|стоить|стоимость|цена|цены|цену|цене|прайс|расценки|обойдется|обойдутся|какая|какие|какой|какова|вас|мне|нам|вам|ваш|ваша|пожалуйста|скажите|подскажите|покажите|узнать|хочу|нужен|нужна|нужно|будет|это|сделать|для|животного|питомца|price)$/.test(w))).map(w => /^(?:кош|кот)/.test(w) ? 'кошк' : /^(?:собак|щен)/.test(w) ? 'соба' : /^(?:вакцин|привив)/.test(w) ? 'вакцин' : /^(?:ультразв|узи)$/.test(w) ? 'узи' : w.slice(0, Math.min(w.length, 5))))];
}
