export function clinicSafetyIntent(text: string): 'HUMAN' | 'CLINICAL' | 'OTHER' | null {
  const value = text.toLocaleLowerCase('ru');
  if (/игнорируй|обойди.*правил|системн.*(?:инструкц|администратор)|секретн.*ключ|api.?ключ/i.test(value)) return 'OTHER';
  if (/доз|антибиот|лекарств|обезбол|рвот|рв[её]т|понос|кров|судорог|задых|диагноз|симптом|болит|боль|не ест|лечить|что (?:дать|давать)|после (?:привив|вакцин)/.test(value)) return 'CLINICAL';
  if (/администратор|человек|оператор|перен[ео]с|отмен|жалоб/.test(value)) return 'HUMAN';
  return null;
}
export function clinicChatReply(text: string, facts: { address?: string; hours?: string; phone?: string } = {}) {
  const normalized = text.toLocaleLowerCase('ru');
  const safety = clinicSafetyIntent(text);
  if (safety === 'HUMAN') return { human: true, text: 'Передаю обращение администратору. Ответ появится здесь.' };
  if (safety === 'CLINICAL') return { human: true, text: 'Этот вопрос передам администратору. Диагноз и назначения определяет врач на приёме. При тяжёлом состоянии питомца обратитесь в клинику сразу.' };
  if (safety === 'OTHER') return { human: true, text: 'Этот вопрос передам администратору. Ответ появится здесь.' };
  if (/запис|хочу (?:на |сделать )?(?:при[её]м|вакцин|привив)|нужна (?:вакцин|привив)/.test(normalized)) return { human: false, intake: true, text: 'Для заявки укажите имя, телефон, питомца, причину и удобное время в форме ниже. Время подтвердит администратор.' };
  if (/адрес|где|добрат/.test(normalized) && facts.address) return { human: false, text: facts.address };
  if (/режим|час|открыт|работаете/.test(normalized) && facts.hours) return { human: false, text: facts.hours };
  if (/телефон|позвон/.test(normalized) && facts.phone) return { human: false, text: facts.phone };
  if (/привет|здравств|добрый/.test(normalized)) return { human: false, text: 'Здравствуйте! Помогу оставить заявку на приём или передать вопрос администратору.' };
  return { human: true, text: 'Этот вопрос передам администратору. Ответ появится здесь. Диагноз и назначения определяет врач на приёме.' };
}

// Model output selects a reviewed reply. It cannot provide facts or confirm a slot.
export function clinicIntentReply(intent: string, facts: { address?: string; hours?: string; phone?: string } = {}) {
  const query: Record<string, string> = { GREETING: 'Здравствуйте', ADDRESS: 'адрес', HOURS: 'режим работы', PHONE: 'телефон', BOOKING: 'записаться', HUMAN: 'администратор', CLINICAL: 'лекарства' };
  return clinicChatReply(query[intent] || 'Неизвестный вопрос', facts);
}
