import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ClientPortalStatus, JobStatus, Prisma, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OwnerGatewayClient } from './providers/owner-gateway.client';

const QUEUE_NAME = 'owner-gateway-snapshot';
const JOB_NAME = 'sync-owner-snapshot';
const MAX_ATTEMPTS = 96;
const STUCK_JOB_MINUTES = 10;

type SnapshotSyncJobInput = {
  ownerId: string;
  visitId: string | null;
  visitStatus: VisitStatus | null;
  actorId: string | null;
};

type SnapshotSyncPayload = SnapshotSyncJobInput & {
  attempts: number;
  nextAttemptAt: string;
};

@Injectable()
export class OwnerGatewaySnapshotSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OwnerGatewaySnapshotSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownerGatewayClient: OwnerGatewayClient,
    private readonly auditService: AuditService,
  ) {}

  async onApplicationBootstrap() {
    await this.recoverStuckJobs();
    try {
      await this.enqueueActivePortalRefreshes();
    } catch (error) {
      this.logger.warn(`Не удалось поставить стартовое обновление личных кабинетов в очередь: ${errorMessage(error)}`);
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

  enqueue(input: SnapshotSyncJobInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const payload = {
      ...input,
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;

    return client.backgroundJob.create({
      data: {
        queueName: QUEUE_NAME,
        jobName: JOB_NAME,
        status: JobStatus.PENDING,
        payload,
      },
    });
  }

  async syncNow() {
    if (this.running) return;

    this.running = true;
    try {
      const now = Date.now();
      const pendingJobs = await this.prisma.backgroundJob.findMany({
        where: { queueName: QUEUE_NAME, jobName: JOB_NAME, status: JobStatus.PENDING },
        orderBy: [{ createdAt: 'asc' }],
      });
      const dueJobs = pendingJobs
        .map((job) => ({ job, payload: readPayload(job.payload) }))
        .filter(({ payload }) => !payload || new Date(payload.nextAttemptAt).getTime() <= now)
        .slice(0, 20);

      for (const { job, payload } of dueJobs) {
        if (!payload) {
          await this.prisma.backgroundJob.update({
            where: { id: job.id },
            data: { status: JobStatus.FAILED, error: 'Некорректные данные задачи обновления личного кабинета' },
          });
          continue;
        }
        await this.processJob(job.id, payload);
      }
    } catch (error) {
      this.logger.error(`Не удалось обработать очередь обновления личных кабинетов: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async processJob(jobId: string, payload: SnapshotSyncPayload) {
    const claim = await this.prisma.backgroundJob.updateMany({
      where: { id: jobId, status: JobStatus.PENDING },
      data: { status: JobStatus.RUNNING, error: null },
    });
    if (!claim.count) return;

    const attempt = payload.attempts + 1;
    let status: Awaited<ReturnType<OwnerGatewayClient['syncSnapshot']>>;
    try {
      const owner = await this.prisma.owner.findUnique({
        where: { id: payload.ownerId },
        select: { id: true, fullName: true },
      });

      if (!owner) {
        await this.finishFailed(jobId, payload, attempt, 'Владелец для обновления личного кабинета не найден');
        return;
      }

      status = await this.ownerGatewayClient.syncSnapshot({ ownerId: owner.id, displayName: owner.fullName });
    } catch (error) {
      await this.scheduleRetry(jobId, payload, attempt, `Ошибка обновления личного кабинета: ${errorMessage(error)}`);
      return;
    }

    if (status === 'synced') {
      const completedAt = new Date().toISOString();
      await this.prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.DONE,
          result: { status, attempts: attempt, completedAt },
          error: null,
        },
      });
      await this.auditService.log({
        actorId: payload.actorId,
        action: 'client_portal.snapshot_sync_automatic',
        entityType: 'Owner',
        entityId: payload.ownerId,
        metadata: {
          status,
          attempts: attempt,
          visitId: payload.visitId,
          visitStatus: payload.visitStatus,
          jobId,
        },
      });
      return;
    }

    const reason = status === 'skipped_not_configured'
      ? 'Публичный шлюз личного кабинета не настроен'
      : 'Публичный шлюз не подтвердил обновление личного кабинета';

    await this.scheduleRetry(jobId, payload, attempt, reason);
  }

  private async scheduleRetry(jobId: string, payload: SnapshotSyncPayload, attempt: number, reason: string) {
    if (attempt >= MAX_ATTEMPTS) {
      await this.finishFailed(jobId, payload, attempt, reason);
      return;
    }

    const delaySeconds = Math.min(15 * 2 ** Math.min(attempt - 1, 7), 30 * 60);
    const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PENDING,
        payload: { ...payload, attempts: attempt, nextAttemptAt },
        error: `${reason}. Повтор запланирован на ${nextAttemptAt}`,
      },
    });
  }

  private async finishFailed(jobId: string, payload: SnapshotSyncPayload, attempts: number, error: string) {
    await this.prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        payload: { ...payload, attempts },
        error,
      },
    });
    await this.auditService.log({
      actorId: payload.actorId,
      action: 'client_portal.snapshot_sync_automatic',
      entityType: 'Owner',
      entityId: payload.ownerId,
      metadata: {
        status: 'failed',
        attempts,
        visitId: payload.visitId,
        visitStatus: payload.visitStatus,
        jobId,
        error,
      },
    });
  }

  private async recoverStuckJobs() {
    const staleBefore = new Date(Date.now() - STUCK_JOB_MINUTES * 60_000);
    await this.prisma.backgroundJob.updateMany({
      where: {
        queueName: QUEUE_NAME,
        jobName: JOB_NAME,
        status: JobStatus.RUNNING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: JobStatus.PENDING,
        error: 'Предыдущее обновление было прервано; задача возвращена в очередь',
      },
    });
  }

  private async enqueueActivePortalRefreshes() {
    if (!hasConfiguredOwnerGateway()) return;

    const [activeAccesses, outstandingJobs] = await Promise.all([
      this.prisma.clientPortalAccess.findMany({
        where: { status: { in: [ClientPortalStatus.INVITED, ClientPortalStatus.ENABLED] } },
        select: { ownerId: true },
      }),
      this.prisma.backgroundJob.findMany({
        where: {
          queueName: QUEUE_NAME,
          jobName: JOB_NAME,
          status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
        },
        select: { payload: true },
      }),
    ]);

    const queuedOwnerIds = new Set(
      outstandingJobs
        .map((job) => readPayload(job.payload)?.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    );

    for (const access of activeAccesses) {
      if (queuedOwnerIds.has(access.ownerId)) continue;
      await this.enqueue({
        ownerId: access.ownerId,
        visitId: null,
        visitStatus: null,
        actorId: null,
      });
    }
  }
}

function readPayload(value: Prisma.JsonValue | null): SnapshotSyncPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const payload = value as Record<string, Prisma.JsonValue>;
  if (
    typeof payload.ownerId !== 'string'
    || (payload.visitId !== null && payload.visitId !== undefined && typeof payload.visitId !== 'string')
    || (payload.actorId !== null && payload.actorId !== undefined && typeof payload.actorId !== 'string')
    || (payload.visitStatus !== null && payload.visitStatus !== undefined && !isVisitStatus(payload.visitStatus))
  ) return null;

  return {
    ownerId: payload.ownerId,
    visitId: typeof payload.visitId === 'string' ? payload.visitId : null,
    actorId: typeof payload.actorId === 'string' ? payload.actorId : null,
    visitStatus: isVisitStatus(payload.visitStatus) ? payload.visitStatus : null,
    attempts: typeof payload.attempts === 'number' && Number.isFinite(payload.attempts) ? Math.max(0, Math.trunc(payload.attempts)) : 0,
    nextAttemptAt: typeof payload.nextAttemptAt === 'string' ? payload.nextAttemptAt : new Date(0).toISOString(),
  };
}

function isVisitStatus(value: Prisma.JsonValue | undefined): value is VisitStatus {
  return value === VisitStatus.COMPLETED || value === VisitStatus.CANCELLED;
}

function getSyncIntervalMs() {
  const configured = Number(process.env.OWNER_GATEWAY_SNAPSHOT_SYNC_INTERVAL_MS);
  if (!Number.isFinite(configured)) return 5_000;
  return Math.min(Math.max(Math.trunc(configured), 1_000), 60_000);
}

function hasConfiguredOwnerGateway() {
  return Boolean(process.env.OWNER_GATEWAY_URL?.trim() && process.env.OWNER_GATEWAY_SYNC_SECRET?.trim());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
