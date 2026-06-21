import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { CreateVisitDocumentDto } from './dto/create-visit-document.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { UpdateVisitDocumentDto } from './dto/update-visit-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listTemplates() {
    return this.prisma.documentTemplate.findMany({
      orderBy: [{ category: { title: 'asc' } }, { title: 'asc' }],
      include: { category: true },
    });
  }

  async createTemplate(dto: CreateDocumentTemplateDto, actorId: string) {
    const categoryTitle = emptyToNull(dto.categoryTitle);
    const category = categoryTitle
      ? await this.prisma.documentTemplateCategory.upsert({
          where: { title: categoryTitle },
          update: {},
          create: { title: categoryTitle },
        })
      : null;
    const variables =
      dto.variables === undefined ? undefined : dto.variables === null ? Prisma.JsonNull : (dto.variables as Prisma.InputJsonObject);

    const template = await this.prisma.documentTemplate.create({
      data: {
        ...(category ? { category: { connect: { id: category.id } } } : {}),
        title: dto.title.trim(),
        body: emptyToNull(dto.body),
        ...(variables !== undefined ? { variables } : {}),
      },
      include: { category: true },
    });

    await this.auditService.log({
      actorId,
      action: 'document_template.create',
      entityType: 'DocumentTemplate',
      entityId: template.id,
      metadata: { title: template.title, categoryTitle },
    });

    return template;
  }

  async updateTemplate(templateId: string, dto: UpdateDocumentTemplateDto, actorId: string) {
    await this.getTemplate(templateId);
    const categoryTitle = dto.categoryTitle === undefined ? undefined : emptyToNull(dto.categoryTitle);
    const category =
      categoryTitle === undefined
        ? undefined
        : categoryTitle
          ? await this.prisma.documentTemplateCategory.upsert({
              where: { title: categoryTitle },
              update: {},
              create: { title: categoryTitle },
            })
          : null;
    const variables =
      dto.variables === undefined ? undefined : dto.variables === null ? Prisma.JsonNull : (dto.variables as Prisma.InputJsonObject);

    const template = await this.prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: emptyToNull(dto.body) } : {}),
        ...(category !== undefined ? { categoryId: category?.id ?? null } : {}),
        ...(variables !== undefined ? { variables } : {}),
      },
      include: { category: true },
    });

    await this.auditService.log({
      actorId,
      action: 'document_template.update',
      entityType: 'DocumentTemplate',
      entityId: template.id,
      metadata: { changedFields: Object.keys(dto), categoryTitle },
    });

    return template;
  }

  async listVisitDocuments(visitId: string) {
    await this.ensureVisitExists(visitId);

    return this.prisma.visitDocument.findMany({
      where: { visitId },
      orderBy: { createdAt: 'desc' },
      include: visitDocumentInclude,
    });
  }

  async createVisitDocument(visitId: string, dto: CreateVisitDocumentDto, actorId: string) {
    const visit = await this.getVisitTemplateContext(visitId);
    const template = dto.templateId ? await this.getTemplate(dto.templateId) : null;
    const title = renderTemplateText(emptyToNull(dto.title) ?? template?.title, visit);
    const rawBody = dto.body !== undefined ? emptyToNull(dto.body) : template?.body ?? null;

    if (!title) {
      throw new BadRequestException('Укажите название документа или выберите шаблон');
    }

    const document = await this.prisma.visitDocument.create({
      data: {
        visitId,
        templateId: template?.id,
        title,
        body: renderTemplateText(rawBody, visit),
        status: dto.status ?? DocumentStatus.DRAFT,
      },
      include: visitDocumentInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'visit_document.create',
      entityType: 'VisitDocument',
      entityId: document.id,
      metadata: { visitId, templateId: document.templateId, status: document.status },
    });

    return document;
  }

  async updateVisitDocument(visitId: string, documentId: string, dto: UpdateVisitDocumentDto, actorId: string) {
    await this.ensureDocumentBelongsToVisit(visitId, documentId);

    if (dto.templateId) {
      await this.getTemplate(dto.templateId);
    }

    const document = await this.prisma.visitDocument.update({
      where: { id: documentId },
      data: {
        ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
        ...(dto.title !== undefined ? { title: dto.title?.trim() } : {}),
        ...(dto.body !== undefined ? { body: emptyToNull(dto.body) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: visitDocumentInclude,
    });

    await this.auditService.log({
      actorId,
      action: 'visit_document.update',
      entityType: 'VisitDocument',
      entityId: document.id,
      metadata: { visitId, changedFields: Object.keys(dto), status: document.status },
    });

    return document;
  }

  private async ensureVisitExists(visitId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId }, select: { id: true } });

    if (!visit) {
      throw new NotFoundException('Приём не найден');
    }
  }

  private async getVisitTemplateContext(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        owner: {
          include: {
            office: {
              include: { organization: true },
            },
          },
        },
        animal: true,
        employee: { select: { fullName: true, position: true, phone: true } },
        hospitalBox: {
          include: {
            office: {
              include: { organization: true },
            },
          },
        },
        appointment: {
          include: {
            office: {
              include: { organization: true },
            },
          },
        },
        queueEntry: {
          include: {
            office: {
              include: { organization: true },
            },
          },
        },
      },
    });

    if (!visit) {
      throw new NotFoundException('Приём не найден');
    }

    const templateOffice = visit.appointment?.office ?? visit.queueEntry?.office ?? visit.hospitalBox?.office ?? visit.owner.office ?? null;
    const fallbackOrganization = templateOffice?.organization ? null : await this.getFallbackOrganization();
    const templateOrganization = templateOffice?.organization ?? fallbackOrganization;

    return {
      ...visit,
      templateOffice: templateOffice ?? fallbackOrganization?.offices[0] ?? null,
      templateOrganization,
    };
  }

  private getFallbackOrganization() {
    return this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      include: {
        offices: {
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
  }

  private async getTemplate(templateId: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id: templateId },
      include: { category: true },
    });

    if (!template) {
      throw new NotFoundException('Шаблон документа не найден');
    }

    return template;
  }

  private async ensureDocumentBelongsToVisit(visitId: string, documentId: string) {
    const document = await this.prisma.visitDocument.findFirst({
      where: { id: documentId, visitId },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Документ приёма не найден');
    }
  }
}

