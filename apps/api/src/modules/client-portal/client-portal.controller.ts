import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CreatePortalOnlineRequestDto } from './dto/create-portal-online-request.dto';
import { RequestPortalCodeDto } from './dto/request-portal-code.dto';
import { VerifyPortalCodeDto } from './dto/verify-portal-code.dto';
import { ClientPortalService } from './client-portal.service';

@ApiTags('client-portal')
@Public()
@Controller('v1/client-portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @Post('auth/request-code')
  @ApiCreatedResponse({ description: 'Phone login code created for client portal.' })
  requestLoginCode(@Body() dto: RequestPortalCodeDto) {
    return this.clientPortalService.requestLoginCode(dto);
  }

  @Post('auth/verify-code')
  @ApiOkResponse({ description: 'Phone login code verified and portal token returned.' })
  verifyLoginCode(@Body() dto: VerifyPortalCodeDto) {
    return this.clientPortalService.verifyLoginCode(dto);
  }

  @Get(':token')
  @ApiOkResponse({ description: 'Client portal summary by invitation token.' })
  getSummary(@Param('token') token: string) {
    return this.clientPortalService.getSummary(token);
  }

  @Post(':token/online-requests')
  @ApiCreatedResponse({ description: 'Online appointment request created from client portal.' })
  createOnlineRequest(@Param('token') token: string, @Body() dto: CreatePortalOnlineRequestDto) {
    return this.clientPortalService.createOnlineRequest(token, dto);
  }
}
