import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillSource, PaymentStatus, Prisma, StockMovementType } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateSaleDto, CreateSaleItemDto } from './dto/create-sale.dto';
import { ListSalesQueryDto } from './dto/list-sales-query.dto';

type WarehouseScope = string[] | null;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
    private readonly financeService: FinanceService,
  ) {}

  async listSales(query: ListSalesQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.SaleWhereInput = {
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.animalId ? { animalId: query.animalId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { owner: { fullName: { contains: search, mode: 'insensitive' } } },
              { owner: { phone: { contains: search, mode: 'insensitive' } } },
              { animal: { nickname: { contains: search, mode: 'insensitive' } } },
              { items: { some: { title: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: saleListInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: saleInclude,
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  async createSale(dto: CreateSaleDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const ownerId = await this.resolveOwnerId(dto.ownerId, dto.animalId);
    const lines = await Promise.all(dto.items.map((item) => this.resolveSaleItemLine(item)));
    const totalAmount = lines.reduce((sum, line) => sum.plus(line.totalAmount), decimal(0));
    const dueAt = await this.financeService.getDefaultBillDueAt();

    const sale = await this.prisma.$transaction(async (tx) => {
      const createdSale = await tx.sale.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          totalAmount,
        },
      });

      for (const line of lines) {
        await tx.saleItem.create({
          data: {
            saleId: createdSale.id,
            serviceId: line.serviceId,
            productId: line.productId,
            title: line.title,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            totalAmount: line.totalAmount,
          },
        });
      }

      await tx.bill.create({
        data: {
          ownerId,
          animalId: dto.animalId,
          saleId: createdSale.id,
          source: BillSource.SALE,
          status: PaymentStatus.UNPAID,
          totalAmount,
          dueAt,
          items: {
            create: lines.map((line) => ({
              serviceId: line.serviceId,
              productId: line.productId,
              title: line.title,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              totalAmount: line.totalAmount,
            })),
          },
        },
      });

      await this.writeOffSaleProducts(tx, createdSale.id, lines, warehouseScope);

      return tx.sale.findUniqueOrThrow({
        where: { id: createdSale.id },
        include: saleInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'sale.create',
      entityType: 'Sale',
      entityId: sale.id,
      metadata: { ownerId: sale.ownerId, animalId: sale.animalId, totalAmount: sale.totalAmount, items: sale.items.length },
    });

    return sale;
  }

  private async resolveOwnerId(ownerId?: string, animalId?: string) {
    if (ownerId) {
      await this.schedulingService.ensureOwnerExists(ownerId);
    }

    if (animalId) {
      return this.schedulingService.resolveAnimalOwner(animalId, ownerId);
    }

    return ownerId;
  }

  private async resolveSaleItemLine(dto: CreateSaleItemDto) {
    if (dto.serviceId && dto.productId) {
      throw new BadRequestException('Sale item can reference service or product, not both');
    }

    const service = dto.serviceId
      ? await this.prisma.service.findUnique({
          where: { id: dto.serviceId },
          select: { id: true, title: true, price: true },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    const product = dto.productId
      ? await this.prisma.product.findUnique({
          where: { id: dto.productId },
          select: { id: true, title: true, retailPrice: true },
        })
      : null;

    if (dto.productId && !product) {
      throw new NotFoundException('Product not found');
    }

    return calculateSaleItemLine({
      serviceId: service?.id,
      productId: product?.id,
      title: dto.title ?? service?.title ?? product?.title,
      quantity: dto.quantity ?? 1,
      unitPrice:
        dto.unitPrice ??
        (service ? decimalToNumber(service.price) : undefined) ??
        (product ? decimalToNumber(product.retailPrice) : 0),
      discount: dto.discount ?? 0,
    });
  }

  private async writeOffSaleProducts(
    tx: Prisma.TransactionClient,
    saleId: string,
    lines: SaleItemLine[],
    warehouseScope: WarehouseScope,
  ) {
    for (const line of lines) {
      if (!line.productId) {
        continue;
      }

      await this.writeOffSaleProduct(tx, saleId, line, warehouseScope);
    }
  }

  private async writeOffSaleProduct(
    tx: Prisma.TransactionClient,
    saleId: string,
    line: SaleItemLine,
    warehouseScope: WarehouseScope,
  ) {
    const productId = line.productId;
    if (!productId) {
      return;
    }

    const batches = await tx.stockBatch.findMany({
      where: {
        productId,
        rest: { gt: 0 },
        ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
      },
      select: {
        id: true,
        warehouseId: true,
        rest: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    const orderedBatches = batches.sort(compareStockBatches);
    const available = orderedBatches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0));

    if (available.lessThan(line.quantity)) {
      throw new BadRequestException(`Недостаточно остатка товара "${line.title}"`);
    }

    let remaining = line.quantity;

    for (const batch of orderedBatches) {
      if (remaining.lessThanOrEqualTo(0)) {
        break;
      }

      const batchRest = decimal(batch.rest);
      const quantity = batchRest.lessThan(remaining) ? batchRest : remaining;

      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { rest: { decrement: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          stockBatchId: batch.id,
          warehouseId: batch.warehouseId,
          saleId,
          type: StockMovementType.SALE,
          quantity: quantity.negated(),
          comment: `Продажа ${saleId.slice(0, 8)}`,
        },
      });

      remaining = remaining.minus(quantity);
    }
  }

  private async getWarehouseScope(employeeId: string): Promise<WarehouseScope> {
    const accesses = await this.prisma.employeeWarehouseAccess.findMany({
      where: { employeeId },
      select: { warehouseId: true },
    });

    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }
}

const saleListInclude = {
  owner: {
    select: { id: true, fullName: true, phone: true, extraPhone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true },
  },
  bill: {
    select: { id: true, status: true, totalAmount: true, paidAmount: true },
  },
  _count: {
    select: { items: true },
  },
} satisfies Prisma.SaleInclude;

const saleInclude = {
  owner: true,
  animal: true,
  bill: {
    select: { id: true, status: true, totalAmount: true, paidAmount: true },
  },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      service: {
        select: { id: true, title: true, price: true },
      },
      product: {
        select: { id: true, title: true, retailPrice: true },
      },
    },
  },
  stockMovements: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: { select: { id: true, title: true, stockUnit: true } },
      stockBatch: { select: { id: true, series: true, expiresAt: true } },
      warehouse: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SaleInclude;

function calculateSaleItemLine(input: {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
}) {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('Sale item title is required');
  }

  const quantity = decimal(input.quantity ?? 1);
  const unitPrice = decimal(input.unitPrice ?? 0);
  const discount = decimal(input.discount ?? 0);
  const totalAmount = maxDecimal(quantity.mul(unitPrice).minus(discount), decimal(0));

  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    unitPrice,
    discount,
    totalAmount,
  };
}

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function decimalToNumber(value: Prisma.Decimal.Value) {
  return decimal(value).toNumber();
}

function maxDecimal(left: Prisma.Decimal, right: Prisma.Decimal) {
  return left.lessThan(right) ? right : left;
}

type SaleItemLine = ReturnType<typeof calculateSaleItemLine>;

function compareStockBatches(
  left: { expiresAt: Date | null; createdAt: Date },
  right: { expiresAt: Date | null; createdAt: Date },
) {
  if (left.expiresAt && right.expiresAt && left.expiresAt.getTime() !== right.expiresAt.getTime()) {
    return left.expiresAt.getTime() - right.expiresAt.getTime();
  }

  if (left.expiresAt && !right.expiresAt) {
    return -1;
  }

  if (!left.expiresAt && right.expiresAt) {
    return 1;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}
