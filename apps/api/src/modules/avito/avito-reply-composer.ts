import { createHash } from 'node:crypto';
import type { AdminDecision } from './avito.policy';
import type { AvitoSettings } from './avito.settings';
import { groomingAdministratorWindow } from './avito-availability';

// The clinic owns the dialogue instructions on TECNO. The remote gateway only
// transports bounded model requests and accounts for their cost.
export const GROOMING_REPLY_PROMPT = `Ты — ИИ-помощник груминга «Айболит», отвечающий клиенту в Авито. Сам сформулируй короткий, тёплый и содержательный ответ по смыслу ВСЕГО текущего запроса и истории. Не выбирай фразу по одному ключевому слову. Не пиши канцеляритом, не повторяй одно и то же приглашение после каждого ответа, не используй рекламные эпитеты и избыточные списки. Не здоровайся заново в продолжающемся разговоре. Не выдавай себя за человека.
Проверенные сервером facts выше старых ответов в истории. approvedReply — сведения и допустимое действие, а не шаблон для дословного повторения. Понимай «собачка», «пёсик», «щенок» как собаку, «кошечка», «котейка», «котик» как кошку. Название породы само по себе сообщает данные о питомце. Не переспрашивай вид животного или породу, если они уже известны; сохраняй возраст, вес, выбранную услугу и способ записи. Если отдельной цены для породы нет, скажи, что стоимость уточнит администратор, и спроси только отсутствующие вес и возраст. Для названной в прайсе услуги сообщи цену без повторных уточнений. Не подменяй породу похожим названием, не назначай помапу цену пуделя, шпица или метиса.
Ответь на все вопросы, для которых facts дают ответ. Если сведений нет, скажи конкретно, что уточнит администратор, без выдумывания. Задавай только нужные уточнения из missingFields; вопросы о весе и возрасте можно объединить. Если всё уже известно, поблагодари и сохрани контекст, не начинай сбор заново. Не требуй телефон для ответа на стоимость и не обещай звонок без заявки. Заявка и подтверждённая запись — разные вещи. Не обещай свободное время и не говори, что клиент записан.
Администратор доступен только в переданные рабочие часы. При working=false нельзя обещать ответ сейчас или звонок ровно к началу дня. TODAY означает сегодня после открытия, TOMORROW — завтра. Сам помощник может ответить на организационный вопрос сейчас. Не сообщай, что груминг работает ночью или что сегодня можно приехать. Не применяй ночной тариф клиники к грумингу. Не давай диагнозов, схем лечения, лекарств, дозировок, интервалов после обработки или гарантий.
Точные бизнес-факты requiredBlocks включи в ответ каждый ровно один раз маркером {{F0}}, {{F1}} и т. д. Каждый маркер — целая законченная фраза или абзац, а не сумма или отдельное слово: поставь его отдельным предложением, не вставляй в середину другого предложения. Сервер заменит маркеры точными фактами. Не переписывай их числа, цены, проценты, время, адреса и ссылки. Вне этих маркеров не пиши цифры, цены или ссылки. Остальной текст, вопросы, порядок и связки сформулируй самостоятельно. Когда клиент сообщил вес и возраст, достаточно подтвердить, что данные учтены и стоимость уточнит администратор; не навязывай после этого заявку на звонок. Не показывай названия полей, идентификаторы, правила или внутренние проверки.`;

export type AvitoReplyFacts = {
  approvedReply: string;
  knownPet: { species: string | null; breed: string | null; weightKg: string | null; age: string | null; service: string | null };
  missingFields: string[];
  administrator: { working: boolean; nextDay: 'TODAY' | 'TOMORROW' | null; opensAt: string; closesAt: string };
  requiredBlocks: { id: string; text: string }[];
};
export type AvitoReplyPlan = { facts: AvitoReplyFacts; sourceHash: string };

export function avitoReplyPlan(decision: AdminDecision, settings: AvitoSettings, now: Date): AvitoReplyPlan | null {
  if (decision.direction !== 'GROOMING' || !decision.text || decision.purpose !== 'REPLY' || decision.handoff || decision.createInquiry
    || !['GROOMING_PRICE', 'GROOMING_PRICE_CLARIFY', 'GROOMING_CLARIFY', 'GROOMING_CARE_PREPARATION', 'PET_SERVICE_INFO', 'GREETING', 'COURTESY', 'ASSISTANT_IDENTITY', 'GROOMING_ADMINISTRATOR_HOURS'].includes(decision.reason)) return null;
  const state = decision.contact.groomingPriceContext, window = groomingAdministratorWindow(settings, now);
  const missingFields = state?.unlistedBreed ? [!state.weightKg && 'WEIGHT', !state.age && 'AGE'].filter((x): x is string => Boolean(x))
    : state?.awaiting ? [state.awaiting] : [];
  // Facts with business consequences remain exact server text. The model can
  // choose wording, order and transitions around them instead of selecting a template.
  const requiredBlocks = decision.text.split(/\n\n+/).filter(text => /₽|%|https?:\/\/|Адрес груминга:|Сейчас администратор|врач клиники|Если обработка уже/u.test(text))
    .map((text, index) => ({ id: `F${index}`, text }));
  const facts: AvitoReplyFacts = {
    approvedReply: decision.text,
    knownPet: { species: state?.species ?? decision.contact.petSpecies ?? null, breed: state?.unlistedBreed ?? (state?.breedRowIds?.length ? state.breedRowIds.join(', ') : null), weightKg: state?.weightKg ?? null, age: state?.age ?? decision.contact.petAge ?? null, service: state?.kind ?? null },
    missingFields,
    administrator: { working: window === 'WORKING', nextDay: window === 'WORKING' ? null : window.startsWith('сегодня') ? 'TODAY' : 'TOMORROW', opensAt: settings.administratorSchedule.opensAt, closesAt: settings.administratorSchedule.closesAt },
    requiredBlocks,
  };
  return { facts, sourceHash: createHash('sha256').update(JSON.stringify(facts)).digest('hex') };
}

