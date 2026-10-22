import { normalizePhoneForLookup } from '../../common/phone';
import { AvitoSettings, Direction, effectivePrompt } from './avito.settings';
import { CrmAnswer, crmQuestion } from './avito-crm-knowledge.service';
import type { AvitoModelIntent } from './avito-model-gateway.client';
import { administratorWorking, dutyDoctorReply, groomingAdministratorNotice, groomingAdministratorWindow, groomingReplyWithHours, nightNotice, submittedReply } from './avito-availability';
import { clinicPhoneText, clinicUrgency, currentMedicalText } from './avito-clinic-guidance';
import { petSpecies } from './avito-service-query';
import { petServiceAnswer, PetServiceContext } from './avito-pet-services';
import { groomingPriceAnswer, withGroomingPricePrefix, type GroomingPriceContext } from './avito-grooming-prices';

export type ContactState = { groomingPriceContext?: GroomingPriceContext; bookingChoiceOffered?: boolean; bookingChannel?: 'WEBSITE' | 'CALLBACK'; name?: string; phone?: string; callbackAt?: string; callbackMessageId?: string; collecting?: boolean; reason?: string; summary?: string; serviceQuestionAsked?: boolean; awaitingServiceDetails?: boolean; serviceDetails?: string; petSpecies?: 'CAT' | 'DOG'; petAge?: string; petSexKnown?: boolean; referralKnown?: boolean };
export type AdminDecision = { text: string | null; purpose: 'REPLY' | 'CRM_REPLY' | 'CONTACT' | 'SUBMITTED'; handoff: boolean; needsAttention?: boolean; createInquiry: boolean; direction: Direction | null; reason: string; contact: ContactState; prompt?: string; petServiceBooking?: boolean; petServiceChannel?: 'WEBSITE'; groomingPriceFingerprint?: string; groomingPricePrefix?: string };
type DecisionInput = { settings: AvitoSettings; listingId: string | null; text: string; messageId: string; contact?: ContactState; mode?: string; mediaType?: string; now?: Date; crmAnswer?: CrmAnswer | null; intent?: AvitoModelIntent | null; clinicPhone?: string | null; nightNoticeDelivered?: boolean; skipAvailability?: boolean; petService?: PetServiceContext };
export function decideAvitoReply(input: DecisionInput): AdminDecision {
  let decision = applyGroomingPrice(input, decideCore(input));
  const finishGrooming = (d: AdminDecision) => ({ ...d, text: withGroomingPricePrefix(d.groomingPricePrefix, d.text) });
  if (!input.skipAvailability && decision.text && decision.direction === 'GROOMING' && !['URGENT', 'GROOMING_ADMINISTRATOR_HOURS'].includes(decision.reason)) {
    const window = groomingAdministratorWindow(input.settings, input.now);
    if (decision.purpose === 'SUBMITTED') return finishGrooming({ ...decision, text: window === 'WORKING'
      ? `Передал заявку администратору груминга. Он на связи с ${input.settings.administratorSchedule.opensAt} до ${input.settings.administratorSchedule.closesAt}, свяжется с вами и согласует запись. Запись пока не подтверждена.`
      : `Заявку сохранил для администратора груминга. ${groomingAdministratorNotice(input.settings, input.now)} Он свяжется с вами по указанному номеру и согласует запись. Запись пока не подтверждена.` });
    if (window !== 'WORKING' && ['DIRECT_HUMAN_REQUEST', 'CONTACT_DECLINED', 'UNSUPPORTED_MEDIA', 'NO_APPROVED_ANSWER', 'AMBIGUOUS_KNOWLEDGE'].includes(decision.reason)) return { ...decision, text: `${groomingAdministratorNotice(input.settings, input.now)}\n\n${decision.reason === 'CONTACT_DECLINED' ? 'Заявку на звонок оформлять не буду. Можно продолжить здесь — администратор ответит в переписке.' : decision.reason === 'UNSUPPORTED_MEDIA' ? 'Не могу надёжно разобрать вложение. Оно сохранено в диалоге для администратора.' : 'Обращение сохранено в диалоге для администратора. Можно написать подробности здесь.'}` };
    return finishGrooming({ ...decision, text: window !== 'WORKING' && decision.purpose === 'CONTACT'
      ? `${groomingAdministratorNotice(input.settings, input.now)}\n\n${decision.text}`
      : groomingReplyWithHours(input.settings, decision.text, input.now) });
  }
  if (decision.direction === 'GROOMING') return finishGrooming(decision);
  if (input.skipAvailability || !decision.text || decision.direction !== 'CLINIC') return decision;
  const outsideHours = !administratorWorking(input.settings, input.now);
  if (decision.reason === 'URGENT') {
    return { ...decision, text: `Приезжайте в клинику, чтобы питомца осмотрел врач. Не ждите ответа в переписке.${input.clinicPhone ? ` Можно предварительно позвонить${outsideHours ? ' дежурному врачу' : ''}: ${clinicPhoneText(input.clinicPhone)}.` : ''}` };
  }
  // Enforce the time rule even on an old saved FAQ/template. Prompts alone must
  // not allow an edited answer to promise an administrator who is off duty.
  if (outsideHours && /администратор/iu.test(decision.text) && (!input.crmAnswer?.administratorHoursExplained || /передам|передал|передаю|уточню|подключу|отправлю/iu.test(decision.text))) decision = { ...decision, text: dutyDoctorReply(input.clinicPhone), createInquiry: false, handoff: false, needsAttention: false };
  if (input.crmAnswer?.nightContactIncluded && !decision.createInquiry) return decision;
  if (outsideHours && (!input.nightNoticeDelivered || decision.createInquiry || decision.reason === 'URGENT' || input.crmAnswer?.reconfirmNightContact) || decision.reason === 'URGENT') {
    const notice = outsideHours ? nightNotice(input.settings, input.clinicPhone) : input.clinicPhone ? `Позвоните в клинику: ${clinicPhoneText(input.clinicPhone)}.` : 'Проверенный номер клиники сейчас недоступен.';
    if (input.clinicPhone && decision.text?.includes(clinicPhoneText(input.clinicPhone))) return decision;
    return { ...decision, text: `${decision.text}\n\n${notice}`, ...(!input.clinicPhone ? { handoff: true, needsAttention: true, reason: decision.reason === 'URGENT' ? 'URGENT' : 'CLINIC_PHONE_UNAVAILABLE' } : {}) };
  }
  return decision;
}

