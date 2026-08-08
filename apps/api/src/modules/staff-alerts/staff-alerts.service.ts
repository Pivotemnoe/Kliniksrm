import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationStatus,
  OnlineRequestStatus,
  PaymentStatus,
  VisitStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthEmployee } from '../auth/auth.types';
import {
  buildOverdueVisitWhere,
  formatVisitOverdueDuration,
  getVisitOverdueAt,
  VISIT_OVERDUE_THRESHOLD_MINUTES,
} from '../visits/visit-overdue';
import { resolveVaccinationDues } from '../animals/vaccination-due';

type StaffAlertSeverity = 'info' | 'warning' | 'error';

type StaffAlertCandidate = {
  key: string;
  kind: 'UNFINISHED_VISIT' | 'TODAY_VACCINATION' | 'OVERDUE_VACCINATION' | 'FAILED_DELIVERY' | 'ONLINE_REQUEST' | 'UNPAID_BILL' | 'LOW_STOCK' | 'NEWS';
  title: string;
  description: string;
  href: string;
  count: number;
  severity: StaffAlertSeverity;
  occurredAt: Date;
  version: string;
};

@Injectable()
export class StaffAlertsService {
  private readonly logger = new Logger(StaffAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(actor: AuthEmployee) {
    const candidates = await this.buildCandidates(actor);
    const reads = candidates.length
      ? await this.prisma.staffAlertRead.findMany({
          where: { employeeId: actor.id, alertKey: { in: candidates.map((item) => item.key) } },
          select: { alertKey: true, version: true, readAt: true },
        })
      : [];
    const readsByKey = new Map(reads.map((read) => [read.alertKey, read]));
    const items = candidates
      .map((item) => {
        const read = readsByKey.get(item.key);
        return {
          ...item,
          unread: !read || read.version !== item.version,
          readAt: read?.version === item.version ? read.readAt : null,
        };
      })
      .sort(compareAlerts);

    return {
      items,
      unreadTotal: items.filter((item) => item.unread).length,
      activeTotal: items.length,
    };
  }

  async markRead(alertKey: string, actor: AuthEmployee) {
    const alert = (await this.buildCandidates(actor)).find((item) => item.key === alertKey);
    if (!alert) {
      throw new NotFoundException('Оповещение уже неактуально или недоступно этому сотруднику');
    }

    const read = await this.prisma.staffAlertRead.upsert({
      where: { employeeId_alertKey: { employeeId: actor.id, alertKey } },
      create: { employeeId: actor.id, alertKey, version: alert.version },
      update: { version: alert.version, readAt: new Date() },
    });

    await this.auditService.log({
      actorId: actor.id,
      action: 'staff_alert.read',
      entityType: 'StaffAlert',
      entityId: alertKey,
      metadata: { kind: alert.kind, version: alert.version },
    });

    return { ok: true, alertKey, readAt: read.readAt };
  }

  async markAllRead(actor: AuthEmployee) {
    const alerts = await this.buildCandidates(actor);
    const readAt = new Date();
    if (!alerts.length) {
      return { ok: true, count: 0, readAt };
    }
    await this.prisma.$transaction(
      alerts.map((alert) => this.prisma.staffAlertRead.upsert({
        where: { employeeId_alertKey: { employeeId: actor.id, alertKey: alert.key } },
        create: { employeeId: actor.id, alertKey: alert.key, version: alert.version, readAt },
        update: { version: alert.version, readAt },
      })),
    );

    await this.auditService.log({
      actorId: actor.id,
      action: 'staff_alert.read_all',
      entityType: 'StaffAlert',
      entityId: actor.id,
      metadata: { count: alerts.length },
    });

    return { ok: true, count: alerts.length, readAt };
  }

  private async buildCandidates(actor: AuthEmployee): Promise<StaffAlertCandidate[]> {
    const now = new Date();
    const can = (permission: string) => actor.permissions.includes('*') || actor.permissions.includes(permission);
    const showFailedDeliveries = can('notifications.manage');
    const showOnlineRequests = can('appointments.manage');
    const showBills = can('billing.manage') || can('payments.manage');
    const showStock = can('stock.manage');
    const showNews = can('news.read');

    const warehouseAccesses = showStock
      ? await this.prisma.employeeWarehouseAccess.findMany({
          where: { employeeId: actor.id },
          select: { warehouseId: true },
        })
      : [];
    const warehouseIds = warehouseAccesses.map((access) => access.warehouseId);

    const [visits, failedDeliveries, onlineRequests, unpaidBills, stockProducts, unreadNews, vaccinationCandidates] = await Promise.all([
      this.prisma.visit.findMany({
        where: buildOverdueVisitWhere(now),
        orderBy: { startedAt: 'asc' },
        take: 40,
        select: {
          id: true,
          status: true,
          startedAt: true,
          owner: { select: { fullName: true } },
          animal: { select: { nickname: true } },
          employee: { select: { fullName: true } },
        },
      }),
      showFailedDeliveries
        ? this.loadOptionalCandidates('failed deliveries', () => this.prisma.notificationOutbox.findMany({
            where: { status: NotificationStatus.FAILED },
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: { id: true, updatedAt: true },
          }))
        : Promise.resolve([]),
      showOnlineRequests
        ? this.loadOptionalCandidates('online requests', () => this.prisma.onlineAppointmentRequest.findMany({
            where: { status: OnlineRequestStatus.NEW },
            orderBy: { createdAt: 'desc' },
            take: 200,
            select: { id: true, createdAt: true },
          }))
        : Promise.resolve([]),
      showBills
        ? this.loadOptionalCandidates('unpaid bills', () => this.prisma.bill.findMany({
            where: { status: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] } },
            orderBy: { updatedAt: 'desc' },
            take: 500,
            select: { id: true, status: true, totalAmount: true, paidAmount: true, updatedAt: true },
          }))
        : Promise.resolve([]),
      showStock
        ? this.loadOptionalCandidates('low stock', () => this.prisma.product.findMany({
            where: { isActive: true, minStock: { not: null } },
            orderBy: { title: 'asc' },
            take: 500,
            select: {
              id: true,
              title: true,
              minStock: true,
              updatedAt: true,
              batches: {
                where: {
                  rest: { gt: 0 },
                  ...(warehouseIds.length ? { warehouseId: { in: warehouseIds } } : {}),
                },
                select: { rest: true, updatedAt: true },
              },
            },
          }))
        : Promise.resolve([]),
      showNews
        ? this.loadOptionalCandidates('news', () => this.prisma.newsPost.findMany({
            where: {
              archivedAt: null,
              OR: [{ audienceRoleCodes: { isEmpty: true } }, { audienceRoleCodes: { hasSome: actor.roles } }],
              reads: { none: { employeeId: actor.id } },
            },
            orderBy: { publishedAt: 'desc' },
            take: 100,
            select: { id: true, publishedAt: true },
          }))
        : Promise.resolve([]),
      this.prisma.vaccination.findMany({
        where: { expiresAt: { not: null } },
        orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
        take: 2000,
        select: {
          id: true,
          title: true,
          expiresAt: true,
          animal: {
            select: {
              id: true,
              nickname: true,
              owner: { select: { fullName: true, phone: true } },
            },
          },
        },
      }),
    ]);

