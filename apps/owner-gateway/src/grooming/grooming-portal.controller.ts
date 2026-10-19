import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSecret } from '../security';
import { GroomingPortalService } from './grooming-portal.service';
import { GroomingDeliveryDto, GroomingDraftDto, GroomingDraftConsumeDto, GroomingOperationDto, GroomingOperationResultDto, GroomingRegistrationDetailsDto, GroomingRegistrationResultDto } from './grooming-portal.dto';
const sessionName = () => process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session';
function cookie(header: string | undefined, name: string) { try { return decodeURIComponent(header?.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1) || ''); } catch { return ''; } }
function sameOrigin(request: Request) { const origin = request.headers.origin; if (origin && origin !== new URL(process.env.OWNER_GATEWAY_PUBLIC_URL || `${request.protocol}://${request.get('host')}`).origin) throw new ForbiddenException('Откройте кабинет на его основном адресе'); }
@Controller('v1/portal/grooming')
export class GroomingPortalController {
  constructor(private readonly service: GroomingPortalService) {}
  @Post('operations') @Header('Cache-Control', 'no-store')
  operation(@Req() request: Request, @Body() input: GroomingOperationDto) { sameOrigin(request); return this.service.operation(cookie(request.headers.cookie, sessionName()), input); }
  @Get('operations/:id') @Header('Cache-Control', 'no-store')
  result(@Headers('cookie') cookies: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.result(cookie(cookies, sessionName()), id); }
  @Get('operations/by-key/:key') @Header('Cache-Control', 'no-store')
  byKey(@Headers('cookie') cookies: string | undefined, @Param('key') key: string) { return this.service.byKey(cookie(cookies, sessionName()), key); }
  @Post('draft') @Header('Cache-Control', 'no-store')
  consumeDraft(@Req() request: Request, @Body() input: GroomingDraftConsumeDto) { sameOrigin(request); return this.service.consumeDraft(cookie(request.headers.cookie, sessionName()), input.token); }
  @Post('registration') @Header('Cache-Control', 'no-store')
  async registration(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request); const result = await this.service.beginRegistration(request.ip || 'unknown');
    response.cookie('grooming_registration', result.browserToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: result.expiresAt });
    return { url: result.url, expiresAt: result.expiresAt };
  }
  @Get('registration') @Header('Cache-Control', 'no-store')
  registrationStatus(@Headers('cookie') cookies?: string) { return this.service.registrationStatus(cookie(cookies, 'grooming_registration')); }
  @Post('registration/details')
  details(@Req() request: Request, @Body() input: GroomingRegistrationDetailsDto) { sameOrigin(request); return this.service.registrationDetails(cookie(request.headers.cookie, 'grooming_registration'), input); }
  @Post('registration/session') @Header('Cache-Control', 'no-store')
  async login(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request); const session = await this.service.consumeRegistration(cookie(request.headers.cookie, 'grooming_registration'));
    response.cookie(sessionName(), session.sessionToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: session.expiresAt });
    response.clearCookie('grooming_registration', { path: '/' }); return { ok: true };
  }
}
@Controller('v1/public/grooming')
export class GroomingDraftPublicController {
  constructor(private readonly service: GroomingPortalService) {}
  @Post('drafts') @Header('Cache-Control', 'no-store')
  create(@Req() request: Request, @Body() input: GroomingDraftDto) {
    const origins = (process.env.GROOMING_SITE_ORIGINS || '').split(',').map(value => value.trim());
    if (!request.headers.origin || !origins.includes(request.headers.origin)) throw new ForbiddenException('Откройте запись с сайта груминга');
    return this.service.createDraft(input, request.ip || 'unknown');
  }
}
@Controller('internal/v1/grooming/portal')
export class GroomingPortalInternalController {
  constructor(private readonly service: GroomingPortalService) {}
  private auth(secret?: string) { assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет шлюза не настроен'); }
  @Get('operations') pending(@Headers('x-owner-gateway-secret') secret?: string) { this.auth(secret); return this.service.pending(); }
  @Post('operations/:id/result') complete(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: GroomingOperationResultDto) { this.auth(secret); return this.service.complete(id, input); }
  @Get('registrations') registrations(@Headers('x-owner-gateway-secret') secret?: string) { this.auth(secret); return this.service.pendingRegistrations(); }
  @Post('registrations/:id/result') registrationResult(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: GroomingRegistrationResultDto) { this.auth(secret); return this.service.completeRegistration(id, input); }
  @Post('deliveries/:id') deliver(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: GroomingDeliveryDto) { this.auth(secret); return this.service.deliver(id, input); }
}
