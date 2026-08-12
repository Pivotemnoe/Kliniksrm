import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillSource, PaymentStatus, PaymentType, Prisma, StockMovementType } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../prisma/prisma.service';
import { toStockQuantity } from '../stock/stock-units';
import { resolveServiceUnitPrice, servicePricingSelect } from '../stock/service-pricing';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AddBillItemDto } from './dto/add-bill-item.dto';
import { BulkBillIdsDto, BulkPayBillsDto } from './dto/bulk-bills.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { BillAmountFilter, ListBillsQueryDto } from './dto/list-bills-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { UpdateBillItemDto } from './dto/update-bill-item.dto';

type WarehouseScope = string[] | null;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
    private readonly financeService: FinanceService,
  ) {}

  async listBills(query: ListBillsQueryDto) {
    if (query.debtOnly === 'true') {
      return this.listBillAlerts(query);
    }

    const { limit, offset } = parsePagination(query);
    const where = buildBillWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: billListInclude,
        skip: offset,
        take: limit,
      }),
      this.prisma.bill.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  async listBillAlerts(query: ListBillsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where = buildBillWhere(query, { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] });

    const bills = await this.prisma.bill.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: billListInclude,
    });
    const alerts = bills.filter((bill) => decimal(bill.totalAmount).minus(bill.paidAmount).greaterThan(0));
    const totalDebt = alerts.reduce((sum, bill) => sum.plus(decimal(bill.totalAmount).minus(bill.paidAmount)), decimal(0));
    const now = new Date();
    const overdueAlerts = alerts.filter((bill) => bill.dueAt && bill.dueAt < now);
    const overdueDebt = overdueAlerts.reduce((sum, bill) => sum.plus(decimal(bill.totalAmount).minus(bill.paidAmount)), decimal(0));

    return {
      items: alerts.slice(offset, offset + limit),
      total: alerts.length,
      totalDebt,
      overdueTotal: overdueAlerts.length,
      overdueDebt,
      limit,
      offset,
    };
  }

  async listBillSelection(query: ListBillsQueryDto) {
    const statusOverride: Prisma.EnumPaymentStatusFilter | undefined = query.debtOnly === 'true'
      ? { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] }
      : query.status
        ? undefined
        : { notIn: [PaymentStatus.CANCELLED, PaymentStatus.PAID] };
    const candidates = await this.prisma.bill.findMany({
      where: buildBillWhere(query, statusOverride),
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, totalAmount: true, paidAmount: true },
      take: maxBulkBills + 1,
    });
    const items = candidates.filter((bill) => {
      const debt = decimal(bill.totalAmount).minus(bill.paidAmount);
      if (query.debtOnly === 'true' && debt.lessThanOrEqualTo(0)) return false;
      const cancellable = bill.status !== PaymentStatus.CANCELLED && decimal(bill.paidAmount).lessThanOrEqualTo(0);
      const payable = bill.status !== PaymentStatus.CANCELLED && debt.greaterThan(0);
      return cancellable || payable;
    });

    if (items.length > maxBulkBills) {
      throw new BadRequestException(`Найдено больше ${maxBulkBills} счетов. Уточните фильтры перед массовым действием`);
    }

    return { items, total: items.length };
  }

  async createBill(dto: CreateBillDto, actorId: string) {
    const data = await this.resolveBillCreationData(dto);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : await this.financeService.getDefaultBillDueAt();

    const bill = await this.prisma.bill.create({
      data: {
        ownerId: data.ownerId,
        animalId: data.animalId,
        visitId: data.visitId,
        source: data.visitId ? BillSource.VISIT : BillSource.MANUAL,
        status: PaymentStatus.UNPAID,
        dueAt,
      },
      include: billInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'bill.create',
      entityType: 'Bill',
      entityId: bill.id,
      metadata: { ownerId: bill.ownerId, animalId: bill.animalId, visitId: bill.visitId, source: bill.source, dueAt: bill.dueAt },
    });

    return bill;
  }

  async getBill(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: billInclude,
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  async updateBill(billId: string, dto: UpdateBillDto, actorId: string) {
    await this.getExistingBill(billId);

    const bill = await this.prisma.bill.update({
      where: { id: billId },
      data: {
        ...(dto.dueAt !== undefined ? { dueAt: dto.dueAt ? new Date(dto.dueAt) : null } : {}),
      },
      include: billInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'bill.update',
      entityType: 'Bill',
      entityId: billId,
      metadata: { changedFields: Object.keys(dto), dueAt: bill.dueAt },
    });

    return bill;
  }

  async cancelBill(billId: string, actorId: string) {
    const updatedBill = await this.prisma.$transaction(async (tx) => {
      const bill = await this.getBillForUpdate(tx, billId);

      if (decimal(bill.paidAmount).greaterThan(0)) {
        throw new BadRequestException('Paid bill cannot be cancelled before refund');
      }

      await this.restoreBillProductItems(tx, bill);

      return tx.bill.update({
        where: { id: billId },
        data: { status: PaymentStatus.CANCELLED },
        include: billInclude,
      });
    });

    await this.auditService.log({
      actorId,
      action: 'bill.cancel',
      entityType: 'Bill',
      entityId: billId,
    });

    return updatedBill;
  }

  async bulkCancelBills(dto: BulkBillIdsDto, actorId: string) {
    const billIds = dto.billIds;
    await this.prisma.$transaction(async (tx) => {
      await this.lockBillsForUpdate(tx, billIds);
      const bills = await tx.bill.findMany({
        where: { id: { in: billIds } },
        select: billStockContextSelect,
      });
      const billsById = new Map(bills.map((bill) => [bill.id, bill]));

      for (const billId of billIds) {
        const bill = billsById.get(billId);
        if (!bill) throw new NotFoundException(`Счёт ${billId.slice(0, 8)} не найден`);
        if (bill.status === PaymentStatus.CANCELLED) {
          throw new BadRequestException(`Счёт ${billId.slice(0, 8)} уже отменён`);
        }
        if (decimal(bill.paidAmount).greaterThan(0)) {
          throw new BadRequestException(`Счёт ${billId.slice(0, 8)} имеет оплату и не может быть отменён`);
        }
      }

      for (const billId of billIds) {
        await this.restoreBillProductItems(tx, billsById.get(billId)!);
      }
      await tx.bill.updateMany({
        where: { id: { in: billIds } },
        data: { status: PaymentStatus.CANCELLED },
      });
    });

    await this.auditService.log({
      actorId,
      action: 'bill.bulk_cancel',
      entityType: 'Bill',
      entityId: billIds[0],
      metadata: { count: billIds.length, billIds },
    });
    return { count: billIds.length, billIds };
  }

  async bulkPayBills(dto: BulkPayBillsDto, actorId: string) {
    const billIds = dto.billIds;
    const warehouseScope = await this.getWarehouseScope(actorId);
    const paymentSettings = await this.financeService.resolvePaymentSettings(dto.paymentMethodId, dto.cashboxId);
    const paymentType = paymentSettings.type ?? dto.type;
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockBillsForUpdate(tx, billIds);
      const bills = await tx.bill.findMany({
        where: { id: { in: billIds } },
        select: billStockContextSelect,
      });
      const billsById = new Map(bills.map((bill) => [bill.id, bill]));

      for (const billId of billIds) {
        const bill = billsById.get(billId);
        if (!bill) throw new NotFoundException(`Счёт ${billId.slice(0, 8)} не найден`);
        assertBillCanBePaid(bill, billId);
      }

      const payments: Array<{ id: string; billId: string; amount: Prisma.Decimal }> = [];
      let totalAmount = decimal(0);
      for (const billId of billIds) {
        const bill = billsById.get(billId)!;
        const amount = decimal(bill.totalAmount).minus(bill.paidAmount);
        if (paymentType === PaymentType.DEPOSIT) {
          await this.withdrawOwnerDeposit(tx, bill, amount, billId);
        }
        const payment = await tx.payment.create({
          data: {
            billId,
            employeeId: actorId,
            paymentMethodId: paymentSettings.paymentMethodId,
            cashboxId: paymentSettings.cashboxId,
            type: paymentType,
            amount,
            paidAt,
            comment: dto.comment?.trim() || `Массовая полная оплата ${billIds.length} счетов`,
          },
          select: { id: true, billId: true, amount: true },
        });
        await this.recalculateBillTotals(tx, billId);
        const paidBill = await tx.bill.findUniqueOrThrow({
          where: { id: billId },
          select: billStockContextSelect,
        });
        await this.ensureBillProductItemsWrittenOff(tx, paidBill, warehouseScope);
        payments.push(payment);
        totalAmount = totalAmount.plus(amount);
      }
      return { payments, totalAmount };
    });

    await this.auditService.log({
      actorId,
      action: 'payment.bulk_create',
      entityType: 'Payment',
      entityId: result.payments[0]?.id ?? null,
      metadata: {
        count: result.payments.length,
        billIds,
        paymentIds: result.payments.map((payment) => payment.id),
        totalAmount: result.totalAmount.toString(),
        type: paymentType,
        paymentMethodId: paymentSettings.paymentMethodId,
        cashboxId: paymentSettings.cashboxId,
      },
    });
    return { count: result.payments.length, totalAmount: result.totalAmount, billIds };
  }

  async reopenBill(billId: string, actorId: string) {
    const bill = await this.prisma.$transaction(async (tx) => {
      await this.getBillForUpdate(tx, billId);
      await tx.bill.update({
        where: { id: billId },
        data: { status: PaymentStatus.UNPAID },
      });
      await this.recalculateBillTotals(tx, billId);
      return tx.bill.findUniqueOrThrow({ where: { id: billId }, include: billInclude });
    });

    await this.auditService.log({
      actorId,
      action: 'bill.reopen',
      entityType: 'Bill',
      entityId: billId,
      metadata: { status: bill.status },
    });

    return bill;
  }

  async addBillItem(billId: string, dto: AddBillItemDto, actorId: string) {
    const line = await this.resolveBillItemLine(dto);

    const billItem = await this.prisma.$transaction(async (tx) => {
      await this.ensureBillCanBeEdited(tx, billId);

      const createdBillItem = await tx.billItem.create({
        data: {
          billId,
          serviceId: line.serviceId,
          productId: line.productId,
          title: line.title,
          quantity: line.quantity,
          stockQuantity: line.stockQuantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          totalAmount: line.totalAmount,
        },
      });

      await this.recalculateBillTotals(tx, billId);

      return createdBillItem;
    });

    await this.auditService.log({
      actorId,
      action: 'bill_item.create',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { billId, title: billItem.title, totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async updateBillItem(billId: string, billItemId: string, dto: UpdateBillItemDto, actorId: string) {
    const billItem = await this.prisma.$transaction(async (tx) => {
      await this.ensureBillCanBeEdited(tx, billId);
      const existingBillItem = await this.getBillItem(tx, billId, billItemId);
      ensureBillItemIsNotHospitalRecord(existingBillItem);
      await this.restoreCurrentBillItemWriteOff(tx, billItemId, existingBillItem.title);
      const serviceUnitPrice = existingBillItem.serviceId && dto.unitPrice !== undefined
        ? resolveServiceUnitPrice(
            await tx.service.findUniqueOrThrow({ where: { id: existingBillItem.serviceId }, select: servicePricingSelect }),
            dto.unitPrice,
          )
        : dto.unitPrice;
      const line = calculateBillItemLine({
        serviceId: existingBillItem.serviceId ?? undefined,
        productId: existingBillItem.productId ?? undefined,
        title: dto.title ?? existingBillItem.title,
        quantity: dto.quantity ?? decimalToNumber(existingBillItem.quantity),
        stockQuantity:
          dto.stockQuantity ??
          (existingBillItem.stockQuantity === null ? decimalToNumber(existingBillItem.quantity) : decimalToNumber(existingBillItem.stockQuantity)),
        unitPrice: serviceUnitPrice ?? decimalToNumber(existingBillItem.unitPrice),
        discount: dto.discount ?? decimalToNumber(existingBillItem.discount),
      });

      const updatedBillItem = await tx.billItem.update({
        where: { id: billItemId },
        data: {
          title: line.title,
          quantity: line.quantity,
          stockQuantity: line.stockQuantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          totalAmount: line.totalAmount,
        },
      });

      await this.recalculateBillTotals(tx, billId);

      return updatedBillItem;
    });

    await this.auditService.log({
      actorId,
      action: 'bill_item.update',
      entityType: 'BillItem',
      entityId: billItem.id,
      metadata: { billId, changedFields: Object.keys(dto), totalAmount: billItem.totalAmount },
    });

    return billItem;
  }

  async deleteBillItem(billId: string, billItemId: string, actorId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.ensureBillCanBeEdited(tx, billId);
      const billItem = await this.getBillItem(tx, billId, billItemId);
      ensureBillItemIsNotHospitalRecord(billItem);
      await this.restoreCurrentBillItemWriteOff(tx, billItemId);
      await tx.billItem.delete({ where: { id: billItemId } });
      await this.recalculateBillTotals(tx, billId);
    });

    await this.auditService.log({
      actorId,
      action: 'bill_item.delete',
      entityType: 'BillItem',
      entityId: billItemId,
      metadata: { billId },
    });

    return { deleted: true };
  }

  async listPayments(billId: string) {
    await this.getExistingBill(billId);

    return this.prisma.payment.findMany({
      where: { billId },
      orderBy: { paidAt: 'desc' },
      include: {
        employee: {
          select: { id: true, fullName: true, position: true },
        },
        paymentMethod: true,
        cashbox: {
          include: { office: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async createPayment(billId: string, dto: CreatePaymentDto, actorId: string) {
    const amount = decimal(dto.amount);
    const warehouseScope = await this.getWarehouseScope(actorId);
    const paymentSettings = await this.financeService.resolvePaymentSettings(dto.paymentMethodId, dto.cashboxId);
    const paymentType = paymentSettings.type ?? dto.type;

    const payment = await this.prisma.$transaction(async (tx) => {
      const bill = await this.ensureBillCanBePaid(tx, billId);
      const remainingAmount = decimal(bill.totalAmount).minus(bill.paidAmount);

      if (amount.greaterThan(remainingAmount)) {
        throw new BadRequestException('Payment amount is greater than bill debt');
      }

      if (paymentType === PaymentType.DEPOSIT) {
        await this.withdrawOwnerDeposit(tx, bill, amount, billId);
      }

      const createdPayment = await tx.payment.create({
        data: {
          billId,
          employeeId: actorId,
          paymentMethodId: paymentSettings.paymentMethodId,
          cashboxId: paymentSettings.cashboxId,
          type: paymentType,
          amount,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          comment: dto.comment,
        },
      });

      await this.recalculateBillTotals(tx, billId);

      const updatedBill = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        select: billStockContextSelect,
      });
      if (updatedBill.status === PaymentStatus.PAID) {
        await this.ensureBillProductItemsWrittenOff(tx, updatedBill, warehouseScope);
      }

      return createdPayment;
    });

    await this.auditService.log({
      actorId,
      action: 'payment.create',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { billId, amount: payment.amount, type: payment.type, paymentMethodId: payment.paymentMethodId, cashboxId: payment.cashboxId },
    });

    return payment;
  }

  async refundPayment(billId: string, paymentId: string, dto: RefundPaymentDto, actorId: string) {
    const refundPayment = await this.prisma.$transaction(async (tx) => {
      const bill = await this.getBillForUpdate(tx, billId);
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, billId },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (decimal(payment.amount).lessThanOrEqualTo(0)) {
        throw new BadRequestException('Refund can be created only for positive payment');
      }

      const refundAmount = decimal(dto.amount ?? payment.amount);

      if (refundAmount.greaterThan(decimal(bill.paidAmount))) {
        throw new BadRequestException('Refund amount is greater than paid amount');
      }

      const createdRefundPayment = await tx.payment.create({
        data: {
          billId,
          employeeId: actorId,
          paymentMethodId: payment.paymentMethodId,
          cashboxId: payment.cashboxId,
          type: payment.type,
          amount: refundAmount.negated(),
          comment: dto.comment ?? `Refund for payment ${payment.id}`,
        },
      });

      if (payment.type === PaymentType.DEPOSIT) {
        await this.restoreOwnerDeposit(tx, bill, refundAmount, billId);
      }

      await this.recalculateBillTotals(tx, billId);

      const updatedBill = await tx.bill.findUniqueOrThrow({
        where: { id: billId },
        select: billStockContextSelect,
      });
      if (updatedBill.status !== PaymentStatus.PAID) {
        await this.restoreBillProductItems(tx, updatedBill);
      }

      return createdRefundPayment;
    });

    await this.auditService.log({
      actorId,
      action: 'payment.refund',
      entityType: 'Payment',
      entityId: refundPayment.id,
      metadata: { billId, paymentId, amount: refundPayment.amount },
    });

    return refundPayment;
  }

  private async resolveBillCreationData(dto: CreateBillDto): Promise<BillCreationData> {
    if (dto.visitId) {
      const visit = await this.prisma.visit.findUnique({
        where: { id: dto.visitId },
        select: { id: true, ownerId: true, animalId: true, bill: { select: { id: true } } },
      });

      if (!visit) {
        throw new NotFoundException('Visit not found');
      }

      if (visit.bill) {
        throw new BadRequestException('Visit already has a bill');
      }

      return { ownerId: visit.ownerId, animalId: visit.animalId, visitId: visit.id };
    }

    if (!dto.ownerId) {
      throw new BadRequestException('Manual bill must have owner');
    }

    await this.schedulingService.ensureOwnerExists(dto.ownerId);

    if (dto.animalId) {
      const ownerId = await this.schedulingService.resolveAnimalOwner(dto.animalId, dto.ownerId);
      return { ownerId, animalId: dto.animalId };
    }

    return { ownerId: dto.ownerId };
  }

  private async resolveBillItemLine(dto: AddBillItemDto) {
    if (dto.serviceId && dto.productId) {
      throw new BadRequestException('Bill item can reference service or product, not both');
    }

    const service = dto.serviceId
      ? await this.prisma.service.findFirst({
          where: { id: dto.serviceId, isActive: true },
          select: servicePricingSelect,
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    const product = dto.productId
      ? await this.prisma.product.findFirst({
          where: { id: dto.productId, isActive: true },
          select: { id: true, title: true, retailPrice: true },
        })
      : null;

    if (dto.productId && !product) {
      throw new NotFoundException('Product not found');
    }

    return calculateBillItemLine({
      serviceId: service?.id,
      productId: product?.id,
      title: dto.title ?? service?.title ?? product?.title,
      quantity: dto.quantity ?? 1,
      stockQuantity: product ? dto.stockQuantity ?? dto.quantity ?? 1 : undefined,
      unitPrice:
        (service ? resolveServiceUnitPrice(service, dto.unitPrice) : dto.unitPrice) ??
        (product ? decimalToNumber(product.retailPrice) : 0),
      discount: dto.discount ?? 0,
    });
  }

  private async recalculateBillTotals(tx: Prisma.TransactionClient, billId: string) {
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    const totalAmount = bill.items.reduce((sum, item) => sum.plus(item.totalAmount), decimal(0));
    const paidAmount = bill.payments.reduce((sum, payment) => sum.plus(payment.amount), decimal(0));
    const status = resolvePaymentStatus(totalAmount, paidAmount, bill.status);

    await tx.bill.update({
      where: { id: billId },
      data: { totalAmount, paidAmount, status },
    });

    if (bill.visitId) {
      await tx.visit.update({
        where: { id: bill.visitId },
        data: { totalAmount },
      });
    }
  }

  private async ensureBillCanBeEdited(tx: Prisma.TransactionClient, billId: string) {
    const bill = await this.getBillForUpdate(tx, billId);

    if (bill.source === BillSource.SALE) {
      throw new BadRequestException('Позиции розничной продажи исправляются только в карточке продажи');
    }

    if (bill.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('Cancelled bill cannot be edited');
    }

    if (decimal(bill.paidAmount).greaterThan(0)) {
      throw new BadRequestException('Paid bill items cannot be edited');
    }

    return bill;
  }

  private async ensureBillCanBePaid(tx: Prisma.TransactionClient, billId: string) {
    const bill = await this.getBillForUpdate(tx, billId);

    if (bill.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('Cancelled bill cannot be paid');
    }

    if (decimal(bill.totalAmount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Bill has no amount to pay');
    }

    if (decimal(bill.paidAmount).greaterThanOrEqualTo(bill.totalAmount)) {
      throw new BadRequestException('Bill is already paid');
    }

    return bill;
  }

  private async getBillForUpdate(tx: Prisma.TransactionClient, billId: string) {
    const lockedBills = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Bill" WHERE "id" = ${billId} FOR UPDATE
    `;
    if (!lockedBills.length) {
      throw new NotFoundException('Bill not found');
    }
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        source: true,
        totalAmount: true,
        paidAmount: true,
        visitId: true,
        saleId: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  private async lockBillsForUpdate(tx: Prisma.TransactionClient, billIds: string[]) {
    for (const billId of [...billIds].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "Bill" WHERE "id" = ${billId} FOR UPDATE`;
    }
  }

  private async getExistingBill(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        source: true,
        totalAmount: true,
        paidAmount: true,
        visitId: true,
        saleId: true,
      },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  private async withdrawOwnerDeposit(
    tx: Prisma.TransactionClient,
    bill: { ownerId: string | null },
    amount: Prisma.Decimal,
    billId: string,
  ) {
    if (!bill.ownerId) {
      throw new BadRequestException('Оплата депозитом доступна только для счёта с владельцем');
    }

    const owner = await tx.owner.findUnique({
      where: { id: bill.ownerId },
      select: { id: true, balance: true },
    });

    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    if (decimal(owner.balance).lessThan(amount)) {
      throw new BadRequestException('Недостаточно средств на балансе владельца');
    }

    await tx.owner.update({
      where: { id: owner.id },
      data: { balance: { decrement: amount } },
    });

    await tx.ownerBalanceOperation.create({
      data: {
        ownerId: owner.id,
        type: PaymentType.DEPOSIT,
        amount: amount.negated(),
        comment: `Оплата счёта ${billId.slice(0, 8)} с депозита`,
      },
    });
  }

  private async restoreOwnerDeposit(
    tx: Prisma.TransactionClient,
    bill: { ownerId: string | null },
    amount: Prisma.Decimal,
    billId: string,
  ) {
    if (!bill.ownerId) {
      throw new BadRequestException('Нельзя вернуть депозитную оплату без владельца счёта');
    }

    await tx.owner.update({
      where: { id: bill.ownerId },
      data: { balance: { increment: amount } },
    });

    await tx.ownerBalanceOperation.create({
      data: {
        ownerId: bill.ownerId,
        type: PaymentType.DEPOSIT,
        amount,
        comment: `Возврат оплаты счёта ${billId.slice(0, 8)} на депозит`,
      },
    });
  }

  private async getBillItem(tx: Prisma.TransactionClient, billId: string, billItemId: string) {
    const billItem = await tx.billItem.findFirst({
      where: { id: billItemId, billId },
      include: { hospitalRecord: { select: { id: true } } },
    });

    if (!billItem) {
      throw new NotFoundException('Bill item not found');
    }

    return billItem;
  }

  private async writeOffBillProduct(
    tx: Prisma.TransactionClient,
    bill: BillStockContext,
    billItemId: string,
    line: BillItemLine,
    warehouseScope: WarehouseScope,
    quantityIsInStockUnits = false,
  ) {
    const productId = line.productId;
    const writeOffQuantity = line.stockQuantity ?? line.quantity;
    if (!productId || writeOffQuantity.lessThanOrEqualTo(0)) {
      return;
    }

    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockUnit: true, writeOffUnit: true, packageQuantity: true },
    });
    const stockQuantity = quantityIsInStockUnits ? writeOffQuantity : toStockQuantity(product, writeOffQuantity);

    const batches = await tx.stockBatch.findMany({
      where: {
        productId,
        rest: { gt: 0 },
        ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
      },
      select: { id: true, warehouseId: true, rest: true, expiresAt: true, createdAt: true },
    });
    const orderedBatches = batches.sort(compareStockBatches);
    const available = orderedBatches.reduce((sum, batch) => sum.plus(batch.rest), decimal(0));

    if (available.lessThan(stockQuantity)) {
      throw new BadRequestException(`Недостаточно остатка товара "${line.title}"`);
    }

    let remaining = stockQuantity;

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
          billItemId,
          stockBatchId: batch.id,
          warehouseId: batch.warehouseId,
          visitId: bill.visitId,
          saleId: bill.saleId,
          type: bill.visitId ? StockMovementType.VISIT_USAGE : StockMovementType.WRITE_OFF,
          quantity: quantity.negated(),
          comment: `Списание по счёту ${bill.id.slice(0, 8)}`,
        },
      });

      remaining = remaining.minus(quantity);
    }
  }

  private async syncBillProductWriteOff(
    tx: Prisma.TransactionClient,
    bill: BillStockContext,
    billItemId: string,
    line: BillItemLine,
    warehouseScope: WarehouseScope,
  ) {
    if (!line.productId) {
      return;
    }

    const product = await tx.product.findUniqueOrThrow({
      where: { id: line.productId },
      select: { stockUnit: true, writeOffUnit: true, packageQuantity: true },
    });
    const deductedQuantity = await this.getBillItemDeductedQuantity(tx, billItemId, line.productId);
    const delta = toStockQuantity(product, line.stockQuantity ?? line.quantity).minus(deductedQuantity);

    if (delta.greaterThan(0)) {
      await this.writeOffBillProduct(tx, bill, billItemId, { ...line, stockQuantity: delta }, warehouseScope, true);
    } else if (delta.lessThan(0)) {
      await this.restoreBillProduct(tx, billItemId, line.productId, line.title, delta.abs());
    }
  }

  private async ensureBillProductItemsWrittenOff(
    tx: Prisma.TransactionClient,
    bill: BillStockContext,
    warehouseScope: WarehouseScope,
  ) {
    // Розничная продажа проводит склад собственным атомарным контуром при создании.
    // Повторное проведение её счёта при оплате дублировало бы списание.
    if (bill.source === BillSource.SALE) {
      return;
    }

    const productItems = await tx.billItem.findMany({
      where: { billId: bill.id, productId: { not: null } },
      select: {
        id: true,
        productId: true,
        title: true,
        quantity: true,
        stockQuantity: true,
        unitPrice: true,
        discount: true,
        hospitalRecord: { select: { id: true } },
      },
    });

    for (const item of productItems) {
      // Выполненная запись стационара списывает фактический расход сразу и
      // управляется только журналом стационара, независимо от оплаты счёта.
      if (item.hospitalRecord) continue;
      const line = calculateBillItemLine({
        productId: item.productId ?? undefined,
        title: item.title,
        quantity: decimalToNumber(item.quantity),
        stockQuantity: item.stockQuantity === null ? decimalToNumber(item.quantity) : decimalToNumber(item.stockQuantity),
        unitPrice: decimalToNumber(item.unitPrice),
        discount: decimalToNumber(item.discount),
      });
      await this.syncBillProductWriteOff(tx, bill, item.id, line, warehouseScope);
    }
  }

  private async restoreBillProductItems(tx: Prisma.TransactionClient, bill: BillStockContext) {
    const productItems = await tx.billItem.findMany({
      where: { billId: bill.id, productId: { not: null } },
      select: { id: true, productId: true, title: true, hospitalRecord: { select: { id: true } } },
    });

    for (const item of productItems) {
      if (item.hospitalRecord) continue;
      await this.restoreCurrentBillItemWriteOff(tx, item.id, item.title);
    }
  }

  private async restoreCurrentBillItemWriteOff(tx: Prisma.TransactionClient, billItemId: string, title?: string) {
    const movements = await tx.stockMovement.findMany({
      where: {
        billItemId,
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.WRITE_OFF, StockMovementType.CORRECTION] },
      },
      distinct: ['productId'],
      select: { productId: true },
    });

    for (const movement of movements) {
      await this.restoreBillProduct(tx, billItemId, movement.productId, title ?? 'товар', await this.getBillItemDeductedQuantity(tx, billItemId, movement.productId));
    }
  }

  private async restoreBillProduct(
    tx: Prisma.TransactionClient,
    billItemId: string,
    productId: string,
    title: string,
    quantityToRestore: Prisma.Decimal.Value,
  ) {
    let remaining = decimal(quantityToRestore);
    if (remaining.lessThanOrEqualTo(0)) {
      return;
    }

    const movements = await tx.stockMovement.findMany({
      where: {
        billItemId,
        productId,
        stockBatchId: { not: null },
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.WRITE_OFF, StockMovementType.CORRECTION] },
      },
      orderBy: { createdAt: 'desc' },
      select: { stockBatchId: true, warehouseId: true, quantity: true, createdAt: true },
    });
    const restorableByBatch = new Map<string, { stockBatchId: string; warehouseId: string | null; quantity: Prisma.Decimal; createdAt: Date }>();

    for (const movement of movements) {
      if (!movement.stockBatchId) {
        continue;
      }

      const existing = restorableByBatch.get(movement.stockBatchId) ?? {
        stockBatchId: movement.stockBatchId,
        warehouseId: movement.warehouseId,
        quantity: decimal(0),
        createdAt: movement.createdAt,
      };
      existing.quantity = existing.quantity.minus(movement.quantity);
      if (movement.createdAt > existing.createdAt) {
        existing.createdAt = movement.createdAt;
      }
      restorableByBatch.set(movement.stockBatchId, existing);
    }

    const restorable = [...restorableByBatch.values()]
      .filter((item) => item.quantity.greaterThan(0))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    if (!restorable.length) {
      return;
    }

    for (const item of restorable) {
      if (remaining.lessThanOrEqualTo(0)) {
        break;
      }

      const quantity = item.quantity.lessThan(remaining) ? item.quantity : remaining;

      await tx.stockBatch.update({
        where: { id: item.stockBatchId },
        data: { rest: { increment: quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          billItemId,
          stockBatchId: item.stockBatchId,
          warehouseId: item.warehouseId,
          type: StockMovementType.CORRECTION,
          quantity,
          comment: `Возврат списания "${title}" по счёту`,
        },
      });

      remaining = remaining.minus(quantity);
    }

    if (remaining.greaterThan(0)) {
      throw new BadRequestException(`Не удалось вернуть списание товара "${title}" полностью`);
    }
  }

  private async getBillItemDeductedQuantity(tx: Prisma.TransactionClient, billItemId: string, productId: string) {
    const movements = await tx.stockMovement.findMany({
      where: {
        billItemId,
        productId,
        type: { in: [StockMovementType.VISIT_USAGE, StockMovementType.WRITE_OFF, StockMovementType.CORRECTION] },
      },
      select: { quantity: true },
    });
    const deducted = movements.reduce((sum, movement) => sum.minus(movement.quantity), decimal(0));

    return maxDecimal(deducted, decimal(0));
  }

  private async getWarehouseScope(employeeId: string): Promise<WarehouseScope> {
    const accesses = await this.prisma.employeeWarehouseAccess.findMany({
      where: { employeeId },
      select: { warehouseId: true },
    });

    return accesses.length ? accesses.map((access) => access.warehouseId) : null;
  }
}

