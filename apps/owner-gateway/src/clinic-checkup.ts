import data from './clinic-checkup-data.json';

type Species = 'cat' | 'dog';
type Laboratory = 'clinic' | 'invitro';
type Program = 'standard' | 'expanded';
type Selection = { species: Species | null; lab: Laboratory | null; program: Program | null; requested: boolean };
export type CheckupDraft = { revision: number; serviceQuery: string; preferredTimeText: string | null; checkup: Selection };
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
const title = (p: Program) => p === 'standard' ? 'стандартная' : 'расширенная';
export function checkupState(value: unknown): Selection | null {
  const state = (value as { checkup?: Selection } | null)?.checkup;
  return state && [null, 'cat', 'dog'].includes(state.species) && [null, 'clinic', 'invitro'].includes(state.lab)
    && [null, 'standard', 'expanded'].includes(state.program) && typeof state.requested === 'boolean' ? state : null;
}
// Remove only names of informational tests from the clinical-intent scan.
// Symptoms such as bleeding, vomiting or pain still follow the clinical path.
export function checkupSafetyText(text: string) {
  return text.replace(/анализ(?:ы|а|ов|у)?\s+крови|кровепаразитарн[а-яё]*/giu, 'исследование');
}
export function checkupSummary(value: unknown) {
  const state = checkupState(value);
  if (!state) return null;
  const animal = state.species === 'cat' ? 'кошка' : state.species === 'dog' ? 'собака' : 'питомец не уточнён';
  const program = state.program ? `${title(state.program)} программа` : 'программа не уточнена';
  const lab = state.lab ? `основные анализы ${state.lab === 'clinic' ? 'в клинике' : 'в Инвитро'}` : 'лаборатория не уточнена';
  const price = state.species && state.lab && state.program ? ` По акции ${money(data.prices[state.species][state.lab][state.program][1])}.` : '';
  return `Диспансеризация: ${animal}, ${program}, ${lab}.${price}`;
}
export function checkupOffersReply() {
  return `Есть программы диспансеризации кошек и собак: стандартная с основными анализами в клинике — ${money(data.prices.cat.clinic.standard[1])}, в Инвитро — ${money(data.prices.cat.invitro.standard[1])}. Есть расширенные программы. Также на сайте указаны акции на кастрацию и стерилизацию; их условия уточнит администратор. Программы диспансеризации: https://clinic.temichevvet.ru/offers#checkup-programs. Рассказать о программе для кошки или собаки?`;
}
export function checkupDialogue(text: string, previous: unknown, revision: number) {
  const q = text.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const prior = checkupState(previous);
  const explicit = /диспансеризац|чекап|check.?up/.test(q);
  const cat = /(?:^|[^а-я])(?:кошк[а-я]*|кошек|кот|кота|коту|котик[а-я]*|котен[а-я]*|котят[а-я]*)(?:$|[^а-я])/.test(q);
  const dog = /собак|щен|(?:^|[^а-я])пес(?:$|[^а-я])/.test(q);
  const followup = prior && (cat || dog || /стандарт|базов|расшир|инвитро|в клинике|в вашей клинике|что входит|какие.*инфекц|состав|профил|цен|стоим|сколько|подготов|срок|результат|отлич|запис|заявк|завтра|сегодня/.test(q) || /^(?:да|хочу|давайте|подходит)[.! ]*$/.test(q));
  if (!explicit && (!followup || /кастрац|стерилизац|вакцин|стоматолог|(?:на|сделать)\s+(?:узи|рентген)/.test(q))) return null;
  const state: Selection = { ...(prior || { species: null, lab: null, program: null, requested: false }) };
  if (cat !== dog) state.species = cat ? 'cat' : 'dog';
  if (/расшир/.test(q)) state.program = 'expanded';
  else if (/стандарт|базов/.test(q)) state.program = 'standard';
  if (/инвитро/.test(q)) state.lab = 'invitro';
  else if (/в (?:вашей )?клинике|анализы у вас/.test(q)) state.lab = 'clinic';
  const wantsBooking = /запис|оформ[а-я]*.*заявк|остав[а-я]*.*заявк/.test(q) || Boolean(prior && /^(?:да|хочу|давайте|подходит)[.! ]*$/.test(q));
  state.requested ||= wantsBooking;
  const before = previous as { preferredTimeText?: unknown } | null;
  const preferred = /(?:послезавтра|завтра|сегодня)(?:\s+(?:утром|днем|вечером))?/.exec(q)?.[0] || (typeof before?.preferredTimeText === 'string' ? before.preferredTimeText : null);
  const draft: CheckupDraft = { revision, serviceQuery: 'Диспансеризация', preferredTimeText: preferred, checkup: state };
  const lines: string[] = [];
  if (!state.species) {
    lines.push(`Стандартная диспансеризация для кошек и собак: ${money(data.prices.cat.clinic.standard[1])} с основными анализами в клинике или ${money(data.prices.cat.invitro.standard[1])} в Инвитро.`, `Входит: ${data.standardItems.join('; ')}.`, 'Есть расширенные программы: для кошек — FIV и FeLV, для собак — кровепаразитарный профиль. У вас кошка или собака?');
  } else if (!state.program) {
    const prices = data.prices[state.species];
    lines.push(`Для ${state.species === 'cat' ? 'кошки' : 'собаки'}:`, `Стандартная — ${money(prices.clinic.standard[1])} в клинике / ${money(prices.invitro.standard[1])} с анализами в Инвитро.`, `Расширенная — ${money(prices.clinic.expanded[1])} / ${money(prices.invitro.expanded[1])} соответственно: стандартный комплекс + ${data.profiles[state.species].title.toLocaleLowerCase('ru')}.`, 'Какая программа интересует: стандартная или расширенная?');
    if (/входит|состав/.test(q)) lines.splice(1, 0, `В стандартную входит: ${data.standardItems.join('; ')}.`);
  } else {
    const s = state.species, p = state.program;
    lines.push(`${state.species === 'cat' ? 'Для кошки' : 'Для собаки'} — ${title(p)} программа.`);
    if (state.lab) {
      const [regular, price] = data.prices[s][state.lab][p];
      lines.push(`По акции ${money(price)}. Обычная цена ${money(regular)}. Основные анализы крови ${state.lab === 'clinic' ? 'в клинике' : 'в Инвитро'}.`);
    } else lines.push(`Основные анализы в клинике — ${money(data.prices[s].clinic[p][1])}; в Инвитро — ${money(data.prices[s].invitro[p][1])}.`);
    lines.push(`Входит: ${data.standardItems.join('; ')}.`);
    if (p === 'expanded') {
      lines.push(`Дополнительно: ${data.profiles[s].title.toLocaleLowerCase('ru')}, выполняется в Инвитро и уже включён в цену.`);
      if (s === 'cat' || /инфекц|состав|входит|профил/.test(q)) lines.push(...data.profiles[s].items.map(item => `• ${item}`));
    }
    if (!state.lab) lines.push('Где удобнее выполнить основные анализы: в клинике или в Инвитро?');
    else if (!state.requested) lines.push('Помочь оставить заявку на эту программу?');
  }
  if (/подготов/.test(q)) lines.push('Подготовку к исследованиям согласует администратор перед визитом.');
  if (/срок|долго|результат/.test(q)) lines.push('ОАК в клинике — 30 минут; ОАК и биохимия в Инвитро — 2 суток. Срок расширенного инфекционного профиля уточнит администратор.');
  if (state.requested) lines.push('Для заявки нажмите «Оставить контакт для администратора»: нужны имя, телефон и согласие на обратную связь. Можно выбрать звонок или ответ здесь в чате. Время приёма подтвердит администратор.');
  return { draft, wantsBooking: state.requested, text: lines.join('\n\n') };
}
