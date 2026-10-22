import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhoneForLookup } from '../../common/phone';
import { bookingAttribution } from '../../common/booking-attribution';
import { AuditService } from '../audit/audit.service';
import { lockPetHotel, PetHotelService } from './pet-hotel.service';
import { HotelOwnerBookDto, HotelOwnerCancelDto, HotelOwnerMoveDto, HotelOwnerOptionsDto, HotelOwnerPetDto } from './pet-hotel-portal.dto';

export type HotelOperation = { id: string; ownerId: string; kind: string; input: Record<string, unknown>; expiresAt: string };
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const species = (v: string | null) => /кош|кот|cat/iu.test(v || '') ? 'CAT' : /собак|dog|п[её]с|щен/iu.test(v || '') ? 'DOG' : null;
const bookingInclude = { room: true, animal: { select: { id: true, nickname: true } } } as const;
type Booking = Prisma.PetHotelReservationGetPayload<{ include: typeof bookingInclude }>;
type Quote = { billableDays: number; dailyRate: string; walkRate: string; stayPrice: string; walksPrice: string; totalPrice: string };
type Offer = { schemaVersion: 1; ownerId: string; animalId: string; roomId: string; roomVersion: number; settingsVersion: number; reservationId?: string; reservationVersion?: number; startsAt: string; endsAt: string; walkCount: number; weightKg?: number; quote: Quote; expiresAt: string };

@Injectable()
export class PetHotelOwnerService {
  constructor(private readonly prisma: PrismaService, private readonly hotel: PetHotelService, private readonly audit: AuditService) {}

