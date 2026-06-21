import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCashboxDto } from './dto/upsert-cashbox.dto';
import { UpsertPaymentMethodDto } from './dto/upsert-payment-method.dto';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getSettings() {
    const [paymentMethods, cashboxes, offices] = await this.prisma.$transaction([
      this.prisma.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
      this.prisma.cashbox.findMany({
        orderBy: [{ isActive: 'desc' }, { title: 'asc' }],
        include: { office: { select: { id: true, name: true } } },
      }),
      this.prisma.clinicOffice.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    ]);

    return { paymentMethods, cashboxes, offices };
  }

  async createPaymentMethod(dto: UpsertPaymentMethodDto, actorId: string) {
    try {
      const method = await this.prisma.paymentMethod.create({
        data: {
          title: requiredTitle(dto.title, 'Укажите название способа оплаты'),
          type: dto.type,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      await this.auditService.log({
        actorId,
        action: 'finance.payment_method.create',
        entityType: 'PaymentMethod',
        entityId: method.id,
        metadata: { title: method.title, type: method.type },
      });

      return method;
    } catch (error) {
      handleUniqueError(error, 'Способ оплаты с таким названием уже есть');
    }
  }

  async updatePaymentMethod(paymentMethodId: string, dto: UpsertPaymentMethodDto, actorId: string) {
    await this.ensurePaymentMethodExists(paymentMethodId);

    try {
      const method = await this.prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: {
          title: requiredTitle(dto.title, 'Укажите название способа оплаты'),
          type: dto.type,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      await this.auditService.log({
        actorId,
        action: 'finance.payment_method.update',
        entityType: 'PaymentMethod',
        entityId: method.id,
        metadata: { title: method.title, type: method.type, isActive: method.isActive },
      });

      return method;
    } catch (error) {
      handleUniqueError(error, 'Способ оплаты с таким названием уже есть');
    }
  }

  async createCashbox(dto: UpsertCashboxDto, actorId: string) {
    const officeId = await this.resolveOfficeId(dto.officeId);

    try {
      const cashbox = await this.prisma.cashbox.create({
        data: {
          officeId,
          title: requiredTitle(dto.title, 'Укажите название кассы'),
          fiscalNumber: emptyToNull(dto.fiscalNumber),
          isActive: dto.isActive ?? true,
        },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'finance.cashbox.create',
        entityType: 'Cashbox',
        entityId: cashbox.id,
        metadata: { title: cashbox.title, officeId: cashbox.officeId },
      });

      return cashbox;
    } catch (error) {
      handleUniqueError(error, 'Касса с таким названием уже есть в филиале');
    }
  }

  async updateCashbox(cashboxId: string, dto: UpsertCashboxDto, actorId: string) {
    await this.ensureCashboxExists(cashboxId);
    const officeId = await this.resolveOfficeId(dto.officeId);

    try {
      const cashbox = await this.prisma.cashbox.update({
        where: { id: cashboxId },
        data: {
          officeId,
          title: requiredTitle(dto.title, 'Укажите название кассы'),
          fiscalNumber: emptyToNull(dto.fiscalNumber),
          isActive: dto.isActive ?? true,
        },
        include: { office: { select: { id: true, name: true } } },
      });

      await this.auditService.log({
        actorId,
        action: 'finance.cashbox.update',
        entityType: 'Cashbox',
        entityId: cashbox.id,
        metadata: { title: cashbox.title, officeId: cashbox.officeId, isActive: cashbox.isActive },
      });

      return cashbox;
    } catch (error) {
      handleUniqueError(error, 'Касса с таким названием уже есть в филиале');
    }
  }

  async resolvePaymentSettings(paymentMethodId?: string, cashboxId?: string) {
    const paymentMethod = paymentMethodId ? await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } }) : null;
    const cashbox = cashboxId ? await this.prisma.cashbox.findUnique({ where: { id: cashboxId } }) : null;

    if (paymentMethodId && (!paymentMethod || !paymentMethod.isActive)) {
      throw new NotFoundException('Активный способ оплаты не найден');
    }

    if (cashboxId && (!cashbox || !cashbox.isActive)) {
      throw new NotFoundException('Активная касса не найдена');
    }

    return {
      paymentMethodId: paymentMethod?.id,
      cashboxId: cashbox?.id,
      type: paymentMethod?.type,
    };
  }

  async getDefaultBillDueAt() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { defaultBillDueDays: true },
    });
    const days = organization?.defaultBillDueDays;

    if (!days || days <= 0) {
      return null;
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + days);
    dueAt.setHours(23, 59, 59, 999);
    return dueAt;
  }

  private async ensurePaymentMethodExists(paymentMethodId: string) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId }, select: { id: true } });

    if (!method) {
      throw new NotFoundException('Способ оплаты не найден');
    }
  }

  private async ensureCashboxExists(cashboxId: string) {
    const cashbox = await this.prisma.cashbox.findUnique({ where: { id: cashboxId }, select: { id: true } });

    if (!cashbox) {
      throw new NotFoundException('Касса не найдена');
    }
  }

  private async resolveOfficeId(officeId?: string) {
    if (!officeId) {
      return null;
    }

    const office = await this.prisma.clinicOffice.findUnique({ where: { id: officeId }, select: { id: true } });

    if (!office) {
      throw new NotFoundException('Филиал не найден');
    }

    return office.id;
  }
}

function requiredTitle(value: string, message: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new BadRequestException(message);
  }

  return normalized;
}

function emptyToNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function handleUniqueError(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new BadRequestException(message);
  }

  throw error;
}

export function resolvePaymentType(fallbackType: PaymentType, paymentMethodType?: PaymentType) {
  return paymentMethodType ?? fallbackType;
}
