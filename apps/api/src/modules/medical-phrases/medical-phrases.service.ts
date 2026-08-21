import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MedicalPhrase, MedicalPhraseSource, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { withRussianSearchVariants } from '../../common/search-ranking';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthEmployee } from '../auth/auth.types';
import { CleanupMedicalPhrasesDto } from './dto/cleanup-medical-phrases.dto';
import { ListMedicalPhrasesQueryDto } from './dto/list-medical-phrases-query.dto';
import { ManageMedicalPhrasesQueryDto } from './dto/manage-medical-phrases-query.dto';
import { UpsertMedicalPhraseDto } from './dto/upsert-medical-phrase.dto';
import { SavePersonalMedicalPhraseDto } from './dto/save-personal-medical-phrase.dto';
import { PersonalMedicalPhraseAction } from './dto/personal-medical-phrase-action.dto';

const LEARNABLE_FIELDS = new Set([
  'visit.exam.anamnesis',
  'visit.exam.examination',
  'visit.exam.symptoms',
  'visit.exam.manipulations',
  'visit.exam.comment',
  'visit.recommendation.treatmentPlan',
  'visit.recommendation.careNotes',
]);

type LearnableTextMap = Partial<Record<string, string | null | undefined>>;

@Injectable()
export class MedicalPhrasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ListMedicalPhrasesQueryDto, actor: AuthEmployee) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: actor.id },
      select: { medicalPhraseAssistantEnabled: true },
    });
    const assistantEnabled = employee?.medicalPhraseAssistantEnabled ?? true;
    const where = buildListWhere(query, actor, assistantEnabled);
    const phrases = await this.prisma.medicalPhrase.findMany({
      where,
      take: 120,
    });

    const items = phrases.sort(compareMedicalPhrases).map(serializeMedicalPhrase);

    return { items, assistantEnabled, suggestionThreshold: 2 };
  }

  async getPersonalSettings(actor: AuthEmployee) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: actor.id },
      select: { medicalPhraseAssistantEnabled: true },
    });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    return { enabled: employee.medicalPhraseAssistantEnabled, suggestionThreshold: 2 };
  }

  async updatePersonalSettings(enabled: boolean, actor: AuthEmployee) {
    const employee = await this.prisma.employee.update({
      where: { id: actor.id },
      data: { medicalPhraseAssistantEnabled: enabled },
      select: { medicalPhraseAssistantEnabled: true },
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.assistantSettings',
      entityType: 'Employee',
      entityId: actor.id,
      metadata: { enabled },
    });
    return { enabled: employee.medicalPhraseAssistantEnabled, suggestionThreshold: 2 };
  }

  async savePersonal(dto: SavePersonalMedicalPhraseDto, actor: AuthEmployee) {
    const field = required(dto.field, 'Укажите раздел фразы');
    if (!LEARNABLE_FIELDS.has(field)) throw new BadRequestException('Этот раздел не поддерживает личные фразы');
    const text = required(dto.text, 'Введите текст фразы');
    const textHash = hashPhrase(text);
    const scopeKey = getEmployeeScopeKey(actor.id);
    const phrase = await this.prisma.medicalPhrase.upsert({
      where: { field_scopeKey_textHash: { field, scopeKey, textHash } },
      update: {
        title: optionalText(dto.title) ?? buildTitle(text),
        text,
        species: optionalText(dto.species),
        diagnosis: optionalText(dto.diagnosis),
        isActive: true,
        isAccepted: true,
        isPinned: dto.isPinned ?? false,
        dismissedAt: null,
        lastUsedAt: new Date(),
      },
      create: {
        field,
        category: 'Личная фраза врача',
        title: optionalText(dto.title) ?? buildTitle(text),
        text,
        textHash,
        species: optionalText(dto.species),
        diagnosis: optionalText(dto.diagnosis),
        source: MedicalPhraseSource.EMPLOYEE,
        scopeKey,
        employeeId: actor.id,
        isActive: true,
        isAccepted: true,
        isPinned: dto.isPinned ?? false,
        usageCount: 1,
        lastUsedAt: new Date(),
      },
      include: employeeInclude,
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.personalSave',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field, isPinned: phrase.isPinned },
    });
    return serializeMedicalPhrase(phrase);
  }

  async actOnPersonal(phraseId: string, action: PersonalMedicalPhraseAction, actor: AuthEmployee) {
    const phrase = await this.prisma.medicalPhrase.findFirst({
      where: { id: phraseId, source: MedicalPhraseSource.EMPLOYEE, employeeId: actor.id },
    });
    if (!phrase) throw new NotFoundException('Личная фраза не найдена');
    const data: Prisma.MedicalPhraseUpdateInput =
      action === 'ACCEPT'
        ? { isAccepted: true, isActive: true, dismissedAt: null }
        : action === 'REJECT'
          ? { isAccepted: false, isPinned: false, isActive: false, dismissedAt: new Date() }
          : action === 'PIN'
            ? { isAccepted: true, isPinned: true, isActive: true, dismissedAt: null }
            : { isPinned: false };
    const updated = await this.prisma.medicalPhrase.update({
      where: { id: phrase.id },
      data,
      include: employeeInclude,
    });
    await this.auditService.log({
      actorId: actor.id,
      action: `medicalPhrase.personal${action}`,
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field },
    });
    return serializeMedicalPhrase(updated);
  }

  async removePersonal(phraseId: string, actor: AuthEmployee) {
    const phrase = await this.prisma.medicalPhrase.findFirst({
      where: { id: phraseId, source: MedicalPhraseSource.EMPLOYEE, employeeId: actor.id },
    });
    if (!phrase) throw new NotFoundException('Личная фраза не найдена');
    await this.prisma.medicalPhrase.update({
      where: { id: phrase.id },
      data: {
        isActive: false,
        isAccepted: false,
        isPinned: false,
        dismissedAt: new Date(),
      },
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.personalDelete',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field },
    });
    return { ok: true, mode: 'hidden' };
  }

  async listForManagement(query: ManageMedicalPhrasesQueryDto) {
    const { limit, offset } = parsePagination(query);
    const where = buildManageWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.medicalPhrase.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ updatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.medicalPhrase.count({ where }),
    ]);

    return {
      items: items.map(serializeMedicalPhrase),
      total,
      limit,
      offset,
    };
  }

  async create(dto: UpsertMedicalPhraseDto, actor: AuthEmployee) {
    const data = normalizeMedicalPhraseInput(dto);
    await this.ensureNoDuplicate(data.field, data.scopeKey, data.textHash);

    const phrase = await this.prisma.medicalPhrase.create({
      data,
      include: employeeInclude,
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.create',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field, source: phrase.source, diagnosis: phrase.diagnosis },
    });

    return serializeMedicalPhrase(phrase);
  }

  async update(phraseId: string, dto: UpsertMedicalPhraseDto, actor: AuthEmployee) {
    const existing = await this.getPhraseOrThrow(phraseId);
    const data = normalizeMedicalPhraseInput(dto, existing);

    await this.ensureNoDuplicate(data.field, data.scopeKey, data.textHash, phraseId);

    const phrase = await this.prisma.medicalPhrase.update({
      where: { id: phraseId },
      data,
      include: employeeInclude,
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.update',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field, source: phrase.source, isActive: phrase.isActive },
    });

    return serializeMedicalPhrase(phrase);
  }

  async remove(phraseId: string, actor: AuthEmployee) {
    const phrase = await this.getPhraseOrThrow(phraseId);

    if (phrase.source === MedicalPhraseSource.EMPLOYEE) {
      await this.prisma.medicalPhrase.delete({ where: { id: phrase.id } });
      await this.auditService.log({
        actorId: actor.id,
        action: 'medicalPhrase.delete',
        entityType: 'MedicalPhrase',
        entityId: phrase.id,
        metadata: { field: phrase.field, source: phrase.source },
      });

      return { ok: true, mode: 'deleted' };
    }

    const disabled = await this.prisma.medicalPhrase.update({
      where: { id: phrase.id },
      data: { isActive: false },
      include: employeeInclude,
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.disable',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field, source: phrase.source },
    });

    return serializeMedicalPhrase(disabled);
  }

  async cleanupLearned(dto: CleanupMedicalPhrasesDto, actor: AuthEmployee) {
    const field = dto.field?.trim();
    const employeeId = dto.employeeId?.trim();
    const result = await this.prisma.medicalPhrase.deleteMany({
      where: {
        source: MedicalPhraseSource.EMPLOYEE,
        ...(field ? { field } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.cleanupLearned',
      entityType: 'MedicalPhrase',
      metadata: { deletedCount: result.count, field, employeeId },
    });

    return { ok: true, deletedCount: result.count };
  }

  private async getPhraseOrThrow(phraseId: string) {
    const phrase = await this.prisma.medicalPhrase.findUnique({ where: { id: phraseId } });

    if (!phrase) {
      throw new NotFoundException('Быстрая фраза не найдена');
    }

    return phrase;
  }

  private async ensureNoDuplicate(field: string, scopeKey: string, textHash: string, excludeId?: string) {
    await ensureUniquePhrase(this.prisma, field, scopeKey, textHash, excludeId);
  }

  async recordUsage(phraseId: string, actor: AuthEmployee) {
    const phrase = await this.prisma.medicalPhrase.findFirst({
      where: {
        id: phraseId,
        isActive: true,
        OR: [
          { source: { in: [MedicalPhraseSource.SYSTEM, MedicalPhraseSource.DIAGNOSIS_TEMPLATE] } },
          { employeeId: actor.id },
        ],
      },
    });

    if (!phrase) {
      throw new NotFoundException('Быстрая фраза не найдена');
    }

    const updated = await this.prisma.medicalPhrase.update({
      where: { id: phrase.id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      include: employeeInclude,
    });
    await this.auditService.log({
      actorId: actor.id,
      action: 'medicalPhrase.usage',
      entityType: 'MedicalPhrase',
      entityId: phrase.id,
      metadata: { field: phrase.field, source: phrase.source },
    });
    return serializeMedicalPhrase(updated);
  }

  async learnFromText(fields: LearnableTextMap, actor: AuthEmployee) {
    const operations: Array<Promise<unknown>> = [];
    const scopeKey = getEmployeeScopeKey(actor.id);
    const now = new Date();

    for (const [field, text] of Object.entries(fields)) {
      if (!LEARNABLE_FIELDS.has(field)) {
        continue;
      }

      for (const candidate of extractCandidates(text)) {
        const textHash = hashPhrase(candidate);

        operations.push(
          this.prisma.medicalPhrase.upsert({
            where: {
              field_scopeKey_textHash: {
                field,
                scopeKey,
                textHash,
              },
            },
            update: {
              title: buildTitle(candidate),
              text: candidate,
              usageCount: { increment: 1 },
              lastUsedAt: now,
            },
            create: {
              field,
              category: 'Часто использует врач',
              title: buildTitle(candidate),
              text: candidate,
              textHash,
              source: MedicalPhraseSource.EMPLOYEE,
              scopeKey,
              employeeId: actor.id,
              isActive: true,
              isAccepted: false,
              isPinned: false,
              usageCount: 1,
              lastUsedAt: now,
            },
          }),
        );
      }
    }

    await Promise.all(operations);
  }
}

function buildListWhere(
  query: ListMedicalPhrasesQueryDto,
  actor: AuthEmployee,
  assistantEnabled: boolean,
): Prisma.MedicalPhraseWhereInput {
  const field = query.field?.trim();
  const species = query.species?.trim();
  const diagnosis = query.diagnosis?.trim();
  const search = query.search?.trim();
  const and: Prisma.MedicalPhraseWhereInput[] = [
    { isActive: true },
    {
      OR: assistantEnabled
        ? [
            { source: { in: [MedicalPhraseSource.SYSTEM, MedicalPhraseSource.DIAGNOSIS_TEMPLATE] } },
            {
              employeeId: actor.id,
              dismissedAt: null,
              OR: [{ isAccepted: true }, { usageCount: { gte: 2 } }],
            },
          ]
        : [{ source: { in: [MedicalPhraseSource.SYSTEM, MedicalPhraseSource.DIAGNOSIS_TEMPLATE] } }],
    },
  ];

  if (field) {
    and.push({ field });
  }

  if (species) {
    and.push({
      OR: [{ species: null }, { species: { equals: species, mode: 'insensitive' } }],
    });
  }

  if (diagnosis) {
    and.push({
      OR: [{ diagnosis: null }, { diagnosis: { contains: diagnosis, mode: 'insensitive' } }],
    });
  }

  if (search) {
    and.push({
      OR: withRussianSearchVariants(search, (variant) => [
        { title: { contains: variant, mode: 'insensitive' as const } },
        { text: { contains: variant, mode: 'insensitive' as const } },
        { category: { contains: variant, mode: 'insensitive' as const } },
        { diagnosis: { contains: variant, mode: 'insensitive' as const } },
      ]),
    });
  }

  return { AND: and };
}

function buildManageWhere(query: ManageMedicalPhrasesQueryDto): Prisma.MedicalPhraseWhereInput {
  const field = query.field?.trim();
  const species = query.species?.trim();
  const diagnosis = query.diagnosis?.trim();
  const search = query.search?.trim();
  const isActive = parseOptionalBoolean(query.isActive);
  const and: Prisma.MedicalPhraseWhereInput[] = [];

  if (field) {
    and.push({ field });
  }

  if (query.source) {
    and.push({ source: query.source });
  }

  if (species) {
    and.push({ species: { contains: species, mode: 'insensitive' } });
  }

  if (diagnosis) {
    and.push({ diagnosis: { contains: diagnosis, mode: 'insensitive' } });
  }

  if (isActive !== undefined) {
    and.push({ isActive });
  }

  if (search) {
    and.push({
      OR: withRussianSearchVariants(search, (variant) => [
        { title: { contains: variant, mode: 'insensitive' as const } },
        { text: { contains: variant, mode: 'insensitive' as const } },
        { category: { contains: variant, mode: 'insensitive' as const } },
        { diagnosis: { contains: variant, mode: 'insensitive' as const } },
        { employee: { fullName: { contains: variant, mode: 'insensitive' as const } } },
      ]),
    });
  }

  return and.length ? { AND: and } : {};
}

function compareMedicalPhrases(left: MedicalPhrase, right: MedicalPhrase) {
  if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;

  const leftRank = getSourceRank(left.source);
  const rightRank = getSourceRank(right.source);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (left.usageCount !== right.usageCount) {
    return right.usageCount - left.usageCount;
  }

  const leftUsed = left.lastUsedAt?.getTime() ?? 0;
  const rightUsed = right.lastUsedAt?.getTime() ?? 0;

  if (leftUsed !== rightUsed) {
    return rightUsed - leftUsed;
  }

  return left.title.localeCompare(right.title, 'ru');
}

function getSourceRank(source: MedicalPhraseSource) {
  if (source === MedicalPhraseSource.EMPLOYEE) {
    return 0;
  }

  if (source === MedicalPhraseSource.DIAGNOSIS_TEMPLATE) {
    return 1;
  }

  return 2;
}

const employeeInclude = {
  employee: { select: { id: true, fullName: true, position: true } },
} satisfies Prisma.MedicalPhraseInclude;

type MedicalPhraseWithEmployee = MedicalPhrase & {
  employee?: { id: string; fullName: string; position: string | null } | null;
};

function serializeMedicalPhrase(phrase: MedicalPhraseWithEmployee) {
  return {
    id: phrase.id,
    field: phrase.field,
    category: phrase.category,
    title: phrase.title,
    text: phrase.text,
    species: phrase.species,
    diagnosis: phrase.diagnosis,
    source: phrase.source,
    isActive: phrase.isActive,
    isAccepted: phrase.isAccepted,
    isPinned: phrase.isPinned,
    isSuggested: phrase.source === MedicalPhraseSource.EMPLOYEE && !phrase.isAccepted && phrase.usageCount >= 2,
    dismissedAt: phrase.dismissedAt,
    employee: phrase.employee
      ? {
          id: phrase.employee.id,
          fullName: phrase.employee.fullName,
          position: phrase.employee.position,
        }
      : null,
    usageCount: phrase.usageCount,
    lastUsedAt: phrase.lastUsedAt,
    createdAt: phrase.createdAt,
    updatedAt: phrase.updatedAt,
  };
}

function normalizeMedicalPhraseInput(dto: UpsertMedicalPhraseDto, existing?: MedicalPhrase) {
  const requestedSource = dto.source ?? existing?.source ?? MedicalPhraseSource.SYSTEM;

  if (!existing && requestedSource === MedicalPhraseSource.EMPLOYEE) {
    throw new BadRequestException('Личные самообученные фразы создаются только автоматически во время приёма');
  }

  const source = existing?.source === MedicalPhraseSource.EMPLOYEE ? MedicalPhraseSource.EMPLOYEE : requestedSource;
  const field = required(dto.field, 'Укажите раздел фразы');
  const title = required(dto.title, 'Укажите название фразы');
  const text = required(dto.text, 'Введите текст фразы');
  const diagnosis = optionalText(dto.diagnosis);

  if (source === MedicalPhraseSource.DIAGNOSIS_TEMPLATE && !diagnosis) {
    throw new BadRequestException('Для шаблона диагноза нужно указать диагноз');
  }

  const scopeKey =
    source === MedicalPhraseSource.EMPLOYEE
      ? (existing?.scopeKey ?? 'employee:unknown')
      : source === MedicalPhraseSource.DIAGNOSIS_TEMPLATE
        ? `diagnosis:${normalizeKey(diagnosis ?? '')}`
        : 'system';

  return {
    field,
    category: optionalText(dto.category),
    title,
    text,
    textHash: hashPhrase(text),
    species: optionalText(dto.species),
    diagnosis,
    source,
    scopeKey,
    employeeId: source === MedicalPhraseSource.EMPLOYEE ? existing?.employeeId : null,
    isActive: dto.isActive ?? existing?.isActive ?? true,
  };
}

function required(value: string | undefined, message: string) {
  const trimmed = optionalText(value);
  if (!trimmed) {
    throw new BadRequestException(message);
  }

  return trimmed;
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeKey(value: string) {
  return normalizePhrase(value).toLocaleLowerCase('ru-RU');
}

function parseOptionalBoolean(value: string | undefined) {
  if (value === undefined || value === '') {
    return undefined;
  }

  return value === 'true';
}

async function ensureUniquePhrase(
  prisma: PrismaService,
  field: string,
  scopeKey: string,
  textHash: string,
  excludeId?: string,
) {
  const duplicate = await prisma.medicalPhrase.findFirst({
    where: {
      field,
      scopeKey,
      textHash,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new BadRequestException('Такая быстрая фраза уже есть в этом разделе');
  }
}

function extractCandidates(text: string | null | undefined) {
  if (!text) {
    return [];
  }

  const seen = new Set<string>();
  const candidates: string[] = [];
  const chunks = text.split(/\n|;/u);

  for (const chunk of chunks) {
    const candidate = normalizePhrase(chunk.replace(/^[-*\d.)\s]+/u, ''));
    const key = candidate.toLocaleLowerCase('ru-RU');

    if (!isUsefulCandidate(candidate) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    candidates.push(candidate);

    if (candidates.length >= 8) {
      break;
    }
  }

  return candidates;
}

function isUsefulCandidate(candidate: string) {
  return candidate.length >= 12 && candidate.length <= 400 && !/^[\d\s.,:+-]+$/u.test(candidate);
}

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/gu, ' ');
}

function hashPhrase(value: string) {
  return createHash('sha256').update(normalizePhrase(value).toLocaleLowerCase('ru-RU')).digest('hex');
}

function buildTitle(text: string) {
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function getEmployeeScopeKey(employeeId: string) {
  return `employee:${employeeId}`;
}
