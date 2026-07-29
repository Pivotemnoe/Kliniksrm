import { Prisma } from '@prisma/client';

export type ProductUnitConfiguration = {
  stockUnit: string | null;
  writeOffUnit: string | null;
  packageQuantity: Prisma.Decimal | number | string | null;
};

export function toStockQuantity(
  product: ProductUnitConfiguration,
  writeOffQuantity: Prisma.Decimal.Value,
) {
  const quantity = new Prisma.Decimal(writeOffQuantity);
  const stockUnit = normalizeUnit(product.stockUnit);
  const writeOffUnit = normalizeUnit(product.writeOffUnit);

  if (!stockUnit || !writeOffUnit || stockUnit === writeOffUnit) {
    return quantity;
  }

  const packageQuantity = product.packageQuantity === null
    ? null
    : new Prisma.Decimal(product.packageQuantity);

  // Legacy imports sometimes did not contain a conversion factor. Keeping 1:1
  // is safer than silently multiplying a clinical write-off.
  if (!packageQuantity || packageQuantity.lessThanOrEqualTo(0)) {
    return quantity;
  }

  return quantity.div(packageQuantity).toDecimalPlaces(6);
}

export function unitsNeedConversion(stockUnit?: string | null, writeOffUnit?: string | null) {
  const normalizedStockUnit = normalizeUnit(stockUnit);
  const normalizedWriteOffUnit = normalizeUnit(writeOffUnit);
  return Boolean(normalizedStockUnit && normalizedWriteOffUnit && normalizedStockUnit !== normalizedWriteOffUnit);
}

function normalizeUnit(value?: string | null) {
  return value?.trim().toLocaleLowerCase('ru-RU') || null;
}
