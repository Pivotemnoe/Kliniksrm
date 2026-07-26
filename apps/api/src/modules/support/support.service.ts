import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClinicLicenseStatus,
  Prisma,
  ServerAcceptanceStatus,
  SupportRequestStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { BackupsService } from '../backups/backups.service';
import { resolveReleaseVersion } from '../meta/meta.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AcceptServerDto } from './dto/accept-server.dto';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ImportAcceptanceReportDto } from './dto/import-acceptance-report.dto';
import { ImportLicenseDto } from './dto/import-license.dto';
import { UpdateSupportRequestDto } from './dto/update-support-request.dto';
import {
  OfflineLicensePayload,
  parseAndVerifyOfflineLicense,
  readLicensePublicKey,
  resolveLicenseMode,
} from './license-verifier';

const safeDiagnosticFormat = 'temichevvet-safe-diagnostics-v1';
const acceptanceReportFormat = 'temichevvet-restore-report-v1';

@Injectable()
export class SupportService {
  private licenseCache: { at: number; result: Awaited<ReturnType<SupportService['evaluateLicense']>> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly backups: BackupsService,
  ) {}

  async getOverview() {
    const installation = await this.ensureInstallation();
    const [license, requests, acceptances] = await Promise.all([
      this.getLicenseState(),
      this.prisma.supportRequest.findMany({
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, fullName: true } }, handledBy: { select: { id: true, fullName: true } } },
        take: 100,
      }),
      this.prisma.serverAcceptance.findMany({
        orderBy: { createdAt: 'desc' },
        include: { preparedBy: { select: { id: true, fullName: true } }, acceptedBy: { select: { id: true, fullName: true } } },
        take: 20,
      }),
    ]);
    return {
      installation: {
        installationId: installation.installationId,
        serverFingerprint: process.env.TEMICHEVVET_HOST_FINGERPRINT?.trim() || null,
        createdAt: installation.createdAt,
      },
      license,
      supportContact: {
        url: safeHttpUrl(process.env.TEMICHEVVET_SUPPORT_URL),
        email: safeEmail(process.env.TEMICHEVVET_SUPPORT_EMAIL),
      },
      requests: requests.map(stripDiagnosticSnapshot),
      acceptances,
      rules: {
        diagnosticsRequireDirectorConsent: true,
        diagnosticsContainPersonalData: false,
        programCodeEditableByClinic: false,
        clinicSettingsEditableByDirector: true,
        oldServerMustRemainIntactUntilAcceptance: true,
      },
    };
  }

  async createRequest(dto: CreateSupportRequestDto, actor: AuthEmployee) {
    const installation = await this.ensureInstallation();
    let diagnostics: Awaited<ReturnType<SupportService['buildSafeDiagnostics']>> | null = null;
    if (dto.includeDiagnostics) {
      if (!dto.diagnosticConsent) throw new BadRequestException('Для диагностического пакета нужно отдельное согласие директора');
      diagnostics = await this.buildSafeDiagnostics(installation.installationId);
    }
    const created = await this.prisma.supportRequest.create({
      data: {
        installationId: installation.id,
        createdById: actor.id,
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        priority: dto.priority,
        contact: dto.contact?.trim() || null,
        diagnosticConsentAt: diagnostics ? new Date() : null,
        diagnosticSnapshot: diagnostics ? toJson(diagnostics.report) : undefined,
        diagnosticSha256: diagnostics?.sha256 ?? null,
      },
      include: { createdBy: { select: { id: true, fullName: true } }, handledBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'support.request.create',
      entityType: 'SupportRequest',
      entityId: created.id,
      metadata: { priority: created.priority, diagnosticsIncluded: Boolean(diagnostics) },
    });
    return stripDiagnosticSnapshot(created);
  }

  async updateRequest(requestId: string, dto: UpdateSupportRequestDto, actor: AuthEmployee) {
    const existing = await this.prisma.supportRequest.findUnique({ where: { id: requestId } });
    if (!existing) throw new NotFoundException('Обращение не найдено');
    const resolved = dto.status === SupportRequestStatus.RESOLVED || dto.status === SupportRequestStatus.CLOSED;
    const updated = await this.prisma.supportRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        handledById: actor.id,
        response: dto.response?.trim() || null,
        externalReference: dto.externalReference?.trim() || null,
        resolvedAt: resolved ? new Date() : null,
      },
      include: { createdBy: { select: { id: true, fullName: true } }, handledBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({ actorId: actor.id, action: 'support.request.update', entityType: 'SupportRequest', entityId: requestId, metadata: { status: dto.status } });
    return stripDiagnosticSnapshot(updated);
  }

  async exportSafeDiagnostics(actor: AuthEmployee) {
    const installation = await this.ensureInstallation();
    const diagnostics = await this.buildSafeDiagnostics(installation.installationId);
    await this.audit.log({
      actorId: actor.id,
      action: 'support.diagnostics.export',
      entityType: 'ClinicInstallation',
      entityId: installation.id,
      metadata: { sha256: diagnostics.sha256, format: safeDiagnosticFormat },
    });
    return diagnostics;
  }

  async importLicense(dto: ImportLicenseDto, actor: AuthEmployee) {
    const installation = await this.ensureInstallation();
    if (dto.confirmation !== installation.installationId) {
      throw new BadRequestException('Для установки лицензии введите точный код этой установки');
    }
    const publicKey = readLicensePublicKey();
    if (!publicKey) throw new BadRequestException('Открытый ключ лицензирования ещё не настроен в этой сборке');
    let payload: OfflineLicensePayload;
    try {
      payload = parseAndVerifyOfflineLicense(dto.document, publicKey);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Лицензия не прошла проверку');
    }
    const signed = JSON.parse(dto.document) as { signature: string };
    const evaluation = evaluatePayload(payload, installation.installationId, process.env.TEMICHEVVET_HOST_FINGERPRINT);
    if (evaluation.status === ClinicLicenseStatus.INVALID || evaluation.status === ClinicLicenseStatus.MISMATCH) {
      throw new BadRequestException(evaluation.message);
    }
    await this.prisma.clinicInstallation.update({
      where: { id: installation.id },
      data: {
        licenseId: payload.licenseId,
        licenseCustomer: payload.customer,
        licensePayload: toJson(payload),
        licenseSignature: signed.signature,
        licenseStatus: evaluation.status,
        licenseValidUntil: new Date(payload.validUntil),
        licenseCheckedAt: new Date(),
        licenseMessage: evaluation.message,
      },
    });
    this.licenseCache = null;
    await this.audit.log({ actorId: actor.id, action: 'license.import', entityType: 'ClinicInstallation', entityId: installation.id, metadata: { licenseId: payload.licenseId, validUntil: payload.validUntil } });
    return this.getLicenseState(true);
  }

  async getLicenseState(force = false) {
    if (!force && this.licenseCache && Date.now() - this.licenseCache.at < 30_000) return this.licenseCache.result;
    const result = await this.evaluateLicense();
    this.licenseCache = { at: Date.now(), result };
    return result;
  }

  async assertLicensed() {
    if (resolveLicenseMode() !== 'required') return;
    const state = await this.getLicenseState();
    if (state.status !== ClinicLicenseStatus.VALID) {
      throw new ForbiddenException({ code: 'LICENSE_REQUIRED', message: state.message });
    }
  }

  async importAcceptanceReport(dto: ImportAcceptanceReportDto, actor: AuthEmployee) {
    const installation = await this.ensureInstallation();
    const parsed = parseAcceptanceReport(dto.report);
    const existing = await this.prisma.serverAcceptance.findFirst({ where: { archiveSha256: parsed.archiveSha256 } });
    if (existing) throw new BadRequestException('Отчёт этого архива уже зарегистрирован');
    const created = await this.prisma.serverAcceptance.create({
      data: {
        installationId: installation.id,
        preparedById: actor.id,
        status: ServerAcceptanceStatus.VERIFIED,
        releaseVersion: parsed.releaseVersion,
        releaseRevision: parsed.releaseRevision,
        sourceServer: parsed.sourceServer,
        targetServer: parsed.targetServer,
        archiveName: parsed.archiveName,
        archiveSha256: parsed.archiveSha256,
        sourceCounts: toJson(parsed.sourceCounts),
        targetCounts: toJson(parsed.targetCounts),
        verificationReport: toJson(dto.report),
        notes: dto.notes?.trim() || null,
      },
      include: { preparedBy: { select: { id: true, fullName: true } }, acceptedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({ actorId: actor.id, action: 'server.acceptance.report', entityType: 'ServerAcceptance', entityId: created.id, metadata: { archiveSha256: parsed.archiveSha256 } });
    return created;
  }

  async acceptServer(acceptanceId: string, dto: AcceptServerDto, actor: AuthEmployee) {
    const existing = await this.prisma.serverAcceptance.findUnique({ where: { id: acceptanceId } });
    if (!existing) throw new NotFoundException('Проверка переноса не найдена');
    if (existing.status !== ServerAcceptanceStatus.VERIFIED) throw new BadRequestException('Принять можно только перенос с совпавшими контрольными количествами');
    const updated = await this.prisma.serverAcceptance.update({
      where: { id: acceptanceId },
      data: {
        status: ServerAcceptanceStatus.ACCEPTED,
        acceptedById: actor.id,
        acceptedAt: new Date(),
        notes: dto.notes?.trim() || existing.notes,
      },
      include: { preparedBy: { select: { id: true, fullName: true } }, acceptedBy: { select: { id: true, fullName: true } } },
    });
    await this.audit.log({ actorId: actor.id, action: 'server.acceptance.accept', entityType: 'ServerAcceptance', entityId: acceptanceId, metadata: { oldServerRetained: true, volumesDeleted: false } });
    return updated;
  }

  private async evaluateLicense() {
    const installation = await this.ensureInstallation();
    const mode = resolveLicenseMode();
    if (!installation.licensePayload || !installation.licenseSignature) {
      const status = mode === 'compatibility' ? ClinicLicenseStatus.COMPATIBILITY : ClinicLicenseStatus.UNLICENSED;
      return licenseView(installation, mode, status, mode === 'compatibility' ? 'Текущая клиника работает в режиме совместимости' : 'Лицензия для этой установки не загружена');
    }
    const publicKey = readLicensePublicKey();
    if (!publicKey) return licenseView(installation, mode, ClinicLicenseStatus.INVALID, 'В сборке не настроен открытый ключ лицензирования');
    const payloadText = JSON.stringify(installation.licensePayload);
    const signedDocument = JSON.stringify({
      format: 'temichevvet-offline-license-v1',
      payload: Buffer.from(payloadText, 'utf8').toString('base64url'),
      signature: installation.licenseSignature,
    });
    let payload: OfflineLicensePayload;
    try {
      payload = parseAndVerifyOfflineLicense(signedDocument, publicKey);
    } catch (error) {
      return licenseView(installation, mode, ClinicLicenseStatus.INVALID, error instanceof Error ? error.message : 'Лицензия повреждена');
    }
    const state = evaluatePayload(payload, installation.installationId, process.env.TEMICHEVVET_HOST_FINGERPRINT);
    return licenseView(installation, mode, state.status, state.message, payload);
  }

  private async ensureInstallation() {
    const existing = await this.prisma.clinicInstallation.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    const organization = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    return this.prisma.clinicInstallation.create({ data: { organizationId: organization?.id ?? null } });
  }

  private async buildSafeDiagnostics(installationId: string) {
    const [backup, license, counts] = await Promise.all([
      this.backups.getStatus(),
      this.getLicenseState(),
      this.getSafeEntityCounts(),
    ]);
    const report = {
      format: safeDiagnosticFormat,
      generatedAt: new Date().toISOString(),
      installationId,
      release: {
        version: resolveReleaseVersion(),
        revision: process.env.TEMICHEVVET_GIT_COMMIT || 'local',
        buildDate: process.env.TEMICHEVVET_BUILD_DATE || null,
        imageSource: safeImageSource(process.env.TEMICHEVVET_IMAGE_SOURCE),
      },
      runtime: { node: process.version, platform: process.platform, architecture: process.arch, mode: process.env.CLINIC_RUNTIME_MODE || process.env.NODE_ENV || 'unknown' },
      license: { mode: license.mode, status: license.status, validUntil: license.validUntil },
      backup: {
        state: backup.state,
        lastDatabaseBackupAt: backup.lastDatabaseBackupAt,
        lastFilesBackupAt: backup.lastFilesBackupAt,
        lastIntegrityCheckAt: backup.lastIntegrityCheckAt,
        lastRestoreTestAt: backup.lastRestoreTestAt,
        lastRestoreTestState: backup.lastRestoreTestState,
        freeBytes: backup.freeBytes,
        warnings: backup.warnings,
      },
      counts,
      privacy: {
        containsNames: false,
        containsPhones: false,
        containsAddresses: false,
        containsMedicalTexts: false,
        containsMessageTexts: false,
        containsSecrets: false,
      },
    };
    const serialized = JSON.stringify(report, null, 2);
    const sha256 = createHash('sha256').update(serialized).digest('hex');
    return { fileName: `temichevvet-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, sha256, report };
  }

  private async getSafeEntityCounts() {
    const [owners, animals, visits, appointments, bills, products, files, employees, supportRequests] = await this.prisma.$transaction([
      this.prisma.owner.count(), this.prisma.animal.count(), this.prisma.visit.count(), this.prisma.appointment.count(),
      this.prisma.bill.count(), this.prisma.product.count(), this.prisma.fileObject.count(), this.prisma.employee.count(), this.prisma.supportRequest.count(),
    ]);
    return { owners, animals, visits, appointments, bills, products, files, employees, supportRequests };
  }
}

function evaluatePayload(payload: OfflineLicensePayload, installationId: string, hostFingerprint?: string) {
  if (payload.installationId !== installationId) return { status: ClinicLicenseStatus.MISMATCH, message: 'Лицензия выпущена для другой установки' };
  const actualFingerprint = hostFingerprint?.trim();
  if (!actualFingerprint) return { status: ClinicLicenseStatus.INVALID, message: 'Не удалось подтвердить компьютер этой установки' };
  if (payload.hostFingerprint !== actualFingerprint) return { status: ClinicLicenseStatus.MISMATCH, message: 'Лицензия выпущена для другого серверного компьютера' };
  if (new Date(payload.validUntil).getTime() < Date.now()) return { status: ClinicLicenseStatus.EXPIRED, message: 'Срок действия лицензии закончился' };
  return { status: ClinicLicenseStatus.VALID, message: 'Лицензия действительна для этой клиники и этого сервера' };
}

function licenseView(
  installation: { installationId: string; licenseId: string | null; licenseCustomer: string | null; licenseValidUntil: Date | null },
  mode: ReturnType<typeof resolveLicenseMode>,
  status: ClinicLicenseStatus,
  message: string,
  payload?: OfflineLicensePayload,
) {
  return {
    mode,
    status,
    message,
    installationId: installation.installationId,
    licenseId: payload?.licenseId ?? installation.licenseId,
    customer: payload?.customer ?? installation.licenseCustomer,
    validUntil: payload?.validUntil ?? installation.licenseValidUntil?.toISOString() ?? null,
    features: payload?.features ?? [],
    maxOffices: payload?.maxOffices ?? null,
    enforcementActive: mode === 'required',
  };
}

function parseAcceptanceReport(report: Record<string, unknown>) {
  if (report.reportFormat !== acceptanceReportFormat) {
    throw new BadRequestException('Формат отчёта переноса не поддерживается');
  }
  if (report.oldServerRetained !== true || report.dockerVolumesDeleted !== false) {
    throw new BadRequestException('Отчёт не подтверждает сохранность старого сервера и Docker volumes');
  }
  const mismatches = Array.isArray(report.countMismatches) ? report.countMismatches : null;
  if (!mismatches || mismatches.length || report.minioCountMatches !== true) {
    throw new BadRequestException('Отчёт не подтверждает полное совпадение базы и файлов');
  }
  const sourceCounts = objectValue(report.source);
  const targetCounts = objectValue(report.target);
  if (!sourceCounts || !targetCounts || !countsEqual(sourceCounts, targetCounts)) throw new BadRequestException('Контрольные количества источника и нового сервера не совпадают');
  const archiveSha256 = stringValue(report.archiveSha256);
  if (!archiveSha256 || !/^[a-f0-9]{64}$/i.test(archiveSha256)) throw new BadRequestException('В отчёте отсутствует SHA-256 архива');
  const archiveName = stringValue(report.archiveName) || fileNameFromPath(stringValue(report.archive));
  if (!archiveName) throw new BadRequestException('В отчёте отсутствует имя архива');
  return {
    format: acceptanceReportFormat,
    releaseVersion: stringValue(report.releaseVersion) || 'не указана',
    releaseRevision: stringValue(report.releaseRevision),
    sourceServer: stringValue(report.sourceServer),
    targetServer: stringValue(report.targetServer),
    archiveName,
    archiveSha256: archiveSha256.toLowerCase(),
    sourceCounts,
    targetCounts,
  };
}

function countsEqual(left: Record<string, unknown>, right: Record<string, unknown>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => Number(left[key]) === Number(right[key]));
}

function stripDiagnosticSnapshot<T extends { diagnosticSnapshot?: unknown }>(request: T) {
  const { diagnosticSnapshot: _diagnosticSnapshot, ...safe } = request;
  return { ...safe, diagnosticsIncluded: Boolean(request.diagnosticSnapshot) };
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fileNameFromPath(value: string | null) {
  return value?.split(/[\\/]/).at(-1) || null;
}

function safeHttpUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function safeEmail(value?: string) {
  const email = value?.trim();
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function safeImageSource(value?: string) {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}
