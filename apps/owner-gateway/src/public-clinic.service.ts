import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { buildClinicSiteAnalyticsSummary } from './clinic-site-analytics';
import { CreatePublicClinicAnalyticsEventDto } from './dto/create-public-clinic-analytics-event.dto';
import { CreatePublicClinicInquiryDto } from './dto/create-public-clinic-inquiry.dto';
import { PrismaService } from './prisma.service';
import { BoundedRateLimiter } from './abuse-protection';
import { contactPhone } from './clinic-contact';

@Injectable()
export class PublicClinicService {
  private readonly limits = new BoundedRateLimiter();

  constructor(private readonly prisma: PrismaService) {}

  async createInquiry(dto: CreatePublicClinicInquiryDto, clientIp: string) {
    this.limits.consume(`inquiry:${clientIp}`, 5);
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
        phone: contactPhone(dto.phone),
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
    this.limits.consume(`analytics:${clientIp}`, 240);
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
