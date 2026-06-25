import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getOrganization() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      include: {
        offices: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, address: true, phone: true, timezone: true },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Организация не настроена');
    }

    return organization;
  }

  async updateOrganization(dto: UpdateOrganizationDto, actorId: string) {
    const organization = await this.getOrganization();
    const updated = await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: requiredName(dto.displayName, 'Укажите название организации') } : {}),
        ...(dto.legalName !== undefined ? { legalName: emptyToNull(dto.legalName) } : {}),
        ...(dto.orgType !== undefined ? { orgType: emptyToNull(dto.orgType) } : {}),
        ...(dto.inn !== undefined ? { inn: emptyToNull(dto.inn) } : {}),
        ...(dto.kpp !== undefined ? { kpp: emptyToNull(dto.kpp) } : {}),
        ...(dto.legalAddress !== undefined ? { legalAddress: emptyToNull(dto.legalAddress) } : {}),
        ...(dto.postalAddress !== undefined ? { postalAddress: emptyToNull(dto.postalAddress) } : {}),
        ...(dto.bankName !== undefined ? { bankName: emptyToNull(dto.bankName) } : {}),
        ...(dto.bik !== undefined ? { bik: emptyToNull(dto.bik) } : {}),
        ...(dto.account !== undefined ? { account: emptyToNull(dto.account) } : {}),
        ...(dto.corrAccount !== undefined ? { corrAccount: emptyToNull(dto.corrAccount) } : {}),
        ...(dto.defaultBillDueDays !== undefined ? { defaultBillDueDays: normalizeDefaultBillDueDays(dto.defaultBillDueDays) } : {}),
      },
      include: {
        offices: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, address: true, phone: true, timezone: true },
        },
      },
    });

    await this.auditService.log({
      actorId,
      action: 'organization.update',
      entityType: 'Organization',
      entityId: updated.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return updated;
  }
}

function requiredName(value: string, message: string) {
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

function normalizeDefaultBillDueDays(value?: number | null) {
  return value && value > 0 ? value : null;
}
