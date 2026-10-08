import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Put, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthEmployee } from '../auth/auth.types';
import { AssistantBookingService } from './assistant-booking.service';
import { AssistantBookDto, AssistantBookingOptionsDto, AssistantBookingRuleDto } from './dto/assistant-booking.dto';

@Controller('v1/assistant-booking')
export class AssistantBookingController {
  constructor(private readonly booking: AssistantBookingService) {}
  @Get('rules') @RequirePermissions('settings.read')
  rules() { return this.booking.listRules(); }
  @Get('resources') @RequirePermissions('settings.read')
  resources() { return this.booking.resources(); }
  @Get('readiness') @RequirePermissions('settings.read')
  readiness() { return this.booking.readiness(); }
  @Post('rules') @RequirePermissions('settings.manage')
  createRule(@Body() dto: AssistantBookingRuleDto, @CurrentEmployee() actor: AuthEmployee) { return this.booking.saveRule(dto, actor.id); }
  @Put('rules/:id') @RequirePermissions('settings.manage')
  updateRule(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AssistantBookingRuleDto, @CurrentEmployee() actor: AuthEmployee) { return this.booking.saveRule(dto, actor.id, id); }
  @Post('rules/:id/disable') @RequirePermissions('settings.manage')
  disableRule(@Param('id', new ParseUUIDPipe()) id: string, @CurrentEmployee() actor: AuthEmployee) { return this.booking.disableRule(id, actor.id); }
  @Post('options') @Public() @Header('Cache-Control', 'no-store')
  options(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: AssistantBookingOptionsDto) { this.authorize(secret); return this.booking.options(dto); }
  @Post('confirm') @Public() @Header('Cache-Control', 'no-store')
  confirm(@Headers('x-owner-gateway-secret') secret: string | undefined, @Body() dto: AssistantBookDto) { this.authorize(secret); return this.booking.book(dto); }
  private authorize(secret?: string) {
    this.booking.assertEnabled();
    const expected = Buffer.from(process.env.OWNER_GATEWAY_SYNC_SECRET || '');
    const actual = Buffer.from(secret || '');
    if (expected.length < 16 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException('Недоступная операция шлюза');
  }
}
