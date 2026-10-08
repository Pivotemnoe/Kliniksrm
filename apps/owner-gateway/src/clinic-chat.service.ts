import { BadRequestException, HttpException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from './generated/client';
import { PrismaService } from './prisma.service';
import { hashToken } from './security';
import { clinicChatReply, clinicSafetyIntent } from './clinic-chat-policy';
import { autoBookingReply, bookingDraft, fallbackBookingHints, nextBookingDraft } from './clinic-booking-dialog';
import { ClinicChatBookingDto, ClinicChatCommandDto, ClinicChatContactDto, ClinicChatMessageDto } from './dto/clinic-chat.dto';

import { BoundedRateLimiter } from './abuse-protection';
import { contactPhone, snapshotContact, introduction } from './clinic-contact';
import { PublicClinicCatalogService } from './public-clinic-catalog.service';
import { clinicPriceReply, isClinicPriceQuestion } from './clinic-price-reply';

type Db = Prisma.TransactionClient;
@Injectable()
export class ClinicChatService {
  private readonly maxIngress = new BoundedRateLimiter();
  constructor(private readonly prisma: PrismaService, private readonly catalog: PublicClinicCatalogService = new PublicClinicCatalogService(prisma)) {}
  assertEnabled() {
    if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true') throw new NotFoundException('Чат пока не включён');
  }
  async start(portalToken?: string) {
    this.assertEnabled();
    let ownerId: string | null = null;
    if (portalToken) {
      const session = await this.prisma.portalSession.findFirst({ where: { tokenHash: hashToken(portalToken), expiresAt: { gt: new Date() }, revokedAt: null } });
      // An expired portal cookie must not prevent a guest from contacting the clinic.
      // Only a valid portal session can attach an owner record.
      ownerId = session?.ownerId ?? null;
    }
    const token = randomBytes(32).toString('base64url');
    const conversation = await this.prisma.$transaction(async tx => {
      const owner = ownerId ? await tx.ownerSnapshot.findUnique({ where: { ownerId }, select: { displayName: true, payload: true } }) : null;
      const phone = snapshotContact(owner?.payload);
      const row = await tx.clinicConversation.create({ data: { sessionHash: hashToken(token), sessionExpiresAt: new Date(Date.now() + 7 * 86400_000), ownerId, contactName: owner?.displayName || null, phone, introductionComplete: Boolean(owner && phone) } });
      const welcome = owner ? `Здравствуйте, ${owner.displayName}! Чем можем помочь?${phone ? '' : ' Для записи на приём понадобится номер телефона.'}` : introduction;
      await this.append(tx, row.id, 'ASSISTANT', 'SITE_CHAT', welcome, 'welcome');
      return row;
    });
    return { token, conversation: await this.view(conversation.id) };
  }
  async resolve(token?: string) {
    this.assertEnabled();
    if (!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new UnauthorizedException('Откройте чат заново');
    const conversation = await this.prisma.clinicConversation.findFirst({ where: { sessionHash: hashToken(token), sessionExpiresAt: { gt: new Date() } } });
    if (!conversation) throw new UnauthorizedException('Сессия чата истекла');
    return conversation;
  }
  async read(token?: string) { return this.view((await this.resolve(token)).id); }
  async resolvePublic(token: string | undefined, portalToken?: string) {
    const conversation = await this.resolve(token);
    const session = portalToken ? await this.prisma.portalSession.findFirst({ where: { tokenHash: hashToken(portalToken), expiresAt: { gt: new Date() }, revokedAt: null } }) : null;
    // A chat cookie does not grant access to an owner's conversation after logout
    // or after another owner signs in on the same browser. Guest chats are not
    // silently attached to a subsequently authenticated account either.
    if (conversation.ownerId !== (session?.ownerId ?? null)) throw new UnauthorizedException('Откройте чат заново через свой личный кабинет');
    return conversation;
  }
  async readPublic(token: string | undefined, portalToken?: string) { return this.view((await this.resolvePublic(token, portalToken)).id); }
  async message(token: string | undefined, dto: ClinicChatMessageDto) {
    const row = await this.resolve(token);
    await this.receive(row.id, dto.clientKey, dto.text, 'SITE_CHAT');
    return this.view(row.id);
  }
  async receive(conversationId: string, clientKey: string, text: string, channel: 'SITE_CHAT' | 'MAX') {
    this.assertEnabled();
    return this.prisma.$transaction(async tx => {
      const row = await this.lock(tx, conversationId);
      if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId, clientKey } } })) return;
      await this.ownerMessageQuota(tx, row.id);
      const cleaned = text.trim();
      if (!cleaned || cleaned.length > 4000) throw new BadRequestException('Сообщение должно содержать от 1 до 4000 символов');
      const message = await this.append(tx, row.id, 'OWNER', channel, cleaned, clientKey);
      let suppliedPhone: string | undefined;
      try { if (/^\+?[0-9 ()-]{10,32}$/.test(cleaned)) suppliedPhone = contactPhone(cleaned); } catch {}
      if (suppliedPhone) await tx.clinicConversation.update({ where: { id: row.id }, data: { phone: suppliedPhone } });
      if (row.mode !== 'ASSISTANT') {
        await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
        return;
      }
      if (suppliedPhone && row.introductionComplete) {
        await this.append(tx, row.id, 'ASSISTANT', channel, 'Спасибо! Телефон для связи сохранён. Чем можем помочь?', `reply:${clientKey}`); return;
      }
      if (!row.introductionComplete && !clinicSafetyIntent(cleaned)) {
        const phoneText = cleaned.match(/\+?[0-9][0-9 ()-]{8,30}[0-9]/)?.[0];
        let phone: string | undefined;
        try { if (phoneText) phone = contactPhone(phoneText); } catch {}
        const name = /(?:меня зовут|обращайтесь(?: ко мне)?|можно называть)\s+([\p{L} -]{1,120})/iu.exec(cleaned)?.[1]?.trim() || (/^[А-ЯЁа-яё]{2,40}(?:[ -][А-ЯЁа-яё]{2,40}){0,2}$/.test(cleaned) && !/здравств|привет|добрый|адрес|телефон|запис|при[её]м|режим|работ|где|помог|хочу|цен|стоим|прайс|отказ|не хочу|нет/i.test(cleaned) ? cleaned : undefined);
        const decline = /не (?:хочу|буду|дам|давать|вводить)|без (?:телефона|номера)|отказываюсь/i.test(cleaned);
        if (phone || name || decline || /^(?:здравствуйте|привет|добрый (?:день|вечер|утро))[.! ]*$/i.test(cleaned)) {
          const complete = Boolean((phone || row.phone) && (name || row.contactName)) || decline && row.introductionReminded;
          await tx.clinicConversation.update({ where: { id: row.id }, data: { ...(phone ? { phone } : {}), ...(name ? { contactName: name } : {}), introductionReminded: true, introductionComplete: complete } });
          const reply = complete ? 'Спасибо! Чем можем помочь? Для записи на приём нужен телефон для связи.' : phone ? 'Спасибо! Напишите, пожалуйста, ваше имя или как к вам обращаться.' : decline ? 'Можно продолжить без телефона. Как к вам обращаться? Для записи на приём всё же понадобится номер для связи.' : 'Как к вам обращаться? Напишите имя и телефон для связи. Если не хотите, можете сразу задать вопрос.';
          await this.append(tx, row.id, 'ASSISTANT', channel, reply, `reply:${clientKey}`); return;
        }
        // A visitor can ask their question immediately without completing intake.
        await tx.clinicConversation.update({ where: { id: row.id }, data: { introductionComplete: true } });
      }
      if (isClinicPriceQuestion(cleaned)) {
        let snapshot: unknown;
        try { snapshot = await this.catalog.get(); } catch {}
        const reply = clinicPriceReply(cleaned, snapshot);
        await this.append(tx, row.id, 'ASSISTANT', channel, reply.text, `reply:${clientKey}`);
        if (reply.human) await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
        return;
      }
      if (process.env.CLINIC_ASSISTANT_MODEL_ENABLED === 'true') {
        await tx.clinicAssistantRun.create({ data: { messageId: message.id } });
        return;
      }
      let reply = clinicChatReply(cleaned, configuredFacts());
      const hints = fallbackBookingHints(cleaned);
      // A date-only reply can continue the existing booking dialog. Other
      // unrecognised messages keep the normal handoff policy.
      const dateOnly = cleaned.toLocaleLowerCase('ru').replace(/^(?:мне удобно|лучше|давайте|можно|на|в)\s+/, '').replace(/[.!?]+$/, '').trim();
      if (bookingDraft(row.bookingDraft) && !clinicSafetyIntent(cleaned)
        && ((hints.preferredTimeText && dateOnly === hints.preferredTimeText.toLocaleLowerCase('ru')) || (hints.serviceQuery && dateOnly === hints.serviceQuery.toLocaleLowerCase('ru')))) reply = autoBookingReply();
      if (channel === 'MAX' && reply.intake) reply = { human: true, text: 'Напишите имя, телефон для связи, кличку питомца, причину и удобное время. Администратор уточнит заявку и подтвердит время.' };
      if (reply.intake && channel === 'SITE_CHAT' && process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true') {
        await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingDraft: nextBookingDraft(row.bookingDraft, message.sequence, cleaned, hints) } });
        if (row.ownerId) reply = autoBookingReply();
      }
      await this.append(tx, row.id, 'ASSISTANT', channel, reply.text, `reply:${clientKey}`);
      if (reply.human) await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
    });
  }
  async booking(token: string | undefined, dto: ClinicChatBookingDto) {
    const row = await this.resolve(token);
    if (dto.website?.trim()) throw new BadRequestException('Не удалось отправить сообщение');
    const phone = contactPhone(dto.phone);
    if (!dto.contactConsent) throw new BadRequestException('Разрешите клинике связаться с вами по заявке');
    if (![dto.contactName, dto.phone, dto.animalNickname, dto.comment].every(x => x.trim())) throw new BadRequestException('Заполните обязательные поля');
    if (dto.visitKind === 'FOLLOWUP' && dto.recentVisitAnswer === undefined) throw new BadRequestException('Уточните, был ли питомец на приёме в течение последнего месяца');
    const comment = dto.visitKind ? `${dto.visitKind === 'FOLLOWUP' && dto.recentVisitAnswer ? 'Повторный приём: по словам владельца, визит был в течение месяца. Срок проверит администратор.' : 'Первичный приём.'} ${dto.comment.trim()}` : dto.comment.trim();
    await this.prisma.$transaction(async tx => {
      await this.lock(tx, row.id);
      if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } })) return;
      if (await tx.clinicChatMessage.count({ where: { conversationId: row.id, clientKey: { startsWith: 'receipt:' }, createdAt: { gte: new Date(Date.now() - 600_000) } } }) >= 5) throw new HttpException('Слишком много заявок. Попробуйте позже.', 429);
      if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, kind: 'CONFIRM', status: 'PENDING' } })) throw new ConflictException('Проверяем выбранное время. Дождитесь результата записи перед новой заявкой');
      await tx.clinicConversation.update({ where: { id: row.id }, data: {
        contactName: dto.contactName.trim(), phone, introductionComplete: true, animalNickname: dto.animalNickname.trim(),
        preferredAt: dto.preferredAt ? new Date(dto.preferredAt) : null, contactConsent: true, mode: 'HUMAN', needsAttention: true,
      } });
      const bookingMessage = await this.append(tx, row.id, 'OWNER', 'SITE_CHAT', `Заявка: ${dto.animalNickname.trim()}. ${comment}`, dto.clientKey);
      await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingSequence: bookingMessage.sequence } });
      await this.append(tx, row.id, 'SYSTEM', 'SITE_CHAT', 'Заявка получена. Время ещё не подтверждено. Администратор ответит здесь.', `receipt:${dto.clientKey}`);
    });
    return this.view(row.id);
  }
  async contact(token: string | undefined, dto: ClinicChatContactDto) {
    const row = await this.resolve(token);
    if (dto.website?.trim()) throw new BadRequestException('Не удалось отправить сообщение');
    const phone = !dto.declined && dto.phone?.trim() ? contactPhone(dto.phone) : undefined;
    const name = dto.contactName?.trim();
    if (!dto.declined && !name && !phone) throw new BadRequestException('Напишите, как к вам обращаться, или продолжите без телефона');
    await this.prisma.$transaction(async tx => {
      const current = await this.lock(tx, row.id);
      if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } })) return;
      await this.ownerMessageQuota(tx, row.id);
      await tx.clinicConversation.update({ where: { id: row.id }, data: { ...(name ? { contactName: name } : {}), ...(phone ? { phone } : {}), introductionComplete: Boolean(dto.declined || (name || current.contactName) && (phone || current.phone)), introductionReminded: true } });
      // A supplied phone is contact information, never proof of account ownership.
      await this.append(tx, row.id, 'OWNER', 'SITE_CHAT', dto.declined ? 'Продолжить без телефона' : 'Контактные данные для связи предоставлены.', dto.clientKey);
      if (current.mode === 'ASSISTANT') await this.append(tx, row.id, 'ASSISTANT', 'SITE_CHAT', dto.declined ? 'Можно продолжить без телефона. Если удобно, напишите, как к вам обращаться. Для записи на приём нужен номер для связи. Чем можем помочь?' : phone && !name && !current.contactName ? 'Спасибо! Напишите, пожалуйста, ваше имя или как к вам обращаться.' : `Спасибо${name ? ', ' + name : ''}! Чем можем помочь?${phone ? '' : ' Для записи на приём понадобится телефон.'}`, `reply:${dto.clientKey}`);
    });
    return this.view(row.id);
  }
  private async ownerMessageQuota(tx: Db, id: string) {
    const now = Date.now();
    const [short, daily] = await Promise.all([
      tx.clinicChatMessage.count({ where: { conversationId: id, author: 'OWNER', createdAt: { gte: new Date(now - 600_000) } } }),
      tx.clinicChatMessage.count({ where: { conversationId: id, author: 'OWNER', createdAt: { gte: new Date(now - 86400_000) } } }),
    ]);
    if (short >= 60 || daily >= 200) throw new HttpException('Слишком много сообщений. Попробуйте позже.', 429);
  }
  async link(token?: string) {
    const row = await this.resolve(token);
    const username = (process.env.MAX_BOT_USERNAME || process.env.MAX_BOT_NAME)?.trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?max\.ru\//i, '').replace(/\/+$/, '');
    if (!username || !/^[A-Za-z0-9_-]+$/.test(username)) throw new ServiceUnavailableException('Подключение MAX пока не настроено');
    const invite = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.prisma.clinicChatLink.create({ data: { tokenHash: hashToken(invite), conversationId: row.id, expiresAt } });
    return { url: `https://max.ru/${username}?start=${invite}`, expiresAt };
  }
  async disconnectMax(token?: string) {
    const row = await this.resolve(token);
    await this.stopMax(row.id);
    return this.view(row.id);
  }
  private async stopMax(id: string) {
    await this.prisma.$transaction(async tx => {
      const row = await this.lock(tx, id);
      if (!row.maxConsent) return;
      await tx.clinicConversation.update({ where: { id }, data: { maxConsent: false } });
      await tx.clinicChatMessage.updateMany({ where: { conversationId: id, deliveryStatus: 'PENDING' }, data: { deliveryStatus: 'CANCELLED' } });
      await this.append(tx, id, 'SYSTEM', 'SITE_CHAT', 'Отправка ответов в MAX отключена. Переписка сохранена в чате сайта.', `max-stop:${row.sequence}`);
    });
  }
  async bindMax(payload: string, maxUserId: string) {
    this.assertEnabled();
    return this.prisma.$transaction(async tx => {
      const links = await tx.$queryRaw<{ conversationId: string }[]>`SELECT "conversationId" FROM "ClinicChatLink" WHERE "tokenHash" = ${hashToken(payload)} FOR UPDATE`;
      if (!links.length) return false;
      const link = await tx.clinicChatLink.findUniqueOrThrow({ where: { tokenHash: hashToken(payload) } });
      if (link.usedAt || link.expiresAt <= new Date()) return false;
      const row = await this.lock(tx, link.conversationId);
      if (row.maxUserId && row.maxUserId !== maxUserId) throw new ConflictException('MAX уже подключён к этому чату');
      const existing = await tx.clinicConversation.findUnique({ where: { maxUserId } });
      if (existing && existing.id !== row.id) throw new ConflictException('Этот MAX уже подключён к другому чату');
      const binding = await tx.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
      if (binding && binding.ownerId !== row.ownerId) throw new ConflictException('Откройте чат через свой личный кабинет');
      await tx.clinicChatLink.update({ where: { tokenHash: link.tokenHash }, data: { usedAt: new Date() } });
      await tx.clinicConversation.update({ where: { id: row.id }, data: { maxUserId, maxConsent: true } });
      await this.append(tx, row.id, 'SYSTEM', 'MAX', 'MAX подключён к чату клиники. Ответы администратора по этому обращению будут приходить сюда.', `link:${link.tokenHash}`);
      return true;
    });
  }
  async fromMax(maxUserId: string, clientKey: string, text: string) {
    this.assertEnabled();
    const stop = /^(?:\/stop(?:@\w+)?|стоп|отписаться|отключить (?:max|макс))\s*$/i.test(text.trim());
    let conversation = await this.prisma.clinicConversation.findUnique({ where: { maxUserId } });
    if (stop) { if (conversation) await this.stopMax(conversation.id); return; }
    if (conversation && await this.prisma.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: conversation.id, clientKey } } })) return;
    this.maxIngress.consume(`max:${maxUserId}`, 20, 60_000);
    if (!conversation) {
      const binding = await this.prisma.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
      conversation = await this.prisma.clinicConversation.upsert({ where: { maxUserId }, create: { maxUserId, ownerId: binding?.ownerId, source: 'MAX', maxConsent: true }, update: {} });
    }
    if (!conversation.maxConsent) await this.prisma.clinicConversation.update({ where: { id: conversation.id }, data: { mode: 'HUMAN' } });
    await this.receive(conversation.id, clientKey, text, 'MAX');
  }
  async command(id: string, dto: ClinicChatCommandDto) {
    this.assertEnabled();
    if (dto.action === 'REPLY' && !dto.text?.trim()) throw new BadRequestException('Введите ответ');
    if (dto.action === 'CONFIRM' && (!dto.appointmentId || !dto.text)) throw new BadRequestException('Нет подтверждённой записи');
    return this.prisma.$transaction(async tx => {
      const row = await this.lock(tx, id);
      if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: id, clientKey: dto.clientKey } } })) return { ok: true };
      if (dto.crmRequestId && row.crmRequestId && dto.crmRequestId !== row.crmRequestId) throw new ConflictException('Заявка не соответствует переписке');
      const mode = dto.action === 'RESUME' || (dto.action === 'CONFIRM' && dto.returnToAssistant && row.mode === 'ASSISTANT') ? 'ASSISTANT' : dto.action === 'RESOLVE' ? 'RESOLVED' : 'HUMAN';
      await tx.clinicConversation.update({ where: { id }, data: { mode, needsAttention: false } });
      const text = dto.text?.trim() || (dto.action === 'RESUME' ? 'Администратор вернул диалог ассистенту.' : 'Обращение обработано. Если возникнет новый вопрос, напишите здесь.');
      await this.append(tx, id, dto.action === 'REPLY' ? 'STAFF' : 'SYSTEM', row.maxUserId && row.maxConsent ? 'MAX' : 'SITE_CHAT', text, dto.clientKey);
      return { ok: true };
    });
  }
  async pending() {
    this.assertEnabled();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ClinicConversation" WHERE "sequence" > "acknowledgedSequence" AND ("needsAttention" = true OR "crmRequestId" IS NOT NULL) ORDER BY "updatedAt" ASC LIMIT 50`;
    return { items: await Promise.all(rows.map(row => this.view(row.id))) };
  }
  async acknowledge(id: string, sequence: number, crmRequestId: string) {
    return this.prisma.$transaction(async tx => {
      const row = await this.lock(tx, id);
      if (sequence > row.sequence || sequence < row.acknowledgedSequence) throw new ConflictException('Версия переписки изменилась');
      if (row.crmRequestId && row.crmRequestId !== crmRequestId && row.bookingSequence <= row.acknowledgedSequence) throw new ConflictException('Переписка уже привязана');
      await tx.clinicConversation.update({ where: { id }, data: { acknowledgedSequence: sequence, crmRequestId } });
      return { ok: true };
    });
  }
  async view(id: string) {
    const row = await this.prisma.clinicConversation.findUnique({ where: { id }, include: { messages: { orderBy: { sequence: 'desc' }, take: 200 } } });
    if (!row) throw new NotFoundException('Переписка не найдена');
    const { sessionHash, sessionExpiresAt, acknowledgedSequence, ...safe } = row;
    return { ...safe, canAutoBook: process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true' && Boolean(row.ownerId), messages: row.messages.reverse(), historyLimited: row.sequence > 200 };
  }
  private async lock(tx: Db, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ClinicConversation" WHERE "id" = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Переписка не найдена');
    return tx.clinicConversation.findUniqueOrThrow({ where: { id } });
  }
  private async append(tx: Db, id: string, author: string, channel: string, text: string, clientKey: string) {
    const row = await tx.clinicConversation.update({ where: { id }, data: { sequence: { increment: 1 } } });
    return tx.clinicChatMessage.create({ data: { conversationId: id, sequence: row.sequence, author, channel, text, clientKey,
      deliveryStatus: channel === 'MAX' && author !== 'OWNER' ? 'PENDING' : 'AVAILABLE',
    } });
  }
}
function configuredFacts() {
  return { address: process.env.CLINIC_ASSISTANT_APPROVED_ADDRESS, hours: process.env.CLINIC_ASSISTANT_APPROVED_HOURS, phone: process.env.CLINIC_ASSISTANT_APPROVED_PHONE };
}
