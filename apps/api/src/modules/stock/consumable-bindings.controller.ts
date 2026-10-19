import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsISO8601 } from 'class-validator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { AuthEmployee } from '../auth/auth.types';
import { ConsumableBindingsService } from './consumable-bindings.service';
import { ConsumableBindingDto, ConsumableSetDto } from './dto/consumable-binding.dto';
class ArchiveSetDto { @IsISO8601() expectedUpdatedAt!: string; }
@Controller('v1/stock')
export class ConsumableBindingsController {
  constructor(private readonly bindings: ConsumableBindingsService) {}
  @Post('consumable-bindings/preview') @RequirePermissions('stock.manage')
  preview(@Body() dto: ConsumableBindingDto) { return this.bindings.preview(dto); }
  @Patch('consumable-bindings') @RequirePermissions('stock.manage')
  apply(@Body() dto: ConsumableBindingDto, @CurrentEmployee() actor: AuthEmployee) { return this.bindings.apply(dto, actor.id); }
  @Get('consumable-sets') @RequirePermissions('stock.read')
  list() { return this.bindings.listSets(); }
  @Post('consumable-sets') @RequirePermissions('stock.manage')
  create(@Body() dto: ConsumableSetDto, @CurrentEmployee() actor: AuthEmployee) { return this.bindings.saveSet(null, dto, actor.id); }
  @Patch('consumable-sets/:id') @RequirePermissions('stock.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConsumableSetDto, @CurrentEmployee() actor: AuthEmployee) { return this.bindings.saveSet(id, dto, actor.id); }
  @Post('consumable-sets/:id/archive') @RequirePermissions('stock.manage')
  archive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchiveSetDto, @CurrentEmployee() actor: AuthEmployee) { return this.bindings.archiveSet(id, dto.expectedUpdatedAt, actor.id); }
}
