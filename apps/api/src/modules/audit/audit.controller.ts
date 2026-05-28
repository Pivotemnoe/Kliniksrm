import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuditService } from './audit.service';

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
}
