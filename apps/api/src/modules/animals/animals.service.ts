import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  BillSource,
  HospitalStayStatus,
  NotificationChannel,
  NotificationStatus,
  PaymentStatus,
  Prisma,
  QueueStatus,
  TaskStatus,
  VisitStatus,
} from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { rankSearchResults, withRussianSearchVariants } from '../../common/search-ranking';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { FinanceService } from '../finance/finance.service';
import { resolveServiceUnitPrice, servicePricingSelect } from '../stock/service-pricing';
import { AnimalArchiveReason, ArchiveAnimalDto } from './dto/archive-animal.dto';
import { CancelVaccinationDto } from './dto/cancel-vaccination.dto';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateWeightRecordDto } from './dto/create-weight-record.dto';
import { ListAnimalsQueryDto } from './dto/list-animals-query.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';
import { AnimalCatalogService } from './animal-catalog.service';

@Injectable()
export class AnimalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly animalCatalogService: AnimalCatalogService,
    private readonly schedulingService: SchedulingService,
    private readonly financeService: FinanceService,
  ) {}

  listCatalog() {
    return this.animalCatalogService.listCatalog();
  }

  async listAnimals(query: ListAnimalsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.AnimalWhereInput = {
      ...(query.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(search
        ? {
            OR: withRussianSearchVariants(search, (variant) => [
              { nickname: { contains: variant, mode: 'insensitive' as const } },
              { species: { contains: variant, mode: 'insensitive' as const } },
              { breed: { contains: variant, mode: 'insensitive' as const } },
              { microchip: { contains: variant, mode: 'insensitive' as const } },
              { owner: { fullName: { contains: variant, mode: 'insensitive' as const } } },
              { owner: { phone: { contains: variant, mode: 'insensitive' as const } } },
            ]),
          }
        : {}),
    };

    if (search) {
      const summaries = await this.prisma.animal.findMany({
        where,
        select: { id: true, nickname: true },
      });
      const pageIds = rankSearchResults(summaries, search, (animal) => [animal.nickname])
        .slice(offset, offset + limit)
        .map((animal) => animal.id);
      const pageItems = pageIds.length
        ? await this.prisma.animal.findMany({ where: { id: { in: pageIds } }, include: animalListInclude })
        : [];
      const itemsById = new Map(pageItems.map((animal) => [animal.id, animal]));
      return { items: pageIds.flatMap((id) => itemsById.get(id) ?? []), total: summaries.length, limit, offset };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.animal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: animalListInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.animal.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getAnimal(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      include: {
        owner: true,
        weights: {
          orderBy: { measuredAt: 'desc' },
          take: 20,
        },
        vaccinations: {
          where: { cancelledAt: null },
          orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
          include: vaccinationInclude,
        },
        _count: {
          select: {
            appointments: true,
            visits: true,
            tasks: true,
            bills: true,
            vaccinations: { where: { cancelledAt: null } },
            weights: true,
            queueEntries: true,
            hospitalStays: true,
            sales: true,
            notifications: true,
            onlineRequests: true,
            files: true,
          },
        },
      },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }

    return animal;
  }

  async archiveAnimal(animalId: string, dto: ArchiveAnimalDto, actorId: string) {
    const comment = emptyToNull(dto.comment);
    if (dto.reason === AnimalArchiveReason.OTHER && !comment) {
      throw new BadRequestException('Для причины «Другое» укажите комментарий');
    }

    return this.prisma.$transaction(async (tx) => {
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: {
          id: true,
          ownerId: true,
          nickname: true,
          archivedAt: true,
          appointments: {
            where: {
              OR: [
                { status: { in: [AppointmentStatus.ARRIVED, AppointmentStatus.IN_PROGRESS] } },
                { status: AppointmentStatus.PLANNED, startsAt: { gte: new Date() } },
              ],
            },
            select: { id: true },
            take: 1,
          },
          visits: {
            where: { status: { in: [VisitStatus.DRAFT, VisitStatus.IN_PROGRESS] } },
            select: { id: true },
            take: 1,
          },
          queueEntries: {
            where: { status: { in: [QueueStatus.WAITING, QueueStatus.IN_PROGRESS] } },
            select: { id: true },
            take: 1,
          },
          hospitalStays: {
            where: { status: HospitalStayStatus.ACTIVE },
            select: { id: true },
            take: 1,
          },
          _count: {
            select: {
              appointments: true,
              visits: true,
              tasks: true,
              bills: true,
              vaccinations: true,
              weights: true,
              queueEntries: true,
              hospitalStays: true,
              sales: true,
              notifications: true,
              onlineRequests: true,
              files: true,
            },
          },
        },
      });

      if (!animal) {
        throw new NotFoundException('Animal not found');
      }

      if (animal.archivedAt) {
        throw new BadRequestException('Пациент уже находится в архиве');
      }
      const activeLinks = [
        animal.visits.length ? 'незавершённый приём' : null,
        animal.hospitalStays.length ? 'активный стационар' : null,
        animal.queueEntries.length ? 'активная очередь' : null,
        animal.appointments.length ? 'действующая запись на приём' : null,
      ].filter(Boolean);
      if (activeLinks.length) {
        throw new BadRequestException(
          `Сначала завершите или отмените текущие процессы: ${activeLinks.join(', ')}. Прошлая история архивированию не мешает.`,
        );
      }

      const archivedAt = new Date();
      const archived = await tx.animal.update({
        where: { id: animal.id },
        data: {
          archivedAt,
          archiveReason: dto.reason,
          archiveComment: comment,
          archivedById: actorId,
        },
      });
      const cancelledNotifications = await tx.notificationOutbox.updateMany({
        where: {
          animalId: animal.id,
          status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] },
          scheduledAt: { gt: archivedAt },
        },
        data: {
          status: NotificationStatus.CANCELLED,
          lastError: 'Отменено при архивировании пациента',
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'animal.archive',
          entityType: 'Animal',
          entityId: animal.id,
          metadata: {
            ownerId: animal.ownerId,
            nickname: animal.nickname,
            reason: dto.reason,
            comment,
            linkedRecords: animal._count,
            cancelledFutureNotifications: cancelledNotifications.count,
          },
        },
      });
      return archived;
    });
  }

  async restoreAnimal(animalId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const animal = await tx.animal.findUnique({
        where: { id: animalId },
        select: {
          id: true,
          ownerId: true,
          nickname: true,
          archivedAt: true,
          archiveReason: true,
          archiveComment: true,
          archivedById: true,
        },
      });

      if (!animal) {
        throw new NotFoundException('Animal not found');
      }
      if (!animal.archivedAt) {
        throw new BadRequestException('Пациент уже находится в активных карточках');
      }

      const restored = await tx.animal.update({
        where: { id: animal.id },
        data: {
          archivedAt: null,
          archiveReason: null,
          archiveComment: null,
          archivedById: null,
        },
      });
      const restoredNotifications = await tx.notificationOutbox.updateMany({
        where: {
          animalId: animal.id,
          status: NotificationStatus.CANCELLED,
          scheduledAt: { gt: new Date() },
          lastError: 'Отменено при архивировании пациента',
        },
        data: {
          status: NotificationStatus.QUEUED,
          attempts: 0,
          lastError: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'animal.restore',
          entityType: 'Animal',
          entityId: animal.id,
          metadata: {
            ownerId: animal.ownerId,
            nickname: animal.nickname,
            previousArchive: {
              archivedAt: animal.archivedAt.toISOString(),
              reason: animal.archiveReason,
              comment: animal.archiveComment,
              archivedById: animal.archivedById,
            },
            restoredFutureNotifications: restoredNotifications.count,
          },
        },
      });
      return restored;
    });
  }

  async updateAnimal(animalId: string, dto: UpdateAnimalDto, actorId: string) {
    const currentAnimal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true, nickname: true, species: true, breed: true, archivedAt: true },
    });
    if (!currentAnimal) {
      throw new NotFoundException('Animal not found');
    }
    if (currentAnimal.archivedAt) {
      throw new BadRequestException('Пациент находится в архиве. Сначала восстановите карточку');
    }
    if (dto.species !== undefined || dto.breed !== undefined) {
      await this.animalCatalogService.validateSelection(dto.species ?? currentAnimal.species, dto.breed ?? currentAnimal.breed);
    }

    const animal = await this.prisma.animal.update({
      where: { id: animalId },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {}),
        ...(dto.species !== undefined ? { species: dto.species || null } : {}),
        ...(dto.breed !== undefined ? { breed: dto.breed || null } : {}),
        ...(dto.sex !== undefined ? { sex: dto.sex } : {}),
        ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null } : {}),
        ...(dto.color !== undefined ? { color: dto.color || null } : {}),
        ...(dto.microchip !== undefined ? { microchip: dto.microchip || null } : {}),
        ...(dto.mark !== undefined ? { mark: dto.mark || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment || null } : {}),
        ...(dto.isSterilized !== undefined ? { isSterilized: dto.isSterilized } : {}),
        ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
        ...(dto.status !== undefined ? { status: dto.status || null } : {}),
      },
    });

    await this.auditService.log({
      actorId,
      action: 'animal.update',
      entityType: 'Animal',
      entityId: animal.id,
      metadata: {
        changedFields: Object.keys(dto),
        ...(dto.nickname !== undefined && dto.nickname !== currentAnimal.nickname
          ? { nickname: { from: currentAnimal.nickname, to: dto.nickname } }
          : {}),
      },
    });

    return animal;
  }

  async listWeightRecords(animalId: string) {
    await this.ensureAnimalExists(animalId);

    return this.prisma.animalWeightRecord.findMany({
      where: { animalId },
      orderBy: { measuredAt: 'desc' },
      take: 100,
    });
  }

  async createWeightRecord(animalId: string, dto: CreateWeightRecordDto, actorId: string) {
    await this.ensureActiveAnimalExists(animalId);

    const weightRecord = await this.prisma.animalWeightRecord.create({
      data: {
        animalId,
        weightKg: dto.weightKg,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : undefined,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'animal_weight.create',
      entityType: 'AnimalWeightRecord',
      entityId: weightRecord.id,
      metadata: { animalId },
    });

    return weightRecord;
  }

  async listVaccinations(animalId: string) {
    await this.ensureAnimalExists(animalId);

    return this.prisma.vaccination.findMany({
      where: { animalId, cancelledAt: null },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
      include: vaccinationInclude,
    });
  }

  async createVaccination(animalId: string, dto: CreateVaccinationDto, actorId: string) {
    if (dto.visitId) {
      return this.createVisitVaccination(animalId, dto, actorId);
    }

    const animal = await this.getAnimalForVaccination(animalId);
    await this.validateRevaccinationAssignment(dto);
    let taskAudit: TaskAudit | null = null;

    const vaccination = await this.prisma.$transaction(async (tx) => {
      const createdVaccination = await tx.vaccination.create({
        data: {
          animalId,
          title: dto.title,
          status: emptyToNull(dto.status),
          vaccinatedAt: dateOrNull(dto.vaccinatedAt),
          expiresAt: dateOrNull(dto.expiresAt),
          vaccineBatch: emptyToNull(dto.vaccineBatch),
          vaccineSeries: emptyToNull(dto.vaccineSeries),
          vaccineExpiresAt: dateOrNull(dto.vaccineExpiresAt),
          smsReminder: dto.smsReminder ?? false,
          ownerReminderEnabled: dto.ownerReminderEnabled ?? false,
          notes: emptyToNull(dto.notes),
        },
        include: vaccinationInclude,
      });

      taskAudit = await this.syncRevaccinationTask(tx, animal, createdVaccination, dto, actorId);
      await this.syncOwnerVaccinationReminders(tx, animal, createdVaccination, actorId);

      return tx.vaccination.findUniqueOrThrow({
        where: { id: createdVaccination.id },
        include: vaccinationInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.create',
      entityType: 'Vaccination',
      entityId: vaccination.id,
      metadata: { animalId, revaccinationTaskId: vaccination.revaccinationTask?.id ?? null },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return vaccination;
  }

  private async createVisitVaccination(animalId: string, dto: CreateVaccinationDto, actorId: string) {
    if (!dto.visitId || !dto.productId) {
      throw new BadRequestException('Для вакцинации в приёме выберите препарат из товаров');
    }

    const animal = await this.getAnimalForVaccination(animalId);
    await this.validateRevaccinationAssignment(dto);
    const dueAt = await this.financeService.getDefaultBillDueAt();
    let taskAudit: TaskAudit | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({
        where: { id: dto.visitId },
        select: { id: true, ownerId: true, animalId: true, status: true },
      });
      if (!visit || visit.animalId !== animalId) {
        throw new NotFoundException('Приём этого пациента не найден');
      }
      if (visit.status !== VisitStatus.DRAFT && visit.status !== VisitStatus.IN_PROGRESS) {
        throw new BadRequestException('Вакцинацию с начислением можно добавить только в открытый приём');
      }

      const product = await tx.product.findFirst({
        where: { id: dto.productId, isActive: true },
        select: { id: true, title: true, retailPrice: true },
      });
      if (!product) {
        throw new NotFoundException('Выбранный препарат не найден в активных товарах');
      }

      const service = dto.serviceId
        ? await tx.service.findFirst({ where: { id: dto.serviceId, isActive: true }, select: servicePricingSelect })
        : null;
      if (dto.serviceId && !service) {
        throw new NotFoundException('Выбранная услуга вакцинации не найдена');
      }

      await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "visitId" = ${visit.id} FOR UPDATE`;
      let bill = await tx.bill.findUnique({
        where: { visitId: visit.id },
        select: { id: true, status: true, paidAmount: true },
      });
      if (bill?.status === PaymentStatus.CANCELLED) {
        throw new BadRequestException('Отменённый счёт нельзя менять. Сначала откройте счёт повторно');
      }
      if (bill && decimal(bill.paidAmount).greaterThan(0)) {
        throw new BadRequestException('Оплаченный счёт нельзя менять до оформления возврата');
      }
      if (!bill) {
        bill = await tx.bill.create({
          data: {
            ownerId: visit.ownerId,
            animalId,
            visitId: visit.id,
            source: BillSource.VISIT,
            status: PaymentStatus.UNPAID,
            dueAt,
          },
          select: { id: true, status: true, paidAmount: true },
        });
      }

      const productLine = resolveVaccinationBillLine({
        quantity: dto.quantity ?? 1,
        stockQuantity: dto.stockQuantity ?? dto.quantity ?? 1,
        unitPrice: dto.unitPrice ?? decimal(product.retailPrice).toNumber(),
        discount: dto.discount ?? 0,
      });
      const productBillItem = await tx.billItem.create({
        data: {
          billId: bill.id,
          productId: product.id,
          title: product.title,
          quantity: productLine.quantity,
          stockQuantity: productLine.stockQuantity,
          unitPrice: productLine.unitPrice,
          discount: productLine.discount,
          totalAmount: productLine.totalAmount,
        },
      });

      const serviceBillItem = service
        ? await tx.billItem.create({
            data: {
              billId: bill.id,
              serviceId: service.id,
              title: service.title,
              quantity: 1,
              unitPrice: resolveServiceUnitPrice(service, dto.serviceUnitPrice),
              discount: 0,
              totalAmount: resolveServiceUnitPrice(service, dto.serviceUnitPrice),
            },
          })
        : null;

      const createdVaccination = await tx.vaccination.create({
        data: {
          animalId,
          visitId: visit.id,
          productId: product.id,
          billItemId: productBillItem.id,
          serviceBillItemId: serviceBillItem?.id,
          title: product.title,
          status: emptyToNull(dto.status),
          vaccinatedAt: dateOrNull(dto.vaccinatedAt) ?? new Date(),
          expiresAt: dateOrNull(dto.expiresAt),
          vaccineBatch: emptyToNull(dto.vaccineBatch),
          vaccineSeries: emptyToNull(dto.vaccineSeries),
          vaccineExpiresAt: dateOrNull(dto.vaccineExpiresAt),
          smsReminder: dto.smsReminder ?? false,
          ownerReminderEnabled: dto.ownerReminderEnabled ?? false,
          notes: emptyToNull(dto.notes),
        },
        include: vaccinationInclude,
      });

      taskAudit = await this.syncRevaccinationTask(tx, animal, createdVaccination, dto, actorId);
      await this.syncOwnerVaccinationReminders(tx, animal, createdVaccination, actorId);

      const billItems = await tx.billItem.findMany({ where: { billId: bill.id }, select: { totalAmount: true } });
      const totalAmount = billItems.reduce((sum, item) => sum.plus(item.totalAmount), decimal(0));
      await tx.bill.update({ where: { id: bill.id }, data: { totalAmount, status: PaymentStatus.UNPAID } });
      await tx.visit.update({ where: { id: visit.id }, data: { totalAmount } });

      return { vaccination: createdVaccination, productBillItemId: productBillItem.id, serviceBillItemId: serviceBillItem?.id ?? null };
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.create',
      entityType: 'Vaccination',
      entityId: result.vaccination.id,
      metadata: {
        animalId,
        visitId: dto.visitId,
        productId: dto.productId,
        billItemId: result.productBillItemId,
        serviceBillItemId: result.serviceBillItemId,
        revaccinationTaskId: result.vaccination.revaccinationTask?.id ?? null,
      },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return result.vaccination;
  }

  async updateVaccination(animalId: string, vaccinationId: string, dto: UpdateVaccinationDto, actorId: string) {
    const vaccination = await this.prisma.vaccination.findFirst({
      where: { id: vaccinationId, animalId },
      include: vaccinationInclude,
    });

    if (!vaccination) {
      throw new NotFoundException('Vaccination not found');
    }
    const animal = await this.getAnimalForVaccination(animalId);
    await this.validateRevaccinationAssignment(dto);
    let taskAudit: TaskAudit | null = null;

    const updatedVaccination = await this.prisma.$transaction(async (tx) => {
      const savedVaccination = await tx.vaccination.update({
        where: { id: vaccinationId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.status !== undefined ? { status: emptyToNull(dto.status) } : {}),
          ...(dto.vaccinatedAt !== undefined ? { vaccinatedAt: dateOrNull(dto.vaccinatedAt) } : {}),
          ...(dto.expiresAt !== undefined ? { expiresAt: dateOrNull(dto.expiresAt) } : {}),
          ...(dto.vaccineBatch !== undefined ? { vaccineBatch: emptyToNull(dto.vaccineBatch) } : {}),
          ...(dto.vaccineSeries !== undefined ? { vaccineSeries: emptyToNull(dto.vaccineSeries) } : {}),
          ...(dto.vaccineExpiresAt !== undefined ? { vaccineExpiresAt: dateOrNull(dto.vaccineExpiresAt) } : {}),
          ...(dto.smsReminder !== undefined ? { smsReminder: dto.smsReminder } : {}),
          ...(dto.ownerReminderEnabled !== undefined ? { ownerReminderEnabled: dto.ownerReminderEnabled } : {}),
          ...(dto.notes !== undefined ? { notes: emptyToNull(dto.notes) } : {}),
        },
        include: vaccinationInclude,
      });

      taskAudit = await this.syncRevaccinationTask(tx, animal, savedVaccination, dto, actorId);
      await this.syncOwnerVaccinationReminders(tx, animal, savedVaccination, actorId);

      return tx.vaccination.findUniqueOrThrow({
        where: { id: vaccinationId },
        include: vaccinationInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.update',
      entityType: 'Vaccination',
      entityId: vaccinationId,
      metadata: {
        animalId,
        changedFields: Object.keys(dto),
        revaccinationTaskId: updatedVaccination.revaccinationTask?.id ?? null,
      },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return updatedVaccination;
  }

  async cancelVaccination(animalId: string, vaccinationId: string, dto: CancelVaccinationDto, actorId: string) {
    const vaccination = await this.prisma.vaccination.findFirst({
      where: { id: vaccinationId, animalId, cancelledAt: null },
      include: {
        ...vaccinationInclude,
        billItem: { include: { bill: { select: { id: true, status: true, paidAmount: true, visitId: true } } } },
        serviceBillItem: { include: { bill: { select: { id: true, status: true, paidAmount: true, visitId: true } } } },
      },
    });
    if (!vaccination) {
      throw new NotFoundException('Вакцинация не найдена');
    }

    let taskAudit: TaskAudit | null = null;
    await this.prisma.$transaction(async (tx) => {
      const linkedItems = [vaccination.billItem, vaccination.serviceBillItem].filter((item): item is NonNullable<typeof item> => Boolean(item));
      const billIds = [...new Set(linkedItems.map((item) => item.bill.id))];

      for (const billId of billIds) {
        await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "id" = ${billId} FOR UPDATE`;
      }
      for (const item of linkedItems) {
        if (decimal(item.bill.paidAmount).greaterThan(0) || item.bill.status === PaymentStatus.PAID || item.bill.status === PaymentStatus.PARTIAL) {
          throw new BadRequestException('Сначала оформите возврат оплаты, затем удаляйте ошибочную вакцинацию');
        }
      }

      taskAudit = await this.cancelOpenRevaccinationTask(tx, vaccination.revaccinationTask, vaccination.id);
      await tx.notificationOutbox.updateMany({
        where: {
          dedupeKey: { startsWith: `vaccination:${vaccination.id}:` },
          status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED, NotificationStatus.CANCELLED] },
        },
        data: { status: NotificationStatus.CANCELLED },
      });

      await tx.vaccination.update({
        where: { id: vaccination.id },
        data: {
          billItemId: null,
          serviceBillItemId: null,
          cancelledAt: new Date(),
          cancelledById: actorId,
          cancellationReason: dto.reason.trim(),
        },
      });

      const itemIds = linkedItems.map((item) => item.id);
      if (itemIds.length) {
        await tx.billItem.deleteMany({ where: { id: { in: itemIds } } });
      }

      for (const billId of billIds) {
        const billItems = await tx.billItem.findMany({ where: { billId }, select: { totalAmount: true } });
        const totalAmount = billItems.reduce((sum, item) => sum.plus(item.totalAmount), decimal(0));
        const bill = linkedItems.find((item) => item.bill.id === billId)?.bill;
        await tx.bill.update({ where: { id: billId }, data: { totalAmount, status: resolvePaymentStatus(totalAmount, decimal(bill?.paidAmount ?? 0)) } });
        if (bill?.visitId) {
          await tx.visit.update({ where: { id: bill.visitId }, data: { totalAmount } });
        }
      }
    });

    await this.auditService.log({
      actorId,
      action: 'vaccination.cancel',
      entityType: 'Vaccination',
      entityId: vaccinationId,
      metadata: {
        animalId,
        visitId: vaccination.visitId,
        reason: dto.reason.trim(),
        removedBillItemIds: [vaccination.billItemId, vaccination.serviceBillItemId].filter(Boolean),
      },
    });
    await this.logTaskAudit(taskAudit, actorId);

    return { deleted: true };
  }

  private async getAnimalForVaccination(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: {
        id: true,
        ownerId: true,
        nickname: true,
        species: true,
        breed: true,
        archivedAt: true,
      },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
    if (animal.archivedAt) {
      throw new BadRequestException('Пациент находится в архиве. Сначала восстановите карточку');
    }

    return animal;
  }

  private async syncRevaccinationTask(
    tx: Prisma.TransactionClient,
    animal: AnimalForVaccination,
    vaccination: VaccinationWithTask,
    dto: CreateVaccinationDto | UpdateVaccinationDto,
    actorId: string,
  ): Promise<TaskAudit | null> {
    if (!vaccination.expiresAt || dto.createRevaccinationTask === false) {
      return this.cancelOpenRevaccinationTask(tx, vaccination.revaccinationTask, vaccination.id);
    }

    const assignment = await this.resolveRevaccinationAssignment(tx, dto, vaccination.revaccinationTask);
    const baseData: Prisma.TaskUncheckedUpdateInput = {
      ownerId: animal.ownerId,
      animalId: animal.id,
      taskType: 'revaccination',
      title: `Ревакцинация: ${vaccination.title}`,
      comment: this.buildRevaccinationComment(animal, vaccination),
      dueAt: vaccination.expiresAt,
    };

    if (assignment.shouldPatch) {
      baseData.assigneeId = assignment.assigneeId;
      baseData.assigneeRoleCode = assignment.assigneeRoleCode;
    }

    if (vaccination.revaccinationTask) {
      if (vaccination.revaccinationTask.status === TaskStatus.DONE || vaccination.revaccinationTask.status === TaskStatus.ARCHIVED) {
        return null;
      }

      const task = await tx.task.update({
        where: { id: vaccination.revaccinationTask.id },
        data: {
          ...baseData,
          ...(vaccination.revaccinationTask.status === TaskStatus.CANCELLED ? { status: TaskStatus.OPEN } : {}),
        },
        select: { id: true, status: true },
      });

      return {
        action: 'task.update',
        taskId: task.id,
        metadata: { source: 'vaccination', sourceVaccinationId: vaccination.id, status: task.status },
      };
    }

    const task = await tx.task.create({
      data: {
        ...(baseData as Prisma.TaskUncheckedCreateInput),
        creatorId: actorId,
        sourceVaccinationId: vaccination.id,
        status: TaskStatus.OPEN,
      },
      select: { id: true, status: true },
    });

    return {
      action: 'task.create',
      taskId: task.id,
      metadata: { source: 'vaccination', sourceVaccinationId: vaccination.id, status: task.status },
    };
  }

  private async cancelOpenRevaccinationTask(
    tx: Prisma.TransactionClient,
    task: VaccinationTask | null,
    vaccinationId: string,
  ): Promise<TaskAudit | null> {
    if (!task || task.status !== TaskStatus.OPEN) {
      return null;
    }

    const cancelledTask = await tx.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.CANCELLED },
      select: { id: true, status: true },
    });

    return {
      action: 'task.cancel',
      taskId: cancelledTask.id,
      metadata: { source: 'vaccination', sourceVaccinationId: vaccinationId, status: cancelledTask.status },
    };
  }

  private async syncOwnerVaccinationReminders(
    tx: Prisma.TransactionClient,
    animal: AnimalForVaccination,
    vaccination: VaccinationWithTask,
    actorId: string,
  ) {
    const dedupePrefix = `vaccination:${vaccination.id}:`;

    await tx.notificationOutbox.updateMany({
      where: {
        dedupeKey: { startsWith: dedupePrefix },
        status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED, NotificationStatus.CANCELLED] },
      },
      data: { status: NotificationStatus.CANCELLED },
    });

    if (!vaccination.ownerReminderEnabled || !vaccination.expiresAt || !animal.ownerId) {
      return;
    }

    const dueDateKey = vaccination.expiresAt.toISOString().slice(0, 10);
    const dueDateText = vaccination.expiresAt.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
    const now = new Date();

    for (const offsetDays of OWNER_VACCINATION_REMINDER_OFFSETS) {
      const scheduledAt = vaccinationReminderTime(vaccination.expiresAt, offsetDays);
      if (scheduledAt <= now) {
        continue;
      }

      const dedupeKey = `${dedupePrefix}${dueDateKey}:${offsetDays}d`;
      const body = buildVaccinationReminderBody(animal.nickname, vaccination.title, dueDateText, offsetDays);
      const existing = await tx.notificationOutbox.findUnique({
        where: { dedupeKey },
        select: { id: true, status: true },
      });

      if (existing?.status === NotificationStatus.SENT || existing?.status === NotificationStatus.SENDING) {
        continue;
      }

      const data = {
        ownerId: animal.ownerId,
        animalId: animal.id,
        createdById: actorId,
        channel: NotificationChannel.MESSENGER,
        recipient: `owner:${animal.ownerId}`,
        subject: 'Напоминание о вакцинации',
        body,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        scheduledAt,
        sentAt: null,
        lastError: null,
        metadata: {
          source: 'vaccination',
          vaccinationId: vaccination.id,
          offsetDays,
          dueDate: dueDateKey,
        } satisfies Prisma.InputJsonObject,
      };

      if (existing) {
        await tx.notificationOutbox.update({ where: { id: existing.id }, data });
      } else {
        await tx.notificationOutbox.create({ data: { ...data, dedupeKey } });
      }
    }
  }

  private async validateRevaccinationAssignment(dto: CreateVaccinationDto | UpdateVaccinationDto) {
    const assigneeId = emptyToNull(dto.revaccinationAssigneeId);
    const assigneeRoleCode = emptyToNull(dto.revaccinationAssigneeRoleCode);

    if (assigneeId && assigneeRoleCode) {
      throw new BadRequestException('Выберите сотрудника или роль для задачи ревакцинации, не оба варианта одновременно');
    }

    if (assigneeId) {
      await this.schedulingService.ensureEmployeeActive(assigneeId);
    }
  }

  private async resolveRevaccinationAssignment(
    tx: Prisma.TransactionClient,
    dto: CreateVaccinationDto | UpdateVaccinationDto,
    existingTask: VaccinationTask | null,
  ) {
    const assigneeId = emptyToNull(dto.revaccinationAssigneeId);
    const assigneeRoleCode = emptyToNull(dto.revaccinationAssigneeRoleCode);
    const hasAssignmentPatch = dto.revaccinationAssigneeId !== undefined || dto.revaccinationAssigneeRoleCode !== undefined;

    if (assigneeRoleCode) {
      await this.ensureRoleExists(tx, assigneeRoleCode);
    }

    if (hasAssignmentPatch) {
      return {
        shouldPatch: true,
        assigneeId: assigneeId ?? null,
        assigneeRoleCode: assigneeRoleCode ?? null,
      };
    }

    if (existingTask) {
      return { shouldPatch: false, assigneeId: undefined, assigneeRoleCode: undefined };
    }

    const defaultRole = await tx.role.findUnique({
      where: { code: 'doctor' },
      select: { code: true },
    });

    return {
      shouldPatch: true,
      assigneeId: null,
      assigneeRoleCode: defaultRole?.code ?? null,
    };
  }

  private async ensureRoleExists(tx: Prisma.TransactionClient, roleCode: string) {
    const role = await tx.role.findUnique({
      where: { code: roleCode },
      select: { code: true },
    });

    if (!role) {
      throw new NotFoundException('Роль не найдена');
    }
  }

  private buildRevaccinationComment(animal: AnimalForVaccination, vaccination: VaccinationWithTask) {
    const details = [animal.nickname, animal.species, animal.breed].filter(Boolean).join(', ');
    const notes = vaccination.notes ? `\nКомментарий: ${vaccination.notes}` : '';

    return `Автоматическая задача по ревакцинации. Пациент: ${details || animal.nickname}.${notes}`;
  }

  private async logTaskAudit(taskAudit: TaskAudit | null, actorId: string) {
    if (!taskAudit) {
      return;
    }

    await this.auditService.log({
      actorId,
      action: taskAudit.action,
      entityType: 'Task',
      entityId: taskAudit.taskId,
      metadata: taskAudit.metadata,
    });
  }

  private async ensureAnimalExists(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
  }

  private async ensureActiveAnimalExists(animalId: string) {
    const animal = await this.prisma.animal.findUnique({
      where: { id: animalId },
      select: { id: true, archivedAt: true },
    });

    if (!animal) {
      throw new NotFoundException('Animal not found');
    }
    if (animal.archivedAt) {
      throw new BadRequestException('Пациент находится в архиве. Сначала восстановите карточку');
    }
  }
}

