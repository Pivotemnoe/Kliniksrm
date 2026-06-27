import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { UpdatePortalAccessDto } from './dto/update-portal-access.dto';
import { UpsertTemplateDto } from './dto/upsert-template.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('outbox')
  @RequirePermissions('notifications.read')
  @ApiOkResponse({ description: 'Local notification outbox.' })
  listOutbox(@Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listOutbox(query);
  }

  @Post('outbox')
  @RequirePermissions('notifications.manage')
  @ApiCreatedResponse({ description: 'Notification queued locally.' })
  createOutbox(@Body() dto: CreateNotificationDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.notificationsService.createOutbox(dto, actor.id);
  }

  @Post('outbox/:notificationId/retry')
  @RequirePermissions('notifications.manage')
  @ApiOkResponse({ description: 'Notification returned to queue.' })
  retryOutbox(@Param('notificationId') notificationId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.notificationsService.retryOutbox(notificationId, actor.id);
  }

  @Post('outbox/:notificationId/cancel')
  @RequirePermissions('notifications.manage')
  @ApiOkResponse({ description: 'Notification cancelled.' })
  cancelOutbox(@Param('notificationId') notificationId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.notificationsService.cancelOutbox(notificationId, actor.id);
  }

  @Get('templates')
  @RequirePermissions('notifications.read')
  @ApiOkResponse({ description: 'Notification templates.' })
  listTemplates(@Query() query: ListTemplatesQueryDto) {
    return this.notificationsService.listTemplates(query);
  }

  @Post('templates')
  @RequirePermissions('notifications.manage')
  @ApiCreatedResponse({ description: 'Notification template created or updated.' })
  upsertTemplate(@Body() dto: UpsertTemplateDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.notificationsService.upsertTemplate(dto, actor.id);
  }

  @Get('owners/:ownerId/portal-access')
  @RequirePermissions('owners.read')
  @ApiOkResponse({ description: 'Owner client portal access state.' })
  getPortalAccess(@Param('ownerId') ownerId: string) {
    return this.notificationsService.getPortalAccess(ownerId);
  }

  @Patch('owners/:ownerId/portal-access')
  @RequirePermissions('notifications.manage')
  @ApiOkResponse({ description: 'Owner client portal access updated.' })
  updatePortalAccess(@Param('ownerId') ownerId: string, @Body() dto: UpdatePortalAccessDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.notificationsService.updatePortalAccess(ownerId, dto, actor.id);
  }
}
