import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateQueueEntryDto } from './dto/create-queue-entry.dto';
import { ListQueueQueryDto } from './dto/list-queue-query.dto';
import { UpdateQueueEntryDto } from './dto/update-queue-entry.dto';
import { QueueService } from './queue.service';

@ApiTags('queue')
@Controller('v1/queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  @RequirePermissions('queue.read')
  @ApiOkResponse({ description: 'Clinic queue list.' })
  listQueue(@Query() query: ListQueueQueryDto) {
    return this.queueService.listQueue(query);
  }

  @Get('screen')
  @Public()
  @ApiOkResponse({ description: 'Public queue screen without private client data.' })
  getQueueScreen() {
    return this.queueService.getQueueScreen();
  }

  @Post()
  @RequireAnyPermissions('queue.manage', 'visits.manage')
  @ApiCreatedResponse({ description: 'Queue entry created.' })
  createQueueEntry(@Body() dto: CreateQueueEntryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.queueService.createQueueEntry(dto, actor.id);
  }

  @Get(':queueEntryId')
  @RequirePermissions('queue.read')
  @ApiOkResponse({ description: 'Queue entry card.' })
  getQueueEntry(@Param('queueEntryId') queueEntryId: string) {
    return this.queueService.getQueueEntry(queueEntryId);
  }

  @Patch(':queueEntryId')
  @RequirePermissions('queue.manage')
  @ApiOkResponse({ description: 'Queue entry updated.' })
  updateQueueEntry(
    @Param('queueEntryId') queueEntryId: string,
    @Body() dto: UpdateQueueEntryDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.queueService.updateQueueEntry(queueEntryId, dto, actor.id);
  }

  @Post(':queueEntryId/start')
  @RequirePermissions('queue.call')
  @ApiOkResponse({ description: 'Queue entry moved to in-progress.' })
  startQueueEntry(@Param('queueEntryId') queueEntryId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.queueService.startQueueEntry(queueEntryId, actor.id);
  }

  @Post(':queueEntryId/complete')
  @RequirePermissions('queue.call')
  @ApiOkResponse({ description: 'Пациент направлен на приём из очереди.' })
  completeQueueEntry(@Param('queueEntryId') queueEntryId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.queueService.completeQueueEntry(queueEntryId, actor.id);
  }

  @Post(':queueEntryId/cancel')
  @RequirePermissions('queue.manage')
  @ApiOkResponse({ description: 'Queue entry cancelled.' })
  cancelQueueEntry(@Param('queueEntryId') queueEntryId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.queueService.cancelQueueEntry(queueEntryId, actor.id);
  }
}