const animalListInclude = {
  owner: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      extraPhone: true,
    },
  },
  weights: {
    orderBy: { measuredAt: 'desc' },
    take: 1,
  },
  vaccinations: {
    where: { cancelledAt: null },
    orderBy: { expiresAt: 'asc' },
    take: 3,
  },
  _count: {
    select: {
      visits: true,
      tasks: true,
      vaccinations: { where: { cancelledAt: null } },
    },
  },
} satisfies Prisma.AnimalInclude;

const vaccinationInclude = {
  product: {
    select: { id: true, title: true, retailPrice: true, stockUnit: true, writeOffUnit: true, billingUnit: true },
  },
  billItem: {
    select: { id: true, title: true, quantity: true, stockQuantity: true, unitPrice: true, discount: true, totalAmount: true },
  },
  serviceBillItem: {
    select: { id: true, title: true, quantity: true, unitPrice: true, totalAmount: true, serviceId: true },
  },
  revaccinationTask: {
    select: {
      id: true,
      status: true,
      dueAt: true,
      assigneeId: true,
      assigneeRoleCode: true,
      title: true,
    },
  },
} satisfies Prisma.VaccinationInclude;

type VaccinationWithTask = Prisma.VaccinationGetPayload<{ include: typeof vaccinationInclude }>;
type VaccinationTask = VaccinationWithTask['revaccinationTask'];
type AnimalForVaccination = Awaited<ReturnType<AnimalsService['getAnimalForVaccination']>>;

