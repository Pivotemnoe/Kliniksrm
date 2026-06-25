import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AnimalSex, Prisma, StockMovementType } from '@prisma/client';
import {
  formatNormalizedRussianPhone,
  normalizeDisplayName,
  normalizePersonNameKey,
  normalizePhoneForLookup,
} from '../../common/phone';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { VetafImportDto, VetafImportKind, VetafImportRowDto } from './dto/vetaf-import.dto';

type ImportIssue = {
  rowNumber: number;
  level: 'error' | 'warning';
  message: string;
  field?: string;
};

type ImportSummary = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  ownersCreated: number;
  ownersUpdated: number;
  animalsCreated: number;
  productsCreated: number;
  productsUpdated: number;
  stockBatchesCreated: number;
  skippedRows: number;
};

type ImportResult = {
  kind: VetafImportKind;
  mode: 'preview' | 'commit';
  summary: ImportSummary;
  issues: ImportIssue[];
  samples: Array<Record<string, string | number | null>>;
};

type ClientRow = {
  rowNumber: number;
  ownerName: string | null;
  phoneNormalized: string | null;
  phone: string | null;
  extraPhone: string | null;
  email: string | null;
  address: string | null;
  animalName: string | null;
  species: string | null;
  breed: string | null;
  sex: AnimalSex;
  birthDate: Date | null;
  microchip: string | null;
  color: string | null;
  animalComment: string | null;
  ownerComment: string | null;
};

type StockRow = {
  rowNumber: number;
  title: string | null;
  categoryTitle: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  quantity: Prisma.Decimal;
  retailPrice: Prisma.Decimal | null;
  purchasePrice: Prisma.Decimal;
  minStock: Prisma.Decimal | null;
  warehouseName: string | null;
  expiresAt: Date | null;
  series: string | null;
  description: string | null;
};

