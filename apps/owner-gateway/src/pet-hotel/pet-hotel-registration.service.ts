import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma.service';
import { hashToken } from '../security';
import { HotelRegistrationDetailsDto, HotelRegistrationResultDto } from './pet-hotel.dto';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class PetHotelRegistrationService {
  constructor(private readonly prisma: PrismaService) {}
  private enabled() { if (process.env.PET_HOTEL_CRM_SYNC_ENABLED !== 'true') throw new ServiceUnavailableException('Вход в гостиницу пока не подключён'); }
  async beginRegistration(ip: string) {
    this.enabled();
    const botName = (process.env.MAX_BOT_USERNAME || process.env.MAX_BOT_NAME || '').trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?max\.ru\//i, '').replace(/\/+$/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(botName)) throw new ServiceUnavailableException('Вход через MAX ещё не настроен');
    const count = await this.prisma.petHotelRegistration.count({ where: { input: { path: ['ipHash'], equals: hashToken(ip) }, createdAt: { gt: new Date(Date.now() - 3600000) } } });
    if (count >= 10) throw new ConflictException('Слишком много попыток входа. Попробуйте позже');
    const payload = randomBytes(32).toString('base64url'), browserToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.petHotelRegistration.create({ data: { tokenHash: hashToken(payload), browserTokenHash: hashToken(browserToken), input: { ipHash: hashToken(ip) }, expiresAt } });
    return { browserToken, expiresAt, url: `https://max.ru/${botName}?start=${payload}` };
  }
  async bindMax(payload: string, maxUserId: string) {
    if (process.env.PET_HOTEL_CRM_SYNC_ENABLED !== 'true') return false;
    const registration = await this.prisma.petHotelRegistration.findUnique({ where: { tokenHash: hashToken(payload) } });
    if (!registration) return false;
    if (registration.expiresAt <= new Date() || registration.consumedAt || !['WAITING_MAX', 'VERIFIED', 'NEEDS_DETAILS'].includes(registration.status)) return true;
    if (registration.maxUserId && registration.maxUserId !== maxUserId) return true;
    const binding = await this.prisma.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
    const input = registration.input as Record<string, unknown>;
    await this.prisma.petHotelRegistration.updateMany({ where: { id: registration.id, status: 'WAITING_MAX', maxUserId: null }, data: { maxUserId, status: 'VERIFIED', input: json({ ...input, ...(binding ? { knownOwnerId: binding.ownerId } : {}) }) } });
    return true;
  }
  private async registration(browserToken: string) { const item = await this.prisma.petHotelRegistration.findUnique({ where: { browserTokenHash: hashToken(browserToken || '') } }); if (!item || item.expiresAt <= new Date() || item.consumedAt) throw new ForbiddenException('Вход истёк. Начните вход через MAX заново'); return item; }
  async registrationStatus(browserToken: string) { const item = await this.registration(browserToken); return { status: item.status, error: item.error, expiresAt: item.expiresAt }; }
  async registrationDetails(browserToken: string, input: HotelRegistrationDetailsDto) {
    if (!input.contactConsent) throw new BadRequestException('Подтвердите разрешение на связь');
    const item = await this.registration(browserToken);
    if (item.status !== 'NEEDS_DETAILS' || !item.maxUserId) throw new ConflictException('Сначала подтвердите вход через MAX');
    const current = item.input as Record<string, unknown>;
    await this.prisma.petHotelRegistration.updateMany({ where: { id: item.id, status: 'NEEDS_DETAILS' }, data: { input: json({ ...current, fullName: input.fullName.trim(), phone: input.phone.trim(), contactConsent: true }), status: 'VERIFIED' } });
    return { status: 'VERIFIED' };
  }
  async pendingRegistrations() { return { items: (await this.prisma.petHotelRegistration.findMany({ where: { status: 'VERIFIED', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 })).map(item => { const { ipHash, contactConsent, ...input } = item.input as Record<string, unknown>; return { id: item.id, maxUserId: item.maxUserId, input }; }) }; }
  async completeRegistration(id: string, input: HotelRegistrationResultDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261019, hashtext(${id}))`;
      const current = await tx.petHotelRegistration.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Вход не найден');
      if (['READY', 'CONSUMED'].includes(current.status)) return { ok: true };
      if (current.status !== 'VERIFIED' || !current.maxUserId) throw new ConflictException('Вход уже обрабатывается');
      const result = input.result;
      if (input.error || result?.status === 'REVIEW_REQUIRED') { await tx.petHotelRegistration.update({ where: { id }, data: { status: 'REVIEW_REQUIRED', error: input.error || String(result?.message || 'Свяжитесь с клиникой для привязки кабинета') } }); return { ok: true }; }
      if (result?.status === 'NEEDS_DETAILS') { await tx.petHotelRegistration.update({ where: { id }, data: { status: 'NEEDS_DETAILS' } }); return { ok: true }; }
      if (!result || typeof result.ownerId !== 'string' || typeof result.displayName !== 'string') throw new BadRequestException('Некорректный результат входа');
      const conflict = await tx.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: current.maxUserId } } });
      const ownBinding = await tx.messengerBinding.findUnique({ where: { ownerId_channel: { ownerId: result.ownerId, channel: 'MAX' } } });
      if ((conflict && conflict.ownerId !== result.ownerId) || (ownBinding && ownBinding.externalUserId !== current.maxUserId)) throw new ConflictException('Привязка MAX изменилась. Свяжитесь с клиникой');
      const now = new Date();
      await tx.ownerSnapshot.upsert({ where: { ownerId: result.ownerId }, create: { ownerId: result.ownerId, displayName: result.displayName, sourceVersion: 'pet-hotel-onboarding-v1', sourceUpdatedAt: now, payload: json({ owner: result.owner, animals: result.animals || [] }) }, update: {} });
      await tx.messengerBinding.upsert({ where: { ownerId_channel: { ownerId: result.ownerId, channel: 'MAX' } }, create: { ownerId: result.ownerId, channel: 'MAX', externalUserId: current.maxUserId }, update: {} });
      await tx.petHotelRegistration.update({ where: { id }, data: { ownerId: result.ownerId, status: 'READY' } }); return { ok: true };
    });
  }
  async consumeRegistration(browserToken: string) {
    const item = await this.registration(browserToken);
    if (item.status !== 'READY' || !item.ownerId) throw new ConflictException('Подождите подтверждения входа');
    const sessionToken = randomBytes(32).toString('hex'), expiresAt = new Date(Date.now() + 7 * 86400000);
    await this.prisma.$transaction(async tx => {
      const consumed = await tx.petHotelRegistration.updateMany({ where: { id: item.id, status: 'READY', consumedAt: null, expiresAt: { gt: new Date() } }, data: { status: 'CONSUMED', consumedAt: new Date() } });
      if (!consumed.count) throw new ConflictException('Вход уже использован');
      await tx.portalSession.create({ data: { ownerId: item.ownerId!, tokenHash: hashToken(sessionToken), expiresAt } });
    }); return { sessionToken, expiresAt };
  }
}