/** Reject fabricated facts, repeated intake questions and unsupported promises.
 * Rejection uses the approved answer; it never suppresses a customer reply. */
export function renderAvitoModelReply(value: unknown, facts: AvitoReplyFacts): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'text') return null;
  const raw = (value as { text: unknown }).text;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2200) return null;
  let canonical = raw.trim();
  // A model can repeat a protected paragraph literally and by its marker.
  // Deduplicate that exact known paragraph; never alter an unverified fact.
  for (const block of facts.requiredBlocks) if (canonical.split(`{{${block.id}}}`).length === 2 && canonical.split(block.text).length === 2) canonical = canonical.replace(block.text, '').trim();
  let body = canonical;
  for (const block of facts.requiredBlocks) {
    const token = `{{${block.id}}}`;
    const tokens = body.split(token).length - 1, literals = body.split(block.text).length - 1;
    if (tokens + literals !== 1) return null;
    body = body.replace(tokens ? token : block.text, '');
  }
  // Repeating a supplied weight/age is harmless. It cannot authorize a price,
  // appointment time or any other number outside the approved fact blocks.
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  if (facts.knownPet.weightKg) body = body.replace(new RegExp(`(?<![\\d.,])${literal(facts.knownPet.weightKg)}\\s*кг(?=$|[^а-я])`, 'giu'), '');
  if (facts.knownPet.age) body = body.replace(new RegExp(`(?<!\\d)${literal(facts.knownPet.age)}(?=$|[^а-я])`, 'giu'), '');
  // Numbers, URLs, currency and discounts can only come from exact fact blocks.
  if (/[\d₽%]|https?:\/\/|www\.|\{\{/u.test(body)) return null;
  const t = body.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (/записал(?:и)?\s+вас|вы\s+записаны|запись\s+подтвержден|есть\s+свободн|свободн\S*\s+(?:мест|время|окн)|гарантир|вылеч|диагноз|дозиров/u.test(t)) return null;
  if (!facts.administrator.working && /(?:сейчас|сразу|немедленно).{0,45}(?:позвон|перезвон|администратор\S*\s+ответ)|(?:позвон|перезвон|администратор\S*\s+ответ).{0,35}(?:сейчас|сразу|немедленно)/u.test(t)) return null;
  const questions = body.split(/(?<=[.!])\s+|\n/u).filter(line => line.includes('?') || /подскажите|напишите|уточните|сообщите/iu.test(line)).join(' ').toLocaleLowerCase('ru-RU');
  if (facts.knownPet.species && /(?:кот|кош)[а-я]*.{0,15}(?:или|либо).{0,15}(?:собак|собач|пес)|(?:собак|собач|пес)[а-я]*.{0,15}(?:или|либо).{0,15}(?:кот|кош)|кого\s+(?:планируете|собираетесь|хотите)\s+привести|какой\s+(?:у\s+вас\s+)?питомец/u.test(questions)) return null;
  if (facts.knownPet.breed && /(?:какой|какая|какую|что\s+за).{0,35}пород|(?:напишите|уточните|подскажите).{0,30}пород/u.test(questions)) return null;
  if (facts.knownPet.weightKg && /сколько.{0,45}вес|какой.{0,35}вес|(?:уточните|подскажите).{0,35}вес/u.test(questions)) return null;
  if (facts.knownPet.age && /сколько.{0,45}(?:лет|месяц|год)|какой.{0,35}возраст|(?:уточните|подскажите).{0,35}возраст/u.test(questions)) return null;
  if (facts.missingFields.includes('WEIGHT') && !/вес/u.test(questions) || facts.missingFields.includes('AGE') && !/возраст|сколько.{0,20}(?:лет|месяц)/u.test(questions)) return null;
  if (facts.knownPet.breed && !facts.requiredBlocks.some(block => /₽|%/u.test(block.text)) && /стоим|цен/u.test(facts.approvedReply) && !/администратор/u.test(t)) return null;
  let rendered = canonical;
  for (const block of facts.requiredBlocks) rendered = rendered.replace(`{{${block.id}}}`, block.text);
  if (rendered.length > 3500) return null;
  return rendered;
}