    const items: StaffAlertCandidate[] = visits.map((visit) => {
      const overdueAt = getVisitOverdueAt(visit.startedAt);
      return {
        key: `visit:${visit.id}`,
        kind: 'UNFINISHED_VISIT',
        title: `Незавершённый приём более часа: ${visit.animal.nickname}`,
        description: `В работе ${formatVisitOverdueDuration(visit.startedAt, now)} · ${visit.owner.fullName} · ${visit.employee?.fullName ?? 'врач не указан'}`,
        href: `/visits/${visit.id}`,
        count: 1,
        severity: 'error',
        occurredAt: overdueAt,
        version: hashVersion([visit.id, VisitStatus.IN_PROGRESS, overdueAt.toISOString(), VISIT_OVERDUE_THRESHOLD_MINUTES]),
      };
    });

    const vaccinationDues = resolveVaccinationDues(vaccinationCandidates, now);
    for (const vaccination of vaccinationDues.today) {
      items.push({
        key: `vaccination:today:${vaccination.id}`,
        kind: 'TODAY_VACCINATION',
        title: `Сегодня вакцинация: ${vaccination.animal.nickname}`,
        description: `${vaccination.title} · ${vaccination.animal.owner.fullName}${vaccination.animal.owner.phone ? ` · ${vaccination.animal.owner.phone}` : ''}`,
        href: `/patients/${vaccination.animal.id}`,
        count: 1,
        severity: 'warning',
        occurredAt: vaccinationDues.todayAvailableAt,
        version: hashVersion([vaccination.id, vaccination.expiresAt?.toISOString(), 'today-08-msk']),
      });
    }
    for (const vaccination of vaccinationDues.overdue) {
      items.push({
        key: `vaccination:overdue:${vaccination.id}`,
        kind: 'OVERDUE_VACCINATION',
        title: `Просрочена вакцинация: ${vaccination.animal.nickname}`,
        description: `${vaccination.title} · ${vaccination.animal.owner.fullName}${vaccination.animal.owner.phone ? ` · ${vaccination.animal.owner.phone}` : ''}`,
        href: `/patients/${vaccination.animal.id}`,
        count: 1,
        severity: 'error',
        occurredAt: vaccination.expiresAt!,
        version: hashVersion([vaccination.id, vaccination.expiresAt?.toISOString(), 'overdue']),
      });
    }

