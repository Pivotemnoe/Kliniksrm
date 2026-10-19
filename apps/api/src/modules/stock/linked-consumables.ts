import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toStockQuantity } from './stock-units';

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
  product: { id: string; title: string; stockUnit?: string | null; writeOffUnit?: string | null; packageQuantity?: Prisma.Decimal.Value | null };
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

type Source = { productId?: string | null; serviceId?: string | null };
type Recipe = { version: 1; source: Source; links: Link[]; rules: any[] };
type UsageOwner = { billItemId: string; hospitalRecordId?: never } | { hospitalRecordId: string; billItemId?: never };

export async function loadConsumableRecipe(tx: Prisma.TransactionClient, sourceId: Source): Promise<Recipe> {
  const links = sourceId.serviceId
    ? await tx.serviceLinkedProduct.findMany({ where: { serviceId: sourceId.serviceId }, select: { quantity: true, product: { select: { id: true, title: true, stockUnit: true, writeOffUnit: true, packageQuantity: true } } } })
    : sourceId.productId
      ? await tx.productLinkedProduct.findMany({ where: { sourceProductId: sourceId.productId }, select: { quantity: true, minDoseMl: true, maxDoseMl: true, product: { select: { id: true, title: true, stockUnit: true, writeOffUnit: true, packageQuantity: true } } } })
      : [];
  const includeRule = { include: { rule: { include: { options: { include: { product: { select: { id: true, title: true, isActive: true, stockUnit: true, writeOffUnit: true, packageQuantity: true } } } } } } } } as const;
  const source = sourceId.productId && !sourceId.serviceId ? await tx.product.findUniqueOrThrow({
    where: { id: sourceId.productId }, select: { stockUnit: true, writeOffUnit: true, consumableRules: includeRule },
  }) : null;
  const rules = sourceId.serviceId
    ? (await tx.serviceConsumableRule.findMany({ where: { serviceId: sourceId.serviceId }, ...includeRule })).map(link => link.rule)
    : (source?.consumableRules ?? []).map(link => link.rule);
  if ((rules.some(rule => rule.inputKind === 'DOSE_ML') || links.some(link => 'minDoseMl' in link && link.minDoseMl != null)) && (source?.writeOffUnit ?? source?.stockUnit)?.trim().toLocaleLowerCase('ru') !== 'мл') {
    throw new BadRequestException('Выбор шприца по объёму доступен для препаратов, списываемых в мл.');
  }
  // JSON stores a private catalog recipe, without patient data or current stock balances.
  return JSON.parse(JSON.stringify({ version: 1, source: { productId: sourceId.productId ?? null, serviceId: sourceId.serviceId ?? null }, links, rules }));
}

export function resolveConsumableRecipe(recipe: Recipe, quantity: Prisma.Decimal.Value, doseMl: Prisma.Decimal.Value) {
  const sharedIds = new Set<string>(recipe.rules.flatMap(rule => rule.options.map((option: any) => option.productId)));
  const links = recipe.rules.length ? recipe.links.filter(link => !(link.minDoseMl != null && recipe.rules.some(rule => rule.inputKind === 'DOSE_ML')) && !sharedIds.has(link.product.id)) : recipe.links;
  const result = resolveLinkedConsumables(links, quantity, doseMl);
  for (const rule of recipe.rules) {
    if (!rule.isActive || !['DOSE_ML', 'FIXED'].includes(rule.inputKind) || !rule.options.length) throw new BadRequestException('Общее правило расходников недоступно. Проверьте настройку склада.');
    const selected = resolveLinkedConsumables(rule.options.map((option: any) => ({ product: option.product, quantity: option.quantity, ...(rule.inputKind === 'DOSE_ML' ? { minDoseMl: option.minValue, maxDoseMl: option.maxValue } : {}) })), quantity, doseMl);
    for (const item of selected) {
      const option = rule.options.find((candidate: any) => candidate.productId === item.productId)!;
      if (!option.product.isActive || (rule.inputKind === 'DOSE_ML' && (option.product.stockUnit?.trim().toLocaleLowerCase('ru') !== 'шт' || (option.product.writeOffUnit ?? option.product.stockUnit)?.trim().toLocaleLowerCase('ru') !== 'шт'))) {
        throw new BadRequestException(`Расходный материал «${item.title}» недоступен. Проверьте настройку склада.`);
      }
      result.push(item);
    }
  }
  const totals = new Map<string, (typeof result)[number]>();
  for (const item of result) {
    const previous = totals.get(item.productId);
    if (previous) previous.quantity = previous.quantity.plus(item.quantity);
    else totals.set(item.productId, { ...item });
  }
  const products = new Map([...recipe.links.map(link => link.product), ...recipe.rules.flatMap(rule => rule.options.map((o: any) => o.product))].map(product => [product.id, product]));
  return [...totals.values()].map(item => {
    const product = products.get(item.productId);
    const stockQuantity = product && 'stockUnit' in product ? toStockQuantity({ stockUnit: product.stockUnit ?? null, writeOffUnit: product.writeOffUnit ?? null, packageQuantity: product.packageQuantity ?? null }, item.quantity) : undefined;
    if (stockQuantity && !stockQuantity.eq(stockQuantity.toDecimalPlaces(3))) throw new BadRequestException(`Расход товара «${item.title}» неточен в складской единице. Уточните единицы учёта и норму расхода`);
    return { ...item, stockQuantity };
  });
}

