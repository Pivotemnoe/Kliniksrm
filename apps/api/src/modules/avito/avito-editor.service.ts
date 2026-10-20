import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { zipSync, strToU8 } from 'fflate';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UploadedFilePayload } from '../files/files.service';
import { AvitoService } from './avito.service';
import { AvitoApiClient } from './avito-api.client';
import { AvitoModelGatewayClient } from './avito-model-gateway.client';
import { checkedImage, composeListing, DEFAULT_MARKETING_RULES, factsHash, ListingContent, ListingFacts, listingIssues, parseListingContent } from './avito-editor.policy';
import { CreateAvitoDraftDto, GenerateAvitoDraftDto, SaveAvitoDraftDto } from './dto/avito-editor.dto';
import { parseAvitoSettings } from './avito.settings';
import { clinicServiceFamily } from './avito-service-query';

type DB = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const mediaSelect = { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } as const;

@Injectable()
export class AvitoEditorService {
  constructor(private readonly prisma: PrismaService, private readonly avito: AvitoService, private readonly api: AvitoApiClient, private readonly audit: AuditService, private readonly model: AvitoModelGatewayClient) {}
  async catalog() {
    const integration = await this.avito.integration();
    const [services, offices] = await Promise.all([
      this.prisma.service.findMany({ where: { isActive: true }, select: { id: true, title: true, priceType: true, price: true, minimumPrice: true, maximumPrice: true }, orderBy: { title: 'asc' }, take: 5000 }),
      this.prisma.clinicOffice.findMany({ where: { organizationId: integration.installation.organizationId }, select: { id: true, name: true, address: true, phone: true }, orderBy: { name: 'asc' }, take: 200 }),
    ]);
    return { services: services.map(serviceFact), offices, publishingCheck: integration.publishingCheck, livePublishingEnabled: false, aiConfigured: this.model.configured(), category: 'Уход за животными', limits: { title: 100, description: 7500, photos: 10, imageBytes: 5 * 1024 * 1024 }, defaultMarketingRules: DEFAULT_MARKETING_RULES };
  }
  async list() {
    const integration = await this.avito.integration();
    return this.prisma.avitoListingDraft.findMany({ where: { integrationId: integration.id }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, title: true, sourceListingId: true, direction: true, status: true, version: true, updatedAt: true } });
  }
  private async draft(id: string, db: DB = this.prisma) {
    const integration = await this.avito.integration();
    const draft = await db.avitoListingDraft.findFirst({ where: { id, integrationId: integration.id } });
    if (!draft) throw new NotFoundException('Черновик объявления не найден');
    return draft;
  }
  private async facts(content: ListingContent, organizationId: string, db: DB = this.prisma, sourceListingId?: string | null, direction?: string): Promise<ListingFacts> {
    const service = content.serviceId ? await db.service.findFirst({ where: { id: content.serviceId, isActive: true }, select: { id: true, title: true, priceType: true, price: true, minimumPrice: true, maximumPrice: true } }) : null;
    if (content.serviceId && !service) throw new BadRequestException('Услуга больше не доступна в CRM. Выберите действующую услугу.');
    const office = content.officeId ? await db.clinicOffice.findFirst({ where: { id: content.officeId, organizationId }, select: { id: true, name: true, address: true, phone: true } }) : null;
    if (content.officeId && !office) throw new BadRequestException('Филиал не относится к этой клинике');
    const settings = parseAvitoSettings((await this.avito.integration()).settings);
    const mapping = settings.listings.find(row => row.id === sourceListingId && row.direction === 'CLINIC');
    const table = direction === 'CLINIC' && !content.serviceId && mapping && clinicServiceFamily(mapping.crmQuery ?? '') === 'CHECKUP' ? settings.clinicProgrammeTable : undefined;
    const programmeTable = table ? { ...table, priceText: `от ${new Intl.NumberFormat('ru-RU').format(Math.min(...table.prices.map(row => table.discountAvailableToAll ? row.discountedPrice : row.regularPrice)))} ₽${table.discountAvailableToAll ? ' со скидкой для всех' : ''}` } : undefined;
    return { service: service ? serviceFact(service) : null, office, ...(programmeTable ? { programmeTable } : {}) };
  }
  async get(id: string) {
    const draft = await this.draft(id); const integration = await this.avito.integration(); const content = parseListingContent(draft.content);
    const [facts, media, revisions] = await Promise.all([
      this.facts(content, integration.installation.organizationId, this.prisma, draft.sourceListingId, draft.direction),
      this.prisma.avitoListingMedia.findMany({ where: { draftId: id }, select: mediaSelect, orderBy: { createdAt: 'asc' } }),
      this.prisma.avitoListingDraftRevision.findMany({ where: { draftId: id }, select: { id: true, version: true, createdAt: true }, orderBy: { version: 'desc' }, take: 30 }),
    ]);
    const issues = listingIssues(content, facts);
    return { ...draft, content, facts, media, revisions, issues, approvalCurrent: draft.status === 'READY' && draft.approvedFactsHash === factsHash(facts), livePublishingEnabled: false };
  }
  async create(dto: CreateAvitoDraftDto, actorId: string) {
    const integration = await this.avito.integration();
    const prior = await this.prisma.avitoListingDraft.findUnique({ where: { integrationId_clientKey: { integrationId: integration.id, clientKey: dto.clientKey } } });
    if (prior) { if (prior.sourceListingId !== (dto.sourceListingId || null) || prior.direction !== dto.direction) throw new ConflictException('Идентификатор уже использован для другого черновика'); return this.get(prior.id); }
    let title = '';
    if (dto.sourceListingId) {
      if (!/^\d{1,20}$/.test(dto.sourceListingId)) throw new BadRequestException('Некорректный номер объявления');
      if (!integration.accountId) throw new BadRequestException('Сначала проверьте профиль Авито');
      const self = await this.api.self();
      if (String(self.id) !== integration.accountId) throw new ConflictException('Ключи относятся к другому профилю Авито');
      let found = false;
      for (let page = 1; page <= 201; page++) {
        const items = await this.api.ownListings(page, 'all'); const item = items.items.find(value => value.id === dto.sourceListingId);
        if (item) { title = item.title.slice(0, 100); found = true; break; }
        if (!items.nextPage) break;
      }
      if (!found) throw new BadRequestException('Объявление не найдено среди объявлений подключённого профиля');
    }
    const content = parseListingContent({ title });
    const created = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${integration.id}), 72)`;
      const duplicate = await tx.avitoListingDraft.findUnique({ where: { integrationId_clientKey: { integrationId: integration.id, clientKey: dto.clientKey } } });
      if (duplicate) { if (duplicate.sourceListingId !== (dto.sourceListingId || null) || duplicate.direction !== dto.direction) throw new ConflictException('Идентификатор уже использован для другого черновика'); return duplicate; }
      if (await tx.avitoListingDraft.count({ where: { integrationId: integration.id } }) >= 200) throw new BadRequestException('Достигнут лимит 200 локальных черновиков');
      const draft = await tx.avitoListingDraft.create({ data: { integrationId: integration.id, clientKey: dto.clientKey, sourceListingId: dto.sourceListingId || null, direction: dto.direction, title, content: json(content), createdBy: actorId } });
      await this.record(tx, draft, actorId, 'avito.editor.create'); return draft;
    });
    return this.get(created.id);
  }
  async save(id: string, dto: SaveAvitoDraftDto, actorId: string) {
    const existing = await this.draft(id); const integration = await this.avito.integration(); const content = parseListingContent(dto.content);
    await this.prisma.$transaction(async tx => {
      await editorLock(tx, id); await this.draft(id, tx);
      await this.facts(content, integration.installation.organizationId, tx, existing.sourceListingId, existing.direction);
      if (content.photoIds.length && await tx.avitoListingMedia.count({ where: { draftId: id, id: { in: content.photoIds } } }) !== content.photoIds.length) throw new BadRequestException('Фотография не принадлежит этому черновику');
      await this.change(tx, id, dto.version, { title: content.title, content: json(content), status: 'DRAFT', approvedFactsHash: null }, actorId, 'avito.editor.save');
    });
    return this.get(id);
  }
  private async change(tx: DB, id: string, version: number, data: Prisma.AvitoListingDraftUpdateManyMutationInput, actorId: string, action: string) {
    const changed = await tx.avitoListingDraft.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (!changed.count) throw new ConflictException('Черновик изменился в другой вкладке. Обновите его перед сохранением.');
    const draft = await tx.avitoListingDraft.findUniqueOrThrow({ where: { id } }); await this.record(tx, draft, actorId, action);
    return draft;
  }
  private async record(tx: DB, draft: { id: string; version: number; content: unknown; status: string; title: string }, actorId: string, action: string) {
    await tx.avitoListingDraftRevision.create({ data: { draftId: draft.id, version: draft.version, snapshot: json({ content: draft.content, status: draft.status, title: draft.title }), actorId } });
    await this.audit.log({ actorId, action, entityType: 'AvitoListingDraft', entityId: draft.id, metadata: { version: draft.version, status: draft.status, externalWrite: false } }, tx);
  }
  async restore(id: string, version: number, revision: number, actorId: string) {
    await this.draft(id);
    const previous = await this.prisma.avitoListingDraftRevision.findUnique({ where: { draftId_version: { draftId: id, version: revision } } });
    if (!previous) throw new NotFoundException('Версия объявления не найдена');
    return this.save(id, { version, content: (previous.snapshot as any).content }, actorId);
  }
  async upload(id: string, version: number, file: UploadedFilePayload | undefined, actorId: string) {
    await this.draft(id); const image = checkedImage(file);
    await this.prisma.$transaction(async tx => {
      await editorLock(tx, id); const draft = await this.draft(id, tx); const content = parseListingContent(draft.content);
      if (draft.version !== version) throw new ConflictException('Черновик изменился. Обновите его перед загрузкой фотографии.');
      let media = await tx.avitoListingMedia.findUnique({ where: { draftId_sha256: { draftId: id, sha256: image.sha256 } }, select: { id: true } });
      if (media && content.photoIds.includes(media.id)) return;
      if (content.photoIds.length >= 10) throw new BadRequestException('В объявлении уже 10 фотографий');
      if (!media) {
        if (await tx.avitoListingMedia.count({ where: { draftId: id } }) >= 30) throw new BadRequestException('В истории черновика уже 30 файлов');
        media = await tx.avitoListingMedia.create({ data: { ...image, draftId: id, createdBy: actorId }, select: { id: true } });
      }
      content.photoIds.push(media.id);
      await this.change(tx, id, version, { content: json(content), status: 'DRAFT', approvedFactsHash: null }, actorId, 'avito.editor.photo.upload');
    });
    return this.get(id);
  }
  async media(id: string, mediaId: string) {
    await this.draft(id);
    const media = await this.prisma.avitoListingMedia.findFirst({ where: { id: mediaId, draftId: id } });
    if (!media) throw new NotFoundException('Фотография не найдена');
    return media;
  }
  async generate(id: string, dto: GenerateAvitoDraftDto) {
    const draft = await this.get(id);
    if (draft.version !== dto.version) throw new ConflictException('Черновик изменился. Обновите его перед подготовкой текста.');
    if (dto.mode === 'TEMPLATE') return { ...composeListing(draft.content, draft.facts), mode: 'TEMPLATE', saved: false, publication: false };
    if (!draft.facts.service) throw new BadRequestException('Сначала выберите услугу CRM');
    const result = await this.model.generateCopy(`${id}:${draft.version}:${dto.clientKey}`, draft.direction, draft.content.brief, draft.content.marketingRules, draft.facts);
    if (!result) throw new ServiceUnavailableException('ИИ редактора не включён или временно недоступен. Можно собрать текст по данным CRM без ИИ.');
    return { ...result, mode: 'AI', saved: false, publication: false };
  }
  async approve(id: string, version: number, actorId: string) {
    await this.draft(id); const integration = await this.avito.integration();
    await this.prisma.$transaction(async tx => {
      await editorLock(tx, id); const draft = await this.draft(id, tx); const content = parseListingContent(draft.content);
      const facts = await this.facts(content, integration.installation.organizationId, tx, draft.sourceListingId, draft.direction); const issues = listingIssues(content, facts);
      if (!issues.canApprove) throw new BadRequestException(issues.errors.join(' '));
      await this.change(tx, id, version, { status: 'READY', approvedFactsHash: factsHash(facts) }, actorId, 'avito.editor.approve');
    });
    return this.get(id);
  }
  async check(actorId: string) {
    const integration = await this.avito.integration();
    if (!integration.accountId) throw new BadRequestException('Сначала проверьте профиль Авито');
    const result = await this.api.publishingAccess(integration.accountId);
    await this.prisma.avitoIntegration.update({ where: { id: integration.id }, data: { publishingCheck: json(result) } });
    await this.audit.log({ actorId, action: 'avito.editor.access.check', entityType: 'AvitoIntegration', entityId: integration.id, metadata: { profileHttpStatus: result.profileHttpStatus, externalWrite: false } });
    return result;
  }
  async export(id: string) {
    const draft = await this.get(id);
    if (!draft.approvalCurrent) throw new BadRequestException('Сначала проверьте и утвердите актуальную версию объявления. Данные CRM могли измениться.');
    const files: Record<string, Uint8Array> = {};
    const names: string[] = [];
    for (const [index, photoId] of draft.content.photoIds.entries()) {
      const photo = await this.media(id, photoId); const name = `photos/${String(index + 1).padStart(2, '0')}-${photo.id}.${photo.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      files[name] = photo.bytes; names.push(name);
    }
    files['announcement.txt'] = strToU8(`${draft.content.title}\n\n${draft.content.description}\n\nЦена${draft.facts.programmeTable ? ' по утверждённой таблице' : ' из CRM'}: ${draft.facts.programmeTable?.priceText ?? draft.facts.service?.priceText ?? 'уточнит администратор'}\nАдрес: ${draft.facts.office?.address ?? ''}\n`);
    files['manifest.json'] = strToU8(JSON.stringify({ kind: 'MANUAL_PLACEMENT_PACKAGE', draftId: draft.id, version: draft.version, sourceListingId: draft.sourceListingId, direction: draft.direction, facts: draft.facts, photos: names, warnings: draft.issues.warnings, automaticPublishing: false }, null, 2));
    files['README.txt'] = strToU8('Пакет для ручного размещения. Он не является файлом автозагрузки. На Авито ничего не отправлено. Для существующего объявления откройте карточку с номером sourceListingId и проверьте изменения перед сохранением. Первая фотография — обложка.');
    return Buffer.from(zipSync(files, { level: 0 }));
  }
  publish(): never { throw new ForbiddenException('Реальная публикация, редактирование и отправка фотографий Авито в этой версии отключены.'); }
}
async function editorLock(tx: DB, id: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}), 73)`; }
function serviceFact(service: { id: string; title: string; priceType: string; price: unknown; minimumPrice: unknown; maximumPrice: unknown }) {
  const money = (v: unknown) => v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0 ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(v)) : null;
  const fixed = money(service.price); const low = money(service.minimumPrice); const high = money(service.maximumPrice);
  return { id: service.id, title: service.title, priceText: service.priceType === 'FIXED' && fixed !== null ? `${fixed} ₽` : service.priceType === 'FLOATING' && low !== null && high !== null && Number(service.maximumPrice) >= Number(service.minimumPrice) ? `от ${low} до ${high} ₽` : null };
}
