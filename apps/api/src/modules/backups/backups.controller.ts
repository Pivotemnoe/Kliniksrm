import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BackupsService } from './backups.service';

@ApiTags('backups')
@Controller('v1/backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('status')
  @RequirePermissions('backups.manage')
  @ApiOkResponse({ description: 'Состояние резервных копий без раскрытия секретов и системных путей.' })
  getStatus() {
    return this.backupsService.getStatus();
  }
}
