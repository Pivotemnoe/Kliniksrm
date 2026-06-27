import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ListLaboratoryOrdersQueryDto } from './dto/list-laboratory-orders-query.dto';
import { ListLaboratoryQueryDto } from './dto/list-laboratory-query.dto';
import { UpdateLaboratoryOrderItemDto } from './dto/update-laboratory-order-item.dto';
import { UpdateLaboratoryProfileDto, UpsertLaboratoryProfileDto } from './dto/upsert-laboratory-profile.dto';
import { UpdateLaboratoryTestDto, UpsertLaboratoryTestDto } from './dto/upsert-laboratory-test.dto';
import { LaboratoryService } from './laboratory.service';

@ApiTags('laboratory')
@Controller('v1/laboratory')
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get('resources')
  @RequirePermissions('laboratory.read')
  @ApiOkResponse({ description: 'Laboratory services and animal species.' })
  getResources() {
    return this.laboratoryService.getResources();
  }

  @Get('orders')
  @RequirePermissions('laboratory.read')
  @ApiOkResponse({ description: 'Laboratory order journal.' })
  listOrders(@Query() query: ListLaboratoryOrdersQueryDto) {
    return this.laboratoryService.listOrders(query);
  }

  @Patch('orders/:orderId/items/:itemId')
  @RequirePermissions('laboratory.manage')
  @ApiOkResponse({ description: 'Laboratory order item result updated.' })
  updateOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLaboratoryOrderItemDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.laboratoryService.updateOrderItem(orderId, itemId, dto, actor.id);
  }

  @Get('tests')
  @RequirePermissions('laboratory.read')
  @ApiOkResponse({ description: 'Laboratory test catalog.' })
  listTests(@Query() query: ListLaboratoryQueryDto) {
    return this.laboratoryService.listTests(query);
  }

  @Post('tests')
  @RequirePermissions('laboratory.manage')
  @ApiCreatedResponse({ description: 'Laboratory test created.' })
  createTest(@Body() dto: UpsertLaboratoryTestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.laboratoryService.createTest(dto, actor.id);
  }

  @Patch('tests/:testId')
  @RequirePermissions('laboratory.manage')
  @ApiOkResponse({ description: 'Laboratory test updated.' })
  updateTest(@Param('testId') testId: string, @Body() dto: UpdateLaboratoryTestDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.laboratoryService.updateTest(testId, dto, actor.id);
  }

  @Get('profiles')
  @RequirePermissions('laboratory.read')
  @ApiOkResponse({ description: 'Laboratory profile catalog.' })
  listProfiles(@Query() query: ListLaboratoryQueryDto) {
    return this.laboratoryService.listProfiles(query);
  }

  @Post('profiles')
  @RequirePermissions('laboratory.manage')
  @ApiCreatedResponse({ description: 'Laboratory profile created.' })
  createProfile(@Body() dto: UpsertLaboratoryProfileDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.laboratoryService.createProfile(dto, actor.id);
  }

  @Patch('profiles/:profileId')
  @RequirePermissions('laboratory.manage')
  @ApiOkResponse({ description: 'Laboratory profile updated.' })
  updateProfile(@Param('profileId') profileId: string, @Body() dto: UpdateLaboratoryProfileDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.laboratoryService.updateProfile(profileId, dto, actor.id);
  }
}
