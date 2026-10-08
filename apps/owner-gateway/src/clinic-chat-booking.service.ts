import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from './generated/client';
import { PrismaService } from './prisma.service';
import { ClinicChatService } from './clinic-chat.service';
import { hashToken } from './security';
import { ClinicChatBookingResultDto, ClinicChatConfirmDto, ClinicChatSlotsDto } from './dto/clinic-chat-slots.dto';
import { bookingDraft } from './clinic-booking-dialog';
import { contactPhone, snapshotContact } from './clinic-contact';

@Injectable()
export class ClinicChatBookingService {
  constructor(private readonly prisma: PrismaService, private readonly chat: ClinicChatService) {}
  private enabled() {
    this.chat.assertEnabled();
    if (process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED !== 'true') throw new NotFoundException('Самостоятельная запись пока не включена');
  }
  private async identity(token: string | undefined, portalToken: string | undefined) {
    this.enabled();
    const conversation = await this.chat.resolve(token);
    const session = portalToken ? await this.prisma.portalSession.findFirst({ where: { tokenHash: hashToken(portalToken), revokedAt: null, expiresAt: { gt: new Date() } } }) : null;
    if (!session || !conversation.ownerId || session.ownerId !== conversation.ownerId) throw new UnauthorizedException('Для самостоятельной записи войдите в свой личный кабинет и откройте чат из него');
    return conversation;
  }
  async options(token: string | undefined, portalToken: string | undefined, dto: ClinicChatSlotsDto) {
    const row = await this.identity(token, portalToken);
    const input = { ...(dto.serviceId ? { serviceId: dto.serviceId } : {}), ...(dto.serviceQuery ? { serviceQuery: dto.serviceQuery.trim() } : {}),
      ...(dto.preferredTimeText ? { preferredTimeText: dto.preferredTimeText.trim() } : {}), ...(dto.date ? { date: dto.date } : {}),
      ...(dto.draftRevision ? { draftRevision: dto.draftRevision } : {}), ...(dto.from ? { from: dto.from } : {}), ...(dto.recentVisitAnswer !== undefined ? { recentVisitAnswer: dto.recentVisitAnswer } : {}), days: dto.days ?? 2 };
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClinicConversation" WHERE "id" = ${row.id} FOR UPDATE`;
      const previous = await tx.clinicBookingOperation.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } });
      if (previous) { this.same(previous.kind, previous.input, 'OPTIONS', input); return publicOperation(previous); }
      if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, createdAt: { gte: new Date(Date.now() - 600_000) } } }) >= 30) throw new ConflictException('Слишком много запросов времени. Попробуйте позже');
      const current = await tx.clinicConversation.findUniqueOrThrow({ where: { id: row.id } });
      if (current.mode !== 'ASSISTANT') throw new ConflictException('Обращение сейчас обрабатывает администратор');
      if (dto.draftRevision && bookingDraft(current.bookingDraft)?.revision !== dto.draftRevision) throw new ConflictException('Условия записи изменились. Обновите свободное время');
      if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, status: 'PENDING' } })) throw new ConflictException('Предыдущий запрос ещё проверяется');
      return publicOperation(await tx.clinicBookingOperation.create({ data: { conversationId: row.id, ownerId: row.ownerId!, clientKey: dto.clientKey, kind: 'OPTIONS', input } }));
    });
  }
  async confirm(token: string | undefined, portalToken: string | undefined, dto: ClinicChatConfirmDto) {
    const row = await this.identity(token, portalToken);
    if (!dto.contactConsent || !dto.appointmentConsent) throw new BadRequestException('Подтвердите выбранное время и согласие на связь по записи');
    const input = { optionsId: dto.optionsId, animalId: dto.animalId, offerToken: dto.offerToken, contactConsent: true, appointmentConsent: true, comment: dto.comment?.trim() || '' };
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClinicConversation" WHERE "id" = ${row.id} FOR UPDATE`;
      const previous = await tx.clinicBookingOperation.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } });
      if (previous) { this.same(previous.kind, previous.input, 'CONFIRM', input); return publicOperation(previous); }
      if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, createdAt: { gte: new Date(Date.now() - 600_000) } } }) >= 30) throw new ConflictException('Слишком много запросов времени. Попробуйте позже');
      const current = await tx.clinicConversation.findUniqueOrThrow({ where: { id: row.id } });
      if (current.mode !== 'ASSISTANT') throw new ConflictException('Обращение сейчас обрабатывает администратор');
      if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, status: 'PENDING' } })) throw new ConflictException('Предыдущий запрос ещё проверяется');
      const owner = await tx.ownerSnapshot.findUnique({ where: { ownerId: row.ownerId! }, select: { payload: true } });
      const phone = current.phone ? contactPhone(current.phone) : snapshotContact(owner?.payload);
      if (!phone) throw new BadRequestException('Для записи на приём укажите телефон для связи');
      const options = await tx.clinicBookingOperation.findUnique({ where: { id: dto.optionsId } });
      const result = options?.result as { animals?: { id: string; nickname: string }[]; offers?: { offerToken: string; serviceTitle: string; startsAt: string; timezone: string }[] } | null;
      const offer = result?.offers?.find(x => x.offerToken === dto.offerToken);
      if (!options || options.conversationId !== row.id || options.ownerId !== row.ownerId || options.kind !== 'OPTIONS' || options.status !== 'DONE' || !offer || !result?.animals?.some(x => x.id === dto.animalId)) throw new BadRequestException('Выберите время и питомца из предложений своего чата');
      const draftRevision = (options.input as { draftRevision?: number }).draftRevision;
      if (draftRevision && bookingDraft(current.bookingDraft)?.revision !== draftRevision) throw new ConflictException('Условия записи изменились. Обновите свободное время');
      // Each option search is one booking episode. A new key cannot repeat it.
      if (await tx.clinicBookingOperation.findFirst({ where: { conversationId: row.id, kind: 'CONFIRM', status: { in: ['PENDING', 'DONE'] }, input: { path: ['optionsId'], equals: dto.optionsId } } })) throw new ConflictException('Эта запись уже подтверждается или подтверждена');
      const updated = await tx.clinicConversation.update({ where: { id: row.id }, data: { sequence: { increment: 1 }, phone, contactConsent: true, animalNickname: result.animals!.find(x => x.id === dto.animalId)!.nickname } });
      const bookingSequence = updated.sequence;
      await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingSequence } });
      const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short', timeZone: offer.timezone }).format(new Date(offer.startsAt));
      const label = offer.timezone === 'Europe/Moscow' ? 'московское время' : `время филиала, ${offer.timezone}`;
      await tx.clinicChatMessage.create({ data: { conversationId: row.id, sequence: bookingSequence, author: 'OWNER', channel: 'SITE_CHAT', clientKey: `booking:${dto.clientKey}`, text: `Выбрано время: ${date} (${label}). ${offer.serviceTitle}. Проверяем запись в клинике; время ещё не подтверждено.`, deliveryStatus: 'AVAILABLE' } });
      return publicOperation(await tx.clinicBookingOperation.create({ data: { conversationId: row.id, ownerId: row.ownerId!, clientKey: dto.clientKey, kind: 'CONFIRM', bookingSequence, input: { ...input, contactPhone: phone } } }));
    });
  }
  async read(token: string | undefined, portalToken: string | undefined, id: string) {
    const row = await this.identity(token, portalToken);
    const operation = await this.prisma.clinicBookingOperation.findUnique({ where: { id } });
    if (!operation || operation.conversationId !== row.id || operation.ownerId !== row.ownerId) throw new NotFoundException('Запрос не найден');
    return publicOperation(operation);
  }
  async latest(token: string | undefined, portalToken: string | undefined) {
    const row = await this.identity(token, portalToken);
    const operation = await this.prisma.clinicBookingOperation.findFirst({ where: { conversationId: row.id, ownerId: row.ownerId! }, orderBy: { createdAt: 'desc' } });
    return { operation: operation ? publicOperation(operation) : null };
  }
  async pending() {
    this.enabled();
    const items = await this.prisma.clinicBookingOperation.findMany({ where: { status: 'PENDING' }, include: { conversation: { select: { mode: true } } }, orderBy: { createdAt: 'asc' }, take: 30 });
    return { items };
  }
  async complete(id: string, dto: ClinicChatBookingResultDto) {
    this.enabled();
    const operation = await this.prisma.clinicBookingOperation.findUnique({ where: { id } });
    if (!operation) throw new NotFoundException('Запрос не найден');
    if (dto.status === 'DONE') {
      if (!dto.result || JSON.stringify(dto.result).length > 250_000) throw new BadRequestException('Некорректный результат записи');
      if (operation.kind === 'OPTIONS' && (!Array.isArray(dto.result.animals) || !Array.isArray(dto.result.offers) || dto.result.offers.length > 60)) throw new BadRequestException('Некорректные предложения времени');
      if (operation.kind === 'CONFIRM' && (!isUuid(dto.result.requestId) || !isUuid(dto.result.appointmentId) || !['PLANNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(String(dto.result.status)))) throw new BadRequestException('Нет подтверждённого результата CRM');
    }
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClinicConversation" WHERE "id" = ${operation.conversationId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "ClinicBookingOperation" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.clinicBookingOperation.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'PENDING') return publicOperation(current);
      const row = await tx.clinicConversation.findUniqueOrThrow({ where: { id: operation.conversationId } });
      const draftRevision = (operation.input as { draftRevision?: number }).draftRevision;
      const suppressed = operation.kind === 'OPTIONS' && (row.mode !== 'ASSISTANT' || Boolean(draftRevision && bookingDraft(row.bookingDraft)?.revision !== draftRevision));
      const result = await tx.clinicBookingOperation.update({ where: { id }, data: {
        status: suppressed ? 'FAILED' : dto.status, result: suppressed ? Prisma.DbNull : (dto.result as Prisma.InputJsonObject | undefined),
        error: suppressed ? row.mode !== 'ASSISTANT' ? 'Обращение сейчас обрабатывает администратор' : 'Условия записи изменились. Обновите свободное время' : dto.error || null, completedAt: new Date(),
      } });
      const selection = dto.result?.selection as { message?: string } | undefined;
      if (operation.kind === 'OPTIONS' && draftRevision && !suppressed && dto.status === 'DONE' && typeof selection?.message === 'string' && selection.message.length <= 500) {
        const updated = await tx.clinicConversation.update({ where: { id: row.id }, data: { sequence: { increment: 1 } } });
        await tx.clinicChatMessage.create({ data: { conversationId: row.id, sequence: updated.sequence, author: 'ASSISTANT', channel: 'SITE_CHAT', clientKey: `options-result:${id}`, text: selection.message, deliveryStatus: 'AVAILABLE' } });
      }
      if (operation.kind === 'CONFIRM' && dto.status === 'DONE') await tx.clinicConversation.update({ where: { id: row.id }, data: { crmRequestId: String(dto.result!.requestId),
        ...((bookingDraft(row.bookingDraft)?.revision || 0) < (operation.bookingSequence || 0) ? { bookingDraft: Prisma.DbNull } : {}) } });
      return publicOperation(result);
    });
  }
  private same(kind: string, previous: unknown, expectedKind: string, input: unknown) {
    // Contact phone is a server-added immutable queue field, not a public choice.
    if (expectedKind === 'CONFIRM' && previous && typeof previous === 'object') { const { contactPhone: _phone, ...choices } = previous as Record<string, unknown>; previous = choices; }
    if (kind !== expectedKind || JSON.stringify(previous) !== JSON.stringify(input)) {
      // PostgreSQL JSONB key order differs from JS insertion order.
      if (kind !== expectedKind || canonical(previous) !== canonical(input)) throw new ConflictException('Ключ уже использован для другого запроса');
    }
  }
}
function publicOperation(row: { id: string; kind: string; status: string; result: unknown; input: unknown; bookingSequence?: number | null; error: string | null; createdAt: Date }) {
  return { id: row.id, kind: row.kind, status: row.status, result: row.result, error: row.error, createdAt: row.createdAt, draftRevision: (row.input as { draftRevision?: number }).draftRevision || null, bookingSequence: row.bookingSequence || null };
}
function canonical(value: unknown) { return JSON.stringify(value, value && typeof value === 'object' ? Object.keys(value).sort() : undefined); }
function isUuid(value: unknown) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
