import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { bookingAttribution } from '../../common/booking-attribution';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { PetHotelBookingDto, PetHotelChangeDto, PetHotelRoomDto, PetHotelSettingsDto, PetHotelStatusDto } from './pet-hotel.dto';
import { petHotelQuote, petHotelTime } from './pet-hotel.pricing';

export const PET_HOTEL_MODULE_KEY = 'PET_HOTEL';
export const lockPetHotel = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020, 3)`;
const active = ['RESERVED', 'IN_HOUSE'];
const include = { room: true, owner: { select: { id: true, fullName: true, phone: true } }, animal: { select: { id: true, nickname: true, species: true, breed: true } } } satisfies Prisma.PetHotelReservationInclude;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const speciesOf = (value?: string | null) => /кош|кот|cat/iu.test(value || '') ? 'CAT' : /собак|dog|п[её]с|щен/iu.test(value || '') ? 'DOG' : null;

@Injectable()
export class PetHotelService {
  constructor(private readonly prisma: PrismaService, private readonly modules: ClinicModulesService, private readonly audit: AuditService) {}

  private canManage(actor: AuthEmployee) { return actor.permissions.includes('pet_hotel.manage'); }
  private manage(actor: AuthEmployee) { if (!this.canManage(actor)) throw new ForbiddenException('Нет права на настройку зоогостиницы'); }
  async context(tx?: Prisma.TransactionClient, requireEnabled = false) {
    const installation = await this.modules.installation(PET_HOTEL_MODULE_KEY);
    const db = tx || this.prisma;
    const current = await db.clinicModuleInstallation.findUniqueOrThrow({ where: { id: installation.id } });
    const entitled = await this.modules.entitlement(PET_HOTEL_MODULE_KEY);
    if (requireEnabled && (!current.enabled || !entitled)) throw new ForbiddenException('Зоогостиница отключена. Новые брони и заезды недоступны');
    const settings = await db.petHotelSettings.upsert({ where: { installationId: current.id }, create: { installationId: current.id }, update: {} });
    return { installation: current, settings, entitled, limited: !current.enabled || !entitled };
  }
  async overview(actor: AuthEmployee, now = new Date()) {
    const context = await this.context();
    const rooms = await this.prisma.petHotelRoom.findMany({ where: { installationId: context.installation.id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const inHouse = await this.prisma.petHotelReservation.count({ where: { installationId: context.installation.id, status: 'IN_HOUSE' } });
    const upcoming = await this.prisma.petHotelReservation.count({ where: { installationId: context.installation.id, status: 'RESERVED', endsAt: { gt: now } } });
    return { ...context, rooms, canManage: this.canManage(actor), canOperate: actor.permissions.includes('pet_hotel.operate'),
      stats: { catRooms: rooms.filter(r => r.isActive && r.species === 'CAT').length, dogRooms: rooms.filter(r => r.isActive && r.species === 'DOG').length, inHouse, upcoming },
      timezone: 'Europe/Moscow', mode: process.env.PET_HOTEL_QA_MODE === 'true' ? 'qa' : 'live' };
  }
  async bookings(from?: string, to?: string) {
    const { installation } = await this.context();
    const start = new Date(from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const end = new Date(to || new Date(start.getTime() + 32 * 86400000).toISOString());
    if (![start, end].every(x => Number.isFinite(x.getTime())) || end <= start || end.getTime() - start.getTime() > 93 * 86400000) throw new BadRequestException('Выберите период до трёх месяцев');
    const rows = await this.prisma.petHotelReservation.findMany({ where: { installationId: installation.id, startsAt: { lt: end }, OR: [{ endsAt: { gt: start } }, { status: 'IN_HOUSE' }] }, include, orderBy: { startsAt: 'asc' }, take: 501 });
    return { items: rows.slice(0, 500), truncated: rows.length > 500 };
  }
  async booking(id: string) {
    const { installation } = await this.context();
    const row = await this.prisma.petHotelReservation.findFirst({ where: { id, installationId: installation.id }, include });
    if (!row) throw new NotFoundException('Бронь зоогостиницы не найдена');
    return row;
  }
  async clients(search = '') {
    await this.context();
    const q = search.trim().slice(0, 100);
    if (q.length < 2) return [];
    return this.prisma.owner.findMany({ where: { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { animals: { some: { nickname: { contains: q, mode: 'insensitive' }, archivedAt: null } } }] }, select: { id: true, fullName: true, phone: true, animals: { where: { archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true } } }, orderBy: { fullName: 'asc' }, take: 30 });
  }
  private busy(installationId: string, startsAt: Date, endsAt: Date, now: Date, ignoreId?: string): Prisma.PetHotelReservationWhereInput {
    return { installationId, ...(ignoreId ? { id: { not: ignoreId } } : {}), status: { in: active }, startsAt: { lt: endsAt }, OR: [{ endsAt: { gt: startsAt } }, { status: 'IN_HOUSE', endsAt: { lte: now } }] };
  }
  async validateBooking(db: Prisma.TransactionClient | PrismaService, installationId: string, settings: { dailyRate: unknown; walkRate: unknown; minimumDays: number; maximumDogWeightKg: unknown; checkInFrom: string; checkInTo: string }, input: PetHotelBookingDto, now: Date, ignoreId?: string, rates?: { dailyRate: unknown; walkRate: unknown }) {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (![startsAt, endsAt].every(x => Number.isFinite(x.getTime())) || endsAt <= now) throw new BadRequestException('Проверьте даты проживания');
    const clock = petHotelTime(startsAt);
    if (clock < settings.checkInFrom || clock > settings.checkInTo) throw new BadRequestException(`Заселение с ${settings.checkInFrom} до ${settings.checkInTo} МСК`);
    const animal = await db.animal.findFirst({ where: { id: input.animalId, ownerId: input.ownerId, archivedAt: null }, select: { id: true, species: true } });
    if (!animal) throw new NotFoundException('Выберите питомца этого владельца');
    const species = speciesOf(animal.species);
    if (!species) throw new BadRequestException('Зоогостиница принимает кошек и собак. Уточните вид питомца в его карточке');
    if (species === 'DOG' && (!input.weightKg || input.weightKg > Number(settings.maximumDogWeightKg))) throw new BadRequestException(`Для собак укажите вес до ${settings.maximumDogWeightKg} кг включительно`);
    if (species === 'CAT' && input.walkCount) throw new BadRequestException('Выгул предусмотрен только для собак');
    const defaultQuote = petHotelQuote(startsAt, endsAt, Number(rates?.dailyRate ?? settings.dailyRate), Number(rates?.walkRate ?? settings.walkRate), input.walkCount, settings.minimumDays);
    const occupied = await db.petHotelReservation.findMany({ where: this.busy(installationId, startsAt, endsAt, now, ignoreId), select: { roomId: true, animalId: true } });
    if (occupied.some(row => row.animalId === input.animalId)) throw new ConflictException('У питомца уже есть бронь на этот период');
    const rooms = await db.petHotelRoom.findMany({ where: { installationId, isActive: true, species, id: { notIn: occupied.map(row => row.roomId) } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const offered = rooms.map(room => ({ ...room, quote: petHotelQuote(startsAt, endsAt, Number(rates?.dailyRate ?? room.dailyRate ?? settings.dailyRate), Number(rates?.walkRate ?? settings.walkRate), input.walkCount, settings.minimumDays) }));
    const quote = (offered.find(room => room.id === input.roomId) || offered[0])?.quote || defaultQuote;
    return { species, startsAt, endsAt, rooms: offered, quote };
  }
  async availability(input: PetHotelBookingDto & { reservationId?: string }, now = new Date()) {
    const { installation, settings } = await this.context(undefined, true);
    const previous = input.reservationId ? await this.booking(input.reservationId) : undefined;
    const result = await this.validateBooking(this.prisma, installation.id, settings, input, now, previous?.id, previous);
    return { rooms: result.rooms, quote: result.quote, species: result.species, checkedAt: now.toISOString() };
  }
  async book(input: PetHotelBookingDto | PetHotelChangeDto, actor: AuthEmployee, id?: string, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx);
      const { installation, settings, limited } = await this.context(tx);
      const receiptId = `${installation.id}:${actor.id}:booking:${input.clientKey}`, fingerprint = hash({ id, input });
      const oldReceipt = await tx.petHotelCommandReceipt.findUnique({ where: { id: receiptId } });
      if (oldReceipt) { if (oldReceipt.fingerprint !== fingerprint) throw new ConflictException('Ключ сохранения уже использован с другими данными'); return oldReceipt.result; }
      if (limited) throw new ForbiddenException('Зоогостиница отключена. Новые брони и заезды недоступны');
      const booking = await this.saveReservation(tx, installation.id, settings, input, now, actor.id, id);
      await tx.petHotelCommandReceipt.create({ data: { id: receiptId, fingerprint, result: json(booking) } });
      return booking;
    });
  }
  async saveReservation(tx: Prisma.TransactionClient, installationId: string, settings: Prisma.PetHotelSettingsGetPayload<{}>, input: PetHotelBookingDto | PetHotelChangeDto, now: Date, actorId?: string, id?: string, source = 'CRM') {
      const previous = id ? await tx.petHotelReservation.findFirst({ where: { id, installationId } }) : null;
      if (id && !previous) throw new NotFoundException('Бронь не найдена');
      if (previous && (previous.version !== (input as PetHotelChangeDto).version || !active.includes(previous.status))) throw new ConflictException('Бронь уже изменилась. Откройте её заново');
      if (previous && (previous.ownerId !== input.ownerId || previous.animalId !== input.animalId)) throw new BadRequestException('Владелец и питомец существующей брони не меняются');
      if (previous?.status === 'IN_HOUSE' && (previous.startsAt.toISOString() !== new Date(input.startsAt).toISOString() || previous.roomId !== input.roomId)) throw new BadRequestException('После заезда доступны изменение даты выезда, прогулок и пожеланий');
      const result = await this.validateBooking(tx, installationId, settings, input, now, id, previous || undefined);
      if (!result.rooms.some(room => room.id === input.roomId)) throw new ConflictException('Номер недоступен на выбранные даты. Проверьте свободные места заново');
      const attribution = bookingAttribution(input.attribution);
      const data = { roomId: input.roomId, ownerId: input.ownerId, animalId: input.animalId, species: result.species, weightKg: input.weightKg ?? null,
        startsAt: result.startsAt, endsAt: result.endsAt, billableDays: result.quote.billableDays, walkCount: input.walkCount,
        dailyRate: result.quote.dailyRate, walkRate: result.quote.walkRate, totalPrice: result.quote.totalPrice, notes: input.notes.trim() };
      const booking = previous ? await tx.petHotelReservation.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } }, include })
        : await tx.petHotelReservation.create({ data: { ...data, installationId, source, ...(attribution ? { attribution } : {}) }, include });
      await this.audit.log({ actorId: actorId, action: previous ? 'pet_hotel.booking.update' : 'pet_hotel.booking.create', entityType: 'PetHotelReservation', entityId: booking.id, metadata: { version: booking.version } }, tx);
      await this.queueNotifications(tx, booking, previous ? 'RESCHEDULED' : 'CONFIRMED', now);
      return booking;
  }
  async status(id: string, input: PetHotelStatusDto, actor: AuthEmployee, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx);
      const { installation, settings, limited } = await this.context(tx);
      const receiptId = `${installation.id}:${actor.id}:status:${input.clientKey}`, fingerprint = hash({ id, input });
      const receipt = await tx.petHotelCommandReceipt.findUnique({ where: { id: receiptId } });
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ConflictException('Ключ статуса уже использован'); return receipt.result; }
      if (input.status === 'IN_HOUSE' && limited) throw new ForbiddenException('Зоогостиница отключена. Новые брони и заезды недоступны');
      const saved = await this.changeStatus(tx, installation.id, settings, id, input, now, actor.id);
      await tx.petHotelCommandReceipt.create({ data: { id: receiptId, fingerprint, result: json(saved) } });
      return saved;
    });
  }
  async changeStatus(tx: Prisma.TransactionClient, installationId: string, settings: Prisma.PetHotelSettingsGetPayload<{}>, id: string, input: PetHotelStatusDto, now: Date, actorId?: string, ownerId?: string) {
      const row = await tx.petHotelReservation.findFirst({ where: { id, installationId, ...(ownerId ? { ownerId } : {}) } });
      if (!row) throw new NotFoundException('Бронь не найдена');
      if (row.version !== input.version) throw new ConflictException('Бронь уже изменилась. Обновите карточку');
      const transitions: Record<string, string[]> = { RESERVED: ['IN_HOUSE', 'CANCELLED', 'NO_SHOW'], IN_HOUSE: ['CHECKED_OUT'] };
      if (!transitions[row.status]?.includes(input.status)) throw new ConflictException('Такой переход статуса недоступен');
      if (input.status === 'IN_HOUSE') {
        if (now < row.startsAt || now >= row.endsAt) throw new BadRequestException('Для заезда сначала уточните актуальные даты проживания');
        const clock = petHotelTime(now);
        if (clock < settings.checkInFrom || clock > settings.checkInTo) throw new BadRequestException(`Заселение с ${settings.checkInFrom} до ${settings.checkInTo} МСК`);
        if (await tx.petHotelReservation.count({ where: { installationId: installationId, roomId: row.roomId, status: 'IN_HOUSE', id: { not: row.id } } })) throw new ConflictException('В номере ещё находится другой питомец. Сначала оформите его выезд');
      }
      const saved = await tx.petHotelReservation.update({ where: { id }, data: { status: input.status, ...(input.status === 'IN_HOUSE' ? { actualCheckInAt: now } : {}), ...(input.status === 'CHECKED_OUT' ? { actualCheckOutAt: now } : {}), version: { increment: 1 } }, include });
      await this.audit.log({ actorId: actorId, action: 'pet_hotel.booking.status', entityType: 'PetHotelReservation', entityId: id, metadata: { previous: row.status, status: saved.status, version: saved.version } }, tx);
      await this.queueNotifications(tx, saved, input.status === 'IN_HOUSE' ? 'CHECKED_IN' : input.status, now);
      return saved;
  }
  private async queueNotifications(tx: Prisma.TransactionClient, booking: Prisma.PetHotelReservationGetPayload<{ include: typeof include }>, event: string, now: Date) {
    await tx.petHotelNotification.updateMany({ where: { reservationId: booking.id, status: 'QUEUED' }, data: { status: 'CANCELLED', lastError: 'Бронь изменилась' } });
    const settings = await tx.petHotelSettings.findUniqueOrThrow({ where: { installationId: booking.installationId } });
    const when = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'long', timeStyle: 'short' }).format(booking.startsAt);
    const label: Record<string, string> = { CONFIRMED: 'бронь подтверждена', RESCHEDULED: 'бронь перенесена', CANCELLED: 'бронь отменена', CHECKED_IN: 'заезд оформлен', CHECKED_OUT: 'выезд оформлен', NO_SHOW: 'питомец не приехал' };
    const text = `TemichevVet · Зоогостиница: ${label[event] || event}. ${booking.animal.nickname}, ${booking.room.name}. Заезд: ${when}. Стоимость проживания и прогулок: ${booking.totalPrice.toFixed(2)} ₽. Подробности в кабинете.`.slice(0, 800);
    const recipients = [{ kind: 'OWNER', id: booking.ownerId }, ...[...new Set(settings.administratorMaxIds)].map(id => ({ kind: 'STAFF', id }))];
    for (const recipient of recipients) await tx.petHotelNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event, recipientKind: recipient.kind, recipientId: recipient.id, dedupeKey: `${booking.id}:${booking.version}:${event}:${recipient.kind}:${recipient.id}`, text, scheduledAt: now, expiresAt: new Date(now.getTime() + 86400000) } });
    if (booking.status !== 'RESERVED') return;
    for (const hours of settings.reminderHours) {
      const scheduledAt = new Date(booking.startsAt.getTime() - hours * 3600000);
      if (scheduledAt.getTime() <= now.getTime() + 5 * 60000) continue;
      for (const recipient of recipients) await tx.petHotelNotification.create({ data: { reservationId: booking.id, reservationVersion: booking.version, event: 'REMINDER', recipientKind: recipient.kind, recipientId: recipient.id, dedupeKey: `${booking.id}:${booking.version}:REMINDER:${hours}:${recipient.kind}:${recipient.id}`, text: `Напоминание. ${text}`, scheduledAt, expiresAt: booking.startsAt } });
    }
  }
  async notifications() {
    const { installation } = await this.context();
    return this.prisma.petHotelNotification.findMany({ where: { reservation: { installationId: installation.id } }, select: { id: true, reservationId: true, event: true, recipientKind: true, status: true, scheduledAt: true, sentAt: true, lastError: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async setupRooms(clientKey: string, actor: AuthEmployee) {
    this.manage(actor);
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx); const { installation } = await this.context(tx);
      const receiptId = `${installation.id}:${actor.id}:setup:${clientKey}`;
      const previous = await tx.petHotelCommandReceipt.findUnique({ where: { id: receiptId } });
      if (previous) return previous.result;
      for (const species of ['CAT', 'DOG']) for (let number = 1; number <= (species === 'CAT' ? 8 : 4); number++) {
        const code = `${species}-${number}`;
        const where = { installationId_code: { installationId: installation.id, code } };
        const current = await tx.petHotelRoom.findUnique({ where });
        const name = `Номер №${number} для ${species === 'CAT' ? 'кошки' : 'собаки'}`;
        const oldDefault = `${species === 'CAT' ? 'Кошачий' : 'Собачий'} бокс №${number}`;
        await tx.petHotelRoom.upsert({ where, create: { installationId: installation.id, code, name, species, sortOrder: (species === 'CAT' ? 0 : 100) + number }, update: current?.name === oldDefault ? { name, version: { increment: 1 } } : {} });
      }
      const result = { rooms: await tx.petHotelRoom.findMany({ where: { installationId: installation.id }, orderBy: { sortOrder: 'asc' } }) };
      await this.audit.log({ actorId: actor.id, action: 'pet_hotel.rooms.setup', entityType: 'ClinicModuleInstallation', entityId: installation.id, metadata: { requestedCats: 8, requestedDogs: 4 } }, tx);
      await tx.petHotelCommandReceipt.create({ data: { id: receiptId, fingerprint: 'owner-approved-8-cat-4-dog', result: json(result) } });
      return result;
    });
  }
  async saveRoom(input: PetHotelRoomDto, actor: AuthEmployee, id?: string) {
    this.manage(actor);
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx); const { installation } = await this.context(tx);
      const code = input.code.trim(), name = input.name.trim();
      if (!code || !name) throw new BadRequestException('Укажите номер и название номера');
      const previous = id ? await tx.petHotelRoom.findFirst({ where: { id, installationId: installation.id } }) : null;
      if (id && !previous) throw new NotFoundException('Номер не найден');
      if (previous && previous.version !== input.version) throw new ConflictException('Номер уже изменён');
      if (previous && (previous.species !== input.species || !input.isActive) && await tx.petHotelReservation.count({ where: { roomId: previous.id, status: { in: active } } })) throw new ConflictException('Сначала завершите или перенесите действующие брони этого номера');
      if (await tx.petHotelRoom.findFirst({ where: { installationId: installation.id, code, ...(id ? { id: { not: id } } : {}) } })) throw new ConflictException('Такой код номера уже существует');
      const data = { code, name, species: input.species, sortOrder: input.sortOrder, isActive: input.isActive, ...(input.dailyRate !== undefined ? { dailyRate: input.dailyRate } : {}) };
      const saved = previous ? await tx.petHotelRoom.update({ where: { id: previous.id }, data: { ...data, version: { increment: 1 } } }) : await tx.petHotelRoom.create({ data: { ...data, installationId: installation.id } });
      await this.audit.log({ actorId: actor.id, action: 'pet_hotel.room.save', entityType: 'PetHotelRoom', entityId: saved.id }, tx);
      return saved;
    });
  }
  async saveSettings(input: PetHotelSettingsDto, actor: AuthEmployee) {
    this.manage(actor);
    if (![input.checkInFrom, input.checkInTo].every(value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) || input.checkInFrom >= input.checkInTo) throw new BadRequestException('Проверьте часы заселения');
    let site: URL; try { site = new URL(input.siteUrl); } catch { throw new BadRequestException('Укажите полный HTTPS-адрес сайта'); }
    if (site.protocol !== 'https:' || site.username || site.password) throw new BadRequestException('Укажите HTTPS-адрес сайта без пароля');
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx); const { installation } = await this.context(tx);
      const { version, ...data } = input;
      if (input.selfBookingEnabled && !await tx.petHotelRoom.count({ where: { installationId: installation.id, isActive: true } })) throw new BadRequestException('Сначала добавьте доступные номера и проверьте тарифы');
      const changed = await tx.petHotelSettings.updateMany({ where: { installationId: installation.id, version }, data: { ...data, siteUrl: site.href, version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Условия уже изменены. Обновите страницу');
      await this.audit.log({ actorId: actor.id, action: 'pet_hotel.settings.save', entityType: 'ClinicModuleInstallation', entityId: installation.id }, tx);
      return tx.petHotelSettings.findUniqueOrThrow({ where: { installationId: installation.id } });
    });
  }
}