    if (failedDeliveries.length) {
      items.push(aggregateAlert({
        key: 'delivery:failed',
        kind: 'FAILED_DELIVERY',
        title: 'Не отправлены сообщения владельцам',
        description: `Ошибок отправки: ${failedDeliveries.length}`,
        href: '/messages?status=FAILED',
        count: failedDeliveries.length,
        severity: 'error',
        records: failedDeliveries.map((item) => [item.id, item.updatedAt.toISOString()]),
        occurredAt: failedDeliveries[0].updatedAt,
      }));
    }

    if (onlineRequests.length) {
      items.push(aggregateAlert({
        key: 'appointments:new-online-requests',
        kind: 'ONLINE_REQUEST',
        title: 'Новые заявки на приём',
        description: `Ожидают разбора: ${onlineRequests.length}`,
        href: '/online-requests',
        count: onlineRequests.length,
        severity: 'info',
        records: onlineRequests.map((item) => [item.id, item.createdAt.toISOString()]),
        occurredAt: onlineRequests[0].createdAt,
      }));
    }

    const debtBills = unpaidBills.filter((bill) => Number(bill.totalAmount) > Number(bill.paidAmount));
    if (debtBills.length) {
      items.push(aggregateAlert({
        key: 'billing:unpaid',
        kind: 'UNPAID_BILL',
        title: 'Счета с задолженностью',
        description: `Не оплачены полностью: ${debtBills.length}`,
        href: '/bills?debtOnly=true',
        count: debtBills.length,
        severity: 'warning',
        records: debtBills.map((item) => [
          item.id,
          item.status,
          item.totalAmount.toString(),
          item.paidAmount.toString(),
          item.updatedAt.toISOString(),
        ]),
        occurredAt: debtBills[0].updatedAt,
      }));
    }

    const lowStockProducts = stockProducts
      .map((product) => {
        const rest = product.batches.reduce((sum, batch) => sum + Number(batch.rest), 0);
        const latestAt = product.batches.reduce(
          (latest, batch) => batch.updatedAt > latest ? batch.updatedAt : latest,
          product.updatedAt,
        );
        return { ...product, rest, latestAt };
      })
      .filter((product) => product.minStock !== null && product.rest <= Number(product.minStock));
    if (lowStockProducts.length) {
      const preview = lowStockProducts.slice(0, 3).map((product) => product.title).join(', ');
      items.push(aggregateAlert({
        key: 'stock:low',
        kind: 'LOW_STOCK',
        title: 'Низкие остатки товаров',
        description: `${lowStockProducts.length}: ${preview}${lowStockProducts.length > 3 ? '…' : ''}`,
        href: '/stock',
        count: lowStockProducts.length,
        severity: 'warning',
        records: lowStockProducts.map((item) => [item.id, item.rest, item.minStock?.toString(), item.latestAt.toISOString()]),
        occurredAt: latestDate(lowStockProducts.map((item) => item.latestAt)),
      }));
    }

    if (unreadNews.length) {
      items.push(aggregateAlert({
        key: 'news:unread',
        kind: 'NEWS',
        title: 'Непрочитанные новости клиники',
        description: `Новых публикаций: ${unreadNews.length}`,
        href: '/news',
        count: unreadNews.length,
        severity: 'info',
        records: unreadNews.map((item) => [item.id, item.publishedAt.toISOString()]),
        occurredAt: unreadNews[0].publishedAt,
      }));
    }

    return items;
  }

  private async loadOptionalCandidates<T>(section: string, load: () => Promise<T[]>): Promise<T[]> {
    try {
      return await load();
    } catch (error) {
      this.logger.error(
        `Не удалось загрузить необязательный раздел оповещений: ${section}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }
}

function aggregateAlert(input: Omit<StaffAlertCandidate, 'version'> & { records: unknown[] }): StaffAlertCandidate {
  const { records, ...alert } = input;
  return { ...alert, version: hashVersion(records) };
}

function hashVersion(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function latestDate(values: Date[]) {
  return values.reduce((latest, value) => value > latest ? value : latest, new Date(0));
}

function compareAlerts(left: StaffAlertCandidate & { unread: boolean }, right: StaffAlertCandidate & { unread: boolean }) {
  if (left.unread !== right.unread) return left.unread ? -1 : 1;
  const severityOrder: Record<StaffAlertSeverity, number> = { error: 0, warning: 1, info: 2 };
  const severityDifference = severityOrder[left.severity] - severityOrder[right.severity];
  return severityDifference || right.occurredAt.getTime() - left.occurredAt.getTime();
}
