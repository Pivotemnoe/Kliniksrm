import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentEventType,
  DocumentSignatureMethod,
  DocumentStatus,
  FilePurpose,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { ObjectStorageService } from '../files/object-storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentPdfService, DocumentPdfSnapshot } from './document-pdf.service';
import { CreateDocumentTemplateDto } from './dto/create-document-template.dto';
import { CreateVisitDocumentDto } from './dto/create-visit-document.dto';
import { UpdateDocumentTemplateDto } from './dto/update-document-template.dto';
import { UpdateVisitDocumentDto } from './dto/update-visit-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pdfService: DocumentPdfService,
    private readonly storage: ObjectStorageService,
  ) {}

  listTemplates() {
    return this.prisma.documentTemplate.findMany({
      orderBy: [{ category: { title: 'asc' } }, { title: 'asc' }],
      include: {
        category: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { id: true, version: true, publishedAt: true, createdByName: true, requiresSignature: true },
        },
      },
    });
  }

  async createTemplate(dto: CreateDocumentTemplateDto, actorId: string) {
    const categoryTitle = emptyToNull(dto.categoryTitle);
    const variables =
      dto.variables === undefined ? undefined : dto.variables === null ? Prisma.JsonNull : (dto.variables as Prisma.InputJsonObject);
    const actor = await this.getActor(actorId);

    const template = await this.prisma.$transaction(async (tx) => {
      const category = categoryTitle
        ? await tx.documentTemplateCategory.upsert({
            where: { title: categoryTitle },
            update: {},
            create: { title: categoryTitle },
          })
        : null;
      const created = await tx.documentTemplate.create({
        data: {
          ...(category ? { category: { connect: { id: category.id } } } : {}),
          title: dto.title.trim(),
          body: emptyToNull(dto.body),
          requiresSignature: dto.requiresSignature ?? false,
          ...(variables !== undefined ? { variables } : {}),
        },
      });

      await tx.documentTemplateVersion.create({
        data: {
          templateId: created.id,
          version: 1,
          categoryTitle,
          title: created.title,
          body: created.body,
          requiresSignature: created.requiresSignature,
          ...(created.variables !== null ? { variables: created.variables as Prisma.InputJsonValue } : {}),
          createdById: actor.id,
          createdByName: actor.name,
        },
      });

      return tx.documentTemplate.findUniqueOrThrow({
        where: { id: created.id },
        include: templateInclude,
      });
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
    const categoryTitle = dto.categoryTitle === undefined ? undefined : emptyToNull(dto.categoryTitle);
    const variables =
      dto.variables === undefined ? undefined : dto.variables === null ? Prisma.JsonNull : (dto.variables as Prisma.InputJsonObject);
    const actor = await this.getActor(actorId);

    const template = await this.prisma.$transaction(async (tx) => {
      const current = await tx.documentTemplate.findUnique({
        where: { id: templateId },
        include: { category: true },
      });
      if (!current) {
        throw new NotFoundException('Шаблон документа не найден');
      }

      const category =
        categoryTitle === undefined
          ? undefined
          : categoryTitle
            ? await tx.documentTemplateCategory.upsert({
                where: { title: categoryTitle },
                update: {},
                create: { title: categoryTitle },
              })
            : null;

      const updated = await tx.documentTemplate.update({
        where: { id: templateId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.body !== undefined ? { body: emptyToNull(dto.body) } : {}),
          ...(dto.requiresSignature !== undefined ? { requiresSignature: dto.requiresSignature } : {}),
          ...(category !== undefined ? { categoryId: category?.id ?? null } : {}),
          ...(variables !== undefined ? { variables } : {}),
          currentVersion: { increment: 1 },
        },
        include: { category: true },
      });

      await tx.documentTemplateVersion.create({
        data: {
          templateId: updated.id,
          version: updated.currentVersion,
          categoryTitle: updated.category?.title ?? null,
          title: updated.title,
          body: updated.body,
          requiresSignature: updated.requiresSignature,
          ...(updated.variables !== null ? { variables: updated.variables as Prisma.InputJsonValue } : {}),
          createdById: actor.id,
          createdByName: actor.name,
        },
      });

      return tx.documentTemplate.findUniqueOrThrow({
        where: { id: updated.id },
        include: templateInclude,
      });
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
    const templateVersion = template?.versions[0] ?? null;
    const title = renderTemplateText(emptyToNull(dto.title) ?? templateVersion?.title ?? template?.title, visit);
    const rawBody = dto.body !== undefined ? emptyToNull(dto.body) : templateVersion?.body ?? template?.body ?? null;

    if (!title) {
      throw new BadRequestException('Укажите название документа или выберите шаблон');
    }
    const actor = await this.getActor(actorId);
    const requestedStatus = dto.status ?? DocumentStatus.DRAFT;

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.visitDocument.create({
        data: {
          visitId,
          templateId: template?.id,
          templateVersionId: templateVersion?.id,
          title,
          body: renderTemplateText(rawBody, visit),
          status: DocumentStatus.DRAFT,
          events: {
            create: {
              type: DocumentEventType.CREATED,
              actorId: actor.id,
              actorName: actor.name,
              details: { initialStatus: DocumentStatus.DRAFT },
            },
          },
        },
      });

      if (requestedStatus !== DocumentStatus.DRAFT) {
        await this.transitionDocument(tx, created.id, DocumentStatus.DRAFT, requestedStatus, actor);
      }

      return tx.visitDocument.findUniqueOrThrow({
        where: { id: created.id },
        include: visitDocumentInclude,
      });
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
    const current = await this.prisma.visitDocument.findFirst({
      where: { id: documentId, visitId },
      include: { generatedDocument: true },
    });
    if (!current) {
      throw new NotFoundException('Документ приёма не найден');
    }

    const changesContent = dto.templateId !== undefined || dto.title !== undefined || dto.body !== undefined;
    const frozen = current.status !== DocumentStatus.DRAFT || Boolean(current.generatedDocument);
    if (frozen && changesContent) {
      throw new BadRequestException(
        'Сформированный документ нельзя переписывать. Создайте новый документ или измените только его статус.',
      );
    }

    const template = dto.templateId ? await this.getTemplate(dto.templateId) : null;
    const title = dto.title === undefined ? undefined : emptyToNull(dto.title);
    if (dto.title !== undefined && !title) {
      throw new BadRequestException('Название документа не может быть пустым');
    }
    const actor = await this.getActor(actorId);

    const document = await this.prisma.$transaction(async (tx) => {
      let statusBeforeTransition = current.status;

      if (!frozen && changesContent) {
        const templateVersion = template?.versions[0] ?? null;
        const data: Prisma.VisitDocumentUncheckedUpdateInput = {};
        if (dto.templateId !== undefined) {
          data.templateId = template?.id ?? null;
          data.templateVersionId = templateVersion?.id ?? null;
        }
        if (title) data.title = title;
        if (dto.body !== undefined) data.body = emptyToNull(dto.body);
        const updated = await tx.visitDocument.update({
          where: { id: documentId },
          data,
          select: { status: true },
        });
        statusBeforeTransition = updated.status;
      }

      if (dto.status !== undefined && dto.status !== statusBeforeTransition) {
        await this.transitionDocument(
          tx,
          documentId,
          statusBeforeTransition,
          dto.status,
          actor,
          dto.signatureMethod,
        );
      }

      return tx.visitDocument.findUniqueOrThrow({
        where: { id: documentId },
        include: visitDocumentInclude,
      });
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

  async deleteVisitDocument(visitId: string, documentId: string, actorId: string) {
    const document = await this.prisma.visitDocument.findFirst({
      where: { id: documentId, visitId },
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocument: { select: { id: true } },
      },
    });

    if (!document) {
      throw new NotFoundException('Документ приёма не найден');
    }

    if (
      document.generatedDocument ||
      (document.status !== DocumentStatus.DRAFT && document.status !== DocumentStatus.CANCELLED)
    ) {
      throw new BadRequestException('Удалить можно только черновик или отменённый документ. Сформированные и подписанные документы сохраняются в истории.');
    }

    await this.prisma.visitDocument.delete({ where: { id: document.id } });
    await this.auditService.log({
      actorId,
      action: 'visit_document.delete',
      entityType: 'VisitDocument',
      entityId: document.id,
      metadata: { visitId, title: document.title, status: document.status },
    });

    return { deleted: true };
  }

  async openGeneratedPdf(visitId: string, documentId: string, actorId: string) {
    const document = await this.prisma.visitDocument.findFirst({
      where: { id: documentId, visitId },
      select: {
        id: true,
        title: true,
        status: true,
        generatedDocument: {
          select: {
            contentSha256: true,
            pdfSha256: true,
            file: true,
          },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Документ приёма не найден');
    }
    if (!document.generatedDocument?.file) {
      throw new BadRequestException('У документа пока нет сохранённого PDF. Сформируйте его заново.');
    }

    const actor = await this.getActor(actorId);
    const stream = await this.storage.getObject(document.generatedDocument.file.storageKey);
    await this.prisma.documentEvent.create({
      data: {
        visitDocumentId: document.id,
        type: DocumentEventType.PRINTED,
        actorId: actor.id,
        actorName: actor.name,
        details: {
          status: document.status,
          contentSha256: document.generatedDocument.contentSha256,
          pdfSha256: document.generatedDocument.pdfSha256,
        },
      },
    });
    await this.auditService.log({
      actorId,
      action: 'visit_document.pdf_open',
      entityType: 'VisitDocument',
      entityId: document.id,
      metadata: {
        visitId,
        status: document.status,
        pdfSha256: document.generatedDocument.pdfSha256,
      },
    });

    return { file: document.generatedDocument.file, stream };
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
      include: {
        category: true,
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!template) {
      throw new NotFoundException('Шаблон документа не найден');
    }

    return template;
  }

  private async getActor(actorId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: actorId },
      select: { id: true, fullName: true },
    });

    return { id: actorId, name: employee?.fullName ?? null };
  }

  private async transitionDocument(
    tx: Prisma.TransactionClient,
    documentId: string,
    currentStatus: DocumentStatus,
    targetStatus: DocumentStatus,
    actor: { id: string; name: string | null },
    signatureMethod: DocumentSignatureMethod = DocumentSignatureMethod.STATUS_CONFIRMATION,
  ) {
    const allowedTransitions: Record<DocumentStatus, readonly DocumentStatus[]> = {
      DRAFT: [DocumentStatus.GENERATED, DocumentStatus.SIGNED, DocumentStatus.CANCELLED],
      GENERATED: [DocumentStatus.SIGNED, DocumentStatus.CANCELLED],
      SIGNED: [DocumentStatus.CANCELLED],
      CANCELLED: [],
    };
    if (!allowedTransitions[currentStatus].includes(targetStatus)) {
      throw new BadRequestException(
        `Нельзя изменить статус документа с «${documentStatusLabel(currentStatus)}» на «${documentStatusLabel(targetStatus)}»`,
      );
    }

    let generated = await tx.generatedDocument.findUnique({ where: { visitDocumentId: documentId } });
    const requiresSnapshot =
      targetStatus === DocumentStatus.GENERATED ||
      targetStatus === DocumentStatus.SIGNED ||
      (targetStatus === DocumentStatus.CANCELLED && currentStatus !== DocumentStatus.DRAFT);

    if (
      requiresSnapshot &&
      (!generated?.snapshot || !generated.contentSha256 || !generated.pdfSha256 || !generated.fileId)
    ) {
      generated = await this.createGeneratedSnapshot(tx, documentId, actor, targetStatus);
      await tx.documentEvent.create({
        data: {
          visitDocumentId: documentId,
          type: DocumentEventType.GENERATED,
          actorId: actor.id,
          actorName: actor.name,
          details: {
            contentSha256: generated.contentSha256,
            reconstructedLegacyDocument: currentStatus !== DocumentStatus.DRAFT,
          },
        },
      });
    }

    if (targetStatus === DocumentStatus.SIGNED) {
      await tx.generatedDocument.update({
        where: { visitDocumentId: documentId },
        data: {
          status: DocumentStatus.SIGNED,
          signedById: actor.id,
          signedByName: actor.name,
          signedAt: new Date(),
          signatureMethod,
        },
      });
      await tx.documentEvent.create({
        data: {
          visitDocumentId: documentId,
          type: DocumentEventType.SIGNED,
          actorId: actor.id,
          actorName: actor.name,
          details: { signatureMethod },
        },
      });
      await tx.documentEvent.create({
        data: {
          visitDocumentId: documentId,
          type: DocumentEventType.DELIVERY_QUEUED,
          actorId: actor.id,
          actorName: actor.name,
          channel: 'CLIENT_PORTAL',
          details: { status: 'AVAILABLE_AFTER_VISIT_COMPLETION' },
        },
      });
    } else if (targetStatus === DocumentStatus.CANCELLED) {
      if (generated) {
        await tx.generatedDocument.update({
          where: { visitDocumentId: documentId },
          data: { status: DocumentStatus.CANCELLED },
        });
      }
      await tx.documentEvent.create({
        data: {
          visitDocumentId: documentId,
          type: DocumentEventType.CANCELLED,
          actorId: actor.id,
          actorName: actor.name,
          details: { previousStatus: currentStatus },
        },
      });
    }

    await tx.visitDocument.update({
      where: { id: documentId },
      data: { status: targetStatus },
    });
  }

  private async createGeneratedSnapshot(
    tx: Prisma.TransactionClient,
    documentId: string,
    actor: { id: string; name: string | null },
    targetStatus: DocumentStatus,
  ) {
    const document = await tx.visitDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        visitId: true,
        templateId: true,
        templateVersionId: true,
        title: true,
        body: true,
        generatedDocument: { select: { id: true, generatedAt: true, generatedById: true, generatedByName: true } },
        visit: {
          select: {
            ownerId: true,
            animalId: true,
            startedAt: true,
            owner: {
              select: {
                fullName: true,
                office: {
                  select: {
                    organization: { select: { displayName: true } },
                  },
                },
              },
            },
            animal: { select: { nickname: true, species: true, breed: true, sex: true } },
            employee: { select: { fullName: true } },
          },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Документ приёма не найден');
    }

    const pdfSnapshot: DocumentPdfSnapshot = {
      title: document.title,
      body: document.body ?? '',
      clinicName: document.visit.owner.office?.organization.displayName ?? 'TemichevVet',
      visitStartedAt: document.visit.startedAt.toISOString(),
      employeeName: document.visit.employee?.fullName ?? '',
      ownerName: document.visit.owner.fullName,
      animalName: document.visit.animal.nickname,
      animalDescription: [
        document.visit.animal.species,
        document.visit.animal.breed,
        document.visit.animal.sex === 'MALE' ? 'самец' : document.visit.animal.sex === 'FEMALE' ? 'самка' : null,
      ]
        .filter(Boolean)
        .join(', '),
    };
    const snapshot = {
      schemaVersion: 2,
      visitDocumentId: document.id,
      visitId: document.visitId,
      templateId: document.templateId,
      templateVersionId: document.templateVersionId,
      ...pdfSnapshot,
    } satisfies Prisma.InputJsonObject;
    const contentSha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const pdf = await this.pdfService.render(pdfSnapshot);
    const pdfSha256 = createHash('sha256').update(pdf).digest('hex');
    const storageKey = `medical_document/${new Date().getUTCFullYear()}/generated/${document.id}-${contentSha256.slice(0, 16)}.pdf`;
    await this.storage.putObject(storageKey, pdf, 'application/pdf');

    try {
      const file = await tx.fileObject.create({
        data: {
          ownerId: document.visit.ownerId,
          animalId: document.visit.animalId,
          visitId: document.visitId,
          visitDocumentId: document.id,
          uploadedById: actor.id,
          purpose: FilePurpose.MEDICAL_DOCUMENT,
          storageKey,
          originalName: `${safePdfFileName(document.title)}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          checksumSha256: pdfSha256,
        },
      });
      const generatedData = {
        templateId: document.templateId,
        templateVersionId: document.templateVersionId,
        fileId: file.id,
        title: document.title,
        status: targetStatus === DocumentStatus.SIGNED ? DocumentStatus.SIGNED : DocumentStatus.GENERATED,
        snapshot,
        contentSha256,
        pdfSha256,
        generatedById: document.generatedDocument?.generatedById ?? actor.id,
        generatedByName: document.generatedDocument?.generatedByName ?? actor.name,
        generatedAt: document.generatedDocument?.generatedAt ?? new Date(),
      } satisfies Prisma.GeneratedDocumentUncheckedUpdateInput;

      return document.generatedDocument
        ? tx.generatedDocument.update({ where: { id: document.generatedDocument.id }, data: generatedData })
        : tx.generatedDocument.create({
            data: {
              ...generatedData,
              visitDocumentId: document.id,
            },
          });
    } catch (error) {
      await this.storage.removeObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

}

const visitDocumentInclude = {
  template: {
    include: { category: true },
  },
  templateVersion: {
    select: {
      id: true,
      version: true,
      categoryTitle: true,
      title: true,
      requiresSignature: true,
      publishedAt: true,
      createdByName: true,
    },
  },
  generatedDocument: {
    select: {
      id: true,
      title: true,
      status: true,
      snapshot: true,
      contentSha256: true,
      pdfSha256: true,
      generatedByName: true,
      generatedAt: true,
      signedByName: true,
      signedAt: true,
      signatureMethod: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  events: {
    orderBy: { createdAt: 'asc' },
  },
  deliveries: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      channel: true,
      recipient: true,
      status: true,
      attempts: true,
      scheduledAt: true,
      sentAt: true,
      lastError: true,
      createdAt: true,
    },
  },
} satisfies Prisma.VisitDocumentInclude;

const templateInclude = {
  category: true,
  versions: {
    orderBy: { version: 'desc' },
    take: 1,
    select: { id: true, version: true, publishedAt: true, createdByName: true, requiresSignature: true },
  },
} satisfies Prisma.DocumentTemplateInclude;

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function documentStatusLabel(status: DocumentStatus) {
  const labels: Record<DocumentStatus, string> = {
    DRAFT: 'Черновик',
    GENERATED: 'Сформирован',
    SIGNED: 'Подписан',
    CANCELLED: 'Отменён',
  };
  return labels[status];
}

function safePdfFileName(value: string) {
  const normalized = value.normalize('NFC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim();
  return (normalized || 'Документ').slice(0, 120);
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
