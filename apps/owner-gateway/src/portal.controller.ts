import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { ExchangeInvitationDto } from './dto/exchange-invitation.dto';
import { PortalPushSubscriptionDto, RemovePortalPushSubscriptionDto } from './dto/portal-push-subscription.dto';
import { PortalService } from './portal.service';

@Controller('v1/portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Post('sessions')
  async exchangeInvitation(@Body() dto: ExchangeInvitationDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.portalService.exchangeInvitation(dto.token);
    setSessionCookie(response, session.sessionToken, session.expiresAt);
    return {
      ok: true,
      expiresAt: session.expiresAt,
      transferToken: session.transferToken,
      transferExpiresAt: session.transferExpiresAt,
    };
  }

  @Post('session-transfer')
  createSessionTransfer(@Headers('cookie') cookieHeader: string | undefined) {
    return this.portalService.createSessionTransfer(requireSessionToken(cookieHeader));
  }

  @Get('me')
  async getSnapshot(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionToken = requireSessionToken(cookieHeader);
    const snapshot = await this.portalService.getSnapshot(sessionToken);
    setSessionCookie(response, sessionToken, snapshot.sessionExpiresAt);
    return snapshot;
  }

  @Get('push/config')
  getPushConfig(@Headers('cookie') cookieHeader: string | undefined) {
    return this.portalService.getPushConfig(requireSessionToken(cookieHeader));
  }

  @Post('push/subscriptions')
  savePushSubscription(
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() dto: PortalPushSubscriptionDto,
  ) {
    return this.portalService.savePushSubscription(requireSessionToken(cookieHeader), dto, userAgent);
  }

  @Delete('push/subscriptions')
  removePushSubscription(
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() dto: RemovePortalPushSubscriptionDto,
  ) {
    return this.portalService.removePushSubscription(requireSessionToken(cookieHeader), dto.endpoint);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('cookie') cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response) {
    await this.portalService.revokeSession(requireSessionToken(cookieHeader));
    response.clearCookie(getSessionCookieName(), { path: '/' });
    return { ok: true };
  }
}

function requireSessionToken(cookieHeader: string | undefined) {
  const cookieName = getSessionCookieName();
  const cookie = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  const token = cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : '';

  if (!token) {
    throw new UnauthorizedException('Сессия личного кабинета не найдена');
  }

  return token;
}

function getSessionCookieName() {
  return process.env.OWNER_GATEWAY_SESSION_COOKIE?.trim() || 'temichevvet_owner_session';
}

function setSessionCookie(response: Response, token: string, expires: Date) {
  response.cookie(getSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}
