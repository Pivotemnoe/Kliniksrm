import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsIn, Min } from 'class-validator';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { AuthEmployee } from '../auth/auth.types';
import { AvitoService } from './avito.service';
import { AvitoCallDto, AvitoListDto, AvitoListingsDto, AvitoModeDto, AvitoReplyDto, AvitoSyncDto, SimulateAvitoDto, UpdateAvitoSettingsDto } from './dto/avito.dto';

class RestoreAvitoDto { @IsInt() @Min(1) version: number; @IsInt() @Min(1) expectedVersion: number; }
class InquiryStatusDto { @IsIn(['IN_REVIEW', 'RESOLVED', 'CANCELLED']) status: string; }
class NewCycleDto { @IsInt() @Min(0) version: number; }
@Controller('v1/avito')
@RequireRoles('director', 'administrator')
@RequirePermissions('avito.read')
export class AvitoController {
  constructor(private readonly service: AvitoService) {}
  @Get() overview(@CurrentEmployee() actor: AuthEmployee) { return this.service.overview(actor.roles.includes('director') && actor.permissions.includes('avito.manage')); }
  @Get('inquiries') inquiries(@Query() query: AvitoListDto) { return this.service.listInquiries(query); }
  @Get('conversations') conversations(@Query() query: AvitoListDto) { return this.service.listConversations(query); }
  @Get('conversations/:id') conversation(@Param('id') id: string) { return this.service.getConversation(id); }
  @Get('metrics') metrics(@Query() query: AvitoListDto) { return this.service.metrics(query.direction); }
  @Post('calls') @RequirePermissions('avito.operate') call(@Body() dto: AvitoCallDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.recordCall(dto, actor.id); }
  @Patch('conversations/:id/mode') @RequirePermissions('avito.operate') mode(@Param('id') id: string, @Body() dto: AvitoModeDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.setMode(id, dto, actor.id); }
  @Post('conversations/:id/reply') @RequirePermissions('avito.operate') reply(@Param('id') id: string, @Body() dto: AvitoReplyDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.reply(id, dto, actor.id); }
  @Post('outbox/:id/reconcile') @RequirePermissions('avito.operate') reconcile(@Param('id') id: string, @CurrentEmployee() actor: AuthEmployee) { return this.service.reconcile(id, actor.id); }
  @Patch('inquiries/:id/status') @RequirePermissions('avito.operate') inquiryStatus(@Param('id') id: string, @Body() dto: InquiryStatusDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.inquiryStatus(id, dto.status, actor.id); }
  @Post('conversations/:id/new-cycle') @RequirePermissions('avito.operate') newCycle(@Param('id') id: string, @Body() dto: NewCycleDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.newCycle(id, dto.version, actor.id); }
  @Patch('settings') @RequireRoles('director') @RequirePermissions('avito.manage') settings(@Body() dto: UpdateAvitoSettingsDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.updateSettings(dto, actor.id); }
  @Get('settings/revisions') @RequireRoles('director') @RequirePermissions('avito.manage') revisions() { return this.service.revisions(); }
  @Post('settings/restore') @RequireRoles('director') @RequirePermissions('avito.manage') restore(@Body() dto: RestoreAvitoDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.restoreRevision(dto.version, dto.expectedVersion, actor.id); }
  @Post('simulate') @RequireRoles('director') @RequirePermissions('avito.manage') simulate(@Body() dto: SimulateAvitoDto) { return this.service.simulate(dto.listingId, dto.text, dto.contact, dto.at, { useAi: dto.useAi, clientKey: dto.clientKey }); }
  @Post('connection/check') @RequireRoles('director') @RequirePermissions('avito.manage') check(@CurrentEmployee() actor: AuthEmployee) { return this.service.checkConnection(actor.id); }
  @Post('sync') @RequireRoles('director') @RequirePermissions('avito.manage') sync(@Body() dto: AvitoSyncDto) { return this.service.sync(dto.offset); }
  @Get('listings') @RequireRoles('director') @RequirePermissions('avito.manage') listings(@Query() query: AvitoListingsDto) { return this.service.ownListings(Math.floor((query.offset ?? 0) / 50) + 1, query.status ?? 'all'); }
}

// A different controller keeps staff role metadata out of the public event route.
@Controller('v1/integrations/avito')
export class AvitoEventsController {
  constructor(private readonly service: AvitoService) {}
  @Post('events/:secret') @Public() @HttpCode(200)
  event(@Param('secret') secret: string, @Body() body: unknown) { return this.service.acceptEvent(secret, body); }
}
