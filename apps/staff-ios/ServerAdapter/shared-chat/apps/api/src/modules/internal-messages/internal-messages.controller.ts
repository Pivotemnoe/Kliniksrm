import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import { ListInternalMessagesQueryDto } from './dto/list-internal-messages-query.dto';
import { StaffClinicChatService } from './staff-clinic-chat.service';
import { ClinicChatSendDto, ClinicChatReadDto, ClinicChatQueryDto } from './dto/clinic-chat.dto';
import { ReadConversationDto } from './dto/read-conversation.dto';
import { AllowPassiveSessionActivity } from '../auth/decorators/passive-session-activity.decorator';
import { NoStoreInterceptor } from '../staff-native-push/no-store.interceptor';
import { InternalMessagesService } from './internal-messages.service';

@ApiTags('internal-messages')
@UseInterceptors(NoStoreInterceptor)
@Controller('v1/internal-messages')
export class InternalMessagesController {
  constructor(private readonly internalMessagesService: InternalMessagesService, private readonly clinic: StaffClinicChatService) {}

  @Get('clinic') @AllowPassiveSessionActivity()
  clinicSummary(@CurrentEmployee() actor: AuthEmployee) { return this.clinic.summary(actor.id); }
  @Get('clinic/messages') @AllowPassiveSessionActivity()
  clinicThread(@Query() query: ClinicChatQueryDto, @CurrentEmployee() actor: AuthEmployee) { return this.clinic.thread(query, actor.id); }
  @Post('clinic/messages') @AllowRemoteMutation()
  clinicSend(@Body() dto: ClinicChatSendDto, @CurrentEmployee() actor: AuthEmployee) { return this.clinic.send(dto, actor.id); }
  @Post('clinic/read') @AllowRemoteMutation() @AllowPassiveSessionActivity()
  clinicRead(@Body() dto: ClinicChatReadDto, @CurrentEmployee() actor: AuthEmployee) { return this.clinic.read(dto.throughId, actor.id); }

  @Get('recipients')
  @ApiOkResponse({ description: 'Active employees available for a private internal message.' })
  listRecipients(@CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.listRecipients(actor.id);
  }

  @Get('conversations')
  @AllowPassiveSessionActivity()
  @ApiOkResponse({ description: 'Private conversation summaries for the current employee.' })
  listConversations(@CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.listConversations(actor.id);
  }

  @Get()
  @AllowPassiveSessionActivity()
  @ApiOkResponse({ description: 'One private employee-to-employee conversation.' })
  listThread(@Query() query: ListInternalMessagesQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.listThread(query, actor.id);
  }

  @Post()
  @AllowRemoteMutation()
  @ApiCreatedResponse({ description: 'Private internal message sent.' })
  send(@Body() dto: CreateInternalMessageDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.send(dto, actor.id);
  }

  @Post('conversations/:employeeId/read')
  @AllowPassiveSessionActivity()
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'Incoming messages in one conversation marked as read.' })
  markConversationRead(@Param('employeeId') employeeId: string, @CurrentEmployee() actor: AuthEmployee, @Body() dto: ReadConversationDto) {
    return this.internalMessagesService.markConversationRead(employeeId, actor.id, dto?.throughId);
  }
}
