import { Body, Controller, Get, Header, Headers, HttpException, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertSecret } from './security';
import { ClinicChatService } from './clinic-chat.service';
import { OwnerNotificationService } from './owner-notification.service';
import { OwnerNotificationPreferenceDto } from './dto/owner-notification.dto';
import { ClinicChatBookingService } from './clinic-chat-booking.service';
import { ClinicChatBookingResultDto, ClinicChatConfirmDto, ClinicChatSlotsDto } from './dto/clinic-chat-slots.dto';
import { ClinicChatAckDto, ClinicChatBookingDto, ClinicChatCommandDto, ClinicChatMessageDto } from './dto/clinic-chat.dto';

@Controller('v1/public/assistant')
export class ClinicChatController {
  private windows = new Map<string, { at: number; count: number }>();
  constructor(private readonly chat: ClinicChatService, private readonly slots: ClinicChatBookingService, private readonly notifications: OwnerNotificationService) {}
  @Get('notification-preferences') @Header('Cache-Control', 'no-store')
  preferences(@Headers('cookie') header?: string) { return this.notifications.read(cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session')); }
  @Post('notification-preferences') @Header('Cache-Control', 'no-store')
  savePreferences(@Headers('cookie') header: string | undefined, @Body() dto: OwnerNotificationPreferenceDto, @Req() req: Request) { this.limit(req.ip || 'unknown', 120); return this.notifications.save(cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'), dto); }
  @Post('notification-unsubscribe') @Header('Cache-Control', 'no-store')
  unsubscribe(@Headers('cookie') header: string | undefined, @Req() req: Request) { this.limit(req.ip || 'unknown', 120); return this.notifications.unsubscribe(cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session')); }
  @Post('session')
  @Header('Cache-Control', 'no-store')
  async start(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.limit(req.ip || 'unknown', 10);
    const current = cookie(req.headers.cookie, 'clinic_assistant_session');
    if (current) {
      try { return await this.chat.readPublic(current, this.portalCookie(req.headers.cookie)); } catch (error) { if (!(error instanceof HttpException) || error.getStatus() !== 401) throw error; }
    }
    const result = await this.chat.start(cookie(req.headers.cookie, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'));
    res.cookie('clinic_assistant_session', result.token, { httpOnly: true, secure: process.env.OWNER_GATEWAY_COOKIE_SECURE !== 'false', sameSite: 'lax', path: '/', maxAge: 7 * 86400_000 });
    res.setHeader('Cache-Control', 'no-store');
    return result.conversation;
  }
  @Get()
  read(@Headers('cookie') header?: string, @Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');
    return this.chat.readPublic(cookie(header, 'clinic_assistant_session'), this.portalCookie(header));
  }
  @Post('messages')
  @Header('Cache-Control', 'no-store')
  async message(@Headers('cookie') header: string | undefined, @Body() dto: ClinicChatMessageDto, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    await this.authorizeChat(header);
    return this.chat.message(cookie(header, 'clinic_assistant_session'), dto);
  }
  @Post('booking')
  @Header('Cache-Control', 'no-store')
  async booking(@Headers('cookie') header: string | undefined, @Body() dto: ClinicChatBookingDto, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    await this.authorizeChat(header);
    return this.chat.booking(cookie(header, 'clinic_assistant_session'), dto);
  }
  @Post('max-link')
  @Header('Cache-Control', 'no-store')
  async link(@Headers('cookie') header: string | undefined, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    await this.authorizeChat(header);
    return this.chat.link(cookie(header, 'clinic_assistant_session'));
  }
  @Post('slots') @Header('Cache-Control', 'no-store')
  slotsRequest(@Headers('cookie') header: string | undefined, @Body() dto: ClinicChatSlotsDto, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    return this.slots.options(cookie(header, 'clinic_assistant_session'), cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'), dto);
  }
  @Post('slot-confirmation') @Header('Cache-Control', 'no-store')
  confirmSlot(@Headers('cookie') header: string | undefined, @Body() dto: ClinicChatConfirmDto, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    return this.slots.confirm(cookie(header, 'clinic_assistant_session'), cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'), dto);
  }
  @Get('booking-operations/:id') @Header('Cache-Control', 'no-store')
  bookingState(@Headers('cookie') header: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.slots.read(cookie(header, 'clinic_assistant_session'), cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'), id);
  }
  @Get('booking-operations') @Header('Cache-Control', 'no-store')
  latestBooking(@Headers('cookie') header: string | undefined) {
    return this.slots.latest(cookie(header, 'clinic_assistant_session'), cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'));
  }
  @Post('max-disconnect')
  @Header('Cache-Control', 'no-store')
  async disconnect(@Headers('cookie') header: string | undefined, @Req() req: Request) {
    this.limit(req.ip || 'unknown', 120);
    await this.authorizeChat(header);
    return this.chat.disconnectMax(cookie(header, 'clinic_assistant_session'));
  }
  private portalCookie(header?: string) { return cookie(header, process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session'); }
  private authorizeChat(header?: string) { return this.chat.resolvePublic(cookie(header, 'clinic_assistant_session'), this.portalCookie(header)); }
  private limit(key: string, max: number) {
    const now = Date.now(); const bucket = `${max}:${key}`;
    if (this.windows.size > 10000) this.windows.clear();
    const entry = this.windows.get(bucket);
    if (!entry || now - entry.at > 600_000) { this.windows.set(bucket, { at: now, count: 1 }); return; }
    if (++entry.count > max) throw new HttpException('Слишком много запросов. Попробуйте позже.', 429);
  }
}
@Controller('internal/v1/assistant')
export class ClinicChatInternalController {
  constructor(private readonly chat: ClinicChatService, private readonly slots: ClinicChatBookingService) {}
  @Get('booking-operations')
  bookingPending(@Headers('x-owner-gateway-secret') secret?: string) { this.authorize(secret); return this.slots.pending(); }
  @Post('booking-operations/:id/result')
  bookingResult(@Param('id', new ParseUUIDPipe()) id: string, @Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: ClinicChatBookingResultDto) {
    this.authorize(secret); return this.slots.complete(id, dto);
  }
  @Get('pending')
  pending(@Headers('x-owner-gateway-secret') secret?: string) { this.authorize(secret); return this.chat.pending(); }
  @Post(':id/ack')
  ack(@Param('id') id: string, @Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: ClinicChatAckDto) {
    this.authorize(secret); return this.chat.acknowledge(id, dto.sequence, dto.crmRequestId);
  }
  @Post(':id/commands')
  command(@Param('id') id: string, @Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: ClinicChatCommandDto) {
    this.authorize(secret); return this.chat.command(id, dto);
  }
  private authorize(secret?: string) { this.chat.assertEnabled(); assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет синхронизации не настроен'); }
}
function cookie(header: string | undefined, name: string) {
  const value = header?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : undefined; } catch { return undefined; }
}
