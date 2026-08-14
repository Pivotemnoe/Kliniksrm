import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LaboratoryOrderItemStatus, LaboratoryOrderStatus, Prisma, VisitStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { servicePricingSelect } from '../stock/service-pricing';
import { AuditService } from '../audit/audit.service';
import { ImportLaboratoryResultsDto, LaboratoryResultImportRowDto, LaboratoryResultsImportMode } from './dto/import-laboratory-results.dto';
import { ListLaboratoryOrdersQueryDto } from './dto/list-laboratory-orders-query.dto';
import { ListLaboratoryQueryDto } from './dto/list-laboratory-query.dto';
import { UpdateLaboratoryOrderDto } from './dto/update-laboratory-order.dto';
import { UpdateLaboratoryOrderItemDto } from './dto/update-laboratory-order-item.dto';
import { UpdateLaboratoryOrderResultsDto, UpdateLaboratoryOrderResultRowDto } from './dto/update-laboratory-order-results.dto';
import { UpdateLaboratoryProfileDto, UpsertLaboratoryProfileDto } from './dto/upsert-laboratory-profile.dto';
import { UpdateLaboratoryTestDto, UpsertLaboratoryTestDto } from './dto/upsert-laboratory-test.dto';
import { extractLaboratoryDocumentIndicators } from './laboratory-document-form';

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources() {
    const [services, species] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where: { isActive: true },
        orderBy: { title: 'asc' },
        select: { ...servicePricingSelect, category: { select: { id: true, title: true } } },
        take: 300,
      }),
      this.prisma.animalSpecies.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: { id: true, title: true } }),
    ]);

    return { services, species };
  }

  async listOrders(query: ListLaboratoryOrdersQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where = this.buildOrderWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.laboratoryOrder.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: laboratoryOrderInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.laboratoryOrder.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async updateOrder(orderId: string, dto: UpdateLaboratoryOrderDto, actorId: string) {
    const existingOrder = await this.prisma.laboratoryOrder.findUnique({
      where: { id: orderId },
      include: {
        visit: { select: { status: true } },
        items: { select: { id: true, status: true, resultValue: true, resultText: true, _count: { select: { files: true } } } },
      },
    });

    if (!existingOrder) {
      throw new NotFoundException('Лабораторный заказ не найден');
    }

    if (existingOrder.status === LaboratoryOrderStatus.CANCELLED) {
      throw new BadRequestException('Отменённый лабораторный заказ нельзя менять');
    }
    ensureLaboratoryVisitOperational(existingOrder.visit);

    if (dto.status === LaboratoryOrderStatus.CANCELLED) {
      throw new BadRequestException('Отменяйте лабораторный заказ из карточки приёма, чтобы корректно пересчитать счёт');
    }
    if (
      dto.status === LaboratoryOrderStatus.COMPLETED &&
      existingOrder.items.some((item) => !clean(item.resultValue) && !clean(item.resultText) && item._count.files === 0)
    ) {
      throw new BadRequestException('Сначала заполните результаты всех показателей или приложите бланк');
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (dto.status !== undefined) {
        const completedAt = dto.status === LaboratoryOrderStatus.COMPLETED ? new Date() : null;
        await tx.laboratoryOrderItem.updateMany({
          where: { orderId, status: { not: LaboratoryOrderItemStatus.CANCELLED } },
          data: { status: dto.status, completedAt },
        });
      }

      await tx.laboratoryOrder.update({
        where: { id: orderId },
        data: {
          ...(dto.comment !== undefined ? { comment: clean(dto.comment) } : {}),
        },
      });

      await syncLaboratoryOrderStatus(tx, orderId);

      return tx.laboratoryOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: laboratoryOrderInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.order.update',
      entityType: 'LaboratoryOrder',
      entityId: orderId,
      metadata: { changedFields: Object.keys(dto), status: updatedOrder.status },
    });

    return updatedOrder;
  }

  async updateOrderItem(orderId: string, itemId: string, dto: UpdateLaboratoryOrderItemDto, actorId: string) {
    const existingItem = await this.prisma.laboratoryOrderItem.findFirst({
      where: { id: itemId, orderId },
      include: { order: { select: { id: true, status: true, visit: { select: { status: true } } } }, files: { select: { id: true } } },
    });

    if (!existingItem) {
      throw new NotFoundException('Строка лабораторного заказа не найдена');
    }

    if (existingItem.order.status === LaboratoryOrderStatus.CANCELLED) {
      throw new BadRequestException('Отменённый лабораторный заказ нельзя менять');
    }
    ensureLaboratoryVisitOperational(existingItem.order.visit);
    assertCompletedLaboratoryResult(dto, existingItem, existingItem.files.length > 0);

    const updatedItem = await this.prisma.$transaction(async (tx) => {
      const item = await tx.laboratoryOrderItem.update({
        where: { id: itemId },
        data: {
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.resultValue !== undefined ? { resultValue: clean(dto.resultValue) } : {}),
          ...(dto.resultText !== undefined ? { resultText: clean(dto.resultText) } : {}),
          ...(dto.unit !== undefined ? { unit: clean(dto.unit) } : {}),
          ...(dto.referenceRange !== undefined ? { referenceRange: clean(dto.referenceRange) } : {}),
          ...(dto.comment !== undefined ? { comment: clean(dto.comment) } : {}),
          ...(dto.status === LaboratoryOrderItemStatus.COMPLETED ? { completedAt: new Date() } : {}),
          ...(dto.status !== undefined && dto.status !== LaboratoryOrderItemStatus.COMPLETED ? { completedAt: null } : {}),
        },
        include: laboratoryOrderItemInclude,
      });

      await syncLaboratoryOrderStatus(tx, orderId);

      return item;
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.order_item.update',
      entityType: 'LaboratoryOrderItem',
      entityId: itemId,
      metadata: { orderId, status: updatedItem.status },
    });

    return updatedItem;
  }

  async updateOrderResults(orderId: string, dto: UpdateLaboratoryOrderResultsDto, actorId: string) {
    const uniqueItemIds = [...new Set(dto.items.map((item) => item.itemId))];
    if (uniqueItemIds.length !== dto.items.length) {
      throw new BadRequestException('Каждый показатель должен встречаться в таблице один раз');
    }

    const order = await this.prisma.laboratoryOrder.findUnique({
      where: { id: orderId },
      include: {
        visit: { select: { status: true } },
        items: { include: { files: { select: { id: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Лабораторный заказ не найден');
    if (order.status === LaboratoryOrderStatus.CANCELLED) {
      throw new BadRequestException('Отменённый лабораторный заказ нельзя менять');
    }
    ensureLaboratoryVisitOperational(order.visit);

    const existingById = new Map(order.items.map((item) => [item.id, item]));
    for (const row of dto.items) {
      const existing = existingById.get(row.itemId);
      if (!existing) throw new BadRequestException('Один из показателей не принадлежит выбранному заказу');
      assertCompletedLaboratoryResult(row, existing, existing.files.length > 0);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of dto.items) {
        await tx.laboratoryOrderItem.update({
          where: { id: row.itemId },
          data: toLaboratoryResultUpdate(row),
        });
      }
      await syncLaboratoryOrderStatus(tx, orderId);
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.results_table.update',
      entityType: 'LaboratoryOrder',
      entityId: orderId,
      metadata: { itemIds: uniqueItemIds, rows: uniqueItemIds.length },
    });

    return this.prisma.laboratoryOrder.findUniqueOrThrow({ where: { id: orderId }, include: laboratoryOrderInclude });
  }

  async importResults(orderId: string, dto: ImportLaboratoryResultsDto, actorId: string) {
    const order = await this.prisma.laboratoryOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        visit: { select: { status: true } },
        items: { select: { id: true, title: true, code: true, status: true } },
      },
    });
    if (!order) throw new NotFoundException('Лабораторный заказ не найден');
    if (order.status === LaboratoryOrderStatus.CANCELLED) {
      throw new BadRequestException('В отменённый лабораторный заказ нельзя загружать результаты');
    }
    ensureLaboratoryVisitOperational(order.visit);

    const matchedIds = new Set<string>();
    const rows = dto.rows.map((row) => matchImportRow(row, order.items, matchedIds));
    const matched = rows.filter((row) => row.matchStatus === 'MATCHED');
    const issues = rows.filter((row) => row.matchStatus !== 'MATCHED');
    const preview = {
      mode: dto.mode,
      canApply: matched.length > 0 && issues.length === 0,
      summary: { total: rows.length, matched: matched.length, issues: issues.length },
      rows,
    };

    if (dto.mode === LaboratoryResultsImportMode.PREVIEW) return preview;
    if (!preview.canApply) {
      throw new BadRequestException(`Импорт не выполнен: исправьте ${issues.length} строк с ошибками и снова запустите безопасную проверку`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const match of matched) {
        const source = dto.rows.find((row) => row.rowNumber === match.rowNumber)!;
        await tx.laboratoryOrderItem.update({
          where: { id: match.itemId! },
          data: {
            status: LaboratoryOrderItemStatus.COMPLETED,
            resultValue: clean(source.resultValue),
            resultText: clean(source.resultText),
            ...(source.unit !== undefined ? { unit: clean(source.unit) } : {}),
            ...(source.referenceRange !== undefined ? { referenceRange: clean(source.referenceRange) } : {}),
            ...(source.comment !== undefined ? { comment: clean(source.comment) } : {}),
            completedAt: new Date(),
          },
        });
      }
      await syncLaboratoryOrderStatus(tx, orderId);
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.results.import',
      entityType: 'LaboratoryOrder',
      entityId: orderId,
      metadata: { rows: matched.length, sourceRowNumbers: matched.map((row) => row.rowNumber) },
    });

    return { ...preview, applied: matched.length };
  }

  async listTests(query: ListLaboratoryQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where = this.buildTestWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.laboratoryTest.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        include: laboratoryTestInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.laboratoryTest.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createTest(dto: UpsertLaboratoryTestDto, actorId: string) {
    this.ensureActiveTestConfigured(dto.serviceId, dto.documentTemplateId, dto.isActive ?? true);
    await this.ensureServiceExists(dto.serviceId);
    await this.ensureLaboratoryDocumentExists(dto.documentTemplateId);
    const test = await this.prisma.laboratoryTest.create({
      data: this.toTestCreateData(dto),
      include: laboratoryTestInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.test.create',
      entityType: 'LaboratoryTest',
      entityId: test.id,
      metadata: { title: test.title, serviceId: test.serviceId, documentTemplateId: test.documentTemplateId },
    });

    return test;
  }

  async updateTest(testId: string, dto: UpdateLaboratoryTestDto, actorId: string) {
    const existing = await this.ensureTestExists(testId);
    this.ensureActiveTestConfigured(
      dto.serviceId ?? existing.serviceId ?? undefined,
      dto.documentTemplateId ?? existing.documentTemplateId ?? undefined,
      dto.isActive ?? existing.isActive,
    );
    await this.ensureServiceExists(dto.serviceId);
    await this.ensureLaboratoryDocumentExists(dto.documentTemplateId);
    const test = await this.prisma.laboratoryTest.update({
      where: { id: testId },
      data: this.toTestUpdateData(dto),
      include: laboratoryTestInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.test.update',
      entityType: 'LaboratoryTest',
      entityId: test.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return test;
  }

  async listProfiles(query: ListLaboratoryQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where = this.buildProfileWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.laboratoryProfile.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        include: laboratoryProfileInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.laboratoryProfile.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createProfile(dto: UpsertLaboratoryProfileDto, actorId: string) {
    await this.ensureServiceExists(dto.serviceId);
    await this.ensureTestsExist(dto.testIds);
    const profile = await this.prisma.laboratoryProfile.create({
      data: {
        ...this.toProfileCreateData(dto),
        tests: this.toProfileTestsCreate(dto.testIds),
      },
      include: laboratoryProfileInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.profile.create',
      entityType: 'LaboratoryProfile',
      entityId: profile.id,
      metadata: { title: profile.title, tests: profile.tests.length },
    });

    return profile;
  }

  async updateProfile(profileId: string, dto: UpdateLaboratoryProfileDto, actorId: string) {
    await this.ensureProfileExists(profileId);
    await this.ensureServiceExists(dto.serviceId);
    await this.ensureTestsExist(dto.testIds);

    const profile = await this.prisma.laboratoryProfile.update({
      where: { id: profileId },
      data: {
        ...this.toProfileUpdateData(dto),
        ...(dto.testIds !== undefined
          ? {
              tests: {
                deleteMany: {},
                create: dto.testIds.map((testId, index) => ({ testId, sortOrder: index })),
              },
            }
          : {}),
      },
      include: laboratoryProfileInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'laboratory.profile.update',
      entityType: 'LaboratoryProfile',
      entityId: profile.id,
      metadata: { changedFields: Object.keys(dto), tests: profile.tests.length },
    });

    return profile;
  }

  private buildTestWhere(query: ListLaboratoryQueryDto): Prisma.LaboratoryTestWhereInput {
    const search = query.search?.trim();
    return {
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
      ...(query.species ? { species: { has: query.species } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { groupName: { contains: search, mode: 'insensitive' } },
              { material: { contains: search, mode: 'insensitive' } },
              { method: { contains: search, mode: 'insensitive' } },
              { service: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private buildOrderWhere(query: ListLaboratoryOrdersQueryDto): Prisma.LaboratoryOrderWhereInput {
    const search = query.search?.trim();
    const createdAt = parseDateRange(query.from, query.to);

    return {
      ...(createdAt ? { createdAt } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.activeOnly === 'true' ? { status: { in: [LaboratoryOrderStatus.ORDERED, LaboratoryOrderStatus.IN_PROGRESS] } } : {}),
      ...(search
        ? {
            OR: [
              { comment: { contains: search, mode: 'insensitive' } },
              { items: { some: { title: { contains: search, mode: 'insensitive' } } } },
              { items: { some: { code: { contains: search, mode: 'insensitive' } } } },
              { items: { some: { resultValue: { contains: search, mode: 'insensitive' } } } },
              { items: { some: { resultText: { contains: search, mode: 'insensitive' } } } },
              { visit: { owner: { fullName: { contains: search, mode: 'insensitive' } } } },
              { visit: { owner: { phone: { contains: search, mode: 'insensitive' } } } },
              { visit: { animal: { nickname: { contains: search, mode: 'insensitive' } } } },
              { visit: { animal: { species: { contains: search, mode: 'insensitive' } } } },
              { visit: { animal: { breed: { contains: search, mode: 'insensitive' } } } },
              { visit: { employee: { fullName: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
  }

  private buildProfileWhere(query: ListLaboratoryQueryDto): Prisma.LaboratoryProfileWhereInput {
    const search = query.search?.trim();
    return {
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive === 'true' } : {}),
      ...(query.species ? { species: { has: query.species } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { service: { title: { contains: search, mode: 'insensitive' } } },
              { tests: { some: { test: { title: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
  }

  private toTestCreateData(dto: UpsertLaboratoryTestDto): Prisma.LaboratoryTestCreateInput {
    return {
      title: required(dto.title, 'Укажите название анализа'),
      code: clean(dto.code),
      groupName: clean(dto.groupName),
      material: clean(dto.material),
      method: clean(dto.method),
      unit: clean(dto.unit),
      referenceRange: clean(dto.referenceRange),
      species: normalizeSpecies(dto.species),
      ...(dto.serviceId ? { service: { connect: { id: dto.serviceId } } } : {}),
      ...(dto.documentTemplateId ? { documentTemplate: { connect: { id: dto.documentTemplateId } } } : {}),
      isActive: dto.isActive ?? true,
      description: clean(dto.description),
    };
  }

  private toTestUpdateData(dto: UpdateLaboratoryTestDto): Prisma.LaboratoryTestUpdateInput {
    return {
      ...(dto.title !== undefined ? { title: required(dto.title, 'Укажите название анализа') } : {}),
      ...(dto.code !== undefined ? { code: clean(dto.code) } : {}),
      ...(dto.groupName !== undefined ? { groupName: clean(dto.groupName) } : {}),
      ...(dto.material !== undefined ? { material: clean(dto.material) } : {}),
      ...(dto.method !== undefined ? { method: clean(dto.method) } : {}),
      ...(dto.unit !== undefined ? { unit: clean(dto.unit) } : {}),
      ...(dto.referenceRange !== undefined ? { referenceRange: clean(dto.referenceRange) } : {}),
      ...(dto.species !== undefined ? { species: normalizeSpecies(dto.species) } : {}),
      ...(dto.serviceId !== undefined ? { service: dto.serviceId ? { connect: { id: dto.serviceId } } : { disconnect: true } } : {}),
      ...(dto.documentTemplateId !== undefined
        ? { documentTemplate: dto.documentTemplateId ? { connect: { id: dto.documentTemplateId } } : { disconnect: true } }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
    };
  }

  private toProfileCreateData(dto: UpsertLaboratoryProfileDto): Prisma.LaboratoryProfileCreateInput {
    return {
      title: required(dto.title, 'Укажите название профиля'),
      code: clean(dto.code),
      description: clean(dto.description),
      species: normalizeSpecies(dto.species),
      ...(dto.serviceId ? { service: { connect: { id: dto.serviceId } } } : {}),
      isActive: dto.isActive ?? true,
    };
  }

  private toProfileUpdateData(dto: UpdateLaboratoryProfileDto): Prisma.LaboratoryProfileUpdateInput {
    return {
      ...(dto.title !== undefined ? { title: required(dto.title, 'Укажите название профиля') } : {}),
      ...(dto.code !== undefined ? { code: clean(dto.code) } : {}),
      ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
      ...(dto.species !== undefined ? { species: normalizeSpecies(dto.species) } : {}),
      ...(dto.serviceId !== undefined ? { service: dto.serviceId ? { connect: { id: dto.serviceId } } : { disconnect: true } } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };
  }

  private toProfileTestsCreate(testIds?: string[]) {
    return testIds?.length ? { create: testIds.map((testId, index) => ({ testId, sortOrder: index })) } : undefined;
  }

  private async ensureServiceExists(serviceId?: string) {
    if (!serviceId) {
      return;
    }

    const service = await this.prisma.service.findFirst({ where: { id: serviceId, isActive: true }, select: { id: true } });
    if (!service) {
      throw new NotFoundException('Связанная услуга не найдена');
    }
  }

  private async ensureLaboratoryDocumentExists(documentTemplateId?: string) {
    if (!documentTemplateId) return;

    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: documentTemplateId },
      select: { id: true, layout: true },
    });
    if (!template) {
      throw new NotFoundException('Выбранный бланк из раздела «Документы» не найден');
    }

    const { indicators } = extractLaboratoryDocumentIndicators(template.layout);
    if (!indicators.length) {
      throw new BadRequestException('В выбранном документе нет таблицы с колонками показателя и результата');
    }
  }

  private async ensureTestExists(testId: string) {
    const test = await this.prisma.laboratoryTest.findUnique({
      where: { id: testId },
      select: { id: true, serviceId: true, documentTemplateId: true, isActive: true },
    });
    if (!test) {
      throw new NotFoundException('Анализ не найден');
    }
    return test;
  }

  private ensureActiveTestConfigured(serviceId?: string, documentTemplateId?: string, isActive = true) {
    if (!isActive) return;
    if (!serviceId) {
      throw new BadRequestException('Для активного лабораторного анализа выберите платную услугу');
    }
    if (!documentTemplateId) {
      throw new BadRequestException('Для активного лабораторного анализа выберите документ с таблицей показателей');
    }
  }

  private async ensureProfileExists(profileId: string) {
    const profile = await this.prisma.laboratoryProfile.findUnique({ where: { id: profileId }, select: { id: true } });
    if (!profile) {
      throw new NotFoundException('Профиль анализов не найден');
    }
  }

  private async ensureTestsExist(testIds?: string[]) {
    if (!testIds?.length) {
      return;
    }

    const uniqueIds = [...new Set(testIds)];
    if (uniqueIds.length !== testIds.length) {
      throw new BadRequestException('В профиле есть повторяющиеся анализы');
    }

    const count = await this.prisma.laboratoryTest.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('Один или несколько анализов не найдены');
    }
  }
}

const laboratoryTestInclude = {
  service: { select: { ...servicePricingSelect, category: { select: { id: true, title: true } } } },
  documentTemplate: {
    select: {
      id: true,
      title: true,
      currentVersion: true,
      layout: true,
      category: { select: { id: true, title: true } },
    },
  },
  _count: { select: { profileLinks: true } },
} satisfies Prisma.LaboratoryTestInclude;

const laboratoryProfileInclude = {
  service: { select: { ...servicePricingSelect, category: { select: { id: true, title: true } } } },
  tests: {
    orderBy: { sortOrder: 'asc' },
    include: {
      test: {
        select: {
          id: true,
          title: true,
          code: true,
          groupName: true,
          unit: true,
          referenceRange: true,
          species: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.LaboratoryProfileInclude;

const laboratoryOrderItemInclude = {
  test: { select: { id: true, title: true, code: true, groupName: true } },
  profile: { select: { id: true, title: true, code: true } },
  billItem: { select: { id: true, title: true, totalAmount: true } },
} satisfies Prisma.LaboratoryOrderItemInclude;

const laboratoryOrderInclude = {
  visit: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      owner: { select: { id: true, fullName: true, phone: true } },
      animal: { select: { id: true, nickname: true, species: true, breed: true } },
      employee: { select: { id: true, fullName: true, position: true } },
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    include: laboratoryOrderItemInclude,
  },
} satisfies Prisma.LaboratoryOrderInclude;

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function ensureLaboratoryVisitOperational(visit: { status: VisitStatus }) {
  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException('Отменённый приём не принимает результаты. Сначала верните приём в работу');
  }
}

function assertCompletedLaboratoryResult(
  dto: Pick<UpdateLaboratoryOrderResultRowDto, 'status' | 'resultValue' | 'resultText'>,
  existing: { resultValue: string | null; resultText: string | null },
  hasFile: boolean,
) {
  if (dto.status !== LaboratoryOrderItemStatus.COMPLETED) return;
  const resultValue = dto.resultValue !== undefined ? clean(dto.resultValue) : clean(existing.resultValue);
  const resultText = dto.resultText !== undefined ? clean(dto.resultText) : clean(existing.resultText);
  if (!resultValue && !resultText && !hasFile) {
    throw new BadRequestException('Для готового показателя укажите значение, текст результата или приложите файл');
  }
}

function toLaboratoryResultUpdate(row: UpdateLaboratoryOrderResultRowDto): Prisma.LaboratoryOrderItemUpdateInput {
  return {
    ...(row.status !== undefined ? { status: row.status } : {}),
    ...(row.resultValue !== undefined ? { resultValue: clean(row.resultValue) } : {}),
    ...(row.resultText !== undefined ? { resultText: clean(row.resultText) } : {}),
    ...(row.unit !== undefined ? { unit: clean(row.unit) } : {}),
    ...(row.referenceRange !== undefined ? { referenceRange: clean(row.referenceRange) } : {}),
    ...(row.comment !== undefined ? { comment: clean(row.comment) } : {}),
    ...(row.status === LaboratoryOrderItemStatus.COMPLETED ? { completedAt: new Date() } : {}),
    ...(row.status !== undefined && row.status !== LaboratoryOrderItemStatus.COMPLETED ? { completedAt: null } : {}),
  };
}

type LaboratoryImportItem = {
  id: string;
  title: string;
  code: string | null;
  status: LaboratoryOrderItemStatus;
};

function matchImportRow(row: LaboratoryResultImportRowDto, items: LaboratoryImportItem[], matchedIds: Set<string>) {
  const normalizedCode = normalizeMatchText(row.code);
  const normalizedTitle = normalizeMatchText(row.title);
  let candidates = normalizedCode ? items.filter((item) => normalizeMatchText(item.code) === normalizedCode) : [];
  if (!candidates.length && normalizedTitle) {
    candidates = items.filter((item) => normalizeMatchText(item.title) === normalizedTitle);
  }
  if (!normalizedCode && !normalizedTitle) {
    return importMatch(row, 'NOT_FOUND', null, 'Нет кода или названия анализа');
  }
  if (!candidates.length) {
    return importMatch(row, 'NOT_FOUND', null, 'Анализ не найден в этом заказе');
  }
  if (candidates.length > 1) {
    return importMatch(row, 'AMBIGUOUS', null, 'Найдено несколько анализов; добавьте точный код');
  }
  const item = candidates[0];
  if (item.status === LaboratoryOrderItemStatus.CANCELLED) {
    return importMatch(row, 'BLOCKED', item, 'Строка заказа отменена');
  }
  if (matchedIds.has(item.id)) {
    return importMatch(row, 'DUPLICATE', item, 'Один анализ указан в файле несколько раз');
  }
  matchedIds.add(item.id);
  return importMatch(row, 'MATCHED', item, 'Распознано автоматически');
}

function importMatch(
  row: LaboratoryResultImportRowDto,
  matchStatus: 'MATCHED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'DUPLICATE' | 'BLOCKED',
  item: LaboratoryImportItem | null,
  message: string,
) {
  return {
    rowNumber: row.rowNumber,
    code: clean(row.code),
    title: clean(row.title),
    resultValue: clean(row.resultValue) ?? clean(row.resultText),
    matchStatus,
    itemId: item?.id ?? null,
    itemTitle: item?.title ?? null,
    message,
  };
}

function normalizeMatchText(value?: string | null) {
  return value?.normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/[\s._\-/\\]+/g, '') ?? '';
}

function required(value: string | null | undefined, message: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }

  return trimmed;
}

function normalizeSpecies(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function parseDateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};

  if (from) {
    filter.gte = parseDateBoundary(from, 'start');
  }

  if (to) {
    filter.lte = parseDateBoundary(to, 'end');
  }

  return Object.keys(filter).length ? filter : undefined;
}

function parseDateBoundary(value: string, boundary: 'start' | 'end') {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Укажите дату лабораторного журнала в формате ГГГГ-ММ-ДД');
  }

  if (boundary === 'start') {
    date.setHours(0, 0, 0, 0);
  } else {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

async function syncLaboratoryOrderStatus(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.laboratoryOrderItem.findMany({
    where: { orderId },
    select: { status: true },
  });

  const status = resolveLaboratoryOrderStatus(items.map((item) => item.status));

  await tx.laboratoryOrder.update({
    where: { id: orderId },
    data: {
      status,
      completedAt: status === LaboratoryOrderStatus.COMPLETED ? new Date() : null,
    },
  });
}

function resolveLaboratoryOrderStatus(itemStatuses: LaboratoryOrderItemStatus[]) {
  if (!itemStatuses.length) {
    return LaboratoryOrderStatus.ORDERED;
  }

  if (itemStatuses.every((status) => status === LaboratoryOrderItemStatus.CANCELLED)) {
    return LaboratoryOrderStatus.CANCELLED;
  }

  if (itemStatuses.every((status) => status === LaboratoryOrderItemStatus.COMPLETED)) {
    return LaboratoryOrderStatus.COMPLETED;
  }

  if (itemStatuses.some((status) => status === LaboratoryOrderItemStatus.IN_PROGRESS || status === LaboratoryOrderItemStatus.COMPLETED)) {
    return LaboratoryOrderStatus.IN_PROGRESS;
  }

  return LaboratoryOrderStatus.ORDERED;
}
