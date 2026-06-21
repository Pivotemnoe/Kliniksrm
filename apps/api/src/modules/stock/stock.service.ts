import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplyInvoiceDto } from './dto/create-supply-invoice.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpsertProductDto } from './dto/upsert-product.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';

type WarehouseScope = string[] | null;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources(actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const [warehouses, productCategories, serviceCategories, suppliers] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where: warehouseScope ? { id: { in: warehouseScope } } : undefined,
        orderBy: { name: 'asc' },
        include: { office: { select: { id: true, name: true } } },
      }),
      this.prisma.productCategory.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.serviceCategory.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.supplier.findMany({ orderBy: { title: 'asc' }, take: 200 }),
    ]);

    return { warehouses, productCategories, serviceCategories, suppliers };
  }

  async listProducts(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const batchWarehouseWhere = this.getBatchWarehouseWhere(query.warehouseId, warehouseScope);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.warehouseId ? { batches: { some: batchWarehouseWhere } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { gtin: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { category: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { title: 'asc' },
        include: getProductInclude(batchWarehouseWhere),
        skip: offset,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items: items.map(serializeProduct), total, limit, offset };
  }

  async listStockAlerts(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const batchWarehouseWhere = this.getBatchWarehouseWhere(query.warehouseId, warehouseScope);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      minStock: { not: null },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { gtin: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { category: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { title: 'asc' },
      include: getProductInclude(batchWarehouseWhere),
    });
    const alerts = products
      .map(serializeProduct)
      .filter((product) => product.minStock !== null && decimal(product.stockRest).lessThanOrEqualTo(product.minStock));

    return { items: alerts.slice(offset, offset + limit), total: alerts.length, limit, offset };
  }

  async createProduct(dto: UpsertProductDto, actorId: string) {
    const categoryId = await this.resolveProductCategoryId(dto);

    const product = await this.prisma.product.create({
      data: {
        categoryId,
        title: dto.title.trim(),
        sku: clean(dto.sku),
        gtin: clean(dto.gtin),
        barcode: clean(dto.barcode),
        vatRate: dto.vatRate,
        retailPrice: dto.retailPrice ?? 0,
        stockUnit: clean(dto.stockUnit),
        writeOffUnit: clean(dto.writeOffUnit),
        packageQuantity: dto.packageQuantity,
        minStock: dto.minStock,
        shelfLifeDays: dto.shelfLifeDays,
        description: clean(dto.description),
      },
      include: productInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'stock.product.create',
      entityType: 'Product',
      entityId: product.id,
      metadata: { title: product.title },
    });

    return serializeProduct(product);
  }

  async getProduct(productId: string, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const batchWarehouseWhere = this.getBatchWarehouseWhere(undefined, warehouseScope);
    const movementWarehouseWhere = this.getMovementWarehouseWhere(warehouseScope);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        ...getProductInclude(batchWarehouseWhere),
        stockMovements: {
          ...(movementWarehouseWhere ? { where: movementWarehouseWhere } : {}),
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: {
            warehouse: { select: { id: true, name: true } },
            toWarehouse: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return serializeProduct(product);
  }

  async updateProduct(productId: string, dto: UpdateProductDto, actorId: string) {
    await this.ensureProductExists(productId);
    const categoryId = await this.resolveProductCategoryId(dto);

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.sku !== undefined ? { sku: clean(dto.sku) } : {}),
        ...(dto.gtin !== undefined ? { gtin: clean(dto.gtin) } : {}),
        ...(dto.barcode !== undefined ? { barcode: clean(dto.barcode) } : {}),
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.retailPrice !== undefined ? { retailPrice: dto.retailPrice } : {}),
        ...(dto.stockUnit !== undefined ? { stockUnit: clean(dto.stockUnit) } : {}),
        ...(dto.writeOffUnit !== undefined ? { writeOffUnit: clean(dto.writeOffUnit) } : {}),
        ...(dto.packageQuantity !== undefined ? { packageQuantity: dto.packageQuantity } : {}),
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
        ...(dto.shelfLifeDays !== undefined ? { shelfLifeDays: dto.shelfLifeDays } : {}),
        ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
      },
      include: productInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'stock.product.update',
      entityType: 'Product',
      entityId: product.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return serializeProduct(product);
  }

  async listServices(query: ListStockQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.ServiceWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { category: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        orderBy: { title: 'asc' },
        include: serviceInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.service.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async createService(dto: UpsertServiceDto, actorId: string) {
    const categoryId = await this.resolveServiceCategoryId(dto);

    const service = await this.prisma.service.create({
      data: {
        categoryId,
        title: dto.title.trim(),
        price: dto.price ?? 0,
        priceType: dto.priceType ?? 'FIXED',
        vatRate: dto.vatRate,
        description: clean(dto.description),
      },
      include: serviceInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'stock.service.create',
      entityType: 'Service',
      entityId: service.id,
      metadata: { title: service.title },
    });

    return service;
  }

  async getService(serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, include: serviceInclude });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async updateService(serviceId: string, dto: UpdateServiceDto, actorId: string) {
    await this.ensureServiceExists(serviceId);
    const categoryId = await this.resolveServiceCategoryId(dto);

    const service = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.priceType !== undefined ? { priceType: dto.priceType } : {}),
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
      },
      include: serviceInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'stock.service.update',
      entityType: 'Service',
      entityId: service.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return service;
  }

  async listStockBatches(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.StockBatchWhereInput = {
      ...this.getBatchWarehouseWhere(query.warehouseId, warehouseScope),
      ...(search
        ? {
            OR: [
              { product: { title: { contains: search, mode: 'insensitive' } } },
              { supplier: { title: { contains: search, mode: 'insensitive' } } },
              { series: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: stockBatchInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.stockBatch.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listSupplyInvoices(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const itemWarehouseWhere = this.getSupplyInvoiceItemWarehouseWhere(query.warehouseId, warehouseScope);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.SupplyInvoiceWhereInput = {
      ...(itemWarehouseWhere ? { items: { some: itemWarehouseWhere } } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { supplier: { title: { contains: search, mode: 'insensitive' } } },
              { items: { some: { product: { title: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplyInvoice.findMany({
        where,
        orderBy: { suppliedAt: 'desc' },
        include: getSupplyInvoiceInclude(itemWarehouseWhere),
        skip: offset,
        take: limit,
      }),
      this.prisma.supplyInvoice.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async getSupplyInvoice(supplyInvoiceId: string, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const itemWarehouseWhere = this.getSupplyInvoiceItemWarehouseWhere(undefined, warehouseScope);
    const invoice = await this.prisma.supplyInvoice.findUnique({
      where: { id: supplyInvoiceId },
      include: getSupplyInvoiceInclude(itemWarehouseWhere),
    });

    if (!invoice || (itemWarehouseWhere && !invoice.items.length)) {
      throw new NotFoundException('Supply invoice not found');
    }

    return invoice;
  }

  async createSupplyInvoice(dto: CreateSupplyInvoiceDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const supplierId = await this.resolveSupplierId(dto);
    const defaultWarehouseId = await this.getDefaultWarehouseId(warehouseScope);
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const productsCount = await this.prisma.product.count({ where: { id: { in: productIds } } });

    if (productsCount !== productIds.length) {
      throw new BadRequestException('Supply invoice contains unknown product');
    }

    for (const item of dto.items) {
      if (item.warehouseId) {
        await this.ensureWarehouseExists(item.warehouseId);
        this.ensureWarehouseAllowed(item.warehouseId, warehouseScope);
      }
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.supplyInvoice.create({
        data: {
          supplierId,
          number: clean(dto.number),
          suppliedAt: dto.suppliedAt ? new Date(dto.suppliedAt) : undefined,
        },
      });

      let totalAmount = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const warehouseId = item.warehouseId ?? defaultWarehouseId;
        const quantity = decimal(item.quantity);
        const purchasePrice = decimal(item.purchasePrice);
        const discountAmount = decimal(item.discountAmount ?? 0);
        totalAmount = totalAmount.plus(quantity.mul(purchasePrice).minus(discountAmount));

        await tx.supplyInvoiceItem.create({
          data: {
            supplyInvoiceId: createdInvoice.id,
            productId: item.productId,
            warehouseId,
            quantity,
            purchasePrice,
            discountAmount,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            series: clean(item.series),
          },
        });

        const batch = await tx.stockBatch.create({
          data: {
            productId: item.productId,
            warehouseId,
            supplierId,
            quantity,
            rest: quantity,
            purchasePrice,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            series: clean(item.series),
            rack: clean(item.rack),
            rackNumber: clean(item.rackNumber),
            shelfNumber: clean(item.shelfNumber),
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: batch.id,
            warehouseId,
            type: StockMovementType.SUPPLY,
            quantity,
            comment: createdInvoice.number ? `Приёмка по накладной ${createdInvoice.number}` : 'Приёмка на склад',
          },
        });
      }

      await tx.supplyInvoice.update({
        where: { id: createdInvoice.id },
        data: { totalAmount },
      });

      return tx.supplyInvoice.findUniqueOrThrow({
        where: { id: createdInvoice.id },
        include: supplyInvoiceInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'stock.supply_invoice.create',
      entityType: 'SupplyInvoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, supplierId, totalAmount: invoice.totalAmount, items: invoice.items.length },
    });

    return invoice;
  }

  private async resolveProductCategoryId(dto: { categoryId?: string; categoryTitle?: string }) {
    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
      if (!category) {
        throw new NotFoundException('Product category not found');
      }

      return category.id;
    }

    const title = dto.categoryTitle?.trim();
    if (!title) {
      return undefined;
    }

    const category = await this.prisma.productCategory.upsert({
      where: { title },
      update: {},
      create: { title },
      select: { id: true },
    });

    return category.id;
  }

  private async resolveServiceCategoryId(dto: { categoryId?: string; categoryTitle?: string }) {
    if (dto.categoryId) {
      const category = await this.prisma.serviceCategory.findUnique({ where: { id: dto.categoryId }, select: { id: true } });
      if (!category) {
        throw new NotFoundException('Service category not found');
      }

      return category.id;
    }

    const title = dto.categoryTitle?.trim();
    if (!title) {
      return undefined;
    }

    const category = await this.prisma.serviceCategory.upsert({
      where: { title },
      update: {},
      create: { title },
      select: { id: true },
    });

    return category.id;
  }

  private async resolveSupplierId(dto: { supplierId?: string; supplierTitle?: string }) {
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true } });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }

      return supplier.id;
    }

    const title = dto.supplierTitle?.trim();
    if (!title) {
      return undefined;
    }

    const existingSupplier = await this.prisma.supplier.findFirst({ where: { title }, select: { id: true } });
    return existingSupplier?.id ?? (await this.prisma.supplier.create({ data: { title }, select: { id: true } })).id;
  }

  private async getDefaultWarehouseId(warehouseScope: WarehouseScope) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: warehouseScope ? { id: { in: warehouseScope } } : undefined,
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!warehouse) {
      throw new BadRequestException('Warehouse is not configured');
    }

    return warehouse.id;
  }

  private async getWarehouseScope(employeeId: string): Promise<WarehouseScope> {
    const accesses = await this.prisma.employeeWarehouseAccess.findMany({
      where: { employeeId },
      select: { warehouseId: true },
    });

    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }

  private getBatchWarehouseWhere(warehouseId: string | undefined, warehouseScope: WarehouseScope): Prisma.StockBatchWhereInput {
    if (warehouseId) {
      this.ensureWarehouseAllowed(warehouseId, warehouseScope);
      return { warehouseId };
    }

    return warehouseScope ? { warehouseId: { in: warehouseScope } } : {};
  }

  private getSupplyInvoiceItemWarehouseWhere(
    warehouseId: string | undefined,
    warehouseScope: WarehouseScope,
  ): Prisma.SupplyInvoiceItemWhereInput | null {
    if (warehouseId) {
      this.ensureWarehouseAllowed(warehouseId, warehouseScope);
      return { warehouseId };
    }

    return warehouseScope ? { warehouseId: { in: warehouseScope } } : null;
  }

  private getMovementWarehouseWhere(warehouseScope: WarehouseScope): Prisma.StockMovementWhereInput | null {
    return warehouseScope
      ? {
          OR: [{ warehouseId: { in: warehouseScope } }, { toWarehouseId: { in: warehouseScope } }],
        }
      : null;
  }

  private ensureWarehouseAllowed(warehouseId: string, warehouseScope: WarehouseScope) {
    if (warehouseScope && !warehouseScope.includes(warehouseId)) {
      throw new BadRequestException('Нет доступа к выбранному складу');
    }
  }

  private async ensureWarehouseExists(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
  }

  private async ensureProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async ensureServiceExists(serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }
}

const productInclude = {
  category: true,
  batches: {
    include: {
      warehouse: { select: { id: true, name: true } },
      supplier: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ProductInclude;

function getProductInclude(batchWhere?: Prisma.StockBatchWhereInput) {
  const hasBatchWhere = Boolean(batchWhere && Object.keys(batchWhere).length);

  return {
    category: true,
    batches: {
      ...(hasBatchWhere ? { where: batchWhere } : {}),
      include: {
        warehouse: { select: { id: true, name: true } },
        supplier: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    },
  } satisfies Prisma.ProductInclude;
}

const serviceInclude = {
  category: true,
} satisfies Prisma.ServiceInclude;

const stockBatchInclude = {
  product: { include: { category: true } },
  warehouse: { select: { id: true, name: true } },
  supplier: { select: { id: true, title: true } },
} satisfies Prisma.StockBatchInclude;

const supplyInvoiceInclude = {
  supplier: true,
  items: {
    include: {
      product: { include: { category: true } },
      warehouse: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.SupplyInvoiceInclude;

function getSupplyInvoiceInclude(itemWhere?: Prisma.SupplyInvoiceItemWhereInput | null) {
  return {
    supplier: true,
    items: {
      ...(itemWhere ? { where: itemWhere } : {}),
      include: {
        product: { include: { category: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.SupplyInvoiceInclude;
}

function serializeProduct(product: Prisma.ProductGetPayload<{ include: typeof productInclude }>) {
  const stockRest = product.batches.reduce((sum, batch) => sum.plus(batch.rest), new Prisma.Decimal(0));

  return {
    ...product,
    stockRest,
  };
}

function decimal(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