const emptySummary = (): ImportSummary => ({
  totalRows: 0,
  validRows: 0,
  errorRows: 0,
  ownersCreated: 0,
  ownersUpdated: 0,
  animalsCreated: 0,
  productsCreated: 0,
  productsUpdated: 0,
  stockBatchesCreated: 0,
  skippedRows: 0,
});

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async previewVetafImport(dto: VetafImportDto, actor: AuthEmployee) {
    this.ensureImportPermission(dto.kind, actor);
    return dto.kind === 'clients' ? this.processClientRows(dto.rows, actor.id, false) : this.processStockRows(dto.rows, actor.id, false);
  }

  async commitVetafImport(dto: VetafImportDto, actor: AuthEmployee) {
    this.ensureImportPermission(dto.kind, actor);
    return dto.kind === 'clients' ? this.processClientRows(dto.rows, actor.id, true) : this.processStockRows(dto.rows, actor.id, true);
  }

  private ensureImportPermission(kind: VetafImportKind, actor: AuthEmployee) {
    const permissions = new Set(actor.permissions);
    if (permissions.has('*')) {
      return;
    }

    if (kind === 'clients' && permissions.has('owners.manage') && permissions.has('animals.manage')) {
      return;
    }

    if (kind === 'stock' && permissions.has('stock.manage')) {
      return;
    }

    throw new ForbiddenException(kind === 'clients' ? 'Нужны права владельцев и пациентов' : 'Нужны права склада');
  }

  private async processClientRows(rows: VetafImportRowDto[], actorId: string, commit: boolean): Promise<ImportResult> {
    const summary = emptySummary();
    summary.totalRows = rows.length;
    const issues: ImportIssue[] = [];
    const parsedRows = rows.map((row) => parseClientRow(row, issues));
    const validRows = parsedRows.filter((row): row is ClientRow => Boolean(row));
    summary.errorRows = rows.length - validRows.length;
    summary.validRows = validRows.length;
    const samples: ImportResult['samples'] = [];

    if (!commit) {
      for (const row of validRows) {
        const owner = await this.findOwner(row);
        if (owner) {
          summary.ownersUpdated += hasOwnerFillableFields(owner, row) ? 1 : 0;
        } else {
          summary.ownersCreated += 1;
        }

        if (row.animalName) {
          const exists = owner ? await this.findAnimal(owner.id, row) : null;
          if (!exists) {
            summary.animalsCreated += 1;
          }
        }

        pushSample(samples, {
          row: row.rowNumber,
          owner: row.ownerName ?? row.phone ?? '',
          phone: row.phone,
          animal: row.animalName,
        });
      }

      return buildResult('clients', 'preview', summary, issues, samples);
    }

    for (const row of validRows) {
      const owner = await this.upsertOwner(row);
      if (owner.created) {
        summary.ownersCreated += 1;
      } else if (owner.updated) {
        summary.ownersUpdated += 1;
      }

      if (row.animalName) {
        const existingAnimal = await this.findAnimal(owner.id, row);
        if (!existingAnimal) {
          await this.prisma.animal.create({
            data: {
              ownerId: owner.id,
              nickname: row.animalName,
              species: row.species,
              breed: row.breed,
              sex: row.sex,
              birthDate: row.birthDate ?? undefined,
              microchip: row.microchip,
              color: row.color,
              comment: row.animalComment,
              status: 'Импорт ВетаФ',
            },
          });
          summary.animalsCreated += 1;
        }
      }

      pushSample(samples, {
        row: row.rowNumber,
        owner: row.ownerName ?? row.phone ?? '',
        phone: row.phone,
        animal: row.animalName,
      });
    }

    await this.auditService.log({
      actorId,
      action: 'imports.vetaf.clients',
      entityType: 'Import',
      metadata: summary,
    });

    return buildResult('clients', 'commit', summary, issues, samples);
  }

  private async processStockRows(rows: VetafImportRowDto[], actorId: string, commit: boolean): Promise<ImportResult> {
    const summary = emptySummary();
    summary.totalRows = rows.length;
    const issues: ImportIssue[] = [];
    const parsedRows = rows.map((row) => parseStockRow(row, issues));
    const validRows = parsedRows.filter((row): row is StockRow => Boolean(row));
    summary.errorRows = rows.length - validRows.length;
    summary.validRows = validRows.length;
    const samples: ImportResult['samples'] = [];

    if (!commit) {
      for (const row of validRows) {
        const product = await this.findProduct(row);
        if (product) {
          summary.productsUpdated += 1;
        } else {
          summary.productsCreated += 1;
        }

        if (row.quantity.greaterThan(0)) {
          summary.stockBatchesCreated += 1;
          if (!(await this.resolveWarehouse(row.warehouseName))) {
            issues.push({ rowNumber: row.rowNumber, level: 'warning', field: 'warehouse', message: 'Склад не найден, будет использован первый склад' });
          }
        }

        pushSample(samples, {
          row: row.rowNumber,
          product: row.title,
          quantity: row.quantity.toString(),
          price: row.retailPrice?.toString() ?? null,
        });
      }

      return buildResult('stock', 'preview', summary, issues, samples);
    }

    for (const row of validRows) {
      const product = await this.upsertProduct(row);
      if (product.created) {
        summary.productsCreated += 1;
      } else if (product.updated) {
        summary.productsUpdated += 1;
      }

      if (row.quantity.greaterThan(0)) {
        const warehouse = await this.resolveWarehouse(row.warehouseName);
        if (!warehouse) {
          throw new BadRequestException('Не найден ни один склад для импорта остатков');
        }

        const batch = await this.prisma.stockBatch.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: row.quantity,
            rest: row.quantity,
            purchasePrice: row.purchasePrice,
            expiresAt: row.expiresAt ?? undefined,
            series: row.series,
          },
        });

        await this.prisma.stockMovement.create({
          data: {
            productId: product.id,
            stockBatchId: batch.id,
            warehouseId: warehouse.id,
            type: StockMovementType.SUPPLY,
            quantity: row.quantity,
            comment: 'Импорт остатков из ВетаФ',
          },
        });

        summary.stockBatchesCreated += 1;
      }

      pushSample(samples, {
        row: row.rowNumber,
        product: row.title,
        quantity: row.quantity.toString(),
        price: row.retailPrice?.toString() ?? null,
      });
    }

    await this.auditService.log({
      actorId,
      action: 'imports.vetaf.stock',
      entityType: 'Import',
      metadata: summary,
    });

    return buildResult('stock', 'commit', summary, issues, samples);
  }

  private async findOwner(row: ClientRow) {
    if (row.phoneNormalized) {
      return this.prisma.owner.findFirst({ where: { phoneNormalized: row.phoneNormalized } });
    }

    if (row.ownerName) {
      return this.prisma.owner.findFirst({ where: { fullNameNormalized: normalizePersonNameKey(row.ownerName) } });
    }

    return null;
  }

  private async upsertOwner(row: ClientRow) {
    const existing = await this.findOwner(row);
    if (!existing) {
      const owner = await this.prisma.owner.create({
        data: {
          fullName: row.ownerName ?? row.phone ?? 'Владелец из ВетаФ',
          fullNameNormalized: normalizePersonNameKey(row.ownerName ?? row.phone ?? 'Владелец из ВетаФ'),
          phone: row.phone,
          phoneNormalized: row.phoneNormalized,
          extraPhone: row.extraPhone,
          email: row.email,
          address: row.address,
          source: 'Импорт ВетаФ',
          comment: row.ownerComment,
        },
      });
      return { ...owner, created: true, updated: false };
    }

    const updateData = getOwnerFillData(existing, row);
    if (!Object.keys(updateData).length) {
      return { ...existing, created: false, updated: false };
    }

    const owner = await this.prisma.owner.update({ where: { id: existing.id }, data: updateData });
    return { ...owner, created: false, updated: true };
  }

  private async findAnimal(ownerId: string, row: ClientRow) {
    if (!row.animalName && !row.microchip) {
      return null;
    }

    return this.prisma.animal.findFirst({
      where: {
        ownerId,
        OR: [
          ...(row.microchip ? [{ microchip: row.microchip }] : []),
          ...(row.animalName ? [{ nickname: { equals: row.animalName, mode: Prisma.QueryMode.insensitive } }] : []),
        ],
      },
      select: { id: true },
    });
  }

  private async findProduct(row: StockRow) {
    return this.prisma.product.findFirst({
      where: {
        OR: [
          ...(row.barcode ? [{ barcode: row.barcode }] : []),
          ...(row.sku ? [{ sku: row.sku }] : []),
          ...(row.title ? [{ title: { equals: row.title, mode: Prisma.QueryMode.insensitive } }] : []),
        ],
      },
    });
  }

  private async upsertProduct(row: StockRow) {
    const existing = await this.findProduct(row);
    const categoryId = row.categoryTitle ? (await this.prisma.productCategory.upsert({
      where: { title: row.categoryTitle },
      update: {},
      create: { title: row.categoryTitle },
      select: { id: true },
    })).id : undefined;

    if (!existing) {
      const product = await this.prisma.product.create({
        data: {
          title: row.title!,
          categoryId,
          sku: row.sku,
          barcode: row.barcode,
          retailPrice: row.retailPrice ?? 0,
          stockUnit: row.unit,
          writeOffUnit: row.unit,
          minStock: row.minStock,
          description: row.description,
        },
      });
      return { ...product, created: true, updated: false };
    }

    const product = await this.prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(categoryId ? { categoryId } : {}),
        ...(row.sku ? { sku: row.sku } : {}),
        ...(row.barcode ? { barcode: row.barcode } : {}),
        ...(row.retailPrice ? { retailPrice: row.retailPrice } : {}),
        ...(row.unit ? { stockUnit: row.unit, writeOffUnit: row.unit } : {}),
        ...(row.minStock ? { minStock: row.minStock } : {}),
        ...(row.description ? { description: row.description } : {}),
      },
    });
    return { ...product, created: false, updated: true };
  }

  private async resolveWarehouse(warehouseName: string | null) {
    if (warehouseName) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { name: { equals: warehouseName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (warehouse) {
        return warehouse;
      }
    }

    return this.prisma.warehouse.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  }
}

