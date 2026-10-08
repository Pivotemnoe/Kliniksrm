import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const SYRINGE_RULE_CODE = 'SYRINGE';
export const SYRINGE_BANDS = [
  { minValue: 0, maxValue: 1, field: 'syringe1ProductId' },
  { minValue: 1, maxValue: 2, field: 'syringe2ProductId' },
  { minValue: 2, maxValue: 5, field: 'syringe5ProductId' },
  { minValue: 5, maxValue: 10, field: 'syringe10ProductId' },
] as const;

type Link = {
  quantity: Prisma.Decimal.Value;
  minDoseMl?: Prisma.Decimal.Value | null;
  maxDoseMl?: Prisma.Decimal.Value | null;
  product: { id: string; title: string };
};

export function resolveLinkedConsumables(links: Link[], quantity: Prisma.Decimal.Value, doseMl: Prisma.Decimal.Value) {
  const dose = new Prisma.Decimal(doseMl);
  const ranges = links.filter((link) => link.minDoseMl != null && link.maxDoseMl != null);
  const matching = ranges.filter((link) => dose.gt(link.minDoseMl!) && dose.lte(link.maxDoseMl!));
  if (dose.gt(0) && ranges.length && matching.length !== 1) {
    throw new BadRequestException('Для этого объёма препарата не настроен однозначный выбор шприца. Проверьте диапазоны расходных материалов.');
  }
  return links.filter((link) => !ranges.includes(link) || matching.includes(link)).map((link) => ({
    productId: link.product.id,
    title: link.product.title,
    quantity: ranges.includes(link) ? (dose.gt(0) ? new Prisma.Decimal(link.quantity) : new Prisma.Decimal(0)) : new Prisma.Decimal(link.quantity).mul(quantity),
  }));
}

export async function getLinkedConsumables(tx: Prisma.TransactionClient, line: { productId?: string | null; serviceId?: string | null; quantity: Prisma.Decimal; stockQuantity?: Prisma.Decimal | null }) {
  const links = line.serviceId
    ? await tx.serviceLinkedProduct.findMany({ where: { serviceId: line.serviceId }, select: { quantity: true, product: { select: { id: true, title: true } } } })
    : line.productId
      ? await tx.productLinkedProduct.findMany({ where: { sourceProductId: line.productId }, select: { quantity: true, minDoseMl: true, maxDoseMl: true, product: { select: { id: true, title: true } } } })
      : [];
  const source = line.productId && !line.serviceId ? await tx.product.findUniqueOrThrow({
    where: { id: line.productId },
    select: { stockUnit: true, writeOffUnit: true, consumableRules: { include: { rule: { include: { options: { include: { product: { select: { id: true, title: true, isActive: true, stockUnit: true, writeOffUnit: true } } } } } } } } },
  }) : null;
  const rules = source?.consumableRules ?? [];
  if ((rules.length || links.some((link) => 'minDoseMl' in link && link.minDoseMl != null)) && (source?.writeOffUnit ?? source?.stockUnit)?.trim().toLocaleLowerCase('ru') !== 'мл') {
    throw new BadRequestException('Выбор шприца по объёму доступен для препаратов, списываемых в мл.');
  }
  const sharedProductIds = new Set(rules.flatMap(({ rule }) => rule.options.map((option) => option.productId)));
  const fixedLinks = rules.length ? links.filter((link) => !('minDoseMl' in link && link.minDoseMl != null) && !sharedProductIds.has(link.product.id)) : links;
  const result = resolveLinkedConsumables(fixedLinks, line.quantity, line.stockQuantity ?? line.quantity);
  for (const { rule } of rules) {
    if (!rule.isActive || rule.inputKind !== 'DOSE_ML' || !rule.options.length) throw new BadRequestException('Общее правило расходников недоступно. Проверьте настройку склада.');
    const selected = resolveLinkedConsumables(rule.options.map((option) => ({ product: option.product, quantity: option.quantity, minDoseMl: option.minValue, maxDoseMl: option.maxValue })), line.quantity, line.stockQuantity ?? line.quantity);
    for (const item of selected) {
      const option = rule.options.find((candidate) => candidate.productId === item.productId)!;
      if (!option.product.isActive || option.product.stockUnit?.trim().toLocaleLowerCase('ru') !== 'шт' || (option.product.writeOffUnit ?? option.product.stockUnit)?.trim().toLocaleLowerCase('ru') !== 'шт') {
        throw new BadRequestException(`Расходный материал «${item.title}» недоступен для списания в штуках. Проверьте настройку склада.`);
      }
      result.push(item);
    }
  }
  // Several future rules may share a stock product: synchronize its total once.
  const totals = new Map<string, (typeof result)[number]>();
  for (const item of result) {
    const previous = totals.get(item.productId);
    if (previous) previous.quantity = previous.quantity.plus(item.quantity);
    else totals.set(item.productId, { ...item });
  }
  return [...totals.values()];
}
