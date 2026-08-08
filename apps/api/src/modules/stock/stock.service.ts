import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { HospitalRecordStatus, Prisma, ProductBarcodeType, StockDocumentStatus, StockMovementType } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplyInvoiceDto } from './dto/create-supply-invoice.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateSupplyInvoiceDto, UpdateSupplyInvoiceItemDto } from './dto/update-supply-invoice.dto';
import { UpsertProductDto } from './dto/upsert-product.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';
import { UpsertSupplierDto } from './dto/upsert-supplier.dto';
import { unitsNeedConversion } from './stock-units';

type WarehouseScope = string[] | null;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getResources(actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const [warehouses, productCategories, serviceCategories, suppliers, cashboxes, paymentMethods, organization] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where: warehouseScope ? { id: { in: warehouseScope } } : undefined,
        orderBy: { name: 'asc' },
        include: { office: { select: { id: true, name: true } } },
      }),
      this.prisma.productCategory.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.serviceCategory.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.supplier.findMany({ orderBy: { title: 'asc' }, take: 200 }),
      this.prisma.cashbox.findMany({
        where: {
          isActive: true,
          ...(warehouseScope ? { OR: [{ officeId: null }, { office: { warehouses: { some: { id: { in: warehouseScope } } } } }] } : {}),
        },
        orderBy: { title: 'asc' },
        select: { id: true, officeId: true, title: true },
      }),
      this.prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], select: { id: true, title: true, type: true } }),
      this.prisma.organization.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { displayName: true, legalName: true, orgType: true, inn: true },
      }),
    ]);

    return { warehouses, productCategories, serviceCategories, suppliers, cashboxes, paymentMethods, organization };
  }

  async createSupplier(dto: UpsertSupplierDto, actorId: string) {
    await this.ensureSupplierTitleAvailable(dto.title);
    const supplier = await this.prisma.supplier.create({
      data: {
        title: dto.title.trim(),
        phone: clean(dto.phone),
        email: clean(dto.email)?.toLowerCase(),
        inn: clean(dto.inn),
        comment: clean(dto.comment),
      },
    });
    await this.auditService.log({
      actorId,
      action: 'stock.supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      metadata: { title: supplier.title },
    });
    return supplier;
  }

  async updateSupplier(supplierId: string, dto: UpsertSupplierDto, actorId: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Поставщик не найден');
    await this.ensureSupplierTitleAvailable(dto.title, supplierId);
    const supplier = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        title: dto.title.trim(),
        phone: clean(dto.phone) ?? null,
        email: clean(dto.email)?.toLowerCase() ?? null,
        inn: clean(dto.inn) ?? null,
        comment: clean(dto.comment) ?? null,
      },
    });
    await this.auditService.log({
      actorId,
      action: 'stock.supplier.update',
      entityType: 'Supplier',
      entityId: supplier.id,
      metadata: { title: supplier.title },
    });
    return supplier;
  }

  async listProducts(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const batchWarehouseWhere = this.getBatchWarehouseWhere(query.warehouseId, warehouseScope);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const stockState = query.stockState ?? 'all';
    const sortBy = query.sortBy ?? 'title';
    const sortOrder = query.sortOrder ?? 'asc';
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.productId ? { id: query.productId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.warehouseId ? { batches: { some: batchWarehouseWhere } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { gtin: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { barcodes: { some: { value: { contains: search, mode: 'insensitive' } } } },
              { category: { title: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    if (stockState !== 'all' || sortBy !== 'title') {
      const summaries = await this.prisma.product.findMany({
        where,
        select: { id: true, title: true, category: { select: { title: true } } },
      });
      const stockRestByProduct = new Map<string, Prisma.Decimal>();

      if (summaries.length && (stockState !== 'all' || sortBy === 'stockRest')) {
        const stockTotals = await this.prisma.stockBatch.groupBy({
          by: ['productId'],
          where: { ...batchWarehouseWhere, productId: { in: summaries.map((item) => item.id) } },
          _sum: { rest: true },
        });
        for (const total of stockTotals) {
          stockRestByProduct.set(total.productId, total._sum.rest ?? new Prisma.Decimal(0));
        }
      }

      const ordered = summaries
        .map((item) => ({
          id: item.id,
          title: item.title,
          categoryTitle: item.category?.title ?? '',
          stockRest: stockRestByProduct.get(item.id) ?? new Prisma.Decimal(0),
        }))
        .filter((item) => stockState === 'all'
          || (stockState === 'zero' ? item.stockRest.equals(0) : item.stockRest.greaterThan(0)))
        .sort((left, right) => compareProductListItems(left, right, sortBy, sortOrder));
      const pageIds = ordered.slice(offset, offset + limit).map((item) => item.id);
      const products = pageIds.length
        ? await this.prisma.product.findMany({
            where: { id: { in: pageIds } },
            include: getProductInclude(batchWarehouseWhere),
          })
        : [];
      const productsById = new Map(products.map((item) => [item.id, serializeProduct(item)]));

      return {
        items: pageIds.flatMap((id) => {
          const product = productsById.get(id);
          return product ? [product] : [];
        }),
        total: ordered.length,
        limit,
        offset,
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { title: sortOrder },
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
      isActive: true,
      minStock: { not: null },
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { gtin: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              { barcodes: { some: { value: { contains: search, mode: 'insensitive' } } } },
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

  async getCatalogQuality() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        categoryId: true,
        retailPrice: true,
        stockUnit: true,
        writeOffUnit: true,
        billingUnit: true,
        barcode: true,
        barcodes: { select: { value: true } },
      },
    });

    const barcodeOwners = new Map<string, Set<string>>();
    for (const product of products) {
      for (const value of readNumericBarcodes(product)) {
        const owners = barcodeOwners.get(value) ?? new Set<string>();
        owners.add(product.id);
        barcodeOwners.set(value, owners);
      }
    }
    const duplicateBarcodeValues = [...barcodeOwners.entries()].filter(([, owners]) => owners.size > 1).map(([value]) => value);
    const duplicateSet = new Set(duplicateBarcodeValues);
    const issues = products.map((product) => {
      const productIssues = [
        !product.categoryId ? 'Нет категории' : null,
        product.retailPrice.lessThanOrEqualTo(0) ? 'Цена равна нулю' : null,
        !product.stockUnit || !product.writeOffUnit || !product.billingUnit ? 'Не заполнены единицы учёта' : null,
        product.barcode && /[;,\r\n]/.test(product.barcode) ? 'Старый составной штрих-код' : null,
        [...readNumericBarcodes(product)].some((value) => duplicateSet.has(value)) ? 'Штрих-код повторяется у разных товаров' : null,
      ].filter((value): value is string => Boolean(value));
      return { id: product.id, title: product.title, issues: productIssues };
    }).filter((product) => product.issues.length);

    const cleanProducts = products.length - issues.length;
    return {
      total: products.length,
      cleanProducts,
      qualityPercent: products.length ? Math.round(cleanProducts / products.length * 100) : 100,
      counts: {
        withoutCategory: products.filter((product) => !product.categoryId).length,
        zeroPrice: products.filter((product) => product.retailPrice.lessThanOrEqualTo(0)).length,
        missingUnits: products.filter((product) => !product.stockUnit || !product.writeOffUnit || !product.billingUnit).length,
        legacyCompositeBarcode: products.filter((product) => Boolean(product.barcode && /[;,\r\n]/.test(product.barcode))).length,
        duplicateBarcodeValues: duplicateBarcodeValues.length,
      },
      sample: issues.slice(0, 20),
    };
  }

  async createProduct(dto: UpsertProductDto, actorId: string) {
    const categoryId = await this.resolveProductCategoryId(dto);
    this.ensureUnitConfiguration(dto.stockUnit, dto.writeOffUnit, dto.packageQuantity);
    let barcode = await this.resolveBarcode(dto.barcode, dto.generateBarcode);
    const barcodes = normalizeBarcodes([...(barcode ? [barcode] : []), ...(dto.barcodes ?? [])]);
    if (!barcode && barcodes.length) barcode = barcodes[0];
    await this.ensureBarcodesAvailable(barcodes);

    const product = await this.prisma.product.create({
      data: {
        categoryId,
        title: dto.title.trim(),
        sku: clean(dto.sku),
        gtin: clean(dto.gtin),
        barcode,
        vatRate: dto.vatRate,
        retailPrice: dto.retailPrice ?? 0,
        stockUnit: clean(dto.stockUnit),
        writeOffUnit: clean(dto.writeOffUnit),
        billingUnit: clean(dto.billingUnit) ?? clean(dto.writeOffUnit) ?? clean(dto.stockUnit),
        packageQuantity: dto.packageQuantity,
        minStock: dto.minStock,
        shelfLifeDays: dto.shelfLifeDays,
        defaultExpiresAt: dto.defaultExpiresAt ? new Date(dto.defaultExpiresAt) : undefined,
        description: clean(dto.description),
        barcodes: barcodes.length
          ? { create: barcodes.map((value) => barcodeCreate(value, value === barcode, dto.gtin)) }
          : undefined,
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
    const existing = await this.ensureProductExists(productId);
    const categoryId = await this.resolveProductCategoryId(dto);
    const stockUnit = dto.stockUnit !== undefined ? clean(dto.stockUnit) : existing.stockUnit ?? undefined;
    const writeOffUnit = dto.writeOffUnit !== undefined ? clean(dto.writeOffUnit) : existing.writeOffUnit ?? undefined;
    const packageQuantity = dto.packageQuantity !== undefined ? dto.packageQuantity : decimalToOptionalNumber(existing.packageQuantity);
    this.ensureUnitConfiguration(stockUnit, writeOffUnit, packageQuantity);
    let barcode = await this.resolveBarcode(dto.barcode, dto.generateBarcode, existing.barcode ?? undefined, dto.barcode !== undefined, productId);
    const shouldSyncBarcodes = dto.barcodes !== undefined || dto.barcode !== undefined || Boolean(dto.generateBarcode);
    const barcodes = shouldSyncBarcodes
      ? normalizeBarcodes([
          ...(barcode ? [barcode] : []),
          ...(dto.barcodes ?? existing.barcodes.map((item) => item.value).filter((value) => value !== existing.barcode)),
        ])
      : undefined;
    if (!barcode && barcodes?.length) barcode = barcodes[0];
    if (barcodes) await this.ensureBarcodesAvailable(barcodes, productId);

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(dto.sku !== undefined ? { sku: clean(dto.sku) } : {}),
        ...(dto.gtin !== undefined ? { gtin: clean(dto.gtin) } : {}),
        ...(dto.barcode !== undefined || dto.generateBarcode ? { barcode } : {}),
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.retailPrice !== undefined ? { retailPrice: dto.retailPrice } : {}),
        ...(dto.stockUnit !== undefined ? { stockUnit: clean(dto.stockUnit) } : {}),
        ...(dto.writeOffUnit !== undefined ? { writeOffUnit: clean(dto.writeOffUnit) } : {}),
        ...(dto.billingUnit !== undefined ? { billingUnit: clean(dto.billingUnit) } : {}),
        ...(dto.packageQuantity !== undefined ? { packageQuantity: dto.packageQuantity } : {}),
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
        ...(dto.shelfLifeDays !== undefined ? { shelfLifeDays: dto.shelfLifeDays } : {}),
        ...(dto.defaultExpiresAt !== undefined ? { defaultExpiresAt: dto.defaultExpiresAt ? new Date(dto.defaultExpiresAt) : null } : {}),
        ...(dto.description !== undefined ? { description: clean(dto.description) } : {}),
        ...(barcodes
          ? {
              barcodes: {
                deleteMany: {},
                create: barcodes.map((value) => barcodeCreate(value, value === barcode, dto.gtin)),
              },
            }
          : {}),
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

  async deleteProduct(productId: string, actorId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true, title: true },
    });
    if (!product) {
      throw new NotFoundException('Товар не найден или уже удалён');
    }

    const [stock, draftDocumentItems, plannedHospitalRecords] = await this.prisma.$transaction([
      this.prisma.stockBatch.aggregate({ where: { productId }, _sum: { rest: true } }),
      this.prisma.stockDocumentItem.count({
        where: {
          document: { status: StockDocumentStatus.DRAFT },
          OR: [{ productId }, { targetProductId: productId }],
        },
      }),
      this.prisma.hospitalRecord.count({
        where: { plannedProductId: productId, recordStatus: HospitalRecordStatus.PLANNED },
      }),
    ]);

    const stockRest = stock._sum.rest ?? new Prisma.Decimal(0);
    if (!stockRest.equals(0)) {
      throw new BadRequestException(`Нельзя удалить товар, пока остаток не равен нулю. Текущий остаток: ${stockRest.toString()}`);
    }
    if (draftDocumentItems > 0) {
      throw new BadRequestException('Нельзя удалить товар: он используется в черновике складского документа');
    }
    if (plannedHospitalRecords > 0) {
      throw new BadRequestException('Нельзя удалить товар: он указан в невыполненном назначении стационара');
    }

    await this.prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await this.auditService.log({
      actorId,
      action: 'stock.product.archive',
      entityType: 'Product',
      entityId: product.id,
      metadata: { title: product.title, historyPreserved: true },
    });

    return { id: product.id, title: product.title, deleted: true };
  }

  async listServices(query: ListStockQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.ServiceWhereInput = {
      isActive: true,
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
    const pricing = resolveServiceCatalogPricing(dto);

    const service = await this.prisma.service.create({
      data: {
        categoryId,
        title: dto.title.trim(),
        ...pricing,
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
    const existing = await this.prisma.service.findFirst({
      where: { id: serviceId, isActive: true },
      select: { id: true, price: true, priceType: true, minimumPrice: true, maximumPrice: true },
    });
    if (!existing) {
      throw new NotFoundException('Услуга не найдена');
    }
    const categoryId = await this.resolveServiceCategoryId(dto);
    const pricing = resolveServiceCatalogPricing(dto, existing);

    const service = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...pricing,
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

  async deleteService(serviceId: string, actorId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, isActive: true },
      select: { id: true, title: true },
    });
    if (!service) {
      throw new NotFoundException('Услуга не найдена или уже удалена');
    }

    const plannedHospitalRecords = await this.prisma.hospitalRecord.count({
      where: { plannedServiceId: serviceId, recordStatus: HospitalRecordStatus.PLANNED },
    });
    if (plannedHospitalRecords > 0) {
      throw new BadRequestException('Нельзя удалить услугу: она указана в невыполненном назначении стационара');
    }

    await this.prisma.service.update({ where: { id: serviceId }, data: { isActive: false } });
    await this.auditService.log({
      actorId,
      action: 'stock.service.archive',
      entityType: 'Service',
      entityId: service.id,
      metadata: { title: service.title, historyPreserved: true },
    });

    return { id: service.id, title: service.title, deleted: true };
  }

  async listStockBatches(query: ListStockQueryDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.StockBatchWhereInput = {
      ...this.getBatchWarehouseWhere(query.warehouseId, warehouseScope),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(search
        ? {
            OR: [
              { product: { title: { contains: search, mode: 'insensitive' } } },
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              { product: { gtin: { contains: search, mode: 'insensitive' } } },
              { product: { barcode: { contains: search, mode: 'insensitive' } } },
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
    ensureConsistentRetailPrices(dto.items);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, stockUnit: true, writeOffUnit: true, billingUnit: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Supply invoice contains unknown product');
    }
    const effectiveStockUnits = prepareSupplyProductUnits(dto.items, products);

    for (const item of dto.items) {
      if (item.warehouseId) {
        await this.ensureWarehouseExists(item.warehouseId);
        this.ensureWarehouseAllowed(item.warehouseId, warehouseScope);
      }
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      await initializeMissingProductUnits(tx, products, effectiveStockUnits);
      const createdInvoice = await tx.supplyInvoice.create({
        data: {
          supplierId,
          number: clean(dto.number),
          suppliedAt: dto.suppliedAt ? new Date(dto.suppliedAt) : undefined,
        },
      });

      let totalAmount = new Prisma.Decimal(0);

      for (const item of dto.items) {
        const prepared = prepareSupplyLine(item, effectiveStockUnits.get(item.productId)!);
        const warehouseId = item.warehouseId ?? defaultWarehouseId;
        const purchasePrice = decimal(item.purchasePrice);
        const discountAmount = decimal(item.discountAmount ?? 0);
        totalAmount = totalAmount.plus(prepared.receiptQuantity.mul(purchasePrice).minus(discountAmount));

        if (item.retailPrice !== undefined) {
          await tx.product.update({
            where: { id: item.productId },
            data: { retailPrice: item.retailPrice },
          });
        }

        const invoiceItem = await tx.supplyInvoiceItem.create({
          data: {
            supplyInvoiceId: createdInvoice.id,
            productId: item.productId,
            warehouseId,
            quantity: prepared.stockQuantity,
            receiptQuantity: prepared.receiptQuantity,
            receiptUnit: prepared.receiptUnit,
            conversionFactor: prepared.conversionFactor,
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
            quantity: prepared.stockQuantity,
            rest: prepared.stockQuantity,
            purchasePrice: prepared.stockUnitCost,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
            series: clean(item.series),
            rack: clean(item.rack),
            rackNumber: clean(item.rackNumber),
            shelfNumber: clean(item.shelfNumber),
          },
        });

        await tx.supplyInvoiceItem.update({
          where: { id: invoiceItem.id },
          data: { stockBatchId: batch.id },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: batch.id,
            warehouseId,
            type: StockMovementType.SUPPLY,
            quantity: prepared.stockQuantity,
            unitCost: prepared.stockUnitCost,
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
      metadata: {
        number: invoice.number,
        supplierId,
        totalAmount: invoice.totalAmount,
        items: invoice.items.length,
        retailPricesUpdated: dto.items.filter((item) => item.retailPrice !== undefined).length,
      },
    });

    return invoice;
  }

  async updateSupplyInvoice(supplyInvoiceId: string, dto: UpdateSupplyInvoiceDto, actorId: string) {
    const warehouseScope = await this.getWarehouseScope(actorId);
    const invoice = await this.prisma.supplyInvoice.findUnique({
      where: { id: supplyInvoiceId },
      include: supplyInvoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Накладная не найдена');

    const existingIds = invoice.items.map((item) => item.id);
    const suppliedIds = dto.items.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (new Set(suppliedIds).size !== suppliedIds.length) {
      throw new BadRequestException('Одна позиция накладной указана несколько раз');
    }
    const missingIds = existingIds.filter((id) => !suppliedIds.includes(id));
    const unknownIds = suppliedIds.filter((id) => !existingIds.includes(id));
    if (missingIds.length || unknownIds.length) {
      throw new BadRequestException('Проведённые позиции нельзя удалять. Исправьте их количество или создайте возврат поставщику');
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    ensureConsistentRetailPrices(dto.items);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, stockUnit: true, writeOffUnit: true, billingUnit: true },
    });
    if (products.length !== productIds.length) throw new BadRequestException('В накладной указан неизвестный товар');
    const effectiveStockUnits = prepareSupplyProductUnits(dto.items, products);
    for (const item of dto.items) {
      await this.ensureWarehouseExists(item.warehouseId);
      this.ensureWarehouseAllowed(item.warehouseId, warehouseScope);
    }
    if (dto.supplierId) {
      await this.resolveSupplierId({ supplierId: dto.supplierId });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await initializeMissingProductUnits(tx, products, effectiveStockUnits);
      const existingById = new Map(invoice.items.map((item) => [item.id, item]));

      for (const nextItem of dto.items) {
        const prepared = prepareSupplyLine(nextItem, effectiveStockUnits.get(nextItem.productId)!);
        if (nextItem.retailPrice !== undefined) {
          await tx.product.update({
            where: { id: nextItem.productId },
            data: { retailPrice: nextItem.retailPrice },
          });
        }

        if (!nextItem.id) {
          await this.createSupplyInvoiceLine(tx, invoice.id, dto.supplierId ?? invoice.supplierId, invoice.number, nextItem, prepared);
          continue;
        }

        const currentItem = existingById.get(nextItem.id)!;
        const stockChanged = supplyLineChanged(currentItem, nextItem, prepared);
        const supplierChanged = dto.supplierId !== undefined && dto.supplierId !== invoice.supplierId;
        let batch = currentItem.stockBatch;

        if ((stockChanged || supplierChanged) && !batch) {
          batch = await this.findLegacySupplyBatch(tx, invoice, currentItem);
          if (!batch) {
            throw new BadRequestException(
              `Позиция «${currentItem.product.title}» создана старой версией и не может быть исправлена автоматически. Создайте складской документ «Корректировка»`,
            );
          }
        }

        if (batch && (stockChanged || supplierChanged)) {
          const oldQuantity = decimal(batch.quantity);
          const currentRest = decimal(batch.rest);
          const consumed = oldQuantity.minus(currentRest).greaterThan(0) ? oldQuantity.minus(currentRest) : decimal(0);
          const nextQuantity = prepared.stockQuantity;
          if (nextQuantity.lessThan(consumed)) {
            throw new BadRequestException(
              `Количество «${currentItem.product.title}» нельзя уменьшить ниже уже использованного: ${consumed.toString()}`,
            );
          }
          const identityChanged = nextItem.productId !== batch.productId || nextItem.warehouseId !== batch.warehouseId;
          if (identityChanged && consumed.greaterThan(0)) {
            throw new BadRequestException(
              `Товар или склад позиции «${currentItem.product.title}» нельзя менять после списания. Добавьте новую позицию и оформите корректировку`,
            );
          }

          const difference = nextQuantity.minus(oldQuantity);
          const nextRest = currentRest.plus(difference);
          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              productId: nextItem.productId,
              warehouseId: nextItem.warehouseId,
              supplierId: dto.supplierId !== undefined ? dto.supplierId : invoice.supplierId,
              quantity: nextQuantity,
              rest: nextRest,
              purchasePrice: prepared.stockUnitCost,
              expiresAt: nextItem.expiresAt ? new Date(nextItem.expiresAt) : null,
              series: clean(nextItem.series) ?? null,
              rack: clean(nextItem.rack) ?? null,
              rackNumber: clean(nextItem.rackNumber) ?? null,
              shelfNumber: clean(nextItem.shelfNumber) ?? null,
            },
          });
          await tx.supplyInvoiceItem.update({
            where: { id: currentItem.id },
            data: {
              stockBatchId: batch.id,
              productId: nextItem.productId,
              warehouseId: nextItem.warehouseId,
              quantity: nextQuantity,
              receiptQuantity: prepared.receiptQuantity,
              receiptUnit: prepared.receiptUnit,
              conversionFactor: prepared.conversionFactor,
              purchasePrice: nextItem.purchasePrice,
              discountAmount: nextItem.discountAmount ?? 0,
              expiresAt: nextItem.expiresAt ? new Date(nextItem.expiresAt) : null,
              series: clean(nextItem.series) ?? null,
            },
          });
          await tx.stockMovement.updateMany({
            where: { stockBatchId: batch.id, type: StockMovementType.SUPPLY },
            data: {
              productId: nextItem.productId,
              warehouseId: nextItem.warehouseId,
              unitCost: prepared.stockUnitCost,
            },
          });
          if (!difference.equals(0)) {
            await tx.stockMovement.create({
              data: {
                productId: nextItem.productId,
                stockBatchId: batch.id,
                warehouseId: nextItem.warehouseId,
                type: StockMovementType.CORRECTION,
                quantity: difference,
                unitCost: prepared.stockUnitCost,
                comment: invoice.number
                  ? `Исправление накладной ${invoice.number}`
                  : `Исправление накладной ${invoice.id.slice(0, 8)}`,
              },
            });
          }
        } else {
          await tx.supplyInvoiceItem.update({
            where: { id: currentItem.id },
            data: {
              discountAmount: nextItem.discountAmount ?? 0,
              expiresAt: nextItem.expiresAt ? new Date(nextItem.expiresAt) : null,
              series: clean(nextItem.series) ?? null,
            },
          });
        }
      }

      const totalAmount = dto.items.reduce(
        (total, item) => total.plus(decimal(item.quantity).times(item.purchasePrice).minus(item.discountAmount ?? 0)),
        decimal(0),
      );
      return tx.supplyInvoice.update({
        where: { id: invoice.id },
        data: {
          ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
          ...(dto.number !== undefined ? { number: clean(dto.number) ?? null } : {}),
          ...(dto.suppliedAt !== undefined ? { suppliedAt: new Date(dto.suppliedAt) } : {}),
          totalAmount,
        },
        include: supplyInvoiceInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'stock.supply_invoice.update',
      entityType: 'SupplyInvoice',
      entityId: invoice.id,
      metadata: {
        previousTotalAmount: invoice.totalAmount,
        totalAmount: updated.totalAmount,
        previousItems: invoice.items.length,
        items: updated.items.length,
        retailPricesUpdated: dto.items.filter((item) => item.retailPrice !== undefined).length,
      },
    });
    return updated;
  }

  private async createSupplyInvoiceLine(
    tx: Prisma.TransactionClient,
    supplyInvoiceId: string,
    supplierId: string | null | undefined,
    invoiceNumber: string | null,
    item: UpdateSupplyInvoiceItemDto,
    prepared: PreparedSupplyLine,
  ) {
    const invoiceItem = await tx.supplyInvoiceItem.create({
      data: {
        supplyInvoiceId,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: prepared.stockQuantity,
        receiptQuantity: prepared.receiptQuantity,
        receiptUnit: prepared.receiptUnit,
        conversionFactor: prepared.conversionFactor,
        purchasePrice: item.purchasePrice,
        discountAmount: item.discountAmount ?? 0,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
        series: clean(item.series),
      },
    });
    const batch = await tx.stockBatch.create({
      data: {
        productId: item.productId,
        warehouseId: item.warehouseId,
        supplierId,
        quantity: prepared.stockQuantity,
        rest: prepared.stockQuantity,
        purchasePrice: prepared.stockUnitCost,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
        series: clean(item.series),
        rack: clean(item.rack),
        rackNumber: clean(item.rackNumber),
        shelfNumber: clean(item.shelfNumber),
      },
    });
    await tx.supplyInvoiceItem.update({ where: { id: invoiceItem.id }, data: { stockBatchId: batch.id } });
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        stockBatchId: batch.id,
        warehouseId: item.warehouseId,
        type: StockMovementType.SUPPLY,
        quantity: prepared.stockQuantity,
        unitCost: prepared.stockUnitCost,
        comment: invoiceNumber ? `Дополнение накладной ${invoiceNumber}` : 'Дополнение накладной',
      },
    });
  }

  private async findLegacySupplyBatch(
    tx: Prisma.TransactionClient,
    invoice: { supplierId: string | null; createdAt: Date },
    item: { productId: string; warehouseId: string; quantity: Prisma.Decimal; purchasePrice: Prisma.Decimal; expiresAt: Date | null; series: string | null },
  ) {
    const createdFrom = new Date(invoice.createdAt.getTime() - 2 * 60 * 1000);
    const createdTo = new Date(invoice.createdAt.getTime() + 10 * 60 * 1000);
    const candidates = await tx.stockBatch.findMany({
      where: {
        productId: item.productId,
        warehouseId: item.warehouseId,
        supplierId: invoice.supplierId,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        expiresAt: item.expiresAt,
        series: item.series,
        createdAt: { gte: createdFrom, lte: createdTo },
        supplyInvoiceItem: null,
        movements: { some: { type: StockMovementType.SUPPLY } },
      },
      take: 2,
    });
    return candidates.length === 1 ? candidates[0] : null;
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

  private async ensureSupplierTitleAvailable(title: string, currentSupplierId?: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        title: { equals: title.trim(), mode: 'insensitive' },
        ...(currentSupplierId ? { id: { not: currentSupplierId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Поставщик с таким названием уже существует');
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
    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      select: {
        id: true,
        barcode: true,
        stockUnit: true,
        writeOffUnit: true,
        packageQuantity: true,
        barcodes: { select: { value: true } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private ensureUnitConfiguration(stockUnit?: string, writeOffUnit?: string, packageQuantity?: number) {
    if (unitsNeedConversion(stockUnit, writeOffUnit) && (!packageQuantity || packageQuantity <= 0)) {
      throw new BadRequestException('Укажите, сколько единиц использования содержится в одной учётной единице');
    }
  }

  private async resolveBarcode(
    barcode?: string,
    generateBarcode?: boolean,
    currentBarcode?: string,
    barcodeWasProvided = false,
    productId?: string,
  ) {
    const explicit = clean(barcode);
    if (explicit) {
      if (!/^\d{4,32}$/.test(explicit)) {
        throw new BadRequestException('Штрих-код должен содержать только цифры');
      }

      if (explicit !== currentBarcode) {
        const duplicate = await this.prisma.product.findFirst({
          where: {
            isActive: true,
            ...(productId ? { id: { not: productId } } : {}),
            OR: [{ barcode: explicit }, { barcodes: { some: { value: explicit } } }],
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new BadRequestException('Такой штрих-код уже назначен другому товару');
        }
      }

      return explicit;
    }

    if (!generateBarcode) {
      return barcodeWasProvided ? null : currentBarcode;
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const body = `20${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
      const candidate = `${body}${ean13CheckDigit(body)}`;
      const exists = await this.prisma.product.findFirst({
        where: { isActive: true, OR: [{ barcode: candidate }, { barcodes: { some: { value: candidate } } }] },
        select: { id: true },
      });
      if (!exists) {
        return candidate;
      }
    }

    throw new BadRequestException('Не удалось создать уникальный внутренний штрих-код. Повторите попытку.');
  }

  private async ensureBarcodesAvailable(values: string[], productId?: string) {
    if (!values.length) return;
    const duplicate = await this.prisma.productBarcode.findFirst({
      where: {
        value: { in: values },
        product: { isActive: true },
        ...(productId ? { productId: { not: productId } } : {}),
      },
      select: { value: true },
    });
    if (duplicate) throw new BadRequestException(`Штрих-код ${duplicate.value} уже назначен другому товару`);
  }

  private async ensureServiceExists(serviceId: string) {
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, isActive: true }, select: { id: true } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }
}

const productInclude = {
  category: true,
  barcodes: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
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
    barcodes: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
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

type ExistingServicePricing = Pick<Prisma.ServiceGetPayload<object>, 'price' | 'priceType' | 'minimumPrice' | 'maximumPrice'>;

function resolveServiceCatalogPricing(dto: Partial<UpsertServiceDto>, existing?: ExistingServicePricing) {
  const priceType = dto.priceType ?? existing?.priceType ?? 'FIXED';

  if (priceType === 'FLOATING') {
    const rangeWasSubmitted = dto.priceType !== undefined
      || dto.minimumPrice !== undefined
      || dto.maximumPrice !== undefined;
    const minimumPrice = dto.minimumPrice ?? existing?.minimumPrice?.toNumber();
    const maximumPrice = dto.maximumPrice ?? existing?.maximumPrice?.toNumber();

    if (minimumPrice === undefined || maximumPrice === undefined) {
      if (existing && !rangeWasSubmitted) {
        return {
          priceType,
          price: existing.price,
          minimumPrice: existing.minimumPrice,
          maximumPrice: existing.maximumPrice,
        };
      }
      throw new BadRequestException('Для плавающей цены укажите «Цена от» и «Цена до»');
    }
    if (maximumPrice < minimumPrice) {
      throw new BadRequestException('Цена «до» не может быть меньше цены «от»');
    }

    return {
      priceType,
      price: minimumPrice,
      minimumPrice,
      maximumPrice,
    };
  }

  return {
    priceType: 'FIXED',
    price: dto.price ?? existing?.price ?? 0,
    minimumPrice: null,
    maximumPrice: null,
  };
}

const stockBatchInclude = {
  product: { include: { category: true } },
  warehouse: { select: { id: true, name: true } },
  supplier: { select: { id: true, title: true } },
} satisfies Prisma.StockBatchInclude;

const supplyInvoiceInclude = {
  supplier: true,
  payments: {
    select: { id: true, amount: true, paidAt: true, supplyInvoiceId: true, cashboxId: true, paymentMethodId: true, comment: true },
    orderBy: { paidAt: 'desc' },
  },
  items: {
    include: {
      product: { include: { category: true } },
      warehouse: { select: { id: true, name: true } },
      stockBatch: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.SupplyInvoiceInclude;

function getSupplyInvoiceInclude(itemWhere?: Prisma.SupplyInvoiceItemWhereInput | null) {
  return {
    supplier: true,
    payments: {
      select: { id: true, amount: true, paidAt: true, supplyInvoiceId: true, cashboxId: true, paymentMethodId: true, comment: true },
      orderBy: { paidAt: 'desc' },
    },
    items: {
      ...(itemWhere ? { where: itemWhere } : {}),
      include: {
        product: { include: { category: true } },
        warehouse: { select: { id: true, name: true } },
        stockBatch: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  } satisfies Prisma.SupplyInvoiceInclude;
}

function serializeProduct(product: Prisma.ProductGetPayload<{ include: typeof productInclude }>) {
  const stockRest = product.batches.reduce((sum, batch) => sum.plus(batch.rest), new Prisma.Decimal(0));

  return {
    ...product,
    barcode: selectPrimaryNumericBarcode(product),
    stockRest,
  };
}

type ProductListItem = {
  id: string;
  title: string;
  categoryTitle: string;
  stockRest: Prisma.Decimal;
};

function compareProductListItems(
  left: ProductListItem,
  right: ProductListItem,
  sortBy: 'title' | 'category' | 'stockRest',
  sortOrder: 'asc' | 'desc',
) {
  const primary = sortBy === 'stockRest'
    ? left.stockRest.comparedTo(right.stockRest)
    : sortBy === 'category'
      ? left.categoryTitle.localeCompare(right.categoryTitle, 'ru', { sensitivity: 'base' })
      : left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' });
  const directed = sortOrder === 'desc' ? -primary : primary;
  return directed || left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' });
}

function selectPrimaryNumericBarcode(product: { barcode: string | null; barcodes: Array<{ value: string; isPrimary?: boolean }> }) {
  const candidates = [
    ...product.barcodes.filter((item) => item.isPrimary).map((item) => item.value),
    ...(product.barcode?.split(/[;,\r\n]+/) ?? []),
    ...product.barcodes.map((item) => item.value),
  ].map((value) => value.trim());
  return candidates.find((value) => /^\d{4,32}$/.test(value)) ?? null;
}

function readNumericBarcodes(product: { barcode: string | null; barcodes: Array<{ value: string }> }) {
  return new Set([
    ...(product.barcode?.split(/[;,\r\n]+/) ?? []),
    ...product.barcodes.map((item) => item.value),
  ].map((value) => value.trim()).filter((value) => /^\d{4,32}$/.test(value)));
}

function decimal(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

function supplyLineChanged(
  current: {
    productId: string;
    warehouseId: string;
    quantity: Prisma.Decimal;
    receiptQuantity: Prisma.Decimal;
    receiptUnit: string;
    conversionFactor: Prisma.Decimal;
    purchasePrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    expiresAt: Date | null;
    series: string | null;
    stockBatch: { rack: string | null; rackNumber: string | null; shelfNumber: string | null } | null;
  },
  next: UpdateSupplyInvoiceItemDto,
  prepared: PreparedSupplyLine,
) {
  return current.productId !== next.productId
    || current.warehouseId !== next.warehouseId
    || !current.quantity.equals(prepared.stockQuantity)
    || !current.receiptQuantity.equals(prepared.receiptQuantity)
    || current.receiptUnit !== prepared.receiptUnit
    || !current.conversionFactor.equals(prepared.conversionFactor)
    || !current.purchasePrice.equals(next.purchasePrice)
    || !current.discountAmount.equals(next.discountAmount ?? 0)
    || dateKey(current.expiresAt) !== dateKey(next.expiresAt ? new Date(next.expiresAt) : null)
    || (current.series ?? '') !== (clean(next.series) ?? '')
    || (current.stockBatch?.rack ?? '') !== (clean(next.rack) ?? '')
    || (current.stockBatch?.rackNumber ?? '') !== (clean(next.rackNumber) ?? '')
    || (current.stockBatch?.shelfNumber ?? '') !== (clean(next.shelfNumber) ?? '');
}

type SupplyProductUnit = {
  id: string;
  stockUnit: string | null;
  writeOffUnit: string | null;
  billingUnit: string | null;
};

type SupplyLineUnitInput = {
  productId: string;
  quantity: number;
  purchasePrice: number;
  receiptUnit?: string;
  conversionFactor?: number;
};

type PreparedSupplyLine = {
  receiptQuantity: Prisma.Decimal;
  receiptUnit: string;
  conversionFactor: Prisma.Decimal;
  stockQuantity: Prisma.Decimal;
  stockUnitCost: Prisma.Decimal;
};

function prepareSupplyProductUnits(items: SupplyLineUnitInput[], products: SupplyProductUnit[]) {
  const result = new Map(products.map((product) => [product.id, clean(product.stockUnit ?? undefined)]));
  for (const product of products) {
    if (result.get(product.id)) continue;
    const productLines = items.filter((item) => item.productId === product.id);
    const inferredUnit = clean(productLines[0]?.receiptUnit) ?? 'шт';
    const hasAmbiguousUnits = productLines.some((item) => (clean(item.receiptUnit) ?? inferredUnit) !== inferredUnit || Number(item.conversionFactor ?? 1) !== 1);
    if (hasAmbiguousUnits) {
      throw new BadRequestException('Для товара без базовой единицы сначала укажите одну единицу приёмки без пересчёта');
    }
    result.set(product.id, inferredUnit);
  }
  return result as Map<string, string>;
}

async function initializeMissingProductUnits(
  tx: Prisma.TransactionClient,
  products: SupplyProductUnit[],
  effectiveStockUnits: Map<string, string>,
) {
  for (const product of products) {
    if (clean(product.stockUnit ?? undefined)) continue;
    const stockUnit = effectiveStockUnits.get(product.id)!;
    await tx.product.update({
      where: { id: product.id },
      data: {
        stockUnit,
        ...(!clean(product.writeOffUnit ?? undefined) ? { writeOffUnit: stockUnit } : {}),
        ...(!clean(product.billingUnit ?? undefined) ? { billingUnit: stockUnit } : {}),
      },
    });
  }
}

function prepareSupplyLine(item: SupplyLineUnitInput, stockUnit: string): PreparedSupplyLine {
  const receiptUnit = clean(item.receiptUnit) ?? stockUnit;
  const conversionFactor = decimal(item.conversionFactor ?? 1);
  if (conversionFactor.lessThanOrEqualTo(0)) {
    throw new BadRequestException('Коэффициент пересчёта единицы приёмки должен быть больше нуля');
  }
  if (receiptUnit === stockUnit && !conversionFactor.equals(1)) {
    throw new BadRequestException(`Для одинаковой единицы «${stockUnit}» коэффициент пересчёта должен быть равен 1`);
  }
  const receiptQuantity = decimal(item.quantity);
  const stockQuantity = receiptQuantity.times(conversionFactor);
  return {
    receiptQuantity,
    receiptUnit,
    conversionFactor,
    stockQuantity,
    stockUnitCost: decimal(item.purchasePrice).dividedBy(conversionFactor),
  };
}

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : '';
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function ensureConsistentRetailPrices(items: Array<{ productId: string; retailPrice?: number }>) {
  const prices = new Map<string, number>();
  for (const item of items) {
    if (item.retailPrice === undefined) continue;
    const previous = prices.get(item.productId);
    if (previous !== undefined && previous !== item.retailPrice) {
      throw new BadRequestException('Для одного товара в накладной указаны разные цены продажи');
    }
    prices.set(item.productId, item.retailPrice);
  }
}

function decimalToOptionalNumber(value: Prisma.Decimal | null) {
  return value === null ? undefined : value.toNumber();
}

function ean13CheckDigit(firstTwelveDigits: string) {
  const sum = [...firstTwelveDigits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

function normalizeBarcodes(values: string[]) {
  const normalized = values.flatMap((value) => value.split(/[;,\r\n]+/)).map((value) => value.trim()).filter(Boolean);
  for (const value of normalized) {
    if (!/^\d{4,32}$/.test(value)) throw new BadRequestException(`Штрих-код ${value} должен содержать только цифры`);
  }
  const unique = [...new Set(normalized)];
  if (unique.length > 20) throw new BadRequestException('У одного товара может быть не более 20 штрих-кодов');
  return unique;
}

function barcodeCreate(value: string, isPrimary: boolean, gtin?: string) {
  const type = value === clean(gtin)
    ? ProductBarcodeType.GTIN
    : /^\d{13}$/.test(value)
      ? ProductBarcodeType.EAN13
      : ProductBarcodeType.OTHER;
  return { value, isPrimary, type };
}