function parseClientRow(row: VetafImportRowDto, issues: ImportIssue[]): ClientRow | null {
  const ownerName = clean(getField(row.data, ['владелец', 'фио владельца', 'клиент', 'фио клиента', 'owner', 'owner name']));
  const phoneRaw = clean(getField(row.data, ['телефон', 'телефон владельца', 'мобильный', 'phone']));
  const phoneNormalized = safePhone(phoneRaw, row.rowNumber, issues);
  const phone = formatNormalizedRussianPhone(phoneNormalized);
  const animalName = clean(getField(row.data, ['кличка', 'пациент', 'животное', 'питомец', 'animal', 'pet']));

  if (!ownerName && !phone) {
    issues.push({ rowNumber: row.rowNumber, level: 'error', field: 'owner', message: 'Нет ФИО владельца или телефона' });
    return null;
  }

  if (!animalName) {
    issues.push({ rowNumber: row.rowNumber, level: 'warning', field: 'animal', message: 'Пациент не указан, будет импортирован только владелец' });
  }

  return {
    rowNumber: row.rowNumber,
    ownerName: ownerName ? normalizeDisplayName(ownerName) : null,
    phoneNormalized,
    phone,
    extraPhone: clean(getField(row.data, ['доп телефон', 'дополнительный телефон', 'extra phone'])),
    email: clean(getField(row.data, ['email', 'e-mail', 'почта'])),
    address: clean(getField(row.data, ['адрес', 'address'])),
    animalName,
    species: clean(getField(row.data, ['вид', 'тип животного', 'species'])),
    breed: clean(getField(row.data, ['порода', 'breed'])),
    sex: parseSex(getField(row.data, ['пол', 'sex'])),
    birthDate: parseDate(getField(row.data, ['дата рождения', 'рождение', 'возраст', 'birthdate', 'birth date'])),
    microchip: clean(getField(row.data, ['чип', 'микрочип', 'microchip'])),
    color: clean(getField(row.data, ['окрас', 'color'])),
    animalComment: clean(getField(row.data, ['комментарий пациента', 'примечание пациента', 'animal comment'])),
    ownerComment: clean(getField(row.data, ['комментарий', 'примечание', 'comment'])),
  };
}

