import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { ObjectStorageService } from '../files/object-storage.service';
import type { UploadedFilePayload } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const maxLogoBytes = 5 * 1024 * 1024;
const allowedLogoTypes = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async getOrganization() {
    return serializeOrganization(await this.getOrganizationRecord());
  }

  async getOrganizationPrintProfile() {
    const organization = await this.getOrganizationRecord();
    return {
      id: organization.id,
      displayName: organization.displayName,
      legalName: organization.legalName,
      legalAddress: organization.legalAddress,
      offices: organization.offices,
      logoUrl: organization.logoStorageKey
        ? `/api/v1/organization/print-logo?v=${encodeURIComponent(organization.logoUpdatedAt?.toISOString() || '1')}`
        : null,
    };
  }

  async getOrganizationLogo() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { logoStorageKey: true, logoOriginalName: true, logoMimeType: true, logoSizeBytes: true },
    });
    if (!organization?.logoStorageKey || !organization.logoMimeType) {
      throw new NotFoundException('Логотип организации не загружен');
    }

    return {
      originalName: organization.logoOriginalName || 'logo',
      mimeType: organization.logoMimeType,
      sizeBytes: organization.logoSizeBytes,
      stream: await this.storage.getObject(organization.logoStorageKey),
    };
  }

  async uploadOrganizationLogo(file: UploadedFilePayload | undefined, actorId: string) {
    const validated = validateLogo(file);
    const organization = await this.getOrganizationRecord();
    const originalName = safeLogoName(validated.originalname);
    const storageKey = `organization-logo/${organization.id}/${randomUUID()}${validated.extension}`;

    await this.storage.putObject(storageKey, validated.buffer, validated.mimeType);
    let updated;
    try {
      updated = await this.prisma.organization.update({
        where: { id: organization.id },
        data: {
          logoStorageKey: storageKey,
          logoOriginalName: originalName,
          logoMimeType: validated.mimeType,
          logoSizeBytes: validated.size,
          logoUpdatedAt: new Date(),
        },
        include: organizationInclude,
      });
    } catch (error) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
      throw error;
    }

    if (organization.logoStorageKey) {
      await this.storage.removeObject(organization.logoStorageKey).catch(() => undefined);
    }
    await this.auditService.log({
      actorId,
      action: 'organization.logo_upload',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: { originalName, mimeType: validated.mimeType, sizeBytes: validated.size },
    });
    return serializeOrganization(updated);
  }

  async deleteOrganizationLogo(actorId: string) {
    const organization = await this.getOrganizationRecord();
    if (!organization.logoStorageKey) {
      return serializeOrganization(organization);
    }

    const storageKey = organization.logoStorageKey;
    const updated = await this.prisma.organization.update({
      where: { id: organization.id },
      data: {
        logoStorageKey: null,
        logoOriginalName: null,
        logoMimeType: null,
        logoSizeBytes: null,
        logoUpdatedAt: null,
      },
      include: organizationInclude,
    });
    await this.storage.removeObject(storageKey).catch(() => undefined);
    await this.auditService.log({
      actorId,
      action: 'organization.logo_delete',
      entityType: 'Organization',
      entityId: organization.id,
    });
    return serializeOrganization(updated);
  }

  private async getOrganizationRecord() {
    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      include: organizationInclude,
    });

    if (!organization) {
      throw new NotFoundException('Организация не настроена');
    }

    return organization;
  }

  async updateOrganization(dto: UpdateOrganizationDto, actorId: string) {
    const organization = await this.getOrganizationRecord();
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
      include: organizationInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'organization.update',
      entityType: 'Organization',
      entityId: updated.id,
      metadata: { changedFields: Object.keys(dto) },
    });

    return serializeOrganization(updated);
  }
}

const organizationInclude = {
  offices: {
    orderBy: { name: 'asc' as const },
    select: { id: true, name: true, address: true, phone: true, timezone: true },
  },
};

function serializeOrganization<T extends {
  logoStorageKey: string | null;
  logoOriginalName: string | null;
  logoMimeType: string | null;
  logoSizeBytes: number | null;
  logoUpdatedAt: Date | null;
}>(organization: T) {
  const { logoStorageKey, logoUpdatedAt, ...publicOrganization } = organization;
  return {
    ...publicOrganization,
    logoUrl: logoStorageKey ? `/api/v1/organization/logo?v=${encodeURIComponent(logoUpdatedAt?.toISOString() || '1')}` : null,
    logoUpdatedAt,
  };
}

function validateLogo(file: UploadedFilePayload | undefined) {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Выберите непустой файл логотипа');
  }
  if (file.size > maxLogoBytes) {
    throw new BadRequestException('Логотип больше 5 МБ. Уменьшите изображение и повторите загрузку');
  }

  const extension = extname(file.originalname).toLowerCase();
  const expectedMimeType = allowedLogoTypes.get(extension);
  const mimeType = file.mimetype.toLowerCase();
  if (!expectedMimeType || mimeType !== expectedMimeType || !hasExpectedImageSignature(file.buffer, mimeType)) {
    throw new BadRequestException('Допустимы только настоящие изображения JPG, PNG или WEBP');
  }
  return { ...file, extension, mimeType };
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function safeLogoName(value: string) {
  const normalized = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]/g, '_').trim();
  return (normalized || 'logo').slice(0, 240);
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
