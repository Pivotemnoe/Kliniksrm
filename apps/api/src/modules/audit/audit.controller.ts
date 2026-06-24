import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';
import { AuditExportQueryDto } from './dto/audit-export-query.dto';
import { CreateActivityLogDto } from './dto/create-activity-log.dto';

@ApiTags('audit')
@Controller('v1/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOkResponse({ description: 'Recent audit events.' })
  listAuditLogs() {
    return this.auditService.listRecent();
  }

  @Get('export')
  @RequirePermissions('audit.read')
  @ApiOkResponse({ description: 'JSON activity and audit report for diagnostics.' })
  exportAuditReport(@Query() query: AuditExportQueryDto) {
    return this.auditService.exportReport(query);
  }

  @Post('activity')
  @HttpCode(201)
  @ApiCreatedResponse({ description: 'Frontend activity event recorded.' })
  logActivity(
    @Body() dto: CreateActivityLogDto,
    @CurrentEmployee() employee: { id: string },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.auditService.logActivity(employee.id, dto, getIpAddress(request), getUserAgent(request));
  }
}

function getIpAddress(request: AuthenticatedRequest) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim() ?? null;
  }

  return request.ip ?? request.socket?.remoteAddress ?? null;
}

function getUserAgent(request: AuthenticatedRequest) {
  const userAgent = request.headers['user-agent'];
  return Array.isArray(userAgent) ? userAgent.join(' ') : userAgent ?? null;
}