const maxBulkBills = 1000;

const billStockContextSelect = {
  id: true,
  ownerId: true,
  status: true,
  source: true,
  totalAmount: true,
  paidAmount: true,
  visitId: true,
  saleId: true,
} satisfies Prisma.BillSelect;

export function buildBillWhere(
  query: ListBillsQueryDto,
  statusOverride?: PaymentStatus | Prisma.EnumPaymentStatusFilter,
): Prisma.BillWhereInput {
  const search = query.search?.trim();
  const status = statusOverride ?? query.status;
  return {
    ...(status ? { status } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.amount === BillAmountFilter.ZERO ? { totalAmount: { equals: 0 } } : {}),
    ...(query.amount === BillAmountFilter.POSITIVE ? { totalAmount: { gt: 0 } } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.animalId ? { animalId: query.animalId } : {}),
    ...(query.visitId ? { visitId: query.visitId } : {}),
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
}

function assertBillCanBePaid(
  bill: { status: PaymentStatus; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal },
  billId: string,
) {
  if (bill.status === PaymentStatus.CANCELLED) {
    throw new BadRequestException(`Счёт ${billId.slice(0, 8)} отменён и не может быть оплачен`);
  }
  if (decimal(bill.totalAmount).lessThanOrEqualTo(0)) {
    throw new BadRequestException(`Счёт ${billId.slice(0, 8)} имеет нулевую сумму`);
  }
  if (decimal(bill.paidAmount).greaterThanOrEqualTo(bill.totalAmount)) {
    throw new BadRequestException(`Счёт ${billId.slice(0, 8)} уже оплачен`);
  }
}

function ensureBillItemIsNotHospitalRecord(item: { hospitalRecord: { id: string } | null }) {
  if (item.hospitalRecord) {
    throw new BadRequestException('Позиция проведена в стационаре и исправляется только через журнал стационара');
  }
}

const billListInclude = {
  owner: {
    select: { id: true, fullName: true, phone: true, extraPhone: true },
  },
  animal: {
    select: { id: true, nickname: true, species: true, breed: true, sex: true, status: true },
  },
  visit: {
    select: { id: true, status: true, startedAt: true },
  },
  _count: {
    select: { items: true, payments: true },
  },
} satisfies Prisma.BillInclude;

const billInclude = {
  owner: true,
  animal: true,
  visit: {
    select: { id: true, status: true, startedAt: true, completedAt: true },
  },
  sale: {
    select: { id: true, createdAt: true, totalAmount: true },
  },
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      service: {
        select: servicePricingSelect,
      },
      product: {
        select: { id: true, title: true, retailPrice: true, stockUnit: true, writeOffUnit: true, billingUnit: true },
      },
      stockMovements: {
        orderBy: { createdAt: 'asc' },
        include: {
          stockBatch: { select: { id: true, series: true, expiresAt: true } },
          warehouse: { select: { id: true, name: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: {
      employee: {
        select: { id: true, fullName: true, position: true },
      },
      paymentMethod: true,
      cashbox: {
        include: { office: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.BillInclude;

type BillCreationData = {
  ownerId: string;
  animalId?: string;
  visitId?: string;
};

type BillStockContext = {
  id: string;
  source: BillSource;
  visitId: string | null;
  saleId: string | null;
};

function calculateBillItemLine(input: {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  stockQuantity?: number;
  unitPrice?: number;
  discount?: number;
}) {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('Bill item title is required');
  }

  const quantity = decimal(input.quantity ?? 1);
  const stockQuantity = input.productId ? decimal(input.stockQuantity ?? input.quantity ?? 1) : null;
  const unitPrice = decimal(input.unitPrice ?? 0);
  const discount = decimal(input.discount ?? 0);
  const totalAmount = maxDecimal(quantity.mul(unitPrice).minus(discount), decimal(0));

  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    stockQuantity,
    unitPrice,
    discount,
    totalAmount,
  };
}

type BillItemLine = ReturnType<typeof calculateBillItemLine>;

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

function resolvePaymentStatus(totalAmount: Prisma.Decimal, paidAmount: Prisma.Decimal, currentStatus?: PaymentStatus) {
  if (currentStatus === PaymentStatus.CANCELLED) {
    return PaymentStatus.CANCELLED;
  }

  if (totalAmount.lessThanOrEqualTo(0)) {
    return PaymentStatus.UNPAID;
  }

  if (paidAmount.greaterThanOrEqualTo(totalAmount)) {
    return PaymentStatus.PAID;
  }

  if (paidAmount.greaterThan(0)) {
    return PaymentStatus.PARTIAL;
  }

  return PaymentStatus.UNPAID;
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