function parseStockRow(row: VetafImportRowDto, issues: ImportIssue[]): StockRow | null {
  const title = clean(getField(row.data, ['товар', 'наименование', 'название', 'номенклатура', 'product', 'title']));
  if (!title) {
    issues.push({ rowNumber: row.rowNumber, level: 'error', field: 'title', message: 'Нет названия товара' });
    return null;
  }

  const quantity = parseDecimal(getField(row.data, ['остаток', 'количество', 'qty', 'quantity']), 0);
  if (quantity.lessThan(0)) {
    issues.push({ rowNumber: row.rowNumber, level: 'error', field: 'quantity', message: 'Остаток не может быть отрицательным' });
    return null;
  }

  return {
    rowNumber: row.rowNumber,
    title,
    categoryTitle: clean(getField(row.data, ['категория', 'группа', 'category'])),
    sku: clean(getField(row.data, ['артикул', 'код', 'sku'])),
    barcode: clean(getField(row.data, ['штрихкод', 'barcode', 'ean'])),
    unit: clean(getField(row.data, ['ед изм', 'единица', 'unit'])) ?? 'шт',
    quantity,
    retailPrice: parseOptionalDecimal(getField(row.data, ['цена продажи', 'розничная цена', 'цена', 'retail price', 'price'])),
    purchasePrice: parseDecimal(getField(row.data, ['закупочная цена', 'себестоимость', 'purchase price']), 0),
    minStock: parseOptionalDecimal(getField(row.data, ['минимальный остаток', 'min stock'])),
    warehouseName: clean(getField(row.data, ['склад', 'warehouse'])),
    expiresAt: parseDate(getField(row.data, ['срок годности', 'годен до', 'expires at'])),
    series: clean(getField(row.data, ['серия', 'партия', 'series'])),
    description: clean(getField(row.data, ['описание', 'комментарий', 'description'])),
  };
}