type TaskAudit = {
  action: 'task.create' | 'task.update' | 'task.cancel';
  taskId: string;
  metadata: Prisma.InputJsonObject;
};

const OWNER_VACCINATION_REMINDER_OFFSETS = [7, 1] as const;

function vaccinationReminderTime(dueDate: Date, offsetDays: number) {
  return new Date(Date.UTC(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate() - offsetDays,
    7,
  ));
}

function buildVaccinationReminderBody(animalName: string, vaccinationTitle: string, dueDate: string, offsetDays: number) {
  const timing = offsetDays === 1 ? 'завтра' : 'через неделю';
  return `TemichevVet: напоминаем, что ${timing} для питомца ${animalName} подходит срок вакцинации «${vaccinationTitle}» (${dueDate}). Пожалуйста, свяжитесь с клиникой, чтобы согласовать время.`;
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function dateOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Укажите корректную дату');
  }

  return date;
}

function resolveVaccinationBillLine(input: {
  quantity: Prisma.Decimal.Value;
  stockQuantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discount: Prisma.Decimal.Value;
}) {
  const quantity = decimal(input.quantity);
  const stockQuantity = decimal(input.stockQuantity);
  const unitPrice = decimal(input.unitPrice);
  const discount = decimal(input.discount);
  if (quantity.lessThanOrEqualTo(0) || stockQuantity.lessThanOrEqualTo(0)) {
    throw new BadRequestException('Количество вакцины должно быть больше нуля');
  }
  if (unitPrice.lessThan(0) || discount.lessThan(0)) {
    throw new BadRequestException('Цена и скидка не могут быть отрицательными');
  }
  const calculatedTotal = quantity.mul(unitPrice).minus(discount);
  const totalAmount = calculatedTotal.lessThan(0) ? decimal(0) : calculatedTotal;
  return { quantity, stockQuantity, unitPrice, discount, totalAmount };
}

function resolvePaymentStatus(totalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal) {
  if (paidAmount.greaterThanOrEqualTo(totalAmount) && totalAmount.greaterThan(0)) return PaymentStatus.PAID;
  if (paidAmount.greaterThan(0)) return PaymentStatus.PARTIAL;
  return PaymentStatus.UNPAID;
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}