function applyGroomingPrice(input: DecisionInput, decision: AdminDecision): AdminDecision {
  if (decision.direction !== 'GROOMING' || input.petService?.direction !== 'GROOMING' || input.mode && input.mode !== 'BOT'
    || input.mediaType && input.mediaType !== 'text' || ['URGENT', 'MEDICAL', 'CONTACT_DECLINED', 'DIRECT_HUMAN_REQUEST', 'HUMAN_CONTROL', 'UNSUPPORTED_MEDIA'].includes(decision.reason)) return decision;
  const priceIntent = input.intent?.action === 'PRICE' || input.intent?.questions?.some(question => question.kind === 'PRICE');
  const price = groomingPriceAnswer(input.petService, input.text, input.contact?.groomingPriceContext, priceIntent);
  if (!price) return decision;
  const contact = { ...decision.contact, groomingPriceContext: price.context };
  if (!contact.collecting) contact.summary = [input.text, price.answer].filter(Boolean).join('\n').slice(0, 2000);
  const priced = { ...decision, contact, groomingPriceFingerprint: price.fingerprint };
  if (decision.purpose === 'CONTACT' || decision.purpose === 'SUBMITTED' || decision.petServiceChannel === 'WEBSITE'
    || ['ASSISTANT_IDENTITY', 'GROOMING_ADMINISTRATOR_HOURS'].includes(decision.reason)) return { ...priced, groomingPricePrefix: price.answer || undefined };
  const askedAddress = /адрес|где\s+(?:вы|наход)|как\s+(?:к вам\s+)?добраться/iu.test(input.text);
  const address = askedAddress ? input.petService.address ? `Адрес груминга: ${input.petService.address}.` : 'Точный адрес уточнит администратор при согласовании записи.' : '';
  const offer = input.petService.selfBookingEnabled && price.canSelfBook
    ? petServiceAnswer(input.petService, 'Хочу записаться', true)!
    : 'Могу оформить заявку здесь, чтобы администратор уточнил детали и помог с записью. Оставим заявку?';
  if (price.question) delete contact.bookingChoiceOffered; else contact.bookingChoiceOffered = true;
  return { ...priced, text: [price.answer, address, price.question || offer].filter(Boolean).join('\n\n'), reason: price.question ? 'GROOMING_PRICE_CLARIFY' : 'GROOMING_PRICE',
    purpose: 'REPLY', handoff: false, needsAttention: !price.quoted && !price.question, createInquiry: false, petServiceBooking: undefined, petServiceChannel: undefined };
}
function decideCore(input: DecisionInput): AdminDecision {
  const { settings, listingId, text, messageId } = input;
  const contact = { ...(input.contact ?? {}) };
  const base = { text: null, purpose: 'REPLY' as const, handoff: false, createInquiry: false, direction: null, reason: '', contact } as AdminDecision;
  const rule = settings.listings.find(l => l.id === listingId && l.enabled);
  const profile = rule && settings.profiles.find(p => p.direction === rule.direction && p.enabled);
  if (!profile) return { ...base, handoff: true, reason: 'UNMAPPED_LISTING' };
  base.direction = profile.direction; base.prompt = effectivePrompt(profile, rule);
  const offHours = profile.direction === 'CLINIC' && !input.skipAvailability && !administratorWorking(settings, input.now);
  const t = settings.templates;
  const normalized = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
  const species = petSpecies(text);
  if (species) contact.petSpecies = species;
  const age = normalized.match(/(?:^|[\s,.])\d+(?:[.,]\d+)?\s*(?:лет|год(?:а)?|месяц(?:а|ев)?|мес\.?)(?=$|[\s,.!?])/u)?.[0];
  if (age) contact.petAge = age.trim();
  if (/(?:^|[^а-я])(?:кот|кота|коту|кошка|кошку|кошке|самец|самка|мальчик|девочка|кобель|сука)(?=$|[^а-я])/u.test(normalized)) contact.petSexKnown = true;
  if (/по направлению|(?:направление|направления)\s+(?:есть|нет)|есть\s+направление|без\s+направления/u.test(normalized)) contact.referralKnown = true;
  if (clinicUrgency(normalized)) return { ...base, handoff: true, reason: 'URGENT', text: t.urgent };
  if (input.mediaType && input.mediaType !== 'text') return { ...base, handoff: !offHours, reason: 'UNSUPPORTED_MEDIA', text: offHours ? `Не могу надёжно разобрать это вложение. ${dutyDoctorReply(input.clinicPhone)}` : 'Передам вложение сотруднику. Уточнить детали можно здесь в переписке.' };
  const callsDeclined = /не\s+звон|без\s+телефон|не\s+хочу\s+(?:оставлять|давать|передавать)\s+(?:номер|телефон)/u.test(normalized);
  const refusesWebsiteOnly = profile.direction === 'GROOMING' && /не\s+(?:хочу|буду|надо|нужно)(?:\s+\S+){0,4}\s+(?:сайт|ссылк|онлайн)|(?:сайт|ссылк|онлайн)\S*\s+(?:мне\s+)?не\s+(?:нуж|хочу|надо)|без\s+сайт|^не\s+сайт/u.test(normalized) && !callsDeclined;
  const websiteInsteadOfCalls = profile.direction === 'GROOMING' && callsDeclined && !/сайт\S*\s+не|не\s+(?:хочу|надо|нужно)(?:\s+\S+){0,3}\s+сайт/u.test(normalized) && /сайт|онлайн|самостоятельн/u.test(normalized);
  if (!refusesWebsiteOnly && !websiteInsteadOfCalls && /(?:не\s+(?:хочу|буду|разрешаю|согласен|согласна)\s*(?:передавать|оставлять|давать)?|не\s+звоните|без\s+телефона|только\s+здесь)/u.test(normalized)) {
    delete contact.callbackAt; delete contact.callbackMessageId;
    return { ...base, handoff: true, reason: 'CONTACT_DECLINED', text: input.mode && input.mode !== 'BOT' ? null : offHours ? `Не буду оформлять заявку на звонок. ${dutyDoctorReply(input.clinicPhone)}` : 'Можно продолжить здесь. Передам диалог сотруднику без заявки на обратный звонок.' };
  }
  if (input.mode && input.mode !== 'BOT') return { ...base, reason: 'HUMAN_CONTROL' };
  if (/(?:вы|ты)\s+(?:бот|робот|человек)|это\s+(?:бот|робот)/u.test(normalized)) return { ...base, text: profile.direction !== 'CLINIC' ? `Да, я помощник ${profile.direction === 'GROOMING' ? 'груминга' : 'зоогостиницы'}. Помогу с организационными вопросами, а при необходимости передам обращение сотруднику.` : offHours ? `Да, я помощник клиники. Помогу с организационными вопросами. ${dutyDoctorReply(input.clinicPhone)}` : 'Да, я помощник клиники. Помогу с организационными вопросами и заявкой, а при необходимости подключу администратора.', reason: 'ASSISTANT_IDENTITY' };
  const vaccineAdvice = /вакцин|прививк/u.test(normalized) && /какую.{0,80}(?:выбрать|лучше)|(?:лучше|подойдет|подходит|выбрать|посоветуйте|посоветуете)|(?:можно|стоит)\s+ли\s+(?:сейчас\s+)?(?:вакцинировать|делать\s+(?:вакцин|прививк))/u.test(normalized);
  const medical = input.intent?.action === 'MEDICAL' || vaccineAdvice || /(?:диагноз|чем\s+лечить|как\s+лечить|что\s+дать|дозиров|сколько\s+(?:дать|таблет)|расшифр|назначь|нужна\s+ли\s+(?:озоновая|ванна)|показани|анализ\S*\s+(?:означ|плох)|(?:болит|рвет|рвота|понос|отравил|не\s+ест|не\s+пьет|хромает|вялый|вялая))/u.test(currentMedicalText(text));
  const askHuman = input.intent?.action === 'HUMAN' || /(?:оператор|живой\s+(?:человек|администратор)|соедините|сотрудник|позвоните|перезвоните|жалоб)/u.test(normalized);
  const booking = input.intent?.action === 'BOOKING' || /(?:запис|запиш|заявк|хочу\s+(?:на|к|подстричь|заселить)|забронировать|нужен\s+прием)/u.test(normalized);
  const grooming = profile.direction === 'GROOMING' && input.petService?.direction === 'GROOMING';
  if (grooming && !medical && /(?:администратор\S*.{0,35}(?:когда|работ|время|час|ноч)|(?:когда|работ|график|время|час).{0,35}администратор)/u.test(normalized)) return { ...base, text: `${groomingAdministratorNotice(settings, input.now)} Заявку на запись можно оставить здесь в любое время; время визита согласует администратор.`, reason: 'GROOMING_ADMINISTRATOR_HOURS' };
  const callbackChoice = grooming && (refusesWebsiteOnly || /перезвон|позвон(?:ите|ить|ил|ит|ит\s+мне)|обратн\S*\s+звон/u.test(normalized)
    || (contact.bookingChoiceOffered || contact.bookingChannel) && /^(?:здесь|тут|в\s+авито|через\s+администратора)[.!\s]*$/u.test(normalized)
    || contact.bookingChoiceOffered && /^(?:да|давайте|оставим|хорошо)[.!\s]*$/u.test(normalized));
  const websiteChoice = grooming && !callbackChoice && (/сайт|ссылк|онлайн|самостоятельн|(?:сам|сама)\s+(?:запиш|выбер|оформ)/u.test(normalized) || contact.bookingChoiceOffered && /^(?:сам|сама)[.!\s]*$/u.test(normalized));
  if (grooming && !medical && websiteChoice) {
    contact.bookingChannel = 'WEBSITE'; delete contact.bookingChoiceOffered;
    delete contact.collecting; delete contact.reason; delete contact.awaitingServiceDetails;
    delete contact.callbackAt; delete contact.callbackMessageId;
    return { ...base, text: petServiceAnswer(input.petService!, text, true, 'WEBSITE'), reason: 'PET_SERVICE_INFO', petServiceBooking: true, petServiceChannel: 'WEBSITE' };
  }
  if (grooming && !medical && (callbackChoice || providedCallbackPhone(text))) {
    contact.bookingChannel = 'CALLBACK'; delete contact.bookingChoiceOffered;
    contact.collecting = true; contact.reason = 'CALLBACK'; contact.summary ??= text.slice(0, 2000);
  }

  if (!callbackChoice && /(?:оператор|живой\s+(?:человек|администратор)|соедините|сотрудник)/u.test(normalized)) return { ...base, handoff: true, reason: 'DIRECT_HUMAN_REQUEST', text: offHours ? dutyDoctorReply(input.clinicPhone) : 'Передам диалог администратору. Продолжить общение можно здесь, в Авито.' };
  if (offHours && (medical || askHuman && !/(?:перезвоните|позвоните\s+мне|обратн\S*\s+звон)/u.test(normalized))) return { ...base, reason: medical ? 'MEDICAL' : 'HUMAN_REQUEST', text: `С этим вопросом поможет врач. ${dutyDoctorReply(input.clinicPhone)}` };
  if (input.petService?.direction === profile.direction && !medical && !askHuman && !providedCallbackPhone(text) && (!contact.collecting || contact.reason === 'BOOKING')) {
    const channel = grooming && contact.bookingChannel === 'WEBSITE' ? 'WEBSITE' : undefined;
    const answer = petServiceAnswer(input.petService, text, booking, channel);
    if (answer) {
      // An old unfinished intake must not keep collecting contacts for a site booking.
      if (contact.reason === 'BOOKING') { delete contact.collecting; delete contact.reason; delete contact.awaitingServiceDetails; }
      if (grooming && !channel) contact.bookingChoiceOffered = true;
      return { ...base, text: answer, reason: 'PET_SERVICE_INFO', petServiceBooking: booking && petServiceAnswer(input.petService, text) === null, petServiceChannel: channel };
    }
  }
  if (medical || askHuman || booking) { contact.collecting = true; contact.reason = medical ? 'MEDICAL' : contact.bookingChannel === 'CALLBACK' ? 'CALLBACK' : askHuman ? 'HUMAN_REQUEST' : 'BOOKING'; contact.summary ??= text.slice(0, 2000); }
  const phoneMatch = text.match(/(?:\+?7|8)?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/u)?.[0];
  const provided = providedCallbackPhone(text);
  if (provided) {
    contact.collecting = true; contact.reason ??= 'CALLBACK'; contact.summary ??= text.slice(0, 2000);
    contact.phone = provided; contact.callbackAt = (input.now ?? new Date()).toISOString(); contact.callbackMessageId = messageId;
  }
  const explicitName = text.match(/(?:меня\s+зовут|имя\s*[:—-])\s*([А-ЯЁа-яё][А-ЯЁа-яё-]{1,29}(?:\s+[А-ЯЁа-яё][А-ЯЁа-яё-]{1,29})?)/iu)?.[1];
  const nameOnly = text.replace(phoneMatch ?? '\0', '').replace(/[,;:.]/g, '').trim();
  const simpleName = !callbackChoice && contact.collecting && !contact.awaitingServiceDetails && !contact.name && /^[А-ЯЁ][а-яё-]{1,29}(?:\s+[А-ЯЁ][а-яё-]{1,29}){0,2}$/u.test(nameOnly) && !/^(?:Да|Нет|Хочу|Можно|Спасибо|Здравствуйте|Добрый|Перезвоните|Запишите|Согласна|Согласен|Разрешаю|Передавайте|Ладно)(?:\s|$)/u.test(nameOnly) ? nameOnly : undefined;
  const openingName = contact.collecting && !contact.name ? text.match(/^([А-ЯЁ][а-яё-]{1,29})[.,]\s+(?:Мой|мой|Телефон|телефон)/u)?.[1] : undefined;
  const name = explicitName ?? simpleName ?? openingName;
  if (name && contact.collecting) contact.name = name.trim();
  if (profile.direction === 'CLINIC' && !medical && !askHuman && (crmQuestion(text) || input.crmAnswer)) {
    const answer = input.crmAnswer ?? { text: offHours ? dutyDoctorReply(input.clinicPhone) : 'Уточню актуальные сведения у администратора. Можем продолжить здесь.', handoff: !offHours, reason: 'CRM_CONTEXT_REQUIRED' };
    const complete = Boolean(contact.collecting && contact.name && contact.phone && contact.callbackAt && contact.callbackMessageId);
    const tail = complete ? submittedReply(settings, input.now) : contact.collecting ? missingContactPrompt(settings, contact, offHours) : null;
    return { ...base, ...answer, purpose: 'CRM_REPLY', text: `${answer.text}${tail ? `\n\n${tail}` : ''}`, createInquiry: complete, handoff: complete || !offHours && answer.handoff };
  }
  if (contact.awaitingServiceDetails) {
    if (!phoneMatch && !explicitName && !medical && !askHuman && !booking && text.trim().length > 1) {
      contact.serviceDetails = text.trim().slice(0, 500);
      contact.summary = `${contact.summary ?? 'Заявка'}\nУточнение по услуге: ${contact.serviceDetails}`.slice(0, 2000);
    }
    contact.awaitingServiceDetails = false;
  }
  if (contact.collecting) {
    if (rule.intakeQuestion && !contact.serviceQuestionAsked && !medical && contact.reason !== 'MEDICAL' && !contact.phone) {
      const question = missingServiceDetails(rule.intakeQuestion, contact);
      contact.serviceQuestionAsked = true;
      if (question) { contact.awaitingServiceDetails = true; return { ...base, text: question, purpose: 'CONTACT', reason: 'SERVICE_DETAILS' }; }
    }
    // A clinical question stops clinical answers, while administrative contact
    // collection can continue. An explicit request for a human still takes over.
    if (!contact.name || !contact.phone || !contact.callbackMessageId) return { ...base, text: `${medical ? `${t.medical}\n\n` : ''}${missingContactPrompt(settings, contact, offHours)}`, purpose: 'CONTACT', reason: contact.reason ?? 'CONTACT', handoff: askHuman, needsAttention: contact.reason === 'MEDICAL' || askHuman };
    return { ...base, text: profile.direction === 'CLINIC' ? submittedReply(settings, input.now) : profile.direction === 'GROOMING' ? 'Передал заявку администратору груминга. Он свяжется с вами по указанному номеру в рабочее время и согласует запись. Запись пока не подтверждена.' : 'Передал ваше обращение сотруднику зоогостиницы. Он свяжется с вами по указанному номеру. Запись пока не подтверждена.', purpose: 'SUBMITTED', createInquiry: true, handoff: true, reason: contact.reason ?? 'BOOKING' };
  }
  const matched = profile.knowledge.filter(k => input.intent?.action === 'KNOWLEDGE' ? k.id === input.intent.knowledgeId : k.keywords.some(word => normalized.includes(word.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е'))));
  if (matched.length === 1) return { ...base, text: matched[0].answer, reason: `KNOWLEDGE:${matched[0].id}` };
  if (input.intent?.action === 'GREETING' || /^(?:здравствуй(?:те)?|добрый\s+(?:день|вечер)|доброе\s+утро|привет)[.!\s]*$/u.test(normalized)) return { ...base, text: rule.greeting || 'Здравствуйте! Подскажите, пожалуйста, что вас интересует?', reason: 'GREETING' };
  if (/^(?:спасибо(?:\s+(?:большое|за\s+(?:ответ|помощь|информацию)))?|благодарю|понятно|хорошо|до свидания|все понятно)[\s,.!]*$/u.test(normalized)) return { ...base, text: 'Пожалуйста! Если появятся ещё вопросы, напишите.', reason: 'COURTESY' };
  // A vague customer message needs a follow-up, not a permanent HUMAN switch.
  // Explicit takeover, medical issues and contact preferences are handled above.
  if (profile.direction === 'GROOMING') {
    const awaiting = contact.groomingPriceContext?.awaiting;
    const knownPet = contact.groomingPriceContext?.species || contact.petSpecies;
    contact.groomingPriceContext ??= { awaiting: 'PET' };
    const question = awaiting === 'PET' ? 'У вас кошка или собака? Если собака, напишите породу.'
      : awaiting === 'BREED' ? 'Какой породы собака? Для метиса напишите примерный вес.'
      : awaiting === 'SERVICE' ? 'Какая услуга нужна — полный комплекс, гигиенический уход или вычёсывание?'
      : awaiting === 'CONDITION' ? 'Подскажите, у кошки есть колтуны?'
      : knownPet ? 'Что ещё хотите уточнить по грумингу — стоимость, уход или запись?'
      : 'Подскажите, какой у вас питомец и какая услуга нужна — стрижка, гигиенический уход или вычёсывание?';
    const ping = /^(?:вы\s+(?:тут|здесь|на\s+связи)|кто[ -]нибудь\s+есть|ау|алло|ответьте|\?+)[\s.!?]*$/u.test(normalized);
    const vague = /^(?:груминг|можно|подскажите(?:\s+пожалуйста)?|добрый\s+(?:день|вечер)[\s!,.]*(?:подскажите(?:\s+пожалуйста)?)?|да|нет)[\s.!?]*$/u.test(normalized);
    return { ...base, text: `${ping ? 'Да, я на связи. ' : ''}${question}`, reason: 'GROOMING_CLARIFY', needsAttention: matched.length > 1 || !ping && !vague, handoff: false };
  }
  return { ...base, text: offHours ? `Не хочу подсказать неточно. ${dutyDoctorReply(input.clinicPhone)}` : t.unknown, handoff: !offHours, reason: matched.length > 1 ? 'AMBIGUOUS_KNOWLEDGE' : 'NO_APPROVED_ANSWER' };
}

function missingServiceDetails(question: string, contact: ContactState) {
  const needed: string[] = [];
  let fields = 0;
  if (/питомец|питомца|кошк|собак/iu.test(question)) fields++;
  if (/возраст|сколько.{0,25}(?:лет|питомцу)/iu.test(question)) fields++;
  if (/(?:^|\s)пол(?:\s|[,?.]|$)/iu.test(question)) fields++;
  if (/направлен/iu.test(question)) fields++;
  if (/питомец|питомца|кошк|собак/iu.test(question) && !contact.petSpecies) needed.push('кто у вас — кошка или собака');
  if (/возраст|сколько.{0,25}(?:лет|питомцу)/iu.test(question) && !contact.petAge) needed.push('сколько питомцу лет');
  if (/(?:^|\s)пол(?:\s|[,?.]|$)/iu.test(question) && !contact.petSexKnown) needed.push('питомец — мальчик или девочка');
  if (/направлен/iu.test(question) && !contact.referralKnown) needed.push('есть ли направление врача');
  const recognized = /питомец|питомца|кошк|собак|возраст|сколько.{0,25}(?:лет|питомцу)|направлен|(?:^|\s)пол(?:\s|[,?.]|$)/iu.test(question);
  return needed.length && needed.length === fields ? question : needed.length ? `Подскажите, пожалуйста, ${needed.join(' и ')}?` : recognized ? null : question;
}

function missingContactPrompt(settings: AvitoSettings, contact: ContactState, offHours = false) {
  if (offHours) return !contact.name ? 'Как к вам обращаться?' : `Оставьте, пожалуйста, номер телефона для обратного звонка в рабочее время, с ${settings.administratorSchedule.opensAt} до ${settings.administratorSchedule.closesAt}.`;
  return !contact.name && settings.templates.contactName ? settings.templates.contactName : settings.templates.contactPhone ?? settings.templates.contact;
}

export function providedCallbackPhone(text: string): string | null {
  if (/(?:не\s+мой\s+(?:номер|телефон)|(?:номер|телефон)\s+(?:клиники|врача|соседа|соседки|друга|подруги)|(?:ваш|чужой)\s+(?:номер|телефон))/iu.test(text) || /[«»"“”]|(?:цитата|пересланное\s+сообщение)/iu.test(text)) return null;
  const matched = text.match(/(?<!\d)(?:\+?7|8)?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/u)?.[0];
  if (!matched) return null;
  try { const phone = normalizePhoneForLookup(matched); return phone ? `+${phone}` : null; } catch { return null; }
}
