// Approved by the clinic owner. These are admission rules, not medical advice.
export const CLINIC_ADMISSION_ANSWER = 'Если есть ветпаспорт питомца, возьмите его с собой. Если паспорта нет, всё равно можно приехать на приём.';

export function clinicPhoneText(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return /^[78]\d{10}$/.test(digits) ? `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}` : phone;
}

export function clinicUrgency(text: string) {
  const value = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (/(?:не\s+дышит|задыхается|судорог|потерял[аи]?\s+сознание|сильн\S*\s+кровотеч|не\s+может\s+(?:помочиться|пописать)|не\s+писает|моча\s+не\s+идет)/u.test(value)) return true;
  // Route current complaints immediately, without turning a denial or old history
  // ("рвоты нет", "была год назад") into a new emergency or a treatment suggestion.
  return value.split(/[.!?;\n]|,\s*(?:но|а|зато)\s*/u).some(clause => {
    if (/(?:год|месяц|неделю|лет)\s+назад|в\s+прошлом\s+(?:году|месяце)|раньше|когда-то/u.test(clause) && !/сейчас|снова|опять/u.test(clause)) return false;
    const symptoms = /рвот[а-я]*|рвет|вырвало|тошнит|понос[а-я]*|диаре[а-я]*|травм(?:а|ы|у|е|ой|ами|ах)?(?=$|\s|[,.:])|ран(?:а|ы|у|е|ой)(?=$|\s|[,.:])|кровотеч[а-я]*|сбит[а-я]*|сбила\s+машина|сбил\s+автомобиль|упал[аи]?\s+с\s+(?:высоты|окна|балкона)/gu;
    for (const match of clause.matchAll(symptoms)) {
      const before = clause.slice(0, match.index);
      const after = clause.slice(match.index! + match[0].length);
      const deniedBefore = /(?:нет|без|не\s+было|не\s+наблюдается)\s+(?:(?:рвоты|поноса|травм|диареи)\s*(?:и|или|,)\s*)?$/u.test(before) || /не\s+$/u.test(before);
      const deniedAfter = /^(?:\s*(?:и|или|,)\s*(?:рвоты|поноса|травм|диареи))?\s+(?:нет|не\s+было|не\s+наблюдается)(?=$|\s|[,.:])/u.test(after);
      if (!deniedBefore && !deniedAfter) return true;
    }
    return false;
  });
}

/** A denial/past history is not an active complaint in the fallback classifier. */
export function currentMedicalText(text: string) {
  return text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').split(/(?<=[.!?;])|,\s*(?:но|зато)\s*/u).map(clause => {
    if (/(?:год|месяц|неделю|лет)\s+назад|в\s+прошлом\s+(?:году|месяце)|раньше|когда-то/u.test(clause) && !/сейчас|снова|опять/u.test(clause)) return '';
    return clause.replace(/(?:рвот[а-я]*|понос[а-я]*|диаре[а-я]*|травм[а-я]*)(?:\s*(?:и|или|,)\s*(?:рвот[а-я]*|понос[а-я]*|диаре[а-я]*|травм[а-я]*))*\s+(?:нет|не было|не наблюдается)/gu, '')
      .replace(/(?:нет|без|не было|не наблюдается)\s+(?:рвот[а-я]*|понос[а-я]*|диаре[а-я]*|травм[а-я]*)(?:\s*(?:и|или|,)\s*(?:рвот[а-я]*|понос[а-я]*|диаре[а-я]*|травм[а-я]*))*/gu, '');
  }).join(' ');
}
