import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { AllowPassiveSessionActivity } from '../auth/decorators/passive-session-activity.decorator';
import { NoStoreInterceptor } from './no-store.interceptor';
import { NativePushDeviceDto } from './staff-native-push.dto';
import { StaffNativePushService } from './staff-native-push.service';
@UseInterceptors(NoStoreInterceptor)
@Controller('v1/staff-app/native-push')
export class StaffNativePushController {
  constructor(private readonly service: StaffNativePushService) {}
  @Get('config') config(@Req() req: AuthenticatedRequest, @Query('platform') platform?: string, @Query('applicationId') applicationId?: string) {
    return this.service.config(req.auth!, platform || 'ANDROID', applicationId);
  }
  @Post('devices') @AllowRemoteMutation()
  register(@Req() req: AuthenticatedRequest, @Body() input: NativePushDeviceDto) { return this.service.register(req.auth!, input); }
  @Delete('devices/:id') @AllowRemoteMutation()
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.remove(req.auth!, id); }
  @Get('events/:id') @AllowPassiveSessionActivity()
  event(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.service.event(req.auth!, id); }
}
