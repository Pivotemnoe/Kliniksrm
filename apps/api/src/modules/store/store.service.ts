import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { parsePagination } from '../../common/pagination';
import { rankSearchResults } from '../../common/search-ranking';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListStoreProductsDto } from './dto/list-store-products.dto';
import { ImportStoreProductsDto, UpdateStoreProductDto, UpsertStoreProductDto } from './dto/upsert-store-product.dto';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getResources() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { displayName: true, legalName: true },
    });
    return { organization };
  }

  async listProducts(query: ListStoreProductsDto) {
    const { limit, offset } = parsePagination(query);
    const search = clean(query.search);
    const where: Prisma.StoreProductWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { categoryTitle: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (search) {
      const matches = await this.prisma.storeProduct.findMany({ where });
      const ordered = rankSearchResults(matches, search, (item) => [item.title, item.sku, item.barcode, item.categoryTitle]);
      return { items: ordered.slice(offset, offset + limit), total: ordered.length, limit, offset };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.storeProduct.findMany({ where, orderBy: { title: 'asc' }, skip: offset, take: limit }),
      this.prisma.storeProduct.count({ where }),
    ]);
    return { items, total, limit, offset };
  }

  async createProduct(dto: UpsertStoreProductDto, actorId: string) {
    const product = await this.prisma.$transaction(async (tx) => {
      const data = await this.prepareCreateData(tx, dto);
      return tx.storeProduct.create({ data });
    });
    await this.audit.log({ actorId, action: 'store.product.create', entityType: 'StoreProduct', entityId: product.id, metadata: { title: product.title } });
    return product;
  }

  async updateProduct(productId: string, dto: UpdateStoreProductDto, actorId: string) {
    const existing = await this.requireProduct(productId);
    const product = await this.prisma.$transaction(async (tx) => {
      const barcode = dto.generateBarcode
        ? await this.generateBarcode(tx, productId)
        : dto.barcode !== undefined ? clean(dto.barcode) ?? null : undefined;
      const sku = dto.sku !== undefined ? clean(dto.sku) ?? null : undefined;
      await this.ensureIdentifiersAvailable(tx, sku ?? undefined, barcode ?? undefined, productId);
      return tx.storeProduct.update({
        where: { id: productId },
        data: {
          ...(dto.title !== undefined ? { title: requiredText(dto.title, 'Введите название товара') } : {}),
          ...(dto.categoryTitle !== undefined ? { categoryTitle: clean(dto.categoryTitle) ?? null } : {}),
          ...(dto.sku !== undefined ? { sku } : {}),
          ...(dto.barcode !== undefined || dto.generateBarcode ? { barcode } : {}),
          ...(dto.retailPrice !== undefined ? { retailPrice: dto.retailPrice } : {}),
          ...(dto.unit !== undefined ? { unit: clean(dto.unit) || 'шт' } : {}),
          ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
          ...(dto.description !== undefined ? { description: clean(dto.description) ?? null } : {}),
        },
      });
    });
    await this.audit.log({ actorId, action: 'store.product.update', entityType: 'StoreProduct', entityId: product.id, metadata: { before: existing.title, after: product.title } });
    return product;
  }

  async archiveProduct(productId: string, actorId: string) {
    const existing = await this.requireProduct(productId);
    const product = await this.prisma.storeProduct.update({ where: { id: productId }, data: { isActive: false } });
    await this.audit.log({ actorId, action: 'store.product.archive', entityType: 'StoreProduct', entityId: product.id, metadata: { title: existing.title } });
    return { id: product.id, title: product.title, deleted: true as const };
  }

  async importProducts(dto: ImportStoreProductsDto, actorId: string) {
    if (!dto.items.length) throw new BadRequestException('В файле нет товаров');
    const result = await this.prisma.$transaction(async (tx) => {
      const imported = [];
      let created = 0;
      let updated = 0;
      for (const item of dto.items) {
        const title = requiredText(item.title, 'У каждого товара должно быть название');
        const sku = clean(item.sku);
        const barcode = clean(item.barcode);
        const existing = await this.findImportMatch(tx, { title, sku, barcode });
        await this.ensureIdentifiersAvailable(tx, sku, barcode, existing?.id);
        const data = {
          title,
          categoryTitle: clean(item.categoryTitle),
          sku,
          barcode,
          retailPrice: item.retailPrice,
          unit: clean(item.unit) || 'шт',
          vatRate: item.vatRate,
          description: clean(item.description),
          isActive: true,
        };
        if (existing) {
          imported.push(await tx.storeProduct.update({ where: { id: existing.id }, data }));
          updated += 1;
        } else {
          imported.push(await tx.storeProduct.create({ data }));
          created += 1;
        }
      }
      return { created, updated, total: imported.length, items: imported };
    });
    await this.audit.log({ actorId, action: 'store.product.import', entityType: 'StoreProduct', metadata: { created: result.created, updated: result.updated, total: result.total } });
    return result;
  }

  private async requireProduct(productId: string) {
    const product = await this.prisma.storeProduct.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new NotFoundException('Товар магазина не найден');
    return product;
  }

  private async prepareCreateData(tx: Prisma.TransactionClient, dto: UpsertStoreProductDto): Promise<Prisma.StoreProductCreateInput> {
    const sku = clean(dto.sku);
    const barcode = dto.generateBarcode ? await this.generateBarcode(tx) : clean(dto.barcode);
    await this.ensureIdentifiersAvailable(tx, sku, barcode);
    return {
      title: requiredText(dto.title, 'Введите название товара'),
      categoryTitle: clean(dto.categoryTitle),
      sku,
      barcode,
      retailPrice: dto.retailPrice,
      unit: clean(dto.unit) || 'шт',
      vatRate: dto.vatRate,
      description: clean(dto.description),
    };
  }

  private async ensureIdentifiersAvailable(tx: Prisma.TransactionClient, sku?: string, barcode?: string, productId?: string) {
    if (barcode && !/^[0-9A-Za-z._-]{4,80}$/.test(barcode)) {
      throw new BadRequestException('Штрих-код должен содержать от 4 до 80 цифр или латинских символов');
    }
    const duplicate = await tx.storeProduct.findFirst({
      where: {
        isActive: true,
        ...(productId ? { id: { not: productId } } : {}),
        OR: [...(sku ? [{ sku }] : []), ...(barcode ? [{ barcode }] : [])],
      },
      select: { title: true, sku: true, barcode: true },
    });
    if (!duplicate) return;
    if (sku && duplicate.sku === sku) throw new ConflictException(`Артикул ${sku} уже используется товаром «${duplicate.title}»`);
    throw new ConflictException(`Штрих-код ${barcode} уже используется товаром «${duplicate.title}»`);
  }

  private async findImportMatch(tx: Prisma.TransactionClient, input: { title: string; sku?: string; barcode?: string }) {
    const identifierMatches = await tx.storeProduct.findMany({
      where: {
        OR: [...(input.sku ? [{ sku: input.sku }] : []), ...(input.barcode ? [{ barcode: input.barcode }] : [])],
      },
      take: 2,
    });
    if (identifierMatches.length > 1) throw new ConflictException(`Артикул и штрих-код товара «${input.title}» относятся к разным позициям`);
    if (identifierMatches[0]) return identifierMatches[0];
    const titleMatches = await tx.storeProduct.findMany({ where: { title: { equals: input.title, mode: 'insensitive' } }, take: 2 });
    if (titleMatches.length > 1) throw new ConflictException(`Найдено несколько товаров магазина с названием «${input.title}»`);
    return titleMatches[0];
  }

  private async generateBarcode(tx: Prisma.TransactionClient, productId?: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const body = `21${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
      const candidate = `${body}${ean13CheckDigit(body)}`;
      const exists = await tx.storeProduct.findFirst({ where: { barcode: candidate, ...(productId ? { id: { not: productId } } : {}) }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new BadRequestException('Не удалось создать уникальный штрих-код. Повторите попытку.');
  }
}

function clean(value?: string | null) {
  return value?.trim() || undefined;
}

function requiredText(value: string, message: string) {
  const normalized = clean(value);
  if (!normalized) throw new BadRequestException(message);
  return normalized;
}

function ean13CheckDigit(firstTwelveDigits: string) {
  const sum = [...firstTwelveDigits].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}
