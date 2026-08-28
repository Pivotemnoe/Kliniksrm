import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { buildClinicSiteAnalyticsSummary } from './clinic-site-analytics';
import { CreatePublicClinicAnalyticsEventDto } from './dto/create-public-clinic-analytics-event.dto';
import { CreatePublicClinicInquiryDto } from './dto/create-public-clinic-inquiry.dto';
import { PrismaService } from './prisma.service';

type RateWindow = { startedAt: number; count: number };

const RATE_WINDOW_DURATION_MS = 10 * 60 * 1000;
const MAX_TRACKED_RATE_LIMIT_CLIENTS = 10_000;
const RATE_LIMIT_CLIENTS_AFTER_PRUNE = 9_000;

@Injectable()
export class PublicClinicService {
  private readonly inquiryRateWindows = new Map<string, RateWindow>();
  private readonly analyticsRateWindows = new Map<string, RateWindow>();

  constructor(private readonly prisma: PrismaService) {}

  async createInquiry(dto: CreatePublicClinicInquiryDto, clientIp: string) {
    this.assertRateLimit(this.inquiryRateWindows, clientIp, 5);
    if (clean(dto.website)) {
      throw new BadRequestException('Не удалось отправить сообщение');
    }
    if (!dto.contactConsent) {
      throw new BadRequestException('Разрешите клинике связаться с вами по этому вопросу');
    }

    const inquiry = await this.prisma.publicClinicInquiry.upsert({
      where: { clientRequestId: dto.clientRequestId.trim() },
      create: {
        clientRequestId: dto.clientRequestId.trim(),
        contactName: required(dto.contactName),
        phone: required(dto.phone),
        animalNickname: required(dto.animalNickname),
        message: required(dto.message),
        contactConsent: true,
      },
      update: {},
      select: { id: true, status: true, createdAt: true },
    });

    return { ok: true, requestId: inquiry.id, status: 'received', createdAt: inquiry.createdAt };
  }

  async createAnalyticsEvent(dto: CreatePublicClinicAnalyticsEventDto, clientIp: string) {
    this.assertRateLimit(this.analyticsRateWindows, clientIp, 240);
    const event = await this.prisma.publicClinicAnalyticsEvent.upsert({
      where: { eventId: dto.eventId.trim() },
      create: {
        eventId: dto.eventId.trim(),
        sessionId: dto.sessionId.trim(),
        eventName: dto.eventName,
        section: clean(dto.section),
        target: clean(dto.target),
        path: normalizePath(dto.path),
        referrerHost: clean(dto.referrerHost),
        utmSource: clean(dto.utmSource),
        utmMedium: clean(dto.utmMedium),
        utmCampaign: clean(dto.utmCampaign),
        utmContent: clean(dto.utmContent),
        deviceType: clean(dto.deviceType),
        viewportWidth: dto.viewportWidth ?? null,
      },
      update: {},
      select: { id: true, createdAt: true },
    });
    return { ok: true, eventId: event.id, createdAt: event.createdAt };
  }

  async getAnalyticsSummary(daysValue?: string | number) {
    const days = normalizeAnalyticsDays(daysValue);
    const now = new Date();
    const since = new Date(now.getTime() - days * 86_400_000);
    const limit = 50_001;
    const rows = await this.prisma.publicClinicAnalyticsEvent.findMany({
      where: { createdAt: { gte: since, lte: now } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        sessionId: true,
        eventName: true,
        section: true,
        target: true,
        referrerHost: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        deviceType: true,
        createdAt: true,
      },
    });

    return buildClinicSiteAnalyticsSummary({
      events: rows.slice(0, 50_000),
      days,
      now,
      truncated: rows.length === limit,
    });
  }

  private assertRateLimit(windows: Map<string, RateWindow>, clientIp: string, maximum: number) {
    const now = Date.now();
    this.pruneRateWindows(windows, now);
    const current = windows.get(clientIp);
    if (!current || now - current.startedAt >= RATE_WINDOW_DURATION_MS) {
      windows.set(clientIp, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= maximum) {
      throw new HttpException('Слишком много запросов. Попробуйте позднее.', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
  }

  private pruneRateWindows(windows: Map<string, RateWindow>, now: number) {
    if (windows.size < MAX_TRACKED_RATE_LIMIT_CLIENTS) return;

    for (const [clientIp, window] of windows) {
      if (now - window.startedAt >= RATE_WINDOW_DURATION_MS) windows.delete(clientIp);
    }
    if (windows.size < MAX_TRACKED_RATE_LIMIT_CLIENTS) return;

    let overflow = windows.size - RATE_LIMIT_CLIENTS_AFTER_PRUNE;
    for (const clientIp of windows.keys()) {
      windows.delete(clientIp);
      overflow -= 1;
      if (overflow <= 0) break;
    }
  }
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function required(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException('Заполните обязательные поля');
  return normalized;
}

function normalizePath(value: string) {
  const normalized = value.trim();
  return normalized.startsWith('/') ? normalized : '/';
}

function normalizeAnalyticsDays(value?: string | number) {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(Math.round(parsed), 90));
}