function getField(data: Record<string, string>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(data)) {
    if (normalizedAliases.has(normalizeHeader(key))) {
      return value;
    }
  }

  return '';
}

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
}

function clean(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized ? normalized : null;
}

function safePhone(value: string | null, rowNumber: number, issues: ImportIssue[]) {
  if (!value) {
    return null;
  }

  try {
    return normalizePhoneForLookup(value);
  } catch {
    issues.push({ rowNumber, level: 'warning', field: 'phone', message: 'Телефон не похож на российский номер, поле пропущено' });
    return null;
  }
}

function parseSex(value?: string | null): AnimalSex {
  const normalized = normalizeHeader(value ?? '');
  if (['м', 'самец', 'male', 'кобель', 'кот'].includes(normalized)) {
    return AnimalSex.MALE;
  }
  if (['ж', 'самка', 'female', 'сука', 'кошка'].includes(normalized)) {
    return AnimalSex.FEMALE;
  }
  return AnimalSex.UNKNOWN;
}

function parseDate(value?: string | null) {
  const cleaned = clean(value);
  if (!cleaned) {
    return null;
  }

  const parts = cleaned.replace(/[,\s/]+/g, '.').replace(/-+/g, '.').split('.').filter(Boolean);
  const parsed =
    parts.length === 3 && parts[0].length === 4
      ? buildDate(Number(parts[0]), Number(parts[1]), Number(parts[2]))
      : parts.length === 3
        ? buildDate(Number(parts[2]), Number(parts[1]), Number(parts[0]))
        : parts.length === 2 && parts[0].length === 4
          ? buildDate(Number(parts[0]), Number(parts[1]), 1)
          : parts.length === 2
            ? buildDate(Number(parts[1]), Number(parts[0]), 1)
            : /^\d{4}$/.test(cleaned)
              ? buildDate(Number(cleaned), 1, 1)
              : null;

  return parsed;
}

function buildDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900 ||
    year > 2100
  ) {
    return null;
  }

  return date;
}

function parseDecimal(value: string | undefined, fallback: number) {
  const parsed = parseOptionalDecimal(value);
  return parsed ?? new Prisma.Decimal(fallback);
}

function parseOptionalDecimal(value?: string | null) {
  const cleaned = clean(value)?.replace(/\s/g, '').replace(',', '.');
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
}

function hasOwnerFillableFields(owner: { email: string | null; address: string | null; extraPhone: string | null; comment: string | null }, row: ClientRow) {
  return Boolean((!owner.email && row.email) || (!owner.address && row.address) || (!owner.extraPhone && row.extraPhone) || (!owner.comment && row.ownerComment));
}

function getOwnerFillData(
  owner: { email: string | null; address: string | null; extraPhone: string | null; comment: string | null },
  row: ClientRow,
): Prisma.OwnerUpdateInput {
  return {
    ...(!owner.email && row.email ? { email: row.email } : {}),
    ...(!owner.address && row.address ? { address: row.address } : {}),
    ...(!owner.extraPhone && row.extraPhone ? { extraPhone: row.extraPhone } : {}),
    ...(!owner.comment && row.ownerComment ? { comment: row.ownerComment } : {}),
  };
}

function buildResult(kind: VetafImportKind, mode: 'preview' | 'commit', summary: ImportSummary, issues: ImportIssue[], samples: ImportResult['samples']) {
  summary.skippedRows = summary.totalRows - summary.validRows;
  return { kind, mode, summary, issues, samples };
}

function pushSample(samples: ImportResult['samples'], sample: Record<string, string | number | null>) {
  if (samples.length < 20) {
    samples.push(sample);
  }
}
