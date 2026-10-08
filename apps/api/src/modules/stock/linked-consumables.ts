import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
  if (links.some((link) => 'minDoseMl' in link && link.minDoseMl != null) && line.productId) {
    const source = await tx.product.findUniqueOrThrow({ where: { id: line.productId }, select: { writeOffUnit: true } });
    if (source.writeOffUnit?.trim().toLocaleLowerCase('ru') !== 'мл') throw new BadRequestException('Выбор шприца по объёму доступен для препаратов, списываемых в мл.');
  }
  return resolveLinkedConsumables(links, line.quantity, line.stockQuantity ?? line.quantity);
}
