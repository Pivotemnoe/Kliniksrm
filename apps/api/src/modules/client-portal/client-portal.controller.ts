import { Body, Controller, Get, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get(':token/files/:fileId')
  async openFile(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.clientPortalService.openFile(token, fileId);
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Disposition', contentDisposition(file.fileName));
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.stream);
  }

  @Post(':token/online-requests')
  @ApiCreatedResponse({ description: 'Online appointment request created from client portal.' })
  createOnlineRequest(@Param('token') token: string, @Body() dto: CreatePortalOnlineRequestDto) {
    return this.clientPortalService.createOnlineRequest(token, dto);
  }
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
