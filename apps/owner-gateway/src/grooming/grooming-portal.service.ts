import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma.service';
import { hashToken } from '../security';
import { MaxBotClient } from '../max-bot.client';
import { OwnerNotificationService } from '../owner-notification.service';
import { GroomingDeliveryDto, GroomingDraftDto, GroomingOperationDto, GroomingOperationResultDto, GroomingRegistrationDetailsDto, GroomingRegistrationResultDto } from './grooming-portal.dto';
import { GROOMING_BREEDS, groomingLook } from './catalog';
import { bookingCommandAttribution, normalizeBookingAttribution } from '../booking-attribution';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const fingerprint = (value: unknown) => hashToken(JSON.stringify(value));
@Injectable()
export class GroomingPortalService {
  constructor(private readonly prisma: PrismaService, private readonly max: MaxBotClient, private readonly notifications: OwnerNotificationService) {}
  private enabled() { if (process.env.GROOMING_CRM_SYNC_ENABLED !== 'true') throw new ServiceUnavailableException('Кабинет груминга пока не подключён'); }
  private async session(token: string) {
    const session = await this.prisma.portalSession.findUnique({ where: { tokenHash: hashToken(token || '') } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw new ForbiddenException('Войдите в личный кабинет');
    return session;
  }
  async operation(token: string, input: GroomingOperationDto) {
    this.enabled(); const session = await this.session(token);
    const commandInput = bookingCommandAttribution(input.kind, input.input);
    if (JSON.stringify(commandInput).length > 14000) throw new BadRequestException('Слишком длинные данные записи');
    const hash = fingerprint({ kind: input.kind, input: commandInput });
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, hashtext(${session.ownerId}))`;
      const live = await tx.portalSession.findFirst({ where: { id: session.id, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!live) throw new ForbiddenException('Войдите в личный кабинет');
      const previous = await tx.groomingPortalOperation.findUnique({ where: { ownerId_clientKey: { ownerId: session.ownerId, clientKey: input.clientKey } } });
      if (previous) { if (previous.fingerprint !== hash) throw new ConflictException('Ключ операции уже использован с другими данными'); return this.publicOperation(previous); }
      const recent = await tx.groomingPortalOperation.count({ where: { ownerId: session.ownerId, createdAt: { gt: new Date(Date.now() - 60000) } } });
      if (recent >= 30) throw new ConflictException('Слишком много запросов. Подождите минуту');
      const saved = await tx.groomingPortalOperation.create({ data: { ownerId: session.ownerId, clientKey: input.clientKey, kind: input.kind, input: json(commandInput), fingerprint: hash, expiresAt: new Date(Date.now() + 10 * 60000) } });
      return this.publicOperation(saved);
    });
  }
  async result(token: string, id: string) { const session = await this.session(token); const operation = await this.prisma.groomingPortalOperation.findFirst({ where: { id, ownerId: session.ownerId } }); if (!operation) throw new NotFoundException('Операция не найдена'); return this.publicOperation(operation); }
  async byKey(token: string, clientKey: string) { const session = await this.session(token); const operation = await this.prisma.groomingPortalOperation.findUnique({ where: { ownerId_clientKey: { ownerId: session.ownerId, clientKey } } }); if (!operation) throw new NotFoundException('Операция не поступила в шлюз'); return this.publicOperation(operation); }
  async createDraft(input: GroomingDraftDto, ip: string, selection?: Record<string, any>) {
    this.enabled();
    const breed = GROOMING_BREEDS.find(b => b.id === input.breedId) || (selection?.catalogData?.breedId === input.breedId ? { id: input.breedId, name: selection.catalogData.breedName, species: selection.species === 'CAT' ? 'cat' : 'dog', size: selection.size.toLowerCase() } : undefined);
    if (!breed || input.looks.some(id => groomingLook(id)?.breedId !== breed.id)) throw new BadRequestException('Выберите образы этой породы');
    const ipHash = hashToken(ip), now = new Date();
    await this.prisma.groomingBookingDraft.deleteMany({ where: { expiresAt: { lt: now } } });
    if (await this.prisma.groomingBookingDraft.count({ where: { ipHash, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= 20) throw new ConflictException('Слишком много запросов. Попробуйте позже');
    const token = randomBytes(32).toString('base64url'), attribution = normalizeBookingAttribution(input.attribution);
    if (selection && selection.species !== (breed.species === 'cat' ? 'CAT' : 'DOG')) throw new BadRequestException('Выберите услугу для этого вида питомца');
    await this.prisma.groomingBookingDraft.create({ data: { tokenHash: hashToken(token), ipHash, expiresAt: new Date(now.getTime() + 15 * 60000), payload: json({ breedId: breed.id, breed: breed.name, species: breed.species === 'cat' ? 'CAT' : 'DOG', size: breed.species === 'cat' ? 'ANY' : String(breed.size || 'small').toUpperCase(), looks: input.looks, notes: input.notes, ...(attribution ? { attribution } : {}), ...(selection ? { selection, serviceId: selection.serviceId, specialistId: selection.specialistId, date: selection.date, coat: selection.coat, size: selection.size } : {}) }) } });
    return { token };
  }
  async consumeDraft(sessionToken: string, token: string) {
    const session = await this.session(sessionToken);
    return this.prisma.$transaction(async tx => {
      const draft = await tx.groomingBookingDraft.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!draft || draft.expiresAt <= new Date()) throw new NotFoundException('Выбранные образы больше не доступны для переноса. Выберите их на сайте снова');
      const claimed = await tx.groomingBookingDraft.updateMany({ where: { id: draft.id, OR: [{ consumedByOwnerId: null }, { consumedByOwnerId: session.ownerId }] }, data: { consumedByOwnerId: session.ownerId } });
      if (!claimed.count) throw new ForbiddenException('Этот набор образов уже открыт в другом кабинете');
      return draft.payload;
    });
  }
  private publicOperation(item: { id: string; kind: string; status: string; result: unknown; error: string | null }) { return { id: item.id, kind: item.kind, status: item.status, result: item.result, error: item.error }; }
  async pending() { this.enabled(); return { items: await this.prisma.groomingPortalOperation.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50 }) }; }
  async complete(id: string, input: GroomingOperationResultDto) {
    const current = await this.prisma.groomingPortalOperation.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Операция не найдена');
    if (current.status !== 'PENDING') { if (current.status !== input.status || fingerprint(current.result) !== fingerprint(input.result || null) || (current.error || null) !== (input.error || null)) throw new ConflictException('Результат операции уже сохранён'); return { ok: true }; }
    await this.prisma.groomingPortalOperation.updateMany({ where: { id, status: 'PENDING' }, data: { status: input.status, result: input.result ? json(input.result) : Prisma.DbNull, error: input.error || null, completedAt: new Date() } });
    return { ok: true };
  }
  async beginRegistration(ip: string) {
    this.enabled();
    const botName = (process.env.MAX_BOT_USERNAME || process.env.MAX_BOT_NAME || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?max\.ru\//i, '').replace(/\/+$/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(botName)) throw new ServiceUnavailableException('Вход через MAX ещё не настроен');
    const count = await this.prisma.groomingRegistration.count({ where: { input: { path: ['ipHash'], equals: hashToken(ip) }, createdAt: { gt: new Date(Date.now() - 3600000) } } });
    if (count >= 10) throw new ConflictException('Слишком много попыток входа. Попробуйте позже');
    const payload = randomBytes(32).toString('base64url'), browserToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.groomingRegistration.create({ data: { tokenHash: hashToken(payload), browserTokenHash: hashToken(browserToken), input: { ipHash: hashToken(ip) }, expiresAt } });
    return { browserToken, expiresAt, url: `https://max.ru/${botName}?start=${payload}` };
  }
  async bindMax(payload: string, maxUserId: string) {
    const registration = await this.prisma.groomingRegistration.findUnique({ where: { tokenHash: hashToken(payload) } });
    if (!registration) return false;
    if (registration.expiresAt <= new Date() || registration.consumedAt || !['WAITING_MAX', 'VERIFIED', 'NEEDS_DETAILS'].includes(registration.status)) return true;
    if (registration.maxUserId && registration.maxUserId !== maxUserId) return true;
    const binding = await this.prisma.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
    const input = registration.input as Record<string, unknown>;
    await this.prisma.groomingRegistration.updateMany({ where: { id: registration.id, status: 'WAITING_MAX', maxUserId: null }, data: { maxUserId, status: 'VERIFIED', input: json({ ...input, ...(binding ? { knownOwnerId: binding.ownerId } : {}) }) } });
    return true;
  }
  private async registration(browserToken: string) { const item = await this.prisma.groomingRegistration.findUnique({ where: { browserTokenHash: hashToken(browserToken || '') } }); if (!item || item.expiresAt <= new Date() || item.consumedAt) throw new ForbiddenException('Вход истёк. Начните вход через MAX заново'); return item; }
  async registrationStatus(browserToken: string) { const item = await this.registration(browserToken); return { status: item.status, error: item.error, expiresAt: item.expiresAt }; }
  async registrationDetails(browserToken: string, input: GroomingRegistrationDetailsDto) {
    if (!input.contactConsent) throw new BadRequestException('Подтвердите разрешение на связь');
    const item = await this.registration(browserToken);
    if (item.status !== 'NEEDS_DETAILS' || !item.maxUserId) throw new ConflictException('Сначала подтвердите вход через MAX');
    const current = item.input as Record<string, unknown>;
    await this.prisma.groomingRegistration.updateMany({ where: { id: item.id, status: 'NEEDS_DETAILS' }, data: { input: json({ ...current, fullName: input.fullName.trim(), phone: input.phone.trim(), contactConsent: true }), status: 'VERIFIED' } });
    return { status: 'VERIFIED' };
  }
  async pendingRegistrations() { return { items: (await this.prisma.groomingRegistration.findMany({ where: { status: 'VERIFIED', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 })).map(item => { const { ipHash, contactConsent, ...input } = item.input as Record<string, unknown>; return { id: item.id, maxUserId: item.maxUserId, input }; }) }; }
  async completeRegistration(id: string, input: GroomingRegistrationResultDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, hashtext(${id}))`;
      const current = await tx.groomingRegistration.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Вход не найден');
      if (['READY', 'CONSUMED'].includes(current.status)) return { ok: true };
      if (current.status !== 'VERIFIED' || !current.maxUserId) throw new ConflictException('Вход уже обрабатывается');
      const result = input.result;
      if (input.error || result?.status === 'REVIEW_REQUIRED') { await tx.groomingRegistration.update({ where: { id }, data: { status: 'REVIEW_REQUIRED', error: input.error || String(result?.message || 'Свяжитесь с клиникой для привязки кабинета') } }); return { ok: true }; }
      if (result?.status === 'NEEDS_DETAILS') { await tx.groomingRegistration.update({ where: { id }, data: { status: 'NEEDS_DETAILS' } }); return { ok: true }; }
      if (!result || typeof result.ownerId !== 'string' || typeof result.displayName !== 'string') throw new BadRequestException('Некорректный результат входа');
      const conflict = await tx.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: current.maxUserId } } });
      const ownBinding = await tx.messengerBinding.findUnique({ where: { ownerId_channel: { ownerId: result.ownerId, channel: 'MAX' } } });
      if ((conflict && conflict.ownerId !== result.ownerId) || (ownBinding && ownBinding.externalUserId !== current.maxUserId)) throw new ConflictException('Привязка MAX изменилась. Свяжитесь с клиникой');
      const now = new Date();
      await tx.ownerSnapshot.upsert({ where: { ownerId: result.ownerId }, create: { ownerId: result.ownerId, displayName: result.displayName, sourceVersion: 'grooming-onboarding-v1', sourceUpdatedAt: now, payload: json({ owner: result.owner, animals: result.animals || [] }) }, update: {} });
      await tx.messengerBinding.upsert({ where: { ownerId_channel: { ownerId: result.ownerId, channel: 'MAX' } }, create: { ownerId: result.ownerId, channel: 'MAX', externalUserId: current.maxUserId }, update: {} });
      await tx.groomingRegistration.update({ where: { id }, data: { ownerId: result.ownerId, status: 'READY' } }); return { ok: true };
    });
  }
  async consumeRegistration(browserToken: string) {
    const item = await this.registration(browserToken);
    if (item.status !== 'READY' || !item.ownerId) throw new ConflictException('Подождите подтверждения входа');
    const sessionToken = randomBytes(32).toString('hex'), expiresAt = new Date(Date.now() + 7 * 86400000);
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.groomingRegistration.updateMany({ where: { id: item.id, status: 'READY', consumedAt: null, expiresAt: { gt: new Date() } }, data: { status: 'CONSUMED', consumedAt: new Date() } });
      if (!consumed.count) throw new ConflictException('Вход уже использован');
      await tx.portalSession.create({ data: { ownerId: item.ownerId!, tokenHash: hashToken(sessionToken), expiresAt } });
    }); return { sessionToken, expiresAt };
  }
  async deliver(id: string, input: GroomingDeliveryDto) {
    if (process.env.GROOMING_CLIENT_NOTIFICATIONS_ENABLED !== 'true') return { status: 'DISABLED' };
    if (input.recipientKind === 'OWNER') return this.notifications.deliver(id, { ownerId: input.recipientId, kind: input.kind, text: input.text, expiresAt: input.expiresAt });
    if (!/^\d{1,24}$/.test(input.recipientId)) throw new BadRequestException('Некорректный адресат MAX');
    const hash = fingerprint(input), now = new Date();
    if (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now.getTime()) return { status: 'EXPIRED' };
    const claim = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, hashtext(${id}))`;
      const current = await tx.groomingStaffDelivery.findUnique({ where: { id } });
      if (current) { if (current.fingerprint !== hash) throw new ConflictException('Ключ доставки уже использован'); if (current.status === 'SENDING' && now.getTime() - current.attemptedAt.getTime() > 60000) { await tx.groomingStaffDelivery.update({ where: { id }, data: { status: 'UNKNOWN' } }); return 'UNKNOWN'; } return current.status; }
      await tx.groomingStaffDelivery.create({ data: { id, fingerprint: hash, recipientId: input.recipientId, status: 'SENDING' } }); return 'CLAIMED';
    });
    if (claim !== 'CLAIMED') return { status: claim };
    try { const result = await this.max.sendStaffMessage(input.recipientId, input.text); await this.prisma.groomingStaffDelivery.update({ where: { id }, data: { status: 'SENT', providerMessageId: result.messageId } }); return { status: 'SENT' }; }
    catch { await this.prisma.groomingStaffDelivery.update({ where: { id }, data: { status: 'UNKNOWN' } }); return { status: 'UNKNOWN' }; }
  }
}
