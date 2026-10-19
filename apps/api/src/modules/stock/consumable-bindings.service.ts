import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConsumableAmountDto, ConsumableBindingDto, ConsumableSetDto } from './dto/consumable-binding.dto';
import { freezeConsumableUsage } from './linked-consumables';
import { toStockQuantity, unitsNeedConversion } from './stock-units';
const materialSelect = { id: true, title: true, isActive: true, stockUnit: true, writeOffUnit: true, packageQuantity: true } as const;
const linksInclude = { product: { select: materialSelect } } as const;
const ruleInclude = { rule: { include: { options: { include: linksInclude } } } } as const;
const sourceInclude = { linkedProducts: { include: linksInclude }, consumableRules: { include: ruleInclude } } as const;
const setInclude = { options: { include: linksInclude, orderBy: { minValue: 'asc' as const } }, services: { include: { service: { select: { id: true, title: true, isActive: true } } } }, products: { include: { product: { select: { id: true, title: true, isActive: true } } } } } as const;

@Injectable()
export class ConsumableBindingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  listSets() { return this.prisma.consumableRule.findMany({ where: { inputKind: 'FIXED', isActive: true }, orderBy: { title: 'asc' }, include: setInclude }); }
  private async materials(tx: Prisma.TransactionClient, items: ConsumableAmountDto[]) {
    if (new Set(items.map(i => i.productId)).size !== items.length) throw new BadRequestException('Один расходный товар нельзя добавить дважды');
    const products = await tx.product.findMany({ where: { id: { in: items.map(i => i.productId) }, isActive: true }, select: materialSelect });
    if (products.length !== items.length) throw new BadRequestException('Расходный товар удалён или недоступен');
    for (const p of products) if (!p.stockUnit || (unitsNeedConversion(p.stockUnit, p.writeOffUnit) && !p.packageQuantity?.gt(0))) throw new BadRequestException(`Настройте единицы учёта и списания товара «${p.title}»`);
    for (const item of items) {
      const p = products.find(p => p.id === item.productId)!;
      const physical = toStockQuantity(p, item.quantity);
      if (!physical.gt(0) || !physical.eq(physical.toDecimalPlaces(3))) throw new BadRequestException(`Норма товара «${p.title}» слишком мала или неточна для складской единицы «${p.stockUnit}». Используйте более мелкую единицу складского учёта (мл или тест)`);
    }
    return new Map(products.map(p => [p.id, p]));
  }
  private async sources(tx: Prisma.TransactionClient, kind: 'SERVICE' | 'PRODUCT', ids: string[]) {
    const rows: any[] = kind === 'SERVICE'
      ? await tx.service.findMany({ where: { id: { in: ids }, isActive: true }, include: sourceInclude })
      : await tx.product.findMany({ where: { id: { in: ids }, isActive: true }, include: sourceInclude });
    if (rows.length !== ids.length) throw new BadRequestException('Одна из выбранных услуг или товаров удалена. Обновите список');
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  }
  private async prepare(tx: Prisma.TransactionClient, dto: ConsumableBindingDto) {
    const materials = await this.materials(tx, dto.items);
    const rows = await this.sources(tx, dto.targetKind, dto.targetIds);
    const changes = rows.map(row => {
      const before: ConsumableAmountDto[] = row.linkedProducts.filter((p: any) => p.minDoseMl == null).map((p: any) => ({ productId: p.productId, quantity: Number(p.quantity) })).sort((a: ConsumableAmountDto,b: ConsumableAmountDto) => a.productId.localeCompare(b.productId));
      if (dto.targetKind === 'PRODUCT' && dto.items.some(i => i.productId === row.id)) throw new BadRequestException('Товар нельзя привязать к самому себе');
      if (row.linkedProducts.some((p: any) => p.minDoseMl != null && dto.items.some(i => i.productId === p.productId))) throw new BadRequestException('Этот товар уже используется в выборе шприца по объёму');
      const inherited = row.consumableRules.flatMap((link: any) => link.rule.options.map((o: any) => o.productId));
      if (dto.items.some(i => inherited.includes(i.productId))) throw new BadRequestException(`У «${row.title}» этот расходник уже задаётся общим набором или правилом шприцев. Измените общее правило`);
      const amounts = new Map((dto.mode === 'MERGE' ? before : []).map(i => [i.productId, i]));
      for (const item of dto.items) amounts.set(item.productId, item);
      if (amounts.size > 20) throw new BadRequestException(`У «${row.title}» получилось больше 20 прямых расходников`);
      const after = [...amounts.values()].sort((a,b) => a.productId.localeCompare(b.productId));
      const describe = (items: ConsumableAmountDto[]) => items.map(i => ({ ...i, title: materials.get(i.productId)?.title ?? row.linkedProducts.find((p: any) => p.productId === i.productId)?.product.title, unit: materials.get(i.productId)?.writeOffUnit ?? row.linkedProducts.find((p: any) => p.productId === i.productId)?.product.writeOffUnit }));
      return { id: row.id, title: row.title, before: describe(before), after: describe(after), sharedSets: row.consumableRules.map((link: any) => link.rule.title).sort() };
    });
    const token = createHash('sha256').update(JSON.stringify({ kind: dto.targetKind, mode: dto.mode, changes, rules: rows.map(row => row.consumableRules.map((l: any) => ({ id: l.rule.id, updatedAt: l.rule.updatedAt })).sort((a: any,b: any) => a.id.localeCompare(b.id))) })).digest('hex');
    return { changes, previewToken: token };
  }
  preview(dto: ConsumableBindingDto) { return this.prisma.$transaction(tx => this.prepare(tx, dto)); }
  async apply(dto: ConsumableBindingDto, actorId: string) {
    return this.write(async tx => {
      const preview = await this.prepare(tx, dto);
      if (!dto.previewToken || dto.previewToken !== preview.previewToken) throw new ConflictException('Настройки изменились. Заново проверьте изменения перед применением');
      for (const change of preview.changes) {
        const source = dto.targetKind === 'SERVICE' ? { serviceId: change.id } : { productId: change.id };
        await freezeConsumableUsage(tx, source);
        if (dto.targetKind === 'SERVICE') {
          await tx.serviceLinkedProduct.deleteMany({ where: { serviceId: change.id } });
          if (change.after.length) await tx.serviceLinkedProduct.createMany({ data: change.after.map(i => ({ serviceId: change.id, productId: i.productId, quantity: i.quantity })) });
        } else {
          // Keep legacy syringe dose bands; only fixed links are edited here.
          await tx.productLinkedProduct.deleteMany({ where: { sourceProductId: change.id, minDoseMl: null } });
          if (change.after.length) await tx.productLinkedProduct.createMany({ data: change.after.map(i => ({ sourceProductId: change.id, productId: i.productId, quantity: i.quantity })) });
        }
      }
      await this.audit.log({ actorId, action: 'stock.consumable-bindings.apply', entityType: 'ConsumableBinding', metadata: { targetKind: dto.targetKind, mode: dto.mode, changes: preview.changes } }, tx);
      return { applied: preview.changes.length };
    });
  }
  async saveSet(id: string | null, dto: ConsumableSetDto, actorId: string) {
    return this.write(async tx => {
      await this.materials(tx, dto.items);
      await this.sources(tx, 'SERVICE', dto.serviceIds); const targetProducts = await this.sources(tx, 'PRODUCT', dto.productIds);
      if (targetProducts.some(p => p.linkedProducts.some((link: any) => link.minDoseMl != null && dto.items.some(i => i.productId === link.productId)))) throw new BadRequestException('Расходник уже используется в выборе шприца по объёму');
      if (dto.items.some(i => dto.productIds.includes(i.productId))) throw new BadRequestException('Товар набора нельзя одновременно выбрать его расходником');
      const old = id ? await tx.consumableRule.findFirst({ where: { id, inputKind: 'FIXED', isActive: true }, include: setInclude }) : null;
      if (id && !old) throw new NotFoundException('Набор не найден');
      if (old && old.updatedAt.toISOString() !== dto.expectedUpdatedAt) throw new ConflictException('Набор изменён другим сотрудником. Откройте его заново');
      const conflict = await tx.consumableRuleOption.findFirst({ where: { productId: { in: dto.items.map(i => i.productId) }, rule: { id: { not: id ?? '' }, isActive: true, OR: [{ services: { some: { serviceId: { in: dto.serviceIds } } } }, { products: { some: { productId: { in: dto.productIds } } } }] } } });
      if (conflict) throw new BadRequestException('Один из расходников уже подключён к выбранной позиции другим общим правилом. Уберите пересечение');
      const services = [...new Set([...(old?.services.map(s => s.serviceId) ?? []), ...dto.serviceIds])];
      const products = [...new Set([...(old?.products.map(p => p.productId) ?? []), ...dto.productIds])];
      for (const serviceId of services) await freezeConsumableUsage(tx, { serviceId });
      for (const productId of products) await freezeConsumableUsage(tx, { productId });
      const options = dto.items.map((item, index) => ({ ...item, minValue: index, maxValue: index + 1 }));
      const data = { title: dto.title.trim(), options: { create: options }, services: { create: dto.serviceIds.map(serviceId => ({ serviceId })) }, products: { create: dto.productIds.map(productId => ({ productId })) } };
      if (!data.title) throw new BadRequestException('Укажите название набора');
      const saved = old
        ? await tx.consumableRule.update({ where: { id: old.id }, data: { ...data, options: { deleteMany: {}, create: options }, services: { deleteMany: {}, ...data.services }, products: { deleteMany: {}, ...data.products } }, include: setInclude })
        : await tx.consumableRule.create({ data: { code: 'FIXED_' + randomUUID(), inputKind: 'FIXED', ...data }, include: setInclude });
      // Shared definition replaces the same direct SKU; unrelated links stay in place.
      if (dto.serviceIds.length) await tx.serviceLinkedProduct.deleteMany({ where: { serviceId: { in: dto.serviceIds }, productId: { in: dto.items.map(i => i.productId) } } });
      if (dto.productIds.length) await tx.productLinkedProduct.deleteMany({ where: { sourceProductId: { in: dto.productIds }, productId: { in: dto.items.map(i => i.productId) } } });
      await this.audit.log({ actorId, action: 'stock.consumable-set.save', entityType: 'ConsumableRule', entityId: saved.id, metadata: { title: saved.title, serviceIds: dto.serviceIds, productIds: dto.productIds, before: old ? JSON.parse(JSON.stringify(old)) : null, items: dto.items.map(i => ({ ...i })) } }, tx);
      return saved;
    });
  }
  async archiveSet(id: string, expectedUpdatedAt: string, actorId: string) {
    return this.write(async tx => {
      const old = await tx.consumableRule.findFirst({ where: { id, inputKind: 'FIXED', isActive: true }, include: setInclude });
      if (!old) throw new NotFoundException('Набор не найден');
      if (old.updatedAt.toISOString() !== expectedUpdatedAt) throw new ConflictException('Набор изменён. Обновите список');
      for (const s of old.services) await freezeConsumableUsage(tx, { serviceId: s.serviceId });
      for (const p of old.products) await freezeConsumableUsage(tx, { productId: p.productId });
      await tx.serviceConsumableRule.deleteMany({ where: { ruleId: id } }); await tx.productConsumableRule.deleteMany({ where: { ruleId: id } });
      await tx.consumableRule.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({ actorId, action: 'stock.consumable-set.archive', entityType: 'ConsumableRule', entityId: id, metadata: { title: old.title } }, tx);
      return { archived: true };
    });
  }
  private async write<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try { return await this.prisma.$transaction(work, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(error.code)) throw new ConflictException('Одновременное изменение настроек. Обновите предварительный просмотр'); throw error; }
  }
}
