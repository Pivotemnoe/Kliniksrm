import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions, RequireRoles } from '../auth/decorators/require-permissions.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { AuthEmployee } from '../auth/auth.types';
import { GroomingCrmService } from './grooming.service';
import { GroomingBookDto, GroomingChangeDto, GroomingLocationDto, GroomingOptionsDto, GroomingRuleDto, GroomingServiceDto, GroomingSettingsDto, GroomingSpecialistDto, GroomingStatusDto, GroomingWorkPeriodDto, GroomingWorkplaceDto } from './grooming.dto';
class StaffOptions extends GroomingOptionsDto { @IsString() ownerId!: string; }
class StaffBook extends GroomingBookDto { @IsString() ownerId!: string; }
class StaffChange extends GroomingChangeDto { @IsString() ownerId!: string; }

@Controller('v1/grooming')
@RequirePermissions('grooming.read')
export class GroomingController {
  constructor(private readonly service: GroomingCrmService, private readonly prisma: PrismaService) {}
  @Get('overview') overview(@CurrentEmployee() actor: AuthEmployee) { return this.service.overview(actor); }
  @Get('bookings') async bookings(@CurrentEmployee() actor: AuthEmployee, @Query('from') from?: string, @Query('to') to?: string) { await this.service.overview(actor); return this.service.bookings(actor, from, to); }
  @Get('bookings/:id') booking(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string) { return this.service.booking(id, actor); }
  @Get('clients') async clients(@CurrentEmployee() actor: AuthEmployee, @Query('search') search?: string) { await this.service.overview(actor); return this.service.clients(actor, search); }
  @Get('shifts') async shifts(@CurrentEmployee() actor: AuthEmployee, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.shifts(actor, from, to);
  }
  @Post('options') @RequirePermissions('grooming.operate') @RequireRoles('director', 'administrator')
  options(@CurrentEmployee() actor: AuthEmployee, @Body() input: StaffOptions) { const { ownerId, ...dto } = input; return this.service.options(ownerId, dto, new Date(), actor); }
  @Post('bookings') @RequirePermissions('grooming.operate') @RequireRoles('director', 'administrator')
  book(@CurrentEmployee() actor: AuthEmployee, @Body() input: StaffBook) { const { ownerId, ...dto } = input; return this.service.book(ownerId, dto, new Date(), actor); }
  @Post('bookings/:id/reschedule') @RequirePermissions('grooming.operate') @RequireRoles('director', 'administrator')
  reschedule(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: StaffChange) { const { ownerId, version, ...dto } = input; return this.service.book(ownerId, dto, new Date(), actor, { id, version }); }
  @Post('bookings/:id/status') @AllowRemoteMutation() @RequirePermissions('grooming.operate')
  status(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingStatusDto) { return this.service.status(id, '', input, new Date(), actor); }
  @Post('specialists') @RequirePermissions('grooming.manage')
  specialist(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingSpecialistDto) { return this.service.saveSpecialist(input, actor); }
  @Patch('specialists/:id') @RequirePermissions('grooming.manage')
  updateSpecialist(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingSpecialistDto) { return this.service.saveSpecialist(input, actor, id); }
  @Post('rules') @RequirePermissions('grooming.manage')
  rule(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingRuleDto) { return this.service.saveRule(input, actor); }
  @Patch('rules/:id') @RequirePermissions('grooming.manage')
  updateRule(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingRuleDto) { return this.service.saveRule(input, actor, id); }
  @Post('services') @RequirePermissions('grooming.manage')
  createService(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingServiceDto) { return this.service.saveService(input, actor); }
  @Patch('services/:id') @RequirePermissions('grooming.manage')
  updateService(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingServiceDto) { return this.service.saveService(input, actor, id); }
  @Post('locations') @RequirePermissions('grooming.manage')
  location(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingLocationDto) { return this.service.saveLocation(input, actor); }
  @Patch('locations/:id') @RequirePermissions('grooming.manage')
  updateLocation(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingLocationDto) { return this.service.saveLocation(input, actor, id); }
  @Post('workplaces') @RequirePermissions('grooming.manage')
  workplace(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingWorkplaceDto) { return this.service.saveWorkplace(input, actor); }
  @Patch('workplaces/:id') @RequirePermissions('grooming.manage')
  updateWorkplace(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingWorkplaceDto) { return this.service.saveWorkplace(input, actor, id); }
  @Patch('settings') @RequirePermissions('grooming.manage')
  settings(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingSettingsDto) { return this.service.saveSettings(input, actor); }
  @Post('shifts') @RequirePermissions('grooming.schedule')
  shift(@CurrentEmployee() actor: AuthEmployee, @Body() input: GroomingWorkPeriodDto) { return this.service.saveShift(input, actor); }
  @Patch('shifts/:id') @RequirePermissions('grooming.schedule')
  updateShift(@CurrentEmployee() actor: AuthEmployee, @Param('id') id: string, @Body() input: GroomingWorkPeriodDto) { return this.service.saveShift(input, actor, id); }
  @Get('notifications')
  async notifications(@CurrentEmployee() actor: AuthEmployee) { await this.service.overview(actor); return this.prisma.groomingNotification.findMany({ where: { reservation: actor.roles.some(r => ['director', 'administrator'].includes(r)) ? {} : { employeeId: actor.id } }, orderBy: { createdAt: 'desc' }, take: 200 }); }
}
