import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { assertSecret } from './security';
import { OwnerNotificationService } from './owner-notification.service';
import { DeliverOwnerNotificationDto, OwnerNotificationPreferenceDto } from './dto/owner-notification.dto';
@Controller('v1/portal/notifications')
export class OwnerNotificationController {
  constructor(private readonly service: OwnerNotificationService) {}
  @Get() @Header('Cache-Control', 'no-store')
  read(@Headers('cookie') cookie?: string) { return this.service.read(token(cookie)); }
  @Post() @Header('Cache-Control', 'no-store')
  save(@Headers('cookie') cookie: string | undefined, @Body() dto: OwnerNotificationPreferenceDto) { return this.service.save(token(cookie), dto); }
  @Post('unsubscribe') @Header('Cache-Control', 'no-store')
  stop(@Headers('cookie') cookie?: string) { return this.service.unsubscribe(token(cookie)); }
}
@Controller('internal/v1/assistant/notifications')
export class OwnerNotificationInternalController {
  constructor(private readonly service: OwnerNotificationService) {}
  @Get('subscribers')
  subscribers(@Headers('x-owner-gateway-secret') secret?: string) { this.auth(secret); return this.service.subscribers(); }
  @Post(':id/deliver')
  deliver(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DeliverOwnerNotificationDto) { this.auth(secret); return this.service.deliver(id, dto); }
  @Get(':id/result')
  result(@Headers('x-owner-gateway-secret') secret: string | undefined, @Param('id', new ParseUUIDPipe()) id: string) { this.auth(secret); return this.service.result(id); }
  private auth(secret?: string) { assertSecret(secret, process.env.OWNER_GATEWAY_SYNC_SECRET, 'Секрет шлюза не настроен'); }
}
function token(cookie?: string) {
  const name = process.env.OWNER_GATEWAY_SESSION_COOKIE || 'temichevvet_owner_session';
  try { return decodeURIComponent(cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) || ''); } catch { return ''; }
}