  private async owner(tx: Prisma.TransactionClient, ownerId: string) {
    const owner = await tx.owner.findUnique({ where: { id: ownerId }, include: { portalAccess: true } });
    if (!owner || owner.portalAccess?.status === 'BLOCKED') throw new ForbiddenException('Кабинет недоступен. Свяжитесь с клиникой');
    return owner;
  }
  async execute(item: HotelOperation, now = new Date()) {
    if (!item.id || item.id.length > 120 || !item.ownerId || !item.input || Array.isArray(item.input)) throw new BadRequestException('Некорректный запрос гостиницы');
    // Normalize exactly as the forward version before recovering its receipts.
    if (item.kind === 'BOOK' || item.kind === 'RESCHEDULE') {
      const { attribution, ...input } = item.input;
      const accepted = bookingAttribution(attribution);
      item = { ...item, input: { ...input, ...(accepted ? { attribution: accepted } : {}) } };
    }
    const fingerprint = hash({ ownerId: item.ownerId, kind: item.kind, input: item.input }), receiptId = `pet-hotel:portal:${item.id}`;
    return this.prisma.$transaction(async tx => {
      await lockPetHotel(tx);
      // Recover a committed command before expiry, module or self-booking guards.
      const receipt = await tx.petHotelCommandReceipt.findUnique({ where: { id: receiptId } });
      const owner = await this.owner(tx, item.ownerId);
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ConflictException('Запрос уже обработан с другими данными'); return receipt.result; }
      const expiresAt = new Date(item.expiresAt);
      if (!Number.isFinite(+expiresAt) || expiresAt <= now) throw new ConflictException('Запрос истёк. Проверьте состояние брони перед повтором');
      const ctx = await this.hotel.context(tx);
      let result: unknown;
      if (item.kind === 'STATE') {
        if (Object.keys(item.input).length) throw new BadRequestException('Некорректный запрос кабинета');
        const animals = await tx.animal.findMany({ where: { ownerId: owner.id, archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true, weights: { orderBy: { measuredAt: 'desc' }, take: 1, select: { weightKg: true } } }, orderBy: { nickname: 'asc' } });
        const rows = await tx.petHotelReservation.findMany({ where: { ownerId: owner.id, installationId: ctx.installation.id }, include: bookingInclude, orderBy: { startsAt: 'desc' }, take: 500 });
        result = { owner: { fullName: owner.fullName }, animals: animals.map(({ weights, ...animal }) => ({ ...animal, weightKg: weights[0]?.weightKg.toString() ?? null })), bookings: rows.map(b => publicBooking(b, now)), settings: publicSettings(ctx.settings), selfBookingEnabled: !ctx.limited && ctx.settings.selfBookingEnabled, ...(process.env.PET_HOTEL_QA_MODE === 'true' ? { mode: 'qa' } : {}) };
      } else if (item.kind === 'CANCEL') {
        const input = await checked(HotelOwnerCancelDto, item.input);
        const saved = await this.hotel.changeStatus(tx, ctx.installation.id, ctx.settings, input.reservationId, { clientKey: item.id, version: input.version, status: 'CANCELLED' }, now, undefined, owner.id);
        result = publicBooking(saved, now);
      } else {
        if (ctx.limited || !ctx.settings.selfBookingEnabled) throw new ForbiddenException('Самостоятельное бронирование гостиницы отключено');
        if (item.kind === 'OPTIONS') result = await this.options(tx, owner.id, ctx, await checked(HotelOwnerOptionsDto, item.input), now);
        else if (item.kind === 'BOOK' || item.kind === 'RESCHEDULE') {
          const input = item.kind === 'BOOK' ? await checked(HotelOwnerBookDto, item.input) : await checked(HotelOwnerMoveDto, item.input);
          if (!input.contactConsent || !input.bookingConsent) throw new BadRequestException('Подтвердите условия бронирования и разрешение на связь');
          const move = input instanceof HotelOwnerMoveDto ? input : undefined;
          const offer = this.verify(input.offerToken);
          if (offer.ownerId !== owner.id || offer.animalId !== input.animalId || offer.reservationId !== move?.reservationId || (move && offer.reservationVersion !== move.version) || new Date(offer.expiresAt) <= now) throw new ConflictException('Предложение истекло или относится к другой записи. Проверьте номера заново');
          const refreshed = await this.options(tx, owner.id, ctx, { animalId: input.animalId, species: (await tx.petHotelRoom.findUnique({ where: { id: offer.roomId } }))?.species as string, startsAt: offer.startsAt, endsAt: offer.endsAt, weightKg: offer.weightKg, walkCount: offer.walkCount, reservationId: move?.reservationId }, now);
          const room = refreshed.rooms.find(r => r.id === offer.roomId);
          if (!room || room.version !== offer.roomVersion || ctx.settings.version !== offer.settingsVersion || hash(room.quote) !== hash(offer.quote)) throw new ConflictException('Номер или тариф изменился. Проверьте стоимость заново');
          const saved = await this.hotel.saveReservation(tx, ctx.installation.id, ctx.settings, { clientKey: item.id, ownerId: owner.id, animalId: input.animalId, roomId: offer.roomId, startsAt: offer.startsAt, endsAt: offer.endsAt, weightKg: offer.weightKg, walkCount: offer.walkCount, notes: input.notes, ...(move ? { version: move.version } : {}) }, now, undefined, move?.reservationId, 'OWNER_PORTAL');
          await this.audit.log({ action: 'pet_hotel.owner.consents', entityType: 'PetHotelReservation', entityId: saved.id, metadata: { ownerId: owner.id, operationId: item.id, contactConsent: true, bookingConsent: true } }, tx);
          result = publicBooking(saved, now);
        } else if (item.kind === 'PET_CREATE') {
          const input = await checked(HotelOwnerPetDto, item.input);
          if (!input.nickname.trim()) throw new BadRequestException('Укажите кличку питомца');
          const pet = await tx.animal.create({ data: { ownerId: owner.id, nickname: input.nickname.trim(), species: input.species === 'CAT' ? 'Кошка' : 'Собака', breed: input.breed?.trim() || null, ...(input.weightKg ? { weights: { create: { weightKg: input.weightKg, measuredAt: now } } } : {}) }, select: { id: true, nickname: true, species: true, breed: true } });
          await this.audit.log({ action: 'pet_hotel.pet.create', entityType: 'Animal', entityId: pet.id, metadata: { ownerId: owner.id, operationId: item.id, weightSource: 'OWNER_DECLARED' } }, tx);
          await tx.backgroundJob.create({ data: { queueName: 'owner-gateway-snapshot', jobName: 'sync-owner-snapshot', status: 'PENDING', payload: { ownerId: owner.id, visitId: null, visitStatus: null, actorId: null, attempts: 0, nextAttemptAt: now.toISOString() } } });
          result = { ...pet, weightKg: input.weightKg ?? null };
        } else throw new BadRequestException('Неизвестная операция гостиницы');
      }
      const stored = json(result);
      await tx.petHotelCommandReceipt.create({ data: { id: receiptId, fingerprint, result: stored } });
      return stored;
    }, { timeout: 15000 });
  }

  private async options(tx: Prisma.TransactionClient, ownerId: string, ctx: Awaited<ReturnType<PetHotelService['context']>>, input: HotelOwnerOptionsDto, now: Date) {
    const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.startsAt) || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.endsAt) || !Number.isFinite(+startsAt) || !Number.isFinite(+endsAt) || startsAt <= now || +startsAt > +now + 365 * 86400000) throw new BadRequestException('Заезд должен быть в будущем, в течение года');
    const pet = await tx.animal.findFirst({ where: { id: input.animalId, ownerId, archivedAt: null } });
    if (!pet || species(pet.species) !== input.species) throw new BadRequestException('Выберите своего питомца и его вид из карточки');
    const previous = input.reservationId ? await tx.petHotelReservation.findFirst({ where: { id: input.reservationId, ownerId, installationId: ctx.installation.id } }) : null;
    if (input.reservationId && (!previous || previous.animalId !== pet.id || previous.status !== 'RESERVED' || previous.startsAt <= now)) throw new ConflictException('Перенос этой брони недоступен. Свяжитесь с администратором');
    const available = await this.hotel.validateBooking(tx, ctx.installation.id, ctx.settings, { ...input, ownerId, roomId: '', clientKey: 'owner-options', notes: '' }, now, previous?.id, previous || undefined);
    const expiresAt = new Date(+now + 5 * 60000).toISOString();
    return { enabled: true, rooms: available.rooms.map(room => ({ id: room.id, code: room.code, name: room.name, species: room.species, version: room.version, quote: room.quote, expiresAt, offerToken: this.sign({ schemaVersion: 1, ownerId, animalId: pet.id, roomId: room.id, roomVersion: room.version, settingsVersion: ctx.settings.version, ...(previous ? { reservationId: previous.id, reservationVersion: previous.version } : {}), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), walkCount: input.walkCount, ...(input.weightKg ? { weightKg: input.weightKg } : {}), quote: room.quote, expiresAt }) })) };
  }
  async storefrontSnapshot(now = new Date()) {
    const ctx = await this.hotel.context();
    const rooms = await this.prisma.petHotelRoom.findMany({ where: { installationId: ctx.installation.id }, orderBy: { sortOrder: 'asc' } });
    const busy = await this.prisma.petHotelReservation.findMany({ where: { installationId: ctx.installation.id, OR: [{ status: 'RESERVED', endsAt: { gt: now } }, { status: 'IN_HOUSE' }] }, select: { roomId: true, startsAt: true, endsAt: true, status: true }, take: 5001 });
    return { schemaVersion: 1, capturedAt: now.toISOString(), enabled: !ctx.limited, selfBookingEnabled: !ctx.limited && ctx.settings.selfBookingEnabled && busy.length <= 5000, testMode: process.env.PET_HOTEL_QA_MODE === 'true', settings: publicSettings(ctx.settings), rooms: rooms.map(r => ({ id: r.id, code: r.code, name: r.name, species: r.species, dailyRate: (r.dailyRate ?? ctx.settings.dailyRate).toFixed(2), isActive: r.isActive, version: r.version, sortOrder: r.sortOrder })), busy: busy.slice(0, 5000).map(b => ({ ...b, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), status: b.status === 'RESERVED' ? 'CONFIRMED' : b.status })) };
  }

  async register(registrationId: string, maxUserId: string, input: { knownOwnerId?: string; fullName?: string; phone?: string }) {
    if (!/^\d{1,24}$/.test(maxUserId)) throw new BadRequestException('MAX не подтверждён');
    return this.prisma.$transaction(async tx => {
      // The legacy grooming registration holds this lock too: identity is shared,
      // even when its booking module is disabled.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, 2)`;
      await lockPetHotel(tx);
      const id = `pet-hotel:register:${registrationId}`, fingerprint = hash({ maxUserId, input });
      const receipt = await tx.petHotelCommandReceipt.findUnique({ where: { id } });
      if (receipt) { if (receipt.fingerprint !== fingerprint) throw new ConflictException('Вход уже обработан'); await this.owner(tx, (receipt.result as { ownerId: string }).ownerId); return receipt.result; }
      const ctx = await this.hotel.context(tx);
      if (ctx.limited) throw new ForbiddenException('Зоогостиница отключена');
      let owner = input.knownOwnerId ? await this.owner(tx, input.knownOwnerId) : null;
      const linked = await tx.owner.findMany({ where: { maxUserId }, include: { portalAccess: true }, take: 2 });
      if (linked.length > 1 || (owner && ((owner.maxUserId && owner.maxUserId !== maxUserId) || linked.some(o => o.id !== owner!.id)))) return { status: 'REVIEW_REQUIRED', message: 'Для безопасной привязки кабинета свяжитесь с клиникой' };
      owner ||= linked[0] || null;
      if (owner?.portalAccess?.status === 'BLOCKED') throw new ForbiddenException('Кабинет недоступен. Свяжитесь с клиникой');
      if (!owner) {
        const phone = normalizePhoneForLookup(input.phone || ''), fullName = input.fullName?.trim();
        if (!phone || !fullName || fullName.length < 2 || fullName.length > 120) return { status: 'NEEDS_DETAILS' };
        if (await tx.owner.findFirst({ where: { OR: [{ phoneNormalized: phone }, { phone: { in: [input.phone || '', `+${phone}`, phone] } }] }, select: { id: true } })) return { status: 'REVIEW_REQUIRED', message: 'Для привязки существующего клиента свяжитесь с клиникой' };
        owner = await tx.owner.create({ data: { fullName, phone: `+${phone}`, phoneNormalized: phone, source: 'PET_HOTEL_MAX', maxUserId, allowMax: true, preferredNotificationChannel: 'MESSENGER' }, include: { portalAccess: true } });
        await this.audit.log({ action: 'pet_hotel.owner.register', entityType: 'Owner', entityId: owner.id, metadata: { verifiedChannel: 'MAX', registrationId } }, tx);
      } else if (!owner.maxUserId) owner = await tx.owner.update({ where: { id: owner.id }, data: { maxUserId }, include: { portalAccess: true } });
      await tx.clientPortalAccess.upsert({ where: { ownerId: owner.id }, create: { ownerId: owner.id, status: 'ENABLED' }, update: {} });
      const animals = await tx.animal.findMany({ where: { ownerId: owner.id, archivedAt: null }, select: { id: true, nickname: true, species: true, breed: true } });
      const result = json({ ownerId: owner.id, displayName: owner.fullName, owner: { id: owner.id, fullName: owner.fullName, phone: owner.phone }, animals });
      await tx.petHotelCommandReceipt.create({ data: { id, fingerprint, result } });
      return result;
    });
  }
  private secret() { const s = process.env.PET_HOTEL_BOOKING_SIGNING_SECRET?.trim() || process.env.OWNER_GATEWAY_SYNC_SECRET?.trim(); if (!s || s.length < 24) throw new ServiceUnavailableException('Подписание брони гостиницы не настроено'); return s; }
  private sign(value: Offer) { const body = Buffer.from(JSON.stringify(value)).toString('base64url'); return body + '.' + createHmac('sha256', this.secret()).update('pet-hotel-offer:v1:' + body).digest('base64url'); }
  private verify(token: string): Offer {
    try { const [body, signature, extra] = token.split('.'); if (extra || !body || !signature) throw Error(); const expected = createHmac('sha256', this.secret()).update('pet-hotel-offer:v1:' + body).digest(), received = Buffer.from(signature, 'base64url'); if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw Error(); const offer = JSON.parse(Buffer.from(body, 'base64url').toString()) as Offer; if (offer.schemaVersion !== 1 || !offer.ownerId || !offer.animalId || !offer.roomId || !Number.isFinite(Date.parse(offer.expiresAt))) throw Error(); return offer; } catch (e) { if (e instanceof ServiceUnavailableException) throw e; throw new ConflictException('Предложение недействительно. Проверьте свободные номера заново'); }
  }
}
function publicBooking(b: Booking, now: Date) { return { id: b.id, version: b.version, status: b.status === 'RESERVED' ? 'CONFIRMED' : b.status, animalId: b.animalId, animal: b.animal, roomId: b.roomId, room: { name: b.room.name }, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), walkCount: b.walkCount, weightKg: b.weightKg?.toString() ?? null, dailyRate: b.dailyRate.toFixed(2), walkRate: b.walkRate.toFixed(2), billableDays: b.billableDays, totalPrice: b.totalPrice.toFixed(2), notes: b.notes, canCancel: b.status === 'RESERVED', canReschedule: b.status === 'RESERVED' && b.startsAt > now }; }
function publicSettings(s: Prisma.PetHotelSettingsGetPayload<{}>) { return { dailyRate: s.dailyRate.toFixed(2), walkRate: s.walkRate.toFixed(2), minimumDays: s.minimumDays, maximumDogWeightKg: Number(s.maximumDogWeightKg), checkInFrom: s.checkInFrom, checkInTo: s.checkInTo }; }
async function checked<T extends object>(type: new () => T, input: unknown) { const dto = plainToInstance(type, input); if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException('Проверьте поля зоогостиницы'); return dto; }
