import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OwnerGatewayBookingRequest, OwnerGatewayClient } from '../notifications/providers/owner-gateway.client';

@Injectable()
export class OwnerGatewayBookingSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OwnerGatewayBookingSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ownerGatewayClient: OwnerGatewayClient,
  ) {}

  onApplicationBootstrap() {
    if (process.env.OWNER_GATEWAY_BOOKING_SYNC_ENABLED === 'false') {
      return;
    }
    void this.syncNow();
    this.timer = setInterval(() => void this.syncNow(), getSyncIntervalMs());
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow() {
    if (this.running) {
      return { status: 'already_running' as const, imported: 0, acknowledged: 0 };
    }
    this.running = true;
    let imported = 0;
    let acknowledged = 0;

    try {
      const requests = await this.ownerGatewayClient.pullPendingBookingRequests();
      if (requests === null) {
        return { status: 'not_configured_or_unavailable' as const, imported, acknowledged };
      }

      for (const request of requests) {
        const result = await this.importOne(request);
        imported += result.created ? 1 : 0;
        if (await this.ownerGatewayClient.acknowledgeBookingRequest(request.id, result.crmRequestId)) {
          acknowledged += 1;
        }
      }
      return { status: 'synced' as const, imported, acknowledged };
    } catch (error) {
      this.logger.error(`Не удалось получить онлайн-заявки из личного кабинета: ${errorMessage(error)}`);
      return { status: 'failed' as const, imported, acknowledged };
    } finally {
      this.running = false;
    }
  }

  private async importOne(input: OwnerGatewayBookingRequest) {
    const existing = await this.prisma.onlineAppointmentRequest.findUnique({
      where: { externalRequestId: input.id },
      select: { id: true },
    });
    if (existing) {
      return { crmRequestId: existing.id, created: false };
    }

    const owner = await this.prisma.owner.findUnique({
      where: { id: input.ownerId },
      select: { id: true, fullName: true, phone: true, email: true },
    });
    if (!owner) {
      throw new Error(`Владелец ${input.ownerId} из публичного кабинета не найден`);
    }

    const animal = input.animalId
      ? await this.prisma.animal.findFirst({
          where: { id: input.animalId, ownerId: owner.id, archivedAt: null },
          select: { id: true, nickname: true, species: true, breed: true },
        })
      : null;

    const created = await this.prisma.onlineAppointmentRequest.create({
      data: {
        externalRequestId: input.id,
        source: 'OWNER_GATEWAY',
        ownerId: owner.id,
        animalId: animal?.id ?? null,
        ownerName: owner.fullName,
        phone: owner.phone?.trim() || 'личный кабинет',
        email: owner.email?.trim() || null,
        animalNickname: animal?.nickname || input.animalNickname,
        animalSpecies: animal?.species || input.animalSpecies,
        animalBreed: animal?.breed || null,
        preferredAt: input.preferredAt ? new Date(input.preferredAt) : null,
        comment: input.comment,
      },
      select: { id: true },
    });

    await this.auditService.log({
      action: 'online_request.owner_gateway_import',
      entityType: 'OnlineAppointmentRequest',
      entityId: created.id,
      metadata: { ownerId: owner.id, externalRequestId: input.id, source: input.source },
    });
    return { crmRequestId: created.id, created: true };
  }
}

function getSyncIntervalMs() {
  const configured = Number(process.env.OWNER_GATEWAY_BOOKING_SYNC_INTERVAL_MS ?? 30_000);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.trunc(configured), 10_000), 300_000) : 30_000;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
