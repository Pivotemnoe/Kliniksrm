import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions } from '../auth/decorators/require-permissions.decorator';
import { PreviewDataTransferDto } from './dto/data-transfer.dto';
import { DataTransferService } from './data-transfer.service';

@ApiTags('imports')
@Controller('v1/imports')
export class ImportsController {
  constructor(private readonly dataTransferService: DataTransferService) {}

  @Get('transfers')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  listTransfers(@CurrentEmployee() actor: AuthEmployee) {
    return this.dataTransferService.list(actor);
  }

  @Post('transfers/preview')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  @ApiOkResponse({ description: 'Партия проверена и сохранена без изменения клинических данных.' })
  previewTransfer(@Body() dto: PreviewDataTransferDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.dataTransferService.preview(dto, actor);
  }

  @Post('transfers/:batchId/commit')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  @ApiOkResponse({ description: 'Партия переноса выполнена.' })
  commitTransfer(@Param('batchId') batchId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.dataTransferService.commit(batchId, actor);
  }

  @Post('transfers/:batchId/rollback')
  @RequireAnyPermissions('owners.manage', 'stock.manage')
  @ApiOkResponse({ description: 'Созданные этой партией записи безопасно отменены.' })
  rollbackTransfer(@Param('batchId') batchId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.dataTransferService.rollback(batchId, actor);
  }
}
