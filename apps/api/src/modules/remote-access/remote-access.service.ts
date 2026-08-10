import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRemoteAccessInvitationDto } from './dto/create-remote-access-invitation.dto';
import { EnrollRemoteDeviceDto } from './dto/enroll-remote-device.dto';
import { UpdateRemoteAccessPolicyDto } from './dto/update-remote-access-policy.dto';

@Injectable()
export class RemoteAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getOverview(currentRemoteDeviceId?: string | null) {
    const organization = await this.getOrganization();
    const policy = await this.ensurePolicy(organization.id);
    const [devices, invitations, eligibleEmployees, recentRemoteLogins] = await Promise.all([
      this.prisma.remoteAccessDevice.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, fullName: true, position: true, status: true } },
          _count: { select: { sessions: true } },
        },
        take: 100,
      }),
      this.prisma.remoteAccessInvitation.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, fullName: true, position: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        take: 30,
      }),
      this.prisma.employee.findMany({
        where: {
          status: EmployeeStatus.ACTIVE,
          userId: { not: null },
        },
        select: { id: true, fullName: true, position: true, roles: { select: { role: { select: { code: true, title: true } } } } },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: 'auth.login',
          metadata: { path: ['accessType'], equals: 'REMOTE' },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          actorId: true,
          actor: { select: { id: true, fullName: true, position: true } },
          metadata: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);
    const devicesById = new Map(devices.map((device) => [device.id, device]));

    return {
      organization: { id: organization.id, displayName: organization.displayName },
      policy,
      gateway: {
        publicUrl: process.env.REMOTE_STAFF_PUBLIC_URL?.trim() || null,
        configured: Boolean(process.env.REMOTE_STAFF_PUBLIC_URL?.trim() && process.env.REMOTE_ACCESS_GATEWAY_SECRET?.trim()),
      },
      currentRemoteDeviceId: currentRemoteDeviceId ?? null,
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        employee: device.employee,
        userAgent: device.userAgent,
        lastIpAddress: device.lastIpAddress,
        lastSeenAt: device.lastSeenAt,
        trustedAt: device.trustedAt,
        revokedAt: device.revokedAt,
        activeSessions: device._count.sessions,
        current: device.id === currentRemoteDeviceId,
      })),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        employee: invitation.employee,
        createdBy: invitation.createdBy,
        deviceName: invitation.deviceName,
        expiresAt: invitation.expiresAt,
        usedAt: invitation.usedAt,
        revokedAt: invitation.revokedAt,
        createdAt: invitation.createdAt,
      })),
      recentRemoteLogins: recentRemoteLogins.map((login) => {
        const remoteDeviceId = readJsonString(login.metadata, 'remoteDeviceId');
        const device = remoteDeviceId ? devicesById.get(remoteDeviceId) : null;
        return {
          id: login.id,
          employee: login.actor,
          device: device ? { id: device.id, name: device.name } : null,
          ipAddress: login.ipAddress,
          loggedInAt: login.createdAt,
        };
      }),
      eligibleEmployees: eligibleEmployees.map((employee) => ({
        id: employee.id,
        fullName: employee.fullName,
        position: employee.position,
        roles: employee.roles.map(({ role }) => ({ code: role.code, title: role.title })),
      })),
    };
  }

  async updatePolicy(dto: UpdateRemoteAccessPolicyDto, actorId: string, ipAddress?: string | null, isRemote = false) {
    const organization = await this.getOrganization();
    const current = await this.ensurePolicy(organization.id);

    if (isRemote && dto.enabled === true && !current.enabled) {
      throw new ForbiddenException('Первое включение удалённого доступа разрешено только внутри клиники');
    }

    if (dto.enabled === true && (!process.env.REMOTE_STAFF_PUBLIC_URL?.trim() || !process.env.REMOTE_ACCESS_GATEWAY_SECRET?.trim())) {
      throw new BadRequestException('Сначала настройте российский шлюз и защищённый ключ соединения');
    }

    const policy = await this.prisma.remoteAccessPolicy.update({
      where: { organizationId: organization.id },
      data: dto,
    });

    if (current.enabled && dto.enabled === false) {
      await this.prisma.session.deleteMany({ where: { accessType: 'REMOTE' } });
    }

    await this.auditService.log({
      actorId,
      action: dto.enabled === false ? 'remote_access.disable' : 'remote_access.policy_update',
      entityType: 'RemoteAccessPolicy',
      entityId: policy.id,
      metadata: { changedFields: Object.keys(dto), remoteAction: isRemote },
      ipAddress,
    });

    return policy;
  }

  async createInvitation(dto: CreateRemoteAccessInvitationDto, actorId: string, ipAddress?: string | null, isRemote = false) {
    if (isRemote) {
      throw new ForbiddenException('Новое устройство можно подключить только из локальной сети клиники');
    }

    const organization = await this.getOrganization();
    const policy = await this.ensurePolicy(organization.id);
    if (!policy.enabled) {
      throw new BadRequestException('Сначала включите удалённый доступ');
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        status: EmployeeStatus.ACTIVE,
        userId: { not: null },
      },
      select: { id: true, fullName: true },
    });
    if (!employee) {
      throw new BadRequestException('Удалённый доступ можно выдать только активному сотруднику с учётной записью');
    }

    await this.prisma.remoteAccessInvitation.updateMany({
      where: { organizationId: organization.id, employeeId: employee.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + policy.enrollmentTtlMinutes * 60 * 1000);
    const invitation = await this.prisma.remoteAccessInvitation.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        createdById: actorId,
        tokenHash: hashToken(token),
        deviceName: dto.deviceName?.trim() || null,
        expiresAt,
      },
    });

    await this.auditService.log({
      actorId,
      action: 'remote_access.invitation_create',
      entityType: 'RemoteAccessInvitation',
      entityId: invitation.id,
      metadata: { employeeId: employee.id, expiresAt: expiresAt.toISOString() },
      ipAddress,
    });

    const publicUrl = process.env.REMOTE_STAFF_PUBLIC_URL!.trim().replace(/\/$/, '');
    return {
      id: invitation.id,
      code: token,
      enrollmentUrl: `${publicUrl}/remote/enroll?code=${encodeURIComponent(token)}`,
      expiresAt,
      employee: { id: employee.id, fullName: employee.fullName },
    };
  }

  async enrollDevice(dto: EnrollRemoteDeviceDto, userAgent?: string | null, ipAddress?: string | null) {
    const organization = await this.getOrganization();
    const policy = await this.ensurePolicy(organization.id);
    if (!policy.enabled) {
      throw new ForbiddenException('Удалённый доступ клиники отключён');
    }

    const invitation = await this.prisma.remoteAccessInvitation.findUnique({
      where: { tokenHash: hashToken(dto.code) },
      include: { employee: { select: { id: true, fullName: true, status: true } } },
    });
    if (
      !invitation ||
      invitation.organizationId !== organization.id ||
      invitation.usedAt ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.employee.status !== EmployeeStatus.ACTIVE
    ) {
      throw new BadRequestException('Ссылка недействительна, уже использована или срок её действия истёк');
    }

    const deviceToken = randomBytes(48).toString('base64url');
    const deviceName = dto.deviceName?.trim() || invitation.deviceName?.trim() || defaultDeviceName(userAgent);
    const device = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.remoteAccessInvitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Ссылка уже использована');
      }

      return tx.remoteAccessDevice.create({
        data: {
          organizationId: organization.id,
          employeeId: invitation.employeeId,
          tokenHash: hashToken(deviceToken),
          name: deviceName,
          userAgent: userAgent ?? null,
          lastIpAddress: ipAddress ?? null,
          lastSeenAt: new Date(),
        },
      });
    });

    await this.auditService.log({
      actorId: invitation.employeeId,
      action: 'remote_access.device_enroll',
      entityType: 'RemoteAccessDevice',
      entityId: device.id,
      metadata: { name: device.name },
      ipAddress,
    });

    return {
      deviceToken,
      device: { id: device.id, name: device.name, employeeName: invitation.employee.fullName },
    };
  }

  async revokeInvitation(invitationId: string, actorId: string, ipAddress?: string | null) {
    const invitation = await this.prisma.remoteAccessInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException('Приглашение не найдено');
    await this.prisma.remoteAccessInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
    await this.auditService.log({ actorId, action: 'remote_access.invitation_revoke', entityType: 'RemoteAccessInvitation', entityId: invitationId, ipAddress });
    return { ok: true };
  }

  async revokeDevice(deviceId: string, actorId: string, ipAddress?: string | null) {
    const device = await this.prisma.remoteAccessDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Устройство не найдено');
    await this.prisma.$transaction([
      this.prisma.remoteAccessDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } }),
      this.prisma.session.deleteMany({ where: { remoteDeviceId: deviceId } }),
    ]);
    await this.auditService.log({ actorId, action: 'remote_access.device_revoke', entityType: 'RemoteAccessDevice', entityId: deviceId, ipAddress });
    return { ok: true };
  }

  async revokeAllDevices(actorId: string, ipAddress?: string | null) {
    const organization = await this.getOrganization();
    const deviceIds = await this.prisma.remoteAccessDevice.findMany({
      where: { organizationId: organization.id, revokedAt: null },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.remoteAccessDevice.updateMany({ where: { id: { in: deviceIds.map(({ id }) => id) } }, data: { revokedAt: new Date() } }),
      this.prisma.session.deleteMany({ where: { remoteDeviceId: { in: deviceIds.map(({ id }) => id) } } }),
    ]);
    await this.auditService.log({ actorId, action: 'remote_access.device_revoke_all', entityType: 'RemoteAccessDevice', metadata: { count: deviceIds.length }, ipAddress });
    return { ok: true, count: deviceIds.length };
  }

  private async getOrganization() {
    const organization = await this.prisma.organization.findFirst({ select: { id: true, displayName: true } });
    if (!organization) throw new BadRequestException('Сначала заполните профиль организации');
    return organization;
  }

  private async ensurePolicy(organizationId: string) {
    return this.prisma.remoteAccessPolicy.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }
}

function readJsonString(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return null;
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

export function hashRemoteDeviceToken(token: string) {
  return hashToken(token);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function defaultDeviceName(userAgent?: string | null) {
  if (!userAgent) return 'Устройство сотрудника';
  if (/iphone/i.test(userAgent)) return 'iPhone';
  if (/ipad/i.test(userAgent)) return 'iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows-компьютер';
  return 'Устройство сотрудника';
}
