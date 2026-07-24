import { ForbiddenException, Injectable } from '@nestjs/common';
import { PortalInviteChannel, PortalInviteStatus } from './generated/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { hashToken } from './security';
import { PortalPushSubscriptionDto } from './dto/portal-push-subscription.dto';
import { WebPushService } from './web-push.service';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushService: WebPushService,
  ) {}

  async exchangeInvitation(inviteToken: string) {
    const invitation = await this.prisma.portalInvitation.findUnique({
      where: { tokenHash: hashToken(inviteToken.trim()) },
      include: { owner: { select: { ownerId: true } } },
    });

    if (
      !invitation ||
      invitation.status !== PortalInviteStatus.ACTIVE ||
      invitation.expiresAt <= new Date()
    ) {
      throw new ForbiddenException('Приглашение недействительно или уже использовано');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = addDays(new Date(), getSessionDays());
    const transferToken = invitation.channel === PortalInviteChannel.MAX ? randomBytes(32).toString('hex') : null;
    const transferExpiresAt = transferToken ? addMinutes(new Date(), getTransferMinutes()) : null;

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.portalInvitation.updateMany({
        where: { id: invitation.id, status: PortalInviteStatus.ACTIVE, expiresAt: { gt: new Date() } },
        data: { status: PortalInviteStatus.REDEEMED, redeemedAt: new Date() },
      });

      if (consumed.count !== 1) {
        throw new ForbiddenException('Приглашение недействительно или уже использовано');
      }

      await tx.portalSession.create({
        data: {
          ownerId: invitation.ownerId,
          inviteId: invitation.id,
          tokenHash: hashToken(sessionToken),
          expiresAt,
        },
      });

      if (transferToken && transferExpiresAt) {
        await tx.portalInvitation.create({
          data: {
            ownerId: invitation.ownerId,
            tokenHash: hashToken(transferToken),
            channel: PortalInviteChannel.WEB,
            expiresAt: transferExpiresAt,
          },
        });
      }
    });

    return { sessionToken, expiresAt, transferToken, transferExpiresAt };
  }

  async createSessionTransfer(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const transferToken = randomBytes(32).toString('hex');
    const expiresAt = addMinutes(new Date(), getTransferMinutes());

    await this.prisma.portalInvitation.create({
      data: {
        ownerId: session.ownerId,
        tokenHash: hashToken(transferToken),
        channel: PortalInviteChannel.WEB,
        expiresAt,
      },
    });

    return { transferToken, expiresAt };
  }

  async getSnapshot(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const sessionExpiresAt = addDays(new Date(), getSessionDays());

    await this.prisma.portalSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: sessionExpiresAt },
    });

    return {
      ownerId: session.owner.ownerId,
      displayName: session.owner.displayName,
      snapshot: session.owner.payload,
      sourceVersion: session.owner.sourceVersion,
      sourceUpdatedAt: session.owner.sourceUpdatedAt,
      syncedAt: session.owner.syncedAt,
      sessionExpiresAt,
    };
  }

  async revokeSession(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    await this.prisma.$transaction([
      this.prisma.portalPushSubscription.deleteMany({ where: { sessionId: session.id } }),
      this.prisma.portalSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }

  async getPushConfig(sessionToken: string) {
    await this.resolveSession(sessionToken);
    return this.webPushService.getPublicConfig();
  }

  async savePushSubscription(sessionToken: string, dto: PortalPushSubscriptionDto, userAgent?: string) {
    const session = await this.resolveSession(sessionToken);
    await this.prisma.portalPushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        ownerId: session.ownerId,
        sessionId: session.id,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: userAgent?.slice(0, 500) || null,
      },
      update: {
        ownerId: session.ownerId,
        sessionId: session.id,
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: userAgent?.slice(0, 500) || null,
        failureCount: 0,
        disabledAt: null,
      },
    });
    return { ok: true };
  }

  async removePushSubscription(sessionToken: string, endpoint: string) {
    const session = await this.resolveSession(sessionToken);
    const result = await this.prisma.portalPushSubscription.deleteMany({
      where: { endpoint, sessionId: session.id },
    });
    return { ok: true, removed: result.count };
  }

  private async resolveSession(sessionToken: string) {
    const session = await this.prisma.portalSession.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      include: { owner: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new ForbiddenException('Сессия личного кабинета недействительна');
    }

    return session;
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getSessionDays() {
  const value = Number(process.env.OWNER_GATEWAY_SESSION_DAYS ?? 365);
  return Number.isFinite(value) && value >= 1 && value <= 365 ? value : 365;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function getTransferMinutes() {
  const value = Number(process.env.OWNER_GATEWAY_TRANSFER_MINUTES ?? 10);
  return Number.isFinite(value) && value >= 3 && value <= 30 ? value : 10;
}
