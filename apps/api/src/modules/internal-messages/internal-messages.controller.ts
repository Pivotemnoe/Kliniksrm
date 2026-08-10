import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { AllowRemoteMutation } from '../auth/decorators/allow-remote-mutation.decorator';
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import { ListInternalMessagesQueryDto } from './dto/list-internal-messages-query.dto';
import { InternalMessagesService } from './internal-messages.service';

@ApiTags('internal-messages')
@Controller('v1/internal-messages')
export class InternalMessagesController {
  constructor(private readonly internalMessagesService: InternalMessagesService) {}

  @Get('recipients')
  @ApiOkResponse({ description: 'Active employees available for a private internal message.' })
  listRecipients(@CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.listRecipients(actor.id);
  }

  @Get('conversations')
  @ApiOkResponse({ description: 'Private conversation summaries for the current employee.' })
  listConversations(@CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.listConversations(actor.id);
  }

  @Get()
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
  @AllowRemoteMutation()
  @ApiOkResponse({ description: 'Incoming messages in one conversation marked as read.' })
  markConversationRead(@Param('employeeId') employeeId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.internalMessagesService.markConversationRead(employeeId, actor.id);
  }
}
