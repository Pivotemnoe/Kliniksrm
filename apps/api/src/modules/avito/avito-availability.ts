import { AvitoSettings } from './avito.settings';
import { clinicPhoneText } from './avito-clinic-guidance';

export function administratorWorking(settings: AvitoSettings, now = new Date()) {
  const schedule = settings.administratorSchedule;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const time = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`;
  return time >= schedule.opensAt && time < schedule.closesAt;
}

export function nightNotice(settings: AvitoSettings, phone?: string | null) {
  return `Сейчас клиника работает в ночном режиме, дежурит один врач. ${phone ? `Для связи с ним позвоните: ${clinicPhoneText(phone)}.` : dutyDoctorReply(phone)}`;
}

export function dutyDoctorReply(phone?: string | null) {
  return phone ? `Уточнить этот вопрос можно у дежурного врача по телефону ${clinicPhoneText(phone)}.` : 'Проверенный номер клиники сейчас недоступен. Не хочу подсказывать неточно.';
}

export function avitoPricing(settings: AvitoSettings, now = new Date()) {
  const tariff = settings.nightTariff;
  const administratorSchedule = { opensAt: settings.administratorSchedule.opensAt, closesAt: settings.administratorSchedule.closesAt };
  const programme = settings.clinicProgrammeTable ? { programmeTable: settings.clinicProgrammeTable } : {};
  if (!tariff?.enabled) return { note: '', active: false, administratorWorking: administratorWorking(settings, now), administratorSchedule, ...programme };
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: settings.administratorSchedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const time = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`;
  const active = tariff.startsAt > tariff.endsAt ? time >= tariff.startsAt || time < tariff.endsAt : time >= tariff.startsAt && time < tariff.endsAt;
  const description = tariff.multiplier === 2 ? 'двойной ночной тариф' : `ночной тариф с коэффициентом ${tariff.multiplier}`;
  // The owner approved quoting the ordinary CRM price and announcing the surcharge separately.
  return { active, note: `С ${tariff.startsAt} до ${tariff.endsAt} действует ${description}.`, administratorWorking: administratorWorking(settings, now), administratorSchedule, ...programme };
}

export function submittedReply(settings: AvitoSettings, now = new Date()) {
  const s = settings.administratorSchedule;
  return administratorWorking(settings, now) ? settings.templates.submitted : `Заявку сохранил. С вами свяжутся в рабочее время, с ${s.opensAt} до ${s.closesAt}.`;
}
