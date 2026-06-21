import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AcceptOnlineRequestDto } from './dto/accept-online-request.dto';
import { CreateOnlineRequestDto } from './dto/create-online-request.dto';
import { ListOnlineRequestsQueryDto } from './dto/list-online-requests-query.dto';
import { UpdateOnlineRequestDto } from './dto/update-online-request.dto';
import { OnlineRequestsService } from './online-requests.service';

@ApiTags('online-requests')
@Controller('v1/online-requests')
export class OnlineRequestsController {
  constructor(private readonly onlineRequestsService: OnlineRequestsService) {}

  @Get()
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Online appointment requests.' })
  listRequests(@Query() query: ListOnlineRequestsQueryDto) {
    return this.onlineRequestsService.listRequests(query);
  }

  @Post()
  @Public()
  @ApiCreatedResponse({ description: 'Public online appointment request created.' })
  createRequest(@Body() dto: CreateOnlineRequestDto) {
    return this.onlineRequestsService.createRequest(dto);
  }

  @Get(':requestId')
  @RequirePermissions('appointments.read')
  @ApiOkResponse({ description: 'Online appointment request card.' })
  getRequest(@Param('requestId') requestId: string) {
    return this.onlineRequestsService.getRequest(requestId);
  }

  @Patch(':requestId')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Online appointment request updated.' })
  updateRequest(@Param('requestId') requestId: string, @Body() dto: UpdateOnlineRequestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.onlineRequestsService.updateRequest(requestId, dto, actor.id);
  }

  @Post(':requestId/accept')
  @RequirePermissions('appointments.manage')
  @ApiCreatedResponse({ description: 'Online appointment request accepted and converted to appointment.' })
  acceptRequest(@Param('requestId') requestId: string, @Body() dto: AcceptOnlineRequestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.onlineRequestsService.acceptRequest(requestId, dto, actor.id);
  }

  @Post(':requestId/cancel')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Online appointment request cancelled.' })
  cancelRequest(@Param('requestId') requestId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.onlineRequestsService.setRequestStatus(requestId, 'CANCELLED', actor.id);
  }

  @Post(':requestId/archive')
  @RequirePermissions('appointments.manage')
  @ApiOkResponse({ description: 'Online appointment request archived.' })
  archiveRequest(@Param('requestId') requestId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.onlineRequestsService.setRequestStatus(requestId, 'ARCHIVED', actor.id);
  }
}
