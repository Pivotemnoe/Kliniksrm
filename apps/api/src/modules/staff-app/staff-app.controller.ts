import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseInterceptors, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { AuthEmployee, AuthenticatedRequest } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GroomingCrmService } from '../grooming/grooming.service';
import { GroomingStatusDto } from '../grooming/grooming.dto';
import { assertStaffApp, assertStaffBooking } from './staff-app.policy';
import { StaffAppSettingsDto, StaffClientCreateDto, StaffClientLookupDto, StaffGroomingBookDto, StaffGroomingOptionsDto, StaffPetCreateDto, StaffClinicBookDto, StaffPushEndpointDto, StaffPushSubscriptionDto } from './staff-app.dto';
import { StaffAppService } from './staff-app.service';

@Injectable()
class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) { context.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store'); return next.handle(); }
}
@UseInterceptors(NoStoreInterceptor)
@Controller('v1/staff-app')
export class StaffAppController {
  constructor(private readonly service: StaffAppService, private readonly grooming: GroomingCrmService) {}
  @Get('me') profile(@CurrentEmployee() actor: AuthEmployee) { return this.service.profile(actor); }
  @Get('settings') settings(@CurrentEmployee() actor: AuthEmployee) { return this.service.settings(actor); }
  @Patch('settings/:id') save(@Param('id') id: string, @Body() input: StaffAppSettingsDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.saveSettings(id, input, actor); }
  @Get('agenda') agenda(@Query('from') from: string, @Query('to') to: string, @Query('scope') scope: string | undefined, @CurrentEmployee() actor: AuthEmployee) { return this.service.agenda(actor, from, to, scope); }
  @Get('inbox') inbox(@CurrentEmployee() actor: AuthEmployee) { return this.service.inbox(actor); }
  @Get('tasks') tasks(@CurrentEmployee() actor: AuthEmployee) { return this.service.tasks(actor); }
  @Get('grooming/overview') @RequirePermissions('grooming.read')
  overview(@CurrentEmployee() actor: AuthEmployee) { assertStaffApp(actor); return this.grooming.overview(actor); }
  @Get('grooming/bookings/:id') @RequirePermissions('grooming.read')
  booking(@Param('id') id: string, @CurrentEmployee() actor: AuthEmployee) { assertStaffApp(actor); return this.grooming.booking(id, actor); }
  @Get('push/config') @RequirePermissions('grooming.read')
  pushConfig(@Req() request: AuthenticatedRequest) { return this.service.pushConfig(request.auth!); }
  @Post('push/subscribe') @AllowRemoteMutation() @RequirePermissions('grooming.read')
  subscribe(@Req() request: AuthenticatedRequest, @Body() input: StaffPushSubscriptionDto) { return this.service.pushSubscribe(request.auth!, input); }
  @Post('push/unsubscribe') @AllowRemoteMutation() @RequirePermissions('grooming.read')
  unsubscribe(@Req() request: AuthenticatedRequest, @Body() input: StaffPushEndpointDto) { return this.service.pushUnsubscribe(request.auth!, input.endpoint); }
  @Post('inbox/:id/read') @AllowRemoteMutation() read(@Param('id') id: string, @CurrentEmployee() actor: AuthEmployee) { return this.service.markRead(id, actor); }
  @Get('clients') clients(@Query('search') search: string, @CurrentEmployee() actor: AuthEmployee) { return this.service.clients(actor, search); }
  @Post('clients/lookup') @AllowRemoteMutation() lookup(@Body() input: StaffClientLookupDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.lookupClient(input.phone, actor); }
  @Post('clients') @AllowRemoteMutation() client(@Body() input: StaffClientCreateDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.createClient(input, actor); }
  @Post('clients/:id/pets') @AllowRemoteMutation()
  pet(@Param('id') id: string, @Body() input: StaffPetCreateDto, @CurrentEmployee() actor: AuthEmployee) { const { clientAccessToken, ...dto } = input; return this.service.createPet(id, dto, clientAccessToken, actor); }
  @Get('pet-catalog') catalog(@CurrentEmployee() actor: AuthEmployee) { return this.service.petCatalog(actor); }
  @Get('clinic/resources') resources(@CurrentEmployee() actor: AuthEmployee) { return this.service.clinicResources(actor); }
  @Post('clinic/appointments') @AllowRemoteMutation() @RequirePermissions('appointments.manage')
  appointment(@Body() input: StaffClinicBookDto, @CurrentEmployee() actor: AuthEmployee) { return this.service.createAppointment(input, actor); }
  @Post('grooming/options') @AllowRemoteMutation() @RequirePermissions('grooming.read', 'grooming.operate')
  options(@Body() input: StaffGroomingOptionsDto, @CurrentEmployee() actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming'); const { ownerId, ...dto } = input; return this.grooming.options(ownerId, dto, new Date(), actor);
  }
  @Post('grooming/bookings') @AllowRemoteMutation() @RequirePermissions('grooming.read', 'grooming.operate')
  book(@Body() input: StaffGroomingBookDto, @CurrentEmployee() actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming'); const { ownerId, ...dto } = input; return this.grooming.book(ownerId, dto, new Date(), actor);
  }
  @Post('grooming/bookings/:id/reschedule') @AllowRemoteMutation() @RequirePermissions('grooming.read', 'grooming.operate')
  async reschedule(@Param('id') id: string, @Query('version') version: string, @Body() input: StaffGroomingBookDto, @CurrentEmployee() actor: AuthEmployee) {
    assertStaffBooking(actor, 'grooming'); await this.grooming.booking(id, actor);
    const { ownerId, ...dto } = input; return this.grooming.book(ownerId, dto, new Date(), actor, { id, version: Number(version) });
  }
  @Post('grooming/bookings/:id/status') @AllowRemoteMutation() @RequirePermissions('grooming.read', 'grooming.operate')
  status(@Param('id') id: string, @Body() input: GroomingStatusDto, @CurrentEmployee() actor: AuthEmployee) {
    assertStaffApp(actor); return this.grooming.status(id, '', input, new Date(), actor);
  }
}
