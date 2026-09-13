import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PortalInviteChannel, PortalInviteStatus } from './generated/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { hashToken } from './security';
import { PortalPushSubscriptionDto } from './dto/portal-push-subscription.dto';
import { WebPushService } from './web-push.service';
import { CreatePortalBookingRequestDto } from './dto/create-portal-booking-request.dto';

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

  async getDocument(sessionToken: string, sourceFileId: string) {
    const session = await this.resolveSession(sessionToken);
    const payload = session.owner.payload;
    const files = payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.files)
      ? payload.files : [];
    const allowedFile = files.find((file) => file && typeof file === 'object' && !Array.isArray(file) && file.id === sourceFileId);
    if (!allowedFile || typeof allowedFile !== 'object' || Array.isArray(allowedFile)) {
      throw new NotFoundException('Документ недоступен в личном кабинете');
    }
    const document = await this.prisma.portalDocument.findUnique({
      where: { ownerId_sourceFileId: { ownerId: session.ownerId, sourceFileId } },
      select: { fileName: true, mimeType: true, content: true, checksumSha256: true },
    });
    if (!document || !document.content) throw new NotFoundException('Документ не найден или ещё не синхронизирован');
    if (typeof allowedFile.checksumSha256 === 'string' && allowedFile.checksumSha256 !== document.checksumSha256) {
      throw new NotFoundException('Обновлённый документ ещё не синхронизирован');
    }
    return { ...document, content: Buffer.from(document.content) };
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

  async listBookingRequests(sessionToken: string) {
    const session = await this.resolveSession(sessionToken);
    const requests = await this.prisma.portalBookingRequest.findMany({
      where: { ownerId: session.ownerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        animalId: true,
        animalNickname: true,
        preferredAt: true,
        comment: true,
        status: true,
        createdAt: true,
      },
    });
    const snapshot = session.owner.payload as Record<string, unknown> | null;
    const confirmations = Array.isArray(snapshot?.bookingRequests) ? snapshot.bookingRequests : [];
    const appointments = Array.isArray(snapshot?.appointments) ? snapshot.appointments : [];
    return requests.map((request) => {
      const confirmation = confirmations.find((value) => value && typeof value === 'object' && value.externalRequestId === request.id);
      const change = /^(Отмена|Перенос) записи от .+ \(№ ([^)]+)\)\./.exec(request.comment ?? '');
      const original = change ? appointments.find((value) => value && typeof value === 'object' && value.id === change[2] && value.animal?.id === request.animalId) : null;
      const appointment = original ? { id: original.id, startsAt: original.startsAt, endsAt: original.endsAt, status: original.status } : confirmation?.appointment ?? null;
      return { ...request, clinicStatus: confirmation?.status ?? null, appointment, clinicUpdatedAt: confirmation?.updatedAt ?? null };
    });
  }

  async createBookingRequest(sessionToken: string, dto: CreatePortalBookingRequestDto) {
    const session = await this.resolveSession(sessionToken);
    if (!dto.contactConsent) {
      throw new BadRequestException('Подтвердите согласие на связь по заявке');
    }

    const animals = readSnapshotAnimals(session.owner.payload);
    const selectedAnimal = dto.animalId
      ? animals.find((animal) => animal.id === dto.animalId)
      : null;
    if (dto.animalId && !selectedAnimal) {
      throw new BadRequestException('Выбранный пациент не найден в личном кабинете');
    }

    const animalNickname = clean(selectedAnimal?.nickname ?? dto.animalNickname);
    if (!animalNickname) {
      throw new BadRequestException('Укажите пациента');
    }

    let comment = clean(dto.comment);
    if (dto.requestType === 'RESCHEDULE' || dto.requestType === 'CANCEL') {
      const snapshot = session.owner.payload as Record<string, unknown> | null;
      const appointments = Array.isArray(snapshot?.appointments) ? snapshot.appointments : [];
      const appointment = appointments.find((value) => value && typeof value === 'object' && value.id === dto.appointmentId);
      if (!appointment || appointment.animal?.id !== selectedAnimal?.id || !['PLANNED', 'CONFIRMED'].includes(appointment.status)) {
        throw new BadRequestException('Запись недоступна для изменения. Обновите кабинет и обратитесь в клинику.');
      }
      // A request goes through the existing administrator inbox; the schedule is never changed here.
      const label = dto.requestType === 'CANCEL' ? 'Отмена записи' : 'Перенос записи';
      comment = `${label} от ${appointment.startsAt} (№ ${appointment.id}). ${comment ?? ''}`.trim();
    }
    const preferredAt = dto.preferredAt ? new Date(dto.preferredAt) : null;
    if (preferredAt && (Number.isNaN(preferredAt.getTime()) || preferredAt <= new Date())) {
      throw new BadRequestException('Выберите будущую дату и время');
    }

    return this.prisma.portalBookingRequest.upsert({
      where: {
        ownerId_clientRequestId: {
          ownerId: session.ownerId,
          clientRequestId: dto.clientRequestId.trim(),
        },
      },
      create: {
        ownerId: session.ownerId,
        clientRequestId: dto.clientRequestId.trim(),
        animalId: selectedAnimal?.id ?? null,
        animalNickname,
        animalSpecies: clean(selectedAnimal?.species ?? dto.animalSpecies),
        preferredAt,
        comment,
        contactConsent: true,
      },
      update: {},
      select: {
        id: true,
        animalId: true,
        animalNickname: true,
        preferredAt: true,
        comment: true,
        status: true,
        createdAt: true,
      },
    });
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

function readSnapshotAnimals(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  const animals = (payload as { animals?: unknown }).animals;
  if (!Array.isArray(animals)) {
    return [];
  }

  return animals.flatMap((animal) => {
    if (!animal || typeof animal !== 'object' || Array.isArray(animal)) {
      return [];
    }
    const value = animal as { id?: unknown; nickname?: unknown; species?: unknown };
    if (typeof value.id !== 'string' || typeof value.nickname !== 'string') {
      return [];
    }
    return [{
      id: value.id,
      nickname: value.nickname,
      species: typeof value.species === 'string' ? value.species : null,
    }];
  });
}

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
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
