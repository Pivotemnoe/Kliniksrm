import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthEmployee } from '../auth/auth.types';
import { CurrentEmployee } from '../auth/decorators/current-employee.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CleanupMedicalPhrasesDto } from './dto/cleanup-medical-phrases.dto';
import { ListMedicalPhrasesQueryDto } from './dto/list-medical-phrases-query.dto';
import { ManageMedicalPhrasesQueryDto } from './dto/manage-medical-phrases-query.dto';
import { RecordMedicalPhraseUsageDto } from './dto/record-medical-phrase-usage.dto';
import { UpsertMedicalPhraseDto } from './dto/upsert-medical-phrase.dto';
import { SavePersonalMedicalPhraseDto } from './dto/save-personal-medical-phrase.dto';
import { PersonalMedicalPhraseActionDto } from './dto/personal-medical-phrase-action.dto';
import { UpdateMedicalPhraseAssistantSettingsDto } from './dto/update-medical-phrase-assistant-settings.dto';
import { MedicalPhrasesService } from './medical-phrases.service';

@ApiTags('medical-phrases')
@Controller('v1/medical-phrases')
export class MedicalPhrasesController {
  constructor(private readonly medicalPhrasesService: MedicalPhrasesService) {}

  @Get()
  @RequirePermissions('visits.read')
  @ApiOkResponse({ description: 'Список быстрых клинических фраз.' })
  list(@Query() query: ListMedicalPhrasesQueryDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.list(query, actor);
  }

  @Get('personal/settings')
  @RequirePermissions('visits.read')
  @ApiOkResponse({ description: 'Настройки личного помощника врача.' })
  getPersonalSettings(@CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.getPersonalSettings(actor);
  }

  @Patch('personal/settings')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Личный помощник включён или выключен.' })
  updatePersonalSettings(
    @Body() dto: UpdateMedicalPhraseAssistantSettingsDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.medicalPhrasesService.updatePersonalSettings(dto.enabled, actor);
  }

  @Post('personal')
  @RequirePermissions('visits.manage')
  @ApiCreatedResponse({ description: 'Текст сохранён как личная фраза врача.' })
  savePersonal(@Body() dto: SavePersonalMedicalPhraseDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.savePersonal(dto, actor);
  }

  @Patch('personal/:phraseId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Предложение принято, отклонено или закреплено.' })
  actOnPersonal(
    @Param('phraseId') phraseId: string,
    @Body() dto: PersonalMedicalPhraseActionDto,
    @CurrentEmployee() actor: AuthEmployee,
  ) {
    return this.medicalPhrasesService.actOnPersonal(phraseId, dto.action, actor);
  }

  @Delete('personal/:phraseId')
  @RequirePermissions('visits.manage')
  @ApiOkResponse({ description: 'Личная фраза удалена.' })
  removePersonal(@Param('phraseId') phraseId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.removePersonal(phraseId, actor);
  }

  @Get('manage')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Список быстрых фраз для управления директором.' })
  listForManagement(@Query() query: ManageMedicalPhrasesQueryDto) {
    return this.medicalPhrasesService.listForManagement(query);
  }

  @Post()
  @RequirePermissions('settings.manage')
  @ApiCreatedResponse({ description: 'Быстрая фраза создана.' })
  create(@Body() dto: UpsertMedicalPhraseDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.create(dto, actor);
  }

  @Patch(':phraseId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Быстрая фраза обновлена.' })
  update(@Param('phraseId') phraseId: string, @Body() dto: UpsertMedicalPhraseDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.update(phraseId, dto, actor);
  }

  @Delete(':phraseId')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Быстрая фраза удалена или отключена.' })
  remove(@Param('phraseId') phraseId: string, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.remove(phraseId, actor);
  }

  @Post('cleanup')
  @RequirePermissions('settings.manage')
  @ApiOkResponse({ description: 'Самообученные фразы очищены.' })
  cleanupLearned(@Body() dto: CleanupMedicalPhrasesDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.cleanupLearned(dto, actor);
  }

  @Post('usage')
  @RequirePermissions('visits.manage')
  @ApiCreatedResponse({ description: 'Использование быстрой фразы учтено.' })
  recordUsage(@Body() dto: RecordMedicalPhraseUsageDto, @CurrentEmployee() actor: AuthEmployee) {
    return this.medicalPhrasesService.recordUsage(dto.phraseId, actor);
  }
}
