import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { AuthEmployee, AuthenticatedRequest } from '../auth/auth.types';
import { RemoteAccessService } from '../remote-access/remote-access.service';
import { CreateRemoteAccessInvitationDto } from '../remote-access/dto/create-remote-access-invitation.dto';
import { ClinicModulesService } from '../clinic-modules/clinic-modules.service';

@Controller('v1/grooming/phones')
@RequireRoles('director', 'administrator')
@RequirePermissions('grooming.manage')
@AllowRemoteMutation()
export class GroomingPhonesController {
  constructor(private readonly prisma: PrismaService, private readonly remote: RemoteAccessService, private readonly modules: ClinicModulesService) {}
  private async people() {
    const installation = await this.modules.installation('GROOMING');
    return this.prisma.groomingSpecialist.findMany({ where: { installationId: installation.id, employee: { accountScope: 'GROOMING' } },
      select: { id: true, employeeId: true, displayName: true, isActive: true, employee: { select: { phone: true, user: { select: { email: true } }, _count: { select: { groomingPushSubscriptions: true } } } } }, orderBy: { displayName: 'asc' } });
  }
  @Get()
  async overview() {
    const people = await this.people(), ids = people.map(p => p.employeeId);
    const devices = await this.prisma.remoteAccessDevice.findMany({ where: { employeeId: { in: ids } }, select: { id: true, employeeId: true, name: true, trustedAt: true, lastSeenAt: true, revokedAt: true, _count: { select: { groomingPushSubscriptions: { where: { expiresAt: { gt: new Date() } } } } } }, orderBy: { trustedAt: 'desc' } });
    const policy = await this.prisma.remoteAccessPolicy.findFirst({ select: { enabled: true } });
    const installation = await this.modules.installation('GROOMING');
    return { available: Boolean(policy?.enabled && installation.enabled && await this.modules.entitlement('GROOMING') && process.env.REMOTE_STAFF_PUBLIC_URL?.trim()),
      groomers: people.map(p => ({ id: p.id, employeeId: p.employeeId, displayName: p.displayName, isActive: p.isActive, login: p.employee.phone || p.employee.user?.email, pushDevices: p.employee._count.groomingPushSubscriptions })), devices: devices.map(({ _count, ...phone }) => ({ ...phone, pushConnected: !phone.revokedAt && _count.groomingPushSubscriptions > 0 })) };
  }
  @Post('invitations')
  async invitation(@CurrentEmployee() actor: AuthEmployee, @Body() input: CreateRemoteAccessInvitationDto, @Req() request: AuthenticatedRequest) {
    await this.modules.assertEnabled('GROOMING');
    return this.remote.createGroomingInvitation(input, actor, request.ip, request.auth?.accessType === 'REMOTE');
  }
  @Delete('devices/:id')
  async revoke(@Param('id') id: string, @CurrentEmployee() actor: AuthEmployee, @Req() request: AuthenticatedRequest) {
    const people = await this.people();
    const device = await this.prisma.remoteAccessDevice.findFirst({ where: { id, employeeId: { in: people.map(p => p.employeeId) } } });
    if (!device) throw new NotFoundException('Телефон грумера не найден');
    return this.remote.revokeDevice(device.id, actor.id, request.ip);
  }
}
