import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, CookieResponse } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { REMOTE_DEVICE_COOKIE_NAME, getRemoteDeviceCookieOptions } from './remote-access.constants';
import { RemoteAccessService } from './remote-access.service';
import { CreateRemoteAccessInvitationDto } from './dto/create-remote-access-invitation.dto';
import { EnrollRemoteDeviceDto } from './dto/enroll-remote-device.dto';
import { UpdateRemoteAccessPolicyDto } from './dto/update-remote-access-policy.dto';
import { isRemoteGatewayRequest } from './remote-request';

@ApiTags('remote-access')
@Controller('v1/remote-access')
export class RemoteAccessController {
  constructor(private readonly remoteAccessService: RemoteAccessService) {}

  @Get()
  @RequirePermissions('remote_access.read')
  @RequireRoles('director')
  @ApiOkResponse({ description: 'Remote access policy, trusted devices and recent invitations.' })
  overview(@Req() request: AuthenticatedRequest) {
    return this.remoteAccessService.getOverview(request.auth?.remoteDeviceId);
  }

  @Patch('policy')
  @RequirePermissions('remote_access.manage')
  @RequireRoles('director')
  @ApiOkResponse({ description: 'Remote access policy updated.' })
  updatePolicy(
    @Body() dto: UpdateRemoteAccessPolicyDto,
    @CurrentEmployee() actor: { id: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.remoteAccessService.updatePolicy(dto, actor.id, getIpAddress(request), request.auth?.accessType === 'REMOTE');
  }

  @Post('invitations')
  @RequirePermissions('remote_access.manage')
  @RequireRoles('director')
  @ApiCreatedResponse({ description: 'Single-use device enrollment invitation created.' })
  createInvitation(
    @Body() dto: CreateRemoteAccessInvitationDto,
    @CurrentEmployee() actor: { id: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.remoteAccessService.createInvitation(dto, actor.id, getIpAddress(request), request.auth?.accessType === 'REMOTE');
  }

  @Delete('invitations/:invitationId')
  @RequirePermissions('remote_access.manage')
  @RequireRoles('director')
  @HttpCode(200)
  revokeInvitation(
    @Param('invitationId') invitationId: string,
    @CurrentEmployee() actor: { id: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.remoteAccessService.revokeInvitation(invitationId, actor.id, getIpAddress(request));
  }

  @Delete('devices/:deviceId')
  @RequirePermissions('remote_access.manage')
  @RequireRoles('director')
  @HttpCode(200)
  revokeDevice(
    @Param('deviceId') deviceId: string,
    @CurrentEmployee() actor: { id: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.remoteAccessService.revokeDevice(deviceId, actor.id, getIpAddress(request));
  }

  @Post('devices/revoke-all')
  @RequirePermissions('remote_access.manage')
  @RequireRoles('director')
  @HttpCode(200)
  revokeAllDevices(@CurrentEmployee() actor: { id: string }, @Req() request: AuthenticatedRequest) {
    return this.remoteAccessService.revokeAllDevices(actor.id, getIpAddress(request));
  }

  @Public()
  @Post('enroll')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Single-use invitation exchanged for a trusted-device cookie.' })
  async enroll(
    @Body() dto: EnrollRemoteDeviceDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    if (!isRemoteGatewayRequest(request)) {
      throw new ForbiddenException('Привязка удалённого устройства доступна только через защищённый шлюз');
    }
    const result = await this.remoteAccessService.enrollDevice(dto, getUserAgent(request), getIpAddress(request));
    response.cookie(REMOTE_DEVICE_COOKIE_NAME, result.deviceToken, getRemoteDeviceCookieOptions());
    return { device: result.device, next: '/login' };
  }
}

function getIpAddress(request: AuthenticatedRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim() ?? null;
  return request.ip ?? request.socket?.remoteAddress ?? null;
}

function getUserAgent(request: AuthenticatedRequest) {
  const value = request.headers['user-agent'];
  return Array.isArray(value) ? value.join(' ') : value ?? null;
}
