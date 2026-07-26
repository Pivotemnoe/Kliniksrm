import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StockDocumentStatus,
  StockDocumentType,
  StockMovementType,
} from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStockDocumentDto } from './dto/create-stock-document.dto';
import { CreateSupplierPaymentDto } from './dto/create-supplier-payment.dto';
import { ListStockDocumentsQueryDto } from './dto/list-stock-documents-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';

type WarehouseScope = string[] | null;

const documentInclude = {
  warehouse: { select: { id: true, name: true } },
  toWarehouse: { select: { id: true, name: true } },
  supplier: { select: { id: true, title: true } },
  createdBy: { select: { id: true, fullName: true } },
  postedBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: { select: { id: true, title: true, stockUnit: true, barcode: true } },
      targetProduct: { select: { id: true, title: true, stockUnit: true, barcode: true } },
      sourceBatch: { select: { id: true, series: true, expiresAt: true, rest: true, purchasePrice: true } },
      targetBatch: { select: { id: true, series: true, expiresAt: true, rest: true, purchasePrice: true } },
    },
  },
} satisfies Prisma.StockDocumentInclude;

@Injectable()
export class StockDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listDocuments(query: ListStockDocumentsQueryDto, actorId: string) {
    const scope = await this.getWarehouseScope(actorId);
    const { limit, offset } = parsePagination(query);
    const where: Prisma.StockDocumentWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId
        ? { OR: [{ warehouseId: query.warehouseId }, { toWarehouseId: query.warehouseId }] }
        : scope
          ? { OR: [{ warehouseId: { in: scope } }, { toWarehouseId: { in: scope } }] }
          : {}),
    };
    if (query.warehouseId) this.ensureWarehouseAllowed(query.warehouseId, scope);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockDocument.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        include: documentInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.stockDocument.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async getDocument(documentId: string, actorId: string) {
    const document = await this.prisma.stockDocument.findUnique({ where: { id: documentId }, include: documentInclude });
    if (!document) throw new NotFoundException('Складской документ не найден');
    await this.ensureDocumentAllowed(document, actorId);
    return document;
  }

  async createDocument(dto: CreateStockDocumentDto, actorId: string) {
    if (!dto.items.length) throw new BadRequestException('Добавьте хотя бы одну позицию');
    const scope = await this.getWarehouseScope(actorId);
    const sourceBatchIds = dto.items.map((item) => item.sourceBatchId).filter((id): id is string => Boolean(id));
    if (sourceBatchIds.length !== dto.items.length) {
      throw new BadRequestException('Для каждой позиции нужно выбрать исходную партию');
    }
    ensureUnique(sourceBatchIds, 'Одна партия не может повторяться в документе');

    const batches = await this.prisma.stockBatch.findMany({ where: { id: { in: sourceBatchIds } } });
    if (batches.length !== sourceBatchIds.length) throw new BadRequestException('Одна из выбранных партий не найдена');
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const warehouseIds = [...new Set(batches.map((batch) => batch.warehouseId))];
    if (warehouseIds.length !== 1) throw new BadRequestException('Один документ должен относиться к одному складу');
    const warehouseId = dto.warehouseId ?? warehouseIds[0];
    if (warehouseId !== warehouseIds[0]) throw new BadRequestException('Партии не относятся к выбранному складу');
    this.ensureWarehouseAllowed(warehouseId, scope);

    if (dto.type === StockDocumentType.TRANSFER) {
      if (!dto.toWarehouseId || dto.toWarehouseId === warehouseId) {
        throw new BadRequestException('Для перемещения выберите другой склад назначения');
      }
      await this.ensureWarehouseExists(dto.toWarehouseId);
      this.ensureWarehouseAllowed(dto.toWarehouseId, scope);
    }
    if (dto.type === StockDocumentType.SUPPLIER_RETURN && !dto.supplierId) {
      throw new BadRequestException('Для возврата выберите поставщика');
    }
    if (dto.type === StockDocumentType.SUPPLIER_RETURN) {
      const mismatchedBatch = batches.find((batch) => batch.supplierId && batch.supplierId !== dto.supplierId);
      if (mismatchedBatch) {
        throw new BadRequestException('Выбранная партия поступила от другого поставщика');
      }
    }

    const targetProductIds = dto.items.map((item) => item.targetProductId).filter((id): id is string => Boolean(id));
    if (dto.type === StockDocumentType.RESORTING && targetProductIds.length !== dto.items.length) {
      throw new BadRequestException('Для пересортицы укажите товар, в который переносится остаток');
    }
    if (targetProductIds.length) {
      const count = await this.prisma.product.count({ where: { id: { in: [...new Set(targetProductIds)] } } });
      if (count !== new Set(targetProductIds).size) throw new BadRequestException('Целевой товар не найден');
    }

    const items = dto.items.map((item) => {
      const batch = batchById.get(item.sourceBatchId!);
      if (!batch || batch.productId !== item.productId) throw new BadRequestException('Товар не соответствует выбранной партии');
      if (dto.type === StockDocumentType.INVENTORY || dto.type === StockDocumentType.CORRECTION) {
        if (item.actualQuantity === undefined) throw new BadRequestException('Укажите фактический остаток');
      } else if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Количество должно быть больше нуля');
      }
      return {
        productId: item.productId,
        targetProductId: item.targetProductId,
        sourceBatchId: batch.id,
        expectedQuantity: batch.rest,
        actualQuantity: item.actualQuantity,
        quantity: item.quantity,
        unitCost: batch.purchasePrice,
        comment: clean(item.comment),
      };
    });

    const document = await this.prisma.stockDocument.create({
      data: {
        type: dto.type,
        number: clean(dto.number),
        warehouseId,
        toWarehouseId: dto.toWarehouseId,
        supplierId: dto.supplierId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        comment: clean(dto.comment),
        createdById: actorId,
        items: { create: items },
      },
      include: documentInclude,
    });
    await this.auditService.log({
      actorId,
      action: 'stock.document.create',
      entityType: 'StockDocument',
      entityId: document.id,
      metadata: { type: document.type, items: document.items.length },
    });
    return document;
  }

  async postDocument(documentId: string, actorId: string) {
    const posted = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockDocument.updateMany({
        where: { id: documentId, status: StockDocumentStatus.DRAFT },
        data: { status: StockDocumentStatus.POSTED, postedById: actorId, postedAt: new Date() },
      });
      if (!claimed.count) {
        const exists = await tx.stockDocument.findUnique({ where: { id: documentId }, select: { id: true } });
        if (!exists) throw new NotFoundException('Складской документ не найден');
        throw new BadRequestException('Провести можно только черновик');
      }
      const document = await tx.stockDocument.findUniqueOrThrow({ where: { id: documentId }, include: { items: true } });
      const scope = await this.getWarehouseScope(actorId, tx);
      if (document.warehouseId) this.ensureWarehouseAllowed(document.warehouseId, scope);
      if (document.toWarehouseId) this.ensureWarehouseAllowed(document.toWarehouseId, scope);

      for (const item of document.items) {
        await this.postItem(tx, document, item);
      }
      return tx.stockDocument.findUniqueOrThrow({ where: { id: documentId }, include: documentInclude });
    });

    await this.auditService.log({
      actorId,
      action: 'stock.document.post',
      entityType: 'StockDocument',
      entityId: documentId,
      metadata: { type: posted.type, items: posted.items.length },
    });
    return posted;
  }

  async cancelDocument(documentId: string, actorId: string) {
    const document = await this.prisma.stockDocument.findUnique({
      where: { id: documentId },
      select: { id: true, warehouseId: true, toWarehouseId: true },
    });
    if (!document) throw new NotFoundException('Складской документ не найден');
    await this.ensureDocumentAllowed(document, actorId);
    const result = await this.prisma.stockDocument.updateMany({
      where: { id: documentId, status: StockDocumentStatus.DRAFT },
      data: { status: StockDocumentStatus.CANCELLED },
    });
    if (!result.count) {
      throw new BadRequestException('Проведённый документ нельзя отменить; создайте корректировку');
    }
    await this.auditService.log({
      actorId,
      action: 'stock.document.cancel',
      entityType: 'StockDocument',
      entityId: documentId,
    });
    return this.getDocument(documentId, actorId);
  }

  async listMovements(query: ListStockQueryDto, actorId: string) {
    const scope = await this.getWarehouseScope(actorId);
    const { limit, offset } = parsePagination(query);
    if (query.warehouseId) this.ensureWarehouseAllowed(query.warehouseId, scope);
    const warehouseIds = query.warehouseId ? [query.warehouseId] : scope;
    const search = query.search?.trim();
    const where: Prisma.StockMovementWhereInput = {
      AND: [
        ...(warehouseIds ? [{ OR: [{ warehouseId: { in: warehouseIds } }, { toWarehouseId: { in: warehouseIds } }] }] : []),
        ...(search ? [{ OR: [
          { product: { title: { contains: search, mode: 'insensitive' as const } } },
          { comment: { contains: search, mode: 'insensitive' as const } },
        ] }] : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, title: true, stockUnit: true } },
          warehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          stockBatch: { select: { id: true, series: true, purchasePrice: true } },
          targetStockBatch: { select: { id: true, series: true } },
          stockDocument: { select: { id: true, number: true, type: true } },
        },
        skip: offset,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async listSupplierBalances() {
    const suppliers = await this.prisma.supplier.findMany({
      orderBy: { title: 'asc' },
      include: {
        supplyInvoices: { select: { id: true, number: true, suppliedAt: true, totalAmount: true } },
        payments: { select: { id: true, amount: true, paidAt: true, supplyInvoiceId: true, comment: true } },
        stockDocuments: {
          where: { type: StockDocumentType.SUPPLIER_RETURN, status: StockDocumentStatus.POSTED },
          select: { id: true, occurredAt: true, items: { select: { quantity: true, unitCost: true } } },
        },
      },
    });
    return suppliers.map((supplier) => {
      const suppliedAmount = sum(supplier.supplyInvoices.flatMap((item) => [item.totalAmount]));
      const paidAmount = sum(supplier.payments.flatMap((item) => [item.amount]));
      const returnedAmount = supplier.stockDocuments.reduce(
        (total, document) => total.plus(sum(document.items.map((item) => decimal(item.quantity ?? 0).times(item.unitCost ?? 0)))),
        decimal(0),
      );
      return {
        id: supplier.id,
        title: supplier.title,
        suppliedAmount,
        returnedAmount,
        paidAmount,
        balance: suppliedAmount.minus(returnedAmount).minus(paidAmount),
        invoices: supplier.supplyInvoices,
        payments: supplier.payments,
      };
    });
  }

  async createSupplierPayment(dto: CreateSupplierPaymentDto, actorId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } });
    if (!supplier) throw new NotFoundException('Поставщик не найден');
    if (dto.supplyInvoiceId) {
      const invoice = await this.prisma.supplyInvoice.findUnique({ where: { id: dto.supplyInvoiceId }, select: { supplierId: true } });
      if (!invoice || invoice.supplierId !== dto.supplierId) throw new BadRequestException('Накладная не относится к выбранному поставщику');
    }
    const payment = await this.prisma.supplierPayment.create({
      data: {
        supplierId: dto.supplierId,
        supplyInvoiceId: dto.supplyInvoiceId,
        amount: dto.amount,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        comment: clean(dto.comment),
        createdById: actorId,
      },
    });
    await this.auditService.log({
      actorId,
      action: 'stock.supplier_payment.create',
      entityType: 'SupplierPayment',
      entityId: payment.id,
      metadata: { supplierId: dto.supplierId, amount: dto.amount },
    });
    return payment;
  }

  private async postItem(
    tx: Prisma.TransactionClient,
    document: { id: string; type: StockDocumentType; warehouseId: string | null; toWarehouseId: string | null },
    item: {
      id: string;
      productId: string;
      targetProductId: string | null;
      sourceBatchId: string | null;
      expectedQuantity: Prisma.Decimal | null;
      actualQuantity: Prisma.Decimal | null;
      quantity: Prisma.Decimal | null;
      unitCost: Prisma.Decimal | null;
    },
  ) {
    if (!item.sourceBatchId) throw new BadRequestException('В позиции не указана партия');
    const batch = await tx.stockBatch.findUnique({ where: { id: item.sourceBatchId } });
    if (!batch) throw new BadRequestException('Исходная партия не найдена');
    const currentRest = decimal(batch.rest);
    const expected = decimal(item.expectedQuantity ?? currentRest);
    if (!currentRest.equals(expected)) {
      throw new BadRequestException('Остаток партии изменился после создания документа. Создайте новый документ');
    }

    if (document.type === StockDocumentType.INVENTORY || document.type === StockDocumentType.CORRECTION) {
      const actual = decimal(item.actualQuantity ?? 0);
      const difference = actual.minus(currentRest);
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: {
          rest: actual,
          ...(difference.greaterThan(0) ? { quantity: { increment: difference } } : {}),
        },
      });
      await this.createMovement(tx, document, item, batch, difference, document.type === StockDocumentType.INVENTORY ? StockMovementType.INVENTORY : StockMovementType.CORRECTION);
      return;
    }

    const quantity = decimal(item.quantity ?? 0);
    if (quantity.lessThanOrEqualTo(0) || currentRest.lessThan(quantity)) {
      throw new BadRequestException('Недостаточный остаток в партии');
    }
    await tx.stockBatch.update({ where: { id: batch.id }, data: { rest: { decrement: quantity } } });

    if (document.type === StockDocumentType.TRANSFER || document.type === StockDocumentType.RESORTING) {
      const targetProductId = document.type === StockDocumentType.RESORTING ? item.targetProductId : item.productId;
      const targetWarehouseId = document.type === StockDocumentType.TRANSFER ? document.toWarehouseId : document.warehouseId;
      if (!targetProductId || !targetWarehouseId) throw new BadRequestException('Не заполнено назначение операции');
      const targetBatch = await tx.stockBatch.create({
        data: {
          productId: targetProductId,
          warehouseId: targetWarehouseId,
          supplierId: batch.supplierId,
          quantity,
          rest: quantity,
          purchasePrice: item.unitCost ?? batch.purchasePrice,
          expiresAt: batch.expiresAt,
          series: batch.series,
        },
      });
      await tx.stockDocumentItem.update({ where: { id: item.id }, data: { targetBatchId: targetBatch.id } });
      await this.createMovement(
        tx,
        document,
        item,
        batch,
        quantity.negated(),
        document.type === StockDocumentType.TRANSFER ? StockMovementType.TRANSFER : StockMovementType.RESORTING,
        targetBatch.id,
      );
      return;
    }

    const movementType = document.type === StockDocumentType.SUPPLIER_RETURN
      ? StockMovementType.SUPPLIER_RETURN
      : StockMovementType.WRITE_OFF;
    await this.createMovement(tx, document, item, batch, quantity.negated(), movementType);
  }

  private createMovement(
    tx: Prisma.TransactionClient,
    document: { id: string; type: StockDocumentType; warehouseId: string | null; toWarehouseId: string | null },
    item: { id: string; productId: string; unitCost: Prisma.Decimal | null },
    batch: { id: string; purchasePrice: Prisma.Decimal },
    quantity: Prisma.Decimal,
    type: StockMovementType,
    targetStockBatchId?: string,
  ) {
    return tx.stockMovement.create({
      data: {
        productId: item.productId,
        stockBatchId: batch.id,
        targetStockBatchId,
        warehouseId: document.warehouseId,
        toWarehouseId: document.toWarehouseId,
        type,
        quantity,
        unitCost: item.unitCost ?? batch.purchasePrice,
        stockDocumentId: document.id,
        stockDocumentItemId: item.id,
        comment: stockDocumentTypeTitle(document.type),
      },
    });
  }

  private async ensureDocumentAllowed(document: { warehouseId: string | null; toWarehouseId: string | null }, actorId: string) {
    const scope = await this.getWarehouseScope(actorId);
    if (document.warehouseId) this.ensureWarehouseAllowed(document.warehouseId, scope);
    if (document.toWarehouseId) this.ensureWarehouseAllowed(document.toWarehouseId, scope);
  }

  private async getWarehouseScope(employeeId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<WarehouseScope> {
    const accesses = await tx.employeeWarehouseAccess.findMany({ where: { employeeId }, select: { warehouseId: true } });
    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }

  private ensureWarehouseAllowed(warehouseId: string, scope: WarehouseScope) {
    if (scope && !scope.includes(warehouseId)) throw new ForbiddenException('Нет доступа к выбранному складу');
  }

  private async ensureWarehouseExists(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });
    if (!warehouse) throw new NotFoundException('Склад не найден');
  }
}

function stockDocumentTypeTitle(type: StockDocumentType) {
  const titles: Record<StockDocumentType, string> = {
    INVENTORY: 'Инвентаризация',
    TRANSFER: 'Перемещение между складами',
    SUPPLIER_RETURN: 'Возврат поставщику',
    WRITE_OFF: 'Списание',
    RESORTING: 'Пересортица',
    CORRECTION: 'Корректировка остатка',
  };
  return titles[type];
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function ensureUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) throw new BadRequestException(message);
}

function decimal(value: Prisma.Decimal | number | string) {
  return new Prisma.Decimal(value);
}

function sum(values: Array<Prisma.Decimal | number | string>) {
  return values.reduce<Prisma.Decimal>((total, value) => total.plus(value), decimal(0));
}
