import { checkupOffersReply } from './clinic-checkup';

export function clinicSafetyIntent(text: string): 'HUMAN' | 'CLINICAL' | 'OTHER' | null {
  const value = text.toLocaleLowerCase('ru');
  if (/игнорируй|обойди.*правил|системн.*(?:инструкц|администратор)|секретн.*ключ|api.?ключ/i.test(value)) return 'OTHER';
  if (/доз|антибиот|лекарств|обезбол|рвот|рв[её]т|понос|кров|судорог|задых|диагноз|симптом|болит|боль|не ест|лечить|что (?:дать|давать)|после (?:привив|вакцин)/.test(value)) return 'CLINICAL';
  if (/администратор|человек|оператор|перен[ео]с|отмен|жалоб/.test(value)) return 'HUMAN';
  return null;
}

// A chat session by itself is not a way for the clinic to contact its visitor.
// In particular, a MAX chat link without an owner record is not registration.
export function hasClinicReplyContact(row: {
  contactConsent?: boolean | null;
  phone?: string | null;
  ownerId?: string | null;
  maxUserId?: string | null;
}) {
  return Boolean((row.contactConsent && row.phone) || (row.ownerId && (row.phone || row.maxUserId)));
}

export function clinicContactRequiredReply(intent: 'HUMAN' | 'CLINICAL' | 'OTHER' | null = null) {
  const opening = intent === 'CLINICAL'
    ? 'По симптомам нельзя безопасно поставить диагноз или назначить лечение в чате. Если питомцу сейчас плохо, сразу позвоните в клинику.'
    : 'Я могу ответить на общие вопросы здесь.';
  return `${opening} Чтобы администратор смог связаться с вами по обращению, оставьте телефон в форме чата и подтвердите согласие на обратную связь. Без контакта обращение сотруднику не передаётся.`;
}

// These are the only offers currently described on the public site. No
// discount, fixed package or price is implied by this answer.
export function clinicOffersReply() {
  return checkupOffersReply();
}

export function isClinicOffersQuestion(text: string) {
  return !clinicSafetyIntent(text) && /(?:^|[^а-яёa-z])(?:акци|спецпредлож|диспансеризац)/i.test(text);
}
export function clinicChatReply(text: string, facts: { address?: string; hours?: string; phone?: string } = {}) {
  const normalized = text.toLocaleLowerCase('ru');
  const safety = clinicSafetyIntent(text);
  if (safety === 'HUMAN') return { human: true, text: 'Передаю обращение администратору. Ответ появится здесь.' };
  if (safety === 'CLINICAL') return { human: true, text: 'Этот вопрос передам администратору. Диагноз и назначения определяет врач на приёме. При тяжёлом состоянии питомца обратитесь в клинику сразу.' };
  if (safety === 'OTHER') return { human: true, text: 'Этот вопрос передам администратору. Ответ появится здесь.' };
  if (isClinicOffersQuestion(text)) return { human: false, text: clinicOffersReply() };
  if (/запис|хочу (?:на |сделать )?(?:при[её]м|вакцин|привив)|нужна (?:вакцин|привив)/.test(normalized)) return { human: false, intake: true, text: 'Поможем с записью. Опишите, что нужно питомцу и когда вам удобно. Время приёма отдельно подтвердит администратор.' };
  if (/адрес|где|добрат/.test(normalized) && facts.address) return { human: false, text: facts.address };
  if (/режим|час|открыт|работаете/.test(normalized) && facts.hours) return { human: false, text: facts.hours };
  if (/телефон|позвон/.test(normalized) && facts.phone) return { human: false, text: facts.phone };
  if (/привет|здравств|добрый/.test(normalized)) return { human: false, text: 'Здравствуйте! Помогу оставить заявку на приём или передать вопрос администратору.' };
  return { human: true, text: 'Этот вопрос передам администратору. Ответ появится здесь. Диагноз и назначения определяет врач на приёме.' };
}

// Model output selects a reviewed reply. It cannot provide facts or confirm a slot.
export function clinicIntentReply(intent: string, facts: { address?: string; hours?: string; phone?: string } = {}) {
  const query: Record<string, string> = { GREETING: 'Здравствуйте', ADDRESS: 'адрес', HOURS: 'режим работы', PHONE: 'телефон', OFFERS: 'акции', BOOKING: 'записаться', HUMAN: 'администратор', CLINICAL: 'лекарства' };
  return clinicChatReply(query[intent] || 'Неизвестный вопрос', facts);
}
