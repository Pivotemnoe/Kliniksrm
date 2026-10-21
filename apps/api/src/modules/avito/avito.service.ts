import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';
import { AvitoApiChat, AvitoApiClient, AvitoApiMessage, avitoPilotAllowsChat } from './avito-api.client';
import { decideAvitoReply, ContactState, providedCallbackPhone } from './avito.policy';
import { administratorWorking, avitoPricing } from './avito-availability';
import { AVITO_CAPABILITIES, defaultAvitoSettings, parseAvitoSettings } from './avito.settings';
import { AvitoCallDto, AvitoListDto, AvitoModeDto, AvitoReplyDto, UpdateAvitoSettingsDto } from './dto/avito.dto';
import { AvitoCrmKnowledgeService, AvitoCrmQuestion, avitoNeedsQuestionPlan, crmQuestion } from './avito-crm-knowledge.service';
import { AvitoDialogueTurn, AvitoModelGatewayClient, AvitoModelIntent, boundedAvitoHistory } from './avito-model-gateway.client';
import { loadPetServiceContext, petServiceAnswer } from './avito-pet-services';

type DB = Prisma.TransactionClient;
const safeError = (error: unknown) => error instanceof ServiceUnavailableException ? error.message : 'Операция не завершена. Проверьте соединение и конечный результат.';
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
// Preserve the complete message and its questions; the primary intent must not erase other requests.
const crmIntentQuery = (text: string, intent: AvitoModelIntent | null) => intent?.questions?.length || crmQuestion(text) ? text : intent?.action === 'PRICE' ? `Сколько стоит ${intent.serviceQuery ?? ''}` : intent?.action === 'HOURS' ? `Часы работы ${intent.serviceQuery ?? ''}` : intent?.action === 'ADDRESS' ? 'Адрес' : intent?.action === 'PHONE' ? 'Номер телефона' : text;

@Injectable()
export class AvitoService {
  constructor(private readonly prisma: PrismaService, private readonly modules: ClinicModulesService, private readonly api: AvitoApiClient, private readonly audit: AuditService, private readonly crm: AvitoCrmKnowledgeService, private readonly model: AvitoModelGatewayClient) {}
  now() { return new Date(); }