const visitDocumentInclude = {
  template: {
    include: { category: true },
  },
  generatedDocument: {
    select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
  },
} satisfies Prisma.VisitDocumentInclude;

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function renderTemplateText(
  text: string | null | undefined,
  visit: Awaited<ReturnType<DocumentsService['getVisitTemplateContext']>>,
) {
  if (!text) {
    return null;
  }

  const values: Record<string, string | null | undefined> = {
    'organization.displayName': visit.templateOrganization?.displayName,
    'organization.legalName': visit.templateOrganization?.legalName,
    'organization.orgType': visit.templateOrganization?.orgType,
    'organization.inn': visit.templateOrganization?.inn,
    'organization.kpp': visit.templateOrganization?.kpp,
    'organization.legalAddress': visit.templateOrganization?.legalAddress,
    'organization.postalAddress': visit.templateOrganization?.postalAddress,
    'organization.bankName': visit.templateOrganization?.bankName,
    'organization.bik': visit.templateOrganization?.bik,
    'organization.account': visit.templateOrganization?.account,
    'organization.corrAccount': visit.templateOrganization?.corrAccount,
    'organization.requisites': formatOrganizationRequisites(visit.templateOrganization),
    'clinic.name': visit.templateOrganization?.displayName,
    'clinic.legalName': visit.templateOrganization?.legalName,
    'clinic.inn': visit.templateOrganization?.inn,
    'clinic.kpp': visit.templateOrganization?.kpp,
    'clinic.address': visit.templateOffice?.address ?? visit.templateOrganization?.legalAddress,
    'office.name': visit.templateOffice?.name,
    'office.phone': visit.templateOffice?.phone,
    'office.address': visit.templateOffice?.address,
    'office.timezone': visit.templateOffice?.timezone,
    'owner.fullName': visit.owner.fullName,
    'owner.phone': visit.owner.phone,
    'owner.extraPhone': visit.owner.extraPhone,
    'owner.email': visit.owner.email,
    'owner.address': visit.owner.address,
    'animal.nickname': visit.animal.nickname,
    'animal.species': visit.animal.species,
    'animal.breed': visit.animal.breed,
    'animal.sex': visit.animal.sex,
    'animal.birthDate': formatDate(visit.animal.birthDate),
    'animal.microchip': visit.animal.microchip,
    'animal.status': visit.animal.status,
    'visit.id': visit.id,
    'visit.status': visit.status,
    'visit.startedAt': formatDateTime(visit.startedAt),
    'visit.completedAt': formatDateTime(visit.completedAt),
    'visit.totalAmount': String(visit.totalAmount),
    'employee.fullName': visit.employee?.fullName,
    'employee.position': visit.employee?.position,
    'employee.phone': visit.employee?.phone,
    'hospitalBox.name': visit.hospitalBox?.name,
    'appointment.startsAt': formatDateTime(visit.appointment?.startsAt),
    'appointment.endsAt': formatDateTime(visit.appointment?.endsAt),
    'queue.createdAt': formatDateTime(visit.queueEntry?.createdAt),
    currentDate: formatDate(new Date()),
    currentDateTime: formatDateTime(new Date()),
  };

  return text.replace(/\{([\w.]+)\}/g, (_match, key: string) => values[key] ?? '');
}

type TemplateOrganization = {
  displayName: string;
  legalName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  legalAddress?: string | null;
  bankName?: string | null;
  bik?: string | null;
  account?: string | null;
  corrAccount?: string | null;
};

function formatOrganizationRequisites(organization: TemplateOrganization | null | undefined) {
  if (!organization) {
    return '';
  }

  return [
    organization.legalName || organization.displayName,
    organization.inn ? `ИНН ${organization.inn}` : null,
    organization.kpp ? `КПП ${organization.kpp}` : null,
    organization.legalAddress ? `Юр. адрес: ${organization.legalAddress}` : null,
    organization.bankName ? `Банк: ${organization.bankName}` : null,
    organization.bik ? `БИК ${organization.bik}` : null,
    organization.account ? `Р/с ${organization.account}` : null,
    organization.corrAccount ? `К/с ${organization.corrAccount}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
