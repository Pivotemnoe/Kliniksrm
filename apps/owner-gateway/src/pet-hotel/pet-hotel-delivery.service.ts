import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MaxBotClient } from '../max-bot.client';
import { OwnerNotificationService } from '../owner-notification.service';
import { PrismaService } from '../prisma.service';
import { hashToken } from '../security';
import { hotelInstant } from './pet-hotel-contract';
import { HotelDeliveryDto } from './pet-hotel.dto';

@Injectable()
export class PetHotelDeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly max: MaxBotClient, private readonly notifications: OwnerNotificationService) {}

  async deliver(id: string, input: HotelDeliveryDto, now = new Date()) {
    if (!input.text.trim()) throw new BadRequestException('Укажите текст уведомления');
    const expiresAt = hotelInstant(input.expiresAt);
    if (input.recipientKind === 'STAFF' && !/^\d{1,24}$/.test(input.recipientId)) throw new BadRequestException('Некорректный адресат MAX');
    const fingerprint = hashToken(JSON.stringify({recipientKind: input.recipientKind, recipientId: input.recipientId, kind: input.kind, text: input.text, expiresAt}));
    const ownerInput = {ownerId: input.recipientId, kind: input.kind, text: input.text, expiresAt};
    // One durable intent protects both transport tables, including a role change
    // after UNKNOWN or while the first request is still sending.
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261022, hashtext(${id}))`;
      const intent = await tx.petHotelDeliveryIntent.findUnique({where: {id}});
      if (intent) {
        if (intent.fingerprint !== fingerprint) throw new ConflictException('Ключ доставки уже использован');
        return;
      }
      // Receipts made before the common intent registry must remain protected.
      const previousOwner = await tx.ownerNotificationDelivery.findUnique({where: {id}});
      const previousStaff = await tx.petHotelStaffDelivery.findUnique({where: {id}});
      if (previousOwner && (input.recipientKind !== 'OWNER' || previousOwner.fingerprint !== hashToken(JSON.stringify(ownerInput)))) throw new ConflictException('Ключ доставки уже использован');
      if (previousStaff && (input.recipientKind !== 'STAFF' || previousStaff.fingerprint !== fingerprint)) throw new ConflictException('Ключ доставки уже использован');
      await tx.petHotelDeliveryIntent.create({data: {id, fingerprint}});
    });
    if (input.recipientKind === 'OWNER') {
      // Shared owner preferences/quiet hours/opt-outs; hotel has its own flag and budget.
      return this.notifications.deliver(id, ownerInput, now);
    }
    const claim = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261022, hashtext(${id}))`;
      const current = await tx.petHotelStaffDelivery.findUnique({where: {id}});
      if (current) {
        if (current.fingerprint !== fingerprint) throw new ConflictException('Ключ доставки уже использован');
        if (current.status === 'SENDING' && current.attemptedAt.getTime() < now.getTime() - 60000) {
          await tx.petHotelStaffDelivery.update({where: {id}, data: {status: 'UNKNOWN', completedAt: now}});
          return 'UNKNOWN';
        }
        return current.status;
      }
      if (process.env.PET_HOTEL_CLIENT_NOTIFICATIONS_ENABLED !== 'true') return 'DISABLED';
      if (Date.parse(expiresAt) <= now.getTime()) return 'EXPIRED';
      await tx.petHotelStaffDelivery.create({data: {id, fingerprint, recipientId: input.recipientId, kind: input.kind, status: 'SENDING', attemptedAt: now}});
      return 'CLAIMED';
    });
    if (claim !== 'CLAIMED') return {status: claim};
    try {
      const receipt = await this.max.sendStaffMessage(input.recipientId, input.text);
      await this.finish(id, 'SENT', receipt.messageId);
      return {status: 'SENT'};
    } catch (error) {
      const rejected = Boolean(error && typeof error === 'object' && 'maxRejected' in error && error.maxRejected);
      const status = rejected ? 'REJECTED' : 'UNKNOWN';
      await this.finish(id, status);
      return {status};
    }
  }

  private finish(id: string, status: string, providerMessageId?: string) {
    return this.prisma.petHotelStaffDelivery.updateMany({where: {id, status: 'SENDING'}, data: {status, completedAt: new Date(), providerMessageId}});
  }
}
