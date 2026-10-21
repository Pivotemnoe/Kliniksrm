import type { Prisma } from '@prisma/client';

export type PetServiceContext = {
  direction: 'GROOMING' | 'HOTEL'; available: boolean; selfBookingEnabled: boolean;
  siteUrl: string; address: string | null; hotel?: {
    minimumDays: number; maximumDogWeightKg: number; walkRate: number;
    checkInFrom: string; checkInTo: string; catRates: number[]; dogRates: number[];
  };
};

const sites = { GROOMING: 'https://pet.temichevvet.ru/', HOTEL: 'https://pet.temichevvet.ru/pet-hotel/' };

/** Only the selected business module supplies facts. Reading never creates a module or booking. */
export async function loadPetServiceContext(db: Prisma.TransactionClient, organizationId: string, direction: string): Promise<PetServiceContext | undefined> {
  if (direction !== 'GROOMING' && direction !== 'HOTEL') return undefined;
  const fallback: PetServiceContext = { direction, available: false, selfBookingEnabled: false, siteUrl: sites[direction], address: null };
  try {
    if (direction === 'GROOMING') {
      const module = await db.clinicModuleInstallation.findUnique({ where: { organizationId_moduleKey: { organizationId, moduleKey: 'GROOMING' } }, select: {
        enabled: true, groomingSettings: { select: { selfBookingEnabled: true, testClientMaxId: true } },
        groomingLocations: { where: { isActive: true }, select: { address: true } },
        groomingRules: { where: { isActive: true, specialist: { isActive: true, workPeriods: { some: { isActive: true, kind: 'WORK', endsAt: { gt: new Date() } } } }, workplace: { isActive: true }, location: { isActive: true } }, select: { id: true }, take: 1 },
      } });
      const addresses = [...new Set(module?.groomingLocations.map(x => x.address.trim()).filter(Boolean))];
      return { ...fallback, available: Boolean(module?.enabled), selfBookingEnabled: Boolean(module?.enabled && module.groomingSettings?.selfBookingEnabled && !module.groomingSettings.testClientMaxId && module.groomingRules.length), address: addresses.length === 1 ? addresses[0] : null };
    }
    const module = await db.clinicModuleInstallation.findUnique({ where: { organizationId_moduleKey: { organizationId, moduleKey: 'PET_HOTEL' } }, select: {
      enabled: true, petHotelSettings: true, petHotelRooms: { where: { isActive: true }, select: { species: true, dailyRate: true } },
    } });
    const settings = module?.petHotelSettings;
    if (!module?.enabled || !settings) return fallback;
    const url = new URL(settings.siteUrl);
    const siteUrl = url.protocol === 'https:' && url.hostname === 'pet.temichevvet.ru' && !url.username && !url.password && !url.port ? url.href : fallback.siteUrl;
    return { ...fallback, siteUrl, available: true, selfBookingEnabled: settings.selfBookingEnabled && module.petHotelRooms.length > 0, hotel: {
      minimumDays: settings.minimumDays, maximumDogWeightKg: Number(settings.maximumDogWeightKg), walkRate: Number(settings.walkRate), checkInFrom: settings.checkInFrom, checkInTo: settings.checkInTo,
      catRates: module.petHotelRooms.filter(r => r.species === 'CAT').map(r => Number(r.dailyRate ?? settings.dailyRate)),
      dogRates: module.petHotelRooms.filter(r => r.species === 'DOG').map(r => Number(r.dailyRate ?? settings.dailyRate)),
    } };
  } catch { return fallback; }
}

/** An enquiry in Avito is never a confirmed reservation or an invitation to collect payment. */
export function petServiceAnswer(context: PetServiceContext, text: string, bookingIntent = false, bookingChannel?: 'WEBSITE'): string | null {
  const input = text.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const price = /цен|стоим|сколько|почем|прайс|тариф/u.test(input);
  const booking = bookingIntent || /запис|запиш|брон|засели|свобод|места|сайт|ссылк|онлайн|оставить\s+(?:кот|кош|собак|питом)|хочу\s+(?:подстричь|груминг)/u.test(input);
  const address = /адрес|где\s+(?:вы|наход)|как\s+(?:к вам\s+)?добраться/u.test(input);
  const conditions = /услови|правил|кош|кот|собак|вес|килограмм|кг|сут|дней|выгул|заезд|выезд|время|час|принимаете/u.test(input);
  if (!price && !booking && !address && !conditions) return null;
  const parts: string[] = [];
  if (address && context.address) parts.push(`Адрес груминга: ${context.address}.`);
  if (context.direction === 'HOTEL' && context.available && context.hotel) {
    const hotel = context.hotel;
    if (price) {
      const rates = (values: number[]) => values.length ? `${Math.min(...values) === Math.max(...values) ? '' : 'от '}${money(Math.min(...values))} ₽ в сутки` : null;
      const cats = rates(hotel.catRates), dogs = rates(hotel.dogRates);
      if (cats) parts.push(`Номер для кошки — ${cats}.`);
      if (dogs) parts.push(`Номер для собаки — ${dogs}.`);
      parts.push(`Выгул — ${money(hotel.walkRate)} ₽. Итоговая сумма зависит от дат, номера и выбранных выгулов; расчёт доступен на сайте.`);
    }
    if (conditions || price) parts.push(`Минимальный срок — ${hotel.minimumDays} сут. Неполные сутки считаются полными. Принимаем собак весом до ${hotel.maximumDogWeightKg} кг. Заезд — с ${hotel.checkInFrom} до ${hotel.checkInTo}.`);
  }
  if (context.direction === 'GROOMING') {
    if (price) parts.push('Стоимость груминга зависит от выбранной услуги, питомца и состояния шерсти. Администратор поможет уточнить её здесь; прайс также есть на сайте.');
    const website = bookingChannel === 'WEBSITE' || /сайт|ссылк|онлайн|самостоятельн/u.test(input);
    if (website) {
      parts.push(context.selfBookingEnabled
        ? 'Самостоятельно выбрать услугу и доступное время можно на сайте. Запись оформляется там после входа через MAX и проверки расписания. Если удобнее, можно оставить заявку на звонок администратора здесь, в Авито.'
        : 'Самостоятельная онлайн-запись пока закрыта: расписание ещё настраивается. На сайте можно посмотреть услуги, прайс и примеры работ. Для записи можно оставить заявку здесь, чтобы администратор связался с вами.');
      parts.push(context.siteUrl);
    } else if (booking) {
      parts.push(context.selfBookingEnabled
        ? 'Как вам удобнее записаться: самостоятельно на сайте или оставить заявку здесь, чтобы администратор позвонил?'
        : 'Самостоятельная онлайн-запись пока закрыта: расписание ещё настраивается. Могу оформить заявку здесь, чтобы администратор позвонил и помог с записью. Оставим заявку на звонок?');
    } else {
      parts.push(context.selfBookingEnabled
        ? 'Можем обсудить запись здесь с администратором или выбрать услугу и время на сайте — как вам удобнее?'
        : 'Можем обсудить запись здесь с администратором. Самостоятельная онлайн-запись пока закрыта; на сайте можно посмотреть услуги, прайс и примеры работ.');
    }
    return parts.join('\n');
  } else parts.push(context.selfBookingEnabled
    ? 'Даты и свободный номер можно выбрать на сайте. Бронь оформляется там после входа через MAX и повторной проверки наличия мест.'
    : 'Онлайн-бронирование пока недоступно. Условия можно посмотреть на сайте или уточнить у сотрудника здесь.');
  parts.push(context.siteUrl);
  return parts.join('\n');
}

function money(value: number) { return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
