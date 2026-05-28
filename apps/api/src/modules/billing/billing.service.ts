import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillSource, PaymentStatus, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AddBillItemDto } from './dto/add-bill-item.dto';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListBillsQueryDto } from './dto/list-bills-query.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { UpdateBillItemDto } from './dto/update-bill-item.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly schedulingService: SchedulingService,
  ) {}

  async listBills(query: ListBillsQueryDto) {
    const { limit, offset } = parsePagination(query);
    const search = query.search?.trim();
    const where: Prisma.BillWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
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

  async createBill(dto: CreateBillDto, actorId: string) {
    const data = await this.resolveBillCreationData(dto);

    const bill = await this.prisma.bill.create({
      data: {
        ownerId: data.ownerId,
        animalId: data.animalId,
        visitId: data.visitId,
        source: data.visitId ? BillSource.VISIT : BillSource.MANUAL,
        status: PaymentStatus.UNPAID,
      },
      include: billInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'bill.create',
      entityType: 'Bill',
      entityId: bill.id,
      metadata: { ownerId: bill.ownerId, animalId: bill.animalId, visitId: bill.visitId, source: bill.source },
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

  async cancelBill(billId: string, actorId: string) {
    const bill = await this.getExistingBill(billId);

    if (decimal(bill.paidAmount).greaterThan(0)) {
      throw new BadRequestException('Paid bill cannot be cancelled before refund');
    }

    const updatedBill = await this.prisma.bill.update({
      where: { id: billId },
      data: { status: PaymentStatus.CANCELLED },
      include: billInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'bill.cancel',
      entityType: 'Bill',
      entityId: billId,
    });

    return updatedBill;
  }

  async reopenBill(billId: string, actorId: string) {
    await this.getExistingBill(billId);

    const bill = await this.prisma.$transaction(async (tx) => {
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
      const line = calculateBillItemLine({
        title: dto.title ?? existingBillItem.title,
        quantity: dto.quantity ?? decimalToNumber(existingBillItem.quantity),
        unitPrice: dto.unitPrice ?? decimalToNumber(existingBillItem.unitPrice),
        discount: dto.discount ?? decimalToNumber(existingBillItem.discount),
      });

      const updatedBillItem = await tx.billItem.update({
        where: { id: billItemId },
        data: {
          title: line.title,
          quantity: line.quantity,
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
      await this.getBillItem(tx, billId, billItemId);
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
      },
    });
  }

  async createPayment(billId: string, dto: CreatePaymentDto, actorId: string) {
    const amount = decimal(dto.amount);

    const payment = await this.prisma.$transaction(async (tx) => {
      const bill = await this.ensureBillCanBePaid(tx, billId);
      const remainingAmount = decimal(bill.totalAmount).minus(bill.paidAmount);

      if (amount.greaterThan(remainingAmount)) {
        throw new BadRequestException('Payment amount is greater than bill debt');
      }

      const createdPayment = await tx.payment.create({
        data: {
          billId,
          employeeId: actorId,
          type: dto.type,
          amount,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          comment: dto.comment,
        },
      });

      await this.recalculateBillTotals(tx, billId);

      return createdPayment;
    });

    await this.auditService.log({
      actorId,
      action: 'payment.create',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { billId, amount: payment.amount, type: payment.type },
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
          type: payment.type,
          amount: refundAmount.negated(),
          comment: dto.comment ?? `Refund for payment ${payment.id}`,
        },
      });

      await this.recalculateBillTotals(tx, billId);

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
      ? await this.prisma.service.findUnique({
          where: { id: dto.serviceId },
          select: { id: true, title: true, price: true },
        })
      : null;

    if (dto.serviceId && !service) {
      throw new NotFoundException('Service not found');
    }

    const product = dto.productId
      ? await this.prisma.product.findUnique({
          where: { id: dto.productId },
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
      unitPrice:
        dto.unitPrice ??
        (service ? decimalToNumber(service.price) : undefined) ??
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
    const bill = await tx.bill.findUnique({
      where: { id: billId },
      select: { id: true, status: true, totalAmount: true, paidAmount: true, visitId: true },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  private async getExistingBill(billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      select: { id: true, status: true, totalAmount: true, paidAmount: true, visitId: true },
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return bill;
  }

  private async getBillItem(tx: Prisma.TransactionClient, billId: string, billItemId: string) {
    const billItem = await tx.billItem.findFirst({
      where: { id: billItemId, billId },
    });

    if (!billItem) {
      throw new NotFoundException('Bill item not found');
    }

    return billItem;
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
        select: { id: true, title: true, price: true },
      },
      product: {
        select: { id: true, title: true, retailPrice: true },
      },
    },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: {
      employee: {
        select: { id: true, fullName: true, position: true },
      },
    },
  },
} satisfies Prisma.BillInclude;

type BillCreationData = {
  ownerId: string;
  animalId?: string;
  visitId?: string;
};

function calculateBillItemLine(input: {
  serviceId?: string;
  productId?: string;
  title?: string;
  quantity?: number;
  unitPrice?: number;
  discount?: number;
}) {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('Bill item title is required');
  }

  const quantity = decimal(input.quantity ?? 1);
  const unitPrice = decimal(input.unitPrice ?? 0);
  const discount = decimal(input.discount ?? 0);
  const totalAmount = maxDecimal(quantity.mul(unitPrice).minus(discount), decimal(0));

  return {
    serviceId: input.serviceId,
    productId: input.productId,
    title,
    quantity,
    unitPrice,
    discount,
    totalAmount,
  };
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
