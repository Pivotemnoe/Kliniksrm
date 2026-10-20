import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLINIC_ADMISSION_ANSWER, clinicPhoneText } from './avito-clinic-guidance';
import { canonicalClinicQuery, clinicServiceFamily, petSpecies, tariffInFamily } from './avito-service-query';
import { ClinicProgrammeTable, programmePriceAnswer } from './avito-programmes';

export type CrmQuestionKind = 'PRICE' | 'HOURS' | 'ADDRESS' | 'PHONE' | 'VACCINES' | 'SERVICE' | 'ADMISSION';
export type AvitoCrmQuestion = { kind: CrmQuestionKind; text: string; serviceQuery: string | null };
type PriceContext = { note: string; administratorWorking?: boolean; administratorSchedule?: { opensAt: string; closesAt: string }; programmeTable?: ClinicProgrammeTable; petSpecies?: 'CAT' | 'DOG' };
export type CrmAnswer = { text: string; reason: string; handoff: boolean; reconfirmNightContact?: boolean; nightContactIncluded?: boolean; administratorHoursExplained?: boolean };
export function crmQuestion(text: string): CrmQuestionKind | null {
  return crmQuestions(text)[0]?.kind ?? null;
}
export function crmQuestions(text: string): AvitoCrmQuestion[] {
  const questions: AvitoCrmQuestion[] = [];
  // Detect within each clause: "есть рентген" must not turn "вакцинацию" in another sentence into stock.
  for (const fragment of text.split(/[?!;\n]+|\.\s+(?=[А-ЯЁ])|\s+(?=и\s+(?:где|как|какой|какая|сколько|при[её]м))/iu).map(part => part.trim()).filter(Boolean)) {
    const value = normalize(fragment);
    const kinds: CrmQuestionKind[] = [];
    if (/вакцин(?:а|ы|у|е|ой|ами|ах)?(?=$|[\s:,.])/u.test(value) && /какие|какая|налич|есть|имеются/u.test(value)) kinds.push('VACCINES');
    if (/график|расписан|час[ыа] работы|время работы|до скольки|со скольки|когда (?:вы )?(?:работаете|открываетесь|закрываетесь)|когда.{0,60}(?:специалист|врач|узи|принимает)|(?:специалист|врач).{0,40}(?:принимает|работает)|работаете (?:ли|сегодня|завтра)|вы работаете|(?:можно|могу|можем).{0,25}(?:приехать|подъехать)|ночью.{0,50}работа|работа.{0,50}ночью|открыт/u.test(value)) kinds.push('HOURS');
    if (/(?:^|\s)адре(?:с[а-я]*)?(?=$|[\s,.])|как (?:к вам )?добраться|где (?:вы|находитесь)|местоположени/u.test(value)) kinds.push('ADDRESS');
    if (isAdmissionQuestion(value)) kinds.push('ADMISSION');
    if (/(?:ваш|клиники|контактный) (?:номер|телефон)|как (?:вам|в клинику) позвонить/u.test(value) || /номер телефона/u.test(value) && !/\d[\d\s().-]{8,}\d/u.test(value)) kinds.push('PHONE');
    if (/цен[аыуе]|стоимост|сколько.{0,25}сто|почем|прейскурант|прайс/u.test(value)) kinds.push('PRICE');
    if (!kinds.includes('PRICE') && clinicServiceFamily(fragment) && /сколько\s*$/u.test(value)) kinds.push('PRICE');
    if (/ночн.{0,15}тариф|какой.{0,20}тариф/u.test(value)) kinds.push('PRICE');
    if (!kinds.includes('VACCINES') && !kinds.includes('PRICE') && /делаете|проводите|оказываете|можно (?:сделать|пройти)|(?:есть|имеется|доступен|доступна).{0,40}(?:рентген|узи|вакцинац|прививк|стерилизац|кастрац|санаци|чистк|диспансер)|(?:рентген|узи|вакцинац|прививк).{0,30}(?:есть|делаете|делают)/u.test(value)) kinds.push('SERVICE');
    for (const kind of kinds) questions.push({ kind, text: fragment, serviceQuery: kind === 'HOURS' ? fragment.match(/рентген[а-яё]*|УЗИ|вакцинац[а-яё]*|стерилизац[а-яё]*|кастрац[а-яё]*/iu)?.[0] ?? null : null });
  }
  return questions.slice(0, 8);
}
export function avitoNeedsQuestionPlan(text: string, preliminaryReason: string) {
  if (['URGENT', 'MEDICAL', 'DIRECT_HUMAN_REQUEST', 'CONTACT_DECLINED', 'HUMAN_CONTROL', 'UNSUPPORTED_MEDIA', 'ASSISTANT_IDENTITY', 'GREETING'].includes(preliminaryReason)) return false;
  return ['NO_APPROVED_ANSWER', 'AMBIGUOUS_KNOWLEDGE'].includes(preliminaryReason) || crmQuestions(text).length > 0 || text.includes('?');
}
/* Kept as explicit per-clause planning rather than choosing the first matching keyword. */
function isArrivalQuestion(text: string) { return /(?:можно|могу|можем).{0,30}(?:приехать|подъехать)|(?:приехать|приехал|едем|приеду|приедем|подъехать).{0,20}(?:сейчас|сегодня|ночью)|ночью.{0,50}работа|работа.{0,50}ночью/u.test(normalize(text)); }
function isAdmissionQuestion(text: string) { return /что.{0,30}(?:взять|брать|привезти|нужно с собой)|какие.{0,25}документ|(?:вет)?паспорт|документ.{0,30}(?:прием|нуж|взять)/u.test(normalize(text)); }
function mergeQuestions(text: string, planned?: AvitoCrmQuestion[]) {
  const questions = (planned ?? []).filter(question => question.kind !== 'ADMISSION' || isAdmissionQuestion(question.text));
  for (const detected of crmQuestions(text)) if (!questions.some(question => question.kind === detected.kind && (['HOURS', 'ADDRESS', 'PHONE'].includes(question.kind) || normalize(detected.text).includes(normalize(question.text)) || normalize(question.text).includes(normalize(detected.text)) || question.serviceQuery && normalize(detected.text).includes(normalize(question.serviceQuery))))) questions.push(detected);
  const seen = new Set<string>();
  return questions.filter(question => {
    if (question.kind === 'SERVICE' && questions.some(other => other.kind === 'HOURS' && other.serviceQuery && other.serviceQuery === question.serviceQuery && normalize(other.text).includes(normalize(question.text)))) return false;
    const key = `${question.kind}:${normalize(question.serviceQuery ?? question.text)}`; if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 8);
}
@Injectable()
export class AvitoCrmKnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async clinicContact(organizationId: string, db: Prisma.TransactionClient = this.prisma, officeId?: string) {
    try {
      const offices = await db.clinicOffice.findMany({ where: { organizationId }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' }, take: 21 });
      if (offices.length > 20) return { phone: null, offices: [] };
      const candidates = officeId ? offices.filter(office => office.id === officeId) : offices;
      const phones = [...new Set(candidates.map(office => office.phone?.trim()).filter((phone): phone is string => Boolean(phone && /^\+?[\d\s()-]{10,32}$/.test(phone))))];
      return { phone: phones.length === 1 ? phones[0] : null, offices };
    } catch { return { phone: null, offices: [] }; }
  }

  withListingContext(text: string, serviceQuery?: string) {
    if (serviceQuery && /вакцин/i.test(serviceQuery) && !crmQuestions(text).length && /(?:^|[\s.,!?])(?:есть|наличии|имеется|имеются)(?=$|[\s.,!?])/u.test(normalize(text))) return `Наличие вакцин: ${text}`;
    return serviceQuery && crmQuestion(text) === 'PRICE' && words(text).length === 0 ? `Стоимость ${serviceQuery}` : text;
  }

  async answer(organizationId: string, text: string, db: Prisma.TransactionClient = this.prisma, serviceQuery?: string, officeId?: string, planned?: AvitoCrmQuestion[], pricing?: PriceContext): Promise<CrmAnswer | null> {
    const questions = mergeQuestions(text, planned).map(question => question.kind === 'PRICE' && !question.serviceQuery && serviceQuery && words(question.text).length === 0 ? { ...question, serviceQuery } : question);
    if (!questions.length) return null;
    const answers: CrmAnswer[] = [];
    for (const question of questions) {
      if (question.kind === 'PRICE' && /тариф/u.test(normalize(question.text)) && pricing?.note) { answers.push({ text: pricing.note, reason: 'CLINIC_NIGHT_TARIFF', handoff: false }); continue; }
      const query = question.kind === 'PRICE' ? `Стоимость ${question.serviceQuery ?? question.text}` : question.kind === 'HOURS' ? question.text : question.serviceQuery ?? question.text;
      if (question.kind === 'PRICE' && pricing?.programmeTable && (clinicServiceFamily(query) === 'CHECKUP' || clinicServiceFamily(serviceQuery ?? '') === 'CHECKUP' && !clinicServiceFamily(query))) {
        answers.push(programmePriceAnswer(`${query} ${text}`, pricing.programmeTable, pricing.petSpecies)); continue;
      }
      const answer = await this.answerQuestion(organizationId, question.kind, query, db, officeId, pricing, question.serviceQuery);
      if (answer) answers.push(answer);
    }
    if (!answers.length) return null;
    let reply = [...new Set(answers.map(answer => answer.text))].join('\n');
    let nightContactIncluded = answers.some(answer => answer.nightContactIncluded);
    const needsClarification = answers.some(answer => answer.handoff);
    if (pricing?.administratorWorking === false && needsClarification) {
      const contact = await this.clinicContact(organizationId, db, officeId);
      reply += contact.phone ? `\nЭтот вопрос уточните у дежурного врача по телефону ${clinicPhoneText(contact.phone)}.` : '\nПроверенный номер клиники сейчас недоступен.';
      nightContactIncluded = Boolean(contact.phone);
    }
    return { text: `${reply}${pricing?.note && !reply.includes(pricing.note) && (reply.includes('₽') || isArrivalQuestion(text)) ? `\n${pricing.note}` : ''}`, reason: answers.length === 1 ? answers[0].reason : 'CRM_MULTIPLE_QUESTIONS', handoff: needsClarification, ...(isArrivalQuestion(text) ? { reconfirmNightContact: true } : {}), ...(nightContactIncluded ? { nightContactIncluded: true } : {}), ...(answers.some(answer => answer.administratorHoursExplained) ? { administratorHoursExplained: true } : {}) };
  }

  private async answerQuestion(organizationId: string, kind: CrmQuestionKind, text: string, db: Prisma.TransactionClient, officeId?: string, pricing?: PriceContext, scopedService?: string | null): Promise<CrmAnswer | null> {
    try {
      if (kind === 'ADMISSION') return { text: CLINIC_ADMISSION_ANSWER, reason: 'CLINIC_ADMISSION', handoff: false };
      const offHours = pricing?.administratorWorking === false;
      const scheduleQuery = normalize(`${text} ${scopedService ?? ''}`);
      const referencedSpecialist = /специалист|врач|узист|кардиолог|хирург|офтальмолог|дерматолог|невролог/u.test(normalize(scopedService ?? ''));
      if (kind === 'HOURS' && (referencedSpecialist || /когда|дни|расписан|график|принимает|работает/u.test(normalize(text)) && /специалист|врач|узист|узи|кардиолог|хирург|офтальмолог|дерматолог|невролог/u.test(scheduleQuery))) {
        const subject = /узи|узист/u.test(scheduleQuery) ? 'специалиста УЗИ' : 'специалистов';
        const schedule = pricing?.administratorSchedule ?? { opensAt: '09:00', closesAt: '19:00' };
        let reply = `Расписание ${subject} можно уточнить у администратора с ${schedule.opensAt} до ${schedule.closesAt}.`;
        const contact = offHours ? await this.clinicContact(organizationId, db, officeId) : null;
        if (offHours) reply += contact?.phone ? ` Если хотите приехать сейчас, позвоните дежурному врачу: ${clinicPhoneText(contact.phone)}.` : ' Проверенный номер клиники сейчас недоступен.';
        return { text: reply, reason: 'CRM_SPECIALIST_SCHEDULE', handoff: offHours && !contact?.phone, nightContactIncluded: offHours && Boolean(contact?.phone), administratorHoursExplained: true };
      }
      const procedureSubject = scopedService && clinicServiceFamily(scopedService);
      if (kind === 'HOURS' && (procedureSubject || pricing?.administratorWorking === false || /ноч[а-яё]*/u.test(normalize(text)))) {
        const night = pricing?.administratorWorking === false || /ноч[а-яё]*/u.test(normalize(text));
        const contact = await this.clinicContact(organizationId, db, officeId);
        const procedure = scopedService && /рентген/iu.test(scopedService) ? 'сделать рентген' : scopedService && /узи/iu.test(scopedService) ? 'сделать УЗИ' : 'провести нужную процедуру';
        let hours = '';
        if (!procedureSubject) {
          const offices = await db.clinicOffice.findMany({ where: { organizationId, ...(officeId ? { id: officeId } : {}) }, select: { workingHours: true }, take: 2 });
          if (offices.length === 1) { const schedule = officeHours(offices[0].workingHours); hours = schedule === 'круглосуточно, ежедневно' ? 'Клиника работает круглосуточно. ' : `График работы: ${schedule}. `; }
        }
        if (night) return { text: `${hours}Возможность ${procedure} ночью уточните у дежурного врача${contact.phone ? ` по телефону ${clinicPhoneText(contact.phone)}` : '. Проверенный номер клиники сейчас недоступен'}.`, reason: 'CRM_SERVICE_HOURS', handoff: !contact.phone, nightContactIncluded: Boolean(contact.phone) };
        if (procedureSubject) return { text: `Возможность ${procedure} в нужное время уточнит администратор${contact.phone ? ` по телефону ${clinicPhoneText(contact.phone)}` : ''}.`, reason: 'CRM_SERVICE_HOURS', handoff: false };
      }
      if (kind === 'VACCINES') return vaccineAnswer(text, await this.vaccineAvailability(organizationId, db, officeId), offHours);
      if (kind === 'PRICE' || kind === 'SERVICE') {
        // Only client-facing tariff fields. No stock cost, margins, owners, doctors or slots.
        const services = await db.service.findMany({ where: { isActive: true }, select: {
          id: true, title: true, priceType: true, price: true, minimumPrice: true, maximumPrice: true,
        }, orderBy: { id: 'asc' }, take: 5001 });
        if (services.length > 5000) return unavailable(offHours);
        return kind === 'PRICE' ? priceAnswer(text, services, offHours) : serviceAnswer(text, services, offHours);
      }
      const offices = await db.clinicOffice.findMany({ where: { organizationId, ...(officeId ? { id: officeId } : {}) }, select: {
        id: true, name: true, address: true, phone: true, timezone: true, workingHours: true,
      }, orderBy: { name: 'asc' }, take: 21 });
      if (!offices.length || offices.length > 20) return unavailable(offHours);
      if (kind === 'HOURS' && isArrivalQuestion(text) && offices.length === 1 && officeHours(offices[0].workingHours) === 'круглосуточно, ежедневно') return { text: 'Клиника работает круглосуточно.', reason: 'CRM_HOURS', handoff: false };
      if (kind === 'HOURS' && offices.length === 1 && officeHours(offices[0].workingHours) === 'круглосуточно, ежедневно') return { text: 'Работаем круглосуточно, ежедневно.', reason: 'CRM_HOURS', handoff: false };
      const lines = offices.map(office => {
        const details = kind === 'HOURS' ? officeHours(office.workingHours) : kind === 'ADDRESS' ? office.address?.trim() : office.phone?.trim();
        // Office names are internal CRM labels, not a public hierarchy of clinics.
        return `${kind === 'PHONE' && details ? clinicPhoneText(details) : details || 'сведения сейчас недоступны'}${kind === 'HOURS' ? ` (${office.timezone === 'Europe/Moscow' ? 'по московскому времени' : office.timezone})` : ''}`;
      });
      const label = kind === 'HOURS' ? 'График работы' : kind === 'ADDRESS' ? offices.length === 1 ? 'Наш адрес' : 'Наши адреса' : 'Телефон для связи';
      return { text: `${label}: ${[...new Set(lines)].join('\n')}${kind === 'HOURS' && !offHours ? '\nВозможность и время приёма уточнит администратор.' : ''}`, reason: `CRM_${kind}`, handoff: false };
    } catch {
      // Never replace unavailable live facts with a copied FAQ or UI's default hours.
      return unavailable(pricing?.administratorWorking === false);
    }
  }

  async vaccineAvailability(organizationId: string, db: Prisma.TransactionClient = this.prisma, officeId?: string): Promise<VaccineAvailability[] | null> {
    const offices = await db.clinicOffice.findMany({ where: { organizationId, ...(officeId ? { id: officeId } : {}) }, select: { id: true }, take: 2 });
    if (offices.length !== 1) return null;
    const products = await db.product.findMany({
      where: { isActive: true, category: { title: { equals: 'Вакцины', mode: 'insensitive' } } },
      select: { id: true, title: true, batches: {
        // CRM owns stock validity. Avito uses its available balance without another expiry check.
        where: { warehouse: { officeId: offices[0].id }, rest: { gt: 0 } },
        select: { id: true }, take: 1,
      } }, orderBy: { title: 'asc' }, take: 51,
    });
    if (products.length > 50) return null;
    return products.map(product => ({ id: product.id, title: product.title, status: product.batches.length ? 'AVAILABLE' : 'NOT_AVAILABLE' }));
  }
}

export type VaccineAvailability = { id: string; title: string; status: 'AVAILABLE' | 'NOT_AVAILABLE' };
export function vaccineAnswer(text: string, rows: VaccineAvailability[] | null, offHours = false): CrmAnswer {
  if (!rows?.length) return { text: offHours ? 'Сейчас не могу точно подсказать наличие вакцин.' : 'Наличие вакцин сейчас уточнит администратор. Могу передать ему ваш вопрос.', reason: 'CRM_VACCINES_UNAVAILABLE', handoff: true };
  const query = words(text).filter(word => !/^(?:вакцин|налич|имеют|имеет|коше|кошк|собак)/.test(word));
  const selected = query.length ? rows.filter(row => query.every(word => words(row.title).some(token => matches(word, token)))) : rows;
  if (!selected.length) return { text: offHours ? 'Наличие этой вакцины сейчас не могу подтвердить.' : 'Наличие этой вакцины уточнит администратор. Могу передать ему ваш вопрос.', reason: 'CRM_VACCINE_NOT_FOUND', handoff: true };
  const available = selected.filter(row => row.status === 'AVAILABLE');
  if (!available.length) return { text: `Наличие этой вакцины сейчас не подтверждено.${offHours ? '' : ' Уточню у администратора.'}`, reason: 'CRM_VACCINES_CHECK', handoff: true };
  return { text: `Сейчас в наличии: ${available.slice(0, 15).map(row => row.title).join('; ')}${available.length > 15 ? ' и другие' : ''}. Подходящую вакцину и возможность вакцинации определяет врач.`, reason: 'CRM_VACCINES', handoff: false };
}

type Tariff = { title: string; priceType: string; price: unknown; minimumPrice: unknown; maximumPrice: unknown };
const normalize = (text: string) => text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const stopWords = new Set('сколько стоит стоить стоимость цена цены цену цене прайс прейскурант почем подскажите пожалуйста скажите узнать какая какой какие какой-то это будет мне можно у вы вас ли есть услуга услуги услугу для на за по а и с к в во сделать делаете делать проводите проводить оказываете пройти имеется доступны доступна доступен здравствуйте здравствуй привет приветствую здраствуйте добрый доброе доброго день дня вечер вечера утро утра сейчас примерно ориентировочно спасибо благодарю да хочу записаться запишите запись мой номер телефон телефона связи по направлению направление'.split(' '));
function words(value: string) {
  const query = canonicalClinicQuery(value).replace(/(?:меня\s+зовут|имя\s*[:—-])\s*[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29}(?:\s+[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29})?/giu, '').replace(/(?:\+?7|8)?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/gu, '');
  return normalize(query).match(/[а-яa-z0-9]+/g)?.filter(word => word.length > 1 && !stopWords.has(word)) ?? [];
}
function matches(left: string, right: string) { return left === right || Math.min(left.length, right.length) >= 4 && left.slice(0, 4) === right.slice(0, 4); }
function matchingTariffs(text: string, services: Tariff[]) {
  const family = clinicServiceFamily(text), species = petSpecies(text);
  const query = words(text).filter(word => !species || petSpecies(word) === null);
  return { family, species, query, candidates: services.filter(service => {
    if (family && !tariffInFamily(service.title, family)) return false;
    if (species && family !== 'XRAY' && family !== 'ULTRASOUND' && family !== 'VISIT' && petSpecies(service.title) !== species) return false;
    const title = words(service.title);
    if (tariffInFamily(service.title, 'ULTRASOUND')) title.push('узи');
    return query.length > 0 && query.every(word => title.some(token => matches(word, token)));
  }) };
}
function serviceAnswer(text: string, services: Tariff[], offHours = false): CrmAnswer {
  const { query, candidates, family } = matchingTariffs(text, services);
  if (!candidates.length) return { text: offHours ? 'Возможность этой услуги сейчас не могу подтвердить.' : 'Возможность этой услуги уточнит администратор. Могу передать ему ваш вопрос.', reason: 'CRM_SERVICE_NOT_CONFIRMED', handoff: true };
  if (family === 'VACCINE') return { text: 'Вакцинацию проводим.', reason: 'CRM_SERVICE', handoff: false };
  if (query.length === 1 && /^рентг/u.test(query[0])) return { text: 'Рентген в клинике есть.', reason: 'CRM_SERVICE', handoff: false };
  const exact = candidates.find(service => words(service.title).length === query.length) ?? candidates[0];
  return { text: `Услуга «${exact.title}» есть в клинике.`, reason: 'CRM_SERVICE', handoff: false };
}
function priceAnswer(text: string, services: Tariff[], offHours = false): CrmAnswer {
  const { query, family, species, candidates: matched } = matchingTariffs(text, services);
  if (!query.length) return { text: 'Стоимость какой услуги вас интересует?', reason: 'CRM_PRICE_CLARIFY', handoff: false };
  if (family === 'SURGERY' && /стерилизац/iu.test(text) && /кастрац/iu.test(text)) return { text: 'Стоимость зависит от операции и питомца. У вас кошка, кот или собака?', reason: 'CRM_PRICE_CLARIFY', handoff: false };
  let candidates = matched;
  if (family === 'VACCINE' && !species && candidates.length > 1) return { text: 'Для кошки или собаки нужна прививка? Стоимость в прайсе зависит от препарата.', reason: 'CRM_PRICE_CLARIFY', handoff: false };
  if (family === 'VACCINE' && candidates.some(service => servicePrice(service))) candidates = candidates.filter(service => servicePrice(service));
  if (family === 'ULTRASOUND' && query.length === 1) {
    const standard = candidates.filter(service => /^узи(?: обзорное)?$/u.test(normalize(service.title)));
    if (standard.length) candidates = standard;
  }
  if (family === 'XRAY' && candidates.length > 1 && candidates.every(service => /^рентген(?: \d+)?$/u.test(normalize(service.title))) && candidates.every(service => service.priceType === 'FIXED' && servicePrice(service))) {
    const prices = candidates.map(service => Number(service.price));
    return { text: `Рентген по прайсу — от ${formatMoney(Math.min(...prices))} до ${formatMoney(Math.max(...prices))} ₽. Если есть направление, напишите, какое исследование в нём указано.`, reason: 'CRM_PRICE_AMBIGUOUS', handoff: false };
  }
  if (family === 'DENTAL' && candidates.length && candidates.every(service => servicePrice(service))) {
    const lines = candidates.map(service => `Чистка зубов ${petSpecies(service.title) === 'CAT' ? 'кошке' : 'собаке'} — ${servicePrice(service)}`);
    return { text: `${lines.join('; ')}. Объём процедуры и окончательную стоимость определит врач после осмотра.${!species ? ' У вас кошка или собака?' : ''}`, reason: candidates.length === 1 ? 'CRM_PRICE' : 'CRM_PRICE_AMBIGUOUS', handoff: false };
  }
  if (query.every(word => /^прием|^врач/u.test(word)) && query.some(word => /^прием/u.test(word))) {
    const appointmentTypes = candidates.filter(service => /^(?:первичн|повторн).*прием|^прием/u.test(normalize(service.title)));
    if (appointmentTypes.length) candidates = appointmentTypes;
  }
  if (!candidates.length) return { text: offHours ? 'Сейчас не могу точно назвать стоимость этой услуги.' : 'Стоимость этой услуги уточнит администратор. Могу передать ему ваш вопрос — продолжим здесь или оставим заявку на звонок?', reason: 'CRM_PRICE_NOT_FOUND', handoff: true };
  if (candidates.length > 1) return { text: `Есть несколько вариантов:\n${candidates.slice(0, 5).map(service => `«${service.title}»${servicePrice(service) ? ` — ${servicePrice(service)}` : offHours ? ' — стоимость нужно уточнить' : ' — стоимость уточнит администратор'}`).join(';\n')}${candidates.length > 5 ? '; есть и другие варианты' : ''}.\nПодскажите, пожалуйста, какой вас интересует?`, reason: 'CRM_PRICE_AMBIGUOUS', handoff: false };
  const service = candidates[0];
  const price = servicePrice(service);
  return { text: price ? `«${service.title}» — ${price}.`
    : offHours ? `Стоимость услуги «${service.title}» сейчас нужно уточнить.` : `По услуге «${service.title}» стоимость уточнит администратор. Если хотите, передам ему заявку.`, reason: 'CRM_PRICE', handoff: price === null };
}
function servicePrice(service: Tariff) {
  const low = money(service.minimumPrice); const high = money(service.maximumPrice); const fixed = money(service.price);
  // Zero is the CRM default for an unfilled tariff, not evidence of a free procedure.
  return service.priceType === 'FIXED' && fixed !== null && fixed > 0 ? `${formatMoney(fixed)} ₽`
    : service.priceType === 'FLOATING' && low !== null && low > 0 && high !== null && high >= low ? low === high ? `${formatMoney(low)} ₽` : `от ${formatMoney(low)} до ${formatMoney(high)} ₽` : null;
}
function money(value: unknown) { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 9999999999.99 ? Math.round(n * 100) / 100 : null; }
const formatMoney = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
function unavailable(offHours = false): CrmAnswer { return { text: offHours ? 'Сейчас не могу точно подсказать по этому вопросу.' : 'Уточню этот вопрос у администратора, чтобы подсказать точно. Можем продолжить здесь или оставить заявку на обратную связь.', reason: 'CRM_UNAVAILABLE', handoff: true }; }
const days = [['monday', 'Пн'], ['tuesday', 'Вт'], ['wednesday', 'Ср'], ['thursday', 'Чт'], ['friday', 'Пт'], ['saturday', 'Сб'], ['sunday', 'Вс']];
function officeHours(raw: unknown) {
  const hours = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const time = (value: unknown): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (days.every(([key]) => hours[key]?.isWorking === true && hours[key]?.is24Hours === true)) return 'круглосуточно, ежедневно';
  return days.map(([key, title]) => {
    const day = hours[key];
    if (day?.isWorking === false) return `${title} — выходной`;
    if (day?.isWorking !== true) return `${title} — не указан`;
    if (day.is24Hours === true) return `${title} — круглосуточно`;
    if (!time(day.opensAt) || !time(day.closesAt)) return `${title} — не указан`;
    const pause = time(day.breakStart) && time(day.breakEnd) ? `, перерыв ${day.breakStart}–${day.breakEnd}` : '';
    return `${title} — ${day.opensAt}–${day.closesAt}${day.closesAt < day.opensAt ? ' следующего дня' : ''}${pause}`;
  }).join('; ');
}
