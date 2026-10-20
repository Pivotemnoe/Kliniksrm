import { Body, Controller, ForbiddenException, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSecret, hashToken } from '../security';
import { PetHotelPortalService } from './pet-hotel-portal.service';
import { PetHotelStorefrontService } from './pet-hotel-storefront.service';
import { PetHotelRegistrationService } from './pet-hotel-registration.service';
import { PetHotelDeliveryService } from './pet-hotel-delivery.service';
import { HotelDeliveryDto, HotelDraftDto, HotelOperationDto, HotelRegistrationDetailsDto, HotelRegistrationResultDto, HotelResultDto, HotelSnapshotDto, HotelTokenDto } from './pet-hotel.dto';
const sessionName = () => process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session';
function cookie(header: string | undefined, name: string) { try { return decodeURIComponent(header?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || ''); } catch { return ''; } }
function sameOrigin(req: Request) {
  const base = process.env.OWNER_GATEWAY_PUBLIC_URL;
  if (!base) throw new ServiceUnavailableException('Адрес кабинета не настроен');
  if (req.headers.origin !== new URL(base).origin) throw new ForbiddenException('Откройте действие в личном кабинете');
}
const registrationCookie = 'pet_hotel_registration';
const registrationPath = '/v1/portal/pet-hotel';
@Controller('v1/portal/pet-hotel')
export class PetHotelPortalController {
  constructor(private readonly portal: PetHotelPortalService, private readonly storefront: PetHotelStorefrontService, private readonly registration: PetHotelRegistrationService) {}
  @Get('session') @Header('Cache-Control', 'no-store')
  async session(@Headers('cookie') cookies?: string) { const session = await this.portal.owner(cookie(cookies, sessionName())); return { ownerKey: hashToken('pet-hotel-context:' + session.ownerId) }; }
  @Post('operations') @Header('Cache-Control', 'no-store')
  operation(@Req() req: Request, @Body() dto: HotelOperationDto) { sameOrigin(req); return this.portal.operation(cookie(req.headers.cookie, sessionName()), dto); }
  @Get('operations/by-key/:key') @Header('Cache-Control', 'no-store')
  byKey(@Headers('cookie') cookies: string | undefined, @Param('key') key: string) { return this.portal.result(cookie(cookies, sessionName()), key, true); }
  @Get('operations/:id') @Header('Cache-Control', 'no-store')
  result(@Headers('cookie') cookies: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) { return this.portal.result(cookie(cookies, sessionName()), id); }
  @Post('draft') @Header('Cache-Control', 'no-store')
  async draft(@Req() req: Request, @Body() dto: HotelTokenDto) { sameOrigin(req); const session = await this.portal.owner(cookie(req.headers.cookie, sessionName())); return this.storefront.consume(session.ownerId, dto.token); }
  @Post('registration') @Header('Cache-Control', 'no-store')
  async begin(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    sameOrigin(req); const result = await this.registration.beginRegistration(req.ip || 'unknown');
    res.cookie(registrationCookie, result.browserToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: registrationPath, expires: result.expiresAt });
    return { url: result.url, expiresAt: result.expiresAt };
  }
  @Get('registration') @Header('Cache-Control', 'no-store')
  status(@Headers('cookie') cookies?: string) { return this.registration.registrationStatus(cookie(cookies, registrationCookie)); }
  @Post('registration/details')
  details(@Req() req: Request, @Body() dto: HotelRegistrationDetailsDto) { sameOrigin(req); return this.registration.registrationDetails(cookie(req.headers.cookie, registrationCookie), dto); }
  @Post('registration/session') @Header('Cache-Control', 'no-store')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    sameOrigin(req); const session = await this.registration.consumeRegistration(cookie(req.headers.cookie, registrationCookie));
    res.cookie(sessionName(), session.sessionToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: session.expiresAt });
    res.clearCookie(registrationCookie, { path: registrationPath }); return { ok: true };
  }
}
@Controller('v1/public/pet-hotel')
export class PetHotelPublicController {
  constructor(private readonly storefront: PetHotelStorefrontService) {}
  @Get('catalog') @Header('Cache-Control', 'no-store') catalog() { return this.storefront.catalog(); }
  @Get('availability') @Header('Cache-Control', 'no-store') availability(@Query() query: Record<string, string>, @Req() req: Request) { return this.storefront.availability(query, req.ip || 'unknown'); }
  @Post('drafts') @Header('Cache-Control', 'no-store') draft(@Req() req: Request, @Body() dto: HotelDraftDto) {
    const origins = (process.env.PET_HOTEL_SITE_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!req.headers.origin || !origins.includes(req.headers.origin)) throw new ForbiddenException('Откройте выбор номера на сайте гостиницы');
    return this.storefront.draft(dto.offerToken, req.ip || 'unknown');
  }
}
@Controller('internal/v1/pet-hotel/portal')
export class PetHotelInternalController {
  constructor(private readonly portal: PetHotelPortalService, private readonly storefront: PetHotelStorefrontService, private readonly registration: PetHotelRegistrationService, private readonly deliveries: PetHotelDeliveryService) {}
  private auth(secret?: string) { assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет шлюза не настроен'); }
  @Post('storefront') store(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: HotelSnapshotDto) { this.auth(secret); return this.storefront.store(dto.payload); }
  @Get('operations') pending(@Headers('x-owner-gateway-secret') secret?: string) { this.auth(secret); return this.portal.pending(); }
  @Post('operations/:id/result') complete(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: HotelResultDto) { this.auth(secret); return this.portal.complete(id, dto); }
  @Get('registrations') registrations(@Headers('x-owner-gateway-secret') secret?: string) { this.auth(secret); return this.registration.pendingRegistrations(); }
  @Post('registrations/:id/result') registrationResult(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: HotelRegistrationResultDto) { this.auth(secret); return this.registration.completeRegistration(id, dto); }
  @Post('deliveries/:id') deliver(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: HotelDeliveryDto) { this.auth(secret); return this.deliveries.deliver(id, dto); }
}
