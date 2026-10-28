import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, CookieResponse } from './auth.types';
import { AuthService } from './auth.service';
import { AllowRemoteMutation } from './decorators/allow-remote-mutation.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { getCookieOptions, SESSION_COOKIE_NAME } from './session-cookie';
import { REMOTE_DEVICE_COOKIE_NAME, getRemoteDeviceCookieOptions } from '../remote-access/remote-access.constants';
import { isRemoteGatewayRequest } from '../remote-access/remote-request';
import { parseCookie } from './session-cookie';
import { BoundedRateLimiter, clientIp } from '../../common/abuse-protection';
import { normalizePhoneForLookup } from '../../common/phone';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly staffLoginAttempts = new BoundedRateLimiter();
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('staff-login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Sign in to the staff app using the existing CRM credentials.' })
  async staffLogin(@Body() dto: StaffLoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const ip = getIpAddress(request);
    let identity = dto.login.trim().toLowerCase();
    if (!identity.includes('@')) {
      try { identity = normalizePhoneForLookup(identity) || identity; } catch { /* Invalid identifiers still share their own limit. */ }
    }
    this.staffLoginAttempts.consume(`ip:${ip}`, 30);
    this.staffLoginAttempts.consume(`account:${identity}`, 10);
    const remote = isRemoteGatewayRequest(request);
    const result = await this.authService.login(dto, ip, getUserAgent(request), {
      accessType: remote ? 'REMOTE' : 'LOCAL',
      remoteDeviceToken: remote ? parseCookie(request.headers.cookie, REMOTE_DEVICE_COOKIE_NAME) : null,
      staffInstallationId: dto.installationId,
      staffDeviceName: dto.deviceName,
    });
    if (remote && result.staffDeviceToken) response.cookie(REMOTE_DEVICE_COOKIE_NAME, result.staffDeviceToken, getRemoteDeviceCookieOptions());
    response.cookie(SESSION_COOKIE_NAME, result.token, getCookieOptions(result.cookieExpiresAt.getTime() - Date.now(), remote));
    return { employee: result.employee, expiresAt: result.expiresAt, accessType: accessTypeFor(remote) };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Login with phone/email and password.' })
  async login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    const remoteRequest = isRemoteGatewayRequest(request);
    const result = await this.authService.login(dto, getIpAddress(request), getUserAgent(request), {
      accessType: remoteRequest ? 'REMOTE' : 'LOCAL',
      remoteDeviceToken: remoteRequest ? parseCookie(request.headers.cookie, REMOTE_DEVICE_COOKIE_NAME) : null,
    });
    const maxAgeMs = result.cookieExpiresAt.getTime() - Date.now();

    response.cookie(SESSION_COOKIE_NAME, result.token, getCookieOptions(maxAgeMs, remoteRequest));

    return {
      employee: result.employee,
      expiresAt: result.expiresAt,
      accessType: accessTypeFor(remoteRequest),
    };
  }

  @Get('me')
  @ApiOkResponse({ description: 'Current authenticated employee.' })
  me(@Req() request: AuthenticatedRequest) {
    return { employee: request.auth?.employee, accessType: request.auth?.accessType ?? 'LOCAL' };
  }

  @Post('logout')
  @AllowRemoteMutation()
  @HttpCode(200)
  @ApiCreatedResponse({ description: 'Logout current session.' })
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    if (request.auth) {
      await this.authService.logout(request.auth.sessionId, request.auth.employee.id, getIpAddress(request));
    }

    response.clearCookie(SESSION_COOKIE_NAME, getCookieOptions());

    return { ok: true };
  }

  @Patch('password')
  @AllowRemoteMutation()
  @HttpCode(200)
  @ApiOkResponse({ description: 'Change current employee password.' })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() request: AuthenticatedRequest) {
    if (!request.auth) {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    await this.authService.changePassword({
      userId: request.auth.userId,
      sessionId: request.auth.sessionId,
      actorId: request.auth.employee.id,
      dto,
      ipAddress: getIpAddress(request),
    });

    return { ok: true };
  }
}

function accessTypeFor(remoteRequest: boolean): 'LOCAL' | 'REMOTE' {
  return remoteRequest ? 'REMOTE' : 'LOCAL';
}

function getIpAddress(request: AuthenticatedRequest) {
  return clientIp(request);
}

function getUserAgent(request: AuthenticatedRequest) {
  const userAgent = request.headers['user-agent'];
  return Array.isArray(userAgent) ? userAgent.join(' ') : userAgent ?? null;
}