export async function getLinkedConsumables(tx: Prisma.TransactionClient, line: Source & { quantity: Prisma.Decimal; stockQuantity?: Prisma.Decimal | null }, owner?: UsageOwner) {
  let recipe: Recipe;
  if (owner) {
    const where = owner.billItemId ? { billItemId: owner.billItemId } : { hospitalRecordId: owner.hospitalRecordId! };
    const existing = await tx.consumableUsageSnapshot.findUnique({ where });
    const saved = existing?.recipe as unknown as Recipe | undefined;
    if (saved && saved.source.productId === (line.productId ?? null) && saved.source.serviceId === (line.serviceId ?? null)) recipe = saved;
    else {
      recipe = await loadConsumableRecipe(tx, line);
      // Return the winning snapshot if a concurrent save captured this operation first.
      const snapshot = await tx.consumableUsageSnapshot.upsert({ where, create: { ...owner, recipe: recipe as unknown as Prisma.InputJsonValue }, update: existing ? { recipe: recipe as unknown as Prisma.InputJsonValue } : {} });
      recipe = snapshot.recipe as unknown as Recipe;
    }
  } else recipe = await loadConsumableRecipe(tx, line);
  return resolveConsumableRecipe(recipe, line.quantity, line.stockQuantity ?? line.quantity);
}

/** Capture the previous recipe before catalog changes, including already completed legacy operations. */
export async function freezeConsumableUsage(tx: Prisma.TransactionClient, source: Source) {
  const recipe = await loadConsumableRecipe(tx, source);
  const target = source.serviceId ? { serviceId: source.serviceId } : { productId: source.productId! };
  const bills = await tx.billItem.findMany({ where: { ...target, hospitalRecord: null, consumableSnapshot: null, bill: { visitId: { not: null } }, OR: [
    { stockMovements: { some: {} } }, { bill: { status: { in: ['PAID', 'PARTIAL'] } } }, { bill: { visit: { status: 'COMPLETED' } } },
  ] }, select: { id: true } });
  const records = await tx.hospitalRecord.findMany({ where: { recordStatus: 'COMPLETED', consumableSnapshot: null, OR: [
    { billItem: target }, ...(source.serviceId ? [{ plannedServiceId: source.serviceId }] : [{ plannedProductId: source.productId! }]),
  ] }, select: { id: true } });
  const json = recipe as unknown as Prisma.InputJsonValue;
  if (bills.length) await tx.consumableUsageSnapshot.createMany({ data: bills.map(item => ({ billItemId: item.id, recipe: json })), skipDuplicates: true });
  if (records.length) await tx.consumableUsageSnapshot.createMany({ data: records.map(item => ({ hospitalRecordId: item.id, recipe: json })), skipDuplicates: true });
}

export async function assertNoSharedConsumableOverlap(tx: Prisma.TransactionClient, source: Source, items: Array<{ productId: string }>) {
  if (!items.length) return;
  const where = { inputKind: 'FIXED', isActive: true, ...(source.serviceId ? { services: { some: { serviceId: source.serviceId } } } : { products: { some: { productId: source.productId! } } }) };
  if (await tx.consumableRuleOption.findFirst({ where: { productId: { in: items.map(i => i.productId) }, rule: where } })) throw new BadRequestException('Этот расходный товар уже задаётся общим набором. Измените его в разделе «Привязки расходников»');
}

export async function freezeDependentConsumableUsage(tx: Prisma.TransactionClient, productId: string) {
  const services = new Set((await tx.serviceLinkedProduct.findMany({ where: { productId }, select: { serviceId: true } })).map(link => link.serviceId));
  const products = new Set((await tx.productLinkedProduct.findMany({ where: { productId }, select: { sourceProductId: true } })).map(link => link.sourceProductId));
  const options = await tx.consumableRuleOption.findMany({ where: { productId }, select: { rule: { select: { products: { select: { productId: true } }, services: { select: { serviceId: true } } } } } });
  for (const option of options) { for (const link of option.rule.products) products.add(link.productId); for (const link of option.rule.services) services.add(link.serviceId); }
  for (const serviceId of services) await freezeConsumableUsage(tx, { serviceId });
  for (const sourceProductId of products) await freezeConsumableUsage(tx, { productId: sourceProductId });
}
