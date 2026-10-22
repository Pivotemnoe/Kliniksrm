"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClinicChatService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("./generated/client");
const prisma_service_1 = require("./prisma.service");
const security_1 = require("./security");
const clinic_chat_policy_1 = require("./clinic-chat-policy");
const clinic_booking_dialog_1 = require("./clinic-booking-dialog");
const abuse_protection_1 = require("./abuse-protection");
const clinic_contact_1 = require("./clinic-contact");
const public_clinic_catalog_service_1 = require("./public-clinic-catalog.service");
const clinic_price_reply_1 = require("./clinic-price-reply");
const clinic_checkup_1 = require("./clinic-checkup");
let ClinicChatService = class ClinicChatService {
    prisma;
    catalog;
    maxIngress = new abuse_protection_1.BoundedRateLimiter();
    constructor(prisma, catalog = new public_clinic_catalog_service_1.PublicClinicCatalogService(prisma)) {
        this.prisma = prisma;
        this.catalog = catalog;
    }
    assertEnabled() {
        if (process.env.CLINIC_ASSISTANT_ENABLED !== 'true')
            throw new common_1.NotFoundException('Чат пока не включён');
    }
    async start(portalToken) {
        this.assertEnabled();
        let ownerId = null;
        if (portalToken) {
            const session = await this.prisma.portalSession.findFirst({ where: { tokenHash: (0, security_1.hashToken)(portalToken), expiresAt: { gt: new Date() }, revokedAt: null } });
            ownerId = session?.ownerId ?? null;
        }
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const conversation = await this.prisma.$transaction(async (tx) => {
            const owner = ownerId ? await tx.ownerSnapshot.findUnique({ where: { ownerId }, select: { displayName: true, payload: true } }) : null;
            const phone = (0, clinic_contact_1.snapshotContact)(owner?.payload);
            const row = await tx.clinicConversation.create({ data: { sessionHash: (0, security_1.hashToken)(token), sessionExpiresAt: new Date(Date.now() + 7 * 86400_000), ownerId, contactName: owner?.displayName || null, phone, introductionComplete: true } });
            const welcome = owner ? `Здравствуйте, ${owner.displayName}! Расскажите, чем помочь питомцу.` : clinic_contact_1.introduction;
            await this.append(tx, row.id, 'ASSISTANT', 'SITE_CHAT', welcome, 'welcome');
            return row;
        });
        return { token, conversation: await this.view(conversation.id) };
    }
    async resolve(token) {
        this.assertEnabled();
        if (!token || !/^[A-Za-z0-9_-]{40,100}$/.test(token))
            throw new common_1.UnauthorizedException('Откройте чат заново');
        const conversation = await this.prisma.clinicConversation.findFirst({ where: { sessionHash: (0, security_1.hashToken)(token), sessionExpiresAt: { gt: new Date() } } });
        if (!conversation)
            throw new common_1.UnauthorizedException('Сессия чата истекла');
        return conversation;
    }
    async read(token) { return this.view((await this.resolve(token)).id); }
    async resolvePublic(token, portalToken) {
        const conversation = await this.resolve(token);
        const session = portalToken ? await this.prisma.portalSession.findFirst({ where: { tokenHash: (0, security_1.hashToken)(portalToken), expiresAt: { gt: new Date() }, revokedAt: null } }) : null;
        if (conversation.ownerId !== (session?.ownerId ?? null))
            throw new common_1.UnauthorizedException('Откройте чат заново через свой личный кабинет');
        return conversation;
    }
    async readPublic(token, portalToken) { return this.view((await this.resolvePublic(token, portalToken)).id); }
    async message(token, dto) {
        const row = await this.resolve(token);
        await this.receive(row.id, dto.clientKey, dto.text, 'SITE_CHAT');
        return this.view(row.id);
    }
    async receive(conversationId, clientKey, text, channel) {
        this.assertEnabled();
        return this.prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, conversationId);
            if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId, clientKey } } }))
                return;
            await this.ownerMessageQuota(tx, row.id);
            const cleaned = text.trim();
            if (!cleaned || cleaned.length > 4000)
                throw new common_1.BadRequestException('Сообщение должно содержать от 1 до 4000 символов');
            const message = await this.append(tx, row.id, 'OWNER', channel, cleaned, clientKey);
            const catalogSelection = channel === 'SITE_CHAT' && /^Хочу уточнить визит и стоимость выбранных услуг из прейскуранта:\s*\n1\.\s+\S/u.test(cleaned);
            if (catalogSelection && (0, clinic_checkup_1.checkupState)(row.bookingDraft)) {
                await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingDraft: client_1.Prisma.DbNull } });
                row.bookingDraft = null;
            }
            let suppliedPhone;
            if (channel === 'MAX') {
                try {
                    if (/^\+?[0-9 ()-]{10,32}$/.test(cleaned))
                        suppliedPhone = (0, clinic_contact_1.contactPhone)(cleaned);
                }
                catch { }
                if (suppliedPhone)
                    await tx.clinicConversation.update({ where: { id: row.id }, data: { phone: suppliedPhone } });
            }
            if (row.mode !== 'ASSISTANT') {
                if ((0, clinic_chat_policy_1.hasClinicReplyContact)(row))
                    await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
                else {
                    await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: false, mode: 'ASSISTANT' } });
                    await this.append(tx, row.id, 'ASSISTANT', channel, (0, clinic_chat_policy_1.clinicContactRequiredReply)((0, clinic_chat_policy_1.clinicSafetyIntent)(cleaned)), `reply:${clientKey}`);
                }
                return;
            }
            if (suppliedPhone && row.introductionComplete) {
                await this.append(tx, row.id, 'ASSISTANT', channel, 'Спасибо! Телефон для связи сохранён. Чем можем помочь?', `reply:${clientKey}`);
                return;
            }
            if (channel === 'MAX' && !row.introductionComplete && !(0, clinic_chat_policy_1.clinicSafetyIntent)(cleaned)) {
                const phoneText = cleaned.match(/\+?[0-9][0-9 ()-]{8,30}[0-9]/)?.[0];
                let phone;
                try {
                    if (phoneText)
                        phone = (0, clinic_contact_1.contactPhone)(phoneText);
                }
                catch { }
                const name = /(?:меня зовут|обращайтесь(?: ко мне)?|можно называть)\s+([\p{L} -]{1,120})/iu.exec(cleaned)?.[1]?.trim() || (/^[А-ЯЁа-яё]{2,40}(?:[ -][А-ЯЁа-яё]{2,40}){0,2}$/.test(cleaned) && !/здравств|привет|добрый|адрес|телефон|запис|при[её]м|режим|работ|где|помог|хочу|цен|стоим|прайс|отказ|не хочу|нет/i.test(cleaned) ? cleaned : undefined);
                const decline = /не (?:хочу|буду|дам|давать|вводить)|без (?:телефона|номера)|отказываюсь/i.test(cleaned);
                if (phone || name || decline || /^(?:здравствуйте|привет|добрый (?:день|вечер|утро))[.! ]*$/i.test(cleaned)) {
                    const complete = Boolean((phone || row.phone) && (name || row.contactName)) || decline && row.introductionReminded;
                    await tx.clinicConversation.update({ where: { id: row.id }, data: { ...(phone ? { phone } : {}), ...(name ? { contactName: name } : {}), introductionReminded: true, introductionComplete: complete } });
                    const reply = complete ? 'Спасибо! Чем можем помочь? Для записи на приём нужен телефон для связи.' : phone ? 'Спасибо! Напишите, пожалуйста, ваше имя или как к вам обращаться.' : decline ? 'Можно продолжить без телефона. Как к вам обращаться? Для записи на приём всё же понадобится номер для связи.' : 'Как к вам обращаться? Напишите имя и телефон для связи. Если не хотите, можете сразу задать вопрос.';
                    await this.append(tx, row.id, 'ASSISTANT', channel, reply, `reply:${clientKey}`);
                    return;
                }
                await tx.clinicConversation.update({ where: { id: row.id }, data: { introductionComplete: true } });
            }
            if (catalogSelection && !(0, clinic_chat_policy_1.clinicSafetyIntent)((0, clinic_checkup_1.checkupSafetyText)(cleaned))) {
                const handoff = (0, clinic_chat_policy_1.hasClinicReplyContact)(row);
                await tx.clinicConversation.update({ where: { id: row.id }, data: { mode: handoff ? 'HUMAN' : 'ASSISTANT', needsAttention: handoff } });
                await this.append(tx, row.id, 'ASSISTANT', channel, handoff
                    ? 'Список услуг сохранён в обращении для администратора. Время визита и окончательную стоимость согласуют с вами отдельно.'
                    : `Список услуг сохранён в переписке. ${(0, clinic_chat_policy_1.clinicContactRequiredReply)()}`, `reply:${clientKey}`);
                return;
            }
            const checkup = !(0, clinic_chat_policy_1.clinicSafetyIntent)((0, clinic_checkup_1.checkupSafetyText)(cleaned)) ? (0, clinic_checkup_1.checkupDialogue)(cleaned, row.bookingDraft, message.sequence) : null;
            if (checkup) {
                const handoff = checkup.wantsBooking && (0, clinic_chat_policy_1.hasClinicReplyContact)(row);
                await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingDraft: checkup.draft, ...(handoff ? { mode: 'HUMAN', needsAttention: true } : {}) } });
                await this.append(tx, row.id, 'ASSISTANT', channel, checkup.text + (handoff ? '\n\nПередал выбранную программу администратору. Ответ появится здесь.' : ''), `reply:${clientKey}`);
                return;
            }
            if ((0, clinic_chat_policy_1.isClinicOffersQuestion)(cleaned)) {
                await this.append(tx, row.id, 'ASSISTANT', channel, (0, clinic_chat_policy_1.clinicChatReply)(cleaned).text, `reply:${clientKey}`);
                return;
            }
            if ((0, clinic_price_reply_1.isClinicPriceQuestion)(cleaned)) {
                let snapshot;
                try {
                    snapshot = await this.catalog.get();
                }
                catch { }
                const reply = (0, clinic_price_reply_1.clinicPriceReply)(cleaned, snapshot);
                const handoff = reply.human && (0, clinic_chat_policy_1.hasClinicReplyContact)(row);
                await this.append(tx, row.id, 'ASSISTANT', channel, reply.human && !handoff ? (0, clinic_chat_policy_1.clinicContactRequiredReply)() : reply.text, `reply:${clientKey}`);
                if (handoff)
                    await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
                return;
            }
            if (process.env.CLINIC_ASSISTANT_MODEL_ENABLED === 'true') {
                await tx.clinicAssistantRun.create({ data: { messageId: message.id } });
                return;
            }
            let reply = (0, clinic_chat_policy_1.clinicChatReply)(cleaned, configuredFacts());
            const hints = (0, clinic_booking_dialog_1.fallbackBookingHints)(cleaned);
            const dateOnly = cleaned.toLocaleLowerCase('ru').replace(/^(?:мне удобно|лучше|давайте|можно|на|в)\s+/, '').replace(/[.!?]+$/, '').trim();
            if ((0, clinic_booking_dialog_1.bookingDraft)(row.bookingDraft) && !(0, clinic_chat_policy_1.clinicSafetyIntent)(cleaned)
                && ((hints.preferredTimeText && dateOnly === hints.preferredTimeText.toLocaleLowerCase('ru')) || (hints.serviceQuery && dateOnly === hints.serviceQuery.toLocaleLowerCase('ru'))))
                reply = (0, clinic_booking_dialog_1.autoBookingReply)();
            if (channel === 'MAX' && reply.intake)
                reply = { human: true, text: 'Напишите имя, телефон для связи, кличку питомца, причину и удобное время. Администратор уточнит заявку и подтвердит время.' };
            if (reply.intake && channel === 'SITE_CHAT' && process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true') {
                await tx.clinicConversation.update({ where: { id: row.id }, data: { bookingDraft: (0, clinic_booking_dialog_1.nextBookingDraft)(row.bookingDraft, message.sequence, cleaned, hints) } });
                if (row.ownerId)
                    reply = (0, clinic_booking_dialog_1.autoBookingReply)();
            }
            const handoff = reply.human && (0, clinic_chat_policy_1.hasClinicReplyContact)(row);
            await this.append(tx, row.id, 'ASSISTANT', channel, reply.human && !handoff ? (0, clinic_chat_policy_1.clinicContactRequiredReply)((0, clinic_chat_policy_1.clinicSafetyIntent)(cleaned)) : reply.text, `reply:${clientKey}`);
            if (handoff)
                await tx.clinicConversation.update({ where: { id: row.id }, data: { needsAttention: true, mode: 'HUMAN' } });
        });
    }
    async booking(token, dto) {
        const row = await this.resolve(token);
        if (dto.website?.trim())
            throw new common_1.BadRequestException('Не удалось отправить сообщение');
        const phone = (0, clinic_contact_1.contactPhone)(dto.phone);
        if (!dto.contactConsent)
            throw new common_1.BadRequestException('Разрешите клинике связаться с вами по заявке');
        if (![dto.contactName, dto.phone, dto.animalNickname, dto.comment].every(x => x.trim()))
            throw new common_1.BadRequestException('Заполните обязательные поля');
        if (dto.visitKind === 'FOLLOWUP' && dto.recentVisitAnswer === undefined)
            throw new common_1.BadRequestException('Уточните, был ли питомец на приёме в течение последнего месяца');
        const comment = dto.visitKind ? `${dto.visitKind === 'FOLLOWUP' && dto.recentVisitAnswer ? 'Повторный приём: по словам владельца, визит был в течение месяца. Срок проверит администратор.' : 'Первичный приём.'} ${dto.comment.trim()}` : dto.comment.trim();
        await this.prisma.$transaction(async (tx) => {
            await this.lock(tx, row.id);
            if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } }))
                return;
            if (await tx.clinicChatMessage.count({ where: { conversationId: row.id, clientKey: { startsWith: 'receipt:' }, createdAt: { gte: new Date(Date.now() - 600_000) } } }) >= 5)
                throw new common_1.HttpException('Слишком много заявок. Попробуйте позже.', 429);
            if (await tx.clinicBookingOperation.count({ where: { conversationId: row.id, kind: 'CONFIRM', status: 'PENDING' } }))
                throw new common_1.ConflictException('Проверяем выбранное время. Дождитесь результата записи перед новой заявкой');
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
    async contact(token, dto) {
        const row = await this.resolve(token);
        if (dto.website?.trim())
            throw new common_1.BadRequestException('Не удалось отправить сообщение');
        if (dto.declined) {
            if (dto.phone?.trim() || dto.contactName?.trim() || dto.surname?.trim() || dto.patronymic?.trim() || dto.contactConsent || dto.preferredReplyChannel)
                throw new common_1.BadRequestException('Выберите одно действие');
            await this.prisma.$transaction(async (tx) => {
                await this.lock(tx, row.id);
                if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } }))
                    return;
                await this.ownerMessageQuota(tx, row.id);
                await this.append(tx, row.id, 'OWNER', 'SITE_CHAT', 'Продолжить без контакта', dto.clientKey);
            });
            return this.view(row.id);
        }
        const privacy = clinicLeadPolicy();
        if (dto.contactConsent !== true)
            throw new common_1.BadRequestException('Подтвердите согласие на связь по этому обращению');
        if (!dto.phone?.trim())
            throw new common_1.BadRequestException('Укажите телефон для обратной связи');
        const phone = (0, clinic_contact_1.contactPhone)(dto.phone);
        const firstName = dto.contactName?.trim();
        if (!firstName)
            throw new common_1.BadRequestException('Укажите имя для обращения');
        const name = [dto.surname?.trim(), firstName, dto.patronymic?.trim()].filter(Boolean).join(' ');
        await this.prisma.$transaction(async (tx) => {
            const locked = await this.lock(tx, row.id);
            if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: row.id, clientKey: dto.clientKey } } }))
                return;
            await this.ownerMessageQuota(tx, row.id);
            if (dto.preferredReplyChannel === 'MAX' && (!locked.maxUserId || !locked.maxConsent))
                throw new common_1.BadRequestException('Сначала подключите свой MAX к этому чату');
            const replyChannel = dto.preferredReplyChannel === 'MAX' ? 'MAX' : dto.preferredReplyChannel === 'SITE_CHAT' ? 'чат сайта' : 'телефон';
            await tx.clinicConversation.update({ where: { id: row.id }, data: {
                    contactName: name, phone, contactConsent: true,
                    introductionComplete: true, mode: 'HUMAN', needsAttention: true,
                } });
            const program = (0, clinic_checkup_1.checkupSummary)(locked.bookingDraft);
            await this.append(tx, row.id, 'OWNER', 'SITE_CHAT', `${program ? program + ' ' : ''}Прошу связаться со мной по обращению. Предпочтительный способ ответа: ${replyChannel}.`, dto.clientKey);
            await this.append(tx, row.id, 'SYSTEM', 'SITE_CHAT', `Согласие на обратную связь по обращению подтверждено. Документ: ${privacy.url}; редакция: ${privacy.version}. Рекламная рассылка не подключена.`, `consent:${dto.clientKey}`);
        });
        return this.view(row.id);
    }
    async ownerMessageQuota(tx, id) {
        const now = Date.now();
        const [short, daily] = await Promise.all([
            tx.clinicChatMessage.count({ where: { conversationId: id, author: 'OWNER', createdAt: { gte: new Date(now - 600_000) } } }),
            tx.clinicChatMessage.count({ where: { conversationId: id, author: 'OWNER', createdAt: { gte: new Date(now - 86400_000) } } }),
        ]);
        if (short >= 60 || daily >= 200)
            throw new common_1.HttpException('Слишком много сообщений. Попробуйте позже.', 429);
    }
    async link(token) {
        const row = await this.resolve(token);
        const username = (process.env.MAX_BOT_USERNAME || process.env.MAX_BOT_NAME)?.trim().replace(/^@/, '').replace(/^https?:\/\/(?:www\.)?max\.ru\//i, '').replace(/\/+$/, '');
        if (!username || !/^[A-Za-z0-9_-]+$/.test(username))
            throw new common_1.ServiceUnavailableException('Подключение MAX пока не настроено');
        const invite = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const expiresAt = new Date(Date.now() + 5 * 60_000);
        await this.prisma.clinicChatLink.create({ data: { tokenHash: (0, security_1.hashToken)(invite), conversationId: row.id, expiresAt } });
        return { url: `https://max.ru/${username}?start=${invite}`, expiresAt };
    }
    async disconnectMax(token) {
        const row = await this.resolve(token);
        await this.stopMax(row.id);
        return this.view(row.id);
    }
    async stopMax(id) {
        await this.prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, id);
            if (!row.maxConsent)
                return;
            await tx.clinicConversation.update({ where: { id }, data: { maxConsent: false } });
            await tx.clinicChatMessage.updateMany({ where: { conversationId: id, deliveryStatus: 'PENDING' }, data: { deliveryStatus: 'CANCELLED' } });
            await this.append(tx, id, 'SYSTEM', 'SITE_CHAT', 'Отправка ответов в MAX отключена. Переписка сохранена в чате сайта.', `max-stop:${row.sequence}`);
        });
    }
    async bindMax(payload, maxUserId) {
        this.assertEnabled();
        return this.prisma.$transaction(async (tx) => {
            const links = await tx.$queryRaw `SELECT "conversationId" FROM "ClinicChatLink" WHERE "tokenHash" = ${(0, security_1.hashToken)(payload)} FOR UPDATE`;
            if (!links.length)
                return false;
            const link = await tx.clinicChatLink.findUniqueOrThrow({ where: { tokenHash: (0, security_1.hashToken)(payload) } });
            if (link.usedAt || link.expiresAt <= new Date())
                return false;
            const row = await this.lock(tx, link.conversationId);
            if (row.maxUserId && row.maxUserId !== maxUserId)
                throw new common_1.ConflictException('MAX уже подключён к этому чату');
            const existing = await tx.clinicConversation.findUnique({ where: { maxUserId } });
            if (existing && existing.id !== row.id)
                throw new common_1.ConflictException('Этот MAX уже подключён к другому чату');
            const binding = await tx.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
            if (binding && binding.ownerId !== row.ownerId)
                throw new common_1.ConflictException('Откройте чат через свой личный кабинет');
            await tx.clinicChatLink.update({ where: { tokenHash: link.tokenHash }, data: { usedAt: new Date() } });
            await tx.clinicConversation.update({ where: { id: row.id }, data: { maxUserId, maxConsent: true } });
            await this.append(tx, row.id, 'SYSTEM', 'MAX', 'MAX подключён к чату клиники. Ответы администратора по этому обращению будут приходить сюда.', `link:${link.tokenHash}`);
            return true;
        });
    }
    async fromMax(maxUserId, clientKey, text) {
        this.assertEnabled();
        const stop = /^(?:\/stop(?:@\w+)?|стоп|отписаться|отключить (?:max|макс))\s*$/i.test(text.trim());
        let conversation = await this.prisma.clinicConversation.findUnique({ where: { maxUserId } });
        if (stop) {
            if (conversation)
                await this.stopMax(conversation.id);
            return;
        }
        if (conversation && await this.prisma.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: conversation.id, clientKey } } }))
            return;
        this.maxIngress.consume(`max:${maxUserId}`, 20, 60_000);
        if (!conversation) {
            const binding = await this.prisma.messengerBinding.findUnique({ where: { channel_externalUserId: { channel: 'MAX', externalUserId: maxUserId } } });
            conversation = await this.prisma.clinicConversation.upsert({ where: { maxUserId }, create: { maxUserId, ownerId: binding?.ownerId, source: 'MAX', maxConsent: true }, update: {} });
        }
        if (!conversation.maxConsent)
            await this.prisma.clinicConversation.update({ where: { id: conversation.id }, data: { mode: 'HUMAN' } });
        await this.receive(conversation.id, clientKey, text, 'MAX');
    }
    async command(id, dto) {
        this.assertEnabled();
        if (dto.action === 'REPLY' && !dto.text?.trim())
            throw new common_1.BadRequestException('Введите ответ');
        if (dto.action === 'CONFIRM' && (!dto.appointmentId || !dto.text))
            throw new common_1.BadRequestException('Нет подтверждённой записи');
        return this.prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, id);
            if (await tx.clinicChatMessage.findUnique({ where: { conversationId_clientKey: { conversationId: id, clientKey: dto.clientKey } } }))
                return { ok: true };
            if (dto.crmRequestId && row.crmRequestId && dto.crmRequestId !== row.crmRequestId)
                throw new common_1.ConflictException('Заявка не соответствует переписке');
            if (dto.action === 'REPLY' && !(0, clinic_chat_policy_1.hasClinicReplyContact)(row))
                throw new common_1.ConflictException('Для ответа администратора посетитель должен оставить контакт');
            const mode = dto.action === 'RESUME' || (dto.action === 'CONFIRM' && dto.returnToAssistant && row.mode === 'ASSISTANT') ? 'ASSISTANT' : dto.action === 'RESOLVE' ? 'RESOLVED' : 'HUMAN';
            await tx.clinicConversation.update({ where: { id }, data: { mode, needsAttention: false } });
            const text = dto.text?.trim() || (dto.action === 'RESUME' ? 'Администратор вернул диалог ассистенту.' : 'Обращение обработано. Если возникнет новый вопрос, напишите здесь.');
            await this.append(tx, id, dto.action === 'REPLY' ? 'STAFF' : 'SYSTEM', row.maxUserId && row.maxConsent ? 'MAX' : 'SITE_CHAT', text, dto.clientKey);
            return { ok: true };
        });
    }
    async pending() {
        this.assertEnabled();
        const rows = await this.prisma.$queryRaw `SELECT "id" FROM "ClinicConversation" WHERE "sequence" > "acknowledgedSequence" AND ("needsAttention" = true OR "crmRequestId" IS NOT NULL) ORDER BY "updatedAt" ASC LIMIT 50`;
        return { items: await Promise.all(rows.map(row => this.view(row.id))) };
    }
    async acknowledge(id, sequence, crmRequestId) {
        return this.prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, id);
            if (sequence > row.sequence || sequence < row.acknowledgedSequence)
                throw new common_1.ConflictException('Версия переписки изменилась');
            if (row.crmRequestId && row.crmRequestId !== crmRequestId && row.bookingSequence <= row.acknowledgedSequence)
                throw new common_1.ConflictException('Переписка уже привязана');
            await tx.clinicConversation.update({ where: { id }, data: { acknowledgedSequence: sequence, crmRequestId } });
            return { ok: true };
        });
    }
    async view(id) {
        const row = await this.prisma.clinicConversation.findUnique({ where: { id }, include: { messages: { orderBy: { sequence: 'desc' }, take: 200 } } });
        if (!row)
            throw new common_1.NotFoundException('Переписка не найдена');
        const { sessionHash, sessionExpiresAt, acknowledgedSequence, ...safe } = row;
        return { ...safe, canAutoBook: process.env.CLINIC_ASSISTANT_AUTO_BOOKING_ENABLED === 'true' && Boolean(row.ownerId), messages: row.messages.reverse(), historyLimited: row.sequence > 200 };
    }
    async lock(tx, id) {
        const rows = await tx.$queryRaw `SELECT "id" FROM "ClinicConversation" WHERE "id" = ${id} FOR UPDATE`;
        if (!rows.length)
            throw new common_1.NotFoundException('Переписка не найдена');
        return tx.clinicConversation.findUniqueOrThrow({ where: { id } });
    }
    async append(tx, id, author, channel, text, clientKey) {
        const row = await tx.clinicConversation.update({ where: { id }, data: { sequence: { increment: 1 } } });
        return tx.clinicChatMessage.create({ data: { conversationId: id, sequence: row.sequence, author, channel, text, clientKey,
                deliveryStatus: channel === 'MAX' && author !== 'OWNER' ? 'PENDING' : 'AVAILABLE',
            } });
    }
};
exports.ClinicChatService = ClinicChatService;
exports.ClinicChatService = ClinicChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, public_clinic_catalog_service_1.PublicClinicCatalogService])
], ClinicChatService);
function configuredFacts() {
    return { address: process.env.CLINIC_ASSISTANT_APPROVED_ADDRESS, hours: process.env.CLINIC_ASSISTANT_APPROVED_HOURS, phone: process.env.CLINIC_ASSISTANT_APPROVED_PHONE };
}
function clinicLeadPolicy() {
    const url = process.env.CLINIC_CHAT_PRIVACY_URL?.trim();
    const version = process.env.CLINIC_CHAT_PRIVACY_VERSION?.trim();
    if (process.env.CLINIC_CHAT_LEADS_ENABLED !== 'true' || !url || !version)
        throw new common_1.ServiceUnavailableException('Форма обратной связи пока не включена');
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'clinic.temichevvet.ru' || !/^[-\w.]{1,64}$/.test(version))
            throw new Error('Invalid policy');
    }
    catch {
        throw new common_1.ServiceUnavailableException('Документ обратной связи не настроен');
    }
    return { url, version };
}
//# sourceMappingURL=clinic-chat.service.js.map