  async integration() {
    const installation = await this.modules.installation('avito-administrator');
    const initial = json(defaultAvitoSettings());
    return this.prisma.avitoIntegration.upsert({ where: { installationId: installation.id }, update: {}, create: { installationId: installation.id, settings: initial, revisions: { create: { version: 1, settings: initial } } }, include: { installation: true } });
  }
  async overview(director: boolean) {
    const integration = await this.integration();
    const settings = parseAvitoSettings(integration.settings);
    const nightContact = director ? await this.crm.clinicContact(integration.installation.organizationId, this.prisma, settings.administratorSchedule.officeId) : undefined;
    const [pending, uncertain, failedEvents] = await Promise.all([
      this.prisma.avitoOutgoingOperation.count({ where: { conversation: { integrationId: integration.id }, status: { in: ['PENDING', 'SENDING'] } } }),
      this.prisma.avitoOutgoingOperation.count({ where: { conversation: { integrationId: integration.id }, status: 'UNCERTAIN' } }),
      this.prisma.avitoIncomingEvent.count({ where: { integrationId: integration.id, status: 'PENDING', attempts: { gte: 5 } } }),
    ]);
    return {
      installation: integration.installation, entitled: await this.modules.entitlement('avito-administrator'),
      connection: { accountId: integration.accountId, accountName: integration.accountName, checkedAt: integration.checkedAt, lastSyncAt: integration.lastSyncAt, error: integration.connectionError, credentialsConfigured: this.api.configured() },
      runtime: { ingestionEnabled: this.api.ingestionEnabled(), liveSendEnabled: this.api.liveSendEnabled(), languageModelConfigured: this.model.configured(), localReadOnly: process.env.AVITO_LOCAL_READ_ONLY === 'true', pilotRestricted: Boolean(process.env.AVITO_PILOT_CHAT_IDS?.trim()) },
      health: { pending, uncertain, failedEvents },
      settingsVersion: integration.settingsVersion, mode: settings.mode,
      profiles: settings.profiles.map(({ direction, title, enabled }) => ({ direction, title, enabled, listingIds: settings.listings.filter(l => l.enabled && l.direction === direction).map(l => l.id) })),
      intake: { recipientRole: 'administrator', clinicKnowledgeSource: settings.clinicProgrammeTable ? 'CRM_AND_OWNER_PROGRAMME_TABLE' : 'CRM', doctorSelection: false, automaticBooking: false },
      ...(director ? { settings, capabilities: AVITO_CAPABILITIES, nightContact } : {}),
    };
  }
  async updateSettings(dto: UpdateAvitoSettingsDto, actorId: string) {
    const current = await this.integration(); const settings = parseAvitoSettings(dto.settings);
    if (settings.mode === 'AUTO' && !this.api.liveSendEnabled()) throw new BadRequestException('Сначала нужно разрешить реальную отправку на сервере после проверки пилота');
    if (settings.mode === 'AUTO' && settings.profiles.some(profile => profile.direction === 'CLINIC' && profile.enabled) && !(await this.crm.clinicContact(current.installation.organizationId, this.prisma, settings.administratorSchedule.officeId)).phone) throw new BadRequestException('Для ночной связи нужен основной номер в CRM. Выберите филиал, если у клиники несколько номеров.');
    return this.prisma.$transaction(async tx => {
      const changed = await tx.avitoIntegration.updateMany({ where: { id: current.id, settingsVersion: dto.version }, data: { settings: json(settings), settingsVersion: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Правила изменены в другой вкладке. Обновите страницу.');
      await tx.avitoSettingsRevision.create({ data: { integrationId: current.id, version: dto.version + 1, settings: json(settings), actorId } });
      // Put previously unassigned history in the right inbox, preserving human
      // control. Mapping an advertisement must never revive historical replies.
      for (const profile of settings.profiles.filter(p => p.enabled)) {
        const listingIds = settings.listings.filter(l => l.enabled && l.direction === profile.direction).map(l => l.id);
        if (!listingIds.length) continue;
        const classified = await tx.avitoConversation.updateMany({ where: { integrationId: current.id, listingId: { in: listingIds }, direction: 'UNASSIGNED' }, data: { direction: profile.direction, mode: 'HUMAN', version: { increment: 1 } } });
        if (classified.count) await this.audit.log({ actorId, action: 'avito.conversations.classify', entityType: 'AvitoIntegration', entityId: current.id, metadata: { listingIds, direction: profile.direction, count: classified.count, automaticRepliesResumed: false } }, tx);
      }
      await tx.avitoOutgoingOperation.updateMany({ where: { conversation: { integrationId: current.id }, status: { in: ['DRAFT', 'PENDING'] }, actorId: null }, data: { status: 'CANCELLED', error: 'Правила ответа изменены' } });
      await this.audit.log({ actorId, action: 'avito.settings.update', entityType: 'AvitoIntegration', entityId: current.id, metadata: { version: dto.version + 1, mode: settings.mode } }, tx);
      return { version: dto.version + 1 };
    });
  }
  async revisions() {
    const integration = await this.integration();
    return this.prisma.avitoSettingsRevision.findMany({ where: { integrationId: integration.id }, orderBy: { version: 'desc' }, take: 30 });
  }
  async restoreRevision(version: number, expectedVersion: number, actorId: string) {
    const integration = await this.integration();
    const revision = await this.prisma.avitoSettingsRevision.findUnique({ where: { integrationId_version: { integrationId: integration.id, version } } });
    if (!revision) throw new NotFoundException('Версия правил не найдена');
    // Restoring is a new audited revision, never erases history or re-enables AUTO.
    return this.updateSettings({ version: expectedVersion, settings: { ...revision.settings as object, mode: 'SUGGEST' } }, actorId);
  }
  async simulate(listingId: string, text: string, contact?: Record<string, unknown>, at?: string, options: { useAi?: boolean; clientKey?: string } = {}) {
    const integration = await this.integration();
    const c: ContactState = {};
    for (const key of ['name', 'phone', 'reason', 'summary', 'serviceDetails', 'callbackAt', 'callbackMessageId'] as const) if (typeof contact?.[key] === 'string') c[key] = String(contact[key]).slice(0, 2000);
    // Simulator state is never used to persist an inquiry; live ingestion checks
    // the original incoming message containing the callback number.
    if (contact?.collecting === true) c.collecting = true;
    if (contact?.bookingChoiceOffered === true) c.bookingChoiceOffered = true;
    if (contact?.bookingChannel === 'WEBSITE' || contact?.bookingChannel === 'CALLBACK') c.bookingChannel = contact.bookingChannel;
    if (contact?.serviceQuestionAsked === true) c.serviceQuestionAsked = true;
    if (contact?.awaitingServiceDetails === true) c.awaitingServiceDetails = true;
    const settings = parseAvitoSettings(integration.settings);
    const rule = settings.listings.find(l => l.id === listingId && l.enabled);
    const profile = settings.profiles.find(p => p.direction === rule?.direction && p.enabled);
    const now = at ? new Date(at) : this.now();
    let intent: AvitoModelIntent | null = null;
    let modelStatus = options.useAi ? 'RULES_SUFFICIENT' : 'NOT_REQUESTED';
    if (options.useAi && (!options.clientKey || options.clientKey.length < 16 || options.clientKey.length > 100)) throw new BadRequestException('Для проверки ИИ нужен уникальный идентификатор запроса');
    const preliminary = decideAvitoReply({ settings, listingId, text, contact: c, messageId: 'simulation', skipAvailability: true, now });
    if (options.useAi && rule && profile && avitoNeedsQuestionPlan(text, preliminary.reason)) {
      intent = await this.model.classify(`simulation:${integration.id}:${integration.settingsVersion}:${options.clientKey}`, profile, text, rule);
      modelStatus = intent ? 'USED' : 'UNAVAILABLE';
    }
    const query = crmIntentQuery(text, intent);
    const crmAnswer = rule?.direction === 'CLINIC' ? await this.crm.answer(integration.installation.organizationId, query, this.prisma, rule.crmQuery, settings.administratorSchedule.officeId, intent?.questions, { ...avitoPricing(settings, now), petSpecies: c.petSpecies }) : null;
    const clinic = rule?.direction === 'CLINIC' ? await this.crm.clinicContact(integration.installation.organizationId, this.prisma, settings.administratorSchedule.officeId) : null;
    const petService = rule && profile ? await loadPetServiceContext(this.prisma, integration.installation.organizationId, rule.direction) : undefined;
    return { kind: options.useAi ? 'AI_ASSISTED_SCENARIO' : 'RULE_SCENARIO', persisted: false, modelStatus, decision: decideAvitoReply({ settings, listingId, text, contact: c, messageId: 'simulation', crmAnswer, clinicPhone: clinic?.phone, intent, now, petService }) };
  }
  async checkConnection(actorId: string) {
    const integration = await this.integration();
    try {
      const profile = await this.api.self();
      if (!Number.isSafeInteger(profile.id) || profile.id <= 0) throw new ServiceUnavailableException('Не удалось определить профиль Авито');
      if (integration.accountId && integration.accountId !== String(profile.id)) throw new ConflictException('Ключи относятся к другому профилю. Переключение аккаунта с историей запрещено.');
      await this.api.chats(String(profile.id));
      await this.prisma.avitoIntegration.update({ where: { id: integration.id }, data: { accountId: String(profile.id), accountName: String(profile.name ?? '').slice(0, 200), checkedAt: new Date(), connectionError: null } });
      await this.audit.log({ actorId, action: 'avito.connection.check', entityType: 'AvitoIntegration', entityId: integration.id, metadata: { accountId: String(profile.id) } });
      return { accountId: String(profile.id), accountName: profile.name ?? '', messagingRead: true };
    } catch (error) {
      await this.prisma.avitoIntegration.update({ where: { id: integration.id }, data: { connectionError: safeError(error) } });
      throw error;
    }
  }
  /** Reading the saved inventory never calls Avito, including after a CRM restart. */
  async savedListings(page = 1, status = 'all') {
    this.validateListingPage(page, status);
    const integration = await this.requireConnected();
    return this.listingSnapshot(integration.id, integration.accountId!, page, status);
  }
  async ownListings(page = 1, status = 'all') {
    this.validateListingPage(page, status);
    const integration = await this.requireConnected();
    let result: Awaited<ReturnType<AvitoApiClient['ownListings']>>;
    try {
      const profile = await this.api.self();
      if (String(profile.id) !== integration.accountId) throw new ConflictException('Ключи относятся к другому профилю Авито');
      result = await this.api.ownListings(page, status);
    }
    catch (error) {
      if (error instanceof ConflictException) throw error;
      const saved = await this.listingSnapshot(integration.id, integration.accountId!, page, status);
      if (saved.capturedAt) return { ...saved, refreshError: safeError(error) };
      throw error;
    }
    const capturedAt = new Date();
    await this.prisma.$transaction(async tx => {
      // An account switch cannot write old-account advertisements into the current inventory.
      await tx.$queryRaw`SELECT "id" FROM "AvitoIntegration" WHERE "id" = ${integration.id} FOR UPDATE`;
      const current = await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id } });
      if (current.accountId !== integration.accountId) throw new ConflictException('Профиль Авито изменился. Обновите список заново.');
      await tx.avitoListingSnapshot.upsert({
        where: { integrationId_status_page: { integrationId: integration.id, status, page } },
        create: { integrationId: integration.id, accountId: integration.accountId!, status, page, items: json(result.items), nextPage: result.nextPage, capturedAt },
        update: { accountId: integration.accountId!, items: json(result.items), nextPage: result.nextPage, capturedAt },
      });
    });
    return { ...result, capturedAt, source: 'AVITO' as const, refreshError: null };
  }
  private validateListingPage(page: number, status: string) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 201 || !['all', 'active', 'old', 'removed', 'blocked', 'rejected'].includes(status)) throw new BadRequestException('Некорректный фильтр объявлений');
  }
  private async listingSnapshot(integrationId: string, accountId: string, page: number, status: string) {
    const saved = await this.prisma.avitoListingSnapshot.findUnique({ where: { integrationId_status_page: { integrationId, status, page } } });
    const usable = saved?.accountId === accountId;
    return {
      items: usable ? saved.items as unknown as Awaited<ReturnType<AvitoApiClient['ownListings']>>['items'] : [],
      nextPage: usable ? saved.nextPage : null,
      capturedAt: usable ? saved.capturedAt : null,
      source: usable ? 'SAVED' as const : 'EMPTY' as const,
      refreshError: null as string | null,
    };
  }
  private async requireConnected() {
    await this.modules.assertEnabled('avito-administrator');
    const integration = await this.integration();
    if (!integration.accountId) throw new BadRequestException('Сначала проверьте подключение Авито');
    return integration;
  }
  async listInquiries(query: AvitoListDto) {
    const integration = await this.integration();
    const rows = await this.prisma.avitoInquiry.findMany({
      where: { conversation: { integrationId: integration.id }, contactName: { not: '' }, phone: { not: '' }, contactMessageId: { not: '' }, ...(query.direction ? { direction: query.direction } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: { id: true, conversationId: true, requestId: true, direction: true, contactName: true, phone: true, summary: true, status: true, contactRecordedAt: true, contactMessageId: true, contactBasis: true, createdAt: true, conversation: { select: { listingId: true, listingTitle: true } } },
    });
    return { recipientRole: 'administrator', items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
  }
  async listConversations(query: AvitoListDto) {
    const integration = await this.integration();
    const items = await this.prisma.avitoConversation.findMany({
      where: { integrationId: integration.id, ...(query.direction ? { direction: query.direction } : {}), ...(query.attention ? { needsAttention: query.attention === 'true' } : {}) },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { request: { select: { id: true, status: true, appointmentId: true } }, inquiries: { orderBy: { createdAt: 'desc' }, take: 1 }, messages: { orderBy: { occurredAt: 'desc' }, take: 1 } },
    });
    return { items: items.slice(0, 50), nextCursor: items.length > 50 ? items[49].id : null };
  }
  private async conversation(id: string, tx: DB = this.prisma) {
    const integration = await this.integration();
    const conversation = await tx.avitoConversation.findFirst({ where: { id, integrationId: integration.id } });
    if (!conversation) throw new NotFoundException('Диалог Авито не найден');
    return conversation;
  }
  async getConversation(id: string) {
    const conversation = await this.conversation(id);
    const [messages, outbox, inquiries] = await Promise.all([
      this.prisma.avitoMessage.findMany({ where: { conversationId: id }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 100 }),
      this.prisma.avitoOutgoingOperation.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.avitoInquiry.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return { ...conversation, messages: messages.reverse(), outbox, inquiries };
  }
  async setMode(id: string, dto: AvitoModeDto, actorId: string) {
    await this.modules.assertEnabled('avito-administrator'); await this.conversation(id); const integration = await this.integration();
    return this.prisma.$transaction(async tx => {
      await lockConversation(tx, id);
      const c = await tx.avitoConversation.findUniqueOrThrow({ where: { id } });
      let mappedDirection: string | undefined;
      if (dto.mode === 'BOT') {
        const settings = parseAvitoSettings((await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id } })).settings);
        const mapping = settings.listings.find(l => l.id === c.listingId && l.enabled);
        if (!mapping || (c.direction !== 'UNASSIGNED' && mapping.direction !== c.direction) || !settings.profiles.find(p => p.direction === mapping.direction)?.enabled) throw new BadRequestException('Сначала настройте объявление и его направление');
        if (c.direction === 'UNASSIGNED') mappedDirection = mapping.direction;
        if (c.stage === 'TRANSFERRED') throw new BadRequestException('Заявка уже у администратора. Для нового обращения начните новый цикл после обработки текущего.');
      }
      const changed = await tx.avitoConversation.updateMany({ where: { id, version: dto.version }, data: { mode: dto.mode, ...(mappedDirection ? { direction: mappedDirection, contact: {} } : {}), needsAttention: dto.mode === 'HUMAN', version: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('Диалог изменился. Обновите его перед действием.');
      await cancelQueued(tx, id, 'Диалог принят сотрудником или приостановлен');
      await this.audit.log({ actorId, action: 'avito.conversation.mode', entityType: 'AvitoConversation', entityId: id, metadata: { mode: dto.mode } }, tx);
      return tx.avitoConversation.findUniqueOrThrow({ where: { id } });
    });
  }

  async sync(offset = 0) {
    const integration = await this.requireConnected();
    const chats = await this.api.chats(integration.accountId!, offset);
    let imported = 0;
    for (const chat of chats) imported += await this.syncChat(chat.id, chat);
    await this.prisma.avitoIntegration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), connectionError: null } });
    return { chats: chats.length, imported, nextOffset: chats.length === 20 ? offset + 20 : null };
  }
  async syncChat(chatId: string, knownChat?: AvitoApiChat) {
    const integration = await this.requireConnected(); const accountId = integration.accountId!;
    const chat = knownChat ?? await this.api.chat(accountId, chatId);
    if (chat.id !== chatId || chat.context?.type !== 'item') throw new BadRequestException('Диалог не привязан к объявлению Авито');
    const existing = await this.prisma.avitoConversation.findUnique({ where: { integrationId_externalChatId: { integrationId: integration.id, externalChatId: chatId } } });
    const history: AvitoApiMessage[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await this.api.messages(accountId, chatId, offset); history.push(...page);
      if (page.length < 100 || !existing || page.some(m => existing.lastMessageAt && m.created * 1000 < existing.lastMessageAt.getTime())) break;
      if (offset === 900) throw new ConflictException('Слишком большой непроверенный разрыв истории. Требуется отдельная сверка диалога.');
    }
    const imported = await this.ingestCanonical(integration, chat, history);
    const stored = await this.prisma.avitoMessage.findMany({ where: { conversation: { integrationId: integration.id, externalChatId: chatId }, externalId: { in: history.map(m => m.id).filter(Boolean) } }, select: { externalId: true } });
    if (stored.length) await this.prisma.avitoIncomingEvent.updateMany({ where: { integrationId: integration.id, externalChatId: chatId, externalMessageId: { in: stored.map(m => m.externalId) }, status: 'PENDING' }, data: { status: 'DONE', error: null } });
    return imported;
  }
  private async ingestCanonical(integration: Awaited<ReturnType<AvitoService['integration']>>, chat: AvitoApiChat, history: AvitoApiMessage[]) {
    const settings = parseAvitoSettings(integration.settings); const listingId = chat.context?.value?.id != null ? String(chat.context.value.id) : null;
    const mapping = settings.listings.find(l => l.id === listingId && l.enabled);
    const conversation = await this.prisma.avitoConversation.upsert({ where: { integrationId_externalChatId: { integrationId: integration.id, externalChatId: chat.id } }, update: {}, create: {
      integrationId: integration.id, externalChatId: chat.id, listingId, listingTitle: String(chat.context?.value?.title ?? '').slice(0, 300), direction: mapping?.direction ?? 'UNASSIGNED',
      customerName: chat.users?.find(u => String(u.id) !== integration.accountId)?.name?.slice(0, 200), contact: {},
    } });
    // Model I/O stays outside the database transaction. Versions are checked again
    // before using its result; paid requests are idempotent on the existing gateway.
    const candidate = [...history].sort((a, b) => b.created - a.created)[0];
    const profile = settings.profiles.find(p => p.direction === mapping?.direction && p.enabled);
    let modelIntent: AvitoModelIntent | null = null;
    if (avitoPilotAllowsChat(chat.id) && profile && this.model.configured() && conversation.mode === 'BOT' && settings.mode !== 'MANUAL' && candidate?.type === 'text'
      && chat.users?.some(u => String(u.id) === String(candidate.author_id) && String(u.id) !== integration.accountId)
      && integration.installation.enabledAt && candidate.created * 1000 >= integration.installation.enabledAt.getTime()
      && !await this.prisma.avitoMessage.findUnique({ where: { conversationId_externalId: { conversationId: conversation.id, externalId: candidate.id } } })) {
      const preliminary = decideAvitoReply({ settings, listingId, text: candidate.content?.text ?? '', messageId: candidate.id, contact: conversation.contact as ContactState, skipAvailability: true, now: this.now() });
      if (avitoNeedsQuestionPlan(candidate.content?.text ?? '', preliminary.reason)) {
        const [stored, outgoing] = await Promise.all([
          this.prisma.avitoMessage.findMany({ where: { conversationId: conversation.id, occurredAt: { lte: new Date(candidate.created * 1000) } }, orderBy: { occurredAt: 'desc' }, take: 64, select: { externalId: true, authorId: true, type: true, text: true, occurredAt: true } }),
          this.prisma.avitoOutgoingOperation.findMany({ where: { conversationId: conversation.id, status: 'SENT', externalMessageId: { not: null } }, orderBy: { sentAt: 'desc' }, take: 32, select: { externalMessageId: true, text: true } }),
        ]);
        const confirmed = new Map(outgoing.map(op => [op.externalMessageId, op.text]));
        const clients = new Set(chat.users?.filter(user => String(user.id) !== integration.accountId).map(user => String(user.id)));
        const messages = new Map(stored.map(message => [message.externalId, { id: message.externalId, author: message.authorId ?? '', type: message.type, text: message.text, at: message.occurredAt.getTime() }]));
        for (const message of history) if (!messages.has(message.id)) messages.set(message.id, { id: message.id, author: String(message.author_id), type: message.type ?? 'unknown', text: message.content?.text ?? '', at: message.created * 1000 });
        const turns = [...messages.values()].filter(message => message.id !== candidate.id && message.at <= candidate.created * 1000 && message.type === 'text')
          .sort((left, right) => left.at - right.at)
          .flatMap<AvitoDialogueTurn>(message => clients.has(message.author) ? [{ role: 'user', text: message.text }] : message.author === integration.accountId && confirmed.get(message.id) === message.text ? [{ role: 'assistant', text: message.text }] : []);
        const dialogue: AvitoDialogueTurn[] = boundedAvitoHistory(turns, (conversation.contact as ContactState).name);
        modelIntent = await this.model.classify(`${integration.id}:${conversation.id}:${conversation.intakeCycle}:${candidate.id}:${integration.settingsVersion}`, profile, candidate.content?.text ?? '', mapping, undefined, dialogue);
      }
    }
    const modelSettingsVersion = integration.settingsVersion;
    return this.prisma.$transaction(async tx => {
      await lockConversation(tx, conversation.id);
      integration = await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id }, include: { installation: true } });
      if (!integration.installation.enabled) return 0;
      const settings = parseAvitoSettings(integration.settings);
      const mapping = settings.listings.find(l => l.id === listingId && l.enabled);
      const petService = mapping ? await loadPetServiceContext(tx, integration.installation.organizationId, mapping.direction) : undefined;
      let current = await tx.avitoConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      const validModelVersion = current.version === conversation.version && integration.settingsVersion === modelSettingsVersion;
      let newCount = 0; let latest: AvitoApiMessage | null = null; let contact = current.contact as ContactState; let contactBeforeLatest = contact;
      let manual = current.mode !== 'BOT';
      const ordered = [...history].reverse().sort((a, b) => a.created - b.created);
      for (const message of ordered) {
        if (!message.id || !Number.isFinite(message.created) || message.created <= 0) continue;
        const direction = message.direction === 'out' || String(message.author_id) === integration.accountId ? 'OUT' : 'IN';
        const inserted = await tx.avitoMessage.createMany({ data: [{ conversationId: current.id, externalId: message.id, authorId: message.author_id == null ? null : String(message.author_id), direction, type: String(message.type ?? 'unknown'), text: typeof message.content?.text === 'string' ? message.content.text.slice(0, 16000) : '', occurredAt: new Date(message.created * 1000) }], skipDuplicates: true });
        if (!inserted.count) continue;
        newCount++;
        if (direction === 'OUT') {
          const ours = await tx.avitoOutgoingOperation.findFirst({ where: { conversationId: current.id, externalMessageId: message.id } });
          if (!ours) manual = true;
        } else {
          if (!chat.users?.some(u => String(u.id) === String(message.author_id) && String(u.id) !== integration.accountId)) manual = true;
          latest = message;
          contactBeforeLatest = contact;
          const preview = decideAvitoReply({ settings, listingId, text: message.content?.text ?? '', messageId: message.id, contact, mode: manual ? 'HUMAN' : 'BOT', mediaType: message.type, skipAvailability: true, now: this.now(), petService });
          contact = preview.contact;
          if (preview.reason === 'CONTACT_DECLINED') {
            await tx.avitoInquiry.updateMany({ where: { conversationId: current.id, clientKey: `avito:${current.id}:${current.intakeCycle}`, status: { in: ['NEW', 'IN_REVIEW'] } }, data: { status: 'CANCELLED' } });
            if (current.requestId) await tx.onlineAppointmentRequest.updateMany({ where: { id: current.requestId, status: 'NEW' }, data: { status: 'CANCELLED', internalComment: 'Клиент попросил не звонить; продолжить общение в Авито.' } });
            await this.audit.log({ action: 'avito.callback.declined', entityType: 'AvitoConversation', entityId: current.id, metadata: { messageId: message.id } }, tx);
          }
        }
      }
      if (!newCount) return 0;
      await cancelQueued(tx, current.id, 'Получено новое сообщение');
      const lastAt = ordered.length ? new Date(Math.max(current.lastMessageAt?.getTime() ?? 0, ...ordered.map(m => Number.isFinite(m.created) ? m.created * 1000 : 0))) : current.lastMessageAt;
      const routeChanged = !mapping || (current.direction !== 'UNASSIGNED' && current.direction !== mapping.direction);
      current = await tx.avitoConversation.update({ where: { id: current.id }, data: { version: { increment: 1 }, lastMessageAt: lastAt, contact: json(contact), ...(manual || routeChanged ? { mode: 'HUMAN', needsAttention: true } : {}) } });
      // Import historical chats for staff visibility, never start sending into old conversations.
      if (!avitoPilotAllowsChat(chat.id) || !latest || current.mode !== 'BOT' || settings.mode === 'MANUAL' || !integration.installation.enabledAt || latest.created * 1000 < integration.installation.enabledAt.getTime()) return newCount;
      const intent = validModelVersion && candidate?.id === latest.id ? modelIntent : null;
      const crmQuery = crmIntentQuery(latest.content?.text ?? '', intent);
      const priceDetailReply = ['PROGRAMME_PRICE_CLARIFY', 'CRM_PRICE_CLARIFY'].includes(current.stage) && contact.petSpecies && !crmQuestion(crmQuery) && mapping?.crmQuery;
      const resolvedCrmQuery = priceDetailReply ? `Стоимость ${mapping.crmQuery} ${latest.content?.text ?? ''}` : crmQuery;
      const now = this.now();
      const pricing = { ...avitoPricing(settings, now), petSpecies: contact.petSpecies };
      const crmAnswer = mapping?.direction === 'CLINIC' ? await this.crm.answer(integration.installation.organizationId, resolvedCrmQuery, tx, mapping.crmQuery, settings.administratorSchedule.officeId, intent?.questions, pricing) : null;
      const clinic = mapping?.direction === 'CLINIC' ? await this.crm.clinicContact(integration.installation.organizationId, tx, settings.administratorSchedule.officeId) : null;
      const nightNoticeDelivered = Boolean(await tx.avitoOutgoingOperation.findFirst({ where: { conversationId: current.id, status: 'SENT', sentAt: { gte: new Date(now.getTime() - 12 * 3600000) }, text: { contains: 'Сейчас клиника работает в ночном режиме' } }, select: { id: true } }));
      // The latest input was already previewed while importing history. Apply its
      // final decision to the preceding state so a service answer is not consumed twice.
      const decision = decideAvitoReply({ settings, listingId, text: latest.content?.text ?? '', messageId: latest.id, contact: contactBeforeLatest, mediaType: latest.type, crmAnswer, intent, now, clinicPhone: clinic?.phone, nightNoticeDelivered, petService });
      let requestId = current.requestId;
      if (decision.createInquiry) requestId = await this.createInquiry(tx, current, decision.contact);
      const stop = decision.createInquiry || decision.handoff && (!decision.contact.collecting || ['URGENT', 'CONTACT_DECLINED', 'UNSUPPORTED_MEDIA', 'DIRECT_HUMAN_REQUEST', 'UNMAPPED_LISTING', 'CLINIC_PHONE_UNAVAILABLE'].includes(decision.reason));
      await tx.avitoConversation.update({ where: { id: current.id }, data: { contact: json(decision.contact), requestId, needsAttention: Boolean(decision.needsAttention || decision.handoff || decision.createInquiry), stage: decision.createInquiry ? 'TRANSFERRED' : decision.contact.collecting ? 'COLLECTING_CONTACT' : decision.reason, ...(stop ? { mode: 'HUMAN' } : {}) } });
      if (decision.text) await tx.avitoOutgoingOperation.create({ data: { conversationId: current.id, triggerMessageId: latest.id, crmQuery: decision.purpose === 'CRM_REPLY' ? resolvedCrmQuery : null, replyContext: decision.reason === 'PET_SERVICE_INFO' ? json({ petService: true, bookingIntent: decision.petServiceBooking || undefined, bookingChannel: decision.petServiceChannel }) : clinic ? json({ administratorWorking: administratorWorking(settings, now), clinicPhone: clinic.phone, crmSuffix: decision.purpose === 'CRM_REPLY' && crmAnswer ? decision.text.slice(crmAnswer.text.length) : '', crmQuestions: intent?.questions ?? [] }) : undefined, clientKey: `bot:${current.id}:${latest.id}`, text: decision.text, purpose: decision.purpose, conversationVersion: current.version, settingsVersion: integration.settingsVersion, status: settings.mode === 'AUTO' ? 'PENDING' : 'DRAFT' } });
      return newCount;
    }, { timeout: 20000 });
  }
  private async createInquiry(tx: DB, conversation: { id: string; externalChatId: string; listingId: string | null; listingTitle: string | null; direction: string; intakeCycle: number }, contact: ContactState) {
    if (!contact.name || !contact.phone || !contact.callbackAt || !contact.callbackMessageId) throw new BadRequestException('Для заявки нужны имя и номер, оставленный клиентом для связи');
    const evidence = await tx.avitoMessage.findUnique({ where: { conversationId_externalId: { conversationId: conversation.id, externalId: contact.callbackMessageId } } });
    if (!evidence || evidence.direction !== 'IN' || providedCallbackPhone(evidence.text) !== contact.phone) throw new BadRequestException('Номер должен быть подтверждён исходным сообщением клиента');
    const clientKey = `avito:${conversation.id}:${conversation.intakeCycle}`;
    const inquiry = await tx.avitoInquiry.upsert({ where: { clientKey }, update: {}, create: { conversationId: conversation.id, clientKey, direction: conversation.direction, contactName: contact.name, phone: contact.phone, summary: contact.summary ?? 'Обращение из Авито', contactRecordedAt: new Date(contact.callbackAt), contactMessageId: contact.callbackMessageId, contactBasis: 'CLIENT_PROVIDED_PHONE' } });
    let requestId: string | null = null;
    if (conversation.direction === 'CLINIC') {
      const request = await tx.onlineAppointmentRequest.upsert({ where: { externalRequestId: clientKey }, update: {}, create: {
        externalRequestId: clientKey, source: 'AVITO', ownerName: contact.name, phone: contact.phone, animalNickname: 'Не указано',
        comment: `${inquiry.summary}\nИсточник: Авито. Направление: клиника. Получатель: администратор.\nВладелец: ${contact.name}. Телефон: ${contact.phone}.\nОбъявление ${conversation.listingId ?? 'не определено'}: ${conversation.listingTitle ?? ''}.\nДиалог Авито: ${conversation.externalChatId}.\nВрач и время не назначены; запись подтверждает администратор.`,
        internalComment: `Заявка из модуля Авито. ID обращения: ${inquiry.id}. Клиент оставил номер для связи по обращению: ${contact.callbackAt}; сообщение ${contact.callbackMessageId}. Запись подтверждает администратор.`,
      } });
      requestId = request.id;
      await tx.avitoInquiry.update({ where: { id: inquiry.id }, data: { requestId } });
    }
    await this.audit.log({ action: 'avito.inquiry.received', entityType: 'AvitoInquiry', entityId: inquiry.id, metadata: { direction: conversation.direction, requestId, contactBasis: 'CLIENT_PROVIDED_PHONE', contactMessageId: contact.callbackMessageId } }, tx);
    return requestId;
  }

  async reply(id: string, dto: AvitoReplyDto, actorId: string) {
    const integration = await this.requireConnected(); const target = await this.conversation(id);
    if (!avitoPilotAllowsChat(target.externalChatId)) throw new ForbiddenException('Пилот Авито ограничен контрольным диалогом');
    const operation = await this.prisma.$transaction(async tx => {
      await lockConversation(tx, id);
      const prior = await tx.avitoOutgoingOperation.findUnique({ where: { clientKey: dto.clientKey } });
      if (prior) { if (prior.conversationId !== id || prior.actorId !== actorId || prior.text !== dto.text.trim()) throw new ConflictException('Идентификатор отправки уже использован'); return prior; }
      const c = await tx.avitoConversation.findUniqueOrThrow({ where: { id } });
      if (c.version !== dto.version) throw new ConflictException('Появилось новое сообщение. Проверьте диалог перед ответом.');
      let purpose = 'REPLY'; let approvedDraft = false; let replyContext: Prisma.InputJsonValue | undefined; let triggerMessageId: string | null = null; let crmQuery: string | null = null;
      if (dto.draftId) {
        const draft = await tx.avitoOutgoingOperation.findFirst({ where: { id: dto.draftId, conversationId: id, status: 'DRAFT', conversationVersion: c.version } });
        if (!draft) throw new ConflictException('Черновик устарел');
        if (draft.purpose === 'CONSENT') throw new ConflictException('Архивный запрос разрешения больше не используется. Обновите диалог.');
        if (draft.text === dto.text.trim()) { purpose = draft.purpose; replyContext = draft.replyContext ? json(draft.replyContext) : undefined; triggerMessageId = draft.triggerMessageId; crmQuery = draft.crmQuery; approvedDraft = true; }
      }
      await cancelQueued(tx, id, 'Сотрудник отвечает вручную');
      const fresh = await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id }, include: { installation: true } });
      if (!fresh.installation.enabled) throw new ForbiddenException('Модуль отключён');
      await tx.avitoConversation.update({ where: { id }, data: { mode: approvedDraft ? c.mode : 'HUMAN', version: { increment: 1 }, needsAttention: false } });
      const op = await tx.avitoOutgoingOperation.create({ data: { conversationId: id, clientKey: dto.clientKey, text: dto.text.trim(), purpose, triggerMessageId, crmQuery, replyContext, actorId, conversationVersion: c.version + 1, settingsVersion: fresh.settingsVersion, status: 'PENDING' } });
      await this.audit.log({ actorId, action: 'avito.reply.enqueue', entityType: 'AvitoOutgoingOperation', entityId: op.id }, tx);
      return op;
    });
    // Delivery is deliberately separate from enqueue, with a durable sending intent.
    return { operationId: operation.id, status: operation.status, liveSendEnabled: this.api.liveSendEnabled() };
  }

  async deliver(operationId: string) {
    if (!this.api.liveSendEnabled()) return;
    const integration = await this.requireConnected();
    const initial = await this.prisma.avitoOutgoingOperation.findUnique({ where: { id: operationId }, include: { conversation: true } });
    if (!initial || initial.status !== 'PENDING' || initial.conversation.integrationId !== integration.id) return;
    // Observe manual answers made directly on Avito before claiming an automatic reply.
    await this.syncChat(initial.conversation.externalChatId);
    const claimed = await this.prisma.$transaction(async tx => {
      await lockConversation(tx, initial.conversationId);
      const op = await tx.avitoOutgoingOperation.findUniqueOrThrow({ where: { id: operationId } });
      const c = await tx.avitoConversation.findUniqueOrThrow({ where: { id: op.conversationId } });
      const live = await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id }, include: { installation: true } });
      const settings = parseAvitoSettings(live.settings);
      const allowedFinal = ['SUBMITTED', 'REPLY', 'CRM_REPLY'].includes(op.purpose) && c.needsAttention && c.mode === 'HUMAN';
      if (op.status !== 'PENDING') return null;
      if (!avitoPilotAllowsChat(c.externalChatId) || op.purpose === 'CONSENT' || !live.installation.enabled || c.version !== op.conversationVersion || (!op.actorId && (live.settingsVersion !== op.settingsVersion || settings.mode !== 'AUTO' || (c.mode !== 'BOT' && !allowedFinal)))) {
        await tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'CANCELLED', error: 'Диалог, режим или правила изменены' } }); return null;
      }
      const context = op.replyContext as { petService?: boolean; bookingIntent?: boolean; bookingChannel?: 'WEBSITE'; administratorWorking: boolean; clinicPhone: string | null; crmSuffix: string; crmQuestions?: AvitoCrmQuestion[] } | null;
      if (context?.petService) {
        const trigger = op.triggerMessageId ? await tx.avitoMessage.findUnique({ where: { conversationId_externalId: { conversationId: c.id, externalId: op.triggerMessageId } } }) : null;
        const mapping = settings.listings.find(listing => listing.id === c.listingId && listing.enabled && listing.direction === c.direction);
        const source = mapping && settings.profiles.some(p => p.enabled && p.direction === mapping.direction) ? await loadPetServiceContext(tx, live.installation.organizationId, mapping.direction) : undefined;
        if (!source || !trigger || petServiceAnswer(source, trigger.text, context.bookingIntent === true, context.bookingChannel === 'WEBSITE' ? 'WEBSITE' : undefined) !== op.text) {
          await tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'CANCELLED', error: 'Условия или доступность записи изменились. Нужен актуальный ответ.' } });
          await tx.avitoConversation.update({ where: { id: c.id }, data: { needsAttention: true } }); return null;
        }
      } else if (context) {
        const phone = await this.crm.clinicContact(live.installation.organizationId, tx, settings.administratorSchedule.officeId);
        if (context.administratorWorking !== administratorWorking(settings, this.now()) || context.clinicPhone !== phone.phone) {
          await tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'CANCELLED', error: 'График администратора или номер клиники изменился. Нужен актуальный ответ.' } });
          await tx.avitoConversation.update({ where: { id: c.id }, data: { needsAttention: true } }); return null;
        }
      }
      if (op.purpose === 'CRM_REPLY') {
        const trigger = op.triggerMessageId ? await tx.avitoMessage.findUnique({ where: { conversationId_externalId: { conversationId: c.id, externalId: op.triggerMessageId } } }) : null;
        const mapping = settings.listings.find(listing => listing.id === c.listingId && listing.enabled);
        const current = trigger && c.direction === 'CLINIC' && op.crmQuery ? await this.crm.answer(live.installation.organizationId, op.crmQuery, tx, mapping?.crmQuery, settings.administratorSchedule.officeId, context?.crmQuestions, { ...avitoPricing(settings, this.now()), petSpecies: (c.contact as ContactState).petSpecies }) : null;
        if (!current || `${current.text}${context?.crmSuffix ?? ''}` !== op.text) {
          await tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'CANCELLED', error: 'Сведения CRM изменились. Проверьте актуальную цену или график перед ответом.' } });
          await tx.avitoConversation.update({ where: { id: c.id }, data: { needsAttention: true } });
          return null;
        }
      }
      return tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'SENDING', startedAt: new Date(), error: null } });
    });
    if (!claimed) return;
    // A takeover cancels queued work; an already started network operation cannot be recalled.
    let result: { id: string };
    try { result = await this.api.send(integration.accountId!, initial.conversation.externalChatId, claimed.text); }
    catch (error) { await this.markUncertain(claimed.id, safeError(error)); return; }
    await this.prisma.$transaction(async tx => {
      await lockConversation(tx, claimed.conversationId);
      await tx.avitoOutgoingOperation.update({ where: { id: claimed.id }, data: { status: 'SENT', externalMessageId: result.id, sentAt: new Date() } });
    });
  }
  async reconcile(operationId: string, actorId: string) {
    const integration = await this.requireConnected();
    const op = await this.prisma.avitoOutgoingOperation.findFirst({ where: { id: operationId, conversation: { integrationId: integration.id }, status: { in: ['SENDING', 'UNCERTAIN'] } }, include: { conversation: true } });
    if (!op) throw new BadRequestException('Этой отправке не требуется сверка');
    const messages = await this.api.messages(integration.accountId!, op.conversation.externalChatId);
    const matches = messages.filter(m => String(m.author_id) === integration.accountId && m.content?.text === op.text && op.startedAt && Math.abs(m.created * 1000 - op.startedAt.getTime()) < 120000);
    if (matches.length !== 1) return { status: 'UNCERTAIN', matched: matches.length, message: 'Нельзя однозначно подтвердить отправку. Повтор автоматически не выполняется.' };
    const result = await this.prisma.$transaction(async tx => {
      await lockConversation(tx, op.conversationId);
      const result = await tx.avitoOutgoingOperation.update({ where: { id: op.id }, data: { status: 'SENT', externalMessageId: matches[0].id, sentAt: new Date(matches[0].created * 1000), error: null } });
      return result;
    });
    await this.audit.log({ actorId, action: 'avito.reply.reconcile', entityType: 'AvitoOutgoingOperation', entityId: op.id });
    return { status: result.status, matched: 1 };
  }
  async recordCall(dto: AvitoCallDto, actorId: string) {
    await this.modules.assertEnabled('avito-administrator');
    const integration = await this.integration();
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + 60000) throw new BadRequestException('Звонок нельзя отметить в будущем');
    return this.prisma.avitoCall.upsert({ where: { integrationId_clientKey: { integrationId: integration.id, clientKey: dto.clientKey } }, update: {}, create: { integrationId: integration.id, clientKey: dto.clientKey, occurredAt, direction: dto.direction, missed: dto.missed, note: dto.note?.trim() || null, actorId } });
  }
  async inquiryStatus(id: string, status: string, actorId: string) {
    await this.modules.assertEnabled('avito-administrator'); const integration = await this.integration();
    if (!['IN_REVIEW', 'RESOLVED', 'CANCELLED'].includes(status)) throw new BadRequestException('Некорректный статус обращения');
    const inquiry = await this.prisma.avitoInquiry.findFirst({ where: { id, conversation: { integrationId: integration.id } } });
    if (!inquiry) throw new NotFoundException('Заявка не найдена');
    return this.prisma.$transaction(async tx => {
      await lockConversation(tx, inquiry.conversationId);
      const current = await tx.avitoInquiry.findUniqueOrThrow({ where: { id } });
      if (['RESOLVED', 'CANCELLED'].includes(current.status) && status !== current.status) throw new ConflictException('Завершённое обращение не возвращается в работу. Для нового запроса начните новый цикл.');
      const result = await tx.avitoInquiry.update({ where: { id }, data: { status } });
      await this.audit.log({ actorId, action: 'avito.inquiry.status', entityType: 'AvitoInquiry', entityId: id, metadata: { status } }, tx);
      return result;
    });
  }
  async newCycle(id: string, version: number, actorId: string) {
    await this.modules.assertEnabled('avito-administrator'); await this.conversation(id); const integration = await this.integration();
    return this.prisma.$transaction(async tx => {
      await lockConversation(tx, id);
      const c = await tx.avitoConversation.findUniqueOrThrow({ where: { id }, include: { inquiries: true, request: true } });
      if (c.version !== version) throw new ConflictException('Диалог изменился. Обновите страницу.');
      if (c.inquiries.some(i => ['NEW', 'IN_REVIEW'].includes(i.status)) || c.request && ['NEW', 'IN_REVIEW'].includes(c.request.status)) throw new BadRequestException('Сначала обработайте текущую заявку и закройте обращение Авито');
      const fresh = await tx.avitoIntegration.findUniqueOrThrow({ where: { id: integration.id }, include: { installation: true } });
      const settings = parseAvitoSettings(fresh.settings); const mapping = settings.listings.find(l => l.id === c.listingId && l.enabled);
      if (!fresh.installation.enabled || !mapping || !settings.profiles.some(p => p.direction === mapping.direction && p.enabled)) throw new BadRequestException('Направление объявления не подключено');
      await cancelQueued(tx, id, 'Начат новый цикл обращения');
      const result = await tx.avitoConversation.update({ where: { id }, data: { intakeCycle: { increment: 1 }, direction: mapping.direction, requestId: null, contact: {}, stage: 'NEW', mode: 'BOT', needsAttention: false, version: { increment: 1 } } });
      await this.audit.log({ actorId, action: 'avito.conversation.new_cycle', entityType: 'AvitoConversation', entityId: id, metadata: { intakeCycle: result.intakeCycle, direction: result.direction } }, tx);
      return result;
    });
  }
  async metrics(direction?: string) {
    const integration = await this.integration(); const scope = { integrationId: integration.id, ...(direction ? { direction } : {}) };
    const [conversations, calls, inquiries, confirmed, attention, recentCalls] = await Promise.all([
      this.prisma.avitoConversation.count({ where: scope }), this.prisma.avitoCall.count({ where: scope }),
      this.prisma.avitoInquiry.count({ where: { conversation: { integrationId: integration.id }, ...(direction ? { direction } : {}) } }),
      this.prisma.avitoInquiry.count({ where: { conversation: { integrationId: integration.id }, ...(direction ? { direction } : {}), request: { status: 'ACCEPTED', appointmentId: { not: null } } } }),
      this.prisma.avitoConversation.count({ where: { ...scope, needsAttention: true } }),
      this.prisma.avitoCall.findMany({ where: scope, orderBy: { occurredAt: 'desc' }, take: 30 }),
    ]);
    return { conversations, calls, inquiries, confirmedClinicAppointments: confirmed, attention, recentCalls, note: 'Диалоги, звонки, заявки и подтверждённые записи — отдельные показатели. Звонок сам по себе не создаёт заявку.' };
  }
  async acceptEvent(secret: string, payload: unknown) {
    const expected = process.env.AVITO_WEBHOOK_SECRET ?? '';
    if (expected.length < 32 || !timingSafeEqual(createHash('sha256').update(secret).digest(), createHash('sha256').update(expected).digest())) throw new ForbiddenException('Событие не принято');
    if (!this.api.ingestionEnabled()) throw new ForbiddenException('Приём событий Авито ещё не включён');
    const integration = await this.requireConnected();
    const value = (payload as { payload?: { value?: Record<string, unknown> } })?.payload?.value;
    if (!value || String(value.user_id) !== integration.accountId || typeof value.chat_id !== 'string' || !/^[A-Za-z0-9:_~-]{1,200}$/.test(value.chat_id) || typeof value.id !== 'string' || !value.id.length || value.id.length > 200) throw new BadRequestException('Событие не относится к подключённому профилю');
    const eventKey = createHash('sha256').update(`${integration.id}:${value.chat_id}:${value.id}`).digest('hex');
    // Only identifiers are stored from webhooks. Message content is fetched from Avito before processing.
    await this.prisma.avitoIncomingEvent.upsert({ where: { eventKey }, update: {}, create: { eventKey, integrationId: integration.id, externalChatId: value.chat_id, externalMessageId: value.id } });
    return { ok: true };
  }
  async tick() {
    const integration = await this.integration();
    if (!integration.installation.enabled || (!this.api.ingestionEnabled() && !this.api.liveSendEnabled()) || !await this.modules.entitlement('avito-administrator')) return;
    // A process restart never retries a possibly completed HTTP send.
    const interrupted = await this.prisma.avitoOutgoingOperation.findMany({ where: { conversation: { integrationId: integration.id }, status: 'SENDING', startedAt: { lt: new Date(Date.now() - 60000) } }, take: 50 });
    for (const op of interrupted) await this.markUncertain(op.id, 'Отправка прервана. Требуется сверка истории.');
    const events = this.api.ingestionEnabled() ? await this.prisma.avitoIncomingEvent.findMany({ where: { integrationId: integration.id, status: 'PENDING', attempts: { lt: 5 }, OR: [{ attempts: 0 }, { updatedAt: { lt: new Date(Date.now() - 60000) } }] }, orderBy: { createdAt: 'asc' }, take: 10 }) : [];
    for (const event of events) {
      try {
        await this.syncChat(event.externalChatId);
        const checked = await this.prisma.avitoIncomingEvent.findUniqueOrThrow({ where: { id: event.id } });
        if (checked.status !== 'DONE') await this.prisma.avitoIncomingEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, error: 'Сообщение ещё не подтверждено историей Авито' } });
      }
      catch (error) { await this.prisma.avitoIncomingEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, error: safeError(error) } }); }
    }
    const pending = await this.prisma.avitoOutgoingOperation.findMany({ where: { conversation: { integrationId: integration.id }, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 10 });
    for (const op of pending) await this.deliver(op.id);
  }
  private async markUncertain(id: string, error: string) {
    const op = await this.prisma.avitoOutgoingOperation.findUniqueOrThrow({ where: { id } });
    await this.prisma.$transaction(async tx => {
      await lockConversation(tx, op.conversationId);
      const current = await tx.avitoOutgoingOperation.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'SENDING') return;
      await tx.avitoOutgoingOperation.update({ where: { id }, data: { status: 'UNCERTAIN', error } });
      await tx.avitoConversation.update({ where: { id: op.conversationId }, data: { mode: 'PAUSED', needsAttention: true, version: { increment: 1 } } });
      await cancelQueued(tx, op.conversationId, 'Отправка требует сверки');
    });
  }
}
async function lockConversation(tx: DB, id: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`avito:${id}`}, 0))`; }
async function cancelQueued(tx: DB, conversationId: string, reason: string) { await tx.avitoOutgoingOperation.updateMany({ where: { conversationId, status: { in: ['DRAFT', 'PENDING'] } }, data: { status: 'CANCELLED', error: reason } }); }
