import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NewsPriority, Prisma } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNewsPostDto } from './dto/create-news-post.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { UpdateNewsPostDto } from './dto/update-news-post.dto';

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listPosts(query: ListNewsQueryDto, actor: AuthEmployee) {
    const { limit, offset } = parsePagination(query);
    const where = this.buildVisibilityWhere(query, actor);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.newsPost.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
        include: newsPostInclude(actor.id),
        skip: offset,
        take: limit,
      }),
      this.prisma.newsPost.count({ where }),
    ]);

    return {
      items: items.map((post) => serializeNewsPost(post)),
      total,
      limit,
      offset,
    };
  }

  async createPost(dto: CreateNewsPostDto, actor: AuthEmployee) {
    await this.ensureRolesExist(dto.audienceRoleCodes);
    const post = await this.prisma.newsPost.create({
      data: {
        title: required(dto.title, 'Укажите заголовок новости'),
        body: required(dto.body, 'Введите текст новости'),
        priority: dto.priority ?? NewsPriority.INFO,
        isPinned: dto.isPinned ?? false,
        audienceRoleCodes: normalizeAudienceRoles(dto.audienceRoleCodes),
        createdById: actor.id,
      },
      include: newsPostInclude(actor.id),
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'news.create',
      entityType: 'NewsPost',
      entityId: post.id,
      metadata: { priority: post.priority, isPinned: post.isPinned, audienceRoleCodes: post.audienceRoleCodes },
    });

    return serializeNewsPost(post);
  }

  async updatePost(postId: string, dto: UpdateNewsPostDto, actor: AuthEmployee) {
    await this.ensurePostExists(postId);
    await this.ensureRolesExist(dto.audienceRoleCodes);
    const post = await this.prisma.newsPost.update({
      where: { id: postId },
      data: {
        ...(dto.title !== undefined ? { title: required(dto.title, 'Укажите заголовок новости') } : {}),
        ...(dto.body !== undefined ? { body: required(dto.body, 'Введите текст новости') } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isPinned !== undefined ? { isPinned: dto.isPinned } : {}),
        ...(dto.audienceRoleCodes !== undefined ? { audienceRoleCodes: normalizeAudienceRoles(dto.audienceRoleCodes) } : {}),
      },
      include: newsPostInclude(actor.id),
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'news.update',
      entityType: 'NewsPost',
      entityId: post.id,
      metadata: { changedFields: Object.keys(dto), priority: post.priority, isPinned: post.isPinned },
    });

    return serializeNewsPost(post);
  }

  async archivePost(postId: string, actor: AuthEmployee) {
    await this.ensurePostExists(postId);
    const post = await this.prisma.newsPost.update({
      where: { id: postId },
      data: { archivedAt: new Date() },
      include: newsPostInclude(actor.id),
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'news.archive',
      entityType: 'NewsPost',
      entityId: post.id,
      metadata: { archivedAt: post.archivedAt },
    });

    return serializeNewsPost(post);
  }

  async markRead(postId: string, actor: AuthEmployee) {
    await this.ensureVisiblePostExists(postId, actor);
    const read = await this.prisma.newsPostRead.upsert({
      where: { newsPostId_employeeId: { newsPostId: postId, employeeId: actor.id } },
      create: { newsPostId: postId, employeeId: actor.id },
      update: { readAt: new Date() },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'news.read',
      entityType: 'NewsPost',
      entityId: postId,
      metadata: { readAt: read.readAt },
    });

    return { ok: true, readAt: read.readAt };
  }

  private buildVisibilityWhere(query: ListNewsQueryDto, actor: AuthEmployee): Prisma.NewsPostWhereInput {
    const actorRoles = actor.roles;
    const unreadOnly = query.unreadOnly === 'true';
    const includeArchived = query.includeArchived === 'true';
    const search = query.search?.trim();

    return {
      ...(query.priority ? { priority: query.priority } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
      AND: [
        { OR: [{ audienceRoleCodes: { isEmpty: true } }, { audienceRoleCodes: { hasSome: actorRoles } }] },
        ...(search
          ? [
              {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { body: { contains: search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
      ...(unreadOnly ? { reads: { none: { employeeId: actor.id } } } : {}),
    };
  }

  private async ensurePostExists(postId: string) {
    const post = await this.prisma.newsPost.findUnique({ where: { id: postId }, select: { id: true } });

    if (!post) {
      throw new NotFoundException('Новость не найдена');
    }
  }

  private async ensureVisiblePostExists(postId: string, actor: AuthEmployee) {
    const post = await this.prisma.newsPost.findFirst({
      where: {
        id: postId,
        archivedAt: null,
        OR: [{ audienceRoleCodes: { isEmpty: true } }, { audienceRoleCodes: { hasSome: actor.roles } }],
      },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException('Новость не найдена');
    }
  }

  private async ensureRolesExist(roleCodes: string[] | undefined) {
    const codes = normalizeAudienceRoles(roleCodes);
    if (!codes.length) {
      return;
    }

    const roles = await this.prisma.role.findMany({ where: { code: { in: codes } }, select: { code: true } });
    if (roles.length !== codes.length) {
      const foundCodes = new Set(roles.map((role) => role.code));
      const missingCodes = codes.filter((code) => !foundCodes.has(code));
      throw new BadRequestException(`Неизвестные роли: ${missingCodes.join(', ')}`);
    }
  }
}

function normalizeAudienceRoles(roleCodes: string[] | undefined) {
  return [...new Set((roleCodes ?? []).map((code) => code.trim()).filter(Boolean))];
}

function required(value: string | undefined, message: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }

  return trimmed;
}

function newsPostInclude(employeeId: string) {
  return {
    createdBy: { select: { id: true, fullName: true, position: true } },
    reads: { where: { employeeId }, select: { readAt: true } },
  } satisfies Prisma.NewsPostInclude;
}

function serializeNewsPost(post: Prisma.NewsPostGetPayload<{ include: ReturnType<typeof newsPostInclude> }>) {
  const readAt = post.reads[0]?.readAt ?? null;

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    priority: post.priority,
    isPinned: post.isPinned,
    audienceRoleCodes: post.audienceRoleCodes,
    createdBy: post.createdBy,
    publishedAt: post.publishedAt,
    archivedAt: post.archivedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    readAt,
    isRead: Boolean(readAt),
  };
}
