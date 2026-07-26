import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequireAnyPermissions, RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { BusinessService } from './business.service';
import { BusinessActionDto } from './dto/business-action.dto';
import { BusinessReportQueryDto } from './dto/business-report-query.dto';
import { CreateBusinessEntryDto } from './dto/create-business-entry.dto';
import { DailyCloseQueryDto } from './dto/daily-close-query.dto';
import { ListBusinessEntriesQueryDto } from './dto/list-business-entries-query.dto';
import { SaveDailyCloseDto } from './dto/save-daily-close.dto';
import { UpsertBusinessCategoryDto } from './dto/upsert-business-category.dto';

@ApiTags('business-management')
@Controller('v1/business')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('resources')
  @RequireAnyPermissions('daily_finance.read', 'business.read')
  @ApiOkResponse({ description: 'Management accounting resources permitted for the current employee.' })
  getResources(@CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.getResources(actor);
  }

  @Get('entries')
  @RequireAnyPermissions('daily_finance.read', 'business.read')
  listEntries(@Query() query: ListBusinessEntriesQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.listEntries(query, actor);
  }

  @Post('entries')
  @RequireAnyPermissions('daily_finance.manage', 'business.manage')
  @ApiCreatedResponse({ description: 'Manual management entry registered.' })
  createEntry(@Body() dto: CreateBusinessEntryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.createEntry(dto, actor);
  }

  @Post('entries/:entryId/void')
  @RequireAnyPermissions('daily_finance.manage', 'business.manage')
  voidEntry(@Param('entryId') entryId: string, @Body() dto: BusinessActionDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.voidEntry(entryId, dto, actor);
  }

  @Post('entries/:entryId/resolve')
  @RequirePermissions('business.manage')
  resolveEntry(@Param('entryId') entryId: string, @Body() dto: BusinessActionDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.resolveEntry(entryId, dto, actor.id);
  }

  @Post('categories')
  @RequirePermissions('business.manage')
  createCategory(@Body() dto: UpsertBusinessCategoryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.saveCategory(null, dto, actor.id);
  }

  @Put('categories/:categoryId')
  @RequirePermissions('business.manage')
  updateCategory(@Param('categoryId') categoryId: string, @Body() dto: UpsertBusinessCategoryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.saveCategory(categoryId, dto, actor.id);
  }

  @Get('daily-closes/current')
  @RequireAnyPermissions('daily_finance.read', 'business.read')
  getDailyClose(@Query() query: DailyCloseQueryDto) {
    return this.businessService.getDailyClose(query);
  }

  @Get('daily-closes')
  @RequireAnyPermissions('daily_finance.read', 'business.read')
  listDailyCloses(@Query() query: BusinessReportQueryDto) {
    return this.businessService.listDailyCloses(query);
  }

  @Post('daily-closes/prepare')
  @RequireAnyPermissions('daily_finance.manage', 'business.manage')
  prepareDailyClose(@Body() dto: SaveDailyCloseDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.prepareDailyClose(dto, actor);
  }

  @Post('daily-closes/:closeId/submit')
  @RequireAnyPermissions('daily_finance.submit', 'business.approve')
  submitDailyClose(@Param('closeId') closeId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.submitDailyClose(closeId, actor.id);
  }

  @Post('daily-closes/:closeId/approve')
  @RequirePermissions('business.approve')
  approveDailyClose(@Param('closeId') closeId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.approveDailyClose(closeId, actor.id);
  }

  @Post('daily-closes/:closeId/return')
  @RequirePermissions('business.approve')
  returnDailyClose(@Param('closeId') closeId: string, @Body() dto: BusinessActionDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.businessService.returnDailyClose(closeId, dto, actor.id);
  }

  @Get('summary')
  @RequirePermissions('business.read')
  getSummary(@Query() query: BusinessReportQueryDto) {
    return this.businessService.getSummary(query);
  }
}
