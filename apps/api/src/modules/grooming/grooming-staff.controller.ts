import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GroomingCrmService } from './grooming.service';
import { GroomingStaffNotificationsService } from './grooming-staff-notifications.service';

class EndpointDto { @IsString() @MinLength(10) @MaxLength(2048) endpoint!: string; }
class SubscriptionDto extends EndpointDto {
  @IsString() @MaxLength(100) p256dh!: string;
  @IsString() @MaxLength(30) auth!: string;
}
@Controller('v1/grooming/staff')
@RequirePermissions('grooming.read')
export class GroomingStaffController {
  constructor(private readonly notices: GroomingStaffNotificationsService, private readonly grooming: GroomingCrmService) {}
  private async context(request: AuthenticatedRequest) { const context = request.auth!; await this.grooming.overview(context.employee); return context; }
  @Get('inbox') async inbox(@Req() request: AuthenticatedRequest) { return this.notices.inbox((await this.context(request)).employee); }
  @Post('inbox/read-all') @AllowRemoteMutation()
  async readAll(@Req() request: AuthenticatedRequest) { return this.notices.markRead((await this.context(request)).employee); }
  @Post('inbox/:id/read') @AllowRemoteMutation()
  async read(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.notices.markRead((await this.context(request)).employee, id); }
  @Get('push/config') async config(@Req() request: AuthenticatedRequest) { return this.notices.config(await this.context(request)); }
  @Post('push/subscribe') @AllowRemoteMutation()
  async subscribe(@Req() request: AuthenticatedRequest, @Body() input: SubscriptionDto) { return this.notices.subscribe(await this.context(request), input); }
  @Post('push/unsubscribe') @AllowRemoteMutation()
  async unsubscribe(@Req() request: AuthenticatedRequest, @Body() input: EndpointDto) { return this.notices.unsubscribe(await this.context(request), input.endpoint); }
  @Post('push/test') @AllowRemoteMutation()
  async test(@Req() request: AuthenticatedRequest) { return this.notices.test(await this.context(request)); }
}
